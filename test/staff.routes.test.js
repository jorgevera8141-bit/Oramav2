const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../src/modules/staff/service');
const pool = require('../src/config/database');

function loadRouter({ serviceStubs = {}, poolQuery } = {}) {
  const originalService = {};
  for (const [key, value] of Object.entries(serviceStubs)) {
    originalService[key] = service[key];
    service[key] = value;
  }
  const originalQuery = pool.query;
  if (poolQuery) pool.query = poolQuery;
  delete require.cache[require.resolve('../src/modules/staff/routes')];
  const router = require('../src/modules/staff/routes');

  return {
    router,
    restore() {
      for (const [key, value] of Object.entries(originalService)) service[key] = value;
      pool.query = originalQuery;
      delete require.cache[require.resolve('../src/modules/staff/routes')];
    }
  };
}

function findRouteHandlers(router, method, path) {
  const layer = router.stack.find((entry) => entry.route
    && entry.route.path === path
    && entry.route.methods[method.toLowerCase()]);
  if (!layer) throw new Error(`Route not found for ${method.toUpperCase()} ${path}`);
  return layer.route.stack.map((entry) => entry.handle);
}

async function runHandlers(handlers, req = {}) {
  const request = { body: {}, query: {}, params: {}, ...req };
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };

  let index = 0;
  async function next(error) {
    if (error) throw error;
    const handler = handlers[index];
    index += 1;
    if (!handler) return { req: request, res: response, body: response.body };
    await handler(request, response, next);
    return { req: request, res: response, body: response.body };
  }

  return next();
}

test('GET /staff/hours-summary rejects an invalid date range query', async () => {
  const { router, restore } = loadRouter();
  try {
    const handlers = findRouteHandlers(router, 'get', '/staff/hours-summary');
    await assert.rejects(
      () => runHandlers(handlers, { query: { from: '2026/09/22', to: '2026-09-22' } }),
      (error) => error.statusCode === 400 && error.message === 'from y to deben usar el formato YYYY-MM-DD.'
    );
  } finally {
    restore();
  }
});

test('GET /staff/hours-summary returns the normalized range and summary rows', async () => {
  const summaryRows = [{ staff_id: 1, nombre: 'Ana', sessions_count: 1, total_minutes: 120, total_hours: 2 }];
  const { router, restore } = loadRouter({
    serviceStubs: {
      getHoursSummary: async (range) => {
        assert.deepEqual(range, { from: '2026-09-22', to: '2026-09-23' });
        return summaryRows;
      }
    }
  });
  try {
    const handlers = findRouteHandlers(router, 'get', '/staff/hours-summary');
    const result = await runHandlers(handlers, { query: { from: '2026-09-22', to: '2026-09-23' } });
    assert.equal(result.res.statusCode, 200);
    assert.deepEqual(result.body, {
      success: true,
      range: { from: '2026-09-22', to: '2026-09-23' },
      summary: summaryRows
    });
  } finally {
    restore();
  }
});

test('GET /staff/:id/sessions rejects an invalid staff id', async () => {
  const { router, restore } = loadRouter();
  try {
    const handlers = findRouteHandlers(router, 'get', '/staff/:id/sessions');
    await assert.rejects(
      () => runHandlers(handlers, { params: { id: 'abc' }, query: { from: '2026-09-22', to: '2026-09-22' } }),
      (error) => error.statusCode === 400 && error.message === 'Staff inválido.'
    );
  } finally {
    restore();
  }
});

test('GET /staff/:id/sessions surfaces a missing staff member', async () => {
  const notFound = Object.assign(new Error('Staff no encontrado.'), { statusCode: 404 });
  const { router, restore } = loadRouter({
    serviceStubs: {
      getStaffSessions: async () => { throw notFound; }
    }
  });
  try {
    const handlers = findRouteHandlers(router, 'get', '/staff/:id/sessions');
    await assert.rejects(
      () => runHandlers(handlers, { params: { id: '7' }, query: { from: '2026-09-22', to: '2026-09-22' } }),
      (error) => error.statusCode === 404 && error.message === 'Staff no encontrado.'
    );
  } finally {
    restore();
  }
});

test('GET /staff/:id/sessions returns staff session history for a valid staff id', async () => {
  const sessions = [{ id: 9, login_time: '2026-09-22T08:00:00.000Z', logout_time: null, worked_minutes: 90, worked_hours: 1.5 }];
  const { router, restore } = loadRouter({
    serviceStubs: {
      getStaffSessions: async (staffId, range) => {
        assert.equal(staffId, 3);
        assert.deepEqual(range, { from: '2026-09-22', to: '2026-09-22' });
        return {
          staff: { id: 3, nombre: 'Ana', tipo: 'staff', idioma: 'es', activo: 1 },
          sessions
        };
      }
    }
  });
  try {
    const handlers = findRouteHandlers(router, 'get', '/staff/:id/sessions');
    const result = await runHandlers(handlers, { params: { id: '3' }, query: { from: '2026-09-22', to: '2026-09-22' } });
    assert.equal(result.res.statusCode, 200);
    assert.deepEqual(result.body, {
      success: true,
      staff: { id: 3, nombre: 'Ana', tipo: 'staff', idioma: 'es', activo: 1 },
      range: { from: '2026-09-22', to: '2026-09-22' },
      sessions
    });
  } finally {
    restore();
  }
});
