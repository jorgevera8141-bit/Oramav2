const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GATE_PASSCODE = 'cafe-secret';
process.env.GATE_PASSCODE_PREVIOUS = 'old-secret';
const app = require('../src/app');
const { createGate, PUBLIC_ROUTES } = require('../src/middleware/gate');

const basic = (pass) => `Basic ${Buffer.from(`orama:${pass}`).toString('base64')}`;

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

// Each probe comes from its own client address (trust proxy reads X-Forwarded-For), so the
// failure throttle under test elsewhere does not mask the gate's answer here.
let probeCounter = 0;
async function call(base, method, path, headers = {}) {
  probeCounter += 1;
  return fetch(base + path, { method, headers: { 'x-forwarded-for': `10.1.${Math.floor(probeCounter / 250)}.${probeCounter % 250}`, ...headers }, redirect: 'manual' });
}

// fetch normalizes "%2e" away, so lookalike encodings go over a raw request.
function rawStatus(base, path) {
  const http = require('node:http');
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: new URL(base).port, path, headers: { 'x-forwarded-for': '10.9.9.9' } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
}

function enumerateRoutes() {
  const found = [];
  const probe = '/api/pricing/__probe';
  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) {
        const paths = [].concat(layer.route.path);
        for (const p of paths) for (const method of Object.keys(layer.route.methods)) found.push([method.toUpperCase(), prefix + p]);
      } else if (layer.handle && layer.handle.stack) {
        const matched = layer.matchers && layer.matchers[0](probe);
        walk(layer.handle.stack, matched ? matched.path : prefix);
      }
    }
  };
  walk(app.router.stack, '');
  return found.map(([m, p]) => [m, p.replace(/:[A-Za-z_]+\??/g, '1')]);
}

test('gate rejects missing, wrong and malformed credentials with a JSON 401 on /api', async () => {
  const { server, base } = await listen();
  try {
    for (const headers of [{}, { authorization: basic('nope') }, { authorization: 'Basic !!!notbase64' }, { authorization: basic('') }, { authorization: 'Bearer x' }]) {
      const res = await call(base, 'GET', '/api/ordenes', headers);
      assert.equal(res.status, 401);
      assert.match(res.headers.get('www-authenticate'), /^Basic/);
      assert.equal((await res.json()).success, false);
    }
  } finally { server.close(); }
});

test('gate accepts the passcode and the previous passcode, whatever its length', async () => {
  const { server, base } = await listen();
  try {
    for (const pass of ['cafe-secret', 'old-secret']) {
      const res = await call(base, 'GET', '/api/ordenes', { authorization: basic(pass) });
      assert.notEqual(res.status, 401);
    }
    const long = await call(base, 'GET', '/api/ordenes', { authorization: basic('x'.repeat(5000)) });
    assert.equal(long.status, 401);
  } finally { server.close(); }
});

test('public routes need no credentials; lookalike paths and other methods do', async () => {
  const { server, base } = await listen();
  try {
    for (const path of ['/health', '/loyalty.html', '/css/orama-pro.css', '/css/orama-loyalty.css', '/js/orama-fx.js', '/js/orama-loyalty.js', '/bg-coffee.jpg']) {
      const res = await call(base, 'GET', path);
      assert.equal(res.status, 200, path);
    }
    for (const [method, path] of [
      ['GET', '/loyalty.html/'], ['GET', '//loyalty.html'], ['GET', '/LOYALTY.HTML'],       ['GET', '/css/../index.html'], ['GET', '/'], ['GET', '/index.html'], ['GET', '/js/orama-cashier.js'],
      ['GET', '/uploads/x.jpg'], ['PUT', '/health'], ['DELETE', '/api/loyalty/customers'], ['GET', '/api/loyalty/customers/5551234/extra'],
    ]) {
      const res = await call(base, method, path);
      assert.equal(res.status, 401, `${method} ${path}`);
    }
    assert.equal(await rawStatus(base, '/%2e/health'), 401);
    assert.equal(await rawStatus(base, '/health%2f'), 401);
  } finally { server.close(); }
});

test('every registered route is gated except the pinned public list', async () => {
  const routes = enumerateRoutes();
  assert.ok(routes.length >= 80, `expected to enumerate the whole API, got ${routes.length}`);
  const { server, base } = await listen();
  try {
    for (const [method, path] of routes) {
      if (PUBLIC_ROUTES.some((r) => r.method === method && r.pattern.test(path))) continue;
      const res = await call(base, method, path);
      assert.equal(res.status, 401, `${method} ${path} must be gated`);
    }
  } finally { server.close(); }
});

test('only failed attempts are throttled and a correct passcode still works afterwards', () => {
  let time = 0;
  const gate = createGate({ passcode: 'pw', maxFailures: 3, windowMs: 1000, now: () => time });
  const run = (header) => {
    const res = { code: null, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.code = c; return this; }, json() { return this; }, send() { return this; } };
    let nexted = false;
    gate({ method: 'GET', path: '/api/x', originalUrl: '/api/x', ip: '1.1.1.1', headers: { authorization: header } }, res, () => { nexted = true; });
    return { res, nexted };
  };
  for (let i = 0; i < 10; i += 1) assert.equal(run(basic('pw')).nexted, true);
  for (let i = 0; i < 3; i += 1) assert.equal(run(basic('bad')).res.code, 401);
  assert.equal(run(basic('bad')).res.code, 429);
  assert.equal(run(basic('pw')).res.code, 429, 'locked out ip stays blocked until the window ends');
  time = 1001;
  assert.equal(run(basic('pw')).nexted, true);
});

test('production without a passcode refuses to start', () => {
  assert.throws(() => createGate({ passcode: '', isProduction: true }), /GATE_PASSCODE/);
  assert.equal(typeof createGate({ passcode: '', isProduction: false }), 'function');
});
