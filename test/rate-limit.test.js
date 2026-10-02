const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../src/middleware/rate-limit');

function run(limiter, ip) {
  const res = { headers: {}, statusCode: 200, body: null, set(name, value) { this.headers[name] = value; return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let passed = false;
  limiter({ ip }, res, () => { passed = true; });
  return { passed, res };
}

test('rate limiter lets requests through up to the limit and then answers 429 with Retry-After', () => {
  let clock = 1_000;
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, message: 'Demasiados intentos', now: () => clock });
  assert.equal(run(limiter, '1.1.1.1').passed, true);
  assert.equal(run(limiter, '1.1.1.1').passed, true);
  const blocked = run(limiter, '1.1.1.1');
  assert.equal(blocked.passed, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.body.success, false);
  assert.equal(blocked.res.body.message, 'Demasiados intentos');
  assert.equal(blocked.res.headers['Retry-After'], 60);
});

test('rate limiter counts each client address separately', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, message: 'x', now: () => 0 });
  assert.equal(run(limiter, '1.1.1.1').passed, true);
  assert.equal(run(limiter, '2.2.2.2').passed, true);
  assert.equal(run(limiter, '1.1.1.1').passed, false);
});

test('rate limiter starts a fresh window once the previous one has expired', () => {
  let clock = 0;
  const limiter = createRateLimiter({ windowMs: 1_000, max: 1, message: 'x', now: () => clock });
  assert.equal(run(limiter, '1.1.1.1').passed, true);
  assert.equal(run(limiter, '1.1.1.1').passed, false);
  clock = 1_001;
  assert.equal(run(limiter, '1.1.1.1').passed, true);
});
