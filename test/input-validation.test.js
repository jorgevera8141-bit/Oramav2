const test = require('node:test');
const assert = require('node:assert/strict');
const { numericIdParam } = require('../src/middleware/validate');
const { createMenuItemSchema, updateMenuItemSchema } = require('../src/modules/menu/schemas');
const { createMesaSchema } = require('../src/modules/mesas/schemas');
const { restockSchema } = require('../src/modules/inventory/schemas');
const seedMenu = require('../src/seeds/seed-menu.pg');

test('numericIdParam lets digit-only ids through and answers 400 for anything else', () => {
  let passed = 0;
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  numericIdParam({}, res, () => { passed += 1; }, '42');
  assert.equal(passed, 1);
  for (const bad of ['abc', '4x', '-1', '1.5', '', '1e3', 'NaN']) {
    const rejected = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    numericIdParam({}, rejected, () => { passed += 1; }, bad);
    assert.equal(rejected.statusCode, 400, `"${bad}" should be rejected`);
    assert.equal(rejected.body.success, false);
  }
  assert.equal(passed, 1);
});

test('menu item schema accepts what the menu screen sends and normalizes it', () => {
  const parsed = createMenuItemSchema.parse({ nombre: ' Latte ', categoria: 'Café', precio: '60', activo: 1 });
  assert.equal(parsed.nombre, 'Latte');
  assert.equal(parsed.precio, 60);
  assert.equal(parsed.activo, 1);
  assert.equal(createMenuItemSchema.parse({ nombre: 'x', categoria: 'y', precio: 10, activo: true }).activo, 1);
  assert.equal(createMenuItemSchema.parse({ nombre: 'x', categoria: 'y', precio: 10, activo: false }).activo, 0);
});

test('menu item schema rejects negative, non-numeric and absurd prices and empty names', () => {
  for (const precio of [-1, 'abc', NaN, Infinity, 1e9]) {
    assert.equal(createMenuItemSchema.safeParse({ nombre: 'x', categoria: 'y', precio }).success, false, `precio ${precio}`);
  }
  assert.equal(createMenuItemSchema.safeParse({ nombre: '  ', categoria: 'y', precio: 5 }).success, false);
});

test('menu update schema accepts partial changes but still validates the fields it gets', () => {
  assert.deepEqual(updateMenuItemSchema.parse({ precio: 45 }), { precio: 45 });
  assert.equal(updateMenuItemSchema.safeParse({ precio: -5 }).success, false);
  assert.equal(updateMenuItemSchema.safeParse({ activo: 7 }).success, false);
});

test('mesa schema requires a name and only allows known statuses', () => {
  assert.equal(createMesaSchema.safeParse({}).success, false);
  assert.equal(createMesaSchema.safeParse({ nombre: '' }).success, false);
  assert.equal(createMesaSchema.safeParse({ nombre: 'Mesa 4', status: 'rota' }).success, false);
  assert.deepEqual(createMesaSchema.parse({ nombre: ' Mesa 4 ', status: 'ocupada' }), { nombre: 'Mesa 4', status: 'ocupada' });
});

test('restock amount must be a positive finite number', () => {
  assert.equal(restockSchema.parse({ amount: 5 }).amount, 5);
  for (const amount of [0, -3, NaN, Infinity, '5', undefined]) {
    assert.equal(restockSchema.safeParse({ amount }).success, false, `amount ${amount}`);
  }
});

test('seedMenu refuses to run when the menu already has items, instead of duplicating it', async () => {
  const db = { query: async () => ({ rows: [{ count: 12 }] }) };
  await assert.rejects(() => seedMenu(db), (error) => error.statusCode === 409);
});
