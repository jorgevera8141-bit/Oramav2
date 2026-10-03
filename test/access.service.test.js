const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPin, isHashedPin } = require('../src/shared/pin-hash');
const { verifyStaffPin } = require('../src/shared/pin-auth');
const { createGateStore } = require('../src/shared/gate-store');
const access = require('../src/modules/access/service');

// An in-memory stand-in for the staff table, the bitácora and gate_access.
async function fakeDb(people = []) {
  const db = { staff: [], audit: [], nextId: 1, gate: null };
  for (const p of people) db.staff.push({ id: db.nextId++, idioma: 'es', activo: 1, ...p, pin: await hashPin(p.pin) });
  db.query = async (sql, params = []) => {
    if (/FROM staff WHERE nombre = \$1/.test(sql)) return { rows: db.staff.filter((r) => r.nombre === params[0]).map((r) => ({ ...r })) };
    if (/SELECT id, nombre, tipo, activo FROM staff ORDER BY/.test(sql)) return { rows: db.staff.map(({ id, nombre, tipo, activo }) => ({ id, nombre, tipo, activo })) };
    if (/SELECT id, nombre, tipo, activo FROM staff WHERE id = \$1/.test(sql)) return { rows: db.staff.filter((r) => r.id === params[0]).map(({ id, nombre, tipo, activo }) => ({ id, nombre, tipo, activo })) };
    if (/LOWER\(nombre\) = LOWER\(\$1\)/.test(sql)) return { rows: db.staff.filter((r) => r.nombre.toLowerCase() === params[0].toLowerCase()).map((r) => ({ id: r.id })) };
    if (/COUNT\(\*\)::int AS n FROM staff WHERE tipo = 'management'/.test(sql)) return { rows: [{ n: db.staff.filter((r) => r.tipo === 'management' && r.activo === 1 && r.id !== params[0]).length }] };
    if (/INSERT INTO staff/.test(sql)) { const row = { id: db.nextId++, nombre: params[0], pin: params[1], tipo: params[2], idioma: 'es', activo: 1 }; db.staff.push(row); return { rows: [{ id: row.id }] }; }
    if (/UPDATE staff SET pin = \$1 WHERE id = \$2/.test(sql)) { db.staff.find((r) => r.id === params[1]).pin = params[0]; return { rows: [] }; }
    if (/UPDATE staff SET activo = \$1 WHERE id = \$2/.test(sql)) { db.staff.find((r) => r.id === params[1]).activo = params[0]; return { rows: [] }; }
    if (/INSERT INTO bitacora/.test(sql)) { db.audit.push(params); return { rows: [] }; }
    if (/INSERT INTO gate_access/.test(sql)) { db.gate = { hash: params[0], by: params[1] }; return { rows: [] }; }
    return { rows: [] };
  };
  return db;
}
const manager = (db) => ({ id: db.staff[0].id, nombre: db.staff[0].nombre, tipo: 'management' });
const rejectsWith = (promise, statusCode) => assert.rejects(promise, (error) => error.statusCode === statusCode);

test('status says where the passcode comes from and lists staff without any PIN', async () => {
  const db = await fakeDb([{ nombre: 'Ana', pin: '1234', tipo: 'management' }, { nombre: 'Luis', pin: '4321', tipo: 'staff' }]);
  const store = createGateStore();
  let status = await access.getAccessStatus(db, store, { forceEnv: false });
  assert.equal(status.gate.source, 'env');
  assert.deepEqual(status.staff.map((p) => p.nombre), ['Ana', 'Luis']);
  assert.ok(status.staff.every((p) => !('pin' in p)));
  await store.set(db, 'new-code', 'Ana');
  status = await access.getAccessStatus(db, store, { forceEnv: false });
  assert.equal(status.gate.source, 'pos');
  assert.equal(status.gate.changed_by, 'Ana');
  assert.equal((await access.getAccessStatus(db, store, { forceEnv: true })).gate.source, 'env_forced');
});

test('changeGatePasscode saves a hash, takes effect, and logs the change without the passcode', async () => {
  const db = await fakeDb([{ nombre: 'Ana', pin: '1234', tipo: 'management' }]);
  const store = createGateStore();
  await access.changeGatePasscode({ passcode: 'cafe-orama' }, manager(db), { db, store });
  assert.ok(isHashedPin(db.gate.hash));
  assert.equal(await store.check('cafe-orama'), true);
  assert.equal(db.audit.length, 1);
  assert.ok(!JSON.stringify(db.audit).includes('cafe-orama'), 'the audit trail never holds the passcode');
  assert.match(JSON.stringify(db.audit[0]), /cambiar_codigo/);
});

test('changeGatePasscode refuses a passcode that is too short, blank or too long', async () => {
  const db = await fakeDb([{ nombre: 'Ana', pin: '1234', tipo: 'management' }]);
  const store = createGateStore();
  for (const bad of ['', '   ', 'abc', '    a   ', 'x'.repeat(65), undefined, 1234]) {
    await rejectsWith(access.changeGatePasscode({ passcode: bad }, manager(db), { db, store }), 400);
  }
  assert.equal(store.hasPasscode(), false);
  await access.changeGatePasscode({ passcode: 'abcd' }, manager(db), { db, store });
});

test('changeStaffPin sets a new hashed PIN, validates it, and unlocks a locked person', async () => {
  const db = await fakeDb([{ nombre: 'Jefa', pin: '1234', tipo: 'management' }, { nombre: 'LockedLuis', pin: '4321', tipo: 'staff' }]);
  const luis = db.staff[1];
  for (const bad of ['abc', '123', '12345678901', '12 34', '', undefined]) await rejectsWith(access.changeStaffPin({ staffId: luis.id, pin: bad }, manager(db), db), 400);
  await rejectsWith(access.changeStaffPin({ staffId: 999, pin: '5555' }, manager(db), db), 404);
  for (let i = 0; i < 5; i += 1) await rejectsWith(verifyStaffPin('LockedLuis', '0000', null, db), 401);
  await rejectsWith(verifyStaffPin('LockedLuis', '4321', null, db), 429);
  await access.changeStaffPin({ staffId: luis.id, pin: '5555' }, manager(db), db);
  assert.ok(isHashedPin(luis.pin));
  assert.equal((await verifyStaffPin('LockedLuis', '5555', null, db)).id, luis.id, 'the new PIN works and the lock is cleared');
  await rejectsWith(verifyStaffPin('LockedLuis', '4321', null, db), 401);
  assert.ok(!JSON.stringify(db.audit).includes('5555'));
  assert.match(JSON.stringify(db.audit.at(-1)), /cambiar_pin/);
});

test('createStaff adds a person who can then use their PIN, and refuses duplicates and bad input', async () => {
  const db = await fakeDb([{ nombre: 'Ana', pin: '1234', tipo: 'management' }]);
  const created = await access.createStaff({ nombre: '  Eva  ', tipo: 'staff', pin: '654321' }, manager(db), db);
  assert.equal(db.staff.find((p) => p.id === created.id).nombre, 'Eva', 'the name is trimmed');
  assert.ok(isHashedPin(db.staff.find((p) => p.id === created.id).pin));
  assert.equal((await verifyStaffPin('Eva', '654321', null, db)).tipo, 'staff');
  await rejectsWith(access.createStaff({ nombre: 'eva', tipo: 'staff', pin: '111111' }, manager(db), db), 409);
  await rejectsWith(access.createStaff({ nombre: 'X', tipo: 'staff', pin: '111111' }, manager(db), db), 400);
  await rejectsWith(access.createStaff({ nombre: 'Zoe', tipo: 'boss', pin: '111111' }, manager(db), db), 400);
  await rejectsWith(access.createStaff({ nombre: 'Zoe', tipo: 'staff', pin: '12' }, manager(db), db), 400);
  assert.match(JSON.stringify(db.audit[0]), /crear_persona/);
});

test('setStaffActive deactivates and reactivates, but never yourself or the last active manager', async () => {
  const db = await fakeDb([{ nombre: 'Ana', pin: '1234', tipo: 'management' }, { nombre: 'Luis', pin: '4321', tipo: 'staff' }]);
  const [ana, luis] = db.staff;
  await rejectsWith(access.setStaffActive({ staffId: ana.id, activo: false }, manager(db), db), 400);
  await access.setStaffActive({ staffId: luis.id, activo: false }, manager(db), db);
  await rejectsWith(verifyStaffPin('Luis', '4321', null, db), 401);
  await access.setStaffActive({ staffId: luis.id, activo: true }, manager(db), db);
  assert.equal((await verifyStaffPin('Luis', '4321', null, db)).id, luis.id);
  await rejectsWith(access.setStaffActive({ staffId: 999, activo: false }, manager(db), db), 404);
  // With two active managers either can be deactivated by the other...
  const second = await access.createStaff({ nombre: 'Beto', tipo: 'management', pin: '999999' }, manager(db), db);
  await access.setStaffActive({ staffId: second.id, activo: false }, manager(db), db);
  await access.setStaffActive({ staffId: second.id, activo: true }, manager(db), db);
  await access.setStaffActive({ staffId: ana.id, activo: false }, { id: second.id, nombre: 'Beto', tipo: 'management' }, db);
  // ...but the last active manager can never be switched off, whoever asks.
  const outsider = { id: 9999, nombre: 'Fuera', tipo: 'management' };
  await rejectsWith(access.setStaffActive({ staffId: second.id, activo: false }, outsider, db), 400);
  assert.equal(db.staff.find((p) => p.id === second.id).activo, 1);
  assert.match(JSON.stringify(db.audit.map((a) => a[2])), /desactivar/);
  assert.match(JSON.stringify(db.audit.map((a) => a[2])), /reactivar/);
});

test('createStaff refuses names that carry markup, so a name can never become script in a screen', async () => {
  const db = await fakeDb([{ nombre: 'Ana', pin: '1234', tipo: 'management' }]);
  for (const bad of ['<img src=x onerror=alert(1)>', 'Eva<b>', 'a>b', '"><script>']) {
    await rejectsWith(access.createStaff({ nombre: bad, tipo: 'staff', pin: '111111' }, manager(db), db), 400);
  }
  assert.equal(db.staff.length, 1);
  await access.createStaff({ nombre: "María José O'Neil", tipo: 'staff', pin: '111111' }, manager(db), db);
});
