// IVA. In Mexico a menu price normally already includes it, so a price is only revenue after IVA is taken
// out: margins are measured on the net price. Both facts are settings (stored in orama_settings) so they can
// change if the rate or the way the café prices does.
const DEFAULT_TAX = { ivaRate: 16, pricesIncludeIva: true };

function taxFromSettings(settings = {}) {
  const rate = settings.iva_rate === undefined || settings.iva_rate === '' ? NaN : Number(settings.iva_rate);
  const ivaRate = Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : DEFAULT_TAX.ivaRate;
  const pricesIncludeIva = settings.menu_prices_include_iva === '0' ? false : settings.menu_prices_include_iva === '1' ? true : DEFAULT_TAX.pricesIncludeIva;
  return { ivaRate, pricesIncludeIva };
}

async function getTaxSettings(db) {
  const { rows } = await db.query("SELECT key, value FROM orama_settings WHERE key IN ('iva_rate', 'menu_prices_include_iva')");
  return taxFromSettings(Object.fromEntries(rows.map((row) => [row.key, row.value])));
}

async function saveTaxSettings(db, { ivaRate, pricesIncludeIva }) {
  const upsert = 'INSERT INTO orama_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2';
  await db.query(upsert, ['iva_rate', String(ivaRate)]);
  await db.query(upsert, ['menu_prices_include_iva', pricesIncludeIva ? '1' : '0']);
}

// What the café actually earns from a menu price, before IVA.
function netOfIva(price, tax) {
  return tax.pricesIncludeIva ? price / (1 + tax.ivaRate / 100) : price;
}

// The price to print on the menu for a given price before IVA.
function menuPriceFromNet(net, tax) {
  return tax.pricesIncludeIva ? net * (1 + tax.ivaRate / 100) : net;
}

module.exports = { DEFAULT_TAX, taxFromSettings, getTaxSettings, saveTaxSettings, netOfIva, menuPriceFromNet };
