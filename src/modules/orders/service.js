const pool = require('../../config/database');
const { notify } = require('../../shared/ntfy');

async function deductInventoryForOrder(client, orderId) {
  const { rows: items } = await client.query('SELECT item_nombre, cantidad FROM orden_items WHERE orden_id = $1', [orderId]);
  for (const item of items) {
    const { rows: recipes } = await client.query('SELECT ri.inventory_item_id, ri.quantity_used FROM recipe_items ri JOIN menu_items mi ON mi.id = ri.menu_item_id WHERE mi.nombre = $1 FOR UPDATE OF ri', [item.item_nombre]);
    for (const recipe of recipes) {
      const { rowCount } = await client.query("SELECT 1 FROM inventory_movements WHERE order_id = $1 AND inventory_item_id = $2 AND reason = 'sale' LIMIT 1", [orderId, recipe.inventory_item_id]);
      if (rowCount) continue;
      const amount = Number(recipe.quantity_used) * Number(item.cantidad || 1);
      await client.query('UPDATE inventory_items SET current_stock = current_stock - $1 WHERE id = $2', [amount, recipe.inventory_item_id]);
      await client.query("INSERT INTO inventory_movements (inventory_item_id, change_amount, reason, order_id, note) VALUES ($1, $2, 'sale', $3, $4)", [recipe.inventory_item_id, -amount, orderId, `Venta de orden ${orderId}`]);
    }
  }
}

async function closeOrder(orderId, payload = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM ordenes WHERE id = $1 FOR UPDATE', [orderId]);
    const order = rows[0];
    if (!order) throw Object.assign(new Error('Orden no encontrada'), { statusCode: 404 });
    if (order.status === 'cerrada') { await client.query('COMMIT'); return order; }
    if (order.status === 'cancelada') throw Object.assign(new Error('La orden está cancelada'), { statusCode: 409 });
    await deductInventoryForOrder(client, orderId);
    const result = await client.query("UPDATE ordenes SET status = 'cerrada', closed_at = NOW(), payment_method = COALESCE($2, payment_method), amount_cash = COALESCE($3, amount_cash), amount_card = COALESCE($4, amount_card), notas = COALESCE($5, notas) WHERE id = $1 RETURNING *", [orderId, payload.payment_method, payload.amount_cash, payload.amount_card, payload.notas]);
    if (order.mesa_id) await client.query("UPDATE mesas SET status = 'disponible' WHERE id = $1", [order.mesa_id]);
    await client.query('COMMIT');
    await notify(process.env.NTFY_ORDER_TOPIC || 'orama-orders', `Orden ${orderId} cerrada`, 'Orden cerrada');
    return result.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

module.exports = { closeOrder, deductInventoryForOrder };