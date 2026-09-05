const express = require('express');
const pool = require('../../config/database');
const { notify } = require('../../shared/ntfy');

const router = express.Router();

router.get('/inventory', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM inventory_items ORDER BY id ASC');
  res.json({ success: true, inventory: rows });
});

router.post('/inventory', async (req, res) => {
  const b = req.body || {};
  const { rows } = await pool.query(
    `INSERT INTO inventory_items
     (name, unit, current_stock, reorder_threshold, reorder_quantity, cost_per_unit, supplier_name, supplier_contact)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.name, b.unit || 'pieza', b.current_stock || 0, b.reorder_threshold || 0, b.reorder_quantity || 0, b.cost_per_unit || 0, b.supplier_name, b.supplier_contact]
  );
  res.status(201).json({ success: true, item: rows[0] });
});

router.put('/inventory/:id', async (req, res) => {
  const b = req.body || {};
  const { rows } = await pool.query(
    `UPDATE inventory_items
     SET name = COALESCE($1, name),
         unit = COALESCE($2, unit),
         current_stock = COALESCE($3, current_stock),
         reorder_threshold = COALESCE($4, reorder_threshold),
         reorder_quantity = COALESCE($5, reorder_quantity),
         cost_per_unit = COALESCE($6, cost_per_unit),
         supplier_name = COALESCE($7, supplier_name),
         supplier_contact = COALESCE($8, supplier_contact)
     WHERE id = $9 RETURNING *`,
    [b.name, b.unit, b.current_stock, b.reorder_threshold, b.reorder_quantity, b.cost_per_unit, b.supplier_name, b.supplier_contact, Number(req.params.id)]
  );
  res.json({ success: true, item: rows[0] || null });
});

router.delete('/inventory/:id', async (req, res) => {
  await pool.query('DELETE FROM inventory_items WHERE id = $1', [Number(req.params.id)]);
  res.status(204).end();
});

router.post('/inventory/:id/restock', async (req, res) => {
  const id = Number(req.params.id);
  const amount = Number((req.body || {}).amount || 0);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE inventory_items SET current_stock = current_stock + $1, last_restocked_at = NOW() WHERE id = $2', [amount, id]);
    await client.query(
      'INSERT INTO inventory_movements (inventory_item_id, change_amount, reason, note) VALUES ($1, $2, \'restock\', $3)',
      [id, amount, 'Manual restock']
    );
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

router.post('/inventory/request-restock', async (req, res) => {
  await notify(process.env.NTFY_LOW_STOCK_TOPIC || 'orama-low-stock', 'Restock requested', 'Low stock alert');
  res.json({ success: true, message: 'Solicitud de reabasto enviada' });
});

router.get('/inventory/low-stock-count', async (_req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM inventory_items WHERE current_stock <= reorder_threshold');
  res.json({ success: true, count: rows[0]?.count || 0 });
});

router.get('/inventory/shopping-list', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM inventory_items WHERE current_stock <= reorder_threshold ORDER BY current_stock ASC'
  );
  res.json({ success: true, items: rows });
});

module.exports = router;