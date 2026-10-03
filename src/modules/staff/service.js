const pool = require('../../config/database');
const { verifyStaffPin } = require('../../shared/pin-auth');
const { startShift, endShift } = require('../marcacion/service');
const { localTimestampSql, localDateString, zonedDateTimeToUtc } = require('../../shared/timezone');

function staffError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function currentDateString(now = new Date()) {
  return localDateString(now);
}

function normalizeDateRange(query = {}, now = new Date()) {
  const fallback = currentDateString(now);
  const from = query.from || fallback;
  const to = query.to || fallback;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(from) || !datePattern.test(to)) {
    throw staffError('from y to deben usar el formato YYYY-MM-DD.', 400);
  }
  if (from > to) {
    throw staffError('from no puede ser mayor que to.', 400);
  }
  return { from, to };
}

function parseTimestamp(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function roundMinutes(ms) {
  return Math.max(0, Math.round(ms / 60000));
}

function sessionDurationMinutes(session, now = new Date()) {
  const loginTime = parseTimestamp(session.login_time);
  const logoutTime = parseTimestamp(session.logout_time) || now;
  if (!loginTime || logoutTime <= loginTime) return 0;
  return roundMinutes(logoutTime - loginTime);
}

function sessionRangeMinutes(session, range, now = new Date()) {
  const loginTime = parseTimestamp(session.login_time);
  const logoutTime = parseTimestamp(session.logout_time) || now;
  if (!loginTime || logoutTime <= loginTime) return 0;
  const rangeStart = zonedDateTimeToUtc(range.from, '00:00:00');
  const rangeEnd = zonedDateTimeToUtc(range.to, '23:59:59.999');
  const effectiveStart = loginTime > rangeStart ? loginTime : rangeStart;
  const effectiveEnd = logoutTime < rangeEnd ? logoutTime : rangeEnd;
  if (effectiveEnd <= effectiveStart) return 0;
  return roundMinutes(effectiveEnd - effectiveStart);
}

function formatHours(minutes) {
  return Number((minutes / 60).toFixed(2));
}

function serializeSession(session, now = new Date()) {
  const workedMinutes = sessionDurationMinutes(session, now);
  return {
    id: Number(session.id),
    staff_id: Number(session.staff_id),
    screen: session.screen || null,
    login_time: session.login_time,
    logout_time: session.logout_time || null,
    worked_minutes: workedMinutes,
    worked_hours: formatHours(workedMinutes)
  };
}

function summarizeSessionRows(rows, range, now = new Date()) {
  const summaryByStaff = new Map();
  for (const row of rows) {
    const key = Number(row.staff_id);
    const workedMinutes = sessionRangeMinutes(row, range, now);
    if (!summaryByStaff.has(key)) {
      summaryByStaff.set(key, {
        staff_id: key,
        nombre: row.nombre,
        tipo: row.tipo,
        idioma: row.idioma || 'es',
        activo: row.activo,
        sessions_count: 0,
        total_minutes: 0
      });
    }
    const item = summaryByStaff.get(key);
    if (row.id && row.login_time && workedMinutes > 0) {
      item.sessions_count += 1;
      item.total_minutes += workedMinutes;
    }
  }
  return [...summaryByStaff.values()]
    .map((item) => ({ ...item, total_hours: formatHours(item.total_minutes) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// Clocking is shared with the Marcar screen and Nómina (see marcacion/service.js) so payroll's
// time_clock and this live session list stay in step. Someone already on shift is recognised.
async function clockIn(data, db = pool, now = new Date()) {
  const staff = await verifyStaffPin(data.nombre, data.pin, null, db);
  const shift = await startShift(staff.id, db, now, { screen: data.screen || 'pos' });
  const { rows } = await db.query(
    `SELECT id, staff_id, screen, login_time, logout_time
     FROM staff_sessions
     WHERE staff_id = $1 AND logout_time IS NULL
     ORDER BY login_time DESC
     LIMIT 1`,
    [staff.id]
  );
  return { staff, session: serializeSession(rows[0], now), ya_estaba: shift.ya_estaba };
}

async function clockOut(data, db = pool, now = new Date()) {
  const staff = await verifyStaffPin(data.nombre, data.pin, null, db);
  const result = await endShift(staff.id, db, now);
  return { staff, session: result.sesion ? serializeSession(result.sesion, now) : null };
}

async function listClockedInStaff(db = pool, now = new Date()) {
  const { rows } = await db.query(
    `SELECT s.id AS staff_id, s.nombre, s.tipo, s.idioma, s.activo,
            ss.id, ss.screen, ss.login_time, ss.logout_time
     FROM staff_sessions ss
     JOIN staff s ON s.id = ss.staff_id
     WHERE ss.logout_time IS NULL
     ORDER BY ss.login_time ASC`
  );
  return rows.map((row) => ({
    id: Number(row.staff_id),
    nombre: row.nombre,
    tipo: row.tipo,
    idioma: row.idioma || 'es',
    activo: row.activo,
    session: serializeSession(row, now)
  }));
}

async function getStaffById(staffId, db = pool) {
  const { rows } = await db.query(
    'SELECT id, nombre, tipo, idioma, activo, created_at FROM staff WHERE id = $1',
    [staffId]
  );
  return rows[0] || null;
}

async function getStaffSessions(staffId, range, db = pool, now = new Date()) {
  const staff = await getStaffById(staffId, db);
  if (!staff) throw staffError('Staff no encontrado.', 404);
  const { rows } = await db.query(
    `SELECT id, staff_id, screen, login_time, logout_time
     FROM staff_sessions
     WHERE staff_id = $1
       AND ${localTimestampSql('login_time')} < ($3::date + INTERVAL '1 day')
       AND ${localTimestampSql('COALESCE(logout_time, CURRENT_TIMESTAMP)')} >= $2::date
     ORDER BY login_time DESC`,
    [staffId, range.from, range.to]
  );
  return { staff, sessions: rows.map((row) => serializeSession(row, now)) };
}

async function getHoursSummary(range, db = pool, now = new Date()) {
  const { rows } = await db.query(
    `SELECT s.id AS staff_id, s.nombre, s.tipo, s.idioma, s.activo,
            ss.id, ss.login_time, ss.logout_time
     FROM staff s
     LEFT JOIN staff_sessions ss
       ON s.id = ss.staff_id
      AND ${localTimestampSql('ss.login_time')} < ($2::date + INTERVAL '1 day')
      AND ${localTimestampSql('COALESCE(ss.logout_time, CURRENT_TIMESTAMP)')} >= $1::date
     ORDER BY s.nombre ASC, ss.login_time ASC`,
    [range.from, range.to]
  );
  return summarizeSessionRows(rows, range, now);
}

function tipsError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

// Splits `totalCents` across `weights` so the parts are whole cents that add up to the
// total exactly (largest-remainder), instead of rounding each share and losing or
// inventing a few cents.
function allocateCents(totalCents, weights) {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const raw = weights.map((weight) => (totalCents * weight) / weightSum);
  const parts = raw.map(Math.floor);
  let leftover = totalCents - parts.reduce((sum, part) => sum + part, 0);
  const byLargestFraction = raw.map((value, index) => ({ index, fraction: value - parts[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; leftover > 0; i += 1, leftover -= 1) parts[byLargestFraction[i % byLargestFraction.length].index] += 1;
  return parts;
}

function resolvePercentageWeights(staffRows, percentages) {
  if (!percentages || typeof percentages !== 'object') throw tipsError('Se requieren los porcentajes por empleado.');
  const byId = new Map();
  for (const [id, raw] of Object.entries(percentages)) {
    const value = raw === '' || raw == null ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) throw tipsError('Los porcentajes deben ser números de 0 o más.');
    byId.set(String(id), value);
  }
  const workedIds = new Set(staffRows.map((row) => String(row.id)));
  for (const [id, value] of byId) {
    if (value > 0 && !workedIds.has(id)) throw tipsError('Se asignó un porcentaje a alguien que no trabajó esta semana.');
  }
  const weights = staffRows.map((row) => byId.get(String(row.id)) || 0);
  if (Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 100) > 0.01) {
    throw tipsError('Los porcentajes deben sumar 100%.');
  }
  return weights;
}

// staffRows: [{ id, nombre, tipo, hours }] for staff who clocked out during the week.
function distributeTips({ tips, distributionType, staffRows, percentages }) {
  const hours = staffRows.map((row) => Number(row.hours) || 0);
  let weights;
  if (distributionType === 'equal') {
    weights = staffRows.map(() => 1);
  } else if (distributionType === 'hours_worked') {
    weights = hours.some((value) => value > 0) ? hours : staffRows.map(() => 1);
  } else if (distributionType === 'percentage') {
    weights = resolvePercentageWeights(staffRows, percentages);
  } else {
    throw tipsError('Tipo de distribución inválido.');
  }
  const cents = allocateCents(Math.round(tips * 100), weights);
  return staffRows.map((row, index) => ({
    staffId: row.id,
    nombre: row.nombre,
    tipo: row.tipo,
    amount: cents[index] / 100,
    ...(distributionType === 'hours_worked' ? { hoursWorked: Number(hours[index].toFixed(2)) } : {}),
    ...(distributionType === 'percentage' ? { percentage: weights[index] } : {})
  }));
}

module.exports = {
  distributeTips,
  normalizeDateRange,
  sessionDurationMinutes,
  sessionRangeMinutes,
  serializeSession,
  summarizeSessionRows,
  clockIn,
  clockOut,
  listClockedInStaff,
  getStaffById,
  getStaffSessions,
  getHoursSummary
};
