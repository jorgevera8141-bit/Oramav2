const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUnit, convertQuantity } = require('../src/shared/units');

test('normalizeUnit understands the spellings people type, case and accents aside', () => {
  for (const [typed, canonical] of [['kg', 'kg'], ['Kilos', 'kg'], ['g', 'g'], ['gr', 'g'], ['Gramos', 'g'], ['litro', 'l'], ['Litros', 'l'], ['L', 'l'], ['lt', 'l'], ['ml', 'ml'], ['Pieza', 'pieza'], ['piezas', 'pieza'], ['pz', 'pieza'], ['unidad', 'pieza'], [' kg ', 'kg']]) {
    assert.equal(normalizeUnit(typed), canonical, typed);
  }
  assert.equal(normalizeUnit('cucharada'), null, 'an unknown unit is not guessed');
  assert.equal(normalizeUnit(''), null);
  assert.equal(normalizeUnit(undefined), null);
});

test('convertQuantity converts within mass, within volume, and leaves matching units alone', () => {
  assert.equal(convertQuantity(18, 'g', 'kg'), 0.018);
  assert.equal(convertQuantity(250, 'ml', 'litro'), 0.25);
  assert.equal(convertQuantity(2, 'kg', 'g'), 2000);
  assert.equal(convertQuantity(1.5, 'l', 'ml'), 1500);
  assert.equal(convertQuantity(3, 'pieza', 'unidad'), 3);
  assert.equal(convertQuantity(7, 'kg', 'kg'), 7);
});

test('convertQuantity refuses to convert between a weight, a volume and a count, and names the problem', () => {
  assert.throws(() => convertQuantity(10, 'ml', 'kg'), (error) => error.statusCode === 400 && /ml/.test(error.message) && /kg/.test(error.message));
  assert.throws(() => convertQuantity(1, 'pieza', 'g'), (error) => error.statusCode === 400);
  assert.throws(() => convertQuantity(1, 'cucharada', 'g'), (error) => error.statusCode === 400 && /cucharada/.test(error.message));
});
