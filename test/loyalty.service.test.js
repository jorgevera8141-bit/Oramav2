const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone, computeBalance, REWARD_STAMPS_REQUIRED } = require('../src/modules/loyalty/service');

test('REWARD_STAMPS_REQUIRED matches the physical card (9 stamps -> free drink)', () => {
  assert.equal(REWARD_STAMPS_REQUIRED, 9);
});

test('normalizePhone strips non-digit characters', () => {
  assert.equal(normalizePhone('(449) 979-6142'), '4499796142');
});

test('normalizePhone keeps only the last 10 digits (drops a leading country code)', () => {
  assert.equal(normalizePhone('+52 449 979 6142'), '4499796142');
});

test('normalizePhone returns an empty string for nullish input', () => {
  assert.equal(normalizePhone(undefined), '');
  assert.equal(normalizePhone(null), '');
});

test('computeBalance counts only unconsumed stamps', () => {
  const stamps = [
    { id: 1, consumed_by_redencion_id: null },
    { id: 2, consumed_by_redencion_id: 5 },
    { id: 3, consumed_by_redencion_id: null },
    { id: 4, consumed_by_redencion_id: null }
  ];
  assert.equal(computeBalance(stamps), 3);
});

test('computeBalance returns 0 for an empty stamp list', () => {
  assert.equal(computeBalance([]), 0);
});
