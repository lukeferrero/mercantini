const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db/init');
const { getRoomFields, getUnitFields, loadSavedValues, loadAttachmentsByField } = require('../services/fields');
const { requireWrite } = require('../middleware/auth');

const router = express.Router();
// Nessun login richiesto per la sola visualizzazione: il frontend in lettura è pubblico.
// La modifica (salvataggio campi, upload) resta protetta da requireWrite (editor/admin).

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'public', 'uploads'),
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, unique + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ---------- Lista progetti / unità ----------
router.get('/', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  const unitsByProject = {};
  for (const p of projects) {
    unitsByProject[p.id] = db.prepare('SELECT * FROM units WHERE project_id = ? ORDER BY id').all(p.id);
  }
  res.render('app/home', { projects, unitsByProject, user: req.session.user || null });
});

// ---------- Dettaglio unità ----------
router.get('/units/:id', (req, res) => {
  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).render('error', { message: 'Unità non trovata' });
  const rooms = db.prepare('SELECT * FROM rooms WHERE unit_id = ? ORDER BY id').all(unit.id);

  const fields = getUnitFields(db);
  const savedValues = loadSavedValues(db, 'unit_fields', 'unit_id', unit.id);
  const attachmentsByField = loadAttachmentsByField(db, 'unit_id', unit.id);

  res.render('app/unit', { unit, rooms, fields, savedValues, attachmentsByField, user: req.session.user || null });
});

// ---------- Dettaglio stanza (form dinamico) ----------
router.get('/rooms/:id', (req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).render('error', { message: 'Stanza non trovata' });

  const fields = getRoomFields(db, room.room_type);
  const savedValues = loadSavedValues(db, 'room_fields', 'room_id', room.id);
  const attachmentsByField = loadAttachmentsByField(db, 'room_id', room.id);

  const user = req.session.user || null;

  res.render('app/room', {
    room,
    fields,
    savedValues,
    attachmentsByField,
    user,
    canEdit: !!user && ['admin', 'editor'].includes(user.role),
  });
});

// ---------- Salvataggio campi (editor/admin) ----------
router.post('/rooms/:id/fields', requireWrite, (req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Stanza non trovata' });

  const validKeys = new Set(getRoomFields(db, room.room_type).map(f => f.key));

  const upsert = db.prepare(`
    INSERT INTO room_fields (room_id, field_key, value, updated_by, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(room_id, field_key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `);

  const tx = db.transaction((body) => {
    for (const [key, value] of Object.entries(body)) {
      if (!validKeys.has(key)) continue;
      const stored = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
      upsert.run(room.id, key, stored, req.session.user.id);
    }
  });
  tx(req.body);

  res.json({ ok: true });
});

// ---------- Upload foto/pdf/file generico per un campo (editor/admin) ----------
router.post('/rooms/:id/upload', requireWrite, upload.single('file'), (req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Stanza non trovata' });
  if (!req.file) return res.status(400).json({ error: 'Nessun file' });

  let kind = 'photo';
  if (req.body.kind === 'pdf') kind = 'pdf';
  else if (req.body.kind === 'file') kind = 'file';

  const filePath = '/uploads/' + req.file.filename;

  db.prepare('INSERT INTO attachments (room_id, field_key, kind, file_path, original_name, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(room.id, req.body.field_key || null, kind, filePath, req.file.originalname, req.session.user.id);

  res.json({ ok: true, path: filePath, original_name: req.file.originalname });
});

// ---------- Eliminazione allegato di una stanza (editor/admin) ----------
router.post('/rooms/:id/attachments/:attachmentId/delete', requireWrite, (req, res) => {
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ? AND room_id = ?')
    .get(req.params.attachmentId, req.params.id);
  if (!attachment) return res.status(404).json({ error: 'Allegato non trovato' });

  db.prepare('DELETE FROM attachments WHERE id = ?').run(attachment.id);

  // rimuovo anche il file fisico dal disco, se presente
  const filePath = path.join(__dirname, '..', 'public', attachment.file_path.replace(/^\//, ''));
  fs.unlink(filePath, () => {}); // non blocco la risposta se il file non esiste già

  res.json({ ok: true });
});

module.exports = router;
