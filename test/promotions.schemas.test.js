const test = require('node:test');
const assert = require('node:assert/strict');
const { createPromotionSchema, reviewActionSchema } = require('../src/modules/promotions/schemas');

function validBase(overrides) {
  return {
    nombre: 'Promo', tipo: 'precio_fijo', producto_ids: [1, 2], precio_promocional: 6.99,
    fecha_inicio: '2026-09-01', fecha_fin: '2026-09-30', creado_por: 'María', ...overrides
  };
}

test('accepts a valid precio_fijo promotion', () => {
  assert.equal(createPromotionSchema.safeParse(validBase()).success, true);
});

test('accepts a valid descuento_porcentaje promotion scoped by producto_ids', () => {
  const data = validBase({ tipo: 'descuento_porcentaje', producto_ids: [3], precio_promocional: undefined, porcentaje_descuento: 20 });
  assert.equal(createPromotionSchema.safeParse(data).success, true);
});

test('accepts a valid descuento_porcentaje promotion scoped by categoria instead of producto_ids', () => {
  const data = validBase({ tipo: 'descuento_porcentaje', producto_ids: undefined, precio_promocional: undefined, categoria: 'Boutique', porcentaje_descuento: 10 });
  assert.equal(createPromotionSchema.safeParse(data).success, true);
});

test('accepts a valid compra_x_lleva_y promotion', () => {
  const data = validBase({
    tipo: 'compra_x_lleva_y', producto_ids: [5], precio_promocional: undefined,
    compra_cantidad: 2, lleva_producto_id: 5, lleva_cantidad: 1, lleva_descuento_pct: 100
  });
  assert.equal(createPromotionSchema.safeParse(data).success, true);
});

test('rejects precio_fijo missing precio_promocional', () => {
  const data = validBase({ precio_promocional: undefined });
  assert.equal(createPromotionSchema.safeParse(data).success, false);
});

test('rejects precio_fijo missing producto_ids', () => {
  const data = validBase({ producto_ids: undefined });
  assert.equal(createPromotionSchema.safeParse(data).success, false);
});

test('rejects descuento_porcentaje with neither producto_ids nor categoria', () => {
  const data = validBase({ tipo: 'descuento_porcentaje', producto_ids: undefined, precio_promocional: undefined, porcentaje_descuento: 20 });
  assert.equal(createPromotionSchema.safeParse(data).success, false);
});

test('rejects compra_x_lleva_y missing lleva_producto_id', () => {
  const data = validBase({ tipo: 'compra_x_lleva_y', precio_promocional: undefined, compra_cantidad: 2, lleva_cantidad: 1 });
  assert.equal(createPromotionSchema.safeParse(data).success, false);
});

test('rejects a fecha_fin earlier than fecha_inicio', () => {
  const data = validBase({ fecha_inicio: '2026-09-30', fecha_fin: '2026-09-01' });
  assert.equal(createPromotionSchema.safeParse(data).success, false);
});

test('rejects an unknown tipo', () => {
  const data = validBase({ tipo: 'buy_one_get_one_free' });
  assert.equal(createPromotionSchema.safeParse(data).success, false);
});

test('rejects a missing creado_por', () => {
  const data = validBase({ creado_por: undefined });
  assert.equal(createPromotionSchema.safeParse(data).success, false);
});

test('rejects a porcentaje_descuento over 100', () => {
  const data = validBase({ tipo: 'descuento_porcentaje', precio_promocional: undefined, porcentaje_descuento: 150 });
  assert.equal(createPromotionSchema.safeParse(data).success, false);
});

test('reviewActionSchema accepts an approve action with just actor credentials', () => {
  const data = { actor_nombre: 'Erika', actor_pin: '1234', accion: 'approve' };
  assert.equal(reviewActionSchema.safeParse(data).success, true);
});

test('reviewActionSchema requires a nota when requesting changes', () => {
  const data = { actor_nombre: 'Erika', actor_pin: '1234', accion: 'changes_requested' };
  assert.equal(reviewActionSchema.safeParse(data).success, false);
});

test('reviewActionSchema accepts changes_requested when a nota is provided', () => {
  const data = { actor_nombre: 'Erika', actor_pin: '1234', accion: 'changes_requested', nota: 'Ajustar el precio' };
  assert.equal(reviewActionSchema.safeParse(data).success, true);
});

test('reviewActionSchema rejects a missing actor_pin', () => {
  const data = { actor_nombre: 'Erika', accion: 'reject' };
  assert.equal(reviewActionSchema.safeParse(data).success, false);
});

test('reviewActionSchema rejects an unknown accion', () => {
  const data = { actor_nombre: 'Erika', actor_pin: '1234', accion: 'delete_everything' };
  assert.equal(reviewActionSchema.safeParse(data).success, false);
});
