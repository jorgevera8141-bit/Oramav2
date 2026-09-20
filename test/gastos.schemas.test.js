const test = require('node:test');
const assert = require('node:assert/strict');
const { createGastoSchema, GASTO_CATEGORIAS } = require('../src/modules/gastos/schemas');

test('createGastoSchema accepts a well-formed gasto', () => {
  const result = createGastoSchema.safeParse({
    categoria: 'Insumos',
    monto: 150.5,
    fecha: '2026-09-19'
  });
  assert.equal(result.success, true);
});

test('createGastoSchema rejects an unknown categoria', () => {
  const result = createGastoSchema.safeParse({
    categoria: 'NoExiste',
    monto: 100,
    fecha: '2026-09-19'
  });
  assert.equal(result.success, false);
});

test('createGastoSchema rejects a zero or negative monto', () => {
  const base = { categoria: 'Renta', fecha: '2026-09-19' };
  assert.equal(createGastoSchema.safeParse({ ...base, monto: 0 }).success, false);
  assert.equal(createGastoSchema.safeParse({ ...base, monto: -50 }).success, false);
});

test('createGastoSchema rejects a malformed fecha', () => {
  const base = { categoria: 'Servicios', monto: 200 };
  assert.equal(createGastoSchema.safeParse({ ...base, fecha: '19-09-2026' }).success, false);
  assert.equal(createGastoSchema.safeParse({ ...base, fecha: '2026/09/19' }).success, false);
  assert.equal(createGastoSchema.safeParse({ ...base, fecha: 'no-date' }).success, false);
});

test('createGastoSchema treats descripcion as optional', () => {
  const result = createGastoSchema.safeParse({
    categoria: 'Mantenimiento',
    monto: 75,
    fecha: '2026-09-19'
  });
  assert.equal(result.success, true);
  assert.equal(result.data.descripcion, undefined);
});

test('createGastoSchema rejects a descripcion over 200 characters', () => {
  const result = createGastoSchema.safeParse({
    categoria: 'Marketing',
    monto: 300,
    fecha: '2026-09-19',
    descripcion: 'x'.repeat(201)
  });
  assert.equal(result.success, false);
});

test('GASTO_CATEGORIAS exposes the expected set of categories', () => {
  assert.deepEqual(GASTO_CATEGORIAS, [
    'Insumos', 'Nomina', 'Renta', 'Servicios', 'Mantenimiento', 'Marketing', 'Otro'
  ]);
});
