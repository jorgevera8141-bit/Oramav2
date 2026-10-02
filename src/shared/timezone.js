// The café runs on Mexico City time, but timestamps are stored as UTC (TIMESTAMP
// without time zone, written by CURRENT_TIMESTAMP in a UTC session). Every "which
// day / which hour" decision has to convert first, otherwise sales after 6pm land on
// tomorrow and promo hours (hora_inicio/hora_fin) fire six hours off.
const BUSINESS_TZ = process.env.BUSINESS_TZ || 'America/Mexico_City';

// BUSINESS_TZ comes from deployment config, never from request input; the guard keeps
// a typo'd value from turning into SQL.
if (!/^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(BUSINESS_TZ)) throw new Error(`Invalid BUSINESS_TZ: ${BUSINESS_TZ}`);

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
});

function localParts(date) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
}

function localDateString(date = new Date()) {
  return localParts(date).date;
}

function localTimeString(date = new Date()) {
  return localParts(date).time;
}

// The UTC instant at which the business timezone reads `dateStr` `timeStr`. Used for
// day boundaries (00:00:00 / 23:59:59.999 of a local date).
function zonedDateTimeToUtc(dateStr, timeStr = '00:00:00') {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi, rest] = timeStr.split(':');
  const [s, ms = '0'] = String(rest || '0').split('.');
  const wallAsUtc = Date.UTC(y, mo - 1, d, Number(h), Number(mi), Number(s), Number(ms.padEnd(3, '0')));
  const local = localParts(new Date(wallAsUtc));
  const [lh, lmi, ls] = local.time.split(':').map(Number);
  const [ly, lmo, ld] = local.date.split('-').map(Number);
  const shownAsUtc = Date.UTC(ly, lmo - 1, ld, lh, lmi, ls, Number(ms.padEnd(3, '0')));
  return new Date(wallAsUtc - (shownAsUtc - wallAsUtc));
}

const localTimestampSql = (column) => `((${column}) AT TIME ZONE 'UTC' AT TIME ZONE '${BUSINESS_TZ}')`;
const localDateSql = (column) => `${localTimestampSql(column)}::date`;
const TODAY_SQL = `(NOW() AT TIME ZONE '${BUSINESS_TZ}')::date`;
const NOW_TIME_SQL = `(NOW() AT TIME ZONE '${BUSINESS_TZ}')::time`;

module.exports = {
  BUSINESS_TZ, localDateString, localTimeString, zonedDateTimeToUtc,
  localTimestampSql, localDateSql, TODAY_SQL, NOW_TIME_SQL
};
