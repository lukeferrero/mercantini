const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

function createPool() {
  if (process.env.DATABASE_URL) {
    return mysql.createPool(process.env.DATABASE_URL);
  }
  return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
  });
}

const pool = createPool();

// ---------------------------------------------------------------------------
// Schema: esegue schema.sql un'istruzione alla volta (CREATE TABLE IF NOT
// EXISTS è idempotente, quindi è sicuro rieseguirlo a ogni avvio).
// ---------------------------------------------------------------------------
async function runSchema() {
  const raw = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // Rimuove i commenti "-- ..." riga per riga PRIMA di dividere sul ';':
  // un commento può contenere un punto e virgola (es. una nota descrittiva),
  // che altrimenti spezzerebbe l'istruzione a metà.
  const withoutComments = raw
    .split('\n')
    .map(line => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
  const statements = withoutComments.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
}

// ---------------------------------------------------------------------------
// Seed iniziale: al primo avvio su un database vuoto, popola
// room_types / field_definitions / catalog_types a partire dalla vecchia
// configurazione fissa (config/roomFields.js, config/itemCatalog.js), così i
// form restano identici. Da quel momento in poi tutto è gestibile da
// pannello admin. Agisce una sola volta (guardia su room_types vuota).
// ---------------------------------------------------------------------------
const DEFAULT_ROOM_TYPES = [
  { slug: 'bagno', label: 'Bagno' },
  { slug: 'soggiorno', label: 'Soggiorno' },
  { slug: 'cucina', label: 'Cucina' },
  { slug: 'letto', label: 'Camera da letto' },
  { slug: 'ingresso', label: 'Ingresso' },
  { slug: 'altro', label: 'Altro' },
];

const UNIT_FIELDS_SEED = [
  { slug: 'portoncino_tipo', label: 'Portoncino blindato', field_type: 'catalog_select', catalog_type: 'portoncino_blindato' },
  { slug: 'portoncino_spioncino', label: 'Spioncino', field_type: 'boolean' },
  { slug: 'portoncino_colore', label: 'Colore portoncino', field_type: 'text' },
  { slug: 'maniglie_tipo', label: 'Maniglie', field_type: 'catalog_select', catalog_type: 'maniglie' },
  { slug: 'quadro_elettrico_note', label: 'Quadro elettrico - note', field_type: 'notes' },
];

async function seedDynamicFieldsIfNeeded() {
  const [[{ c }]] = await pool.query('SELECT COUNT(*) c FROM room_types');
  if (c > 0) return;

  const ROOM_FIELDS_SEED = require('../config/roomFields');
  const CATALOG_ITEMS_SEED = require('../config/itemCatalog');

  for (let i = 0; i < DEFAULT_ROOM_TYPES.length; i++) {
    const rt = DEFAULT_ROOM_TYPES[i];
    await pool.query('INSERT INTO room_types (slug, label, sort_order) VALUES (?, ?, ?)', [rt.slug, rt.label, i]);
  }

  for (const [roomTypeKey, fields] of Object.entries(ROOM_FIELDS_SEED)) {
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      await pool.query(
        `INSERT INTO field_definitions (scope, room_type_key, slug, label, field_type, catalog_type, field_unit, sort_order)
         VALUES ('room', ?, ?, ?, ?, ?, ?, ?)`,
        [roomTypeKey, f.key, f.label, f.type, f.catalogType || null, f.unit || null, i]
      );
    }
  }
  for (let i = 0; i < UNIT_FIELDS_SEED.length; i++) {
    const f = UNIT_FIELDS_SEED[i];
    await pool.query(
      `INSERT INTO field_definitions (scope, room_type_key, slug, label, field_type, catalog_type, field_unit, sort_order)
       VALUES ('unit', NULL, ?, ?, ?, ?, NULL, ?)`,
      [f.slug, f.label, f.field_type, f.catalog_type || null, i]
    );
  }

  for (const c2 of CATALOG_ITEMS_SEED) {
    await pool.query('INSERT IGNORE INTO catalog_types (type, label) VALUES (?, ?)', [c2.type, c2.label]);
  }
  await pool.query('INSERT IGNORE INTO catalog_types (type, label) VALUES (?, ?)', ['portoncino_blindato', 'Portoncino blindato']);
  await pool.query('INSERT IGNORE INTO catalog_types (type, label) VALUES (?, ?)', ['maniglie', 'Maniglie']);

  // Migra eventuali valori già presenti nelle vecchie colonne fisse di units (rilevante
  // solo se scripts/migrate-sqlite-to-mysql.js ha già popolato units prima di questo boot).
  const [units] = await pool.query(`
    SELECT id, portoncino_tipo, portoncino_spioncino, portoncino_colore, maniglie_tipo, quadro_elettrico_note
    FROM units
  `);
  for (const u of units) {
    const legacy = [
      ['portoncino_tipo', u.portoncino_tipo],
      ['portoncino_spioncino', u.portoncino_spioncino],
      ['portoncino_colore', u.portoncino_colore],
      ['maniglie_tipo', u.maniglie_tipo],
      ['quadro_elettrico_note', u.quadro_elettrico_note],
    ];
    for (const [key, value] of legacy) {
      if (value === null || value === undefined || value === '') continue;
      await pool.query('INSERT IGNORE INTO unit_fields (unit_id, field_key, value) VALUES (?, ?, ?)', [u.id, key, String(value)]);
    }
  }

  console.log('[init] Seed campi dinamici completato: tipi di stanza, campi e catalogo migrati dalla configurazione fissa.');
}

// ---------------------------------------------------------------------------
// Aggiornamenti di struttura per database già esistenti: CREATE TABLE IF NOT
// EXISTS non modifica tabelle già create, quindi le colonne aggiunte in seguito
// vanno inserite qui (idempotente: agisce solo se la colonna manca).
// ---------------------------------------------------------------------------
async function columnExists(table, column) {
  const [[row]] = await pool.query(
    'SELECT COUNT(*) c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [table, column]
  );
  return row.c > 0;
}

async function ensureSchemaUpgrades() {
  if (!(await columnExists('projects', 'note'))) {
    await pool.query('ALTER TABLE projects ADD COLUMN note TEXT');
    console.log('[init] Aggiornamento: aggiunta colonna note a projects.');
  }
  if (!(await columnExists('attachments', 'project_id'))) {
    await pool.query(`ALTER TABLE attachments
      ADD COLUMN project_id INT NULL AFTER unit_id,
      ADD KEY idx_attachments_project (project_id),
      ADD CONSTRAINT fk_attachments_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`);
    console.log('[init] Aggiornamento: aggiunta colonna project_id ad attachments.');
  }
}

// ---------------------------------------------------------------------------
// Migrazione una tantum "unit_fields_v2": aggiunge alle caratteristiche unità
// le sezioni Appartamento / Cantina / Planimetrie IN TESTA e Documenti vendita /
// Certificazioni IN FONDO, mantenendo nel mezzo i campi già esistenti (e i
// loro valori). Registrata in schema_migrations: se in futuro l'admin elimina
// o sposta questi campi dal pannello, non vengono ricreati.
// ---------------------------------------------------------------------------
const UNIT_FIELDS_V2_HEAD = [
  { slug: 'sezione_appartamento', label: 'Appartamento', field_type: 'section' },
  { slug: 'foglio_appartamento', label: 'Foglio appartamento', field_type: 'text' },
  { slug: 'particella_appartamento', label: 'Particella appartamento', field_type: 'text' },
  { slug: 'subalterno_appartamento', label: 'Subalterno appartamento', field_type: 'text' },
  { slug: 'sezione_cantina', label: 'Cantina', field_type: 'section' },
  { slug: 'foglio_cantina', label: 'Foglio cantina', field_type: 'text' },
  { slug: 'particella_cantina', label: 'Particella cantina', field_type: 'text' },
  { slug: 'subalterno_cantina', label: 'Subalterno cantina', field_type: 'text' },
  { slug: 'sezione_planimetrie', label: 'Planimetrie', field_type: 'section' },
  { slug: 'planimetria_quotata_appartamento', label: 'Planimetria quotata appartamento', field_type: 'attachment' },
  { slug: 'planimetria_commerciale_appartamento', label: 'Planimetria commerciale appartamento', field_type: 'attachment' },
  { slug: 'planimetria_quotata_cantina', label: 'Planimetria quotata cantina', field_type: 'attachment' },
];

const UNIT_FIELDS_V2_TAIL = [
  { slug: 'sezione_documenti_vendita', label: 'Documenti vendita', field_type: 'section' },
  { slug: 'prezzo_vendita_iva_esclusa', label: 'Prezzo di vendita IVA esclusa', field_type: 'number', field_unit: '€' },
  { slug: 'capitolato', label: 'Capitolato', field_type: 'attachment' },
  { slug: 'data_preliminare', label: 'Data preliminare', field_type: 'date' },
  { slug: 'preliminare', label: 'Preliminare', field_type: 'attachment' },
  { slug: 'visura_catastale', label: 'Visura catastale', field_type: 'attachment' },
  { slug: 'ape', label: 'APE', field_type: 'attachment' },
  { slug: 'liberatoria_condominio', label: 'Liberatoria condominio', field_type: 'attachment' },
  { slug: 'data_rogito', label: 'Data rogito', field_type: 'date' },
  { slug: 'certificato_rogito', label: 'Certificato di rogito', field_type: 'attachment' },
  { slug: 'atto_rogito', label: 'Atto di rogito', field_type: 'attachment' },
  { slug: 'note_documenti_vendita', label: 'Note', field_type: 'notes' },
  { slug: 'sezione_certificazioni', label: 'Certificazioni', field_type: 'section' },
  { slug: 'certificazione_impianto_elettrico', label: 'Certificazione impianto elettrico', field_type: 'attachment' },
  { slug: 'certificazione_impianto_idraulico', label: 'Certificazione impianto idraulico', field_type: 'attachment' },
  { slug: 'certificazione_impianto_termico', label: 'Certificazione impianto termico', field_type: 'attachment' },
  { slug: 'certificazione_condizionatori', label: 'Certificazione condizionatori', field_type: 'attachment' },
];

async function migrateUnitFieldsV2() {
  const name = 'unit_fields_v2';
  const [[done]] = await pool.query('SELECT COUNT(*) c FROM schema_migrations WHERE name = ?', [name]);
  if (done.c > 0) return;

  const [existing] = await pool.query("SELECT id, slug FROM field_definitions WHERE scope = 'unit' ORDER BY sort_order, id");
  const existingSlugs = new Set(existing.map(f => f.slug));

  async function insertDef(def) {
    const [r] = await pool.query(
      `INSERT INTO field_definitions (scope, room_type_key, slug, label, field_type, catalog_type, field_unit, sort_order)
       VALUES ('unit', NULL, ?, ?, ?, NULL, ?, 0)`,
      [def.slug, def.label, def.field_type, def.field_unit || null]
    );
    return r.insertId;
  }

  const orderedIds = [];
  for (const def of UNIT_FIELDS_V2_HEAD) {
    if (!existingSlugs.has(def.slug)) orderedIds.push(await insertDef(def));
  }
  // I campi già esistenti (portoncino, maniglie, quadro...) non devono finire sotto "Planimetrie":
  // si mette un titolo di sezione neutro prima di essi.
  if (existing.length > 0) {
    orderedIds.push(await insertDef({ slug: 'sezione_altre_caratteristiche', label: 'Altre caratteristiche', field_type: 'section' }));
  }
  existing.forEach(f => orderedIds.push(f.id));
  for (const def of UNIT_FIELDS_V2_TAIL) {
    if (!existingSlugs.has(def.slug)) orderedIds.push(await insertDef(def));
  }

  for (let i = 0; i < orderedIds.length; i++) {
    await pool.query('UPDATE field_definitions SET sort_order = ? WHERE id = ?', [i, orderedIds[i]]);
  }
  await pool.query('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
  console.log('[init] Migrazione unit_fields_v2: aggiunte sezioni Appartamento/Cantina/Planimetrie (in testa) e Documenti vendita/Certificazioni (in fondo).');
}

async function ensureAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const [[existing]] = await pool.query('SELECT id FROM users WHERE email = ?', [adminEmail]);
  if (existing) return;

  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';
  const hash = await bcrypt.hash(adminPassword, 10);
  await pool.query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', ['Admin', adminEmail, hash, 'admin']);
  console.log(`[init] Utente admin creato: ${adminEmail} / ${adminPassword} (CAMBIA la password al primo accesso)`);
}

async function init() {
  await runSchema();
  await ensureSchemaUpgrades();
  await seedDynamicFieldsIfNeeded();
  await ensureAdminUser();
  await migrateUnitFieldsV2();
  console.log('[init] Database MySQL pronto.');
}

// server.js attende db.ready prima di avviare il listener HTTP, così nessuna
// richiesta arriva prima che schema/seed/admin siano a posto.
pool.ready = init();

module.exports = pool;
