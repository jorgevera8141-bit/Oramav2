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

test('requests with no credentials are challenged but never counted as failed attempts', () => {
  let time = 0;
  const gate = createGate({ passcode: 'pw', maxFailures: 3, windowMs: 1000, now: () => time });
  const run = (header) => {
    const res = { code: null, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.code = c; return this; }, json() { return this; }, send() { return this; } };
    let nexted = false;
    gate({ method: 'GET', path: '/x', originalUrl: '/x', ip: '2.2.2.2', headers: header === undefined ? {} : { authorization: header } }, res, () => { nexted = true; });
    return { res, nexted };
  };
  // A phone opening the app also fetches favicons and touch icons before the passcode is typed.
  for (let i = 0; i < 40; i += 1) {
    const { res } = run(undefined);
    assert.equal(res.code, 401, 'a missing passcode is a challenge, not a lockout');
    assert.match(res.headers['WWW-Authenticate'], /^Basic/);
  }
  assert.equal(run(basic('pw')).nexted, true, 'the real passcode still works right after');
  for (let i = 0; i < 3; i += 1) assert.equal(run(basic('wrong')).res.code, 401);
  assert.equal(run(basic('wrong')).res.code, 429, 'wrong passcodes are still throttled');
});

// ---- passcode saved from the POS (checked through a store) instead of the Railway variable ----
const { createGateStore } = require('../src/shared/gate-store');

function runGate(gate, header, ip = '3.3.3.3') {
  const res = { code: null, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.code = c; return this; }, json() { return this; }, send() { return this; } };
  let nexted = false;
  const out = gate({ method: 'GET', path: '/x', originalUrl: '/x', ip, headers: header === undefined ? {} : { authorization: header } }, res, () => { nexted = true; });
  return Promise.resolve(out).then(() => ({ res, nexted }));
}
async function storeWith(passcode) {
  const store = createGateStore();
  const db = { async query() { return { rows: [] }; } };
  await store.set(db, passcode, 'Ana');
  return store;
}

test('a passcode saved in the POS replaces the Railway one', async () => {
  const gate = createGate({ passcode: 'railway-code', store: await storeWith('pos-code') });
  assert.equal((await runGate(gate, basic('pos-code'))).nexted, true);
  assert.equal((await runGate(gate, basic('railway-code'))).res.code, 401, 'the old Railway value no longer opens the gate');
  assert.equal((await runGate(gate, undefined)).res.code, 401);
});

test('GATE_FORCE_ENV brings the Railway passcode back as the break-glass recovery', async () => {
  const gate = createGate({ passcode: 'railway-code', store: await storeWith('pos-code'), forceEnv: true });
  assert.equal((await runGate(gate, basic('railway-code'))).nexted, true);
  assert.equal((await runGate(gate, basic('pos-code'))).res.code, 401);
});

test('with no passcode saved in the POS the Railway one still works', async () => {
  const store = createGateStore();
  const gate = createGate({ passcode: 'railway-code', store });
  assert.equal((await runGate(gate, basic('railway-code'))).nexted, true);
});

test('wrong passcodes against a POS passcode are throttled like the Railway one', async () => {
  const gate = createGate({ passcode: 'railway-code', store: await storeWith('pos-code'), maxFailures: 3, windowMs: 1000 });
  for (let i = 0; i < 3; i += 1) assert.equal((await runGate(gate, basic('bad'), '4.4.4.4')).res.code, 401);
  assert.equal((await runGate(gate, basic('bad'), '4.4.4.4')).res.code, 429);
  assert.equal((await runGate(gate, basic('pos-code'), '4.4.4.4')).res.code, 429, 'locked until the window ends');
  assert.equal((await runGate(gate, basic('pos-code'), '5.5.5.5')).nexted, true, 'another address is unaffected');
});

test('credential-less requests are never counted against a POS passcode either', async () => {
  const gate = createGate({ passcode: 'railway-code', store: await storeWith('pos-code'), maxFailures: 3, windowMs: 1000 });
  for (let i = 0; i < 20; i += 1) assert.equal((await runGate(gate, undefined, '6.6.6.6')).res.code, 401);
  assert.equal((await runGate(gate, basic('pos-code'), '6.6.6.6')).nexted, true);
});
