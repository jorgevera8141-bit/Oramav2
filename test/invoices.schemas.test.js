const test = require('node:test');
const assert = require('node:assert/strict');
const { facturaSchema } = require('../src/modules/invoices/schemas');

test('facturaSchema accepts a minimal factura global (just orden_id + tipo)', () => {
  const result = facturaSchema.safeParse({ orden_id: 1, tipo: 'global' });
  assert.equal(result.success, true);
});

test('facturaSchema rejects a normal factura missing required fields', () => {
  const result = facturaSchema.safeParse({ orden_id: 1, tipo: 'normal' });
  assert.equal(result.success, false);
});

test('facturaSchema accepts a complete, valid normal factura and uppercases the RFC', () => {
  const result = facturaSchema.safeParse({
    orden_id: 5, tipo: 'normal', rfc: 'xaxx010101000', razon_social: 'Cliente SA', regimen_fiscal: '601', cp: '20000', uso_cfdi: 'G03'
  });
  assert.equal(result.success, true);
  assert.equal(result.data.rfc, 'XAXX010101000');
});

test('facturaSchema rejects an invalid RFC format', () => {
  const result = facturaSchema.safeParse({
    orden_id: 5, tipo: 'normal', rfc: 'not-an-rfc', razon_social: 'Cliente SA', regimen_fiscal: '601', cp: '20000', uso_cfdi: 'G03'
  });
  assert.equal(result.success, false);
});

test('facturaSchema rejects a non-5-digit postal code', () => {
  const result = facturaSchema.safeParse({
    orden_id: 5, tipo: 'normal', rfc: 'XAXX010101000', razon_social: 'Cliente SA', regimen_fiscal: '601', cp: '123', uso_cfdi: 'G03'
  });
  assert.equal(result.success, false);
});
