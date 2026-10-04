const test = require('node:test');
const assert = require('node:assert/strict');
const { nextClave } = require('../src/modules/menu/clave');

const row = (categoria, clave) => ({ categoria, clave });
const scattered = (categoria, count) => Array.from({ length: count }, (_, i) => row(categoria, `${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(75 + ((i * 7) % 12))}0${(i % 9) + 1}`));
const range = (categoria, prefix, from, to) => Array.from({ length: to - from + 1 }, (_, i) => row(categoria, `${prefix}${String(from + i).padStart(2, '0')}`));

test('a category with one dominant prefix keeps it and takes the next number: Cafe a Granel CGR26 -> CGR27', () => {
  const existing = range('Cafe a Granel', 'CGR', 1, 26);
  assert.equal(nextClave({ nombre: 'CAFE EN GRANO NUEVO 1KG', categoria: 'Cafe a Granel' }, existing), 'CGR27');
});

test('the number sequence of a prefix is shared across categories (C is used in three)', () => {
  const existing = [...range('Cafe Espresso y Chocolate', 'C', 1, 12), ...range('Especialidades de Cafe', 'C', 40, 45), ...range('Cafe con Alcohol', 'C', 26, 36)];
  assert.equal(nextClave({ nombre: 'MOKA', categoria: 'Cafe Espresso y Chocolate' }, existing), 'C46');
});

test('the dominant prefix wins over a minority one in the same category', () => {
  const existing = [...range('Cafe con Alcohol', 'C', 26, 34), ...range('Cafe con Alcohol', 'CF', 26, 29)];
  assert.equal(nextClave({ nombre: 'CAFE IRLANDES', categoria: 'Cafe con Alcohol' }, existing).startsWith('C'), true);
  assert.match(nextClave({ nombre: 'CAFE IRLANDES', categoria: 'Cafe con Alcohol' }, existing), /^C\d+$/);
});

test('a mixed catch-all category names the clave from the product, like PV01 for PORTA VASOS', () => {
  const existing = [...range('Boutique', 'ES', 1, 6), ...scattered('Boutique', 26), row('Boutique', 'PV01'), row('Boutique', 'BC02'), row('Boutique', 'TZ01'), row('Boutique', 'CT02'), row('Boutique', 'DB01'), row('Boutique', 'TP01')];
  assert.equal(nextClave({ nombre: 'PORTA CUCHARAS', categoria: 'Boutique' }, existing), 'PC01');
  assert.equal(nextClave({ nombre: 'PORTA VASOS GRANDE', categoria: 'Boutique' }, existing), 'PV02', 'same initials continue the existing numbering');
  assert.equal(nextClave({ nombre: 'CROISSANT', categoria: 'Boutique' }, existing), 'CRO01', 'one word uses its first three letters');
});

test('small words and accents are ignored when building the prefix from a name', () => {
  assert.equal(nextClave({ nombre: 'Té de la casa', categoria: 'Nueva' }, []), 'TC01');
  assert.equal(nextClave({ nombre: 'Panqué con mermelada', categoria: 'Nueva' }, []), 'PM01');
});

test('a brand-new category with no claves starts at 01', () => {
  assert.equal(nextClave({ nombre: 'Jugo de naranja', categoria: 'Jugos' }, []), 'JN01');
});

test('numbers keep the width the category already uses and never collide, even in different case', () => {
  const existing = [...range('Reposteria', 'R', 90, 99), row('Reposteria', 'r100')];
  assert.equal(nextClave({ nombre: 'ROSCA', categoria: 'Reposteria' }, existing), 'R101');
});

test('a name with no letters falls back to the category initials, and never returns an empty clave', () => {
  assert.equal(nextClave({ nombre: '123', categoria: 'Bebidas' }, []), 'BEB01');
  assert.match(nextClave({ nombre: '', categoria: '' }, []), /^[A-Z]+\d{2,}$/);
});

test('claves that do not follow the pattern (MOLI, EXTRA) are ignored, not crashed on', () => {
  const existing = [row('Boutique', 'MOLI'), row('Boutique', 'EXTRA'), row('Boutique', null), row('Boutique', '')];
  assert.equal(nextClave({ nombre: 'MOLINO MANUAL', categoria: 'Boutique' }, existing), 'MM01');
});

test('real shapes: a category leading with 33% and a clear lead keeps its prefix, one at 11% does not', () => {
  const espresso = [...range('Espresso', 'C', 1, 12), ...range('Espresso', 'CH', 1, 7), ...scattered('Espresso', 17)];
  assert.match(nextClave({ nombre: 'MOKA', categoria: 'Espresso' }, espresso), /^C\d{2,}$/);
  const tes = [...range('Tes', 'TMA', 1, 4), ...scattered('Tes', 33)];
  assert.notEqual(nextClave({ nombre: 'TE DE MANZANILLA', categoria: 'Tes' }, tes).replace(/\d+$/, ''), 'TMA');
});

test('a stray far-away clave (C311 after C60, R112 after R50) does not move the sequence', () => {
  const existing = [...range('Espresso', 'C', 1, 60), row('Alcohol', 'C311'), ...range('Reposteria', 'R', 3, 50), row('Reposteria', 'R112')];
  assert.equal(nextClave({ nombre: 'MOKA', categoria: 'Espresso' }, existing.filter((r) => r.categoria !== 'Reposteria')), 'C61');
  assert.equal(nextClave({ nombre: 'ROSCA', categoria: 'Reposteria' }, existing.filter((r) => r.categoria === 'Reposteria')), 'R51');
});
