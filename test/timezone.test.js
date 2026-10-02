const test = require('node:test');
const assert = require('node:assert/strict');
const tz = require('../src/shared/timezone');

test('localDateString and localTimeString convert a UTC instant to Mexico City wall time', () => {
  const lateEvening = new Date('2026-10-02T01:30:00.000Z'); // 19:30 on Oct 1 in Mexico City (UTC-6)
  assert.equal(tz.localDateString(lateEvening), '2026-10-01');
  assert.equal(tz.localTimeString(lateEvening), '19:30:00');
});

test('localDateString keeps the same day when UTC and local agree', () => {
  assert.equal(tz.localDateString(new Date('2026-10-01T15:00:00.000Z')), '2026-10-01');
});

test('zonedDateTimeToUtc returns the UTC instant of a Mexico City wall-clock time', () => {
  assert.equal(tz.zonedDateTimeToUtc('2026-10-01', '00:00:00').toISOString(), '2026-10-01T06:00:00.000Z');
  assert.equal(tz.zonedDateTimeToUtc('2026-10-01', '23:59:59.999').toISOString(), '2026-10-02T05:59:59.999Z');
});

test('SQL fragments cast UTC timestamps into the business timezone', () => {
  assert.equal(tz.localDateSql('o.closed_at'), "((o.closed_at) AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')::date");
  assert.equal(tz.localTimestampSql('created_at'), "((created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')");
  assert.equal(tz.TODAY_SQL, "(NOW() AT TIME ZONE 'America/Mexico_City')::date");
  assert.equal(tz.NOW_TIME_SQL, "(NOW() AT TIME ZONE 'America/Mexico_City')::time");
});
