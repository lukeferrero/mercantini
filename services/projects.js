// Helper per risalire al progetto "proprietario" di un'unità o di una stanza,
// usato per mostrare il banner del progetto (immagine + nome) fisso in cima
// a tutte le pagine di quel progetto.

async function getProjectForUnit(db, unitId) {
  const [[project]] = await db.query(
    `SELECT p.* FROM projects p JOIN units u ON u.project_id = p.id WHERE u.id = ?`,
    [unitId]
  );
  return project || null;
}

async function getProjectForRoom(db, roomId) {
  const [[project]] = await db.query(
    `SELECT p.* FROM projects p
     JOIN units u ON u.project_id = p.id
     JOIN rooms r ON r.unit_id = u.id
     WHERE r.id = ?`,
    [roomId]
  );
  return project || null;
}

module.exports = { getProjectForUnit, getProjectForRoom };
