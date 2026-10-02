// Café-wide gate: one shared passcode over HTTP Basic Auth, deny by default. Everything
// not on PUBLIC_ROUTES (the shell, static assets, /uploads and every /api route) needs the
// passcode. The loyalty page and its two endpoints stay open so customers can use them.
const crypto = require('crypto');

const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const PRUNE_THRESHOLD = 1000;

// Exact-match allowlist: paths are compared as written, so "/loyalty.html/", "//loyalty.html"
// or "/%2e/health" are not public.
const PUBLIC_ROUTES = [
  { method: 'GET', pattern: /^\/health$/ },
  { method: 'GET', pattern: /^\/loyalty\.html$/ },
  { method: 'GET', pattern: /^\/css\/orama-pro\.css$/ },
  { method: 'GET', pattern: /^\/css\/orama-loyalty\.css$/ },
  { method: 'GET', pattern: /^\/js\/orama-fx\.js$/ },
  { method: 'GET', pattern: /^\/js\/orama-loyalty\.js$/ },
  { method: 'GET', pattern: /^\/bg-coffee\.jpg$/ },
  { method: 'GET', pattern: /^\/api\/loyalty\/customers\/[^/]+$/ },
  { method: 'POST', pattern: /^\/api\/loyalty\/customers$/ }
];

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();
const matchesPasscode = (supplied, expected) => crypto.timingSafeEqual(digest(supplied), digest(expected));

function isPublic(method, path) {
  const verb = method === 'HEAD' ? 'GET' : method;
  return PUBLIC_ROUTES.some((route) => route.method === verb && route.pattern.test(path));
}

function suppliedPasscode(header) {
  if (typeof header !== 'string' || !header.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  return separator === -1 ? null : decoded.slice(separator + 1);
}

function createGate({ passcode, previous, isProduction = false, maxFailures = MAX_FAILURES, windowMs = FAILURE_WINDOW_MS, now = Date.now }) {
  if (!passcode) {
    if (isProduction) throw new Error('GATE_PASSCODE must be set in production');
    return (_req, _res, next) => next();
  }
  const accepted = [passcode, previous].filter(Boolean);
  const failures = new Map();

  const prune = (currentTime) => {
    for (const [ip, entry] of failures) if (entry.resetAt <= currentTime) failures.delete(ip);
  };

  return (req, res, next) => {
    const path = (req.originalUrl || req.url || req.path).split('?')[0];
    if (isPublic(req.method, path)) return next();

    const currentTime = now();
    if (failures.size > PRUNE_THRESHOLD) prune(currentTime);
    const key = req.ip || 'unknown';
    const entry = failures.get(key);
    const blocked = entry && entry.resetAt > currentTime && entry.count >= maxFailures;
    if (blocked) {
      res.set('Retry-After', Math.ceil((entry.resetAt - currentTime) / 1000));
      return res.status(429).json({ success: false, message: 'Demasiados intentos. Espera unos minutos.' });
    }

    const supplied = suppliedPasscode(req.headers.authorization);
    if (supplied !== null && accepted.some((candidate) => matchesPasscode(supplied, candidate))) return next();

    const current = entry && entry.resetAt > currentTime ? entry : { count: 0, resetAt: currentTime + windowMs };
    failures.set(key, { count: current.count + 1, resetAt: current.resetAt });
    res.set('WWW-Authenticate', 'Basic realm="Orama", charset="UTF-8"');
    return res.status(401).json({ success: false, message: 'Se requiere el código de acceso.' });
  };
}

module.exports = { createGate, PUBLIC_ROUTES };
