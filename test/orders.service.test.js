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

test('assertValidClosePayment lets a close with no payment method through (bar "listo" button)', () => {
  assert.doesNotThrow(() => assertValidClosePayment(order, {}));
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

const { deductInventoryForOrder, cancelOrder } = require('../src/modules/orders/service');

// Minimal fake pg client: answers each query by a SQL fragment and records the writes.
function fakeClient(responders) {
  const writes = [];
  return {
    writes,
    async query(sql, params) {
      if (/^\s*(UPDATE|INSERT)/i.test(sql)) writes.push({ sql, params });
      const match = responders.find(([fragment]) => sql.includes(fragment));
      return match ? match[1](params) : { rows: [], rowCount: 0 };
    }
  };
}

test('deductInventoryForOrder deducts a shared ingredient once per menu item that uses it', async () => {
  // Latte (2 units, 0.2 L milk each) + Capuchino (1 unit, 0.15 L milk): 0.55 L of milk in total.
  const client = fakeClient([
    ['FROM orden_items oi', () => ({ rows: [
      { inventory_item_id: 7, quantity_used: '0.2', cantidad: 2 },
      { inventory_item_id: 7, quantity_used: '0.15', cantidad: 1 }
    ] })]
  ]);
  await deductInventoryForOrder(client, 42);
  const stockUpdates = client.writes.filter((w) => w.sql.includes('UPDATE inventory_items'));
  assert.equal(stockUpdates.length, 1);
  assert.ok(Math.abs(stockUpdates[0].params[0] - 0.55) < 1e-9);
  assert.equal(stockUpdates[0].params[1], 7);
  assert.equal(client.writes.filter((w) => w.sql.includes('INSERT INTO inventory_movements')).length, 1);
});

test('deductInventoryForOrder does not deduct an ingredient already recorded as a sale for this order', async () => {
  const client = fakeClient([
    ['FROM orden_items oi', () => ({ rows: [{ inventory_item_id: 7, quantity_used: '0.2', cantidad: 1 }] })],
    ["reason = 'sale'", () => ({ rows: [{ inventory_item_id: 7 }] })]
  ]);
  await deductInventoryForOrder(client, 42);
  assert.equal(client.writes.length, 0);
});

test('cancelOrder cancels an open order and frees its table', async () => {
  const client = fakeClient([
    ["status = 'cancelada'", () => ({ rows: [{ id: 5, mesa_id: 3 }], rowCount: 1 })]
  ]);
  await cancelOrder(5, 'cliente se fue', client);
  assert.ok(client.writes.some((w) => w.sql.includes("UPDATE mesas SET status = 'disponible'") && w.params[0] === 3));
});

test('cancelOrder refuses to cancel an order that is already closed', async () => {
  const client = fakeClient([
    ['SELECT status FROM ordenes', () => ({ rows: [{ status: 'cerrada' }] })]
  ]);
  await assert.rejects(() => cancelOrder(5, null, client), (error) => error.statusCode === 409);
});

test('cancelOrder reports 404 for an order that does not exist', async () => {
  await assert.rejects(() => cancelOrder(99, null, fakeClient([])), (error) => error.statusCode === 404);
});
