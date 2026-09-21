const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const router = require('../src/modules/inventory/routes');
const {
  inventoryIdParamSchema,
  restockInventoryItemSchema
} = require('../src/modules/inventory/schemas');

function getRouteHandlers(path, method) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack.map((entry) => entry.handle);
}

function invokeHandlers(handlers, { params = {}, body = {} } = {}) {
  return new Promise((resolve) => {
    const req = { params, body };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ req, res: this, body: payload });
        return this;
      }
    };

    let index = 0;
    const next = (error) => {
      if (error) {
        resolve({ req, res, error });
        return;
      }
      const handler = handlers[index];
      index += 1;
      if (!handler) {
        resolve({ req, res });
        return;
      }
      Promise.resolve(handler(req, res, next)).catch((caught) => resolve({ req, res, error: caught }));
    };

    next();
  });
}

test('restockInventoryItemSchema parses a valid positive amount', () => {
  const result = restockInventoryItemSchema.safeParse({ amount: '2.5' });
  assert.equal(result.success, true);
  assert.equal(result.data.amount, 2.5);
});

test('restockInventoryItemSchema rejects missing or invalid amounts', () => {
  for (const sample of [{}, { amount: '' }, { amount: 'abc' }, { amount: Number.NaN }, { amount: Infinity }, { amount: 0 }, { amount: -1 }]) {
    const result = restockInventoryItemSchema.safeParse(sample);
    assert.equal(result.success, false);
  }
});

test('inventoryIdParamSchema coerces a numeric route id and rejects invalid ids', () => {
  const valid = inventoryIdParamSchema.safeParse({ id: '7' });
  assert.equal(valid.success, true);
  assert.equal(valid.data.id, 7);

  for (const sample of [{ id: 'nope' }, { id: '0' }, { id: '-3' }]) {
    const result = inventoryIdParamSchema.safeParse(sample);
    assert.equal(result.success, false);
  }
});

test('inventory restock route returns 404 when the item does not exist', async () => {
  const originalConnect = pool.connect;
  const queries = [];
  pool.connect = async () => ({
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('UPDATE inventory_items SET current_stock = current_stock + $1')) return { rows: [], rowCount: 0 };
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() {}
  });

  try {
    const handlers = getRouteHandlers('/inventory/:id/restock', 'post');
    const outcome = await invokeHandlers(handlers, { params: { id: '8' }, body: { amount: 3 } });
    assert.equal(outcome.error?.statusCode, 404);
    assert.equal(outcome.error?.message, 'Artículo de inventario no encontrado');
    assert.deepEqual(queries.map(({ sql }) => sql), [
      'BEGIN',
      'UPDATE inventory_items SET current_stock = current_stock + $1, last_restocked_at = NOW() WHERE id = $2 RETURNING id',
      'ROLLBACK'
    ]);
  } finally {
    pool.connect = originalConnect;
  }
});

test('inventory restock route uses the validated amount and commits both queries transactionally', async () => {
  const originalConnect = pool.connect;
  const queries = [];
  pool.connect = async () => ({
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 };
      if (sql.includes('UPDATE inventory_items SET current_stock = current_stock + $1')) return { rows: [{ id: 12 }], rowCount: 1 };
      if (sql.includes('INSERT INTO inventory_movements')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() {}
  });

  try {
    const handlers = getRouteHandlers('/inventory/:id/restock', 'post');
    const outcome = await invokeHandlers(handlers, { params: { id: '12' }, body: { amount: '2.5' } });
    assert.equal(outcome.res.statusCode, 200);
    assert.deepEqual(outcome.body, { success: true });
    assert.deepEqual(queries, [
      { sql: 'BEGIN', params: undefined },
      {
        sql: 'UPDATE inventory_items SET current_stock = current_stock + $1, last_restocked_at = NOW() WHERE id = $2 RETURNING id',
        params: [2.5, 12]
      },
      {
        sql: 'INSERT INTO inventory_movements (inventory_item_id, change_amount, reason, note) VALUES ($1, $2, \'restock\', $3)',
        params: [12, 2.5, 'Manual restock']
      },
      { sql: 'COMMIT', params: undefined }
    ]);
  } finally {
    pool.connect = originalConnect;
  }
});
