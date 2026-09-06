const test = require('node:test');
const assert = require('node:assert/strict');
const { createSocialPostSchema, updateSocialPostSchema, reviewActionSchema } = require('../src/modules/social-posts/schemas');

const base = {
  promocion_id: 7,
  titular: 'Promo del día: Latte + Muffin',
  caption: 'Solo hoy en Café Rosinal',
  plataformas: ['instagram', 'facebook'],
  creado_por: 'Ana'
};

test('createSocialPostSchema accepts a well-formed post', () => {
  const result = createSocialPostSchema.safeParse(base);
  assert.equal(result.success, true);
});

test('createSocialPostSchema requires at least one platform', () => {
  const result = createSocialPostSchema.safeParse({ ...base, plataformas: [] });
  assert.equal(result.success, false);
});

test('createSocialPostSchema rejects an unknown platform', () => {
  const result = createSocialPostSchema.safeParse({ ...base, plataformas: ['tiktok'] });
  assert.equal(result.success, false);
});

test('createSocialPostSchema rejects a post with neither titular nor caption', () => {
  const result = createSocialPostSchema.safeParse({
    promocion_id: 7, plataformas: ['instagram'], creado_por: 'Ana'
  });
  assert.equal(result.success, false);
});

test('createSocialPostSchema requires a positive promocion_id', () => {
  const result = createSocialPostSchema.safeParse({ ...base, promocion_id: 0 });
  assert.equal(result.success, false);
});

test('createSocialPostSchema rejects a malformed programado_para', () => {
  const result = createSocialPostSchema.safeParse({ ...base, programado_para: '10/09/2026 2pm' });
  assert.equal(result.success, false);
});

test('createSocialPostSchema accepts a datetime-local programado_para', () => {
  const result = createSocialPostSchema.safeParse({ ...base, programado_para: '2026-09-10T14:30' });
  assert.equal(result.success, true);
});

test('createSocialPostSchema caps imagenes_adicionales at 6', () => {
  const result = createSocialPostSchema.safeParse({
    ...base, imagenes_adicionales: Array.from({ length: 7 }, (_, i) => `/uploads/${i}.jpg`)
  });
  assert.equal(result.success, false);
});

test('updateSocialPostSchema is fully partial', () => {
  const result = updateSocialPostSchema.safeParse({ caption: 'texto nuevo' });
  assert.equal(result.success, true);
});

test('reviewActionSchema still requires a nota for changes_requested', () => {
  const result = reviewActionSchema.safeParse({ actor_nombre: 'Ana', actor_pin: '1234', accion: 'changes_requested' });
  assert.equal(result.success, false);
});
