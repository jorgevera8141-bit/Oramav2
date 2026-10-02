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

const { toPublicCustomer, assertCustomerActive, awardStamp, redeemRewardWithClient } = require('../src/modules/loyalty/service');

test('toPublicCustomer exposes only what the card page and cashier need', () => {
  const row = { id: 4, phone: '4491234567', nombre: 'Ana', marketing_consent: true, consent_at: '2026-10-01', consent_verified: false, status: 'active', created_at: '2026-09-01' };
  assert.deepEqual(toPublicCustomer(row), { id: 4, phone: '4491234567', nombre: 'Ana' });
});

test('assertCustomerActive rejects suspended and deleted cards with 403', () => {
  assert.doesNotThrow(() => assertCustomerActive({ status: 'active' }));
  for (const status of ['suspended', 'deleted']) {
    assert.throws(() => assertCustomerActive({ status }), (error) => error.statusCode === 403);
  }
});

test('awardStamp only stamps cards that are active', async () => {
  const calls = [];
  await awardStamp(4, 90, { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /status = 'active'/);
});

test('redeemRewardWithClient refuses a suspended card before touching any stamps', async () => {
  const seen = [];
  const client = { query: async (sql) => { seen.push(sql); return sql.includes('FROM loyalty_customers') ? { rows: [{ status: 'suspended' }] } : { rows: [] }; } };
  await assert.rejects(() => redeemRewardWithClient(4, 90, 'Ana', client), (error) => error.statusCode === 403);
  assert.ok(!seen.some((sql) => sql.includes('loyalty_stamps')));
});

test('redeemRewardWithClient reports 404 for an unknown customer', async () => {
  const client = { query: async () => ({ rows: [] }) };
  await assert.rejects(() => redeemRewardWithClient(999, 90, 'Ana', client), (error) => error.statusCode === 404);
});
