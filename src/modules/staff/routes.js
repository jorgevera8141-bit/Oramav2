const express = require('express');
const pool = require('../../config/database');
const { verifyStaffPin } = require('../../shared/pin-auth');
const { validate } = require('../../middleware/validate');
const { clockPayloadSchema, timeClockEditSchema } = require('./schemas');
const staffService = require('./service');
const { startShift, endShift } = require('../marcacion/service');
const { localDateSql, TODAY_SQL, localDateString } = require('../../shared/timezone');

const router = express.Router();

// Admin/Middleware check
const verifyAdmin = async (req, res, next) => {
  const { nombre, pin } = req.body || {};
  try {
    const staffMember = await verifyStaffPin(nombre, pin, 'management');
    req.staffMember = staffMember;
    next();
  } catch (error) {
    res.status(error.statusCode || 401).json({ success: false, error: error.message });
  }
};

// GET all staff (for frontend staff management interfaces)
router.get('/staff', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, nombre, tipo, idioma, activo, hourly_rate, created_at FROM staff ORDER BY id ASC');
    const staff = rows.map((row) => ({ ...row, hourly_rate: parseFloat(row.hourly_rate) || 0 }));
    res.json({ success: true, staff });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Existing staff routes (unchanged)

router.get('/staff/active', async (_req, res) => {
  const { rows } = await pool.query('SELECT id, nombre, tipo, idioma, activo, created_at FROM staff WHERE activo = 1 ORDER BY id ASC');
  res.json({ success: true, staff: rows });
});

// PIN-based attendance (staff_sessions table, via the service layer)
router.post('/staff/clock-in', validate(clockPayloadSchema), async (req, res) => {
  const result = await staffService.clockIn(req.body);
  res.status(201).json({ success: true, staff: result.staff, session: result.session });
});

router.post('/staff/clock-out', validate(clockPayloadSchema), async (req, res) => {
  const result = await staffService.clockOut(req.body);
  res.json({ success: true, staff: result.staff, session: result.session });
});

router.get('/staff/clocked-in', async (_req, res) => {
  const staff = await staffService.listClockedInStaff();
  res.json({ success: true, staff });
});

router.get('/staff/hours-summary', async (req, res) => {
  const range = staffService.normalizeDateRange(req.query);
  const summary = await staffService.getHoursSummary(range);
  res.json({ success: true, summary });
});

router.post('/staff/time-clock/clock-in', verifyAdmin, async (req, res) => {
  const { staff_id } = req.body;
  if (!staff_id) {
    return res.status(400).json({ success: false, error: 'Staff ID is required' });
  }

  // Verify staff exists and is active
  const { rows: staffRows } = await pool.query(
    'SELECT id, nombre, activo FROM staff WHERE id = $1',
    [staff_id]
  );

  if (staffRows.length === 0) {
    return res.status(404).json({ success: false, error: 'Staff member not found' });
  }

  if (!staffRows[0].activo) {
    return res.status(400).json({ success: false, error: 'Staff member is not active' });
  }

  // Same shared function as the Marcar screen and the Staff page, so payroll and the live list agree.
  const shift = await startShift(staff_id, pool, new Date(), { screen: 'nomina' });
  if (shift.ya_estaba) {
    return res.status(400).json({
      success: false,
      error: 'Staff member is already clocked in. Please clock out first.'
    });
  }

  res.status(201).json({
    success: true,
    timeClock: shift.turno,
    message: 'Successfully clocked in'
  });
});

router.post('/staff/time-clock/clock-out', verifyAdmin, async (req, res) => {
  const { staff_id } = req.body;
  if (!staff_id) {
    return res.status(400).json({ success: false, error: 'Staff ID is required' });
  }

  const shift = await endShift(staff_id, pool);

  res.json({
    success: true,
    timeClock: shift.turno,
    message: 'Successfully clocked out'
  });
});

router.post('/staff/time-clock/break-start', verifyAdmin, async (req, res) => {
  const { staff_id } = req.body;
  if (!staff_id) {
    return res.status(400).json({ success: false, error: 'Staff ID is required' });
  }

  // Find the most recent clock-in without clock-out
  const { rows: clockInRows } = await pool.query(
    'SELECT id FROM time_clock WHERE staff_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1',
    [staff_id]
  );

  if (clockInRows.length === 0) {
    return res.status(400).json({ success: false, error: 'Staff member is not currently clocked in' });
  }

  // Check if break already started
  const { rows: breakCheck } = await pool.query(
    'SELECT id FROM time_clock WHERE staff_id = $1 AND clock_out IS NULL AND break_start IS NOT NULL AND break_end IS NULL',
    [staff_id]
  );

  if (breakCheck.length > 0) {
    return res.status(400).json({ success: false, error: 'Break is already started' });
  }

  // Start break
  const { rows } = await pool.query(
    'UPDATE time_clock SET break_start = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
    [clockInRows[0].id]
  );

  res.json({
    success: true,
    timeClock: rows[0],
    message: 'Break started'
  });
});

router.post('/staff/time-clock/break-end', verifyAdmin, async (req, res) => {
  const { staff_id } = req.body;
  if (!staff_id) {
    return res.status(400).json({ success: false, error: 'Staff ID is required' });
  }

  // Find the most recent clock-in without clock-out with break started
  const { rows: breakRows } = await pool.query(
    'SELECT id, break_start FROM time_clock WHERE staff_id = $1 AND clock_out IS NULL AND break_start IS NOT NULL AND break_end IS NULL ORDER BY break_start DESC LIMIT 1',
    [staff_id]
  );

  if (breakRows.length === 0) {
    return res.status(400).json({ success: false, error: 'No active break to end' });
  }

  // Calculate break duration
  const breakStart = new Date(breakRows[0].break_start);
  const breakEnd = new Date();
  const breakDurationMinutes = Math.floor((breakEnd - breakStart) / (1000 * 60));

  // End break and add to total break minutes
  const { rows } = await pool.query(
    'UPDATE time_clock SET break_end = CURRENT_TIMESTAMP, total_break_minutes = total_break_minutes + $1 WHERE id = $2 RETURNING *',
    [breakDurationMinutes, breakRows[0].id]
  );

  res.json({
    success: true,
    timeClock: rows[0],
    breakDurationMinutes,
    message: 'Break ended'
  });
});

// List recent time_clock entries across all staff, for manual correction
// (someone forgot to clock out, wrong time, double-clicked, etc.)
router.get('/staff/time-clock/recent', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT tc.id, tc.staff_id, s.nombre, tc.clock_in, tc.clock_out, tc.total_break_minutes
     FROM time_clock tc
     JOIN staff s ON s.id = tc.staff_id
     WHERE ${localDateSql('tc.clock_in')} BETWEEN ${TODAY_SQL} - 6 AND ${TODAY_SQL}
     ORDER BY tc.clock_in DESC`
  );
  res.json({ success: true, entries: rows });
});

// Correct a time_clock entry (admin-only)
router.put('/staff/time-clock/:id', verifyAdmin, validate(timeClockEditSchema), async (req, res) => {
  const { id } = req.params;
  const { clock_in, clock_out, total_break_minutes } = req.body;

  if (clock_out && new Date(clock_out) <= new Date(clock_in)) {
    return res.status(400).json({ success: false, error: 'La salida debe ser después de la entrada' });
  }

  const { rows } = await pool.query(
    `UPDATE time_clock
     SET clock_in = $1, clock_out = $2, total_break_minutes = $3
     WHERE id = $4
     RETURNING id, staff_id, clock_in, clock_out, total_break_minutes`,
    [clock_in, clock_out || null, total_break_minutes, id]
  );

  if (!rows[0]) {
    return res.status(404).json({ success: false, error: 'Registro no encontrado' });
  }
  res.json({ success: true, entry: rows[0] });
});

// Delete a mistaken time_clock entry, e.g. a double clock-in (admin-only)
router.delete('/staff/time-clock/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query('DELETE FROM time_clock WHERE id = $1 RETURNING id', [id]);
  if (!rows[0]) {
    return res.status(404).json({ success: false, error: 'Registro no encontrado' });
  }
  res.json({ success: true });
});

// Hourly rate endpoints
router.post('/staff/:staffId/hourly-rate', verifyAdmin, async (req, res) => {
  const { staffId } = req.params;
  const { hourly_rate } = req.body;

  if (staffId === undefined || staffId === null || staffId === '') {
    return res.status(400).json({ success: false, error: 'Staff ID is required' });
  }

  if (hourly_rate === undefined || hourly_rate === null || isNaN(parseFloat(hourly_rate))) {
    return res.status(400).json({ success: false, error: 'Valid hourly rate is required' });
  }

  const rate = parseFloat(hourly_rate);
  if (rate < 0) {
    return res.status(400).json({ success: false, error: 'Hourly rate cannot be negative' });
  }

  // Verify staff exists
  const { rows: staffRows } = await pool.query(
    'SELECT id, nombre FROM staff WHERE id = $1',
    [staffId]
  );

  if (staffRows.length === 0) {
    return res.status(404).json({ success: false, error: 'Staff member not found' });
  }

  // Update hourly rate
  const { rows } = await pool.query(
    'UPDATE staff SET hourly_rate = $1 WHERE id = $2 RETURNING id, nombre, hourly_rate',
    [rate, staffId]
  );

  res.json({
    success: true,
    staff: rows[0],
    message: 'Hourly rate updated successfully'
  });
});

router.get('/staff/:staffId/hourly-rate', verifyAdmin, async (req, res) => {
  const { staffId } = req.params;

  if (staffId === undefined || staffId === null || staffId === '') {
    return res.status(400).json({ success: false, error: 'Staff ID is required' });
  }

  // Verify staff exists and get hourly rate
  const { rows } = await pool.query(
    'SELECT id, nombre, hourly_rate FROM staff WHERE id = $1',
    [staffId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Staff member not found' });
  }

  res.json({
    success: true,
    staff: {
      id: rows[0].id,
      nombre: rows[0].nombre,
      hourly_rate: rows[0].hourly_rate || 0.00
    }
  });
});

// Weekly summary endpoints
router.get('/staff/time-clock/weekly-summary/:staffId', verifyAdmin, async (req, res) => {
  const { staffId } = req.params;

  if (staffId === undefined || staffId === null || staffId === '') {
    return res.status(400).json({ success: false, error: 'Staff ID is required' });
  }

  // Verify staff exists
  const { rows: staffRows } = await pool.query(
    'SELECT id, nombre, tipo, hourly_rate FROM staff WHERE id = $1',
    [staffId]
  );

  if (staffRows.length === 0) {
    return res.status(404).json({ success: false, error: 'Staff member not found' });
  }

  // Get weekly summary (last 7 days including today)
  const { rows: timeClockRows } = await pool.query(
    `SELECT
       id,
       clock_in,
       clock_out,
       break_start,
       break_end,
       total_break_minutes,
       EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600 as hours_worked_raw,
       ((EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600) - (total_break_minutes / 60.0))::float8 as hours_worked
     FROM time_clock
     WHERE staff_id = $1
       AND ${localDateSql('clock_in')} BETWEEN ${TODAY_SQL} - 6 AND ${TODAY_SQL}
       AND clock_out IS NOT NULL
     ORDER BY clock_in DESC`,
    [staffId]
  );

  // Calculate totals (hours_worked/hourly_rate come back from Postgres as
  // numeric strings, not JS numbers - coerce explicitly rather than relying
  // on the SQL cast alone)
  const staffHourlyRate = parseFloat(staffRows[0].hourly_rate) || 0;
  const totalHours = timeClockRows.reduce((sum, day) => sum + (Number(day.hours_worked) || 0), 0);
  const totalEarnings = totalHours * staffHourlyRate;
  const daysWorked = timeClockRows.filter(day => Number(day.hours_worked) > 0).length;

  res.json({
    success: true,
    staff: {
      id: staffRows[0].id,
      nombre: staffRows[0].nombre,
      tipo: staffRows[0].tipo,
      hourly_rate: staffHourlyRate
    },
    weekSummary: {
      totalHours: parseFloat(totalHours.toFixed(2)),
      totalEarnings: parseFloat(totalEarnings.toFixed(2)),
      daysWorked,
      dailyDetails: timeClockRows.map(day => ({
        date: localDateString(day.clock_in),
        hoursWorked: parseFloat((Number(day.hours_worked) || 0).toFixed(2)),
        clockIn: day.clock_in.toISOString(),
        clockOut: day.clock_out ? day.clock_out.toISOString() : null,
        breakMinutes: day.total_break_minutes || 0
      }))
    }
  });
});

// Payroll endpoints
router.get('/staff/payroll/weekly', async (req, res) => {
  // Get all staff with their weekly summaries
  const { rows: staffRows } = await pool.query(
    'SELECT id, nombre, tipo, hourly_rate FROM staff WHERE activo = 1 ORDER BY nombre'
  );

  const staffPayroll = [];
  let totalPayroll = 0;

  for (const staff of staffRows) {
    // Get weekly summary for this staff member
    const { rows: timeClockRows } = await pool.query(
      `SELECT
         EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600 as hours_worked_raw,
         ((EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600) - (total_break_minutes / 60.0))::float8 as hours_worked
       FROM time_clock
       WHERE staff_id = $1
         AND ${localDateSql('clock_in')} BETWEEN ${TODAY_SQL} - 6 AND ${TODAY_SQL}
         AND clock_out IS NOT NULL`,
      [staff.id]
    );

    const hourlyRate = parseFloat(staff.hourly_rate) || 0;
    const totalHours = timeClockRows.reduce((sum, day) => sum + (Number(day.hours_worked) || 0), 0);
    const totalEarnings = totalHours * hourlyRate;
    totalPayroll += totalEarnings;

    staffPayroll.push({
      id: staff.id,
      nombre: staff.nombre,
      tipo: staff.tipo,
      hourly_rate: hourlyRate,
      weeklyHours: parseFloat(totalHours.toFixed(2)),
      weeklyEarnings: parseFloat(totalEarnings.toFixed(2))
    });
  }

  res.json({
    success: true,
    payroll: staffPayroll,
    summary: {
      totalStaff: staffPayroll.length,
      totalPayroll: parseFloat(totalPayroll.toFixed(2)),
      averageWeeklyEarnings: staffPayroll.length > 0 ?
        parseFloat((totalPayroll / staffPayroll.length).toFixed(2)) : 0
    }
  });
});

// Tips distribution (propina) calculator
router.post('/staff/payroll/tips-distribution', verifyAdmin, async (req, res) => {
  const { tips_amount, distribution_type } = req.body;

  if (tips_amount === undefined || tips_amount === null || isNaN(parseFloat(tips_amount))) {
    return res.status(400).json({ success: false, error: 'Valid tips amount is required' });
  }

  const tips = parseFloat(tips_amount);
  if (tips < 0) {
    return res.status(400).json({ success: false, error: 'Tips amount cannot be negative' });
  }

  const validDistributionTypes = ['hours_worked', 'equal', 'percentage'];
  if (!distribution_type || !validDistributionTypes.includes(distribution_type)) {
    return res.status(400).json({
      success: false,
      error: `Invalid distribution type. Must be one of: ${validDistributionTypes.join(', ')}`
    });
  }

  // Active staff who clocked out during the last 7 local days, with the hours they worked
  // (net of breaks), in one query.
  const { rows: staffRows } = await pool.query(
    `SELECT s.id, s.nombre, s.tipo,
            COALESCE(SUM(EXTRACT(EPOCH FROM (tc.clock_out - tc.clock_in)) / 3600 - tc.total_break_minutes / 60.0), 0)::float8 AS hours
     FROM staff s
     JOIN time_clock tc ON tc.staff_id = s.id
     WHERE s.activo = 1
       AND ${localDateSql('tc.clock_in')} BETWEEN ${TODAY_SQL} - 6 AND ${TODAY_SQL}
       AND tc.clock_out IS NOT NULL
     GROUP BY s.id, s.nombre, s.tipo
     ORDER BY s.nombre`
  );

  if (staffRows.length === 0) {
    return res.status(400).json({ success: false, error: 'No staff members worked in the last week' });
  }

  const distribution = staffService.distributeTips({
    tips, distributionType: distribution_type, staffRows, percentages: req.body.percentages
  });

  const totalDistributed = distribution.reduce((sum, item) => sum + item.amount, 0);

  res.json({
    success: true,
    tipsAmount: tips,
    distributionType: distribution_type,
    distribution: distribution,
    summary: {
      totalStaff: staffRows.length,
      totalDistributed: parseFloat(totalDistributed.toFixed(2)),
      remainingTips: parseFloat((tips - totalDistributed).toFixed(2))
    }
  });
});

module.exports = router;