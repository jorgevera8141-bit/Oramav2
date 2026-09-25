const express = require('express');
const pool = require('../../config/database');
const { verifyStaffPin } = require('../../shared/pin-auth');
const { validate } = require('../../middleware/validate');
const { clockPayloadSchema } = require('./schemas');
const staffService = require('./service');

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

// Existing staff routes (unchanged)
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

  // Check if already clocked in (without clock out)
  const { rows: existingClockIn } = await pool.query(
    'SELECT id FROM time_clock WHERE staff_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1',
    [staff_id]
  );

  if (existingClockIn.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Staff member is already clocked in. Please clock out first.'
    });
  }

  // Clock in
  const { rows } = await pool.query(
    'INSERT INTO time_clock (staff_id, clock_in) VALUES ($1, CURRENT_TIMESTAMP) RETURNING *',
    [staff_id]
  );

  res.status(201).json({
    success: true,
    timeClock: rows[0],
    message: 'Successfully clocked in'
  });
});

router.post('/staff/time-clock/clock-out', verifyAdmin, async (req, res) => {
  const { staff_id } = req.body;
  if (!staff_id) {
    return res.status(400).json({ success: false, error: 'Staff ID is required' });
  }

  // Find the most recent clock-in without clock-out
  const { rows: clockInRows } = await pool.query(
    'SELECT id, clock_in FROM time_clock WHERE staff_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1',
    [staff_id]
  );

  if (clockInRows.length === 0) {
    return res.status(400).json({ success: false, error: 'Staff member is not currently clocked in' });
  }

  // Clock out
  const { rows } = await pool.query(
    'UPDATE time_clock SET clock_out = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
    [clockInRows[0].id]
  );

  res.json({
    success: true,
    timeClock: rows[0],
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
       (EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600) - (total_break_minutes / 60.0) as hours_worked
     FROM time_clock
     WHERE staff_id = $1
       AND clock_in >= CURRENT_DATE - INTERVAL '6 days'
       AND clock_in < CURRENT_DATE + INTERVAL '1 day'
       AND clock_out IS NOT NULL
     ORDER BY clock_in DESC`,
    [staffId]
  );

  // Calculate totals
  const totalHours = timeClockRows.reduce((sum, day) => sum + (day.hours_worked || 0), 0);
  const totalEarnings = totalHours * (staffRows[0].hourly_rate || 0);
  const daysWorked = timeClockRows.filter(day => day.hours_worked > 0).length;

  res.json({
    success: true,
    staff: {
      id: staffRows[0].id,
      nombre: staffRows[0].nombre,
      tipo: staffRows[0].tipo,
      hourly_rate: staffRows[0].hourly_rate || 0.00
    },
    weekSummary: {
      totalHours: parseFloat(totalHours.toFixed(2)),
      totalEarnings: parseFloat(totalEarnings.toFixed(2)),
      daysWorked,
      dailyDetails: timeClockRows.map(day => ({
        date: day.clock_in.toISOString().split('T')[0],
        hoursWorked: parseFloat((day.hours_worked || 0).toFixed(2)),
        clockIn: day.clock_in.toISOString(),
        clockOut: day.clock_out ? day.clock_out.toISOString() : null,
        breakMinutes: day.total_break_minutes || 0
      }))
    }
  });
});

// Payroll endpoints
router.get('/staff/payroll/weekly', verifyAdmin, async (req, res) => {
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
         (EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600) - (total_break_minutes / 60.0) as hours_worked
       FROM time_clock
       WHERE staff_id = $1
         AND clock_in >= CURRENT_DATE - INTERVAL '6 days'
         AND clock_in < CURRENT_DATE + INTERVAL '1 day'
         AND clock_out IS NOT NULL`,
      [staff.id]
    );

    const totalHours = timeClockRows.reduce((sum, day) => sum + (day.hours_worked || 0), 0);
    const totalEarnings = totalHours * (staff.hourly_rate || 0);
    totalPayroll += totalEarnings;

    staffPayroll.push({
      id: staff.id,
      nombre: staff.nombre,
      tipo: staff.tipo,
      hourly_rate: staff.hourly_rate || 0.00,
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

  // Get active staff from last week (those who worked)
  const { rows: staffRows } = await pool.query(
    `SELECT DISTINCT s.id, s.nombre, s.tipo, s.hourly_rate
     FROM staff s
     INNER JOIN time_clock tc ON s.id = tc.staff_id
     WHERE s.activo = 1
       AND tc.clock_in >= CURRENT_DATE - INTERVAL '6 days'
       AND tc.clock_in < CURRENT_DATE + INTERVAL '1 day'
       AND tc.clock_out IS NOT NULL
     ORDER BY s.nombre`
  );

  if (staffRows.length === 0) {
    return res.status(400).json({ success: false, error: 'No staff members worked in the last week' });
  }

  let distribution = [];

  if (distribution_type === 'equal') {
    // Equal distribution
    const perPerson = tips / staffRows.length;
    distribution = staffRows.map(staff => ({
      staffId: staff.id,
      nombre: staff.nombre,
      tipo: staff.tipo,
      amount: parseFloat(perPerson.toFixed(2))
    }));
  }
  else if (distribution_type === 'hours_worked') {
    // Distribution by hours worked
    const staffHoursPromises = staffRows.map(async (staff) => {
      const { rows: timeClockRows } = await pool.query(
        `SELECT
             COALESCE(SUM(EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600 - (total_break_minutes / 60.0)), 0) as total_hours
         FROM time_clock
         WHERE staff_id = $1
           AND clock_in >= CURRENT_DATE - INTERVAL '6 days'
           AND clock_in < CURRENT_DATE + INTERVAL '1 day'
           AND clock_out IS NOT NULL`,
        [staff.id]
      );

      return {
        staff: staff,
        hours: parseFloat(timeClockRows[0].total_hours || 0)
      };
    });

    const staffHoursData = await Promise.all(staffHoursPromises);

    const totalHours = staffHoursData.reduce((sum, item) => sum + item.hours, 0);

    if (totalHours > 0) {
      distribution = staffHoursData.map(item => ({
        staffId: item.staff.id,
        nombre: item.staff.nombre,
        tipo: item.tipo,
        hoursWorked: parseFloat(item.hours.toFixed(2)),
        amount: parseFloat((tips * (item.hours / totalHours)).toFixed(2))
      }));
    } else {
      // Fallback to equal if no hours worked
      const perPerson = tips / staffRows.length;
      distribution = staffRows.map(staff => ({
        staffId: staff.id,
        nombre: staff.nombre,
        tipo: staff.tipo,
        amount: parseFloat(perPerson.toFixed(2))
      }));
    }
  }
  else if (distribution_type === 'percentage') {
    // For percentage based, we'd need additional percentages per staff
    // For now, default to equal distribution as placeholder
    const perPerson = tips / staffRows.length;
    distribution = staffRows.map(staff => ({
      staffId: staff.id,
      nombre: staff.nombre,
      tipo: staff.tipo,
      amount: parseFloat(perPerson.toFixed(2))
    }));
  }

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