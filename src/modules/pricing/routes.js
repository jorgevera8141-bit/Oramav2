const express = require('express');
const pool = require('../../config/database');
const { validate } = require('../../middleware/validate');
const {
  productSelectionSchema,
  ingredientLineSchema,
  extraCostsSchema,
  priceCalculationSchema,
  priceCalculationResultSchema,
  recipeSaveSchema
} = require('./schemas');
const { verifyStaffPin } = require('../../shared/pin-auth');
const {
  getProductById,
  getAllProducts,
  getInventoryItemById,
  searchInventoryItems,
  calculateCostPerServing,
  saveRecipe,
  getCurrentRecipe
} = require('./service');

const router = express.Router();

// Admin/Middleware check - same pattern as staff module
const verifyAdmin = async (req, res, next) => {
  const { nombre, pin } = req.body || {};
  try {
    const staffMember = await verifyStaffPin(nombre, pin, 'management');
    req.staffMember = staffMember;
    next();
  } catch (error) {
    res.status(error.statusCode || 401).json({ success: false, error: error.message });
  }
};

// Get all products for selection (no auth required for viewing)
router.get('/products', async (_req, res) => {
  try {
    const products = await getAllProducts();
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search inventory items (no auth required for viewing)
router.get('/inventory/search', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const items = await searchInventoryItems(q);
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Calculate price (admin-only)
router.post('/calculate', verifyAdmin, validate(priceCalculationSchema), async (req, res) => {
  try {
    const {
      productId,
      productName,
      ingredients,
      extraCosts,
      preparation,
      fixedCosts,
      estimatedMonthlyUnits,
      targetMargin,
      includeIVA
    } = req.body;

    // Get product info if productId provided
    let product = null;
    let menuPrice = 0;
    
    if (productId) {
      product = await getProductById(productId);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Producto no encontrado' });
      }
      menuPrice = product.precio;
    }

    // Labor cost per serving from actual prep time and wage, not a guessed flat
    // number: (prep time in hours x hourly wage) split across the batch's yield.
    // Falls back to the manual extraCosts.labor field when no prep time is set.
    const laborCostPerServing = preparation.prepTimeMinutes > 0
      ? (preparation.prepTimeMinutes / 60 * preparation.laborRatePerHour) / preparation.yieldServings
      : (extraCosts.labor || 0);
    const effectiveExtraCosts = { ...extraCosts, labor: laborCostPerServing };

    // Ingredient-only cost (no packaging/labor/other) for the Prime Cost KPI below
    const ingredientsCost = await calculateCostPerServing(ingredients, { packaging: 0, labor: 0, other: 0 });

    // Calculate total cost per serving
    const totalCostPerServing = await calculateCostPerServing(ingredients, effectiveExtraCosts);

    // Calculate suggested selling price at target margin
    // Formula: selling_price = cost_per_serving / (1 - target_margin/100)
    const targetMarginDecimal = targetMargin / 100;
    const priceAtMargin = (cost) => targetMarginDecimal < 1
      ? cost / (1 - targetMarginDecimal)
      : cost * 2; // 100%+ margin is undefined mathematically - fallback instead of crashing
    const suggestedSellingPrice = priceAtMargin(totalCostPerServing);

    // Full-cost pricing: spread monthly rent/phone/payroll/other overhead across
    // estimated monthly volume, so the price covers more than just ingredients
    const totalMonthlyFixedCosts = (fixedCosts.rent || 0) + (fixedCosts.phoneInternet || 0) +
      (fixedCosts.payroll || 0) + (fixedCosts.other || 0);
    let fixedCostPerUnit = null;
    let fullCostPerServing = null;
    let fullCostSellingPrice = null;
    let fullCostPriceWithIVA = null;
    let breakEvenUnits = null;
    if (estimatedMonthlyUnits && estimatedMonthlyUnits > 0) {
      fixedCostPerUnit = totalMonthlyFixedCosts / estimatedMonthlyUnits;
      fullCostPerServing = totalCostPerServing + fixedCostPerUnit;
      fullCostSellingPrice = priceAtMargin(fullCostPerServing);
      fullCostPriceWithIVA = includeIVA ? fullCostSellingPrice * 1.16 : fullCostSellingPrice;
      const contributionMargin = fullCostSellingPrice - totalCostPerServing;
      breakEvenUnits = contributionMargin > 0 ? Math.ceil(totalMonthlyFixedCosts / contributionMargin) : null;
    }

    // Calculate actual margin % at current menu price
    let actualMargin = 0;
    if (menuPrice > 0) {
      actualMargin = ((menuPrice - totalCostPerServing) / menuPrice) * 100;
    }

    // Calculate prices with/without IVA
    const priceWithoutIVA = suggestedSellingPrice;
    const priceWithIVA = includeIVA ? suggestedSellingPrice * 1.16 : suggestedSellingPrice;

    // Check if actual margin is below target
    const isBelowTarget = actualMargin < targetMargin;

    // Calculate savings/shortfall
    const savingsOrShortfall = menuPrice - suggestedSellingPrice;

    // Prime Cost = ingredients + labor, the standard restaurant health metric.
    // Rule of thumb: keep it at or below 60-65% of the selling price.
    const primeCost = ingredientsCost + laborCostPerServing;
    const primeCostPercent = suggestedSellingPrice > 0 ? (primeCost / suggestedSellingPrice) * 100 : 0;

    const result = {
      totalCostPerServing: parseFloat(totalCostPerServing.toFixed(2)),
      suggestedSellingPrice: parseFloat(suggestedSellingPrice.toFixed(2)),
      actualMargin: parseFloat(actualMargin.toFixed(2)),
      targetMargin: parseFloat(targetMargin.toFixed(2)),
      includeIVA,
      priceWithIVA: parseFloat(priceWithIVA.toFixed(2)),
      priceWithoutIVA: parseFloat(priceWithoutIVA.toFixed(2)),
      isBelowTarget,
      savingsOrShortfall: parseFloat(savingsOrShortfall.toFixed(2)),
      ingredientsCost: parseFloat(ingredientsCost.toFixed(2)),
      laborCostPerServing: parseFloat(laborCostPerServing.toFixed(2)),
      primeCost: parseFloat(primeCost.toFixed(2)),
      primeCostPercent: parseFloat(primeCostPercent.toFixed(1)),
      totalMonthlyFixedCosts: parseFloat(totalMonthlyFixedCosts.toFixed(2)),
      estimatedMonthlyUnits: estimatedMonthlyUnits || null,
      fixedCostPerUnit: fixedCostPerUnit !== null ? parseFloat(fixedCostPerUnit.toFixed(2)) : null,
      fullCostPerServing: fullCostPerServing !== null ? parseFloat(fullCostPerServing.toFixed(2)) : null,
      fullCostSellingPrice: fullCostSellingPrice !== null ? parseFloat(fullCostSellingPrice.toFixed(2)) : null,
      fullCostPriceWithIVA: fullCostPriceWithIVA !== null ? parseFloat(fullCostPriceWithIVA.toFixed(2)) : null,
      breakEvenUnits
    };

    res.json({ success: true, calculation: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save recipe (admin-only)
router.post('/recipe/save', verifyAdmin, validate(recipeSaveSchema), async (req, res) => {
  try {
    const { menuItemId, recipeName, ingredients, extraCosts, targetMargin, includeIVA } = req.body;
    
    // Verify the menu item exists
    const product = await getProductById(menuItemId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    
    // Save the recipe
    await saveRecipe({
      menuItemId,
      ingredients,
      extraCosts,
      targetMargin,
      includeIVA
    });
    
    res.json({ success: true, message: 'Receta guardada exitosamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current recipe for a menu item (admin-only)
router.get('/recipe/:menuItemId', verifyAdmin, async (req, res) => {
  try {
    const { menuItemId } = req.params;
    
    // Verify the menu item exists
    const product = await getProductById(menuItemId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }
    
    // Get current recipe
    const recipe = await getCurrentRecipe(menuItemId);
    
    res.json({ success: true, recipe });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get pricing settings or history (if we implement saving calculations)
router.get('/history', verifyAdmin, async (_req, res) => {
  // Placeholder for future enhancement - could save calculation history
  res.json({ success: true, history: [] });
});

module.exports = router;
