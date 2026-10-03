const pool = require('../config/database');
const { hashPin, checkPin, isHashedPin, matchesPlaintext } = require('./pin-hash');

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const PRUNE_THRESHOLD = 1000;

function authError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

// Counts wrong PINs per name (case-insensitive) across every endpoint that checks a PIN, so
// guessing a short PIN can't be spread over routes or addresses. In memory, like the rate
// limiter: enough for a single-instance deploy, and a restart only clears the locks.
function createPinGuard({ maxFailures = MAX_FAILURES, windowMs = LOCK_MS, now = Date.now } = {}) {
  const failures = new Map();
  const keyFor = (nombre) => String(nombre).trim().toLowerCase();

  function prune(currentTime) {
    for (const [key, entry] of failures) if (entry.resetAt <= currentTime) failures.delete(key);
  }

  return {
    assertNotLocked(nombre) {
      const entry = failures.get(keyFor(nombre));
      if (entry && entry.resetAt > now() && entry.count >= maxFailures) {
        throw authError('Demasiados intentos con este nombre. Espera unos minutos.', 429);
      }
    },
    recordFailure(nombre) {
      const currentTime = now();
      if (failures.size > PRUNE_THRESHOLD) prune(currentTime);
      const key = keyFor(nombre);
      const entry = failures.get(key);
      const live = entry && entry.resetAt > currentTime ? entry : { count: 0, resetAt: currentTime + windowMs };
      failures.set(key, { count: live.count + 1, resetAt: live.resetAt });
    },
    clear(nombre) {
      failures.delete(keyFor(nombre));
    }
  };
}

const defaultGuard = createPinGuard();

let dummyHash;
// Unknown names still cost one hash, so timing does not reveal which names exist.
async function spendHashTime(pin) {
  dummyHash = dummyHash || hashPin('0000');
  await checkPin(pin, await dummyHash);
}

async function pinMatches(pin, stored) {
  return isHashedPin(stored) ? checkPin(pin, stored) : matchesPlaintext(pin, stored);
}

async function verifyStaffPin(nombre, pin, requiredTipo, db = pool, guard = defaultGuard) {
  if (!nombre || !pin) {
    throw authError('Se requiere seleccionar tu nombre e ingresar tu PIN.', 401);
  }
  guard.assertNotLocked(nombre);
  const { rows } = await db.query(
    'SELECT id, nombre, tipo, idioma, activo, pin FROM staff WHERE nombre = $1',
    [nombre]
  );
  if (!rows.length) await spendHashTime(pin);
  let match = null;
  for (const row of rows) {
    if (await pinMatches(pin, row.pin)) { match = row; break; }
  }
  if (!match || !match.activo) {
    guard.recordFailure(nombre);
    throw authError('Nombre o PIN incorrectos.', 401);
  }
  guard.clear(nombre);
  // A PIN that was still stored as plain text is replaced by its hash the first time it is used.
  if (!isHashedPin(match.pin)) {
    await db.query('UPDATE staff SET pin = $1 WHERE id = $2', [await hashPin(pin), match.id]);
  }
  const staffMember = { id: match.id, nombre: match.nombre, tipo: match.tipo, idioma: match.idioma, activo: match.activo };
  const allowedTipos = requiredTipo ? (Array.isArray(requiredTipo) ? requiredTipo : [requiredTipo]) : null;
  if (allowedTipos && !allowedTipos.includes(staffMember.tipo)) {
    throw authError(`Esta acción requiere un rol de ${allowedTipos.join(' o ')}.`, 403);
  }
  return staffMember;
}

// Run at startup: hashes any PIN still stored as plain text. Idempotent; returns how many it changed.
async function upgradePlaintextPins(db = pool) {
  const { rows } = await db.query("SELECT id, pin FROM staff WHERE pin NOT LIKE 'scrypt$%'");
  for (const row of rows) {
    await db.query('UPDATE staff SET pin = $1 WHERE id = $2', [await hashPin(row.pin), row.id]);
  }
  return rows.length;
}

// A manager who sets a new PIN for someone also clears any lock left by earlier wrong tries.
function clearPinLock(nombre, guard = defaultGuard) {
  guard.clear(nombre);
}

module.exports = { verifyStaffPin, createPinGuard, upgradePlaintextPins, clearPinLock };
