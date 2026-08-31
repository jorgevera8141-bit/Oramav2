const express = require('express');
const pool = require('../../config/database');

const router = express.Router();

router.get('/mesas', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM mesas ORDER BY id ASC');
  res.json(rows);
});

router.post('/mesas', async (req, res) => {
  const { nombre, status } = req.body || {};
  const { rows } = await pool.query(
    'INSERT INTO mesas (nombre, status) VALUES ($1, COALESCE($2, \'disponible\')) RETURNING *',
    [nombre, status]
  );
  res.status(201).json(rows[0]);
});

router.get('/mesas/status', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT status, COUNT(*)::int AS count FROM mesas GROUP BY status ORDER BY status'
  );
  res.json(rows);
});

router.post('/seed', async (_req, res) => {
  const seedMenu = require('../../seeds/seed-menu.pg');
  const result = await seedMenu();
  res.json(result);
});

module.exports = router;