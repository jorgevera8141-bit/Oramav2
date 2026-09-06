const express = require('express');
const pool = require('../../config/database');
const { validate } = require('../../middleware/validate');
const { updateSettingSchema } = require('./schemas');

const router = express.Router();

// Whitelisted so PUT /settings/:key can never write an arbitrary key.
const ALLOWED_KEYS = ['margin_threshold_pct'];

router.get('/settings', async (_req, res) => {
  const { rows } = await pool.query('SELECT key, value FROM orama_settings');
  res.json({ success: true, settings: Object.fromEntries(rows.map((row) => [row.key, row.value])) });
});

router.put('/settings/:key', validate(updateSettingSchema), async (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.includes(key)) throw Object.assign(new Error('Configuración no permitida'), { statusCode: 400 });
  await pool.query(
    'INSERT INTO orama_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
    [key, String(req.body.value)]
  );
  res.json({ success: true });
});

module.exports = router;
