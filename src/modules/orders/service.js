const pool = require('../../config/database');
const { notify } = require('../../shared/ntfy');
const { verifyStaffPin } = require('../../shared/pin-auth');
const { findOrCreateCustomer, awardStamp, redeemRewardWithClient } = require('../loyalty/service');

// Total amount of each inventory item an order consumes. Lines are summed per
// ingredient first, so two menu items sharing milk deduct 0.2 + 0.15 together instead
// of the second one being skipped by the once-per-order idempotency check below.
function sumIngredientUsage(rows) {
  const usage = new Map();
  for (const row of rows) {
    const amount = Number(row.quantity_used) * Number(row.cantidad || 1);
    usage.set(row.inventory_item_id, (usage.get(row.inventory_item_id) || 0) + amount);
  }
  return usage;
}

async function deductInventoryForOrder(client, orderId) {
  // Recipes are matched by menu_item_id; rows saved before that column existed fall
  // back to the item name, picking one menu item so a duplicate name can't double-count.
  const { rows: usageRows } = await client.query(
    `SELECT ri.inventory_item_id, ri.quantity_used, oi.cantidad
     FROM orden_items oi
     JOIN recipe_items ri ON ri.menu_item_id = COALESCE(
       oi.menu_item_id,
       (SELECT mi.id FROM menu_items mi WHERE mi.nombre = oi.item_nombre ORDER BY mi.id LIMIT 1)
     )
     WHERE oi.orden_id = $1
     ORDER BY ri.inventory_item_id
     FOR UPDATE OF ri`,
    [orderId]
  );
  const { rows: alreadyDeducted } = await client.query(
    "SELECT inventory_item_id FROM inventory_movements WHERE order_id = $1 AND reason = 'sale'",
    [orderId]
  );
  const deducted = new Set(alreadyDeducted.map((row) => row.inventory_item_id));
  for (const [inventoryItemId, amount] of sumIngredientUsage(usageRows)) {
    if (deducted.has(inventoryItemId)) continue;
    await client.query('UPDATE inventory_items SET current_stock = current_stock - $1 WHERE id = $2', [amount, inventoryItemId]);
    await client.query("INSERT INTO inventory_movements (inventory_item_id, change_amount, reason, order_id, note) VALUES ($1, $2, 'sale', $3, $4)", [inventoryItemId, -amount, orderId, `Venta de orden ${orderId}`]);
  }
}

// Only an open order can be cancelled: cancelling a closed one would leave its payment,
// inventory deduction and loyalty stamp in place with the order marked cancelled.
async function cancelOrder(orderId, motivo, db = pool) {
  const { rows } = await db.query(
    "UPDATE ordenes SET status = 'cancelada', notas = COALESCE($2, notas) WHERE id = $1 AND status = 'abierta' RETURNING id, mesa_id",
    [orderId, motivo || null]
  );
  if (rows[0]) {
    if (rows[0].mesa_id) await db.query("UPDATE mesas SET status = 'disponible' WHERE id = $1", [rows[0].mesa_id]);
    return rows[0];
  }
  const { rows: current } = await db.query('SELECT status FROM ordenes WHERE id = $1', [orderId]);
  if (!current[0]) throw Object.assign(new Error('Orden no encontrada'), { statusCode: 404 });
  throw Object.assign(new Error(`No se puede cancelar una orden ${current[0].status}.`), { statusCode: 409 });
}

function aggregatePagos(pagos) {
  return pagos.reduce((totals, pago) => ({
    amount_cash: totals.amount_cash + Number(pago.amount_cash || 0),
    amount_card: totals.amount_card + Number(pago.amount_card || 0)
  }), { amount_cash: 0, amount_card: 0 });
}

const CASH_CARD_METHODS = ['efectivo', 'tarjeta', 'mixto'];
const AMOUNT_TOLERANCE = 0.01;

function closeError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

// Rejects closes that would otherwise settle an order without paying or redeeming:
// a loyalty "payment" with no customer/PIN (skipped the redemption entirely) or
// cash/card amounts that don't cover the total. Split payments (pagos), cortesia and
// a close with no method (the bar's "listo" button) keep their existing handling.
function assertValidClosePayment(order, payload = {}) {
  const method = payload.payment_method;
  const hasSplitPayments = Array.isArray(payload.pagos) && payload.pagos.length > 0;
  if (hasSplitPayments) return;
  if (method === 'cliente_frecuente') {
    if (!payload.loyalty_customer_id || !payload.actor_nombre || !payload.actor_pin) {
      throw closeError('El canje de cliente frecuente requiere el cliente y el PIN del staff.');
    }
    return;
  }
  if (CASH_CARD_METHODS.includes(method)) {
    const paid = Number(payload.amount_cash || 0) + Number(payload.amount_card || 0);
    if (paid + AMOUNT_TOLERANCE < Number(order.total)) {
      throw closeError('El pago no cubre el total de la orden.');
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

    assertValidClosePayment(order, payload);

    // Redeem the loyalty reward inside this same transaction (not via a separate
    // request) so a failure closing the order also rolls back the redemption —
    // the customer never loses stamps for an order that didn't actually close.
    let redencion = null;
    if (payload.payment_method === 'cliente_frecuente' && payload.loyalty_customer_id) {
      await verifyStaffPin(payload.actor_nombre, payload.actor_pin);
      redencion = await redeemRewardWithClient(payload.loyalty_customer_id, orderId, payload.actor_nombre, client);
    }

    await deductInventoryForOrder(client, orderId);

    let paymentMethod = payload.payment_method;
    let amountCash = payload.amount_cash;
    let amountCard = payload.amount_card;
    let notas = payload.notas;
    if (redencion) {
      const redencionNota = `Canje cliente frecuente: ${redencion.producto_otorgado || 'producto'}`;
      notas = notas ? `${notas} — ${redencionNota}` : redencionNota;
    }

    if (payload.pagos && payload.pagos.length) {
      for (const pago of payload.pagos) {
        await client.query(
          'INSERT INTO orden_pagos (orden_id, payment_method, amount_cash, amount_card, persona_nombre) VALUES ($1,$2,$3,$4,$5)',
          [orderId, pago.payment_method, pago.amount_cash || 0, pago.amount_card || 0, pago.persona_nombre || null]
        );
      }
      const totals = aggregatePagos(payload.pagos);
      paymentMethod = 'dividido';
      amountCash = totals.amount_cash;
      amountCard = totals.amount_card;
    }

    const result = await client.query("UPDATE ordenes SET status = 'cerrada', closed_at = NOW(), payment_method = COALESCE($2, payment_method), amount_cash = COALESCE($3, amount_cash), amount_card = COALESCE($4, amount_card), notas = COALESCE($5, notas) WHERE id = $1 RETURNING *", [orderId, paymentMethod, amountCash, amountCard, notas]);
    if (order.mesa_id) await client.query("UPDATE mesas SET status = 'disponible' WHERE id = $1", [order.mesa_id]);

    const closedOrder = result.rows[0];
    if (payload.loyalty_phone && closedOrder.payment_method !== 'cliente_frecuente' && Number(closedOrder.total) > 0) {
      const customer = await findOrCreateCustomer(payload.loyalty_phone, client);
      await awardStamp(customer.id, orderId, client);
    }

    await client.query('COMMIT');
    await notify(process.env.NTFY_ORDER_TOPIC || 'orama-orders', `Orden ${orderId} cerrada`, 'Orden cerrada');
    return { ...closedOrder, loyalty_redencion: redencion };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

module.exports = { closeOrder, cancelOrder, deductInventoryForOrder, aggregatePagos, assertValidClosePayment };