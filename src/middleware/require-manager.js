// Pay data (rates, payroll, every shift) is only served to a manager, who proves it on each request
// with their name and PIN. They travel in headers, not the query string, so a PIN never lands in a
// URL or in the request log; the name is URI-encoded because header values cannot carry every character.
// The check is the same verifyStaffPin as everywhere else, so the wrong-PIN lockout applies.
const { verifyStaffPin } = require('../shared/pin-auth');

function credentialsFromHeaders(req) {
  const rawName = req.get('x-actor-nombre');
  let nombre = null;
  try { nombre = rawName ? decodeURIComponent(rawName) : null; } catch { nombre = null; }
  return { nombre, pin: req.get('x-actor-pin') || null };
}

function createRequireManager(verify = verifyStaffPin) {
  return async (req, _res, next) => {
    try {
      const { nombre, pin } = credentialsFromHeaders(req);
      req.manager = await verify(nombre, pin, 'management');
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

// For routes that are public but show more to a manager: no credentials means "not a manager",
// wrong credentials is an error (never a silent downgrade).
function createManagerIfPresent(verify = verifyStaffPin) {
  return async (req) => {
    const { nombre, pin } = credentialsFromHeaders(req);
    if (!nombre && !pin) return null;
    return verify(nombre, pin, 'management');
  };
}

module.exports = {
  credentialsFromHeaders,
  createRequireManager,
  createManagerIfPresent,
  requireManager: createRequireManager(),
  managerIfPresent: createManagerIfPresent()
};
