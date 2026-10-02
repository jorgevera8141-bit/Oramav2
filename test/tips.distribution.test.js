const test = require('node:test');
const assert = require('node:assert/strict');
const { distributeTips } = require('../src/modules/staff/service');

const staff = [
  { id: 1, nombre: 'Ana', tipo: 'staff', hours: 10 },
  { id: 2, nombre: 'Beto', tipo: 'management', hours: 20 },
  { id: 3, nombre: 'Caro', tipo: 'staff', hours: 10 }
];
const total = (distribution) => Math.round(distribution.reduce((sum, d) => sum + d.amount * 100, 0));

test('equal split gives every worker the same share and no cent is lost', () => {
  const result = distributeTips({ tips: 100, distributionType: 'equal', staffRows: staff });
  assert.deepEqual(result.map((d) => d.amount), [33.34, 33.33, 33.33]);
  assert.equal(total(result), 10000);
});

test('hours_worked split is proportional, keeps each worker\'s tipo, and sums exactly to the tips', () => {
  const result = distributeTips({ tips: 100, distributionType: 'hours_worked', staffRows: staff });
  assert.deepEqual(result.map((d) => d.amount), [25, 50, 25]);
  assert.deepEqual(result.map((d) => d.tipo), ['staff', 'management', 'staff']);
  assert.deepEqual(result.map((d) => d.hoursWorked), [10, 20, 10]);
  assert.equal(total(distributeTips({ tips: 99.99, distributionType: 'hours_worked', staffRows: staff })), 9999);
});

test('hours_worked falls back to an equal split when nobody has recorded hours', () => {
  const idle = staff.map((s) => ({ ...s, hours: 0 }));
  const result = distributeTips({ tips: 90, distributionType: 'hours_worked', staffRows: idle });
  assert.deepEqual(result.map((d) => d.amount), [30, 30, 30]);
});

test('percentage split uses the given percentages and sums exactly', () => {
  const result = distributeTips({ tips: 200, distributionType: 'percentage', staffRows: staff, percentages: { 1: 50, 2: 30, 3: 20 } });
  assert.deepEqual(result.map((d) => d.amount), [100, 60, 40]);
  assert.deepEqual(result.map((d) => d.percentage), [50, 30, 20]);
  assert.equal(total(distributeTips({ tips: 100, distributionType: 'percentage', staffRows: staff, percentages: { 1: 33.33, 2: 33.33, 3: 33.34 } })), 10000);
});

test('percentage split is rejected unless the percentages add up to 100', () => {
  const run = (percentages) => () => distributeTips({ tips: 100, distributionType: 'percentage', staffRows: staff, percentages });
  assert.throws(run(undefined), (error) => error.statusCode === 400);
  assert.throws(run({ 1: 50, 2: 30 }), (error) => error.statusCode === 400);
  assert.throws(run({ 1: 60, 2: 30, 3: 20 }), (error) => error.statusCode === 400);
  assert.throws(run({ 1: 110, 2: -10, 3: 0 }), (error) => error.statusCode === 400);
});

test('percentage split rejects a share for someone who did not work, but ignores blank or zero entries', () => {
  const run = (percentages) => () => distributeTips({ tips: 100, distributionType: 'percentage', staffRows: staff, percentages });
  assert.throws(run({ 1: 50, 2: 50, 9: 10 }), (error) => error.statusCode === 400);
  const ok = distributeTips({ tips: 100, distributionType: 'percentage', staffRows: staff, percentages: { 1: 50, 2: 50, 3: 0, 9: 0 } });
  assert.deepEqual(ok.map((d) => d.amount), [50, 50, 0]);
});

test('an unknown distribution type is rejected', () => {
  assert.throws(() => distributeTips({ tips: 10, distributionType: 'raffle', staffRows: staff }), (error) => error.statusCode === 400);
});
