// The café passcode can be changed from the POS. It is saved here, as a scrypt hash, in its own
// table (gate_access): never in orama_settings, because GET /api/settings returns every row of that
// table. Hashing is slow on purpose, so a passcode that checked out is remembered in memory (keyed by
// a SHA-256 of it) for a while; changing the passcode clears that memory at once.
const crypto = require('crypto');
const { hashPin, checkPin } = require('./pin-hash');

const CACHE_MS = 12 * 60 * 60 * 1000;
const MAX_CACHE = 500;

function createGateStore({ now = Date.now, cacheMs = CACHE_MS } = {}) {
  let record = null;
  const approved = new Map();
  const keyFor = (passcode) => crypto.createHash('sha256').update(String(passcode)).digest('hex');

  return {
    async load(db) {
      const { rows } = await db.query('SELECT passcode_hash, changed_at, changed_by FROM gate_access WHERE id = 1');
      record = rows[0] ? { hash: rows[0].passcode_hash, changedAt: rows[0].changed_at, changedBy: rows[0].changed_by } : null;
      approved.clear();
    },
    hasPasscode() {
      return record !== null;
    },
    info() {
      return record ? { changedAt: record.changedAt, changedBy: record.changedBy } : null;
    },
    async set(db, passcode, changedBy) {
      const hash = await hashPin(passcode);
      await db.query(
        `INSERT INTO gate_access (id, passcode_hash, changed_at, changed_by) VALUES (1, $1, NOW(), $2)
         ON CONFLICT (id) DO UPDATE SET passcode_hash = $1, changed_at = NOW(), changed_by = $2`,
        [hash, changedBy]
      );
      record = { hash, changedAt: new Date(), changedBy };
      approved.clear();
    },
    async check(passcode) {
      if (!record) return false;
      const key = keyFor(passcode);
      const until = approved.get(key);
      if (until && until > now()) return true;
      const ok = await checkPin(passcode, record.hash);
      if (ok) {
        if (approved.size >= MAX_CACHE) approved.clear();
        approved.set(key, now() + cacheMs);
      }
      return ok;
    }
  };
}

module.exports = { createGateStore, gateStore: createGateStore() };
