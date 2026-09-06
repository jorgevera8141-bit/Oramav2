const pool = require('../config/database');

// Single append-only event stream shared by every module that has an approval
// workflow (promotions, social-posts). One row per create / edit / state change.
async function logBitacora({ entidadTipo, entidadId, accion, actorNombre, actorTipo, estadoAnterior, estadoNuevo, detalle }, db = pool) {
  await db.query(
    `INSERT INTO bitacora (entidad_tipo, entidad_id, accion, actor_nombre, actor_tipo, estado_anterior, estado_nuevo, detalle)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [entidadTipo, entidadId, accion, actorNombre, actorTipo, estadoAnterior || null, estadoNuevo || null, detalle ? JSON.stringify(detalle) : null]
  );
}

// Resolve a staff member's role for non-PIN-gated actions (create / edit), where
// there is no verifyStaffPin call to return it. Gated actions use the staff row
// that verifyStaffPin already returns instead of calling this.
async function getStaffTipo(nombre, db = pool) {
  const { rows } = await db.query('SELECT tipo FROM staff WHERE nombre = $1', [nombre]);
  return rows[0]?.tipo || 'staff';
}

module.exports = { logBitacora, getStaffTipo };
