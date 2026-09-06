const pool = require('../../config/database');
const { applyPromotions } = require('./engine');

async function sweepPromotionLifecycle() {
  await pool.query(`
    UPDATE promociones SET estado = 'ACTIVE', updated_at = now()
    WHERE estado = 'SCHEDULED'
      AND (fecha_inicio < CURRENT_DATE OR (fecha_inicio = CURRENT_DATE AND (hora_inicio IS NULL OR hora_inicio <= CURRENT_TIME)))
  `);
  await pool.query(`
    UPDATE promociones SET estado = 'EXPIRED', updated_at = now()
    WHERE estado = 'ACTIVE'
      AND (fecha_fin < CURRENT_DATE OR (fecha_fin = CURRENT_DATE AND hora_fin IS NOT NULL AND hora_fin < CURRENT_TIME))
  `);
}

async function getActivePromotions(db = pool) {
  await sweepPromotionLifecycle();
  // FOR UPDATE only actually holds a lock when `db` is a transaction-scoped client (as
  // POST /ordenes passes) — on the bare `pool` (used by the read-only /preview endpoint)
  // each pool.query() is its own implicit transaction, so the lock is released immediately
  // and costs nothing. This is the same FOR UPDATE-based concurrency guard closeOrder
  // already uses for inventory deduction, applied here to prevent two simultaneous
  // checkouts from both redeeming past a promotion's limite_unidades.
  const { rows } = await db.query("SELECT * FROM promociones WHERE estado = 'ACTIVE' FOR UPDATE");
  return rows;
}

async function getRedemptionCounts(promoIds, db = pool) {
  if (!promoIds.length) return {};
  const { rows } = await db.query(
    'SELECT promocion_id, COALESCE(SUM(unidades),0)::int AS used FROM promocion_redenciones WHERE promocion_id = ANY($1) GROUP BY promocion_id',
    [promoIds]
  );
  return Object.fromEntries(rows.map((row) => [row.promocion_id, row.used]));
}

/**
 * Looks up real menu prices/categoria server-side (never trusts client-submitted price),
 * then applies currently-active promotions. Shared by POST /ordenes (the authoritative
 * charge, passing its transaction client so promotion rows are locked for the duration)
 * and POST /promotions/preview (live cart feedback, no client — uses the bare pool) so
 * both run identical, trusted logic — the client only ever sees a price this produced.
 */
async function priceItems(cartItems, db = pool) {
  const menuItemIds = cartItems.map((item) => Number(item.menu_item_id));
  const { rows: menuRows } = menuItemIds.length
    ? await db.query('SELECT id, nombre, categoria, precio FROM menu_items WHERE id = ANY($1)', [menuItemIds])
    : { rows: [] };
  const menuById = Object.fromEntries(menuRows.map((row) => [row.id, row]));

  const missing = menuItemIds.filter((id) => !menuById[id]);
  if (missing.length) {
    throw Object.assign(new Error(`Producto(s) no encontrados en el menú: ${missing.join(', ')}`), { statusCode: 400 });
  }

  const items = cartItems.map((item) => {
    const menuItem = menuById[Number(item.menu_item_id)];
    return {
      menu_item_id: menuItem.id,
      nombre: menuItem.nombre,
      categoria: menuItem.categoria,
      precio: Number(menuItem.precio),
      cantidad: Number(item.cantidad)
    };
  });

  const activePromotions = await getActivePromotions(db);
  const redemptionCounts = await getRedemptionCounts(activePromotions.map((promo) => promo.id), db);
  return applyPromotions({ items, promotions: activePromotions, now: new Date(), redemptionCounts });
}

async function recordRedemptions(client, ordenId, promocionesAplicadas) {
  for (const aplicada of promocionesAplicadas) {
    await client.query(
      'INSERT INTO promocion_redenciones (promocion_id, orden_id, descuento_aplicado, unidades) VALUES ($1,$2,$3,$4)',
      [aplicada.promocion_id, ordenId, aplicada.descuento, aplicada.unidades]
    );
  }
}

module.exports = { sweepPromotionLifecycle, getActivePromotions, getRedemptionCounts, priceItems, recordRedemptions };
