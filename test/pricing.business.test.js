const test = require('node:test');
const assert = require('node:assert/strict');
const { calculatePricing } = require('../src/modules/pricing/calculator');
const { DEFAULT_TAX } = require('../src/shared/tax');
const { DEFAULT_BUSINESS, businessFromSettings } = require('../src/shared/business');

const base = {
  ingredientsCost: 20,
  extraCosts: {},
  preparation: {},
  fixedCosts: {},
  targetMargin: 50,
  includeIVA: true,
  menuPrice: 0
};
const noIva = { ivaRate: 16, pricesIncludeIva: false };
const calc = (over = {}, business = {}, tax = noIva) => calculatePricing({ ...base, ...over }, tax, { ...DEFAULT_BUSINESS, ...business });

test('with no business settings the price is unchanged: 20 at 50% is 40', () => {
  assert.equal(calc().suggestedSellingPrice, 40);
});

test('1 free per 10 paid raises the cost of each paid drink by 10%', () => {
  const r = calc({}, { paidPerFree: 10 });
  assert.equal(r.compsCostPerServing, 2);
  assert.equal(r.suggestedSellingPrice, 44, '(20 x 1.1) / 0.5');
});

test('the card fee is a share of every price, so it comes out of the margin', () => {
  // 3.5% fee on 40% of sales = 1.4% of price: 20 / (1 - 0.5 - 0.014)
  const r = calc({}, { cardFeePct: 3.5, cardSharePct: 40 });
  assert.equal(r.cardFeeRatePct, 1.4);
  assert.equal(r.suggestedSellingPrice, 41.15);
});

test('the card terminal charges on what the customer pays, IVA included', () => {
  const r = calc({}, { cardFeePct: 3.5, cardSharePct: 100 }, DEFAULT_TAX);
  assert.equal(r.cardFeeRatePct, 4.06, '3.5% x 1.16 of the net price');
});

test('a fee and margin that leave nothing to cover the cost are refused', () => {
  assert.throws(() => calc({ targetMargin: 99 }, { cardFeePct: 3.5, cardSharePct: 100 }, DEFAULT_TAX), (error) => error.statusCode === 400 && /margen/i.test(error.message));
});

test('the actual margin of the current menu price includes the free drinks and the card fee', () => {
  const r = calc({ menuPrice: 50 }, { paidPerFree: 10, cardFeePct: 3.5, cardSharePct: 40 });
  // fee 1.4% of 50 = 0.7; cost 22; margin (50 - 0.7 - 22) / 50
  assert.equal(r.actualMargin, 54.6);
});

test('rounding goes up to the next step on the menu price and reports the margin there', () => {
  const r = calc({ targetMargin: 65, ingredientsCost: 19.1 }, { roundTo: 5 }, DEFAULT_TAX);
  assert.equal(r.suggestedMenuPrice, 63.3);
  assert.equal(r.roundedMenuPrice, 65);
  assert.ok(r.marginAtRoundedPrice > 65);
});

test('rounding is off when the step is 0', () => {
  assert.equal(calc({}, { roundTo: 0 }).roundedMenuPrice, null);
});

test('overhead is spread over every unit made, free ones included, and the free ones are paid by the others', () => {
  const r = calc({ fixedCosts: { rent: 1000 }, estimatedMonthlyUnits: 500 }, { paidPerFree: 10 });
  assert.equal(r.fixedCostPerUnit, 2);
  assert.equal(r.fullCostPerServing, 24.2, '(20 + 2) x 1.1');
  assert.equal(r.fullCostSellingPrice, 48.4);
});

test('settings parse: blanks and junk fall back to the neutral default', () => {
  assert.deepEqual(businessFromSettings({}), DEFAULT_BUSINESS);
  const b = businessFromSettings({ card_fee_pct: '3.5', card_share_pct: '40', loyalty_paid_per_free: '10', price_round_to: '5', fixed_rent: '15000' });
  assert.equal(b.cardFeePct, 3.5);
  assert.equal(b.paidPerFree, 10);
  assert.equal(b.fixedCosts.rent, 15000);
  assert.equal(businessFromSettings({ card_fee_pct: 'abc', card_share_pct: '150' }).cardSharePct, 0);
});
