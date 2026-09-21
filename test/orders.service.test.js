const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const {
  PAYMENT_ROUNDING_TOLERANCE,
  aggregatePagos,
  closeOrder,
  validateClosePayment
} = require('../src/modules/orders/service');

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

test('validateClosePayment rejects ordinary underpayment', () => {
  assert.throws(
    () => validateClosePayment(100, { payment_method: 'efectivo', amount_cash: 99.98 }),
    (error) => error.statusCode === 400 && error.message === 'El monto pagado debe coincidir con el total de la orden.'
  );
});

test('validateClosePayment rejects an unknown payment method at the service layer', () => {
  assert.throws(
    () => validateClosePayment(100, { payment_method: 'bitcoin', amount_cash: 100 }),
    (error) => error.statusCode === 400 && error.message === 'Debes indicar un método de pago válido para cerrar la orden.'
  );
});

test('validateClosePayment rejects ordinary overpayment beyond the rounding tolerance', () => {
  assert.throws(
    () => validateClosePayment(100, { payment_method: 'tarjeta', amount_card: 100 + PAYMENT_ROUNDING_TOLERANCE + 0.01 }),
    (error) => error.statusCode === 400 && error.message === 'El monto pagado debe coincidir con el total de la orden.'
  );
});

test('validateClosePayment accepts a split payment whose total matches within the rounding tolerance', () => {
  const payment = validateClosePayment(100, {
    pagos: [
      { payment_method: 'efectivo', amount_cash: 33.33 },
      { payment_method: 'tarjeta', amount_card: 66.67 }
    ]
  });
  assert.deepEqual(payment, {
    payment_method: 'dividido',
    amount_cash: 33.33,
    amount_card: 66.67,
    pagos: [
      { payment_method: 'efectivo', amount_cash: 33.33, amount_card: 0, persona_nombre: null, loyalty_customer_id: null, actor_nombre: null, actor_pin: null },
      { payment_method: 'tarjeta', amount_cash: 0, amount_card: 66.67, persona_nombre: null, loyalty_customer_id: null, actor_nombre: null, actor_pin: null }
    ]
  });
});

test('validateClosePayment rejects split payments that do not match the order total', () => {
  assert.throws(
    () => validateClosePayment(100, {
      pagos: [
        { payment_method: 'efectivo', amount_cash: 20 },
        { payment_method: 'tarjeta', amount_card: 81 }
      ]
    }),
    (error) => error.statusCode === 400 && error.message === 'La suma de los pagos divididos debe coincidir con el total de la orden.'
  );
});

test('validateClosePayment rejects an explicitly empty split-payment list', () => {
  assert.throws(
    () => validateClosePayment(100, { payment_method: 'dividido', pagos: [] }),
    (error) => error.statusCode === 400 && error.message === 'Debes registrar al menos un pago dividido.'
  );
});

test('validateClosePayment rejects payment_method dividido without a pagos list', () => {
  assert.throws(
    () => validateClosePayment(100, { payment_method: 'dividido' }),
    (error) => error.statusCode === 400 && error.message === 'Debes registrar al menos un pago dividido.'
  );
});

test('validateClosePayment rejects zero-due methods inside split payments', () => {
  assert.throws(
    () => validateClosePayment(100, {
      pagos: [
        { payment_method: 'cortesia' },
        { payment_method: 'tarjeta', amount_card: 100 }
      ]
    }),
    (error) => error.statusCode === 400 && error.message === 'cortesia no es válido dentro de pagos divididos.'
  );
});

test('validateClosePayment makes zero-due loyalty redemption explicit when the order total is zero', () => {
  const payment = validateClosePayment(0, {
    payment_method: 'cliente_frecuente',
    loyalty_customer_id: 4,
    actor_nombre: 'Caja',
    actor_pin: '1234'
  });
  assert.deepEqual(payment, {
    payment_method: 'cliente_frecuente',
    amount_cash: 0,
    amount_card: 0,
    persona_nombre: null,
    loyalty_customer_id: 4,
    actor_nombre: 'Caja',
    actor_pin: '1234'
  });
});

test('validateClosePayment rejects zero-due methods when the order still has a balance', () => {
  assert.throws(
    () => validateClosePayment(87.5, {
      payment_method: 'cliente_frecuente',
      loyalty_customer_id: 4,
      actor_nombre: 'Caja',
      actor_pin: '1234'
    }),
    (error) => error.statusCode === 400 && error.message === 'Este método de pago solo es válido cuando el monto a cobrar es cero.'
  );
});

test('validateClosePayment requires staff/customer data for cliente_frecuente', () => {
  assert.throws(
    () => validateClosePayment(0, { payment_method: 'cliente_frecuente' }),
    (error) => error.statusCode === 400 && error.message === 'Cliente frecuente requiere cliente, nombre y PIN del staff para cerrar la orden.'
  );
});

test('closeOrder preserves idempotency for already closed orders before payment validation runs', async () => {
  const originalConnect = pool.connect;
  const queries = [];
  pool.connect = async () => ({
    query: async (sql) => {
      queries.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 };
      if (sql === 'SELECT * FROM ordenes WHERE id = $1 FOR UPDATE') {
        return { rows: [{ id: 9, status: 'cerrada', total: '87.50' }], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() {}
  });

  try {
    const order = await closeOrder(9, {});
    assert.equal(order.status, 'cerrada');
    assert.deepEqual(queries, [
      'BEGIN',
      'SELECT * FROM ordenes WHERE id = $1 FOR UPDATE',
      'COMMIT'
    ]);
  } finally {
    pool.connect = originalConnect;
  }
});
