const pool = require('../../config/database');
const { notify } = require('../../shared/ntfy');
const { verifyStaffPin } = require('../../shared/pin-auth');
const { findOrCreateCustomer, awardStamp, redeemRewardWithClient } = require('../loyalty/service');

const PAYMENT_ROUNDING_TOLERANCE = 0.01;
const ZERO_DUE_PAYMENT_METHODS = new Set(['cortesia', 'cliente_frecuente']);

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

function aggregatePagos(pagos) {
  return pagos.reduce((totals, pago) => ({
    amount_cash: totals.amount_cash + Number(pago.amount_cash || 0),
    amount_card: totals.amount_card + Number(pago.amount_card || 0)
  }), { amount_cash: 0, amount_card: 0 });
}

function isCurrencyMatch(expected, actual) {
  return Math.abs(Number(expected || 0) - Number(actual || 0)) <= PAYMENT_ROUNDING_TOLERANCE;
}

function badPayment(message) {
  throw Object.assign(new Error(message), { statusCode: 400 });
}

function normalizeAmount(value, fieldName) {
  const amount = value == null ? 0 : Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    badPayment(`El monto de ${fieldName} debe ser un número válido mayor o igual a cero.`);
  }
  return amount;
}

function normalizePaymentEntry(payment, { split = false } = {}) {
  const paymentMethod = payment?.payment_method;
  if (!paymentMethod) badPayment('Debes indicar un método de pago válido para cerrar la orden.');

  const amountCash = normalizeAmount(payment.amount_cash, 'efectivo');
  const amountCard = normalizeAmount(payment.amount_card, 'tarjeta');
  const totalPaid = amountCash + amountCard;

  if (paymentMethod === 'efectivo' && amountCard > PAYMENT_ROUNDING_TOLERANCE) {
    badPayment('Los pagos en efectivo no deben incluir un monto en tarjeta.');
  }
  if (paymentMethod === 'tarjeta' && amountCash > PAYMENT_ROUNDING_TOLERANCE) {
    badPayment('Los pagos con tarjeta no deben incluir un monto en efectivo.');
  }
  if (paymentMethod === 'mixto' && (amountCash <= PAYMENT_ROUNDING_TOLERANCE || amountCard <= PAYMENT_ROUNDING_TOLERANCE)) {
    badPayment('Los pagos mixtos deben incluir un monto válido en efectivo y tarjeta.');
  }
  if (!ZERO_DUE_PAYMENT_METHODS.has(paymentMethod) && totalPaid <= PAYMENT_ROUNDING_TOLERANCE) {
    badPayment('El monto pagado debe ser mayor que cero.');
  }
  if (ZERO_DUE_PAYMENT_METHODS.has(paymentMethod) && totalPaid > PAYMENT_ROUNDING_TOLERANCE) {
    badPayment(`Los pagos con método ${paymentMethod} no deben registrar monto cobrado.`);
  }
  if (split && paymentMethod === 'cliente_frecuente') {
    badPayment('Cliente frecuente no es válido dentro de pagos divididos.');
  }
  if (!split && paymentMethod === 'cliente_frecuente' && (!payment.loyalty_customer_id || !payment.actor_nombre || !payment.actor_pin)) {
    badPayment('Cliente frecuente requiere cliente, nombre y PIN del staff para cerrar la orden.');
  }

  return {
    payment_method: paymentMethod,
    amount_cash: amountCash,
    amount_card: amountCard,
    persona_nombre: payment?.persona_nombre || null
  };
}

function validateClosePayment(orderTotal, payload = {}) {
  const total = Number(orderTotal || 0);
  if (payload.pagos?.length) {
    if (payload.payment_method && payload.payment_method !== 'dividido') {
      badPayment('No combines un payment_method individual con una lista de pagos divididos.');
    }
    const pagos = payload.pagos.map((pago) => normalizePaymentEntry(pago, { split: true }));
    const totals = aggregatePagos(pagos);
    const totalPaid = totals.amount_cash + totals.amount_card;
    if (!isCurrencyMatch(total, totalPaid)) {
      badPayment('La suma de los pagos divididos debe coincidir con el total de la orden.');
    }
    return { payment_method: 'dividido', amount_cash: totals.amount_cash, amount_card: totals.amount_card, pagos };
  }

  if (!payload.payment_method) {
    badPayment('Debes indicar un método de pago para cerrar la orden.');
  }

  const payment = normalizePaymentEntry(payload);
  const expectedPaid = ZERO_DUE_PAYMENT_METHODS.has(payment.payment_method) ? 0 : total;
  const actualPaid = payment.amount_cash + payment.amount_card;
  if (!isCurrencyMatch(expectedPaid, actualPaid)) {
    badPayment(expectedPaid === 0
      ? 'Este método de pago solo es válido cuando el monto a cobrar es cero.'
      : 'El monto pagado debe coincidir con el total de la orden.');
  }

  return payment;
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
    const payment = validateClosePayment(order.total, payload);

    // Redeem the loyalty reward inside this same transaction (not via a separate
    // request) so a failure closing the order also rolls back the redemption —
    // the customer never loses stamps for an order that didn't actually close.
    let redencion = null;
    if (payment.payment_method === 'cliente_frecuente' && payload.loyalty_customer_id) {
      await verifyStaffPin(payload.actor_nombre, payload.actor_pin);
      redencion = await redeemRewardWithClient(payload.loyalty_customer_id, orderId, payload.actor_nombre, client);
    }

    await deductInventoryForOrder(client, orderId);

    let paymentMethod = payment.payment_method;
    let amountCash = payment.amount_cash;
    let amountCard = payment.amount_card;
    let notas = payload.notas;
    if (redencion) {
      const redencionNota = `Canje cliente frecuente: ${redencion.producto_otorgado || 'producto'}`;
      notas = notas ? `${notas} — ${redencionNota}` : redencionNota;
    }

    if (payment.pagos?.length) {
      for (const pago of payment.pagos) {
        await client.query(
          'INSERT INTO orden_pagos (orden_id, payment_method, amount_cash, amount_card, persona_nombre) VALUES ($1,$2,$3,$4,$5)',
          [orderId, pago.payment_method, pago.amount_cash || 0, pago.amount_card || 0, pago.persona_nombre || null]
        );
      }
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

module.exports = {
  PAYMENT_ROUNDING_TOLERANCE,
  aggregatePagos,
  closeOrder,
  deductInventoryForOrder,
  validateClosePayment
};