const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const multer = require('multer');
const db = require('../db/init');
const FIELD_TYPES = require('../config/fieldTypes');
const CATALOG_ITEMS = require('../config/itemCatalog'); // solo per MAX_OPTIONS
const { getUnitFields, loadSavedValues, loadAttachmentsByField } = require('../services/fields');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'));

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'public', 'uploads'),
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, unique + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ---------- Dashboard ----------
router.get('/', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  res.render('admin/dashboard', { projects, user: req.session.user });
});

// ---------- Progetti ----------
router.post('/projects', (req, res) => {
  const { name, units_count } = req.body;
  db.prepare('INSERT INTO projects (name, units_count) VALUES (?, ?)').run(name, units_count || 0);
  res.redirect('/admin');
});

router.get('/projects/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).render('error', { message: 'Progetto non trovato' });
  const units = db.prepare('SELECT * FROM units WHERE project_id = ? ORDER BY id').all(project.id);
  res.render('admin/project', { project, units });
});

router.post('/projects/:id/delete', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// ---------- Unità ----------
router.post('/projects/:id/units', (req, res) => {
  const { name, mq } = req.body;
  db.prepare('INSERT INTO units (project_id, name, mq) VALUES (?, ?, ?)').run(req.params.id, name, mq || null);
  res.redirect(`/admin/projects/${req.params.id}`);
});

router.get('/units/:id', (req, res) => {
  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).render('error', { message: 'Unità non trovata' });
  const rooms = db.prepare('SELECT * FROM rooms WHERE unit_id = ? ORDER BY id').all(unit.id);
  const roomTypes = db.prepare('SELECT * FROM room_types ORDER BY sort_order, id').all();

  const fields = getUnitFields(db);
  const savedValues = loadSavedValues(db, 'unit_fields', 'unit_id', unit.id);
  const attachmentsByField = loadAttachmentsByField(db, 'unit_id', unit.id);

  res.render('admin/unit', { unit, rooms, roomTypes, fields, savedValues, attachmentsByField });
});

// Dati generali (nome, mq)
router.post('/units/:id', (req, res) => {
  const { name, mq } = req.body;
  db.prepare('UPDATE units SET name = ?, mq = ? WHERE id = ?').run(name, mq || null, req.params.id);
  res.redirect(`/admin/units/${req.params.id}`);
});

router.post('/units/:id/delete', (req, res) => {
  const unit = db.prepare('SELECT project_id FROM units WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM units WHERE id = ?').run(req.params.id);
  res.redirect(`/admin/projects/${unit.project_id}`);
});

// Caratteristiche unità (campi dinamici) - salvataggio AJAX, stesso motore delle stanze
router.post('/units/:id/fields', (req, res) => {
  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Unità non trovata' });

  const validKeys = new Set(getUnitFields(db).map(f => f.key));

  const upsert = db.prepare(`
    INSERT INTO unit_fields (unit_id, field_key, value, updated_by, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(unit_id, field_key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `);

  const tx = db.transaction((body) => {
    for (const [key, value] of Object.entries(body)) {
      if (!validKeys.has(key)) continue;
      const stored = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
      upsert.run(unit.id, key, stored, req.session.user.id);
    }
  });
  tx(req.body);

  res.json({ ok: true });
});

router.post('/units/:id/upload', upload.single('file'), (req, res) => {
  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'Unità non trovata' });
  if (!req.file) return res.status(400).json({ error: 'Nessun file' });

  let kind = 'photo';
  if (req.body.kind === 'pdf') kind = 'pdf';
  else if (req.body.kind === 'file') kind = 'file';

  const filePath = '/uploads/' + req.file.filename;

  db.prepare('INSERT INTO attachments (unit_id, field_key, kind, file_path, original_name, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(unit.id, req.body.field_key || null, kind, filePath, req.file.originalname, req.session.user.id);

  res.json({ ok: true, path: filePath, original_name: req.file.originalname });
});

router.post('/units/:id/attachments/:attachmentId/delete', (req, res) => {
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ? AND unit_id = ?')
    .get(req.params.attachmentId, req.params.id);
  if (!attachment) return res.status(404).json({ error: 'Allegato non trovato' });

  db.prepare('DELETE FROM attachments WHERE id = ?').run(attachment.id);
  const filePath = path.join(__dirname, '..', 'public', attachment.file_path.replace(/^\//, ''));
  fs.unlink(filePath, () => {});

  res.json({ ok: true });
});

// ---------- Stanze ----------
router.post('/units/:id/rooms', (req, res) => {
  const { name, room_type } = req.body;
  db.prepare('INSERT INTO rooms (unit_id, name, room_type) VALUES (?, ?, ?)').run(req.params.id, name, room_type);
  res.redirect(`/admin/units/${req.params.id}`);
});

router.post('/rooms/:id/delete', (req, res) => {
  const room = db.prepare('SELECT unit_id FROM rooms WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
  res.redirect(`/admin/units/${room.unit_id}`);
});

// ---------- Tipi di stanza ----------
router.get('/room-types', (req, res) => {
  const roomTypes = db.prepare('SELECT * FROM room_types ORDER BY sort_order, id').all();
  res.render('admin/room-types', { roomTypes });
});

router.post('/room-types', (req, res) => {
  const { label } = req.body;
  const key = slugify(label);
  if (!key || !label) return res.redirect('/admin/room-types');
  const exists = db.prepare('SELECT 1 FROM room_types WHERE key = ?').get(key);
  if (!exists) {
    const count = db.prepare('SELECT COUNT(*) c FROM room_types').get().c;
    db.prepare('INSERT INTO room_types (key, label, sort_order) VALUES (?, ?, ?)').run(key, label, count);
  }
  res.redirect('/admin/room-types');
});

router.post('/room-types/:key/delete', (req, res) => {
  const inUse = db.prepare('SELECT COUNT(*) c FROM rooms WHERE room_type = ?').get(req.params.key).c;
  if (inUse > 0) {
    return res.status(400).render('error', { message: `Impossibile eliminare: ${inUse} stanze usano ancora questo tipo.` });
  }
  db.prepare('DELETE FROM field_definitions WHERE scope = ? AND room_type_key = ?').run('room', req.params.key);
  db.prepare('DELETE FROM room_types WHERE key = ?').run(req.params.key);
  res.redirect('/admin/room-types');
});

// ---------- Campi dinamici (condiviso tra tipi di stanza e caratteristiche unità) ----------
function fieldExists(scope, roomTypeKey, key) {
  if (roomTypeKey == null) {
    return !!db.prepare('SELECT 1 FROM field_definitions WHERE scope = ? AND room_type_key IS NULL AND key = ?').get(scope, key);
  }
  return !!db.prepare('SELECT 1 FROM field_definitions WHERE scope = ? AND room_type_key = ? AND key = ?').get(scope, roomTypeKey, key);
}

function addFieldDefinition(req, res, scope, roomTypeKey, redirectTo) {
  const { label, field_type, catalog_type, new_catalog_label, field_unit } = req.body;
  const key = slugify(label);
  const typeInfo = FIELD_TYPES.find(t => t.value === field_type);
  if (!key || !label || !typeInfo) return res.redirect(redirectTo);
  if (fieldExists(scope, roomTypeKey, key)) return res.redirect(redirectTo);

  let catalogType = null;
  if (typeInfo.needsCatalog) {
    catalogType = catalog_type || null;
    if (!catalogType && new_catalog_label) {
      const newSlug = slugify(new_catalog_label);
      if (newSlug) {
        db.prepare('INSERT OR IGNORE INTO catalog_types (type, label) VALUES (?, ?)').run(newSlug, new_catalog_label);
        catalogType = newSlug;
      }
    }
  }

  const count = roomTypeKey == null
    ? db.prepare('SELECT COUNT(*) c FROM field_definitions WHERE scope = ? AND room_type_key IS NULL').get(scope).c
    : db.prepare('SELECT COUNT(*) c FROM field_definitions WHERE scope = ? AND room_type_key = ?').get(scope, roomTypeKey).c;

  db.prepare(`
    INSERT INTO field_definitions (scope, room_type_key, key, label, field_type, catalog_type, field_unit, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(scope, roomTypeKey, key, label, field_type, catalogType, field_unit || null, count);

  res.redirect(redirectTo);
}

router.get('/room-types/:key/fields', (req, res) => {
  const roomType = db.prepare('SELECT * FROM room_types WHERE key = ?').get(req.params.key);
  if (!roomType) return res.status(404).render('error', { message: 'Tipo stanza non trovato' });
  const fields = db.prepare('SELECT * FROM field_definitions WHERE scope = ? AND room_type_key = ? ORDER BY sort_order, id').all('room', req.params.key);
  const catalogTypes = db.prepare('SELECT * FROM catalog_types ORDER BY label').all();
  res.render('admin/field-list', {
    scopeLabel: `Campi: ${roomType.label}`,
    fields,
    fieldTypes: FIELD_TYPES,
    catalogTypes,
    formAction: `/admin/room-types/${roomType.key}/fields`,
    backLink: '/admin/room-types',
  });
});

router.post('/room-types/:key/fields', (req, res) => {
  addFieldDefinition(req, res, 'room', req.params.key, `/admin/room-types/${req.params.key}/fields`);
});

router.get('/unit-fields', (req, res) => {
  const fields = db.prepare("SELECT * FROM field_definitions WHERE scope = 'unit' ORDER BY sort_order, id").all();
  const catalogTypes = db.prepare('SELECT * FROM catalog_types ORDER BY label').all();
  res.render('admin/field-list', {
    scopeLabel: 'Caratteristiche unità',
    fields,
    fieldTypes: FIELD_TYPES,
    catalogTypes,
    formAction: '/admin/unit-fields',
    backLink: '/admin',
  });
});

router.post('/unit-fields', (req, res) => {
  addFieldDefinition(req, res, 'unit', null, '/admin/unit-fields');
});

router.post('/fields/:id/delete', (req, res) => {
  const field = db.prepare('SELECT * FROM field_definitions WHERE id = ?').get(req.params.id);
  if (!field) return res.status(404).render('error', { message: 'Campo non trovato' });
  db.prepare('DELETE FROM field_definitions WHERE id = ?').run(req.params.id);
  const redirectTo = field.scope === 'unit' ? '/admin/unit-fields' : `/admin/room-types/${field.room_type_key}/fields`;
  res.redirect(redirectTo);
});

// ---------- Utenti ----------
router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY id').all();
  res.render('admin/users', { users });
});

router.post('/users', (req, res) => {
  const { name, email, password, role } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  try {
    db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, hash, role);
  } catch (e) {
    // email duplicata etc.
  }
  res.redirect('/admin/users');
});

router.post('/users/:id/delete', (req, res) => {
  if (Number(req.params.id) === req.session.user.id) return res.redirect('/admin/users');
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.redirect('/admin/users');
});

// ---------- Catalogo opzioni ----------
router.get('/catalog', (req, res) => {
  const items = db.prepare('SELECT type, label FROM catalog_types ORDER BY label').all();
  res.render('admin/catalog-list', { items });
});

router.post('/catalog', (req, res) => {
  const { label } = req.body;
  const type = slugify(label);
  if (type && label) {
    db.prepare('INSERT OR IGNORE INTO catalog_types (type, label) VALUES (?, ?)').run(type, label);
  }
  res.redirect('/admin/catalog');
});

router.get('/catalog/:type', (req, res) => {
  const catalogItem = db.prepare('SELECT * FROM catalog_types WHERE type = ?').get(req.params.type);
  if (!catalogItem) return res.status(404).render('error', { message: 'Voce di catalogo non trovata' });
  const options = db.prepare('SELECT * FROM catalog_options WHERE catalog_type = ? ORDER BY sort_order, id').all(req.params.type);
  res.render('admin/catalog-detail', { catalogItem, options, maxOptions: CATALOG_ITEMS.MAX_OPTIONS });
});

router.post('/catalog/:type/options', upload.single('photo'), (req, res) => {
  const count = db.prepare('SELECT COUNT(*) c FROM catalog_options WHERE catalog_type = ?').get(req.params.type).c;
  if (count >= CATALOG_ITEMS.MAX_OPTIONS) {
    return res.status(400).render('error', { message: `Massimo ${CATALOG_ITEMS.MAX_OPTIONS} opzioni per voce` });
  }
  const photoPath = req.file ? '/uploads/' + req.file.filename : null;
  db.prepare('INSERT INTO catalog_options (catalog_type, label, photo_path, sort_order) VALUES (?, ?, ?, ?)')
    .run(req.params.type, req.body.label, photoPath, count);
  res.redirect(`/admin/catalog/${req.params.type}`);
});

// Modifica di un'opzione esistente (label e, opzionalmente, nuova foto)
router.post('/catalog/options/:id', upload.single('photo'), (req, res) => {
  const option = db.prepare('SELECT * FROM catalog_options WHERE id = ?').get(req.params.id);
  if (!option) return res.status(404).render('error', { message: 'Opzione non trovata' });
  const photoPath = req.file ? '/uploads/' + req.file.filename : option.photo_path;
  db.prepare('UPDATE catalog_options SET label = ?, photo_path = ? WHERE id = ?').run(req.body.label, photoPath, option.id);
  res.redirect(`/admin/catalog/${option.catalog_type}`);
});

router.post('/catalog/options/:id/delete', (req, res) => {
  const option = db.prepare('SELECT catalog_type FROM catalog_options WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM catalog_options WHERE id = ?').run(req.params.id);
  res.redirect(`/admin/catalog/${option.catalog_type}`);
});

module.exports = router;
