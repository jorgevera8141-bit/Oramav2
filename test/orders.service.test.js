const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregatePagos } = require('../src/modules/orders/service');

test('aggregatePagos sums amount_cash and amount_card across all payments', () => {
  const totals = aggregatePagos([
    { amount_cash: 40, amount_card: 0 },
    { amount_cash: 10, amount_card: 20 },
    { amount_cash: 0, amount_card: 30 }
  ]);
  assert.deepEqual(totals, { amount_cash: 50, amount_card: 50 });
});

test('aggregatePagos treats missing amount fields as 0 (cortesia/cliente_frecuente entries)', () => {
  const totals = aggregatePagos([{ amount_cash: 15 }, {}, { amount_card: 25 }]);
  assert.deepEqual(totals, { amount_cash: 15, amount_card: 25 });
});

test('aggregatePagos returns zeros for an empty list', () => {
  assert.deepEqual(aggregatePagos([]), { amount_cash: 0, amount_card: 0 });
});

const { assertValidClosePayment } = require('../src/modules/orders/service');

const order = { id: 1, total: '100.00' };
const rejects = (payload, statusCode) => assert.throws(
  () => assertValidClosePayment(order, payload),
  (error) => error.statusCode === statusCode
);

test('assertValidClosePayment rejects cliente_frecuente without a customer id and staff PIN', () => {
  rejects({ payment_method: 'cliente_frecuente' }, 400);
  rejects({ payment_method: 'cliente_frecuente', loyalty_customer_id: 3 }, 400);
  rejects({ payment_method: 'cliente_frecuente', loyalty_customer_id: 3, actor_nombre: 'Ana' }, 400);
});

test('assertValidClosePayment accepts cliente_frecuente with customer id and PIN credentials', () => {
  assert.doesNotThrow(() => assertValidClosePayment(order, {
    payment_method: 'cliente_frecuente', loyalty_customer_id: 3, actor_nombre: 'Ana', actor_pin: '1234'
  }));
});

test('assertValidClosePayment rejects a close with no payment method and no split payments', () => {
  rejects({}, 400);
  rejects({ amount_cash: 100 }, 400);
});

test('assertValidClosePayment requires efectivo/tarjeta/mixto amounts to cover the order total', () => {
  rejects({ payment_method: 'efectivo', amount_cash: 0, amount_card: 0 }, 400);
  rejects({ payment_method: 'tarjeta', amount_card: 99 }, 400);
  rejects({ payment_method: 'mixto', amount_cash: 40, amount_card: 50 }, 400);
  assert.doesNotThrow(() => assertValidClosePayment(order, { payment_method: 'efectivo', amount_cash: 100 }));
  assert.doesNotThrow(() => assertValidClosePayment(order, { payment_method: 'tarjeta', amount_card: 100 }));
  assert.doesNotThrow(() => assertValidClosePayment(order, { payment_method: 'mixto', amount_cash: 60, amount_card: 40 }));
  assert.doesNotThrow(() => assertValidClosePayment(order, { payment_method: 'mixto', amount_cash: 120, amount_card: 0 }), 'tendered cash above the total is fine');
});

test('assertValidClosePayment leaves cortesia and split-payment closes to their own rules', () => {
  assert.doesNotThrow(() => assertValidClosePayment(order, { payment_method: 'cortesia' }));
  assert.doesNotThrow(() => assertValidClosePayment(order, { payment_method: 'dividido', pagos: [{ payment_method: 'efectivo', amount_cash: 100 }] }));
});
