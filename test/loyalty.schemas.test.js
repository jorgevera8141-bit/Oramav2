const test = require('node:test');
const assert = require('node:assert/strict');
const {
  phoneSchema, buscarClienteSchema, crearClienteSchema, redimirSchema, ajusteManualSchema
} = require('../src/modules/loyalty/schemas');

test('phoneSchema accepts a 10-digit phone number', () => {
  assert.equal(phoneSchema.safeParse('4499796142').success, true);
});

test('phoneSchema rejects a phone number with the wrong length', () => {
  assert.equal(phoneSchema.safeParse('44997961').success, false);
  assert.equal(phoneSchema.safeParse('449979614299').success, false);
});

test('phoneSchema rejects non-numeric characters', () => {
  assert.equal(phoneSchema.safeParse('(449) 979-6142').success, false);
});

test('buscarClienteSchema requires a valid phone', () => {
  assert.equal(buscarClienteSchema.safeParse({ phone: '4499796142' }).success, true);
  assert.equal(buscarClienteSchema.safeParse({ phone: 'abc' }).success, false);
});

test('crearClienteSchema defaults marketing_consent to false', () => {
  const result = crearClienteSchema.safeParse({ phone: '4499796142' });
  assert.equal(result.success, true);
  assert.equal(result.data.marketing_consent, false);
});

test('crearClienteSchema accepts an optional nombre', () => {
  const result = crearClienteSchema.safeParse({ phone: '4499796142', nombre: 'Ana', marketing_consent: true });
  assert.equal(result.success, true);
  assert.equal(result.data.nombre, 'Ana');
});

test('redimirSchema requires positive customer_id, orden_id, and staff credentials', () => {
  const base = { customer_id: 1, orden_id: 2, actor_nombre: 'Ana', actor_pin: '1234' };
  assert.equal(redimirSchema.safeParse(base).success, true);
  assert.equal(redimirSchema.safeParse({ ...base, customer_id: 0 }).success, false);
  assert.equal(redimirSchema.safeParse({ ...base, actor_pin: '' }).success, false);
});

test('ajusteManualSchema rejects a zero-quantity adjustment', () => {
  const base = { customer_id: 1, cantidad: 0, razon: 'prueba', actor_nombre: 'Ana', actor_pin: '1234' };
  assert.equal(ajusteManualSchema.safeParse(base).success, false);
});

test('ajusteManualSchema accepts positive and negative adjustments with a reason', () => {
  const base = { customer_id: 1, razon: 'corrección', actor_nombre: 'Ana', actor_pin: '1234' };
  assert.equal(ajusteManualSchema.safeParse({ ...base, cantidad: 3 }).success, true);
  assert.equal(ajusteManualSchema.safeParse({ ...base, cantidad: -2 }).success, true);
});

test('ajusteManualSchema requires a reason', () => {
  const result = ajusteManualSchema.safeParse({ customer_id: 1, cantidad: 1, razon: '', actor_nombre: 'Ana', actor_pin: '1234' });
  assert.equal(result.success, false);
});
