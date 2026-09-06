const test = require('node:test');
const assert = require('node:assert/strict');
const { cerrarSchema, cancelarSchema, pagoSchema } = require('../src/modules/orders/schemas');

test('cerrarSchema accepts an empty body (barra "listo" sends none)', () => {
  const result = cerrarSchema.safeParse({});
  assert.equal(result.success, true);
});

test('cerrarSchema accepts a valid efectivo payload', () => {
  const result = cerrarSchema.safeParse({ payment_method: 'efectivo', amount_cash: 45.5 });
  assert.equal(result.success, true);
});

test('cerrarSchema accepts a valid mixto payload with both amounts', () => {
  const result = cerrarSchema.safeParse({ payment_method: 'mixto', amount_cash: 20, amount_card: 25.5 });
  assert.equal(result.success, true);
});

test('cerrarSchema rejects an unknown payment_method', () => {
  const result = cerrarSchema.safeParse({ payment_method: 'bitcoin' });
  assert.equal(result.success, false);
});

test('cerrarSchema rejects a negative amount', () => {
  const result = cerrarSchema.safeParse({ amount_cash: -10 });
  assert.equal(result.success, false);
});

test('cerrarSchema rejects notas over 500 characters', () => {
  const result = cerrarSchema.safeParse({ notas: 'x'.repeat(501) });
  assert.equal(result.success, false);
});

test('cancelarSchema accepts an empty body (motivo is optional)', () => {
  const result = cancelarSchema.safeParse({});
  assert.equal(result.success, true);
});

test('cancelarSchema accepts a motivo string', () => {
  const result = cancelarSchema.safeParse({ motivo: 'Cliente cambió de opinión' });
  assert.equal(result.success, true);
});

test('cancelarSchema rejects a motivo over 500 characters', () => {
  const result = cancelarSchema.safeParse({ motivo: 'x'.repeat(501) });
  assert.equal(result.success, false);
});

test('cerrarSchema accepts a split payment with a pagos array', () => {
  const result = cerrarSchema.safeParse({
    pagos: [
      { payment_method: 'efectivo', amount_cash: 40, persona_nombre: 'Persona 1' },
      { payment_method: 'mixto', amount_cash: 10, amount_card: 20, persona_nombre: 'Persona 2' }
    ]
  });
  assert.equal(result.success, true);
});

test('cerrarSchema rejects an empty pagos array', () => {
  const result = cerrarSchema.safeParse({ pagos: [] });
  assert.equal(result.success, false);
});

test('cerrarSchema accepts payment_method "dividido"', () => {
  const result = cerrarSchema.safeParse({ payment_method: 'dividido', amount_cash: 40, amount_card: 20 });
  assert.equal(result.success, true);
});

test('pagoSchema defaults amount_cash/amount_card to 0 and accepts cortesia with no amounts', () => {
  const result = pagoSchema.safeParse({ payment_method: 'cortesia', persona_nombre: 'Persona 3' });
  assert.equal(result.success, true);
  assert.equal(result.data.amount_cash, 0);
  assert.equal(result.data.amount_card, 0);
});

test('pagoSchema rejects an unknown payment_method', () => {
  const result = pagoSchema.safeParse({ payment_method: 'bitcoin' });
  assert.equal(result.success, false);
});
