// Café-wide numbers that change what a price must cover: the card terminal fee, how much of the sales go
// through the card, the loyalty giveaway (1 free drink per N paid), the step prices are rounded to, and the
// monthly overhead. Stored in orama_settings next to the IVA setting. The defaults change nothing, so a café
// that has not filled them in gets the same prices as before.
const FIXED_KEYS = { rent: 'fixed_rent', phoneInternet: 'fixed_phone', payroll: 'fixed_payroll', other: 'fixed_other' };

const DEFAULT_BUSINESS = {
  cardFeePct: 0,
  cardSharePct: 0,
  paidPerFree: 0,
  roundTo: 0,
  fixedCosts: { rent: 0, phoneInternet: 0, payroll: 0, other: 0 }
};

const SETTING_KEYS = ['card_fee_pct', 'card_share_pct', 'loyalty_paid_per_free', 'price_round_to', ...Object.values(FIXED_KEYS)];

function numberInRange(raw, min, max, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function businessFromSettings(settings = {}) {
  const fixedCosts = {};
  for (const [field, key] of Object.entries(FIXED_KEYS)) fixedCosts[field] = numberInRange(settings[key], 0, 1e9, 0);
  return {
    cardFeePct: numberInRange(settings.card_fee_pct, 0, 20, 0),
    cardSharePct: numberInRange(settings.card_share_pct, 0, 100, 0),
    paidPerFree: numberInRange(settings.loyalty_paid_per_free, 0, 1000, 0),
    roundTo: numberInRange(settings.price_round_to, 0, 1000, 0),
    fixedCosts
  };
}

async function getBusinessSettings(db) {
  const { rows } = await db.query('SELECT key, value FROM orama_settings WHERE key = ANY($1)', [SETTING_KEYS]);
  return businessFromSettings(Object.fromEntries(rows.map((row) => [row.key, row.value])));
}

// Saves only the fields that were sent, so a client that knows nothing about these settings cannot wipe them.
async function saveBusinessSettings(db, input = {}) {
  const upsert = 'INSERT INTO orama_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2';
  const pairs = [
    ['card_fee_pct', input.cardFeePct],
    ['card_share_pct', input.cardSharePct],
    ['loyalty_paid_per_free', input.paidPerFree],
    ['price_round_to', input.roundTo],
    ...Object.entries(FIXED_KEYS).map(([field, key]) => [key, input.fixedCosts?.[field]])
  ];
  for (const [key, value] of pairs) {
    if (value !== undefined) await db.query(upsert, [key, String(value)]);
  }
}

// Units sold in the last 30 days: a real number to spread overhead over instead of a guess.
async function getObservedMonthlyUnits(db) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(oi.cantidad), 0)::int AS units
     FROM orden_items oi JOIN ordenes o ON o.id = oi.orden_id
     WHERE o.status = 'cerrada' AND o.created_at >= NOW() - INTERVAL '30 days'`
  );
  return rows[0].units;
}

module.exports = { DEFAULT_BUSINESS, businessFromSettings, getBusinessSettings, saveBusinessSettings, getObservedMonthlyUnits };
