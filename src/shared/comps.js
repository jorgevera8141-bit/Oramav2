// Revenue is money actually earned. A comped order is given away: a staff cortesia, or a
// loyalty redemption. In a split with a cortesia person, that person's share is whatever the
// others did not pay. Tendered cash above the total (change) never makes a comp negative.
// `alias` is the ordenes table name or alias in the surrounding query.
function compValueSql(alias = 'ordenes') {
  return `(CASE
    WHEN ${alias}.payment_method IN ('cortesia', 'cliente_frecuente') THEN ${alias}.total
    WHEN ${alias}.payment_method = 'dividido'
      AND EXISTS (SELECT 1 FROM orden_pagos cp WHERE cp.orden_id = ${alias}.id AND cp.payment_method = 'cortesia')
      THEN GREATEST(${alias}.total - COALESCE((SELECT SUM(pp.amount_cash + pp.amount_card) FROM orden_pagos pp WHERE pp.orden_id = ${alias}.id), 0), 0)
    ELSE 0
  END)`;
}

function salesSql(alias = 'ordenes') {
  return `(${alias}.total - ${compValueSql(alias)})`;
}

// The share of an order's price that was actually paid: 1 for a normal order, 0 for a fully comped one,
// and in between for a split with a comped person (two coffees, one free: 0.5). Product revenue is
// weighted by this so it adds up to the same sales as the corte and the profit report.
function paidFractionSql(alias = 'ordenes') {
  return `COALESCE(${salesSql(alias)} / NULLIF(${alias}.total, 0), 1)`;
}

module.exports = { compValueSql, salesSql, paidFractionSql };
