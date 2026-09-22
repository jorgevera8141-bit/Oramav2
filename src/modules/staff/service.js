const pool = require('../../config/database');
const { verifyStaffPin } = require('../../shared/pin-auth');

function staffError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function currentDateString(now = new Date()) {
  return now.toISOString().slice(0, 10);
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
  const rangeStart = new Date(`${range.from}T00:00:00`);
  const rangeEnd = new Date(`${range.to}T23:59:59.999`);
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

async function clockIn(data, db = pool, now = new Date()) {
  const staff = await verifyStaffPin(data.nombre, data.pin, null, db);
  const { rows: activeRows } = await db.query(
    `SELECT id, staff_id, screen, login_time, logout_time
     FROM staff_sessions
     WHERE staff_id = $1 AND logout_time IS NULL
     ORDER BY login_time DESC
     LIMIT 1`,
    [staff.id]
  );
  if (activeRows[0]) {
    throw staffError('Este miembro del staff ya tiene una sesión activa.', 409);
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO staff_sessions (staff_id, screen)
       VALUES ($1, COALESCE($2, 'pos'))
       RETURNING id, staff_id, screen, login_time, logout_time`,
      [staff.id, data.screen || null]
    );
    return { staff, session: serializeSession(rows[0], now) };
  } catch (error) {
    if (error?.code === '23505') {
      throw staffError('Este miembro del staff ya tiene una sesión activa.', 409);
    }
    throw error;
  }
}

async function clockOut(data, db = pool, now = new Date()) {
  const staff = await verifyStaffPin(data.nombre, data.pin, null, db);
  const { rows } = await db.query(
    `UPDATE staff_sessions
     SET logout_time = CURRENT_TIMESTAMP
     WHERE id = (
       SELECT id
       FROM staff_sessions
       WHERE staff_id = $1 AND logout_time IS NULL
       ORDER BY login_time DESC
       LIMIT 1
     )
       AND logout_time IS NULL
     RETURNING id, staff_id, screen, login_time, logout_time`,
    [staff.id]
  );
  if (!rows[0]) {
    throw staffError('No hay una sesión activa para cerrar.', 409);
  }
  return { staff, session: serializeSession(rows[0], now) };
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
       AND login_time < ($3::date + INTERVAL '1 day')
       AND COALESCE(logout_time, CURRENT_TIMESTAMP) >= $2::date
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
      AND ss.login_time < ($2::date + INTERVAL '1 day')
      AND COALESCE(ss.logout_time, CURRENT_TIMESTAMP) >= $1::date
     ORDER BY s.nombre ASC, ss.login_time ASC`,
    [range.from, range.to]
  );
  return summarizeSessionRows(rows, range, now);
}

module.exports = {
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
