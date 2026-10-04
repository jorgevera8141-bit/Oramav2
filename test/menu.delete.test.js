const test = require('node:test');
const assert = require('node:assert/strict');
const { deleteMenuItem } = require('../src/modules/menu/service');

// A tiny stand-in for the database: one product, optionally used by promotions.
function fakeDb({ item = { id: 7, nombre: 'ROSCA' }, promos = [] } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
      if (/FROM menu_items/.test(sql) && /^\s*SELECT/i.test(sql)) return { rows: item && params[0] === item.id ? [item] : [] };
      if (/FROM promociones/.test(sql)) return { rows: promos };
      return { rows: [] };
    }
  };
}
const rejects = (promise, status, pattern) => assert.rejects(promise, (e) => e.statusCode === status && pattern.test(e.message));

test('deleting a product that nothing points at removes it and returns it', async () => {
  const db = fakeDb();
  const removed = await deleteMenuItem(db, 7);
  assert.equal(removed.nombre, 'ROSCA');
  assert.ok(db.calls.some((call) => call.startsWith('DELETE FROM')));
});

test('a product that does not exist is a 404, not a silent success', async () => {
  await rejects(deleteMenuItem(fakeDb(), 99), 404, /no encontrado/i);
});

test('a product used by a promotion is refused with a 409 that names the promotion and what to do', async () => {
  const db = fakeDb({ promos: [{ nombre: '2x1 Rosca' }, { nombre: 'Combo Reyes' }] });
  await rejects(deleteMenuItem(db, 7), 409, /ROSCA.*2x1 Rosca.*Combo Reyes.*inactivo/s);
  assert.equal(db.calls.some((call) => call.startsWith('DELETE FROM')), false, 'nothing is deleted');
});

test('one promotion reads in the singular', async () => {
  await rejects(deleteMenuItem(fakeDb({ promos: [{ nombre: '2x1 Rosca' }] }), 7), 409, /la promoción 2x1 Rosca/);
});
