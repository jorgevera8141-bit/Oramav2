const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sessionDurationMinutes,
  sessionRangeMinutes,
  clockIn,
  clockOut,
  summarizeSessionRows,
  getHoursSummary
} = require('../src/modules/staff/service');

function createDbMock(...handlers) {
  let index = 0;
  return {
    async query(sql, params) {
      const handler = handlers[index];
      index += 1;
      if (!handler) throw new Error(`Unexpected query #${index}: ${sql}`);
      return handler(sql, params);
    }
  };
}

test('clockIn rejects an invalid PIN', async () => {
  const db = createDbMock(async () => ({ rows: [] }));
  await assert.rejects(
    () => clockIn({ nombre: 'Ana', pin: '9999' }, db),
    (error) => error.statusCode === 401 && error.message === 'Nombre o PIN incorrectos.'
  );
});

test('clockIn prevents duplicate active sessions for the same staff member', async () => {
  const db = createDbMock(
    async () => ({ rows: [{ id: 3, nombre: 'Ana', tipo: 'staff', idioma: 'es', activo: 1 }] }),
    async () => ({ rows: [{ id: 11, staff_id: 3, login_time: '2026-09-22T08:00:00.000Z', logout_time: null, screen: 'pos' }] })
  );
  await assert.rejects(
    () => clockIn({ nombre: 'Ana', pin: '1234' }, db),
    (error) => error.statusCode === 409 && error.message === 'Este miembro del staff ya tiene una sesión activa.'
  );
});

test('clockOut rejects when the staff member has no active session', async () => {
  const db = createDbMock(
    async () => ({ rows: [{ id: 3, nombre: 'Ana', tipo: 'staff', idioma: 'es', activo: 1 }] }),
    async () => ({ rows: [] })
  );
  await assert.rejects(
    () => clockOut({ nombre: 'Ana', pin: '1234' }, db),
    (error) => error.statusCode === 409 && error.message === 'No hay una sesión activa para cerrar.'
  );
});

test('sessionDurationMinutes counts worked time correctly across midnight', () => {
  const minutes = sessionDurationMinutes({
    login_time: '2026-09-21T23:00:00.000Z',
    logout_time: '2026-09-22T01:30:00.000Z'
  });
  assert.equal(minutes, 150);
});

test('sessionRangeMinutes clips an overnight shift to the requested summary date range', () => {
  const minutes = sessionRangeMinutes(
    {
      login_time: '2026-09-21T23:00:00.000Z',
      logout_time: '2026-09-22T01:30:00.000Z'
    },
    { from: '2026-09-22', to: '2026-09-22' }
  );
  assert.equal(minutes, 90);
});

test('summarizeSessionRows aggregates total hours and session counts per staff member', () => {
  const summary = summarizeSessionRows(
    [
      {
        id: 1,
        staff_id: 1,
        nombre: 'Ana',
        tipo: 'staff',
        idioma: 'es',
        activo: 1,
        login_time: '2026-09-22T08:00:00.000Z',
        logout_time: '2026-09-22T12:00:00.000Z'
      },
      {
        id: 2,
        staff_id: 1,
        nombre: 'Ana',
        tipo: 'staff',
        idioma: 'es',
        activo: 1,
        login_time: '2026-09-22T13:00:00.000Z',
        logout_time: '2026-09-22T15:30:00.000Z'
      },
      {
        id: 3,
        staff_id: 2,
        nombre: 'Beto',
        tipo: 'management',
        idioma: 'es',
        activo: 1,
        login_time: '2026-09-21T23:00:00.000Z',
        logout_time: '2026-09-22T01:00:00.000Z'
      }
    ],
    { from: '2026-09-22', to: '2026-09-22' }
  );
  assert.deepEqual(summary, [
    {
      staff_id: 1,
      nombre: 'Ana',
      tipo: 'staff',
      idioma: 'es',
      activo: 1,
      sessions_count: 2,
      total_minutes: 390,
      total_hours: 6.5
    },
    {
      staff_id: 2,
      nombre: 'Beto',
      tipo: 'management',
      idioma: 'es',
      activo: 1,
      sessions_count: 1,
      total_minutes: 60,
      total_hours: 1
    }
  ]);
});

test('summarizeSessionRows ignores session rows that contribute zero minutes in range', () => {
  const summary = summarizeSessionRows(
    [
      {
        id: 7,
        staff_id: 3,
        nombre: 'Carla',
        tipo: 'staff',
        idioma: 'es',
        activo: 1,
        login_time: '2026-09-21T10:00:00.000Z',
        logout_time: '2026-09-21T12:00:00.000Z'
      }
    ],
    { from: '2026-09-22', to: '2026-09-22' }
  );

  assert.deepEqual(summary, [
    {
      staff_id: 3,
      nombre: 'Carla',
      tipo: 'staff',
      idioma: 'es',
      activo: 1,
      sessions_count: 0,
      total_minutes: 0,
      total_hours: 0
    }
  ]);
});

test('getHoursSummary includes staff with no sessions in the selected range', async () => {
  const db = createDbMock(async () => ({
    rows: [
      {
        staff_id: 1,
        nombre: 'Ana',
        tipo: 'staff',
        idioma: 'es',
        activo: 1,
        id: 10,
        login_time: '2026-09-22T08:00:00.000Z',
        logout_time: '2026-09-22T10:00:00.000Z'
      },
      {
        staff_id: 2,
        nombre: 'Beto',
        tipo: 'management',
        idioma: 'es',
        activo: 1,
        id: null,
        login_time: null,
        logout_time: null
      }
    ]
  }));

  const summary = await getHoursSummary({ from: '2026-09-22', to: '2026-09-22' }, db);

  assert.deepEqual(summary, [
    {
      staff_id: 1,
      nombre: 'Ana',
      tipo: 'staff',
      idioma: 'es',
      activo: 1,
      sessions_count: 1,
      total_minutes: 120,
      total_hours: 2
    },
    {
      staff_id: 2,
      nombre: 'Beto',
      tipo: 'management',
      idioma: 'es',
      activo: 1,
      sessions_count: 0,
      total_minutes: 0,
      total_hours: 0
    }
  ]);
});
