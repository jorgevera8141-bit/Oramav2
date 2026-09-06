const pool = require('../../config/database');

// Soft daily ceiling on paid AI generations (text + image combined), counted from
// the bitacora rows each call writes. Override with AI_DAILY_LIMIT.
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 40);

async function assertUnderDailyLimit(db = pool) {
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM bitacora WHERE entidad_tipo = 'ai_generacion' AND created_at >= date_trunc('day', now())"
  );
  if (rows[0].n >= DAILY_LIMIT) {
    throw Object.assign(
      new Error(`Se alcanzó el límite diario de generaciones con IA (${DAILY_LIMIT}). Vuelve mañana o ajusta AI_DAILY_LIMIT.`),
      { statusCode: 429 }
    );
  }
}

module.exports = { assertUnderDailyLimit, DAILY_LIMIT };
