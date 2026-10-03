const express = require('express');
const pool = require('../../config/database');
const { validate } = require('../../middleware/validate');
const {
  productSelectionSchema,
  ingredientLineSchema,
  extraCostsSchema,
  priceCalculationSchema,
  settingsSchema,
  priceCalculationResultSchema,
  recipeSaveSchema
} = require('./schemas');
const { verifyStaffPin } = require('../../shared/pin-auth');
const { getTaxSettings, saveTaxSettings } = require('../../shared/tax');
const { getBusinessSettings, saveBusinessSettings, getObservedMonthlyUnits } = require('../../shared/business');
const { calculatePricing } = require('./calculator');
const {
  getProductById,
  getAllProducts,
  getInventoryItemById,
  searchInventoryItems,
  resolveIngredientsCost,
  saveRecipe,
  getCurrentRecipe,
  listRecipes
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

    const [ingredientsCost, tax, business] = await Promise.all([resolveIngredientsCost(ingredients), getTaxSettings(pool), getBusinessSettings(pool)]);
    const calculation = calculatePricing(
      { ingredientsCost, extraCosts, preparation, fixedCosts: fixedCosts || business.fixedCosts, estimatedMonthlyUnits, targetMargin, includeIVA, menuPrice },
      tax,
      business
    );
    res.json({ success: true, calculation });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message, error: error.message });
  }
});

// IVA settings: whether menu prices include IVA, and the rate. Readable by anyone behind the café code;
// only a manager can change them (they decide how every margin is shown).
async function readSettings() {
  const [tax, business, observedMonthlyUnits] = await Promise.all([getTaxSettings(pool), getBusinessSettings(pool), getObservedMonthlyUnits(pool)]);
  return { ...tax, ...business, observedMonthlyUnits };
}

router.get('/settings', async (_req, res) => {
  res.json({ success: true, settings: await readSettings() });
});

router.post('/settings', verifyAdmin, validate(settingsSchema), async (req, res) => {
  const { ivaRate, pricesIncludeIva, cardFeePct, cardSharePct, paidPerFree, roundTo, fixedCosts } = req.body;
  if (ivaRate !== undefined || pricesIncludeIva !== undefined) {
    const current = await getTaxSettings(pool);
    await saveTaxSettings(pool, { ivaRate: ivaRate ?? current.ivaRate, pricesIncludeIva: pricesIncludeIva ?? current.pricesIncludeIva });
  }
  await saveBusinessSettings(pool, { cardFeePct, cardSharePct, paidPerFree, roundTo, fixedCosts });
  res.json({ success: true, settings: await readSettings() });
});

// Save recipe (admin-only)
router.post('/recipe/save', verifyAdmin, validate(recipeSaveSchema), async (req, res) => {
  const { menuItemId, ingredients, extraCosts } = req.body;
  const product = await getProductById(menuItemId);
  if (!product) return res.status(404).json({ success: false, message: 'Producto no encontrado', error: 'Producto no encontrado' });
  const saved = await saveRecipe({ menuItemId, ingredients, extraCosts });
  res.json({ success: true, message: 'Receta guardada exitosamente', ingredients: saved.ingredients });
});

// Menu items that already have a recipe (no auth, same as the product list)
router.get('/recipes', async (_req, res) => {
  res.json({ success: true, recipes: await listRecipes() });
});

// The saved recipe of one menu item: ingredients in inventory units plus its extra costs
router.get('/recipe/:menuItemId', async (req, res) => {
  const menuItemId = Number(req.params.menuItemId);
  if (!Number.isInteger(menuItemId) || menuItemId <= 0) return res.status(400).json({ success: false, message: 'Producto inválido', error: 'Producto inválido' });
  const product = await getProductById(menuItemId);
  if (!product) return res.status(404).json({ success: false, message: 'Producto no encontrado', error: 'Producto no encontrado' });
  const { ingredients, extraCosts } = await getCurrentRecipe(menuItemId);
  res.json({ success: true, recipe: ingredients, extraCosts });
});

// Get pricing settings or history (if we implement saving calculations)
router.get('/history', verifyAdmin, async (_req, res) => {
  // Placeholder for future enhancement - could save calculation history
  res.json({ success: true, history: [] });
});

module.exports = router;
