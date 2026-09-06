const test = require('node:test');
const assert = require('node:assert/strict');
const { mapItemsToFacturapi, buildCustomer, resolvePaymentForm, GENERIC_PRODUCT_KEY, PUBLICO_GENERAL, BUSINESS_ZIP } = require('../src/modules/invoices/service');

test('mapItemsToFacturapi uses the menu item\'s real SAT clave_sat when present', () => {
  const rows = [{ item_nombre: 'Café Americano', precio: '43.00', cantidad: 2, clave_sat: '90111500' }];
  const items = mapItemsToFacturapi(rows);
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 2);
  assert.equal(items[0].product.product_key, '90111500');
  assert.equal(items[0].product.price, 43);
  assert.equal(items[0].product.description, 'Café Americano');
});

test('mapItemsToFacturapi falls back to the generic SAT "not in catalog" key when clave_sat is missing', () => {
  const rows = [{ item_nombre: 'Item sin clasificar', precio: '10', cantidad: 1, clave_sat: null }];
  const items = mapItemsToFacturapi(rows);
  assert.equal(items[0].product.product_key, GENERIC_PRODUCT_KEY);
});

test('buildCustomer returns the public/generic receptor for a factura global', () => {
  const customer = buildCustomer({ tipo: 'global' });
  assert.equal(customer.tax_id, PUBLICO_GENERAL.tax_id);
  assert.equal(customer.legal_name, PUBLICO_GENERAL.legal_name);
  assert.equal(customer.address.zip, BUSINESS_ZIP);
});

test('buildCustomer maps a normal invoice\'s customer-provided fields', () => {
  const customer = buildCustomer({ tipo: 'normal', rfc: 'XAXX010101000', razon_social: 'Cliente SA de CV', regimen_fiscal: '601', cp: '20000', email: 'cliente@correo.com' });
  assert.equal(customer.tax_id, 'XAXX010101000');
  assert.equal(customer.legal_name, 'Cliente SA de CV');
  assert.equal(customer.tax_system, '601');
  assert.equal(customer.address.zip, '20000');
  assert.equal(customer.email, 'cliente@correo.com');
});

test('buildCustomer omits email entirely when not provided (no empty-string field sent to Facturapi)', () => {
  const customer = buildCustomer({ tipo: 'normal', rfc: 'XAXX010101000', razon_social: 'X', regimen_fiscal: '601', cp: '20000' });
  assert.equal('email' in customer, false);
});

test('resolvePaymentForm uses 01 (efectivo) for a factura global regardless of the order\'s method', () => {
  assert.equal(resolvePaymentForm({ payment_method: 'tarjeta' }, { tipo: 'global' }), '01');
});

test('resolvePaymentForm maps efectivo orders to SAT code 01', () => {
  assert.equal(resolvePaymentForm({ payment_method: 'efectivo' }, { tipo: 'normal' }), '01');
});

test('resolvePaymentForm maps tarjeta orders to the chosen debito/credito code, defaulting to 04', () => {
  assert.equal(resolvePaymentForm({ payment_method: 'tarjeta' }, { tipo: 'normal' }), '04');
  assert.equal(resolvePaymentForm({ payment_method: 'tarjeta' }, { tipo: 'normal', forma_pago_tarjeta: '28' }), '28');
});

test('resolvePaymentForm falls back to 99 (Por definir) for mixto/cortesia/cliente_frecuente', () => {
  assert.equal(resolvePaymentForm({ payment_method: 'mixto' }, { tipo: 'normal' }), '99');
  assert.equal(resolvePaymentForm({ payment_method: 'cortesia' }, { tipo: 'normal' }), '99');
});
