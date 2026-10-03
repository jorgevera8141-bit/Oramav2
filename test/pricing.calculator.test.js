const test = require('node:test');
const assert = require('node:assert/strict');
const { calculatePricing } = require('../src/modules/pricing/calculator');
const { DEFAULT_TAX } = require('../src/shared/tax');

const latte = {
  ingredientsCost: 13.6,
  extraCosts: { packaging: 3, labor: 0, other: 0.5 },
  preparation: { prepTimeMinutes: 2, yieldServings: 1, laborRatePerHour: 60 },
  fixedCosts: {},
  targetMargin: 65,
  includeIVA: true,
  menuPrice: 43
};
const calc = (over = {}, tax = DEFAULT_TAX) => calculatePricing({ ...latte, ...over }, tax);

test('the arithmetic: cost 19.10, price at 65% margin 54.57, with 16% IVA 63.30', () => {
  const r = calc();
  assert.equal(r.laborCostPerServing, 2);
  assert.equal(r.totalCostPerServing, 19.1);
  assert.equal(r.suggestedSellingPrice, 54.57);
  assert.equal(r.priceWithIVA, 63.3);
  assert.equal(r.suggestedMenuPrice, 63.3, 'the price to print on a menu whose prices include IVA');
});

test('the actual margin is measured on the price without IVA when the menu price includes it', () => {
  const r = calc();
  assert.equal(r.menuPriceNet, 37.07);
  assert.equal(r.actualMargin, 48.47, 'it was 55.58 when IVA was treated as revenue');
  assert.equal(r.isBelowTarget, true);
  assert.equal(r.savingsOrShortfall, -20.3, 'compares the $43 menu price with the $63.30 price to charge, both with IVA');
});

test('if menu prices do not include IVA nothing is taken off', () => {
  const r = calc({}, { ivaRate: 16, pricesIncludeIva: false });
  assert.equal(r.menuPriceNet, 43);
  assert.equal(r.actualMargin, 55.58);
  assert.equal(r.suggestedMenuPrice, 54.57);
  assert.equal(r.savingsOrShortfall, -11.57);
});

test('a different IVA rate is used, not a hard-coded 16%', () => {
  const r = calc({}, { ivaRate: 8, pricesIncludeIva: true });
  assert.equal(r.priceWithIVA, 58.94);
  assert.equal(r.menuPriceNet, 39.81);
});

test('prime cost % is measured against what you really charge (net) when there is a menu price', () => {
  const real = calc();
  assert.equal(real.primeCostPercent, 50.2);
  assert.equal(real.primeCostBasis, 'menu');
  const fresh = calc({ menuPrice: 0 });
  assert.equal(fresh.primeCostBasis, 'suggested');
  assert.equal(fresh.primeCostPercent, 34.1);
});

test('a brand-new product with no menu price is not reported as below target or as a shortfall', () => {
  const r = calc({ menuPrice: 0 });
  assert.equal(r.actualMargin, 0);
  assert.equal(r.isBelowTarget, false);
  assert.equal(r.savingsOrShortfall, 0);
});

test('a target margin of 100% or more is refused, never silently doubled', () => {
  for (const bad of [100, 120, 1000]) {
    assert.throws(() => calc({ targetMargin: bad }), (error) => error.statusCode === 400 && /100/.test(error.message));
  }
});

test('full-cost pricing spreads fixed costs over the monthly units and uses the same IVA setting', () => {
  const r = calc({ fixedCosts: { rent: 15000, payroll: 40000, other: 5000 }, estimatedMonthlyUnits: 6000 });
  assert.equal(r.fixedCostPerUnit, 10);
  assert.equal(r.fullCostPerServing, 29.1);
  assert.equal(r.fullCostSellingPrice, 83.14);
  assert.equal(r.fullCostPriceWithIVA, 96.45);
  assert.equal(r.breakEvenUnits, 937);
  assert.equal(calc({ fixedCosts: { rent: 1 }, estimatedMonthlyUnits: 0 }).fullCostSellingPrice, null);
});

const { marginOnMenuPrice } = require('../src/modules/pricing/calculator');

test('marginOnMenuPrice is the one definition of margin the calculator and the margins report share', () => {
  const m = marginOnMenuPrice(43, 19.1, DEFAULT_TAX);
  assert.equal(Number(m.netPrice.toFixed(2)), 37.07);
  assert.equal(Number(m.margin.toFixed(2)), 17.97);
  assert.equal(Number(m.marginPct.toFixed(2)), 48.47);
  assert.equal(marginOnMenuPrice(43, 19.1, { ivaRate: 16, pricesIncludeIva: false }).marginPct.toFixed(2), '55.58');
  assert.equal(marginOnMenuPrice(0, 5, DEFAULT_TAX).marginPct, null, 'no price, no margin');
  assert.ok(marginOnMenuPrice(30, 40, DEFAULT_TAX).marginPct < 0, 'selling below cost is a negative margin, not hidden');
});
