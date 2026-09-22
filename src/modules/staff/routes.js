const express = require('express');
const pool = require('../../config/database');
const { validate } = require('../../middleware/validate');
const { clockPayloadSchema } = require('./schemas');
const {
  normalizeDateRange,
  clockIn,
  clockOut,
  listClockedInStaff,
  getStaffSessions,
  getHoursSummary
} = require('./service');

const router = express.Router();

router.get('/staff', async (_req, res) => {
  const { rows } = await pool.query('SELECT id, nombre, tipo, idioma, activo, created_at FROM staff ORDER BY id ASC');
  res.json({ success: true, staff: rows });
});

router.post('/staff', async (req, res) => {
  const b = req.body || {};
  const { rows } = await pool.query(
    'INSERT INTO staff (nombre, pin, tipo, idioma, activo) VALUES ($1, $2, $3, COALESCE($4, \'es\'), COALESCE($5, 1)) RETURNING *',
    [b.nombre, b.pin, b.tipo, b.idioma, b.activo]
  );
  res.status(201).json({ success: true, member: rows[0] });
});

router.put('/staff/:id', async (req, res) => {
  const b = req.body || {};
  const { rows } = await pool.query(
    `UPDATE staff
     SET nombre = COALESCE($1, nombre),
         pin = COALESCE($2, pin),
         tipo = COALESCE($3, tipo),
         idioma = COALESCE($4, idioma),
         activo = COALESCE($5, activo)
     WHERE id = $6 RETURNING *`,
    [b.nombre, b.pin, b.tipo, b.idioma, b.activo, Number(req.params.id)]
  );
  res.json({ success: true, member: rows[0] || null });
});

router.post('/staff/login', async (_req, res) => {
  res.json({ success: true });
});

router.put('/staff/session', async (_req, res) => {
  res.json({ success: true });
});

router.post('/staff/clock-in', validate(clockPayloadSchema), async (req, res) => {
  const result = await clockIn(req.body);
  res.status(201).json({ success: true, staff: result.staff, session: result.session });
});

router.post('/staff/clock-out', validate(clockPayloadSchema), async (req, res) => {
  const result = await clockOut(req.body);
  res.json({ success: true, staff: result.staff, session: result.session });
});

router.get('/staff/clocked-in', async (_req, res) => {
  const staff = await listClockedInStaff();
  res.json({ success: true, staff });
});

router.get('/staff/hours-summary', async (req, res) => {
  const range = normalizeDateRange(req.query);
  const summary = await getHoursSummary(range);
  res.json({ success: true, range, summary });
});

router.get('/staff/active', async (_req, res) => {
  const { rows } = await pool.query('SELECT id, nombre, tipo, idioma, activo, created_at FROM staff WHERE activo = 1 ORDER BY id ASC');
  res.json({ success: true, staff: rows });
});

router.get('/staff/:id/sessions', async (req, res) => {
  const staffId = Number(req.params.id);
  if (!Number.isInteger(staffId) || staffId <= 0) {
    throw Object.assign(new Error('Staff inválido.'), { statusCode: 400 });
  }
  const range = normalizeDateRange(req.query);
  const result = await getStaffSessions(staffId, range);
  res.json({ success: true, staff: result.staff, range, sessions: result.sessions });
});

module.exports = router;