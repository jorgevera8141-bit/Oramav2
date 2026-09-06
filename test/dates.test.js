const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDateParam, previousEqualPeriod } = require('../src/shared/dates');

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

test('previousEqualPeriod returns the immediately preceding period of equal length', () => {
  assert.deepEqual(previousEqualPeriod('2026-09-01', '2026-09-07'), { from: '2026-08-25', to: '2026-08-31' });
});

test('previousEqualPeriod handles a single-day range', () => {
  assert.deepEqual(previousEqualPeriod('2026-09-05', '2026-09-05'), { from: '2026-09-04', to: '2026-09-04' });
});

test('previousEqualPeriod handles a month boundary correctly', () => {
  assert.deepEqual(previousEqualPeriod('2026-03-01', '2026-03-01'), { from: '2026-02-28', to: '2026-02-28' });
});
