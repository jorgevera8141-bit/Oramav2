const express = require('express');
const pool = require('../../config/database');
const { parseDateParam, previousEqualPeriod } = require('../../shared/dates');
const { localDateSql, localTimestampSql, TODAY_SQL } = require('../../shared/timezone');
const { compValueSql, salesSql, paidFractionSql } = require('../../shared/comps');
const { getTaxSettings } = require('../../shared/tax');
const { getBusinessSettings } = require('../../shared/business');
const { marginOnMenuPrice } = require('../pricing/calculator');

const router = express.Router();

// Which menu item an order line belongs to. Lines carry menu_item_id; rows saved before
// that column existed fall back to the name, picking a single match so two menu items
// sharing a name can't double-count a line (the old join on nombre did exactly that).
const LINE_MENU_ITEM_SQL = `COALESCE(oi.menu_item_id, (SELECT m2.id FROM menu_items m2 WHERE m2.nombre = oi.item_nombre ORDER BY m2.id LIMIT 1))`;

router.get('/resumen', async (req, res) => {
  const date = parseDateParam(req.query.date);
  const dateFilter = date ? '$1' : TODAY_SQL;
  const params = date ? [date] : [];
  const { rows: [summary] } = await pool.query(
    `SELECT COUNT(*)::int AS ordenes,
            COUNT(*) FILTER (WHERE ${salesSql('ordenes')} > 0)::int AS ordenes_pagadas,
            COALESCE(SUM(${salesSql('ordenes')}), 0) AS total,
            COALESCE(SUM(${compValueSql('ordenes')}), 0) AS cortesias,
            COALESCE(SUM(amount_cash), 0) AS total_efectivo,
            COALESCE(SUM(amount_card), 0) AS total_tarjeta
     FROM ordenes
     WHERE status = 'cerrada' AND ${localDateSql('closed_at')} = ${dateFilter}`,
    params
  );
  const { rows: ordenesLista } = await pool.query(
    `SELECT * FROM ordenes WHERE status = 'cerrada' AND ${localDateSql('closed_at')} = ${dateFilter} ORDER BY closed_at DESC`,
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
    `SELECT COUNT(*)::int AS ordenes,
            COUNT(*) FILTER (WHERE ${salesSql('ordenes')} > 0)::int AS ordenes_pagadas,
            COALESCE(SUM(${salesSql('ordenes')}),0) AS ingresos,
            COALESCE(SUM(${compValueSql('ordenes')}),0) AS cortesias
     FROM ordenes WHERE status = 'cerrada' AND ${localDateSql('closed_at')} BETWEEN $1 AND $2`,
    [from, to]
  );
  const { rows: [gastoStats] } = await pool.query(
    'SELECT COALESCE(SUM(monto),0) AS gastos FROM gastos WHERE fecha BETWEEN $1 AND $2',
    [from, to]
  );
  const ingresos = Number(orderStats.ingresos);
  const gastos = Number(gastoStats.gastos);
  const ordenes = orderStats.ordenes;
  const ordenesPagadas = orderStats.ordenes_pagadas;
  return {
    ingresos, gastos, neto: ingresos - gastos, ordenes,
    cortesias: Number(orderStats.cortesias),
    ticket: ordenesPagadas > 0 ? ingresos / ordenesPagadas : 0
  };
}

router.get('/reportes/v2', async (req, res) => {
  const from = parseDateParam(req.query.from);
  const to = parseDateParam(req.query.to);
  if (!from || !to) throw Object.assign(new Error('from y to son requeridos (YYYY-MM-DD)'), { statusCode: 400 });

  const prev = previousEqualPeriod(from, to);
  const current = await kpiFor(from, to);
  const previous = await kpiFor(prev.from, prev.to);

  const { rows: serie } = await pool.query(
    `SELECT ${localDateSql('closed_at')} AS d, COALESCE(SUM(${salesSql('ordenes')}),0) AS ingresos, COUNT(*)::int AS ordenes
     FROM ordenes WHERE status = 'cerrada' AND ${localDateSql('closed_at')} BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`,
    [from, to]
  );

  const { rows: pagos } = await pool.query(
    `SELECT 'efectivo' AS payment_method, COALESCE(SUM(amount_cash),0) AS total, COUNT(*) FILTER (WHERE amount_cash > 0)::int AS ordenes FROM ordenes WHERE status = 'cerrada' AND ${localDateSql('closed_at')} BETWEEN $1 AND $2
     UNION ALL
     SELECT 'tarjeta' AS payment_method, COALESCE(SUM(amount_card),0) AS total, COUNT(*) FILTER (WHERE amount_card > 0)::int AS ordenes FROM ordenes WHERE status = 'cerrada' AND ${localDateSql('closed_at')} BETWEEN $1 AND $2`,
    [from, to]
  );

  const { rows: categorias } = await pool.query(
    `SELECT mi.categoria, COALESCE(SUM(oi.cantidad),0)::int AS cantidad, COALESCE(SUM(oi.cantidad * oi.precio * ${paidFractionSql('o')}),0) AS total
     FROM orden_items oi
     JOIN ordenes o ON o.id = oi.orden_id
     JOIN menu_items mi ON mi.id = ${LINE_MENU_ITEM_SQL}
     WHERE o.status = 'cerrada' AND ${localDateSql('o.closed_at')} BETWEEN $1 AND $2
       AND COALESCE(o.payment_method, '') NOT IN ('cortesia', 'cliente_frecuente')
     GROUP BY mi.categoria ORDER BY total DESC`,
    [from, to]
  );

  const { rows: topQty } = await pool.query(
    `SELECT oi.item_nombre, SUM(oi.cantidad)::int AS cantidad, COALESCE(SUM(oi.cantidad * oi.precio * ${paidFractionSql('o')}),0) AS ingreso
     FROM orden_items oi JOIN ordenes o ON o.id = oi.orden_id
     WHERE o.status = 'cerrada' AND ${localDateSql('o.closed_at')} BETWEEN $1 AND $2
       AND COALESCE(o.payment_method, '') NOT IN ('cortesia', 'cliente_frecuente')
     GROUP BY oi.item_nombre ORDER BY cantidad DESC LIMIT 8`,
    [from, to]
  );

  const { rows: topIngreso } = await pool.query(
    `SELECT oi.item_nombre, SUM(oi.cantidad)::int AS cantidad, COALESCE(SUM(oi.cantidad * oi.precio * ${paidFractionSql('o')}),0) AS ingreso
     FROM orden_items oi JOIN ordenes o ON o.id = oi.orden_id
     WHERE o.status = 'cerrada' AND ${localDateSql('o.closed_at')} BETWEEN $1 AND $2
       AND COALESCE(o.payment_method, '') NOT IN ('cortesia', 'cliente_frecuente')
     GROUP BY oi.item_nombre ORDER BY ingreso DESC LIMIT 8`,
    [from, to]
  );

  const { rows: ordenesLista } = await pool.query(
    `SELECT * FROM ordenes WHERE status = 'cerrada' AND ${localDateSql('closed_at')} BETWEEN $1 AND $2 ORDER BY closed_at DESC LIMIT 500`,
    [from, to]
  );

  res.json({ success: true, current, previous, serie, pagos, categorias, top_qty: topQty, top_ingreso: topIngreso, ordenes_lista: ordenesLista });
});

router.get('/reportes/horas', async (req, res) => {
  const from = parseDateParam(req.query.from);
  const to = parseDateParam(req.query.to);
  const { rows } = from && to
    ? await pool.query(
        `SELECT EXTRACT(DOW FROM ${localTimestampSql('created_at')})::int AS dow, EXTRACT(HOUR FROM ${localTimestampSql('created_at')})::int AS hora, COUNT(*)::int AS ordenes, COALESCE(SUM(${salesSql('ordenes')}),0) AS ingresos
         FROM ordenes WHERE status = 'cerrada' AND ${localDateSql('created_at')} BETWEEN $1 AND $2 GROUP BY 1, 2 ORDER BY 1, 2`,
        [from, to]
      )
    : await pool.query(
        `SELECT EXTRACT(DOW FROM ${localTimestampSql('created_at')})::int AS dow, EXTRACT(HOUR FROM ${localTimestampSql('created_at')})::int AS hora, COUNT(*)::int AS ordenes, COALESCE(SUM(${salesSql('ordenes')}),0) AS ingresos
         FROM ordenes WHERE status = 'cerrada' GROUP BY 1, 2 ORDER BY 1, 2`
      );
  res.json({ success: true, celdas: rows });
});

router.get('/reportes/margenes', async (_req, res) => {
  const { rows: items } = await pool.query(`
    SELECT mi.id, mi.nombre, mi.categoria, mi.precio,
           recipe_cost.costo AS costo_insumos,
           COALESCE(extras.packaging + extras.labor + extras.other, 0) AS costo_extras,
           COALESCE(sold.vendidos_30d, 0)::int AS vendidos_30d
    FROM menu_items mi
    LEFT JOIN (
      SELECT ri.menu_item_id, SUM(ri.quantity_used * ii.cost_per_unit) AS costo
      FROM recipe_items ri JOIN inventory_items ii ON ii.id = ri.inventory_item_id
      GROUP BY ri.menu_item_id
    ) recipe_cost ON recipe_cost.menu_item_id = mi.id
    LEFT JOIN menu_item_costs extras ON extras.menu_item_id = mi.id
    LEFT JOIN (
      SELECT ${LINE_MENU_ITEM_SQL} AS menu_item_id, SUM(oi.cantidad) AS vendidos_30d
      FROM orden_items oi JOIN ordenes o ON o.id = oi.orden_id
      WHERE o.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
    ) sold ON sold.menu_item_id = mi.id
    ORDER BY mi.nombre
  `);

  const { rows: [settingRow] } = await pool.query("SELECT value FROM orama_settings WHERE key = 'margin_threshold_pct'");
  const thresholdPct = Number(settingRow?.value || 70);
  const [tax, business] = await Promise.all([getTaxSettings(pool), getBusinessSettings(pool)]);

  const { rows: [coverage] } = await pool.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM recipe_items ri WHERE ri.menu_item_id = mi.id))::int AS con_receta
    FROM menu_items mi
  `);
  const { rows: [insumos] } = await pool.query('SELECT COUNT(*)::int AS count FROM inventory_items WHERE cost_per_unit > 0');

  const withMargin = items
    .filter((item) => item.costo_insumos !== null)
    .map((item) => {
      const precio = Number(item.precio);
      // The same cost and margin the calculator shows: ingredients plus packaging/labour/other, with the card
      // fee and the free drinks taken out of the price, on the price without IVA (menu prices include IVA).
      const costo = Number(item.costo_insumos) + Number(item.costo_extras);
      const { netPrice, margin: margen, marginPct: margenPct } = marginOnMenuPrice(precio, costo, tax, business);
      return {
        id: item.id,
        nombre: item.nombre,
        categoria: item.categoria,
        precio,
        precio_neto: netPrice,
        costo,
        costo_insumos: Number(item.costo_insumos),
        costo_extras: Number(item.costo_extras),
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
    iva: tax,
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
            COALESCE(SUM(${salesSql('o')}),0) AS ingresos,
            COALESCE(AVG(${salesSql('o')}) FILTER (WHERE ${salesSql('o')} > 0),0) AS ticket,
            AVG(EXTRACT(EPOCH FROM (o.closed_at - o.created_at)) / 60) FILTER (WHERE o.closed_at IS NOT NULL) AS min_prom
     FROM ordenes o
     WHERE o.status = 'cerrada' AND ${localDateSql('o.closed_at')} BETWEEN $1 AND $2 AND o.mesa_nombre IS NOT NULL
     GROUP BY o.mesa_nombre
     ORDER BY ingresos DESC`,
    [from, to]
  );
  res.json({ success: true, mesas: rows });
});

router.get('/finanzas', async (req, res) => {
  const from = parseDateParam(req.query.from);
  const to = parseDateParam(req.query.to);
  if (!from || !to) throw Object.assign(new Error('from y to son requeridos (YYYY-MM-DD)'), { statusCode: 400 });

  const { rows: ingresosPorMes } = await pool.query(
    `SELECT to_char(date_trunc('month', ${localTimestampSql('closed_at')}), 'YYYY-MM') AS mes, COALESCE(SUM(${salesSql('ordenes')}),0) AS ingresos
     FROM ordenes WHERE status = 'cerrada' AND ${localDateSql('closed_at')} BETWEEN $1 AND $2
     GROUP BY 1 ORDER BY 1`,
    [from, to]
  );
  const { rows: gastosPorMes } = await pool.query(
    `SELECT to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes, COALESCE(SUM(monto),0) AS gastos
     FROM gastos WHERE fecha BETWEEN $1 AND $2
     GROUP BY 1 ORDER BY 1`,
    [from, to]
  );
  const { rows: categoriasGasto } = await pool.query(
    `SELECT categoria, COALESCE(SUM(monto),0) AS total
     FROM gastos WHERE fecha BETWEEN $1 AND $2
     GROUP BY categoria ORDER BY total DESC`,
    [from, to]
  );

  const mesesMap = new Map();
  ingresosPorMes.forEach((row) => mesesMap.set(row.mes, { mes: row.mes, ingresos: Number(row.ingresos), gastos: 0 }));
  gastosPorMes.forEach((row) => {
    const existing = mesesMap.get(row.mes) || { mes: row.mes, ingresos: 0, gastos: 0 };
    existing.gastos = Number(row.gastos);
    mesesMap.set(row.mes, existing);
  });
  const meses = Array.from(mesesMap.values())
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((m) => ({ ...m, neto: m.ingresos - m.gastos }));

  const resumen = meses.reduce(
    (acc, m) => ({ ingresos: acc.ingresos + m.ingresos, gastos: acc.gastos + m.gastos }),
    { ingresos: 0, gastos: 0 }
  );
  resumen.neto = resumen.ingresos - resumen.gastos;

  res.json({ success: true, meses, categorias_gasto: categoriasGasto, resumen });
});

module.exports = router;
