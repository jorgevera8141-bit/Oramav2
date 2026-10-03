const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_TAX, taxFromSettings, netOfIva, menuPriceFromNet } = require('../src/shared/tax');

test('with no saved setting, menu prices include 16% IVA', () => {
  assert.deepEqual(DEFAULT_TAX, { ivaRate: 16, pricesIncludeIva: true });
  assert.deepEqual(taxFromSettings({}), DEFAULT_TAX);
});

test('taxFromSettings reads the stored rate and the include-IVA switch', () => {
  assert.deepEqual(taxFromSettings({ iva_rate: '8', menu_prices_include_iva: '0' }), { ivaRate: 8, pricesIncludeIva: false });
  assert.deepEqual(taxFromSettings({ iva_rate: '16', menu_prices_include_iva: '1' }), { ivaRate: 16, pricesIncludeIva: true });
  assert.deepEqual(taxFromSettings({ iva_rate: 'garbage', menu_prices_include_iva: 'x' }), DEFAULT_TAX, 'bad stored values fall back to the default');
});

test('netOfIva removes IVA only when the menu price includes it', () => {
  assert.equal(Number(netOfIva(116, DEFAULT_TAX).toFixed(4)), 100);
  assert.equal(netOfIva(43, { ivaRate: 16, pricesIncludeIva: false }), 43);
  assert.equal(Number(netOfIva(108, { ivaRate: 8, pricesIncludeIva: true }).toFixed(4)), 100);
});

test('menuPriceFromNet is the price to print on the menu', () => {
  assert.equal(Number(menuPriceFromNet(100, DEFAULT_TAX).toFixed(4)), 116);
  assert.equal(menuPriceFromNet(100, { ivaRate: 16, pricesIncludeIva: false }), 100);
});
