// Clocking in and out. One pair of functions (startShift / endShift) serves every entry point (the
// Marcar screen, the Staff page and the manager's buttons in Nómina), so payroll's time_clock and
// the live "en turno" list (staff_sessions) cannot drift apart. Identifying yourself never clocks you
// in: a person who is already on shift is recognised, not rejected and not clocked in a second time.
const pool = require('../../config/database');
const { BUSINESS_TZ, localDateSql, TODAY_SQL } = require('../../shared/timezone');

const STALE_SHIFT_HOURS = 18;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function conflict(message) {
  return Object.assign(new Error(message), { statusCode: 409 });
}

function describeShift(row, now) {
  if (!row) return { estado: 'fuera', desde: null, en_descanso: false };
  const hours = (now - new Date(row.clock_in)) / HOUR_MS;
  if (hours > STALE_SHIFT_HOURS) return { estado: 'olvido_salida', desde: row.clock_in, en_descanso: false };
  return { estado: 'en_turno', desde: row.clock_in, en_descanso: Boolean(row.break_start) && !row.break_end };
}

// A shift left open this long was almost certainly never closed. It is not auto-closed (that would
// invent a clock-out time that payroll pays on): a manager fixes it in Nómina > Corregir marcaciones.
function forgottenShiftError(desde) {
  const when = new Date(desde).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: BUSINESS_TZ });
  return conflict(`Tu turno anterior sigue abierto (desde ${when}). Pídele a un gerente que lo cierre en Nómina > Corregir marcaciones.`);
}

async function findOpenShift(staffId, db) {
  const { rows } = await db.query(
    'SELECT id, clock_in, break_start, break_end FROM time_clock WHERE staff_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1',
    [staffId]
  );
  return rows[0] || null;
}

async function getShiftState(staffId, db = pool, now = new Date()) {
  return describeShift(await findOpenShift(staffId, db), now);
}

// The live "en turno" list reads staff_sessions; a shift opened before the two were linked may lack one.
function ensureLiveSession(staffId, screen, db) {
  return db.query(
    `INSERT INTO staff_sessions (staff_id, screen)
     SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM staff_sessions WHERE staff_id = $1 AND logout_time IS NULL)`,
    [staffId, screen]
  );
}

async function startShift(staffId, db = pool, now = new Date(), { screen = 'marcar' } = {}) {
  const open = await findOpenShift(staffId, db);
  const state = describeShift(open, now);
  if (state.estado === 'olvido_salida') throw forgottenShiftError(state.desde);
  if (state.estado === 'en_turno') {
    await ensureLiveSession(staffId, screen, db);
    return { ...state, ya_estaba: true };
  }
  const { rows } = await db.query(
    'INSERT INTO time_clock (staff_id, clock_in) VALUES ($1, CURRENT_TIMESTAMP) RETURNING id, staff_id, clock_in, clock_out',
    [staffId]
  );
  await ensureLiveSession(staffId, screen, db);
  return { estado: 'en_turno', desde: rows[0].clock_in, en_descanso: false, ya_estaba: false, turno: rows[0] };
}

async function endShift(staffId, db = pool, now = new Date()) {
  const open = await findOpenShift(staffId, db);
  const state = describeShift(open, now);
  if (state.estado === 'fuera') throw conflict('No tienes un turno abierto.');
  if (state.estado === 'olvido_salida') throw forgottenShiftError(state.desde);
  if (open.break_start && !open.break_end) {
    const breakMinutes = Math.floor((now - new Date(open.break_start)) / MINUTE_MS);
    await db.query('UPDATE time_clock SET break_end = CURRENT_TIMESTAMP, total_break_minutes = COALESCE(total_break_minutes, 0) + $1 WHERE id = $2', [breakMinutes, open.id]);
  }
  const { rows } = await db.query(
    'UPDATE time_clock SET clock_out = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, staff_id, clock_in, clock_out',
    [open.id]
  );
  const { rows: sessions } = await db.query(
    'UPDATE staff_sessions SET logout_time = CURRENT_TIMESTAMP WHERE staff_id = $1 AND logout_time IS NULL RETURNING id, staff_id, screen, login_time, logout_time',
    [staffId]
  );
  return { estado: 'fuera', desde: null, en_descanso: false, entrada: rows[0].clock_in, salida: rows[0].clock_out, turno: rows[0], sesion: sessions[0] || null };
}

// The name tiles for the Marcar screen. People on shift come first, then a forgotten clock-out (needs
// attention), then anyone who worked yesterday and has not clocked in today, then everyone else.
async function getTiles(db = pool, now = new Date()) {
  const { rows: staff } = await db.query('SELECT id, nombre, tipo FROM staff WHERE activo = 1 ORDER BY nombre');
  const { rows: openRows } = await db.query('SELECT staff_id, clock_in, break_start, break_end FROM time_clock WHERE clock_out IS NULL ORDER BY clock_in DESC');
  const { rows: workedYesterday } = await db.query(`SELECT DISTINCT staff_id FROM time_clock WHERE ${localDateSql('clock_in')} = ${TODAY_SQL} - 1`);
  const { rows: workedToday } = await db.query(`SELECT DISTINCT staff_id FROM time_clock WHERE ${localDateSql('clock_in')} = ${TODAY_SQL}`);
  const yesterday = new Set(workedYesterday.map((r) => r.staff_id));
  const today = new Set(workedToday.map((r) => r.staff_id));
  const openBy = new Map();
  for (const row of openRows) if (!openBy.has(row.staff_id)) openBy.set(row.staff_id, row);

  const rank = (tile) => (tile.estado === 'en_turno' ? 0 : tile.estado === 'olvido_salida' ? 1 : tile.sin_entrada_hoy ? 2 : 3);
  return staff
    .map((person) => {
      const state = describeShift(openBy.get(person.id), now);
      return {
        id: person.id, nombre: person.nombre, tipo: person.tipo, ...state,
        sin_entrada_hoy: state.estado === 'fuera' && yesterday.has(person.id) && !today.has(person.id)
      };
    })
    .sort((a, b) => rank(a) - rank(b) || a.nombre.localeCompare(b.nombre, 'es'));
}

module.exports = { getShiftState, startShift, endShift, getTiles, STALE_SHIFT_HOURS };
