const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDateParam } = require('../src/shared/dates');

test('parseDateParam accepts a well-formed ISO date', () => {
  assert.equal(parseDateParam('2026-09-06'), '2026-09-06');
});

test('parseDateParam rejects undefined/missing input', () => {
  assert.equal(parseDateParam(undefined), null);
});

test('parseDateParam rejects malformed dates', () => {
  assert.equal(parseDateParam('09-06-2026'), null);
  assert.equal(parseDateParam('2026/09/06'), null);
  assert.equal(parseDateParam('not-a-date'), null);
  assert.equal(parseDateParam('2026-9-6'), null);
});

test('parseDateParam rejects an attempted SQL-injection-shaped value', () => {
  assert.equal(parseDateParam("2026-09-06'; DROP TABLE ordenes;--"), null);
});
