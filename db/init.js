const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'data.sqlite');
const isNew = !fs.existsSync(DB_PATH);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ---------------------------------------------------------------------------
// Migrazione: rimuove il vecchio vincolo CHECK su rooms.room_type, presente
// nei database creati prima dell'introduzione dei tipi di stanza dinamici.
// Idempotente: agisce solo se il vincolo è ancora presente.
// ---------------------------------------------------------------------------
function migrateRoomsCheckConstraint(db) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='rooms'").get();
  if (!row || !row.sql || !row.sql.includes('CHECK')) return;

  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE rooms_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      room_type TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO rooms_new (id, unit_id, name, room_type, created_at)
      SELECT id, unit_id, name, room_type, created_at FROM rooms;
    DROP TABLE rooms;
    ALTER TABLE rooms_new RENAME TO rooms;
    CREATE INDEX IF NOT EXISTS idx_rooms_unit ON rooms(unit_id);
  `);
  db.pragma('foreign_keys = ON');
  console.log('[init] Migrazione: rimosso il vincolo fisso sui tipi di stanza (ora dinamici).');
}
migrateRoomsCheckConstraint(db);

// ---------------------------------------------------------------------------
// Migrazione: aggiunge unit_id ad attachments se il database è precedente
// all'introduzione degli allegati a livello di unità (oltre che di stanza).
// ---------------------------------------------------------------------------
function migrateAttachmentsUnitId(db) {
  const cols = db.prepare("PRAGMA table_info(attachments)").all();
  if (!cols.some(c => c.name === 'unit_id')) {
    db.exec('ALTER TABLE attachments ADD COLUMN unit_id INTEGER REFERENCES units(id) ON DELETE CASCADE');
    console.log('[init] Migrazione: aggiunta colonna unit_id ad attachments.');
  }
  // Sempre eseguito (anche su DB nuovi, dove la colonna esiste già dallo schema.sql):
  // l'indice non viene creato altrove.
  db.exec('CREATE INDEX IF NOT EXISTS idx_attachments_unit ON attachments(unit_id)');
}
migrateAttachmentsUnitId(db);

// ---------------------------------------------------------------------------
// Seed iniziale: al primo avvio dopo l'introduzione dei campi dinamici,
// popola room_types / field_definitions / catalog_types a partire dalla
// vecchia configurazione fissa (config/roomFields.js, config/itemCatalog.js),
// così i dati e i form esistenti restano identici. Da quel momento in poi
// tutto è gestibile da pannello admin. Agisce una sola volta (guardia su
// room_types vuota).
// ---------------------------------------------------------------------------
const DEFAULT_ROOM_TYPES = [
  { key: 'bagno', label: 'Bagno' },
  { key: 'soggiorno', label: 'Soggiorno' },
  { key: 'cucina', label: 'Cucina' },
  { key: 'letto', label: 'Camera da letto' },
  { key: 'ingresso', label: 'Ingresso' },
  { key: 'altro', label: 'Altro' },
];

const UNIT_FIELDS_SEED = [
  { key: 'portoncino_tipo', label: 'Portoncino blindato', field_type: 'catalog_select', catalog_type: 'portoncino_blindato' },
  { key: 'portoncino_spioncino', label: 'Spioncino', field_type: 'boolean' },
  { key: 'portoncino_colore', label: 'Colore portoncino', field_type: 'text' },
  { key: 'maniglie_tipo', label: 'Maniglie', field_type: 'catalog_select', catalog_type: 'maniglie' },
  { key: 'quadro_elettrico_note', label: 'Quadro elettrico - note', field_type: 'notes' },
];

function seedDynamicFieldsIfNeeded(db) {
  const alreadySeeded = db.prepare('SELECT COUNT(*) c FROM room_types').get().c > 0;
  if (alreadySeeded) return;

  const ROOM_FIELDS_SEED = require('../config/roomFields');
  const CATALOG_ITEMS_SEED = require('../config/itemCatalog');

  const insertRoomType = db.prepare('INSERT INTO room_types (key, label, sort_order) VALUES (?, ?, ?)');
  DEFAULT_ROOM_TYPES.forEach((rt, i) => insertRoomType.run(rt.key, rt.label, i));

  const insertField = db.prepare(`
    INSERT INTO field_definitions (scope, room_type_key, key, label, field_type, catalog_type, field_unit, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [roomTypeKey, fields] of Object.entries(ROOM_FIELDS_SEED)) {
    fields.forEach((f, i) => {
      insertField.run('room', roomTypeKey, f.key, f.label, f.type, f.catalogType || null, f.unit || null, i);
    });
  }
  UNIT_FIELDS_SEED.forEach((f, i) => {
    insertField.run('unit', null, f.key, f.label, f.field_type, f.catalog_type || null, null, i);
  });

  const insertCatalogType = db.prepare('INSERT OR IGNORE INTO catalog_types (type, label) VALUES (?, ?)');
  CATALOG_ITEMS_SEED.forEach(c => insertCatalogType.run(c.type, c.label));
  insertCatalogType.run('portoncino_blindato', 'Portoncino blindato');
  insertCatalogType.run('maniglie', 'Maniglie');

  // Migra i valori già presenti nelle vecchie colonne fisse di units nella nuova unit_fields.
  const units = db.prepare(`
    SELECT id, portoncino_tipo, portoncino_spioncino, portoncino_colore, maniglie_tipo, quadro_elettrico_note
    FROM units
  `).all();
  const insertUnitField = db.prepare('INSERT OR IGNORE INTO unit_fields (unit_id, field_key, value) VALUES (?, ?, ?)');
  for (const u of units) {
    if (u.portoncino_tipo) insertUnitField.run(u.id, 'portoncino_tipo', String(u.portoncino_tipo));
    if (u.portoncino_spioncino) insertUnitField.run(u.id, 'portoncino_spioncino', u.portoncino_spioncino);
    if (u.portoncino_colore) insertUnitField.run(u.id, 'portoncino_colore', u.portoncino_colore);
    if (u.maniglie_tipo) insertUnitField.run(u.id, 'maniglie_tipo', String(u.maniglie_tipo));
    if (u.quadro_elettrico_note) insertUnitField.run(u.id, 'quadro_elettrico_note', u.quadro_elettrico_note);
  }

  console.log('[init] Seed campi dinamici completato: tipi di stanza, campi e catalogo migrati dalla configurazione fissa.');
}
seedDynamicFieldsIfNeeded(db);

// Crea un admin di default al primo avvio (email/password da variabili d'ambiente o default)
const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);

if (!existingAdmin) {
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';
  const hash = bcrypt.hashSync(adminPassword, 10);
  db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run('Admin', adminEmail, hash, 'admin');
  console.log(`[init] Utente admin creato: ${adminEmail} / ${adminPassword} (CAMBIA la password al primo accesso)`);
}

if (isNew) {
  console.log('[init] Nuovo database creato in', DB_PATH);
}

module.exports = db;
