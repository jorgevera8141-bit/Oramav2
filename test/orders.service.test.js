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
