const pool = require('../../config/database');
const { hashPin } = require('../../shared/pin-hash');
const { clearPinLock } = require('../../shared/pin-auth');
const { logBitacora } = require('../../shared/audit');

const PASSCODE_MIN = 4;
const PASSCODE_MAX = 64;
const PIN_PATTERN = /^\d{4,10}$/;
const NAME_MIN = 2;
const NAME_MAX = 60;
const TIPOS = ['management', 'staff'];

function badRequest(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function assertPin(pin) {
  if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) throw badRequest('El PIN debe tener de 4 a 10 dígitos.');
}

async function findPerson(staffId, db) {
  const { rows } = await db.query('SELECT id, nombre, tipo, activo FROM staff WHERE id = $1', [staffId]);
  if (!rows[0]) throw badRequest('No se encontró a esa persona.', 404);
  return rows[0];
}

const audit = (actor, entry, db) => logBitacora({ actorNombre: actor.nombre, actorTipo: actor.tipo, ...entry }, db);

async function getAccessStatus(db = pool, store, { forceEnv = false } = {}) {
  const info = store.info();
  const source = forceEnv ? 'env_forced' : (store.hasPasscode() ? 'pos' : 'env');
  const { rows } = await db.query('SELECT id, nombre, tipo, activo FROM staff ORDER BY nombre');
  return {
    gate: { source, changed_at: info ? info.changedAt : null, changed_by: info ? info.changedBy : null },
    staff: rows
  };
}

async function changeGatePasscode({ passcode }, actor, { db = pool, store }) {
  if (typeof passcode !== 'string' || passcode.trim().length < PASSCODE_MIN || passcode.length > PASSCODE_MAX) {
    throw badRequest(`El código de acceso debe tener entre ${PASSCODE_MIN} y ${PASSCODE_MAX} caracteres.`);
  }
  await store.set(db, passcode, actor.nombre);
  await audit(actor, { entidadTipo: 'acceso', entidadId: 0, accion: 'cambiar_codigo' }, db);
}

async function changeStaffPin({ staffId, pin }, actor, db = pool) {
  assertPin(pin);
  const person = await findPerson(staffId, db);
  await db.query('UPDATE staff SET pin = $1 WHERE id = $2', [await hashPin(pin), person.id]);
  clearPinLock(person.nombre);
  await audit(actor, { entidadTipo: 'staff', entidadId: person.id, accion: 'cambiar_pin', detalle: { persona: person.nombre } }, db);
}

async function createStaff({ nombre, tipo, pin }, actor, db = pool) {
  const name = typeof nombre === 'string' ? nombre.trim() : '';
  if (name.length < NAME_MIN || name.length > NAME_MAX) throw badRequest(`El nombre debe tener entre ${NAME_MIN} y ${NAME_MAX} caracteres.`);
  if (!TIPOS.includes(tipo)) throw badRequest('El rol debe ser gerente o staff.');
  assertPin(pin);
  const { rows: same } = await db.query('SELECT id FROM staff WHERE LOWER(nombre) = LOWER($1)', [name]);
  if (same.length) throw badRequest('Ya hay una persona con ese nombre.', 409);
  const { rows } = await db.query('INSERT INTO staff (nombre, pin, tipo) VALUES ($1, $2, $3) RETURNING id', [name, await hashPin(pin), tipo]);
  await audit(actor, { entidadTipo: 'staff', entidadId: rows[0].id, accion: 'crear_persona', detalle: { persona: name, rol: tipo } }, db);
  return { id: rows[0].id, nombre: name, tipo };
}

async function setStaffActive({ staffId, activo }, actor, db = pool) {
  const person = await findPerson(staffId, db);
  if (!activo) {
    if (person.id === actor.id) throw badRequest('No puedes desactivarte a ti mismo.');
    if (person.tipo === 'management' && person.activo === 1) {
      const { rows: [{ n }] } = await db.query("SELECT COUNT(*)::int AS n FROM staff WHERE tipo = 'management' AND activo = 1 AND id <> $1", [person.id]);
      if (n < 1) throw badRequest('Debe quedar al menos un gerente activo.');
    }
  }
  await db.query('UPDATE staff SET activo = $1 WHERE id = $2', [activo ? 1 : 0, person.id]);
  await audit(actor, {
    entidadTipo: 'staff', entidadId: person.id, accion: activo ? 'reactivar' : 'desactivar',
    estadoAnterior: person.activo === 1 ? 'activo' : 'inactivo', estadoNuevo: activo ? 'activo' : 'inactivo',
    detalle: { persona: person.nombre }
  }, db);
}

module.exports = { getAccessStatus, changeGatePasscode, changeStaffPin, createStaff, setStaffActive };
