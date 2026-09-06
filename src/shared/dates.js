const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParam(value) {
  return DATE_REGEX.test(value || '') ? value : null;
}

function previousEqualPeriod(from, to) {
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const days = Math.round((toDate - fromDate) / 86400000) + 1;
  const prevTo = new Date(fromDate);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (days - 1));
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

module.exports = { parseDateParam, previousEqualPeriod };
