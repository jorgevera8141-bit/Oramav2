const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParam(value) {
  return DATE_REGEX.test(value || '') ? value : null;
}

module.exports = { parseDateParam };
