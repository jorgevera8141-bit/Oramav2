// The price calculator's formulas, kept free of the database so they can be tested with plain numbers.
// Margin is always "margin on price": price = cost / (1 - margin). Every margin and price is stated before
// IVA, which is what the café earns; the menu price (which includes IVA) is converted with the tax setting.
const { netOfIva, menuPriceFromNet } = require('../../shared/tax');

const round2 = (value) => parseFloat(value.toFixed(2));

function marginTooHigh() {
  return Object.assign(new Error('El margen objetivo debe ser menor a 100%.'), { statusCode: 400 });
}

// Margin on a menu price, after taking IVA out of it when the menu price includes it. Shared with the
// margins report so both screens mean the same thing by "margin".
function marginOnMenuPrice(menuPrice, cost, tax) {
  if (!(menuPrice > 0)) return { netPrice: 0, margin: 0, marginPct: null };
  const netPrice = netOfIva(menuPrice, tax);
  const margin = netPrice - cost;
  return { netPrice, margin, marginPct: (margin / netPrice) * 100 };
}

function calculatePricing(input, tax) {
  const { ingredientsCost, extraCosts, preparation, fixedCosts = {}, estimatedMonthlyUnits, targetMargin, includeIVA, menuPrice = 0 } = input;
  if (targetMargin >= 100) throw marginTooHigh();
  const rate = tax.ivaRate / 100;
  const priceAtMargin = (cost) => cost / (1 - targetMargin / 100);

  // Labour per serving from real prep time and wage: (hours x hourly wage) over the batch's servings.
  // The manual extraCosts.labor is only the fallback when no prep time is given.
  const laborCostPerServing = preparation.prepTimeMinutes > 0
    ? (preparation.prepTimeMinutes / 60 * preparation.laborRatePerHour) / preparation.yieldServings
    : (extraCosts.labor || 0);
  const packaging = extraCosts.packaging || 0;
  const totalCostPerServing = ingredientsCost + packaging + laborCostPerServing + (extraCosts.other || 0);

  const suggestedSellingPrice = priceAtMargin(totalCostPerServing);
  const priceWithIVA = includeIVA ? suggestedSellingPrice * (1 + rate) : suggestedSellingPrice;
  const suggestedMenuPrice = menuPriceFromNet(suggestedSellingPrice, tax);

  const hasMenuPrice = menuPrice > 0;
  const { netPrice: menuPriceNet, marginPct } = marginOnMenuPrice(menuPrice, totalCostPerServing, tax);
  const actualMargin = marginPct === null ? 0 : marginPct;
  const isBelowTarget = hasMenuPrice && actualMargin < targetMargin;
  const savingsOrShortfall = hasMenuPrice ? menuPrice - suggestedMenuPrice : 0;

  // Prime cost = ingredients + packaging + labour, against what is really charged (net) when known.
  const primeCost = ingredientsCost + packaging + laborCostPerServing;
  const primeBasis = hasMenuPrice ? menuPriceNet : suggestedSellingPrice;
  const primeCostPercent = primeBasis > 0 ? (primeCost / primeBasis) * 100 : 0;

  const totalMonthlyFixedCosts = (fixedCosts.rent || 0) + (fixedCosts.phoneInternet || 0) + (fixedCosts.payroll || 0) + (fixedCosts.other || 0);
  let fixedCostPerUnit = null;
  let fullCostPerServing = null;
  let fullCostSellingPrice = null;
  let fullCostPriceWithIVA = null;
  let breakEvenUnits = null;
  if (estimatedMonthlyUnits && estimatedMonthlyUnits > 0) {
    fixedCostPerUnit = totalMonthlyFixedCosts / estimatedMonthlyUnits;
    fullCostPerServing = totalCostPerServing + fixedCostPerUnit;
    fullCostSellingPrice = priceAtMargin(fullCostPerServing);
    fullCostPriceWithIVA = includeIVA ? fullCostSellingPrice * (1 + rate) : fullCostSellingPrice;
    const contributionMargin = fullCostSellingPrice - totalCostPerServing;
    breakEvenUnits = contributionMargin > 0 ? Math.ceil(totalMonthlyFixedCosts / contributionMargin) : null;
  }
  const rounded = (value) => (value === null ? null : round2(value));

  return {
    totalCostPerServing: round2(totalCostPerServing),
    suggestedSellingPrice: round2(suggestedSellingPrice),
    actualMargin: round2(actualMargin),
    targetMargin: round2(targetMargin),
    includeIVA,
    ivaRate: tax.ivaRate,
    pricesIncludeIva: tax.pricesIncludeIva,
    priceWithIVA: round2(priceWithIVA),
    priceWithoutIVA: round2(suggestedSellingPrice),
    suggestedMenuPrice: round2(suggestedMenuPrice),
    menuPriceNet: round2(menuPriceNet),
    isBelowTarget,
    savingsOrShortfall: round2(savingsOrShortfall),
    ingredientsCost: round2(ingredientsCost),
    packagingCost: round2(packaging),
    laborCostPerServing: round2(laborCostPerServing),
    primeCost: round2(primeCost),
    primeCostPercent: parseFloat(primeCostPercent.toFixed(1)),
    primeCostBasis: hasMenuPrice ? 'menu' : 'suggested',
    totalMonthlyFixedCosts: round2(totalMonthlyFixedCosts),
    estimatedMonthlyUnits: estimatedMonthlyUnits || null,
    fixedCostPerUnit: rounded(fixedCostPerUnit),
    fullCostPerServing: rounded(fullCostPerServing),
    fullCostSellingPrice: rounded(fullCostSellingPrice),
    fullCostPriceWithIVA: rounded(fullCostPriceWithIVA),
    breakEvenUnits
  };
}

module.exports = { calculatePricing, marginOnMenuPrice };
