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
  portoncino_tipo TEXT,           -- legacy: migrato in unit_fields al primo avvio dopo l'aggiornamento
  portoncino_spioncino TEXT,      -- legacy
  portoncino_colore TEXT,         -- legacy
  maniglie_tipo TEXT,             -- legacy
  quadro_elettrico_note TEXT,     -- legacy
  created_at TEXT DEFAULT (datetime('now'))
);

-- Tipi di stanza gestibili da pannello admin (bagno, soggiorno, ... + quelli creati dall'admin)
CREATE TABLE IF NOT EXISTS room_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  room_type TEXT NOT NULL,   -- riferimento logico a room_types.key (nessun vincolo CHECK: i tipi sono dinamici)
  created_at TEXT DEFAULT (datetime('now'))
);

-- Definizione dei campi, sia per tipo di stanza (scope='room') sia per le caratteristiche
-- dell'unità (scope='unit', room_type_key sempre NULL). Gestibili da pannello admin.
CREATE TABLE IF NOT EXISTS field_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL CHECK (scope IN ('room','unit')),
  room_type_key TEXT,             -- riferimento logico a room_types.key; NULL se scope='unit'
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,       -- vedi config/fieldTypes.js per i tipi di controllo supportati
  catalog_type TEXT,              -- per i campi catalog_select*: riferimento a catalog_types.type
  field_unit TEXT,                -- es. 'cm' per i campi numerici
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(scope, room_type_key, key)
);

-- Valori dei campi dinamici per ogni stanza (chiave/valore)
CREATE TABLE IF NOT EXISTS room_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  value TEXT,          -- valore semplice, oppure JSON per campi composti (es. count_or_none_pdf, bool_note_pdf...)
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(room_id, field_key)
);

-- Valori dei campi dinamici per le caratteristiche di ogni unità (stesso principio di room_fields)
CREATE TABLE IF NOT EXISTS unit_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  value TEXT,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(unit_id, field_key)
);

-- Registro delle "voci" di catalogo (piastrelle, sanitari, ecc.), gestibile da pannello admin
CREATE TABLE IF NOT EXISTS catalog_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
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

-- File allegati generici (foto per room/unit_fields dove serve, pdf per campi note_pdf, ecc.)
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_unit_fields_unit ON unit_fields(unit_id);
CREATE INDEX IF NOT EXISTS idx_field_definitions_scope ON field_definitions(scope, room_type_key);
CREATE INDEX IF NOT EXISTS idx_catalog_type ON catalog_options(catalog_type);
CREATE INDEX IF NOT EXISTS idx_attachments_room ON attachments(room_id);
-- idx_attachments_unit: creato in db/init.js dopo la migrazione, non qui (su un DB
-- esistente la colonna unit_id non c'è ancora quando questo schema viene eseguito).
