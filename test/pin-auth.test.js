const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPin, checkPin, isHashedPin } = require('../src/shared/pin-hash');
const { verifyStaffPin, createPinGuard, upgradePlaintextPins } = require('../src/shared/pin-auth');

// A fake db that serves staff rows by nombre and records every statement, like the other service tests.
function fakeDb(rows) {
  const statements = [];
  return {
    statements,
    rows,
    async query(sql, params) {
      statements.push({ sql, params });
      if (/^\s*SELECT/i.test(sql) && /WHERE nombre = \$1/.test(sql)) return { rows: rows.filter((r) => r.nombre === params[0]).map((r) => ({ ...r })) };
      if (/^\s*SELECT/i.test(sql) && /NOT LIKE/.test(sql)) return { rows: rows.filter((r) => !isHashedPin(r.pin)).map((r) => ({ id: r.id, pin: r.pin })) };
      if (/^\s*UPDATE staff SET pin/i.test(sql)) { const row = rows.find((r) => r.id === params[1]); if (row) row.pin = params[0]; return { rows: [] }; }
      return { rows: [] };
    }
  };
}
const staff = async (over = {}) => ({ id: 1, nombre: 'Ana', tipo: 'management', idioma: 'es', activo: 1, pin: await hashPin('1234'), ...over });
const rejectsWith = (promise, statusCode) => assert.rejects(promise, (error) => error.statusCode === statusCode);

test('hashPin stores a salted scrypt hash, never the PIN, and checkPin only accepts the right one', async () => {
  const a = await hashPin('1234');
  const b = await hashPin('1234');
  assert.match(a, /^scrypt\$\d+\$/);
  assert.ok(!a.includes('1234'));
  assert.notEqual(a, b, 'a fresh salt each time');
  assert.equal(await checkPin('1234', a), true);
  assert.equal(await checkPin('1235', a), false);
  assert.equal(await checkPin('1234', 'scrypt$garbage'), false, 'a malformed hash is a mismatch, not a crash');
  assert.equal(await checkPin('1234', '1234'), false, 'plaintext is not a hash');
});

test('verifyStaffPin accepts the right PIN against a hash and never returns the PIN', async () => {
  const db = fakeDb([await staff()]);
  const member = await verifyStaffPin('Ana', '1234', null, db, createPinGuard());
  assert.deepEqual(Object.keys(member).sort(), ['activo', 'id', 'idioma', 'nombre', 'tipo']);
  assert.ok(!db.statements.some((s) => /pin = \$2/.test(s.sql)), 'the PIN is not compared inside SQL');
});

test('a wrong PIN, an unknown name and an inactive account all get the same 401', async () => {
  const db = fakeDb([await staff(), await staff({ id: 2, nombre: 'Luis', activo: 0 })]);
  const messages = [];
  for (const [name, pin] of [['Ana', '0000'], ['Nadie', '1234'], ['Luis', '1234']]) {
    await assert.rejects(verifyStaffPin(name, pin, null, db, createPinGuard()), (error) => { messages.push(error.message); return error.statusCode === 401; });
  }
  assert.equal(new Set(messages).size, 1, 'nothing reveals which part was wrong');
});

test('a missing name or PIN is a 401 and the role check still returns 403', async () => {
  const db = fakeDb([await staff({ tipo: 'staff' })]);
  await rejectsWith(verifyStaffPin('', '1234', null, db, createPinGuard()), 401);
  await rejectsWith(verifyStaffPin('Ana', '', null, db, createPinGuard()), 401);
  await rejectsWith(verifyStaffPin('Ana', '1234', 'management', db, createPinGuard()), 403);
});

test('two people with the same name are told apart by their PIN', async () => {
  const db = fakeDb([await staff({ id: 1, pin: await hashPin('1111') }), await staff({ id: 2, pin: await hashPin('2222') })]);
  assert.equal((await verifyStaffPin('Ana', '1111', null, db, createPinGuard())).id, 1);
  assert.equal((await verifyStaffPin('Ana', '2222', null, db, createPinGuard())).id, 2);
});

test('a legacy plaintext PIN still works once and is upgraded to a hash on the spot', async () => {
  const db = fakeDb([await staff({ pin: '1234' })]);
  await rejectsWith(verifyStaffPin('Ana', '9999', null, db, createPinGuard()), 401);
  assert.equal(db.rows[0].pin, '1234', 'a wrong PIN changes nothing');
  assert.equal((await verifyStaffPin('Ana', '1234', null, db, createPinGuard())).id, 1);
  assert.ok(isHashedPin(db.rows[0].pin), 'the row now holds a hash');
  assert.equal((await verifyStaffPin('Ana', '1234', null, db, createPinGuard())).id, 1, 'and still verifies');
});

test('five wrong PINs lock that name for 15 minutes, even for the right PIN; other names are unaffected', async () => {
  let time = 0;
  const guard = createPinGuard({ now: () => time });
  const db = fakeDb([await staff(), await staff({ id: 2, nombre: 'Eva' })]);
  for (let i = 0; i < 5; i += 1) await rejectsWith(verifyStaffPin('Ana', '0000', null, db, guard), 401);
  await rejectsWith(verifyStaffPin('Ana', '1234', null, db, guard), 429);
  assert.equal((await verifyStaffPin('Eva', '1234', null, db, guard)).id, 2, 'a different name is not locked');
  time = 15 * 60 * 1000 + 1;
  assert.equal((await verifyStaffPin('Ana', '1234', null, db, guard)).id, 1, 'the lock expires');
});

test('a correct PIN clears earlier failures, and the lock is case-insensitive on the name', async () => {
  const guard = createPinGuard();
  const db = fakeDb([await staff()]);
  for (let i = 0; i < 4; i += 1) await rejectsWith(verifyStaffPin('Ana', '0000', null, db, guard), 401);
  await verifyStaffPin('Ana', '1234', null, db, guard);
  for (let i = 0; i < 4; i += 1) await rejectsWith(verifyStaffPin('Ana', '0000', null, db, guard), 401);
  await verifyStaffPin('Ana', '1234', null, db, guard);
  for (let i = 0; i < 5; i += 1) await rejectsWith(verifyStaffPin(i % 2 ? 'ANA ' : 'ana', '0000', null, db, guard), 401);
  await rejectsWith(verifyStaffPin('Ana', '1234', null, db, guard), 429);
});

test('upgradePlaintextPins hashes every plaintext PIN once and leaves hashes alone', async () => {
  const already = await hashPin('4321');
  const db = fakeDb([{ id: 1, nombre: 'A', pin: '1234' }, { id: 2, nombre: 'B', pin: already }, { id: 3, nombre: 'C', pin: '987654' }]);
  assert.equal(await upgradePlaintextPins(db), 2);
  assert.ok(db.rows.every((r) => isHashedPin(r.pin)));
  assert.equal(db.rows[1].pin, already, 'an existing hash is untouched');
  assert.equal(await checkPin('987654', db.rows[2].pin), true);
  assert.equal(await upgradePlaintextPins(db), 0, 'running it again changes nothing');
});
