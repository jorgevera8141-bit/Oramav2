const express = require('express');
const pool = require('../../config/database');
const { closeOrder } = require('./service');

const router = express.Router();

router.get('/ordenes', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM ordenes ORDER BY created_at DESC');
  res.json({ success: true, ordenes: rows });
});

router.get('/ordenes/dia', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM ordenes WHERE created_at::date = CURRENT_DATE ORDER BY created_at DESC'
  );
  res.json({ success: true, ordenes: rows });
});

router.get('/ordenes/:id/items', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM orden_items WHERE orden_id = $1 ORDER BY id ASC', [Number(req.params.id)]);
  res.json({ success: true, items: rows });
});

router.post('/ordenes', async (req, res) => {
  const { mesa_id, mesa_nombre, items = [], notas } = req.body || {};
  const total = items.reduce((sum, item) => sum + (Number(item.precio) * Number(item.cantidad || 1)), 0);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      'INSERT INTO ordenes (mesa_id, mesa_nombre, notas, total, status) VALUES ($1, $2, $3, $4, \'abierta\') RETURNING *',
      [mesa_id, mesa_nombre, notas, total]
    );
    const orden = orderResult.rows[0];
    for (const item of items) {
      await client.query(
        'INSERT INTO orden_items (orden_id, item_nombre, precio, cantidad) VALUES ($1, $2, $3, $4)',
        [orden.id, item.item_nombre, item.precio, item.cantidad || 1]
      );
    }
    await client.query('UPDATE mesas SET status = \'ocupada\' WHERE id = $1', [mesa_id]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, orden });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

router.put('/ordenes/:id/cerrar', async (req, res) => {
  const orden = await closeOrder(Number(req.params.id), req.body || {});
  res.json({ success: true, orden });
});

router.put('/ordenes/:id/cancelar', async (req, res) => {
  const id = Number(req.params.id);
  await pool.query('UPDATE ordenes SET status = \'cancelada\' WHERE id = $1', [id]);
  res.json({ success: true });
});

module.exports = router;