// Fixed-window, in-memory limiter keyed by client address. Enough to stop scripted
// phone enumeration and PIN guessing on a single-instance deploy; swap for a shared
// store if the app ever runs on more than one instance. Behind Railway's proxy the
// client address comes from `trust proxy` (see app.js).
const PRUNE_THRESHOLD = 1000;

function createRateLimiter({ windowMs, max, message, now = Date.now }) {
  const hits = new Map();

  function prune(currentTime) {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= currentTime) hits.delete(key);
    }
  }

  return (req, res, next) => {
    const currentTime = now();
    if (hits.size > PRUNE_THRESHOLD) prune(currentTime);

    const key = req.ip || 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= currentTime) {
      entry = { count: 0, resetAt: currentTime + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.set('Retry-After', Math.ceil((entry.resetAt - currentTime) / 1000));
      return res.status(429).json({ success: false, message });
    }
    return next();
  };
}

module.exports = { createRateLimiter };
