CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','editor')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  units_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mq REAL,
  portoncino_tipo TEXT,
  portoncino_spioncino TEXT,      -- 'si' | 'no'
  portoncino_colore TEXT,
  maniglie_tipo TEXT,
  quadro_elettrico_note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  room_type TEXT NOT NULL CHECK (room_type IN ('bagno','soggiorno','ingresso','letto','cucina','altro')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Valori dei campi dinamici per ogni stanza (chiave/valore, vedi config/roomFields.js)
CREATE TABLE IF NOT EXISTS room_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  value TEXT,          -- valore semplice, oppure JSON per campi composti (es. count_or_none_pdf, bool_note_pdf...)
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(room_id, field_key)
);

-- Catalogo opzioni configurabili dall'admin (max 10 per catalog_type), con foto
CREATE TABLE IF NOT EXISTS catalog_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  catalog_type TEXT NOT NULL,   -- es. 'piastrelle_pavimento_bagno'
  label TEXT NOT NULL,
  photo_path TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- File allegati generici (foto per room_fields dove serve, pdf per campi note_pdf, ecc.)
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  field_key TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('photo','pdf','file')),
  file_path TEXT NOT NULL,
  original_name TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_units_project ON units(project_id);
CREATE INDEX IF NOT EXISTS idx_rooms_unit ON rooms(unit_id);
CREATE INDEX IF NOT EXISTS idx_room_fields_room ON room_fields(room_id);
CREATE INDEX IF NOT EXISTS idx_catalog_type ON catalog_options(catalog_type);
CREATE INDEX IF NOT EXISTS idx_attachments_room ON attachments(room_id);
