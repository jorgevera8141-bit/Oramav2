// Staff PINs are stored as salted scrypt hashes (`scrypt$N$salt$hash`), never as the PIN itself.
// scrypt ships with Node, so there is no extra dependency. A PIN is short, so the hash alone is
// not enough: pin-auth.js also locks a name after repeated wrong PINs.
const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

const PREFIX = 'scrypt';
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const MAX_COST = 1 << 20;

const isHashedPin = (stored) => typeof stored === 'string' && stored.startsWith(`${PREFIX}$`);

async function derive(pin, salt, cost) {
  return scrypt(String(pin), salt, KEY_BYTES, { N: cost, r: BLOCK_SIZE, p: PARALLELISM, maxmem: 128 * cost * BLOCK_SIZE * 2 });
}

async function hashPin(pin) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await derive(pin, salt, COST);
  return [PREFIX, COST, salt.toString('base64'), key.toString('base64')].join('$');
}

// False for anything that is not a well-formed hash of this PIN; never throws on bad stored data.
async function checkPin(pin, stored) {
  if (!isHashedPin(stored)) return false;
  const [, costText, saltText, keyText] = stored.split('$');
  const cost = Number(costText);
  if (!Number.isInteger(cost) || cost < 2 || cost > MAX_COST || (cost & (cost - 1)) !== 0 || !saltText || !keyText) return false;
  try {
    const expected = Buffer.from(keyText, 'base64');
    const actual = await derive(pin, Buffer.from(saltText, 'base64'), cost);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// Constant-time comparison for the legacy plaintext rows that have not been upgraded yet.
function matchesPlaintext(pin, stored) {
  const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();
  return crypto.timingSafeEqual(digest(pin), digest(stored));
}

module.exports = { hashPin, checkPin, isHashedPin, matchesPlaintext };
