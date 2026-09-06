const express = require('express');
const pool = require('../../config/database');
const { closeOrder } = require('./service');
const { validate } = require('../../middleware/validate');
const { cerrarSchema, cancelarSchema, crearOrdenSchema } = require('./schemas');
const { parseDateParam } = require('../../shared/dates');
const { priceItems, recordRedemptions } = require('../promotions/service');

const router = express.Router();

router.get('/ordenes', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM ordenes ORDER BY created_at DESC');
  res.json({ success: true, ordenes: rows });
});

router.get('/ordenes/dia', async (req, res) => {
  const date = parseDateParam(req.query.date);
  const { rows } = date
    ? await pool.query('SELECT * FROM ordenes WHERE created_at::date = $1 ORDER BY created_at DESC', [date])
    : await pool.query('SELECT * FROM ordenes WHERE created_at::date = CURRENT_DATE ORDER BY created_at DESC');
  res.json({ success: true, ordenes: rows });
});

router.get('/ordenes/:id/items', async (req, res) => {
  const orderId = Number(req.params.id);
  const { rows: items } = await pool.query('SELECT * FROM orden_items WHERE orden_id = $1 ORDER BY id ASC', [orderId]);
  const { rows: redenciones } = await pool.query(
    `SELECT r.promocion_id, r.descuento_aplicado, r.unidades, p.nombre
     FROM promocion_redenciones r JOIN promociones p ON p.id = r.promocion_id
     WHERE r.orden_id = $1`,
    [orderId]
  );
  res.json({ success: true, items, redenciones });
});

router.post('/ordenes', validate(crearOrdenSchema), async (req, res) => {
  const { mesa_id, mesa_nombre, items, notas } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pricing = await priceItems(items, client);
    const orderResult = await client.query(
      'INSERT INTO ordenes (mesa_id, mesa_nombre, notas, total, status) VALUES ($1, $2, $3, $4, \'abierta\') RETURNING *',
      [mesa_id || null, mesa_nombre || null, notas || null, pricing.total]
    );
    const orden = orderResult.rows[0];
    for (const linea of pricing.lineas) {
      await client.query(
        `INSERT INTO orden_items (orden_id, item_nombre, precio, cantidad, menu_item_id, promocion_id, descuento_unitario)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          orden.id, linea.nombre, linea.precio_unitario - linea.descuento_unitario, linea.cantidad,
          linea.menu_item_id, linea.promocion_id, linea.descuento_unitario
        ]
      );
    }
    await recordRedemptions(client, orden.id, pricing.promociones_aplicadas);
    if (mesa_id) await client.query('UPDATE mesas SET status = \'ocupada\' WHERE id = $1', [mesa_id]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, orden, promociones_aplicadas: pricing.promociones_aplicadas });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

router.put('/ordenes/:id/cerrar', validate(cerrarSchema), async (req, res) => {
  const orden = await closeOrder(Number(req.params.id), req.body || {});
  res.json({ success: true, orden });
});

router.put('/ordenes/:id/cancelar', validate(cancelarSchema), async (req, res) => {
  const id = Number(req.params.id);
  const { motivo } = req.body || {};
  await pool.query('UPDATE ordenes SET status = \'cancelada\', notas = COALESCE($2, notas) WHERE id = $1', [id, motivo || null]);
  res.json({ success: true });
});

module.exports = router;