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
