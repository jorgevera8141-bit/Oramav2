const pool = require('../config/database');

function authError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

async function verifyStaffPin(nombre, pin, requiredTipo) {
  if (!nombre || !pin) {
    throw authError('Se requiere seleccionar tu nombre e ingresar tu PIN.', 401);
  }
  const { rows } = await pool.query(
    'SELECT id, nombre, tipo, activo FROM staff WHERE nombre = $1 AND pin = $2',
    [nombre, pin]
  );
  const staffMember = rows[0];
  if (!staffMember || !staffMember.activo) {
    throw authError('Nombre o PIN incorrectos.', 401);
  }
  const allowedTipos = requiredTipo ? (Array.isArray(requiredTipo) ? requiredTipo : [requiredTipo]) : null;
  if (allowedTipos && !allowedTipos.includes(staffMember.tipo)) {
    throw authError(`Esta acción requiere un rol de ${allowedTipos.join(' o ')}.`, 403);
  }
  return staffMember;
}

module.exports = { verifyStaffPin };
