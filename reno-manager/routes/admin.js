const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const multer = require('multer');
const db = require('../db/init');
const FIELD_TYPES = require('../config/fieldTypes');
const CATALOG_ITEMS = require('../config/itemCatalog'); // solo per MAX_OPTIONS
const { getUnitFields, loadSavedValues, loadAttachmentsByField } = require('../services/fields');
const { getProjectForUnit, getProjectDocs } = require('../services/projects');
const PROJECT_DOCS = require('../config/projectDocs');
const { requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

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
  limits: { fileSize: 30 * 1024 * 1024 },
});

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ---------- Dashboard ----------
router.get('/', asyncHandler(async (req, res) => {
  const [projects] = await db.query('SELECT * FROM projects ORDER BY created_at DESC');
  res.render('admin/dashboard', { projects, user: req.session.user });
}));

// ---------- Progetti ----------
router.post('/projects', asyncHandler(async (req, res) => {
  const { name, units_count } = req.body;
  await db.query('INSERT INTO projects (name, units_count) VALUES (?, ?)', [name, units_count || 0]);
  res.redirect('/admin');
}));

router.get('/projects/:id', asyncHandler(async (req, res) => {
  const [[project]] = await db.query('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  if (!project) return res.status(404).render('error', { message: 'Progetto non trovato' });
  const [units] = await db.query('SELECT * FROM units WHERE project_id = ? ORDER BY id', [project.id]);
  const docsByKey = await getProjectDocs(db, project.id);
  res.render('admin/project', { project, units, docSlots: PROJECT_DOCS, docsByKey });
}));

router.post('/projects/:id/delete', asyncHandler(async (req, res) => {
  await db.query('DELETE FROM projects WHERE id = ?', [req.params.id]);
  res.redirect('/admin');
}));

// Immagine del progetto (mostrata fissa in cima a tutte le pagine del progetto)
router.post('/projects/:id/image', upload.single('image'), asyncHandler(async (req, res) => {
  if (req.file) {
    const imagePath = '/uploads/' + req.file.filename;
    await db.query('UPDATE projects SET image_path = ? WHERE id = ?', [imagePath, req.params.id]);
  }
  res.redirect(`/admin/projects/${req.params.id}`);
}));

router.post('/projects/:id/image/delete', asyncHandler(async (req, res) => {
  await db.query('UPDATE projects SET image_path = NULL WHERE id = ?', [req.params.id]);
  res.redirect(`/admin/projects/${req.params.id}`);
}));

// Documenti del progetto: una voce fissa per file (vedi config/projectDocs.js).
// Per sostituire un file bisogna prima eliminare quello esistente.
router.post('/projects/:id/docs/:key', upload.single('file'), asyncHandler(async (req, res) => {
  const back = `/admin/projects/${req.params.id}`;
  const slot = PROJECT_DOCS.find(s => s.key === req.params.key);
  const [[project]] = await db.query('SELECT id FROM projects WHERE id = ?', [req.params.id]);
  if (!slot || !project || !req.file) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.redirect(back);
  }
  const [[existing]] = await db.query('SELECT id FROM attachments WHERE project_id = ? AND field_key = ?', [project.id, slot.key]);
  if (existing) {
    fs.unlink(req.file.path, () => {});
    return res.redirect(back);
  }
  await db.query(
    'INSERT INTO attachments (project_id, field_key, kind, file_path, original_name, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
    [project.id, slot.key, 'file', '/uploads/' + req.file.filename, req.file.originalname, req.session.user.id]
  );
  res.redirect(back);
}));

router.post('/projects/:id/docs/:attachmentId/delete', asyncHandler(async (req, res) => {
  const [[attachment]] = await db.query('SELECT * FROM attachments WHERE id = ? AND project_id = ?', [req.params.attachmentId, req.params.id]);
  if (attachment) {
    await db.query('DELETE FROM attachments WHERE id = ?', [attachment.id]);
    const filePath = path.join(__dirname, '..', 'public', attachment.file_path.replace(/^\//, ''));
    fs.unlink(filePath, () => {});
  }
  res.redirect(`/admin/projects/${req.params.id}`);
}));

router.post('/projects/:id/note', asyncHandler(async (req, res) => {
  await db.query('UPDATE projects SET note = ? WHERE id = ?', [req.body.note || null, req.params.id]);
  res.redirect(`/admin/projects/${req.params.id}`);
}));

// ---------- Unità ----------
router.post('/projects/:id/units', asyncHandler(async (req, res) => {
  const { name, mq } = req.body;
  await db.query('INSERT INTO units (project_id, name, mq) VALUES (?, ?, ?)', [req.params.id, name, mq || null]);
  res.redirect(`/admin/projects/${req.params.id}`);
}));

router.get('/units/:id', asyncHandler(async (req, res) => {
  const [[unit]] = await db.query('SELECT * FROM units WHERE id = ?', [req.params.id]);
  if (!unit) return res.status(404).render('error', { message: 'Unità non trovata' });
  const [rooms] = await db.query('SELECT * FROM rooms WHERE unit_id = ? ORDER BY id', [unit.id]);
  const [roomTypes] = await db.query('SELECT * FROM room_types ORDER BY sort_order, id');
  const project = await getProjectForUnit(db, unit.id);

  const fields = await getUnitFields(db);
  const savedValues = await loadSavedValues(db, 'unit_fields', 'unit_id', unit.id);
  const attachmentsByField = await loadAttachmentsByField(db, 'unit_id', unit.id);

  res.render('admin/unit', { unit, project, rooms, roomTypes, fields, savedValues, attachmentsByField });
}));

// Dati generali (nome, mq)
router.post('/units/:id', asyncHandler(async (req, res) => {
  const { name, mq } = req.body;
  await db.query('UPDATE units SET name = ?, mq = ? WHERE id = ?', [name, mq || null, req.params.id]);
  res.redirect(`/admin/units/${req.params.id}`);
}));

router.post('/units/:id/delete', asyncHandler(async (req, res) => {
  const [[unit]] = await db.query('SELECT project_id FROM units WHERE id = ?', [req.params.id]);
  await db.query('DELETE FROM units WHERE id = ?', [req.params.id]);
  res.redirect(`/admin/projects/${unit.project_id}`);
}));

// Caratteristiche unità (campi dinamici) - salvataggio AJAX, stesso motore delle stanze
router.post('/units/:id/fields', asyncHandler(async (req, res) => {
  const [[unit]] = await db.query('SELECT * FROM units WHERE id = ?', [req.params.id]);
  if (!unit) return res.status(404).json({ error: 'Unità non trovata' });

  const unitFields = await getUnitFields(db);
  const validKeys = new Set(unitFields.map(f => f.key));

  for (const [key, value] of Object.entries(req.body)) {
    if (!validKeys.has(key)) continue;
    const stored = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    await db.query(
      `INSERT INTO unit_fields (unit_id, field_key, value, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)`,
      [unit.id, key, stored, req.session.user.id]
    );
  }

  res.json({ ok: true });
}));

router.post('/units/:id/upload', upload.single('file'), asyncHandler(async (req, res) => {
  const [[unit]] = await db.query('SELECT * FROM units WHERE id = ?', [req.params.id]);
  if (!unit) return res.status(404).json({ error: 'Unità non trovata' });
  if (!req.file) return res.status(400).json({ error: 'Nessun file' });

  let kind = 'photo';
  if (req.body.kind === 'pdf') kind = 'pdf';
  else if (req.body.kind === 'file') kind = 'file';

  const filePath = '/uploads/' + req.file.filename;

  await db.query(
    'INSERT INTO attachments (unit_id, field_key, kind, file_path, original_name, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
    [unit.id, req.body.field_key || null, kind, filePath, req.file.originalname, req.session.user.id]
  );

  res.json({ ok: true, path: filePath, original_name: req.file.originalname });
}));

router.post('/units/:id/attachments/:attachmentId/delete', asyncHandler(async (req, res) => {
  const [[attachment]] = await db.query('SELECT * FROM attachments WHERE id = ? AND unit_id = ?', [req.params.attachmentId, req.params.id]);
  if (!attachment) return res.status(404).json({ error: 'Allegato non trovato' });

  await db.query('DELETE FROM attachments WHERE id = ?', [attachment.id]);
  const filePath = path.join(__dirname, '..', 'public', attachment.file_path.replace(/^\//, ''));
  fs.unlink(filePath, () => {});

  res.json({ ok: true });
}));

// ---------- Stanze ----------
router.post('/units/:id/rooms', asyncHandler(async (req, res) => {
  const { name, room_type } = req.body;
  await db.query('INSERT INTO rooms (unit_id, name, room_type) VALUES (?, ?, ?)', [req.params.id, name, room_type]);
  res.redirect(`/admin/units/${req.params.id}`);
}));

router.post('/rooms/:id/delete', asyncHandler(async (req, res) => {
  const [[room]] = await db.query('SELECT unit_id FROM rooms WHERE id = ?', [req.params.id]);
  await db.query('DELETE FROM rooms WHERE id = ?', [req.params.id]);
  res.redirect(`/admin/units/${room.unit_id}`);
}));

// ---------- Tipi di stanza ----------
router.get('/room-types', asyncHandler(async (req, res) => {
  const [roomTypes] = await db.query('SELECT * FROM room_types ORDER BY sort_order, id');
  res.render('admin/room-types', { roomTypes });
}));

router.post('/room-types', asyncHandler(async (req, res) => {
  const { label } = req.body;
  const slug = slugify(label);
  if (!slug || !label) return res.redirect('/admin/room-types');
  const [[exists]] = await db.query('SELECT id FROM room_types WHERE slug = ?', [slug]);
  if (!exists) {
    const [[{ c }]] = await db.query('SELECT COUNT(*) c FROM room_types');
    await db.query('INSERT INTO room_types (slug, label, sort_order) VALUES (?, ?, ?)', [slug, label, c]);
  }
  res.redirect('/admin/room-types');
}));

router.post('/room-types/:slug/delete', asyncHandler(async (req, res) => {
  const [[{ c }]] = await db.query('SELECT COUNT(*) c FROM rooms WHERE room_type = ?', [req.params.slug]);
  if (c > 0) {
    return res.status(400).render('error', { message: `Impossibile eliminare: ${c} stanze usano ancora questo tipo.` });
  }
  await db.query('DELETE FROM field_definitions WHERE scope = ? AND room_type_key = ?', ['room', req.params.slug]);
  await db.query('DELETE FROM room_types WHERE slug = ?', [req.params.slug]);
  res.redirect('/admin/room-types');
}));

// ---------- Campi dinamici (condiviso tra tipi di stanza e caratteristiche unità) ----------
async function fieldExists(scope, roomTypeKey, slug) {
  const [[row]] = roomTypeKey == null
    ? await db.query('SELECT id FROM field_definitions WHERE scope = ? AND room_type_key IS NULL AND slug = ?', [scope, slug])
    : await db.query('SELECT id FROM field_definitions WHERE scope = ? AND room_type_key = ? AND slug = ?', [scope, roomTypeKey, slug]);
  return !!row;
}

// Per i campi "da catalogo": usa il catalogo scelto oppure ne crea uno nuovo al volo.
async function resolveCatalogType(typeInfo, body) {
  if (!typeInfo.needsCatalog) return null;
  let catalogType = body.catalog_type || null;
  if (!catalogType && body.new_catalog_label) {
    const newSlug = slugify(body.new_catalog_label);
    if (newSlug) {
      await db.query('INSERT IGNORE INTO catalog_types (type, label) VALUES (?, ?)', [newSlug, body.new_catalog_label]);
      catalogType = newSlug;
    }
  }
  return catalogType;
}

async function addFieldDefinition(req, res, scope, roomTypeKey, redirectTo) {
  const { label, field_type, catalog_type, new_catalog_label, field_unit } = req.body;
  const slug = slugify(label);
  const typeInfo = FIELD_TYPES.find(t => t.value === field_type);
  if (!slug || !label || !typeInfo) return res.redirect(redirectTo);
  if (await fieldExists(scope, roomTypeKey, slug)) return res.redirect(redirectTo);

  const catalogType = await resolveCatalogType(typeInfo, req.body);

  const [[{ c }]] = roomTypeKey == null
    ? await db.query('SELECT COUNT(*) c FROM field_definitions WHERE scope = ? AND room_type_key IS NULL', [scope])
    : await db.query('SELECT COUNT(*) c FROM field_definitions WHERE scope = ? AND room_type_key = ?', [scope, roomTypeKey]);

  await db.query(
    `INSERT INTO field_definitions (scope, room_type_key, slug, label, field_type, catalog_type, field_unit, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [scope, roomTypeKey, slug, label, field_type, catalogType, field_unit || null, c]
  );

  res.redirect(redirectTo);
}

router.get('/room-types/:slug/fields', asyncHandler(async (req, res) => {
  const [[roomType]] = await db.query('SELECT * FROM room_types WHERE slug = ?', [req.params.slug]);
  if (!roomType) return res.status(404).render('error', { message: 'Tipo stanza non trovato' });
  const [fields] = await db.query('SELECT * FROM field_definitions WHERE scope = ? AND room_type_key = ? ORDER BY sort_order, id', ['room', req.params.slug]);
  const [catalogTypes] = await db.query('SELECT * FROM catalog_types ORDER BY label');
  res.render('admin/field-list', {
    scopeLabel: `Campi: ${roomType.label}`,
    fields,
    fieldTypes: FIELD_TYPES,
    catalogTypes,
    formAction: `/admin/room-types/${roomType.slug}/fields`,
    backLink: '/admin/room-types',
  });
}));

router.post('/room-types/:slug/fields', asyncHandler(async (req, res) => {
  await addFieldDefinition(req, res, 'room', req.params.slug, `/admin/room-types/${req.params.slug}/fields`);
}));

router.get('/unit-fields', asyncHandler(async (req, res) => {
  const [fields] = await db.query("SELECT * FROM field_definitions WHERE scope = 'unit' ORDER BY sort_order, id");
  const [catalogTypes] = await db.query('SELECT * FROM catalog_types ORDER BY label');
  res.render('admin/field-list', {
    scopeLabel: 'Caratteristiche unità',
    fields,
    fieldTypes: FIELD_TYPES,
    catalogTypes,
    formAction: '/admin/unit-fields',
    backLink: '/admin',
  });
}));

router.post('/unit-fields', asyncHandler(async (req, res) => {
  await addFieldDefinition(req, res, 'unit', null, '/admin/unit-fields');
}));

router.post('/fields/:id/delete', asyncHandler(async (req, res) => {
  const [[field]] = await db.query('SELECT * FROM field_definitions WHERE id = ?', [req.params.id]);
  if (!field) return res.status(404).render('error', { message: 'Campo non trovato' });
  await db.query('DELETE FROM field_definitions WHERE id = ?', [req.params.id]);
  const redirectTo = field.scope === 'unit' ? '/admin/unit-fields' : `/admin/room-types/${field.room_type_key}/fields`;
  res.redirect(redirectTo);
}));

function fieldListUrl(field) {
  return field.scope === 'unit' ? '/admin/unit-fields' : `/admin/room-types/${field.room_type_key}/fields`;
}

// Cambia l'ordine di un campo (su/giù) all'interno del suo elenco (stesso tipo di stanza o caratteristiche unità).
// Riscrive sort_order per tutti i campi dell'elenco, così l'ordine resta coerente anche se i valori erano uguali.
router.post('/fields/:id/move', asyncHandler(async (req, res) => {
  const [[field]] = await db.query('SELECT * FROM field_definitions WHERE id = ?', [req.params.id]);
  if (!field) return res.status(404).render('error', { message: 'Campo non trovato' });

  const [siblings] = field.room_type_key == null
    ? await db.query('SELECT id FROM field_definitions WHERE scope = ? AND room_type_key IS NULL ORDER BY sort_order, id', [field.scope])
    : await db.query('SELECT id FROM field_definitions WHERE scope = ? AND room_type_key = ? ORDER BY sort_order, id', [field.scope, field.room_type_key]);

  const ids = siblings.map(s => s.id);
  const idx = ids.indexOf(field.id);
  const target = req.body.direction === 'up' ? idx - 1 : idx + 1;
  if (idx !== -1 && target >= 0 && target < ids.length) {
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
  }
  for (let i = 0; i < ids.length; i++) {
    await db.query('UPDATE field_definitions SET sort_order = ? WHERE id = ?', [i, ids[i]]);
  }
  res.redirect(`${fieldListUrl(field)}#field-${field.id}`);
}));

// Modifica di un campo esistente. La chiave (slug) resta invariata, così i valori già salvati restano collegati.
router.get('/fields/:id/edit', asyncHandler(async (req, res) => {
  const [[field]] = await db.query('SELECT * FROM field_definitions WHERE id = ?', [req.params.id]);
  if (!field) return res.status(404).render('error', { message: 'Campo non trovato' });
  const [catalogTypes] = await db.query('SELECT * FROM catalog_types ORDER BY label');
  res.render('admin/field-edit', { field, fieldTypes: FIELD_TYPES, catalogTypes, backLink: fieldListUrl(field) });
}));

router.post('/fields/:id/edit', asyncHandler(async (req, res) => {
  const [[field]] = await db.query('SELECT * FROM field_definitions WHERE id = ?', [req.params.id]);
  if (!field) return res.status(404).render('error', { message: 'Campo non trovato' });

  const { label, field_type, field_unit } = req.body;
  const typeInfo = FIELD_TYPES.find(t => t.value === field_type);
  if (!label || !label.trim() || !typeInfo) return res.redirect(`/admin/fields/${field.id}/edit`);

  const catalogType = await resolveCatalogType(typeInfo, req.body);
  await db.query(
    'UPDATE field_definitions SET label = ?, field_type = ?, catalog_type = ?, field_unit = ? WHERE id = ?',
    [label.trim(), field_type, catalogType, field_unit || null, field.id]
  );
  res.redirect(`${fieldListUrl(field)}#field-${field.id}`);
}));

// ---------- Utenti ----------
router.get('/users', asyncHandler(async (req, res) => {
  const [users] = await db.query('SELECT id, name, email, role, created_at FROM users ORDER BY id');
  res.render('admin/users', { users });
}));

router.post('/users', asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  try {
    await db.query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name, email, hash, role]);
  } catch (e) {
    // email duplicata etc.
  }
  res.redirect('/admin/users');
}));

router.post('/users/:id/delete', asyncHandler(async (req, res) => {
  if (Number(req.params.id) === req.session.user.id) return res.redirect('/admin/users');
  await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.redirect('/admin/users');
}));

// ---------- Catalogo opzioni ----------
router.get('/catalog', asyncHandler(async (req, res) => {
  const [items] = await db.query('SELECT type, label FROM catalog_types ORDER BY label');
  res.render('admin/catalog-list', { items });
}));

router.post('/catalog', asyncHandler(async (req, res) => {
  const { label } = req.body;
  const type = slugify(label);
  if (type && label) {
    await db.query('INSERT IGNORE INTO catalog_types (type, label) VALUES (?, ?)', [type, label]);
  }
  res.redirect('/admin/catalog');
}));

router.get('/catalog/:type', asyncHandler(async (req, res) => {
  const [[catalogItem]] = await db.query('SELECT * FROM catalog_types WHERE type = ?', [req.params.type]);
  if (!catalogItem) return res.status(404).render('error', { message: 'Voce di catalogo non trovata' });
  const [options] = await db.query('SELECT * FROM catalog_options WHERE catalog_type = ? ORDER BY sort_order, id', [req.params.type]);
  res.render('admin/catalog-detail', { catalogItem, options, maxOptions: CATALOG_ITEMS.MAX_OPTIONS });
}));

router.post('/catalog/:type/options', upload.single('photo'), asyncHandler(async (req, res) => {
  const [[{ c }]] = await db.query('SELECT COUNT(*) c FROM catalog_options WHERE catalog_type = ?', [req.params.type]);
  if (c >= CATALOG_ITEMS.MAX_OPTIONS) {
    return res.status(400).render('error', { message: `Massimo ${CATALOG_ITEMS.MAX_OPTIONS} opzioni per voce` });
  }
  const photoPath = req.file ? '/uploads/' + req.file.filename : null;
  await db.query(
    'INSERT INTO catalog_options (catalog_type, label, fornitore, photo_path, sort_order) VALUES (?, ?, ?, ?, ?)',
    [req.params.type, req.body.label, req.body.fornitore || null, photoPath, c]
  );
  res.redirect(`/admin/catalog/${req.params.type}`);
}));

// Modifica di un'opzione esistente (label, fornitore e, opzionalmente, nuova foto)
router.post('/catalog/options/:id', upload.single('photo'), asyncHandler(async (req, res) => {
  const [[option]] = await db.query('SELECT * FROM catalog_options WHERE id = ?', [req.params.id]);
  if (!option) return res.status(404).render('error', { message: 'Opzione non trovata' });
  const photoPath = req.file ? '/uploads/' + req.file.filename : option.photo_path;
  await db.query(
    'UPDATE catalog_options SET label = ?, fornitore = ?, photo_path = ? WHERE id = ?',
    [req.body.label, req.body.fornitore || null, photoPath, option.id]
  );
  res.redirect(`/admin/catalog/${option.catalog_type}`);
}));

router.post('/catalog/options/:id/delete', asyncHandler(async (req, res) => {
  const [[option]] = await db.query('SELECT catalog_type FROM catalog_options WHERE id = ?', [req.params.id]);
  await db.query('DELETE FROM catalog_options WHERE id = ?', [req.params.id]);
  res.redirect(`/admin/catalog/${option.catalog_type}`);
}));

module.exports = router;
