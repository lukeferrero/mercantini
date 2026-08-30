CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','editor') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  units_count INT NOT NULL DEFAULT 0,
  image_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS units (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  mq DOUBLE,
  portoncino_tipo VARCHAR(255),      -- legacy: migrato in unit_fields (vedi scripts/migrate-sqlite-to-mysql.js)
  portoncino_spioncino VARCHAR(10),  -- legacy
  portoncino_colore VARCHAR(255),    -- legacy
  maniglie_tipo VARCHAR(255),        -- legacy
  quadro_elettrico_note TEXT,        -- legacy
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_units_project (project_id),
  CONSTRAINT fk_units_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tipi di stanza gestibili da pannello admin (bagno, soggiorno, ... + quelli creati dall'admin)
-- Colonna "slug" (non "key": KEY è parola riservata in MySQL) = identificativo testuale stabile.
CREATE TABLE IF NOT EXISTS room_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(100) NOT NULL,
  label VARCHAR(255) NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_room_types_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unit_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  room_type VARCHAR(100) NOT NULL,   -- riferimento logico a room_types.slug (nessun vincolo rigido: i tipi sono dinamici)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rooms_unit (unit_id),
  CONSTRAINT fk_rooms_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Definizione dei campi, sia per tipo di stanza (scope='room') sia per le caratteristiche
-- dell'unità (scope='unit', room_type_key sempre NULL). Gestibili da pannello admin.
CREATE TABLE IF NOT EXISTS field_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scope ENUM('room','unit') NOT NULL,
  room_type_key VARCHAR(100),        -- riferimento logico a room_types.slug; NULL se scope='unit'
  slug VARCHAR(150) NOT NULL,
  label VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL,   -- vedi config/fieldTypes.js per i tipi di controllo supportati
  catalog_type VARCHAR(150),         -- per i campi catalog_select*: riferimento a catalog_types.type
  field_unit VARCHAR(50),            -- es. 'cm' per i campi numerici
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_field_definitions_scope (scope, room_type_key)
  -- Nota: niente UNIQUE su (scope, room_type_key, slug) — con room_type_key NULL (scope='unit')
  -- MySQL, come SQLite, non applicherebbe comunque l'unicità tra più NULL. Il controllo dei
  -- duplicati è fatto a livello applicativo (vedi fieldExists() in routes/admin.js).
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Valori dei campi dinamici per ogni stanza (chiave/valore)
CREATE TABLE IF NOT EXISTS room_fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  field_key VARCHAR(150) NOT NULL,
  value TEXT,          -- valore semplice, oppure JSON per campi composti (es. count_or_none_pdf, bool_note_pdf...)
  updated_by INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_room_fields (room_id, field_key),
  CONSTRAINT fk_room_fields_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_room_fields_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Valori dei campi dinamici per le caratteristiche di ogni unità (stesso principio di room_fields)
CREATE TABLE IF NOT EXISTS unit_fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unit_id INT NOT NULL,
  field_key VARCHAR(150) NOT NULL,
  value TEXT,
  updated_by INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_unit_fields (unit_id, field_key),
  CONSTRAINT fk_unit_fields_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_fields_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Registro delle "voci" di catalogo (piastrelle, sanitari, ecc.), gestibile da pannello admin
CREATE TABLE IF NOT EXISTS catalog_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(150) NOT NULL,
  label VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_catalog_types_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Catalogo opzioni configurabili dall'admin (max 10 per catalog_type), con foto e fornitore
CREATE TABLE IF NOT EXISTS catalog_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  catalog_type VARCHAR(150) NOT NULL,   -- es. 'piastrelle_pavimento_bagno'
  label VARCHAR(255) NOT NULL,
  fornitore VARCHAR(255),
  photo_path VARCHAR(500),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_catalog_options_type (catalog_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- File allegati generici (foto per room/unit_fields dove serve, pdf per campi note_pdf, ecc.)
CREATE TABLE IF NOT EXISTS attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT,
  unit_id INT,
  field_key VARCHAR(150),
  kind ENUM('photo','pdf','file') NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  original_name VARCHAR(500),
  uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_attachments_room (room_id),
  KEY idx_attachments_unit (unit_id),
  CONSTRAINT fk_attachments_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_attachments_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
  CONSTRAINT fk_attachments_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
