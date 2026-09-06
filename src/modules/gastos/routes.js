const express = require('express');
const pool = require('../../config/database');
const { validate } = require('../../middleware/validate');
const { createGastoSchema } = require('./schemas');
const { parseDateParam } = require('../../shared/dates');

const router = express.Router();

router.get('/gastos', async (req, res) => {
  const from = parseDateParam(req.query.from);
  const to = parseDateParam(req.query.to);
  const categoria = typeof req.query.categoria === 'string' ? req.query.categoria : null;

  const conditions = [];
  const params = [];
  if (from) { params.push(from); conditions.push(`fecha >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`fecha <= $${params.length}`); }
  if (categoria) { params.push(categoria); conditions.push(`categoria = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(`SELECT * FROM gastos ${where} ORDER BY fecha DESC, id DESC`, params);
  res.json({ success: true, gastos: rows });
});

router.post('/gastos', validate(createGastoSchema), async (req, res) => {
  const { categoria, descripcion, monto, fecha } = req.body;
  const { rows: [gasto] } = await pool.query(
    'INSERT INTO gastos (categoria, descripcion, monto, fecha) VALUES ($1, $2, $3, $4) RETURNING *',
    [categoria, descripcion || null, monto, fecha]
  );
  res.status(201).json({ success: true, gasto });
});

router.delete('/gastos/:id', async (req, res) => {
  const { rows } = await pool.query('DELETE FROM gastos WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) throw Object.assign(new Error('Gasto no encontrado'), { statusCode: 404 });
  res.json({ success: true });
});

module.exports = router;
