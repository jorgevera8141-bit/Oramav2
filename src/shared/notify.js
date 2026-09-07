// Approval notifications to a Telegram group. Dormant until TELEGRAM_BOT_TOKEN
// and TELEGRAM_CHAT_ID are set; a send failure is logged and never blocks the
// submit request. Approval itself still happens in the app with a PIN — this is
// only a nudge.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;                    // group id, e.g. -1001234567890
const APP_URL = (process.env.APP_PUBLIC_URL || 'https://oramav2-production.up.railway.app').replace(/\/$/, '');
const TIMEOUT_MS = 10_000;

const NOTIFY_CONFIGURED = !!(BOT_TOKEN && CHAT_ID);

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
    '🕐 <b>Promoción pendiente de aprobación</b>',
    '',
    `<b>${esc(promo.nombre)}</b>`,
    esc(beneficio(promo)),
    promo.categoria ? `Categoría: ${esc(promo.categoria)}` : null,
    `Vigencia: ${shortDate(promo.fecha_inicio)} → ${shortDate(promo.fecha_fin)}`,
    `Enviada por ${esc(actorNombre)}`,
    '',
    `<a href="${APP_URL}/#promociones">Revisar y aprobar</a>`
  ].filter((line) => line !== null).join('\n');
}

function socialPostMessage(post, actorNombre) {
  return [
    '🕐 <b>Publicación pendiente de aprobación</b>',
    '',
    `<b>${esc(post.titular || '(sin titular)')}</b>`,
    esc((post.plataformas || []).join(', ')),
    post.caption ? esc(post.caption.slice(0, 160)) : null,
    `Enviada por ${esc(actorNombre)}`,
    '',
    `<a href="${APP_URL}/#promociones">Revisar y aprobar</a>`
  ].filter((line) => line !== null).join('\n');
}

async function sendToTelegram(text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      throw new Error(`Telegram ${response.status}: ${json.description || 'error'}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

// Fire-and-forget from the submit routes: never awaited on the request path.
async function notifyApprovalRequested(kind, entity, actorNombre) {
  if (!NOTIFY_CONFIGURED) return;
  const text = kind === 'promocion' ? promoMessage(entity, actorNombre) : socialPostMessage(entity, actorNombre);
  try {
    await sendToTelegram(text);
  } catch (error) {
    console.error(`[notify] Telegram approval notification failed: ${error.message}`);
  }
}

module.exports = { notifyApprovalRequested, promoMessage, socialPostMessage, NOTIFY_CONFIGURED };
