// Approval notifications over WhatsApp (Twilio). Dormant until the TWILIO_* env
// vars are set; a send failure is logged and never blocks the submit request.
// Approval itself still happens in the app with a PIN — this is only a nudge.

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM;            // whatsapp:+14155238886
const TWILIO_TO = (process.env.TWILIO_WHATSAPP_TO || '')
  .split(',').map((s) => s.trim()).filter(Boolean);              // whatsapp:+52..., whatsapp:+52...
const TWILIO_CONTENT_SID = process.env.TWILIO_CONTENT_SID || null; // optional pre-approved template
const APP_URL = (process.env.APP_PUBLIC_URL || 'https://oramav2-production.up.railway.app').replace(/\/$/, '');
const TIMEOUT_MS = 10_000;

const NOTIFY_CONFIGURED = !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM && TWILIO_TO.length);

function shortDate(value) {
  return String(value || '').slice(0, 10);
}

function beneficio(promo) {
  if (promo.tipo === 'precio_fijo') return `Precio especial $${Number(promo.precio_promocional)}`;
  if (promo.tipo === 'descuento_porcentaje') return `${Number(promo.porcentaje_descuento)}% de descuento`;
  if (promo.tipo === 'compra_x_lleva_y') {
    return `Compra ${promo.compra_cantidad}, lleva ${promo.lleva_cantidad} al ${Number(promo.lleva_descuento_pct)}%`;
  }
  return '';
}

function promoMessage(promo, actorNombre) {
  return [
    '🕐 *Promoción pendiente de aprobación*',
    '',
    `*${promo.nombre}*`,
    beneficio(promo),
    promo.categoria ? `Categoría: ${promo.categoria}` : null,
    `Vigencia: ${shortDate(promo.fecha_inicio)} → ${shortDate(promo.fecha_fin)}`,
    `Enviada por ${actorNombre}`,
    '',
    `Revisar y aprobar: ${APP_URL}/#promociones`
  ].filter((line) => line !== null).join('\n');
}

function socialPostMessage(post, actorNombre) {
  return [
    '🕐 *Publicación pendiente de aprobación*',
    '',
    `*${post.titular || '(sin titular)'}*`,
    (post.plataformas || []).join(', '),
    post.caption ? post.caption.slice(0, 160) : null,
    `Enviada por ${actorNombre}`,
    '',
    `Revisar y aprobar: ${APP_URL}/#promociones`
  ].filter((line) => line !== null).join('\n');
}

async function sendOne(to, body) {
  const params = new URLSearchParams({ From: TWILIO_FROM, To: to });
  if (TWILIO_CONTENT_SID) {
    params.set('ContentSid', TWILIO_CONTENT_SID);
    params.set('ContentVariables', JSON.stringify({ 1: body }));
  } else {
    params.set('Body', body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params,
      signal: controller.signal
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      throw new Error(`Twilio ${response.status} (${json.code || '?'}): ${json.message || 'error'}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

// Fire-and-forget from the submit routes: never awaited on the request path.
async function notifyApprovalRequested(kind, entity, actorNombre) {
  if (!NOTIFY_CONFIGURED) return;
  const body = kind === 'promocion' ? promoMessage(entity, actorNombre) : socialPostMessage(entity, actorNombre);
  const results = await Promise.allSettled(TWILIO_TO.map((to) => sendOne(to, body)));
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    console.error(`[notify] ${failed.length}/${TWILIO_TO.length} WhatsApp approval notifications failed: ${failed.map((f) => f.reason.message).join('; ')}`);
  }
}

module.exports = { notifyApprovalRequested, promoMessage, socialPostMessage, NOTIFY_CONFIGURED };
