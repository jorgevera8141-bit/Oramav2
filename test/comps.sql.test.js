const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { compValueSql, salesSql } = require('../src/shared/comps');

// Runs the real SQL against Postgres on temp tables. Set TEST_DATABASE_URL to a scratch
// database to run it; without one the test is skipped (the rest of the suite needs no DB).
const url = process.env.TEST_DATABASE_URL;

test('compValueSql separates giveaways from sales for every way an order can be comped', { skip: !url && 'set TEST_DATABASE_URL to run SQL tests' }, async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('CREATE TEMP TABLE ordenes (id int, total numeric, payment_method text)');
    await client.query('CREATE TEMP TABLE orden_pagos (orden_id int, payment_method text, amount_cash numeric, amount_card numeric)');
    await client.query(`INSERT INTO ordenes VALUES
      (1, 100, 'efectivo'), (2, 50, 'cortesia'), (3, 38, 'cliente_frecuente'),
      (4, 120, 'dividido'), (5, 80, 'dividido'), (6, 60, 'dividido')`);
    await client.query(`INSERT INTO orden_pagos VALUES
      (4, 'efectivo', 40, 0), (4, 'tarjeta', 0, 30), (4, 'cortesia', 0, 0),
      (5, 'efectivo', 40, 0), (5, 'tarjeta', 0, 40),
      (6, 'efectivo', 70, 0), (6, 'cortesia', 0, 0)`);
    const { rows } = await client.query(
      `SELECT id, ${compValueSql('ordenes')} AS comp, ${salesSql('ordenes')} AS sales FROM ordenes ORDER BY id`
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, [Number(r.comp), Number(r.sales)]]));
    assert.deepEqual(byId[1], [0, 100], 'a paid order is all sales');
    assert.deepEqual(byId[2], [50, 0], 'a cortesia order is all giveaway');
    assert.deepEqual(byId[3], [38, 0], 'a loyalty redemption is a giveaway');
    assert.deepEqual(byId[4], [50, 70], 'a split with a comped person: the unpaid remainder is the comp');
    assert.deepEqual(byId[5], [0, 80], 'a fully paid split is all sales');
    assert.deepEqual(byId[6], [0, 60], 'tendered cash above the total never makes the comp negative');
  } finally {
    await client.end();
  }
});

const { paidFractionSql } = require('../src/shared/comps');

test('paidFractionSql is the share of an order that was actually paid, so product revenue can match sales', { skip: !url && 'set TEST_DATABASE_URL to run SQL tests' }, async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('CREATE TEMP TABLE ordenes (id int, total numeric, payment_method text)');
    await client.query('CREATE TEMP TABLE orden_pagos (orden_id int, payment_method text, amount_cash numeric, amount_card numeric)');
    await client.query(`INSERT INTO ordenes VALUES
      (1, 100, 'efectivo'), (2, 50, 'cortesia'), (3, 38, 'cliente_frecuente'),
      (4, 86, 'dividido'), (5, 80, 'dividido'), (6, 60, 'dividido'), (7, 0, 'efectivo'), (8, 120, 'dividido')`);
    await client.query(`INSERT INTO orden_pagos VALUES
      (4, 'efectivo', 43, 0), (4, 'cortesia', 0, 0),
      (5, 'efectivo', 40, 0), (5, 'tarjeta', 0, 40),
      (6, 'efectivo', 70, 0), (6, 'cortesia', 0, 0),
      (8, 'efectivo', 70, 0), (8, 'tarjeta', 0, 0), (8, 'cortesia', 0, 0)`);
    const { rows } = await client.query(`SELECT id, ${paidFractionSql('ordenes')} AS fraction FROM ordenes ORDER BY id`);
    const by = Object.fromEntries(rows.map((r) => [r.id, Number(r.fraction)]));
    assert.equal(by[1], 1, 'a paid order counts in full');
    assert.equal(by[2], 0, 'a cortesia order counts for nothing');
    assert.equal(by[3], 0, 'a loyalty redemption counts for nothing');
    assert.equal(by[4], 0.5, 'two coffees, one comped: half is earned');
    assert.equal(by[5], 1, 'a fully paid split counts in full');
    assert.equal(by[6], 1, 'tendered cash above the total never pushes it past a full count');
    assert.equal(by[7], 1, 'a zero-total order does not divide by zero');
    assert.ok(Math.abs(by[8] - 70 / 120) < 1e-9, 'an uneven split is prorated by what was paid');
  } finally {
    await client.end();
  }
});
