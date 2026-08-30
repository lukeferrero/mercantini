// Helper condivisi per leggere le definizioni dei campi dinamici (per tipo di
// stanza o per le caratteristiche dell'unità) e i valori già salvati.
// Usato sia da routes/app.js (frontend) sia da routes/admin.js (backend).

async function mapFieldDefs(db, rows) {
  const out = [];
  for (const f of rows) {
    let options = null;
    if (f.catalog_type) {
      const [opts] = await db.query('SELECT * FROM catalog_options WHERE catalog_type = ? ORDER BY sort_order, id', [f.catalog_type]);
      options = opts;
    }
    out.push({
      id: f.id,
      key: f.slug,
      label: f.label,
      type: f.field_type,
      catalogType: f.catalog_type,
      unit: f.field_unit,
      options,
    });
  }
  return out;
}

async function getRoomFields(db, roomTypeKey) {
  const [rows] = await db.query(
    'SELECT * FROM field_definitions WHERE scope = ? AND room_type_key = ? ORDER BY sort_order, id',
    ['room', roomTypeKey]
  );
  return mapFieldDefs(db, rows);
}

async function getUnitFields(db) {
  const [rows] = await db.query("SELECT * FROM field_definitions WHERE scope = 'unit' ORDER BY sort_order, id");
  return mapFieldDefs(db, rows);
}

async function loadSavedValues(db, table, idColumn, idValue) {
  const [rows] = await db.query(`SELECT field_key, value FROM ${table} WHERE ${idColumn} = ?`, [idValue]);
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

async function loadAttachmentsByField(db, whereColumn, idValue) {
  const [rows] = await db.query(`SELECT * FROM attachments WHERE ${whereColumn} = ?`, [idValue]);
  const byField = {};
  for (const a of rows) {
    (byField[a.field_key] = byField[a.field_key] || []).push(a);
  }
  return byField;
}

module.exports = { getRoomFields, getUnitFields, loadSavedValues, loadAttachmentsByField };
