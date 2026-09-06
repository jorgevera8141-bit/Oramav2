const test = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const { validate } = require('../src/middleware/validate');

function runMiddleware(middleware, req) {
  return new Promise((resolve) => {
    const res = { status(code) { this.statusCode = code; return this; }, json(body) { resolve({ res: this, body }); } };
    middleware(req, res, () => resolve({ req, next: true }));
  });
}

test('validate treats a missing body as an empty object instead of rejecting it', async () => {
  const schema = z.object({ payment_method: z.string().optional() });
  const middleware = validate(schema);
  const req = {};
  const outcome = await runMiddleware(middleware, req);
  assert.equal(outcome.next, true);
  assert.deepEqual(req.body, {});
});

test('validate still rejects a body that fails schema rules', async () => {
  const schema = z.object({ amount: z.number().nonnegative() });
  const middleware = validate(schema);
  const req = { body: { amount: -5 } };
  const outcome = await runMiddleware(middleware, req);
  assert.equal(outcome.body.success, false);
});

test('validate passes through and normalizes a valid body', async () => {
  const schema = z.object({ amount: z.number().nonnegative().optional() });
  const middleware = validate(schema);
  const req = { body: { amount: 10 } };
  const outcome = await runMiddleware(middleware, req);
  assert.equal(outcome.next, true);
  assert.deepEqual(req.body, { amount: 10 });
});
