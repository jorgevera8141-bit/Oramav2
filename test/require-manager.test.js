const test = require('node:test');
const assert = require('node:assert/strict');
const { credentialsFromHeaders, createRequireManager, createManagerIfPresent } = require('../src/middleware/require-manager');

const reqWith = (headers) => ({ get: (name) => headers[name.toLowerCase()] });
const run = async (middleware, req) => {
  let outcome;
  await middleware(req, {}, (error) => { outcome = { error: error || null }; });
  return outcome;
};

test('credentialsFromHeaders reads the PIN as sent and decodes a URI-encoded name', () => {
  assert.deepEqual(credentialsFromHeaders(reqWith({ 'x-actor-nombre': encodeURIComponent('María José'), 'x-actor-pin': '123456' })), { nombre: 'María José', pin: '123456' });
  assert.deepEqual(credentialsFromHeaders(reqWith({})), { nombre: null, pin: null });
  assert.deepEqual(credentialsFromHeaders(reqWith({ 'x-actor-nombre': '%E0%A4%A', 'x-actor-pin': '1' })), { nombre: null, pin: '1' }, 'a malformed encoding counts as no name, never a crash');
});

test('requireManager passes a verified manager through and records who it was', async () => {
  const seen = [];
  const verify = async (nombre, pin, tipo) => { seen.push([nombre, pin, tipo]); return { id: 1, nombre, tipo: 'management' }; };
  const req = reqWith({ 'x-actor-nombre': encodeURIComponent('Ana'), 'x-actor-pin': '123456' });
  const outcome = await run(createRequireManager(verify), req);
  assert.equal(outcome.error, null);
  assert.deepEqual(seen, [['Ana', '123456', 'management']], 'it asks for the management role specifically');
  assert.equal(req.manager.nombre, 'Ana');
});

test('requireManager hands any verification failure (missing, wrong PIN, not a manager, locked) to the error handler', async () => {
  for (const status of [401, 403, 429]) {
    const verify = async () => { throw Object.assign(new Error('nope'), { statusCode: status }); };
    const outcome = await run(createRequireManager(verify), reqWith({ 'x-actor-nombre': 'Luis', 'x-actor-pin': '4321' }));
    assert.equal(outcome.error.statusCode, status);
  }
});

test('requireManager with no headers at all is a 401, without asking the PIN check to guess', async () => {
  const real = createRequireManager(async (nombre, pin) => {
    if (!nombre || !pin) throw Object.assign(new Error('Se requiere seleccionar tu nombre e ingresar tu PIN.'), { statusCode: 401 });
    return { nombre };
  });
  assert.equal((await run(real, reqWith({}))).error.statusCode, 401);
});

test('managerIfPresent is null when no credentials were sent, the manager when valid, and an error when wrong', async () => {
  const verify = async (nombre, pin) => {
    if (pin !== '123456') throw Object.assign(new Error('Nombre o PIN incorrectos.'), { statusCode: 401 });
    return { nombre, tipo: 'management' };
  };
  const optional = createManagerIfPresent(verify);
  assert.equal(await optional(reqWith({})), null, 'a public caller simply gets no manager');
  assert.equal((await optional(reqWith({ 'x-actor-nombre': 'Ana', 'x-actor-pin': '123456' }))).nombre, 'Ana');
  await assert.rejects(optional(reqWith({ 'x-actor-nombre': 'Ana', 'x-actor-pin': '000000' })), (error) => error.statusCode === 401);
});
