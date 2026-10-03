const pool = require('../../config/database');
const { notify } = require('../../shared/ntfy');
const { verifyStaffPin } = require('../../shared/pin-auth');
const { logBitacora } = require('../../shared/audit');
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

// A cortesia gives product away, so the close must be authorized by a staff PIN — both
// for a whole-order cortesia and for one person's share of a split payment.
function requiresCompAuthorization(payload = {}) {
  if (payload.payment_method === 'cortesia') return true;
  return Array.isArray(payload.pagos) && payload.pagos.some((pago) => pago.payment_method === 'cortesia');
}

// An efectivo payment is cash only and a tarjeta payment is card only; the cashier screen
// never sends a mix, so an amount on the other side means a malformed or tampered call.
function assertAmountsMatchMethod(method, amountCash, amountCard) {
  if (method === 'efectivo' && Number(amountCard || 0) > AMOUNT_TOLERANCE) {
    throw closeError('Un pago en efectivo no puede llevar un monto en tarjeta.');
  }
  if (method === 'tarjeta' && Number(amountCash || 0) > AMOUNT_TOLERANCE) {
    throw closeError('Un pago con tarjeta no puede llevar un monto en efectivo.');
  }
}

// A split must add up to the order total. A comped (cortesia) person's share is free and
// already authorized by a staff PIN, so a split that includes one is not held to the total.
function assertSplitCoversTotal(order, pagos) {
  if (pagos.some((pago) => pago.payment_method === 'cortesia')) return;
  const { amount_cash: cash, amount_card: card } = aggregatePagos(pagos);
  if (cash + card + AMOUNT_TOLERANCE < Number(order.total)) {
    throw closeError('Los pagos divididos no cubren el total de la orden.');
  }
}

// Rejects closes that would otherwise settle an order without paying, redeeming or being
// authorized: a loyalty "payment" with no customer/PIN (skipped the redemption entirely),
// a cortesia with no staff PIN, cliente_frecuente inside a split (nothing is redeemed
// there), cash/card amounts that don't cover the total (singly or across a split), or an
// amount on the wrong side of an efectivo/tarjeta payment. A close with no method (the
// bar's "listo" button) keeps its existing handling.
function assertValidClosePayment(order, payload = {}) {
  const method = payload.payment_method;
  const hasSplitPayments = Array.isArray(payload.pagos) && payload.pagos.length > 0;
  if (requiresCompAuthorization(payload) && (!payload.actor_nombre || !payload.actor_pin)) {
    throw closeError('Una cortesía requiere el nombre y el PIN del staff que la autoriza.');
  }
  if (!method && !hasSplitPayments) throw closeError('Se requiere el método de pago para cerrar la orden.');
  if (hasSplitPayments) {
    if (payload.pagos.some((pago) => pago.payment_method === 'cliente_frecuente')) {
      throw closeError('El canje de cliente frecuente no se puede dividir. Cierra la orden con el método Frecuente.');
    }
    payload.pagos.forEach((pago) => assertAmountsMatchMethod(pago.payment_method, pago.amount_cash, pago.amount_card));
    assertSplitCoversTotal(order, payload.pagos);
    return;
  }
  if (method === 'cliente_frecuente') {
    if (!payload.loyalty_customer_id || !payload.actor_nombre || !payload.actor_pin) {
      throw closeError('El canje de cliente frecuente requiere el cliente y el PIN del staff.');
    }
    return;
  }
  if (CASH_CARD_METHODS.includes(method)) {
    assertAmountsMatchMethod(method, payload.amount_cash, payload.amount_card);
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

    if (requiresCompAuthorization(payload)) {
      const staff = await verifyStaffPin(payload.actor_nombre, payload.actor_pin);
      await logBitacora({
        entidadTipo: 'orden', entidadId: orderId, accion: 'cortesia',
        actorNombre: staff.nombre, actorTipo: staff.tipo, estadoAnterior: order.status, estadoNuevo: 'cerrada',
        detalle: { total: Number(order.total), notas: payload.notas || null }
      }, client);
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

// The bar marks an order ready without closing it: closing means "paid", and ready is a
// separate fact. The order stays open for the cashier to collect, so a tap on "Listo"
// can no longer drop an unpaid order off the list.
async function markOrderReady(orderId, db = pool) {
  const { rows } = await db.query(
    "UPDATE ordenes SET listo_at = COALESCE(listo_at, NOW()) WHERE id = $1 AND status = 'abierta' RETURNING id, listo_at",
    [orderId]
  );
  if (rows[0]) return rows[0];
  const { rows: current } = await db.query('SELECT status FROM ordenes WHERE id = $1', [orderId]);
  if (!current[0]) throw Object.assign(new Error('Orden no encontrada'), { statusCode: 404 });
  throw Object.assign(new Error(`No se puede marcar como lista una orden ${current[0].status}.`), { statusCode: 409 });
}

module.exports = { markOrderReady, closeOrder, cancelOrder, deductInventoryForOrder, aggregatePagos, assertValidClosePayment, requiresCompAuthorization };