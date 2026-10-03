// The price calculator's formulas, kept free of the database so they can be tested with plain numbers.
// Margin is always "margin on price": price = cost / (1 - margin). Every margin and price is stated before
// IVA, which is what the café earns; the menu price (which includes IVA) is converted with the tax setting.
const { netOfIva, menuPriceFromNet } = require('../../shared/tax');
const { DEFAULT_BUSINESS } = require('../../shared/business');

const round2 = (value) => parseFloat(value.toFixed(2));

function marginTooHigh(withFee) {
  const message = withFee ? 'El margen objetivo más la comisión de tarjeta deben sumar menos de 100%.' : 'El margen objetivo debe ser menor a 100%.';
  return Object.assign(new Error(message), { statusCode: 400 });
}

// 1 free drink per N paid: every paid drink also pays for 1/N of a free one.
function compsMultiplier(business) {
  return business.paidPerFree > 0 ? (business.paidPerFree + 1) / business.paidPerFree : 1;
}

// Card fee as a fraction of the price before IVA. The terminal charges on what the customer hands over,
// which includes IVA when menu prices do.
function cardFeeRate(tax, business) {
  const onGross = tax.pricesIncludeIva ? 1 + tax.ivaRate / 100 : 1;
  return (business.cardFeePct / 100) * (business.cardSharePct / 100) * onGross;
}

// Margin on a menu price, after taking IVA out of it when the menu price includes it. Shared with the
// margins report so both screens mean the same thing by "margin".
function marginOnMenuPrice(menuPrice, cost, tax, business = DEFAULT_BUSINESS) {
  if (!(menuPrice > 0)) return { netPrice: 0, margin: 0, marginPct: null };
  const netPrice = netOfIva(menuPrice, tax);
  const margin = netPrice - netPrice * cardFeeRate(tax, business) - cost * compsMultiplier(business);
  return { netPrice, margin, marginPct: (margin / netPrice) * 100 };
}

function calculatePricing(input, tax, business = DEFAULT_BUSINESS) {
  const { ingredientsCost, extraCosts, preparation, fixedCosts = {}, estimatedMonthlyUnits, targetMargin, includeIVA, menuPrice = 0 } = input;
  if (targetMargin >= 100) throw marginTooHigh(false);
  const rate = tax.ivaRate / 100;
  const feeRate = cardFeeRate(tax, business);
  const compsFactor = compsMultiplier(business);
  const keepFraction = 1 - targetMargin / 100 - feeRate;
  if (keepFraction <= 0) throw marginTooHigh(true);
  // The price must cover the cost of the drink, its share of the free ones, the card fee and the margin.
  const priceAtMargin = (cost) => (cost * compsFactor) / keepFraction;

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
  const { netPrice: menuPriceNet, marginPct } = marginOnMenuPrice(menuPrice, totalCostPerServing, tax, business);
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
    fullCostPerServing = (totalCostPerServing + fixedCostPerUnit) * compsFactor;
    fullCostSellingPrice = priceAtMargin(totalCostPerServing + fixedCostPerUnit);
    fullCostPriceWithIVA = includeIVA ? fullCostSellingPrice * (1 + rate) : fullCostSellingPrice;
    const contributionMargin = fullCostSellingPrice * (1 - feeRate) - totalCostPerServing * compsFactor;
    breakEvenUnits = contributionMargin > 0 ? Math.ceil(totalMonthlyFixedCosts / contributionMargin) : null;
  }
  const rounded = (value) => (value === null ? null : round2(value));

  // Round the menu price up to the next step ($5, $1...) and show the margin that price really leaves.
  const roundedMenuPrice = business.roundTo > 0 ? Math.ceil(round2(suggestedMenuPrice) / business.roundTo) * business.roundTo : null;
  const marginAtRoundedPrice = roundedMenuPrice === null ? null : marginOnMenuPrice(roundedMenuPrice, totalCostPerServing, tax, business).marginPct;

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
    breakEvenUnits,
    compsCostPerServing: round2(totalCostPerServing * (compsFactor - 1)),
    cardFeeRatePct: round2(feeRate * 100),
    roundedMenuPrice,
    marginAtRoundedPrice: marginAtRoundedPrice === null ? null : round2(marginAtRoundedPrice)
  };
}

module.exports = { calculatePricing, marginOnMenuPrice };
