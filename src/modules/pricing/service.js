const pool = require('../../config/database');
const { convertQuantity } = require('../../shared/units');

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
async function getInventoryItemById(inventoryItemId, db = pool) {
  const { rows } = await db.query(
    'SELECT id, name, unit, cost_per_unit AS unit_cost, current_stock FROM inventory_items WHERE id = $1',
    [inventoryItemId]
  );
  return rows[0];
}

/**
 * Search inventory items by name (for manual entry suggestions)
 */
async function searchInventoryItems(searchTerm) {
  const { rows } = await pool.query(
    'SELECT id, name, unit, cost_per_unit AS unit_cost, current_stock FROM inventory_items WHERE name ILIKE $1 ORDER BY name',
    [`%${searchTerm}%`]
  );
  return rows;
}

/**
 * Cost of the ingredients in one serving. Each line's quantity is converted to the unit its cost is
 * quoted in (18 g of beans costed per kg is 0.018 kg), so a unit mix-up can no longer multiply a cost by
 * 1000. An ingredient with no cost is not guessed as free: the calculation stops and names it.
 */
async function resolveIngredientsCost(ingredients, db = pool) {
  const missing = [];
  let total = 0;
  for (const line of ingredients) {
    let unitCost = Number(line.unitCost) || 0;
    let costUnit = line.costUnit || line.unit;
    if (!(unitCost > 0) && line.inventoryItemId) {
      const item = await getInventoryItemById(line.inventoryItemId, db);
      if (item) {
        unitCost = Number(item.unit_cost) || 0;
        costUnit = item.unit || costUnit;
      }
    }
    if (!(unitCost > 0)) {
      missing.push(line.ingredientName || `insumo #${line.inventoryItemId}`);
      continue;
    }
    const yieldPct = line.yieldPct === undefined ? 100 : Number(line.yieldPct);
    if (!(yieldPct > 0 && yieldPct <= 100)) {
      throw Object.assign(new Error(`El rendimiento de ${line.ingredientName || 'un insumo'} debe estar entre 1 y 100%.`), { statusCode: 400 });
    }
    // Waste (peel, trim, spillage): only yieldPct of what is bought ends up in the cup.
    total += (unitCost * convertQuantity(line.quantityPerServing, line.unit, costUnit)) / (yieldPct / 100);
  }
  if (missing.length) {
    throw Object.assign(new Error(`Falta el costo de: ${missing.join(', ')}. Escríbelo para calcular el precio (si es casi gratis, pon un costo pequeño como 0.01).`), { statusCode: 400 });
  }
  return total;
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
    `SELECT ri.inventory_item_id, ri.quantity_used, ii.name, ii.unit, ii.cost_per_unit AS unit_cost
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
  resolveIngredientsCost,
  saveRecipe,
  getCurrentRecipe
};
