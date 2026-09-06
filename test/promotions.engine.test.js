const test = require('node:test');
const assert = require('node:assert/strict');
const { applyPromotions, isWithinWindow, isPromotionEligible, hasWindowStarted } = require('../src/modules/promotions/engine');

const NOW = new Date('2026-09-06T18:00:00.000Z');

function basePromo(overrides) {
  return {
    id: 1,
    nombre: 'Promo',
    tipo: 'precio_fijo',
    producto_ids: null,
    categoria: null,
    precio_promocional: null,
    porcentaje_descuento: null,
    compra_cantidad: null,
    lleva_producto_id: null,
    lleva_cantidad: null,
    lleva_descuento_pct: 100,
    fecha_inicio: '2026-09-01',
    hora_inicio: null,
    fecha_fin: '2026-09-30',
    hora_fin: null,
    limite_unidades: null,
    apilable: false,
    estado: 'ACTIVE',
    ...overrides
  };
}

test('precio_fijo bundle: Latte + Muffin at $6.99 discounts the exact $1.51 difference', () => {
  const promo = basePromo({ id: 1, nombre: 'Latte + Muffin', tipo: 'precio_fijo', producto_ids: [1, 2], precio_promocional: 6.99 });
  const items = [
    { menu_item_id: 1, nombre: 'Latte', categoria: 'Café', precio: 5.0, cantidad: 1 },
    { menu_item_id: 2, nombre: 'Muffin', categoria: 'Repostería', precio: 3.5, cantidad: 1 }
  ];
  const result = applyPromotions({ items, promotions: [promo], now: NOW });
  assert.equal(result.subtotal, 8.5);
  assert.equal(result.descuento_total, 1.51);
  assert.equal(result.total, 6.99);
  assert.equal(result.promociones_aplicadas.length, 1);
  assert.equal(result.promociones_aplicadas[0].promocion_id, 1);
});

test('precio_fijo bundle only claims one unit per product, leaving extra quantity at full price', () => {
  const promo = basePromo({ id: 1, tipo: 'precio_fijo', producto_ids: [1, 2], precio_promocional: 6.99 });
  const items = [
    { menu_item_id: 1, nombre: 'Latte', categoria: 'Café', precio: 5.0, cantidad: 2 },
    { menu_item_id: 2, nombre: 'Muffin', categoria: 'Repostería', precio: 3.5, cantidad: 1 }
  ];
  const result = applyPromotions({ items, promotions: [promo], now: NOW });
  assert.equal(result.total, 6.99 + 5.0);
  const fullPriceLatte = result.lineas.find((l) => l.menu_item_id === 1 && l.promocion_id === null);
  assert.ok(fullPriceLatte, 'expected a full-price remainder line for the second Latte');
  assert.equal(fullPriceLatte.cantidad, 1);
});

test('descuento_porcentaje applies to every matching unit of a product', () => {
  const promo = basePromo({ id: 2, tipo: 'descuento_porcentaje', producto_ids: [3], porcentaje_descuento: 20 });
  const items = [{ menu_item_id: 3, nombre: 'Cold Brew', categoria: 'Café', precio: 45, cantidad: 3 }];
  const result = applyPromotions({ items, promotions: [promo], now: NOW });
  assert.equal(result.descuento_total, 27);
  assert.equal(result.total, 108);
});

test('descuento_porcentaje applies category-wide when no producto_ids given', () => {
  const promo = basePromo({ id: 3, tipo: 'descuento_porcentaje', categoria: 'Boutique', porcentaje_descuento: 10 });
  const items = [
    { menu_item_id: 10, nombre: 'Bolsa de café', categoria: 'Boutique', precio: 200, cantidad: 1 },
    { menu_item_id: 11, nombre: 'Taza', categoria: 'Boutique', precio: 100, cantidad: 1 },
    { menu_item_id: 12, nombre: 'Latte', categoria: 'Café', precio: 50, cantidad: 1 }
  ];
  const result = applyPromotions({ items, promotions: [promo], now: NOW });
  assert.equal(result.descuento_total, 30);
  assert.equal(result.total, 320);
});

test('compra_x_lleva_y: classic 2x1 gives one free unit per pair', () => {
  const promo = basePromo({
    id: 4, tipo: 'compra_x_lleva_y', producto_ids: [5], compra_cantidad: 2,
    lleva_producto_id: 5, lleva_cantidad: 1, lleva_descuento_pct: 100
  });
  const items = [{ menu_item_id: 5, nombre: 'Americano', categoria: 'Café', precio: 40, cantidad: 3 }];
  const result = applyPromotions({ items, promotions: [promo], now: NOW });
  // 3 units -> 1 set of 2 -> 1 free, 2 paid: total = 2*40 = 80
  assert.equal(result.total, 80);
  assert.equal(result.descuento_total, 40);
});

test('compra_x_lleva_y grants zero free units below the threshold', () => {
  const promo = basePromo({
    id: 4, tipo: 'compra_x_lleva_y', producto_ids: [5], compra_cantidad: 2,
    lleva_producto_id: 5, lleva_cantidad: 1, lleva_descuento_pct: 100
  });
  const items = [{ menu_item_id: 5, nombre: 'Americano', categoria: 'Café', precio: 40, cantidad: 1 }];
  const result = applyPromotions({ items, promotions: [promo], now: NOW });
  assert.equal(result.descuento_total, 0);
  assert.equal(result.total, 40);
});

test('non-stacking default: the more specific (product-scoped) promotion wins over a category-wide one', () => {
  const productPromo = basePromo({ id: 1, tipo: 'descuento_porcentaje', producto_ids: [1], porcentaje_descuento: 50 });
  const categoryPromo = basePromo({ id: 2, tipo: 'descuento_porcentaje', categoria: 'Café', porcentaje_descuento: 10 });
  const items = [{ menu_item_id: 1, nombre: 'Latte', categoria: 'Café', precio: 50, cantidad: 1 }];
  const result = applyPromotions({ items, promotions: [categoryPromo, productPromo], now: NOW });
  assert.equal(result.promociones_aplicadas.length, 1);
  assert.equal(result.promociones_aplicadas[0].promocion_id, 1);
  assert.equal(result.descuento_total, 25);
});

test('a unit is never discounted twice even when two eligible promotions could both match it', () => {
  const promoA = basePromo({ id: 1, tipo: 'descuento_porcentaje', producto_ids: [1], porcentaje_descuento: 20 });
  const promoB = basePromo({ id: 2, tipo: 'descuento_porcentaje', producto_ids: [1], porcentaje_descuento: 30 });
  const items = [{ menu_item_id: 1, nombre: 'Latte', categoria: 'Café', precio: 50, cantidad: 1 }];
  const result = applyPromotions({ items, promotions: [promoA, promoB], now: NOW });
  assert.equal(result.promociones_aplicadas.length, 1, 'only the lower-id promotion should have applied');
  assert.equal(result.promociones_aplicadas[0].promocion_id, 1);
});

test('expired promotion (fecha_fin in the past) is never applied', () => {
  const promo = basePromo({ id: 1, tipo: 'descuento_porcentaje', producto_ids: [1], porcentaje_descuento: 50, fecha_inicio: '2026-01-01', fecha_fin: '2026-01-31' });
  const items = [{ menu_item_id: 1, nombre: 'Latte', categoria: 'Café', precio: 50, cantidad: 1 }];
  const result = applyPromotions({ items, promotions: [promo], now: NOW });
  assert.equal(result.descuento_total, 0);
  assert.equal(result.total, 50);
});

test('a promotion not yet started (fecha_inicio in the future) is not applied', () => {
  const promo = basePromo({ id: 1, tipo: 'descuento_porcentaje', producto_ids: [1], porcentaje_descuento: 50, fecha_inicio: '2026-12-01', fecha_fin: '2026-12-31' });
  const items = [{ menu_item_id: 1, nombre: 'Latte', categoria: 'Café', precio: 50, cantidad: 1 }];
  const result = applyPromotions({ items, promotions: [promo], now: NOW });
  assert.equal(result.descuento_total, 0);
});

test('a disabled (non-ACTIVE) promotion is never applied regardless of dates', () => {
  const promo = basePromo({ id: 1, tipo: 'descuento_porcentaje', producto_ids: [1], porcentaje_descuento: 50, estado: 'CANCELLED' });
  const items = [{ menu_item_id: 1, nombre: 'Latte', categoria: 'Café', precio: 50, cantidad: 1 }];
  const result = applyPromotions({ items, promotions: [promo], now: NOW });
  assert.equal(result.descuento_total, 0);
});

test('a quantity-limited promotion stops applying once its redemption limit is reached', () => {
  const promo = basePromo({ id: 1, tipo: 'descuento_porcentaje', producto_ids: [1], porcentaje_descuento: 50, limite_unidades: 10 });
  const items = [{ menu_item_id: 1, nombre: 'Latte', categoria: 'Café', precio: 50, cantidad: 1 }];
  const underLimit = applyPromotions({ items, promotions: [promo], now: NOW, redemptionCounts: { 1: 9 } });
  assert.equal(underLimit.descuento_total, 25);
  const atLimit = applyPromotions({ items, promotions: [promo], now: NOW, redemptionCounts: { 1: 10 } });
  assert.equal(atLimit.descuento_total, 0);
});

test('a time-restricted promotion only applies within its hora_inicio/hora_fin window', () => {
  const promo = basePromo({ id: 1, tipo: 'descuento_porcentaje', producto_ids: [1], porcentaje_descuento: 50, hora_inicio: '19:00:00', hora_fin: '21:00:00' });
  const items = [{ menu_item_id: 1, nombre: 'Latte', categoria: 'Café', precio: 50, cantidad: 1 }];
  const outsideWindow = applyPromotions({ items, promotions: [promo], now: NOW }); // NOW is 18:00 UTC
  assert.equal(outsideWindow.descuento_total, 0);
  const insideWindow = applyPromotions({ items, promotions: [promo], now: new Date('2026-09-06T20:00:00.000Z') });
  assert.equal(insideWindow.descuento_total, 25);
});

test('isWithinWindow rejects a date outside the promotion range', () => {
  const promo = basePromo({ fecha_inicio: '2026-09-01', fecha_fin: '2026-09-05' });
  assert.equal(isWithinWindow(promo, NOW), false);
});

test('isPromotionEligible rejects an expired promotion even without a limit', () => {
  const promo = basePromo({ fecha_inicio: '2026-01-01', fecha_fin: '2026-01-02' });
  assert.equal(isPromotionEligible(promo, NOW, {}), false);
});

test('hasWindowStarted is true once fecha_inicio is today and hora_inicio has passed', () => {
  const promo = basePromo({ fecha_inicio: '2026-09-06', hora_inicio: '10:00:00' });
  assert.equal(hasWindowStarted(promo, NOW), true); // NOW is 18:00 UTC
});

test('hasWindowStarted is false when hora_inicio is later today', () => {
  const promo = basePromo({ fecha_inicio: '2026-09-06', hora_inicio: '22:00:00' });
  assert.equal(hasWindowStarted(promo, NOW), false);
});

test('hasWindowStarted is false when fecha_inicio is a future date', () => {
  const promo = basePromo({ fecha_inicio: '2026-09-10' });
  assert.equal(hasWindowStarted(promo, NOW), false);
});

test('hasWindowStarted is true when fecha_inicio is a past date regardless of hora_inicio', () => {
  const promo = basePromo({ fecha_inicio: '2026-09-01', hora_inicio: '23:59:00' });
  assert.equal(hasWindowStarted(promo, NOW), true);
});

test('regression: hasWindowStarted handles fecha_inicio as a raw pg Date object, not just a string', () => {
  // pg returns DATE columns as JS Date objects before res.json() serializes them; comparing a
  // Date to a 'YYYY-MM-DD' string with </> used to silently coerce to NaN (always false), making
  // a future-dated promotion appear as if it had already started. See engine.js's toDateString.
  const futurePromo = basePromo({ fecha_inicio: new Date('2026-12-01T08:00:00.000Z'), hora_inicio: null });
  assert.equal(hasWindowStarted(futurePromo, NOW), false);
  const pastPromo = basePromo({ fecha_inicio: new Date('2026-01-01T08:00:00.000Z'), hora_inicio: null });
  assert.equal(hasWindowStarted(pastPromo, NOW), true);
});

test('regression: isWithinWindow handles fecha_inicio/fecha_fin as raw pg Date objects', () => {
  const promo = basePromo({ fecha_inicio: new Date('2026-12-01T08:00:00.000Z'), fecha_fin: new Date('2026-12-31T08:00:00.000Z') });
  assert.equal(isWithinWindow(promo, NOW), false);
});

test('no eligible promotions leaves the order at full price', () => {
  const items = [{ menu_item_id: 1, nombre: 'Latte', categoria: 'Café', precio: 50, cantidad: 2 }];
  const result = applyPromotions({ items, promotions: [], now: NOW });
  assert.equal(result.total, 100);
  assert.equal(result.descuento_total, 0);
  assert.equal(result.promociones_aplicadas.length, 0);
});
