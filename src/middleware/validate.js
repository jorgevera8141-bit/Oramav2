function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) return res.status(400).json({ success: false, message: 'Datos inválidos', details: result.error.flatten() });
    req[source] = result.data;
    next();
  };
}

// router.param('id', numericIdParam): ids in the path are always positive integers, so
// anything else is a 400 here instead of a Postgres "invalid input syntax" 500 later.
function numericIdParam(_req, res, next, value) {
  if (!/^\d+$/.test(String(value))) return res.status(400).json({ success: false, message: 'Identificador inválido' });
  return next();
}

module.exports = { validate, numericIdParam };