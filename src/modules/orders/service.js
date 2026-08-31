const pool = require('../../config/database');
const { notify } = require('../../shared/ntfy');

async function deductInventoryForOrder(client, ordenId) {
  const orderItems = await client.query('SELECT * FROM orden_items WHERE orden_id = $1', [ordenId]);
  for (const item of orderItems.rows) {
    const recipes = await client.query(
      'SELECT ri.*, ii.current_stock FROM recipe_items ri JOIN inventory_items ii ON ii.id = ri.inventory_item_id WHERE ri.menu_item_id = (SELECT id FROM menu_items WHERE nombre = $1 LIMIT 1) FOR UPDATE OF ri',
      [item.item_nombre]
    );

    for (const recipe of recipes.rows) {
      const existingMovement = await client.query(
        'SELECT 1 FROM inventory_movements WHERE order_id = $1 AND inventory_item_id = $2 AND reason = \'sale\' LIMIT 1',
        [ordenId, recipe.inventory_item_id]
      );
      if (existingMovement.rowCount > 0) continue;

      const changeAmount = Number(recipe.quantity_used) * Number(item.cantidad || 1);
      await client.query(
        'UPDATE inventory_items SET current_stock = current_stock - $1 WHERE id = $2',
        [changeAmount, recipe.inventory_item_id]
      );
      await client.query(
        'INSERT INTO inventory_movements (inventory_item_id, change_amount, reason, order_id, note) VALUES ($1, $2, \'sale\', $3, $4)',
        [recipe.inventory_item_id, -changeAmount, ordenId, `Sale from order ${ordenId}`]
      );
    }
  }
}

async function closeOrder(ordenId, payload = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM ordenes WHERE id = $1 FOR UPDATE', [ordenId]);
    const order = rows[0];
    if (!order) throw new Error('Order not found');
    if (order.status === 'cerrada') {
      await client.query('COMMIT');
      return order;
    }

    await deductInventoryForOrder(client, ordenId);

    await client.query(
      `UPDATE ordenes
       SET status = 'cerrada',
           closed_at = NOW(),
           payment_method = COALESCE($2, payment_method),
           amount_cash = COALESCE($3, amount_cash),
           amount_card = COALESCE($4, amount_card),
           notas = COALESCE($5, notas)
       WHERE id = $1`,
      [ordenId, payload.payment_method, payload.amount_cash, payload.amount_card, payload.notas]
    );

    await client.query('UPDATE mesas SET status = \'disponible\' WHERE id = $1', [order.mesa_id]);
    await client.query('COMMIT');

    await notify(process.env.NTFY_ORDER_TOPIC || 'orama-orders', `Orden ${ordenId} cerrada`, 'Order closed');
    return order;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { closeOrder };