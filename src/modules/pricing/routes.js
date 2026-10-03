const express = require('express');
const pool = require('../../config/database');
const { validate } = require('../../middleware/validate');
const {
  productSelectionSchema,
  ingredientLineSchema,
  extraCostsSchema,
  priceCalculationSchema,
  taxSettingsSchema,
  priceCalculationResultSchema,
  recipeSaveSchema
} = require('./schemas');
const { verifyStaffPin } = require('../../shared/pin-auth');
const { getTaxSettings, saveTaxSettings } = require('../../shared/tax');
const { calculatePricing } = require('./calculator');
const {
  getProductById,
  getAllProducts,
  getInventoryItemById,
  searchInventoryItems,
  resolveIngredientsCost,
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

// Calculate price (admin-only). The formulas live in ./calculator.js; this route only gathers the inputs
// (ingredient costs converted to their cost unit, the menu price, the IVA setting) and reports friendly 400s.
router.post('/calculate', verifyAdmin, validate(priceCalculationSchema), async (req, res) => {
  try {
    const { productId, ingredients, extraCosts, preparation, fixedCosts, estimatedMonthlyUnits, targetMargin, includeIVA } = req.body;

    let menuPrice = 0;
    if (productId) {
      const product = await getProductById(productId);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Producto no encontrado' });
      }
      menuPrice = Number(product.precio);
    }

    const [ingredientsCost, tax] = await Promise.all([resolveIngredientsCost(ingredients), getTaxSettings(pool)]);
    const calculation = calculatePricing(
      { ingredientsCost, extraCosts, preparation, fixedCosts, estimatedMonthlyUnits, targetMargin, includeIVA, menuPrice },
      tax
    );
    res.json({ success: true, calculation });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message, error: error.message });
  }
});

// IVA settings: whether menu prices include IVA, and the rate. Readable by anyone behind the café code;
// only a manager can change them (they decide how every margin is shown).
router.get('/settings', async (_req, res) => {
  res.json({ success: true, settings: await getTaxSettings(pool) });
});

router.post('/settings', verifyAdmin, validate(taxSettingsSchema), async (req, res) => {
  await saveTaxSettings(pool, req.body);
  res.json({ success: true, settings: await getTaxSettings(pool) });
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
