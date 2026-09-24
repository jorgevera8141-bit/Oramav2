const pool = require('../../config/database');

/**
 * Get a product by ID from menu_items table
 */
async function getProductById(productId) {
  const { rows } = await pool.query(
    'SELECT id, nombre, precio, categoria, activo FROM menu_items WHERE id = $1',
    [productId]
  );
  return rows[0];
}

/**
 * Get all active products for selection
 */
async function getAllProducts() {
  const { rows } = await pool.query(
    'SELECT id, nombre, precio, categoria FROM menu_items WHERE activo = 1 ORDER BY nombre'
  );
  return rows;
}

/**
 * Get an inventory item by ID
 */
async function getInventoryItemById(inventoryItemId) {
  const { rows } = await pool.query(
    'SELECT id, name, unit, unit_cost, current_stock FROM inventory_items WHERE id = $1',
    [inventoryItemId]
  );
  return rows[0];
}

/**
 * Search inventory items by name (for manual entry suggestions)
 */
async function searchInventoryItems(searchTerm) {
  const { rows } = await pool.query(
    'SELECT id, name, unit, unit_cost, current_stock FROM inventory_items WHERE name ILIKE $1 ORDER BY name',
    [`%${searchTerm}%`]
  );
  return rows;
}

/**
 * Calculate the total cost per serving based on ingredients and extra costs
 */
async function calculateCostPerServing(ingredients, extraCosts) {
  let totalCost = 0;
  
  for (const ingredient of ingredients) {
    let unitCost = ingredient.unitCost;
    
    // If unit cost not provided and we have an inventory item, look it up
    if (!unitCost && ingredient.inventoryItemId) {
      const inventoryItem = await getInventoryItemById(ingredient.inventoryItemId);
      if (inventoryItem) {
        unitCost = inventoryItem.unit_cost;
      }
    }
    
    // If still no unit cost, assume 0 (should be validated)
    if (!unitCost) unitCost = 0;
    
    totalCost += (unitCost || 0) * ingredient.quantityPerServing;
  }
  
  // Add extra costs
  totalCost += extraCosts.packaging + extraCosts.labor + extraCosts.other;
  
  return totalCost;
}

/**
 * Save a recipe for a menu item
 */
async function saveRecipe(recipeData) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Delete existing recipe for this menu item
    await client.query(
      'DELETE FROM recipe_items WHERE menu_item_id = $1',
      [recipeData.menuItemId]
    );
    
    // Insert new recipe ingredients
    for (const ingredient of recipeData.ingredients) {
      await client.query(
        'INSERT INTO recipe_items (menu_item_id, inventory_item_id, quantity_used) VALUES ($1, $2, $3)',
        [recipeData.menuItemId, ingredient.inventoryItemId, ingredient.quantityUsed]
      );
    }
    
    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get the current recipe for a menu item
 */
async function getCurrentRecipe(menuItemId) {
  const { rows } = await pool.query(
    `SELECT ri.inventory_item_id, ri.quantity_used, ii.name, ii.unit, ii.unit_cost
     FROM recipe_items ri
     JOIN inventory_items ii ON ri.inventory_item_id = ii.id
     WHERE ri.menu_item_id = $1`,
    [menuItemId]
  );
  return rows;
}

module.exports = {
  getProductById,
  getAllProducts,
  getInventoryItemById,
  searchInventoryItems,
  calculateCostPerServing,
  saveRecipe,
  getCurrentRecipe
};
