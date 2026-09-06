const express = require('express');
const pool = require('../../config/database');
const { parseDateParam, previousEqualPeriod } = require('../../shared/dates');

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

async function kpiFor(from, to) {
  const { rows: [orderStats] } = await pool.query(
    `SELECT COUNT(*)::int AS ordenes, COALESCE(SUM(total),0) AS ingresos FROM ordenes WHERE status = 'cerrada' AND closed_at::date BETWEEN $1 AND $2`,
    [from, to]
  );
  const { rows: [gastoStats] } = await pool.query(
    'SELECT COALESCE(SUM(monto),0) AS gastos FROM gastos WHERE fecha BETWEEN $1 AND $2',
    [from, to]
  );
  const ingresos = Number(orderStats.ingresos);
  const gastos = Number(gastoStats.gastos);
  const ordenes = orderStats.ordenes;
  return { ingresos, gastos, neto: ingresos - gastos, ordenes, ticket: ordenes > 0 ? ingresos / ordenes : 0 };
}

router.get('/reportes/v2', async (req, res) => {
  const from = parseDateParam(req.query.from);
  const to = parseDateParam(req.query.to);
  if (!from || !to) throw Object.assign(new Error('from y to son requeridos (YYYY-MM-DD)'), { statusCode: 400 });

  const prev = previousEqualPeriod(from, to);
  const current = await kpiFor(from, to);
  const previous = await kpiFor(prev.from, prev.to);

  const { rows: serie } = await pool.query(
    `SELECT closed_at::date AS d, COALESCE(SUM(total),0) AS ingresos, COUNT(*)::int AS ordenes
     FROM ordenes WHERE status = 'cerrada' AND closed_at::date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`,
    [from, to]
  );

  const { rows: pagos } = await pool.query(
    `SELECT 'efectivo' AS payment_method, COALESCE(SUM(amount_cash),0) AS total, COUNT(*) FILTER (WHERE amount_cash > 0)::int AS ordenes FROM ordenes WHERE status = 'cerrada' AND closed_at::date BETWEEN $1 AND $2
     UNION ALL
     SELECT 'tarjeta' AS payment_method, COALESCE(SUM(amount_card),0) AS total, COUNT(*) FILTER (WHERE amount_card > 0)::int AS ordenes FROM ordenes WHERE status = 'cerrada' AND closed_at::date BETWEEN $1 AND $2`,
    [from, to]
  );

  const { rows: categorias } = await pool.query(
    `SELECT mi.categoria, COALESCE(SUM(oi.cantidad),0)::int AS cantidad, COALESCE(SUM(oi.cantidad * oi.precio),0) AS total
     FROM orden_items oi
     JOIN ordenes o ON o.id = oi.orden_id
     JOIN menu_items mi ON mi.nombre = oi.item_nombre
     WHERE o.status = 'cerrada' AND o.closed_at::date BETWEEN $1 AND $2
     GROUP BY mi.categoria ORDER BY total DESC`,
    [from, to]
  );

  const { rows: topQty } = await pool.query(
    `SELECT oi.item_nombre, SUM(oi.cantidad)::int AS cantidad, COALESCE(SUM(oi.cantidad * oi.precio),0) AS ingreso
     FROM orden_items oi JOIN ordenes o ON o.id = oi.orden_id
     WHERE o.status = 'cerrada' AND o.closed_at::date BETWEEN $1 AND $2
     GROUP BY oi.item_nombre ORDER BY cantidad DESC LIMIT 8`,
    [from, to]
  );

  const { rows: topIngreso } = await pool.query(
    `SELECT oi.item_nombre, SUM(oi.cantidad)::int AS cantidad, COALESCE(SUM(oi.cantidad * oi.precio),0) AS ingreso
     FROM orden_items oi JOIN ordenes o ON o.id = oi.orden_id
     WHERE o.status = 'cerrada' AND o.closed_at::date BETWEEN $1 AND $2
     GROUP BY oi.item_nombre ORDER BY ingreso DESC LIMIT 8`,
    [from, to]
  );

  const { rows: ordenesLista } = await pool.query(
    `SELECT * FROM ordenes WHERE status = 'cerrada' AND closed_at::date BETWEEN $1 AND $2 ORDER BY closed_at DESC LIMIT 500`,
    [from, to]
  );

  res.json({ success: true, current, previous, serie, pagos, categorias, top_qty: topQty, top_ingreso: topIngreso, ordenes_lista: ordenesLista });
});

router.get('/reportes/horas', async (req, res) => {
  const from = parseDateParam(req.query.from);
  const to = parseDateParam(req.query.to);
  const { rows } = from && to
    ? await pool.query(
        `SELECT EXTRACT(DOW FROM created_at)::int AS dow, EXTRACT(HOUR FROM created_at)::int AS hora, COUNT(*)::int AS ordenes, COALESCE(SUM(total),0) AS ingresos
         FROM ordenes WHERE created_at::date BETWEEN $1 AND $2 GROUP BY 1, 2 ORDER BY 1, 2`,
        [from, to]
      )
    : await pool.query(
        `SELECT EXTRACT(DOW FROM created_at)::int AS dow, EXTRACT(HOUR FROM created_at)::int AS hora, COUNT(*)::int AS ordenes, COALESCE(SUM(total),0) AS ingresos
         FROM ordenes GROUP BY 1, 2 ORDER BY 1, 2`
      );
  res.json({ success: true, celdas: rows });
});

router.get('/reportes/margenes', async (_req, res) => {
  const { rows: items } = await pool.query(`
    SELECT mi.id, mi.nombre, mi.categoria, mi.precio,
           recipe_cost.costo,
           COALESCE(sold.vendidos_30d, 0)::int AS vendidos_30d
    FROM menu_items mi
    LEFT JOIN (
      SELECT ri.menu_item_id, SUM(ri.quantity_used * ii.cost_per_unit) AS costo
      FROM recipe_items ri JOIN inventory_items ii ON ii.id = ri.inventory_item_id
      GROUP BY ri.menu_item_id
    ) recipe_cost ON recipe_cost.menu_item_id = mi.id
    LEFT JOIN (
      SELECT oi.item_nombre, SUM(oi.cantidad) AS vendidos_30d
      FROM orden_items oi JOIN ordenes o ON o.id = oi.orden_id
      WHERE o.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY oi.item_nombre
    ) sold ON sold.item_nombre = mi.nombre
    ORDER BY mi.nombre
  `);

  const { rows: [settingRow] } = await pool.query("SELECT value FROM orama_settings WHERE key = 'margin_threshold_pct'");
  const thresholdPct = Number(settingRow?.value || 70);

  const { rows: [coverage] } = await pool.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM recipe_items ri WHERE ri.menu_item_id = mi.id))::int AS con_receta
    FROM menu_items mi
  `);
  const { rows: [insumos] } = await pool.query('SELECT COUNT(*)::int AS count FROM inventory_items WHERE cost_per_unit > 0');

  const withMargin = items
    .filter((item) => item.costo !== null)
    .map((item) => {
      const precio = Number(item.precio);
      const costo = Number(item.costo);
      const margen = precio - costo;
      const margenPct = precio > 0 ? (margen / precio) * 100 : null;
      return {
        id: item.id,
        nombre: item.nombre,
        categoria: item.categoria,
        precio,
        costo,
        margen,
        margen_pct: margenPct,
        vendidos_30d: item.vendidos_30d,
        bajo_umbral: margenPct !== null && margenPct < thresholdPct
      };
    });

  res.json({
    success: true,
    threshold_pct: thresholdPct,
    cobertura: { con_receta: coverage.con_receta, total: coverage.total, insumos_con_costo: insumos.count },
    items: withMargin
  });
});

router.get('/reportes/mesas', async (req, res) => {
  const from = parseDateParam(req.query.from);
  const to = parseDateParam(req.query.to);
  if (!from || !to) throw Object.assign(new Error('from y to son requeridos (YYYY-MM-DD)'), { statusCode: 400 });
  const { rows } = await pool.query(
    `SELECT o.mesa_nombre,
            COUNT(*)::int AS ordenes,
            COALESCE(SUM(o.total),0) AS ingresos,
            COALESCE(AVG(o.total),0) AS ticket,
            AVG(EXTRACT(EPOCH FROM (o.closed_at - o.created_at)) / 60) FILTER (WHERE o.closed_at IS NOT NULL) AS min_prom
     FROM ordenes o
     WHERE o.status = 'cerrada' AND o.closed_at::date BETWEEN $1 AND $2 AND o.mesa_nombre IS NOT NULL
     GROUP BY o.mesa_nombre
     ORDER BY ingresos DESC`,
    [from, to]
  );
  res.json({ success: true, mesas: rows });
});

router.get('/finanzas', async (_req, res) => {
  const { rows } = await pool.query('SELECT COALESCE(SUM(total),0) AS ingresos FROM ordenes WHERE status = \'cerrada\'');
  res.json({ success: true, finances: rows[0] });
});

module.exports = router;
