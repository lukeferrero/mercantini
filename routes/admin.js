const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');
const db = require('../db/init');
const ROOM_FIELDS = require('../config/roomFields');
const CATALOG_ITEMS = require('../config/itemCatalog');
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
  const portoncinoOptions = db.prepare('SELECT * FROM catalog_options WHERE catalog_type = ? ORDER BY sort_order, id').all('portoncino_blindato');
  const manigliaOptions = db.prepare('SELECT * FROM catalog_options WHERE catalog_type = ? ORDER BY sort_order, id').all('maniglie');
  res.render('admin/unit', { unit, rooms, portoncinoOptions, manigliaOptions });
});

router.post('/units/:id', (req, res) => {
  const { name, mq, portoncino_tipo, portoncino_spioncino, portoncino_colore, maniglie_tipo, quadro_elettrico_note } = req.body;
  db.prepare(`UPDATE units SET name=?, mq=?, portoncino_tipo=?, portoncino_spioncino=?, portoncino_colore=?, maniglie_tipo=?, quadro_elettrico_note=? WHERE id=?`)
    .run(name, mq || null, portoncino_tipo, portoncino_spioncino, portoncino_colore, maniglie_tipo, quadro_elettrico_note, req.params.id);
  res.redirect(`/admin/units/${req.params.id}`);
});

router.post('/units/:id/delete', (req, res) => {
  const unit = db.prepare('SELECT project_id FROM units WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM units WHERE id = ?').run(req.params.id);
  res.redirect(`/admin/projects/${unit.project_id}`);
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
  res.render('admin/catalog-list', { items: CATALOG_ITEMS });
});

router.get('/catalog/:type', (req, res) => {
  const catalogItem = CATALOG_ITEMS.find(c => c.type === req.params.type);
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

router.post('/catalog/options/:id/delete', (req, res) => {
  const option = db.prepare('SELECT catalog_type FROM catalog_options WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM catalog_options WHERE id = ?').run(req.params.id);
  res.redirect(`/admin/catalog/${option.catalog_type}`);
});

module.exports = router;
