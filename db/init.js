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
  await seedDynamicFieldsIfNeeded();
  await ensureAdminUser();
  console.log('[init] Database MySQL pronto.');
}

// server.js attende db.ready prima di avviare il listener HTTP, così nessuna
// richiesta arriva prima che schema/seed/admin siano a posto.
pool.ready = init();

module.exports = pool;
