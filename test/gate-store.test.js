const test = require('node:test');
const assert = require('node:assert/strict');
const { createGateStore } = require('../src/shared/gate-store');
const { isHashedPin } = require('../src/shared/pin-hash');

// A fake db holding the single gate_access row, like the other service tests.
function fakeDb(initial = null) {
  const db = {
    row: initial,
    statements: [],
    async query(sql, params) {
      db.statements.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rows: db.row ? [{ ...db.row }] : [] };
      if (/INSERT INTO gate_access/i.test(sql)) { db.row = { passcode_hash: params[0], changed_at: new Date(), changed_by: params[1] }; return { rows: [] }; }
      return { rows: [] };
    }
  };
  return db;
}

test('a store with nothing saved has no passcode and accepts nothing', async () => {
  const store = createGateStore();
  await store.load(fakeDb());
  assert.equal(store.hasPasscode(), false);
  assert.equal(await store.check('anything'), false);
  assert.equal(store.info(), null);
});

test('set saves only a hash, and check accepts exactly that passcode', async () => {
  const db = fakeDb();
  const store = createGateStore();
  await store.set(db, 'orama2026', 'Ana');
  assert.ok(isHashedPin(db.row.passcode_hash));
  assert.ok(!JSON.stringify(db.statements).includes('orama2026'), 'the passcode itself is never sent to the database');
  assert.equal(store.hasPasscode(), true);
  assert.equal(await store.check('orama2026'), true);
  assert.equal(await store.check('Orama2026'), false, 'case-sensitive');
  assert.equal(await store.check('orama2027'), false);
  assert.equal(store.info().changedBy, 'Ana');
});

test('changing the passcode stops the old one working at once, even though it was cached', async () => {
  const db = fakeDb();
  const store = createGateStore();
  await store.set(db, 'first-code', 'Ana');
  assert.equal(await store.check('first-code'), true);
  assert.equal(await store.check('first-code'), true, 'second check is served from the cache');
  await store.set(db, 'second-code', 'Ana');
  assert.equal(await store.check('first-code'), false);
  assert.equal(await store.check('second-code'), true);
});

test('load picks up a saved passcode after a restart', async () => {
  const writer = createGateStore();
  const db = fakeDb();
  await writer.set(db, 'saved-code', 'Eva');
  const fresh = createGateStore();
  await fresh.load(db);
  assert.equal(fresh.hasPasscode(), true);
  assert.equal(await fresh.check('saved-code'), true);
  assert.equal(await fresh.check('nope'), false);
});

test('a cached approval expires', async () => {
  let time = 0;
  const db = fakeDb();
  const store = createGateStore({ now: () => time, cacheMs: 1000 });
  await store.set(db, 'code-1234', 'Ana');
  assert.equal(await store.check('code-1234'), true);
  time = 5000;
  assert.equal(await store.check('code-1234'), true, 'still true after expiry: it is re-verified, not just dropped');
  assert.equal(await store.check('wrong'), false);
});
