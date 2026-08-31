function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        error: 'validation_error',
        details: result.error.flatten()
      });
    }
    req[source] = result.data;
    next();
  };
}

module.exports = { validate };