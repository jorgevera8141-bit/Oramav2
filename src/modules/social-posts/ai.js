const Anthropic = require('@anthropic-ai/sdk');

// When NINEROUTER_URL is set, caption text comes from a 9Router gateway via its
// OpenAI-compatible /v1/chat/completions (streamed — some connected models only
// emit content when streamed). Otherwise the Anthropic API directly, via the SDK.
const NINEROUTER_URL = (process.env.NINEROUTER_URL || '').replace(/\/$/, '');
const VIA_9ROUTER = !!NINEROUTER_URL;

const AI_MODEL = VIA_9ROUTER
  ? (process.env.NINEROUTER_CHAT_MODEL || 'cc/claude-opus-4-7')
  : (process.env.ANTHROPIC_MODEL || 'claude-sonnet-5');
const AI_BACKEND = VIA_9ROUTER ? '9router' : 'anthropic';

const TIMEOUT_MS = 60_000;

let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(
      new Error('La generación de texto con IA no está configurada (define NINEROUTER_URL o ANTHROPIC_API_KEY).'),
      { statusCode: 503 }
    );
  }
  client = new Anthropic();
  return client;
}

const MAX_TOKENS = 2000;

const SYSTEM = [
  'Eres la persona a cargo de redes sociales de Café Rosinal, una cafetería en México.',
  'Escribe en español de México: cálido, cercano, breve, sin exageraciones ni signos de exclamación de más.',
  'Devuelve ÚNICAMENTE un objeto JSON válido con exactamente estas claves:',
  '"titular" (máx 80 caracteres), "caption" (2 a 4 frases), "cta" (llamado a la acción corto), "hashtags" (3 a 6 hashtags separados por espacio).',
  'Tu respuesta debe empezar con { y terminar con }. No escribas nada antes ni después, ni bloques de markdown.'
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

// Models wrap the object in markdown fences or prose despite the instruction —
// extract from the first "{" to the last "}" and parse that.
function parseJsonLoose(text) {
  const s = String(text);
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('no JSON object found');
  return JSON.parse(s.slice(start, end + 1));
}

function wrapSdkError(err) {
  if (err instanceof Anthropic.APIConnectionError) {
    return Object.assign(new Error('No se pudo contactar al servicio de IA.'), { statusCode: 502 });
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return Object.assign(new Error('Credenciales de IA inválidas (revisa ANTHROPIC_API_KEY).'), { statusCode: 502 });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return Object.assign(new Error('El servicio de IA está saturado. Intenta en un momento.'), { statusCode: 503 });
  }
  if (err instanceof Anthropic.APIError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return Object.assign(new Error(err.message || 'El servicio de IA devolvió un error.'), { statusCode: status });
  }
  return err;
}

// 9Router — OpenAI-compatible chat. Which of streamed / non-streamed actually
// returns content varies by the connected provider (Gemini needs non-stream,
// some free models need stream), so try non-stream first and fall back.
async function nineRouterChatOnce(userContent, stream) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.NINEROUTER_KEY) headers.Authorization = `Bearer ${process.env.NINEROUTER_KEY}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${NINEROUTER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: MAX_TOKENS,
        stream,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userContent }
        ]
      })
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw Object.assign(new Error('9Router tardó demasiado en responder.'), { statusCode: 504 });
    throw Object.assign(new Error('No se pudo contactar a 9Router.'), { statusCode: 502 });
  }
  if (!response.ok) {
    clearTimeout(timer);
    const json = await response.json().catch(() => ({}));
    const msg = json.error?.message || json.message || `9Router respondió ${response.status}`;
    throw Object.assign(new Error(response.status === 401 ? 'Credenciales de 9Router inválidas (revisa NINEROUTER_KEY).' : msg), { statusCode: 502 });
  }

  try {
    if (!stream) {
      const json = await response.json().catch(() => ({}));
      return json.choices?.[0]?.message?.content || '';
    }
    let text = '';
    let buffer = '';
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const match = line.match(/^data:\s*(.+)$/);
        if (!match || match[1] === '[DONE]') continue;
        try {
          text += JSON.parse(match[1]).choices?.[0]?.delta?.content || '';
        } catch { /* keepalive / partial frame */ }
      }
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function callNineRouterChat(userContent) {
  const text = await nineRouterChatOnce(userContent, false);
  if (text.trim()) return text;
  return nineRouterChatOnce(userContent, true);
}

async function generateCopy(promo) {
  const userContent = buildCopyPrompt(promo);
  let text;
  if (VIA_9ROUTER) {
    text = await callNineRouterChat(userContent);
  } else {
    const anthropic = getClient();
    let message;
    try {
      message = await anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        messages: [{ role: 'user', content: userContent }]
      });
    } catch (err) {
      throw wrapSdkError(err);
    }
    text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  }

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
