const Anthropic = require('@anthropic-ai/sdk');

// When NINEROUTER_URL is set, both AI calls route through a 9Router gateway
// (OpenAI/Anthropic-compatible, one key, auto-fallback across providers).
// Otherwise they hit the Anthropic API directly.
const NINEROUTER_URL = (process.env.NINEROUTER_URL || '').replace(/\/$/, '');
const VIA_9ROUTER = !!NINEROUTER_URL;

const AI_MODEL = VIA_9ROUTER
  ? (process.env.NINEROUTER_CHAT_MODEL || 'cc/claude-opus-4-7')
  : (process.env.ANTHROPIC_MODEL || 'claude-sonnet-5');
const AI_BACKEND = VIA_9ROUTER ? '9router' : 'anthropic';

let client = null;
function getClient() {
  if (client) return client;
  if (VIA_9ROUTER) {
    client = new Anthropic({ baseURL: NINEROUTER_URL, apiKey: process.env.NINEROUTER_KEY || 'no-auth' });
    return client;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(
      new Error('La generación de texto con IA no está configurada (define NINEROUTER_URL o ANTHROPIC_API_KEY).'),
      { statusCode: 503 }
    );
  }
  client = new Anthropic();
  return client;
}

const SYSTEM = [
  'Eres la persona a cargo de redes sociales de Café Rosinal, una cafetería en México.',
  'Escribe en español de México: cálido, cercano, breve, sin exageraciones ni signos de exclamación de más.',
  'Devuelve ÚNICAMENTE un objeto JSON válido (sin markdown, sin explicación) con exactamente estas claves:',
  '"titular" (máx 80 caracteres), "caption" (2 a 4 frases), "cta" (llamado a la acción corto), "hashtags" (3 a 6 hashtags separados por espacio).'
].join(' ');

function resumenPrecio(promo) {
  if (promo.tipo === 'precio_fijo') return `precio especial de $${Number(promo.precio_promocional)}`;
  if (promo.tipo === 'descuento_porcentaje') return `${Number(promo.porcentaje_descuento)}% de descuento`;
  if (promo.tipo === 'compra_x_lleva_y') {
    return `compra ${promo.compra_cantidad} y llévate ${promo.lleva_cantidad} al ${Number(promo.lleva_descuento_pct)}% (${Number(promo.lleva_descuento_pct) === 100 ? 'gratis' : 'descuento'})`;
  }
  return '';
}

function buildCopyPrompt(promo) {
  const lines = [
    `Promoción: ${promo.nombre}`,
    `Beneficio: ${resumenPrecio(promo)}`,
    promo.descripcion ? `Descripción: ${promo.descripcion}` : null,
    promo.categoria ? `Aplica a la categoría: ${promo.categoria}` : null,
    promo.condiciones ? `Condiciones: ${promo.condiciones}` : null,
    `Vigencia: ${String(promo.fecha_inicio).slice(0, 10)} a ${String(promo.fecha_fin).slice(0, 10)}`
  ].filter(Boolean);
  return `Redacta el texto de una publicación para Instagram y Facebook de esta promoción:\n\n${lines.join('\n')}`;
}

// Claude sometimes wraps JSON in ```json fences despite the instruction — strip them.
function parseJsonLoose(text) {
  const cleaned = String(text).trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  return JSON.parse(cleaned);
}

function wrapSdkError(err) {
  const where = VIA_9ROUTER ? '9Router' : 'el servicio de IA';
  if (err instanceof Anthropic.APIConnectionError) {
    return Object.assign(new Error(`No se pudo contactar a ${where}.`), { statusCode: 502 });
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return Object.assign(new Error('Credenciales de IA inválidas (revisa NINEROUTER_KEY / ANTHROPIC_API_KEY).'), { statusCode: 502 });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return Object.assign(new Error(`${where} está saturado. Intenta en un momento.`), { statusCode: 503 });
  }
  if (err instanceof Anthropic.APIError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return Object.assign(new Error(err.message || `${where} devolvió un error.`), { statusCode: status });
  }
  return err;
}

async function generateCopy(promo) {
  const anthropic = getClient();
  let message;
  try {
    message = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildCopyPrompt(promo) }]
    });
  } catch (err) {
    throw wrapSdkError(err);
  }
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = parseJsonLoose(text);
  } catch {
    throw Object.assign(new Error('La IA devolvió una respuesta que no se pudo interpretar. Intenta de nuevo.'), { statusCode: 502 });
  }
  return {
    titular: String(parsed.titular || '').slice(0, 120),
    caption: String(parsed.caption || '').slice(0, 2000),
    cta: String(parsed.cta || '').slice(0, 80),
    hashtags: String(parsed.hashtags || '').slice(0, 500)
  };
}

module.exports = { generateCopy, buildCopyPrompt, parseJsonLoose, resumenPrecio, AI_MODEL, AI_BACKEND };
