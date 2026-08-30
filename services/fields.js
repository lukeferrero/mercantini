// Helper condivisi per leggere le definizioni dei campi dinamici (per tipo di
// stanza o per le caratteristiche dell'unità) e i valori già salvati.
// Usato sia da routes/app.js (frontend) sia da routes/admin.js (backend).

function mapFieldDefs(db, rows) {
  return rows.map((f) => ({
    id: f.id,
    key: f.key,
    label: f.label,
    type: f.field_type,
    catalogType: f.catalog_type,
    unit: f.field_unit,
    options: f.catalog_type
      ? db.prepare('SELECT * FROM catalog_options WHERE catalog_type = ? ORDER BY sort_order, id').all(f.catalog_type)
      : null,
  }));
}

function getRoomFields(db, roomTypeKey) {
  const rows = db
    .prepare('SELECT * FROM field_definitions WHERE scope = ? AND room_type_key = ? ORDER BY sort_order, id')
    .all('room', roomTypeKey);
  return mapFieldDefs(db, rows);
}

function getUnitFields(db) {
  const rows = db
    .prepare("SELECT * FROM field_definitions WHERE scope = 'unit' ORDER BY sort_order, id")
    .all();
  return mapFieldDefs(db, rows);
}

function loadSavedValues(db, table, idColumn, idValue) {
  const rows = db.prepare(`SELECT field_key, value FROM ${table} WHERE ${idColumn} = ?`).all(idValue);
  const values = {};
  for (const row of rows) {
    try {
      values[row.field_key] = JSON.parse(row.value);
    } catch {
      values[row.field_key] = row.value;
    }
  }
  return values;
}

function loadAttachmentsByField(db, whereColumn, idValue) {
  const rows = db.prepare(`SELECT * FROM attachments WHERE ${whereColumn} = ?`).all(idValue);
  const byField = {};
  for (const a of rows) {
    (byField[a.field_key] = byField[a.field_key] || []).push(a);
  }
  return byField;
}

module.exports = { getRoomFields, getUnitFields, loadSavedValues, loadAttachmentsByField };
