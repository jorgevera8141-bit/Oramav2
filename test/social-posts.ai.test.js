const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCopyPrompt, parseJsonLoose, resumenPrecio } = require('../src/modules/social-posts/ai');
const { buildImagePrompt } = require('../src/modules/social-posts/image-gen');

const promo = {
  nombre: 'Latte + Muffin',
  tipo: 'precio_fijo',
  precio_promocional: '69',
  descripcion: 'Combo de media tarde',
  categoria: 'Reposteria',
  condiciones: 'Solo para llevar',
  fecha_inicio: '2026-09-06',
  fecha_fin: '2026-09-30'
};

test('resumenPrecio describes each promo type in words', () => {
  assert.match(resumenPrecio({ tipo: 'precio_fijo', precio_promocional: '69' }), /\$69/);
  assert.match(resumenPrecio({ tipo: 'descuento_porcentaje', porcentaje_descuento: '15' }), /15%/);
  assert.match(resumenPrecio({ tipo: 'compra_x_lleva_y', compra_cantidad: 2, lleva_cantidad: 1, lleva_descuento_pct: '100' }), /gratis/);
});

test('buildCopyPrompt carries the promo name, benefit, and dates', () => {
  const prompt = buildCopyPrompt(promo);
  assert.match(prompt, /Latte \+ Muffin/);
  assert.match(prompt, /\$69/);
  assert.match(prompt, /2026-09-06/);
  assert.match(prompt, /2026-09-30/);
});

test('parseJsonLoose accepts bare JSON', () => {
  assert.deepEqual(parseJsonLoose('{"titular":"Hola"}'), { titular: 'Hola' });
});

test('parseJsonLoose strips ```json fences', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"titular":"Hola"}\n```'), { titular: 'Hola' });
});

test('parseJsonLoose strips a bare ``` fence', () => {
  assert.deepEqual(parseJsonLoose('```\n{"a":1}\n```'), { a: 1 });
});

test('parseJsonLoose throws on non-JSON', () => {
  assert.throws(() => parseJsonLoose('lo siento, no puedo'));
});

test('buildImagePrompt scopes to the promo category and forbids in-image text', () => {
  const prompt = buildImagePrompt(promo);
  assert.match(prompt, /Reposteria/);
  assert.match(prompt, /Latte \+ Muffin/);
  assert.match(prompt, /Sin texto/i);
});

test('buildImagePrompt falls back to a generic subject without a category', () => {
  const prompt = buildImagePrompt({ nombre: 'Promo', categoria: null });
  assert.match(prompt, /cafeter[ií]a/i);
});

test('buildImagePrompt appends an extra instruction when given', () => {
  const prompt = buildImagePrompt(promo, 'en tonos otoñales');
  assert.match(prompt, /tonos otoñales$/);
});
