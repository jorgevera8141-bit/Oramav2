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

    // Calculate total cost per serving
    const totalCostPerServing = await calculateCostPerServing(ingredients, extraCosts);
    
    // Calculate suggested selling price at target margin
    // Formula: selling_price = cost_per_serving / (1 - target_margin/100)
    const targetMarginDecimal = targetMargin / 100;
    let suggestedSellingPrice = 0;
    if (targetMarginDecimal < 1) {
      suggestedSellingPrice = totalCostPerServing / (1 - targetMarginDecimal);
    } else {
      // Handle edge case where target margin is 100% or more
      suggestedSellingPrice = totalCostPerServing * 2; // fallback
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

    const result = {
      totalCostPerServing: parseFloat(totalCostPerServing.toFixed(2)),
      suggestedSellingPrice: parseFloat(suggestedSellingPrice.toFixed(2)),
      actualMargin: parseFloat(actualMargin.toFixed(2)),
      targetMargin: parseFloat(targetMargin.toFixed(2)),
      includeIVA,
      priceWithIVA: parseFloat(priceWithIVA.toFixed(2)),
      priceWithoutIVA: parseFloat(priceWithoutIVA.toFixed(2)),
      isBelowTarget,
      savingsOrShortfall: parseFloat(savingsOrShortfall.toFixed(2))
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
