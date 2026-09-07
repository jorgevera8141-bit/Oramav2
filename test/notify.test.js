const test = require('node:test');
const assert = require('node:assert/strict');
const { promoMessage, socialPostMessage, NOTIFY_CONFIGURED } = require('../src/shared/notify');

const promo = {
  nombre: 'Rebanada + café',
  tipo: 'descuento_porcentaje',
  porcentaje_descuento: '15',
  categoria: 'Reposteria',
  fecha_inicio: '2026-09-06',
  fecha_fin: '2026-12-31'
};

test('NOTIFY_CONFIGURED is false without TWILIO_* env vars', () => {
  assert.equal(NOTIFY_CONFIGURED, false);
});

test('promoMessage carries the name, benefit, dates, creator and a review link', () => {
  const msg = promoMessage(promo, 'Andrea');
  assert.match(msg, /Rebanada \+ café/);
  assert.match(msg, /15% de descuento/);
  assert.match(msg, /Categoría: Reposteria/);
  assert.match(msg, /2026-09-06 → 2026-12-31/);
  assert.match(msg, /Enviada por Andrea/);
  assert.match(msg, /#promociones/);
});

test('promoMessage omits the category line when there is none', () => {
  const msg = promoMessage({ ...promo, categoria: null }, 'Andrea');
  assert.doesNotMatch(msg, /Categoría:/);
});

test('promoMessage describes a compra_x_lleva_y benefit', () => {
  const msg = promoMessage({ ...promo, tipo: 'compra_x_lleva_y', compra_cantidad: 2, lleva_cantidad: 1, lleva_descuento_pct: '100' }, 'Andrea');
  assert.match(msg, /Compra 2, lleva 1 al 100%/);
});

test('socialPostMessage carries titular, platforms, creator and the link', () => {
  const msg = socialPostMessage({ titular: 'Promo del día', plataformas: ['instagram', 'facebook'], caption: 'Ven hoy' }, 'Andrea');
  assert.match(msg, /Promo del día/);
  assert.match(msg, /instagram, facebook/);
  assert.match(msg, /Enviada por Andrea/);
  assert.match(msg, /#promociones/);
});
