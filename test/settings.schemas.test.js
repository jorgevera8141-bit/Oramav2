const test = require('node:test');
const assert = require('node:assert/strict');
const { updateSettingSchema } = require('../src/modules/settings/schemas');

test('updateSettingSchema accepts a value within range', () => {
  assert.equal(updateSettingSchema.safeParse({ value: 42 }).success, true);
});

test('updateSettingSchema accepts the boundary values 0 and 100', () => {
  assert.equal(updateSettingSchema.safeParse({ value: 0 }).success, true);
  assert.equal(updateSettingSchema.safeParse({ value: 100 }).success, true);
});

test('updateSettingSchema rejects a value below 0', () => {
  assert.equal(updateSettingSchema.safeParse({ value: -1 }).success, false);
});

test('updateSettingSchema rejects a value above 100', () => {
  assert.equal(updateSettingSchema.safeParse({ value: 101 }).success, false);
});

test('updateSettingSchema rejects a non-numeric value', () => {
  assert.equal(updateSettingSchema.safeParse({ value: '50' }).success, false);
});

test('updateSettingSchema rejects a missing value', () => {
  assert.equal(updateSettingSchema.safeParse({}).success, false);
});
