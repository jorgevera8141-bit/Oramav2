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

const { createInvoice } = require('../src/modules/invoices/service');

const closedOrder = { id: 7, status: 'cerrada', total: '120.00', payment_method: 'efectivo' };
const itemRows = [{ item_nombre: 'Latte', precio: '60', cantidad: 2, clave_sat: '90101501' }];
const globalRequest = { orden_id: 7, tipo: 'global' };

// Fake pg pool: answers by SQL fragment and records every statement that ran.
function fakeDb({ order = closedOrder, items = itemRows, claim = [{ id: 11, orden_id: 7, status: 'pendiente' }], existing = [] } = {}) {
  const log = [];
  return {
    log,
    async query(sql) {
      log.push(sql.replace(/\s+/g, ' ').trim());
      if (sql.includes('FROM ordenes')) return { rows: order ? [order] : [] };
      if (sql.includes('FROM orden_items')) return { rows: items };
      if (sql.includes('INSERT INTO orama_facturas')) return { rows: claim };
      if (sql.includes('SELECT * FROM orama_facturas')) return { rows: existing };
      if (sql.includes('UPDATE orama_facturas')) return { rows: [{ id: 11, orden_id: 7, status: 'timbrada', folio_fiscal: 'UUID-1', facturapi_id: 'fp_1' }] };
      return { rows: [] };
    }
  };
}

function withKey(fn) {
  return async () => {
    const previous = process.env.FACTURAPI_KEY;
    process.env.FACTURAPI_KEY = 'sk_test_key';
    try { await fn(); } finally { if (previous === undefined) delete process.env.FACTURAPI_KEY; else process.env.FACTURAPI_KEY = previous; }
  };
}

test('createInvoice stamps once, claiming the order before calling Facturapi', withKey(async () => {
  const db = fakeDb();
  let stampCalls = 0;
  const request = async () => { stampCalls += 1; return { statusCode: 200, body: { id: 'fp_1', uuid: 'UUID-1' } }; };
  const { invoice, created } = await createInvoice(globalRequest, { db, request });
  assert.equal(created, true);
  assert.equal(stampCalls, 1);
  assert.equal(invoice.status, 'timbrada');
  const claimIndex = db.log.findIndex((sql) => sql.includes('INSERT INTO orama_facturas'));
  const updateIndex = db.log.findIndex((sql) => sql.includes('UPDATE orama_facturas'));
  assert.ok(claimIndex !== -1 && updateIndex > claimIndex, 'the claim row must exist before the stamp is recorded');
}));

test('createInvoice returns the existing invoice without stamping again', withKey(async () => {
  const existing = { id: 5, orden_id: 7, status: 'timbrada', folio_fiscal: 'UUID-OLD' };
  const db = fakeDb({ claim: [], existing: [existing] });
  const request = async () => { throw new Error('must not stamp twice'); };
  const { invoice, created } = await createInvoice(globalRequest, { db, request });
  assert.equal(created, false);
  assert.equal(invoice.folio_fiscal, 'UUID-OLD');
}));

test('createInvoice refuses to stamp while another request for the same order is in flight', withKey(async () => {
  const db = fakeDb({ claim: [], existing: [{ id: 5, orden_id: 7, status: 'pendiente' }] });
  const request = async () => { throw new Error('must not stamp'); };
  await assert.rejects(() => createInvoice(globalRequest, { db, request }), (error) => error.statusCode === 409);
}));

test('createInvoice releases the claim when Facturapi rejects the invoice, so it can be retried', withKey(async () => {
  const db = fakeDb();
  const request = async () => ({ statusCode: 400, body: { message: 'RFC inválido' } });
  await assert.rejects(() => createInvoice(globalRequest, { db, request }), (error) => error.statusCode === 502 && /RFC inválido/.test(error.message));
  assert.ok(db.log.some((sql) => sql.startsWith('DELETE FROM orama_facturas')), 'claim should be deleted');
}));

test('createInvoice keeps the claim when the Facturapi result is unknown (network failure), blocking a blind retry', withKey(async () => {
  const db = fakeDb();
  const request = async () => { throw new Error('socket hang up'); };
  await assert.rejects(() => createInvoice(globalRequest, { db, request }), (error) => error.statusCode === 502 && /Facturapi/.test(error.message));
  assert.ok(!db.log.some((sql) => sql.startsWith('DELETE FROM orama_facturas')), 'claim must stay so a retry cannot double-stamp');
}));

test('createInvoice does not claim anything for an order that is not closed', withKey(async () => {
  const db = fakeDb({ order: { ...closedOrder, status: 'abierta' } });
  await assert.rejects(() => createInvoice(globalRequest, { db, request: async () => ({}) }), (error) => error.statusCode === 409);
  assert.ok(!db.log.some((sql) => sql.includes('INSERT INTO orama_facturas')));
}));

test('buildInvoiceItems joins menu items by id so a duplicated menu name cannot repeat invoice lines', async () => {
  const { buildInvoiceItems } = require('../src/modules/invoices/service');
  let seenSql = '';
  const db = { async query(sql) { seenSql = sql; return { rows: itemRows }; } };
  await buildInvoiceItems(7, db);
  assert.match(seenSql, /menu_item_id/);
  assert.doesNotMatch(seenSql, /LEFT JOIN menu_items mi ON mi\.nombre = oi\.item_nombre/);
});
