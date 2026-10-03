const test = require('node:test');
const assert = require('node:assert/strict');
const marcacion = require('../src/modules/marcacion/service');

const HOUR = 3600 * 1000;
const rejectsWith = (promise, statusCode) => assert.rejects(promise, (error) => error.statusCode === statusCode);

// In-memory stand-in for time_clock, staff_sessions and staff, matched on the SQL each function runs.
function fakeDb({ staff = [], shifts = [] } = {}) {
  const db = { now: new Date('2026-10-03T14:00:00Z'), staff, shifts: shifts.map((s, i) => ({ id: i + 1, break_start: null, break_end: null, total_break_minutes: 0, clock_out: null, ...s })), sessions: [], nextId: 100, yesterday: new Set(), today: new Set() };
  db.query = async (sql, params = []) => {
    if (/FROM time_clock WHERE staff_id = \$1 AND clock_out IS NULL/.test(sql)) {
      const open = db.shifts.filter((s) => s.staff_id === params[0] && !s.clock_out).sort((a, b) => b.clock_in - a.clock_in)[0];
      return { rows: open ? [{ ...open }] : [] };
    }
    if (/INSERT INTO time_clock/.test(sql)) {
      const row = { id: db.nextId++, staff_id: params[0], clock_in: db.now, clock_out: null, break_start: null, break_end: null, total_break_minutes: 0 };
      db.shifts.push(row);
      return { rows: [{ ...row }] };
    }
    if (/INSERT INTO staff_sessions/.test(sql)) {
      if (!db.sessions.some((s) => s.staff_id === params[0] && !s.logout_time)) db.sessions.push({ id: db.nextId++, staff_id: params[0], screen: params[1], login_time: db.now, logout_time: null });
      return { rows: [] };
    }
    if (/UPDATE time_clock SET break_end/.test(sql)) {
      const row = db.shifts.find((s) => s.id === params[1]);
      row.break_end = db.now; row.total_break_minutes += params[0];
      return { rows: [] };
    }
    if (/UPDATE time_clock SET clock_out/.test(sql)) {
      const row = db.shifts.find((s) => s.id === params[0]);
      row.clock_out = db.now;
      return { rows: [{ ...row }] };
    }
    if (/UPDATE staff_sessions SET logout_time/.test(sql)) {
      const closed = db.sessions.filter((s) => s.staff_id === params[0] && !s.logout_time);
      closed.forEach((s) => { s.logout_time = db.now; });
      return { rows: closed.map((s) => ({ ...s })) };
    }
    if (/FROM staff WHERE activo = 1/.test(sql)) return { rows: db.staff.filter((p) => p.activo).map(({ id, nombre, tipo }) => ({ id, nombre, tipo })) };
    if (/FROM time_clock WHERE clock_out IS NULL ORDER BY/.test(sql)) return { rows: db.shifts.filter((s) => !s.clock_out).map((s) => ({ ...s })) };
    if (/SELECT DISTINCT staff_id FROM time_clock WHERE .*- 1/.test(sql)) return { rows: [...db.yesterday].map((staff_id) => ({ staff_id })) };
    if (/SELECT DISTINCT staff_id FROM time_clock WHERE/.test(sql)) return { rows: [...db.today].map((staff_id) => ({ staff_id })) };
    throw new Error(`fake db does not know: ${sql}`);
  };
  return db;
}

test('someone with no open shift is "fuera"; an open recent shift is "en_turno" with when it began', async () => {
  const db = fakeDb({ shifts: [{ staff_id: 2, clock_in: new Date(db0() - 3 * HOUR) }] });
  assert.equal((await marcacion.getShiftState(1, db, db.now)).estado, 'fuera');
  const state = await marcacion.getShiftState(2, db, db.now);
  assert.equal(state.estado, 'en_turno');
  assert.equal(new Date(state.desde).getTime(), db0() - 3 * HOUR);
  assert.equal(state.en_descanso, false);
});
function db0() { return new Date('2026-10-03T14:00:00Z').getTime(); }

test('a shift left open for more than 18 hours is "olvido_salida", not a normal shift', async () => {
  const db = fakeDb({ shifts: [{ staff_id: 3, clock_in: new Date(db0() - 20 * HOUR) }] });
  assert.equal((await marcacion.getShiftState(3, db, db.now)).estado, 'olvido_salida');
});

test('startShift opens a shift and a live session; doing it again recognises the person instead of failing', async () => {
  const db = fakeDb();
  const first = await marcacion.startShift(5, db, db.now);
  assert.equal(first.estado, 'en_turno');
  assert.equal(first.ya_estaba, false);
  assert.equal(db.shifts.length, 1);
  assert.equal(db.sessions.length, 1);
  db.now = new Date(db.now.getTime() + 2 * HOUR);
  const again = await marcacion.startShift(5, db, db.now);
  assert.equal(again.estado, 'en_turno');
  assert.equal(again.ya_estaba, true, 'already on shift: recognised, not clocked in a second time');
  assert.equal(db.shifts.length, 1, 'no second shift row');
  assert.equal(db.sessions.length, 1);
});

test('startShift refuses to open a new shift while a forgotten one is still open, and says who can fix it', async () => {
  const db = fakeDb({ shifts: [{ staff_id: 6, clock_in: new Date(db0() - 22 * HOUR) }] });
  await assert.rejects(marcacion.startShift(6, db, db.now), (error) => error.statusCode === 409 && /gerente/i.test(error.message));
  assert.equal(db.shifts.length, 1);
});

test('endShift closes the shift and the live session, and refuses when there is nothing to close', async () => {
  const db = fakeDb();
  await marcacion.startShift(7, db, db.now);
  db.now = new Date(db.now.getTime() + 8 * HOUR);
  const out = await marcacion.endShift(7, db, db.now);
  assert.equal(out.estado, 'fuera');
  assert.ok(db.shifts[0].clock_out);
  assert.ok(db.sessions[0].logout_time);
  await rejectsWith(marcacion.endShift(7, db, db.now), 409);
});

test('endShift refuses a forgotten (stale) shift rather than booking a huge shift; a manager corrects it', async () => {
  const db = fakeDb({ shifts: [{ staff_id: 8, clock_in: new Date(db0() - 25 * HOUR) }] });
  await assert.rejects(marcacion.endShift(8, db, db.now), (error) => error.statusCode === 409 && /gerente/i.test(error.message));
  assert.equal(db.shifts[0].clock_out, null);
});

test('clocking out during a break closes the break and counts its minutes', async () => {
  const db = fakeDb({ shifts: [{ staff_id: 9, clock_in: new Date(db0() - 4 * HOUR), break_start: new Date(db0() - 30 * 60 * 1000) }] });
  const state = await marcacion.getShiftState(9, db, db.now);
  assert.equal(state.en_descanso, true);
  await marcacion.endShift(9, db, db.now);
  assert.equal(db.shifts[0].total_break_minutes, 30);
  assert.ok(db.shifts[0].break_end && db.shifts[0].clock_out);
});

test('tiles put people on shift first, then those who worked yesterday and have not clocked in today, then the rest', async () => {
  const db = fakeDb({
    staff: [
      { id: 1, nombre: 'Zoe', tipo: 'staff', activo: 1 },
      { id: 2, nombre: 'Ana', tipo: 'management', activo: 1 },
      { id: 3, nombre: 'Beto', tipo: 'staff', activo: 1 },
      { id: 4, nombre: 'Dani', tipo: 'staff', activo: 1 },
      { id: 5, nombre: 'Eva', tipo: 'staff', activo: 1 },
      { id: 6, nombre: 'Baja', tipo: 'staff', activo: 0 }
    ],
    shifts: [
      { staff_id: 1, clock_in: new Date(db0() - 2 * HOUR) },
      { staff_id: 5, clock_in: new Date(db0() - 23 * HOUR) }
    ]
  });
  db.yesterday = new Set([2, 3, 4]);
  db.today = new Set([1, 4]);
  const tiles = await marcacion.getTiles(db, db.now);
  assert.deepEqual(tiles.map((t) => t.nombre), ['Zoe', 'Eva', 'Ana', 'Beto', 'Dani'], 'on shift, then needs-attention, then missed-today, then the rest; inactive people never appear');
  const by = Object.fromEntries(tiles.map((t) => [t.nombre, t]));
  assert.equal(by.Zoe.estado, 'en_turno');
  assert.equal(by.Eva.estado, 'olvido_salida');
  assert.equal(by.Ana.sin_entrada_hoy, true, 'worked yesterday, not in yet today');
  assert.equal(by.Beto.sin_entrada_hoy, true);
  assert.equal(by.Dani.sin_entrada_hoy, false, 'clocked in already today');
  assert.ok(tiles.every((t) => !('pin' in t)));
});
