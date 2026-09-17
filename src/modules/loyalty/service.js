const pool = require('../../config/database');
const { verifyStaffPin } = require('../../shared/pin-auth');
const { logBitacora } = require('../../shared/audit');

const REWARD_STAMPS_REQUIRED = 9;

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function computeBalance(stampRows) {
  return stampRows.filter((s) => !s.consumed_by_redencion_id).length;
}

async function findCustomerByPhone(phone, db = pool) {
  const { rows } = await db.query('SELECT * FROM loyalty_customers WHERE phone = $1', [normalizePhone(phone)]);
  return rows[0] || null;
}

async function createCustomer(phone, nombre, marketingConsent, db = pool) {
  const normalized = normalizePhone(phone);
  const consent = Boolean(marketingConsent);
  // ON CONFLICT DO UPDATE (a no-op self-assignment) instead of a plain INSERT: this
  // makes creation atomic and race-safe. Two concurrent callers creating the same
  // new phone number both get a row back — the loser returns the winner's existing
  // record — instead of one of them throwing a unique-violation on phone.
  const { rows } = await db.query(
    `INSERT INTO loyalty_customers (phone, nombre, marketing_consent, consent_at)
     VALUES ($1, $2, $3, CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END)
     ON CONFLICT (phone) DO UPDATE SET phone = loyalty_customers.phone
     RETURNING *`,
    [normalized, nombre || null, consent]
  );
  return rows[0];
}

async function findOrCreateCustomer(phone, db = pool) {
  const existing = await findCustomerByPhone(phone, db);
  if (existing) return existing;
  return createCustomer(phone, null, false, db);
}

async function getCard(customerId, db = pool) {
  const { rows: stamps } = await db.query(
    'SELECT id, orden_id, consumed_by_redencion_id, created_at FROM loyalty_stamps WHERE customer_id = $1 ORDER BY created_at ASC',
    [customerId]
  );
  const balance = computeBalance(stamps);
  const { rows: activity } = await db.query(
    `SELECT tipo, created_at FROM (
       SELECT 'sello' AS tipo, created_at FROM loyalty_stamps WHERE customer_id = $1
       UNION ALL
       SELECT 'redencion' AS tipo, created_at FROM loyalty_redenciones WHERE customer_id = $1
     ) actividad ORDER BY created_at DESC LIMIT 10`,
    [customerId]
  );
  return {
    lifetime_stamps: stamps.length,
    balance,
    reward_available: balance >= REWARD_STAMPS_REQUIRED,
    stamps_required: REWARD_STAMPS_REQUIRED,
    recent_activity: activity
  };
}

async function awardStamp(customerId, ordenId, db = pool) {
  await db.query(
    'INSERT INTO loyalty_stamps (customer_id, orden_id) VALUES ($1, $2) ON CONFLICT (orden_id) DO NOTHING',
    [customerId, ordenId]
  );
}

async function mostFrequentItem(customerId, db = pool) {
  const { rows } = await db.query(
    `SELECT oi.item_nombre, COUNT(*) AS veces
     FROM loyalty_stamps ls
     JOIN orden_items oi ON oi.orden_id = ls.orden_id
     WHERE ls.customer_id = $1
     GROUP BY oi.item_nombre
     ORDER BY veces DESC, oi.item_nombre ASC
     LIMIT 1`,
    [customerId]
  );
  return rows[0]?.item_nombre || null;
}

// Runs the redemption's SQL inside a transaction the caller already owns (no
// BEGIN/COMMIT/ROLLBACK here) — lets an order-close flow redeem a reward and close
// the order as a single atomic transaction, so a failure either place undoes both.
async function redeemRewardWithClient(customerId, ordenId, actorNombre, client) {
  const { rows: unconsumed } = await client.query(
    `SELECT id FROM loyalty_stamps WHERE customer_id = $1 AND consumed_by_redencion_id IS NULL
     ORDER BY created_at ASC LIMIT $2 FOR UPDATE`,
    [customerId, REWARD_STAMPS_REQUIRED]
  );
  if (unconsumed.length < REWARD_STAMPS_REQUIRED) {
    throw Object.assign(new Error('El cliente no tiene suficientes sellos para canjear.'), { statusCode: 409 });
  }
  const producto = await mostFrequentItem(customerId, client);
  const { rows: redencionRows } = await client.query(
    `INSERT INTO loyalty_redenciones (customer_id, orden_id, tipo, stamps_consumidos, producto_otorgado, actor_nombre)
     VALUES ($1, $2, 'recompensa', $3, $4, $5) RETURNING *`,
    [customerId, ordenId, REWARD_STAMPS_REQUIRED, producto, actorNombre]
  );
  const redencion = redencionRows[0];
  await client.query(
    'UPDATE loyalty_stamps SET consumed_by_redencion_id = $1 WHERE id = ANY($2::int[])',
    [redencion.id, unconsumed.map((row) => row.id)]
  );
  await logBitacora({
    entidadTipo: 'loyalty_redencion', entidadId: redencion.id, accion: 'redimir',
    actorNombre, actorTipo: 'staff', estadoAnterior: null, estadoNuevo: 'recompensa',
    detalle: { customer_id: customerId, orden_id: ordenId, producto_otorgado: producto }
  }, client);
  return redencion;
}

async function redeemReward(customerId, ordenId, actorNombre, actorPin) {
  await verifyStaffPin(actorNombre, actorPin);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const redencion = await redeemRewardWithClient(customerId, ordenId, actorNombre, client);
    await client.query('COMMIT');
    return redencion;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function manualAdjustment(customerId, cantidad, razon, actorNombre, actorPin) {
  await verifyStaffPin(actorNombre, actorPin, 'management');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (cantidad > 0) {
      for (let i = 0; i < cantidad; i += 1) {
        await client.query('INSERT INTO loyalty_stamps (customer_id, orden_id, note) VALUES ($1, NULL, $2)', [customerId, razon]);
      }
      await logBitacora({
        entidadTipo: 'loyalty_customer', entidadId: customerId, accion: 'ajuste_manual_agregar',
        actorNombre, actorTipo: 'management', estadoAnterior: null, estadoNuevo: null,
        detalle: { cantidad, razon }
      }, client);
    } else {
      const need = Math.abs(cantidad);
      const { rows: unconsumed } = await client.query(
        `SELECT id FROM loyalty_stamps WHERE customer_id = $1 AND consumed_by_redencion_id IS NULL
         ORDER BY created_at ASC LIMIT $2 FOR UPDATE`,
        [customerId, need]
      );
      if (unconsumed.length < need) {
        throw Object.assign(new Error('El cliente no tiene suficientes sellos para retirar esa cantidad.'), { statusCode: 409 });
      }
      const { rows: redencionRows } = await client.query(
        `INSERT INTO loyalty_redenciones (customer_id, orden_id, tipo, stamps_consumidos, razon, actor_nombre)
         VALUES ($1, NULL, 'ajuste_manual', $2, $3, $4) RETURNING *`,
        [customerId, need, razon, actorNombre]
      );
      const redencion = redencionRows[0];
      await client.query(
        'UPDATE loyalty_stamps SET consumed_by_redencion_id = $1 WHERE id = ANY($2::int[])',
        [redencion.id, unconsumed.map((row) => row.id)]
      );
      await logBitacora({
        entidadTipo: 'loyalty_customer', entidadId: customerId, accion: 'ajuste_manual_quitar',
        actorNombre, actorTipo: 'management', estadoAnterior: null, estadoNuevo: null,
        detalle: { cantidad, razon }
      }, client);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  REWARD_STAMPS_REQUIRED,
  normalizePhone,
  computeBalance,
  findCustomerByPhone,
  createCustomer,
  findOrCreateCustomer,
  getCard,
  awardStamp,
  mostFrequentItem,
  redeemReward,
  redeemRewardWithClient,
  manualAdjustment
};
