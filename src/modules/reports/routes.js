const express = require('express');
const pool = require('../../config/database');
const { parseDateParam } = require('../../shared/dates');

const router = express.Router();

router.get('/resumen', async (req, res) => {
  const date = parseDateParam(req.query.date);
  const dateFilter = date ? '$1' : 'CURRENT_DATE';
  const params = date ? [date] : [];
  const { rows: [summary] } = await pool.query(
    `SELECT COUNT(*)::int AS ordenes,
            COALESCE(SUM(total), 0) AS total,
            COALESCE(SUM(amount_cash), 0) AS total_efectivo,
            COALESCE(SUM(amount_card), 0) AS total_tarjeta
     FROM ordenes
     WHERE status = 'cerrada' AND closed_at::date = ${dateFilter}`,
    params
  );
  const { rows: ordenesLista } = await pool.query(
    `SELECT * FROM ordenes WHERE status = 'cerrada' AND closed_at::date = ${dateFilter} ORDER BY closed_at DESC`,
    params
  );
  res.json({ success: true, ...summary, ordenes_lista: ordenesLista });
});

router.get('/reportes', async (_req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS orders, COALESCE(SUM(total),0) AS total FROM ordenes');
  res.json({ success: true, report: rows[0] });
});

router.get('/reportes/v2', async (_req, res) => {
  const current = await pool.query('SELECT COUNT(*)::int AS orders, COALESCE(SUM(total),0) AS total FROM ordenes WHERE created_at >= NOW() - INTERVAL \'30 days\'');
  const previous = await pool.query('SELECT COUNT(*)::int AS orders, COALESCE(SUM(total),0) AS total FROM ordenes WHERE created_at >= NOW() - INTERVAL \'60 days\' AND created_at < NOW() - INTERVAL \'30 days\'');
  res.json({ success: true,
    current: current.rows[0],
    previous: previous.rows[0],
    peak_hours: [],
    margins: []
  });
});

router.get('/reportes/horas', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS total FROM ordenes GROUP BY 1 ORDER BY 1'
  );
  res.json({ success: true, hours: rows });
});

router.get('/reportes/margenes', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT mi.id, mi.nombre, COALESCE(SUM(oi.cantidad * oi.precio),0) AS revenue
     FROM menu_items mi
     LEFT JOIN orden_items oi ON oi.item_nombre = mi.nombre
     GROUP BY mi.id, mi.nombre
     ORDER BY revenue DESC`
  );
  res.json({ success: true, margins: rows });
});

router.get('/finanzas', async (_req, res) => {
  const { rows } = await pool.query('SELECT COALESCE(SUM(total),0) AS ingresos FROM ordenes WHERE status = \'cerrada\'');
  res.json({ success: true, finances: rows[0] });
});

module.exports = router;