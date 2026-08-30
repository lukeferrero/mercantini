const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db/init');
const { getRoomFields, getUnitFields, loadSavedValues, loadAttachmentsByField } = require('../services/fields');
const { getProjectForUnit, getProjectForRoom } = require('../services/projects');
const { requireWrite } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

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
router.get('/', asyncHandler(async (req, res) => {
  const [projects] = await db.query('SELECT * FROM projects ORDER BY created_at DESC');
  const unitsByProject = {};
  for (const p of projects) {
    const [units] = await db.query('SELECT * FROM units WHERE project_id = ? ORDER BY id', [p.id]);
    unitsByProject[p.id] = units;
  }
  res.render('app/home', { projects, unitsByProject, user: req.session.user || null });
}));

// ---------- Dettaglio unità ----------
router.get('/units/:id', asyncHandler(async (req, res) => {
  const [[unit]] = await db.query('SELECT * FROM units WHERE id = ?', [req.params.id]);
  if (!unit) return res.status(404).render('error', { message: 'Unità non trovata' });
  const [rooms] = await db.query('SELECT * FROM rooms WHERE unit_id = ? ORDER BY id', [unit.id]);
  const project = await getProjectForUnit(db, unit.id);

  const fields = await getUnitFields(db);
  const savedValues = await loadSavedValues(db, 'unit_fields', 'unit_id', unit.id);
  const attachmentsByField = await loadAttachmentsByField(db, 'unit_id', unit.id);

  res.render('app/unit', { unit, project, rooms, fields, savedValues, attachmentsByField, user: req.session.user || null });
}));

// ---------- Dettaglio stanza (form dinamico) ----------
router.get('/rooms/:id', asyncHandler(async (req, res) => {
  const [[room]] = await db.query('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
  if (!room) return res.status(404).render('error', { message: 'Stanza non trovata' });

  const project = await getProjectForRoom(db, room.id);
  const fields = await getRoomFields(db, room.room_type);
  const savedValues = await loadSavedValues(db, 'room_fields', 'room_id', room.id);
  const attachmentsByField = await loadAttachmentsByField(db, 'room_id', room.id);

  const user = req.session.user || null;

  res.render('app/room', {
    room,
    project,
    fields,
    savedValues,
    attachmentsByField,
    user,
    canEdit: !!user && ['admin', 'editor'].includes(user.role),
  });
}));

// ---------- Salvataggio campi (editor/admin) ----------
router.post('/rooms/:id/fields', requireWrite, asyncHandler(async (req, res) => {
  const [[room]] = await db.query('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
  if (!room) return res.status(404).json({ error: 'Stanza non trovata' });

  const roomFields = await getRoomFields(db, room.room_type);
  const validKeys = new Set(roomFields.map(f => f.key));

  for (const [key, value] of Object.entries(req.body)) {
    if (!validKeys.has(key)) continue;
    const stored = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    await db.query(
      `INSERT INTO room_fields (room_id, field_key, value, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)`,
      [room.id, key, stored, req.session.user.id]
    );
  }

  res.json({ ok: true });
}));

// ---------- Upload foto/pdf/file generico per un campo (editor/admin) ----------
router.post('/rooms/:id/upload', requireWrite, upload.single('file'), asyncHandler(async (req, res) => {
  const [[room]] = await db.query('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
  if (!room) return res.status(404).json({ error: 'Stanza non trovata' });
  if (!req.file) return res.status(400).json({ error: 'Nessun file' });

  let kind = 'photo';
  if (req.body.kind === 'pdf') kind = 'pdf';
  else if (req.body.kind === 'file') kind = 'file';

  const filePath = '/uploads/' + req.file.filename;

  await db.query(
    'INSERT INTO attachments (room_id, field_key, kind, file_path, original_name, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
    [room.id, req.body.field_key || null, kind, filePath, req.file.originalname, req.session.user.id]
  );

  res.json({ ok: true, path: filePath, original_name: req.file.originalname });
}));

// ---------- Eliminazione allegato di una stanza (editor/admin) ----------
router.post('/rooms/:id/attachments/:attachmentId/delete', requireWrite, asyncHandler(async (req, res) => {
  const [[attachment]] = await db.query('SELECT * FROM attachments WHERE id = ? AND room_id = ?', [req.params.attachmentId, req.params.id]);
  if (!attachment) return res.status(404).json({ error: 'Allegato non trovato' });

  await db.query('DELETE FROM attachments WHERE id = ?', [attachment.id]);

  // rimuovo anche il file fisico dal disco, se presente
  const filePath = path.join(__dirname, '..', 'public', attachment.file_path.replace(/^\//, ''));
  fs.unlink(filePath, () => {}); // non blocco la risposta se il file non esiste già

  res.json({ ok: true });
}));

module.exports = router;
