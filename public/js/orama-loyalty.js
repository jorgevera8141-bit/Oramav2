const LOGO_SVG = `<svg class="logo" viewBox="0 0 250 72" role="img" aria-labelledby="loyalty-logo-title">
  <title id="loyalty-logo-title">Orama Café</title>
  <g class="logo-steam" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.5"><path d="M111 12c-7 5-7 9 0 14s7 9 0 14"/><path d="M125 8c-7 5-7 9 0 14s7 9 0 14"/><path d="M139 12c-7 5-7 9 0 14s7 9 0 14"/></g>
  <g class="logo-cup" fill="none" stroke="currentColor" stroke-width="2"><path d="M101 40h48l-4 12c-2 5-7 8-20 8s-18-3-20-8z"/><path d="M149 43h8c9 0 9 12 0 13h-10"/><ellipse cx="125" cy="61" rx="31" ry="4"/></g>
  <path class="logo-arc" d="M16 37c18-13 34-15 51-11M234 37c-18-13-34-15-51-11"/>
  <text class="logo-word" x="125" y="34" text-anchor="middle">ORAMA</text><ellipse class="logo-bean" cx="77" cy="11" rx="4" ry="7" transform="rotate(-25 77 11)"/><path class="logo-bean-line" d="M75 6c4 3 4 7 2 10"/>
  <path class="logo-dash" d="M45 70h35M170 70h35"/><text class="logo-cafe" x="125" y="72" text-anchor="middle">CAFÉ</text>
</svg>`;

const app = document.getElementById('loyalty-app');
let lastPhone = '';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderShell(inner) {
  app.innerHTML = `<section class="glass-card loyalty-card">
    <div class="loyalty-card-head">${LOGO_SVG}<p class="loyalty-eyebrow">Cliente Frecuente</p></div>
    <div class="loyalty-card-body">${inner}</div>
  </section>`;
}

function renderPhoneForm(message = '') {
  renderShell(`
    <form class="loyalty-form" id="loyalty-phone-form">
      <label for="loyalty-phone">Tu número de teléfono</label>
      <input class="search" id="loyalty-phone" inputmode="numeric" maxlength="10" placeholder="4491234567" value="${escapeHtml(lastPhone)}" required>
      <button type="submit" class="button">Ver mi tarjeta</button>
    </form>
    ${message ? `<div class="empty error loyalty-error">${escapeHtml(message)}</div>` : ''}
  `);
  document.getElementById('loyalty-phone-form').addEventListener('submit', onSubmitPhone);
}

function renderSignupForm(phone) {
  renderShell(`
    <p class="loyalty-progress-label">No encontramos una tarjeta con este número. ¿Quieres crear una?</p>
    <form class="loyalty-form" id="loyalty-signup-form">
      <label for="loyalty-nombre">Tu nombre (opcional)</label>
      <input class="search" id="loyalty-nombre" maxlength="120" placeholder="Ej. Ana">
      <div class="checkbox-field" style="margin-top:14px">
        <label><input type="checkbox" id="loyalty-consent"> Quiero recibir promociones por WhatsApp/SMS</label>
      </div>
      <button type="submit" class="button">Crear mi tarjeta</button>
    </form>
    <button class="loyalty-switch" id="loyalty-back">Usar otro número</button>
  `);
  document.getElementById('loyalty-signup-form').addEventListener('submit', (event) => onSubmitSignup(event, phone));
  document.getElementById('loyalty-back').addEventListener('click', () => renderPhoneForm());
}

function stampGridHtml(card) {
  const cells = [];
  for (let i = 0; i < card.stamps_required; i += 1) {
    cells.push(`<div class="stamp-cell${i < card.balance ? ' filled' : ''}"></div>`);
  }
  cells.push(`<div class="stamp-cell reward${card.reward_available ? ' available' : ''}">
    ${card.reward_available ? '¡Bebida gratis lista!' : 'Bebida gratis'}
    <small>Equivalente a tu producto favorito</small>
  </div>`);
  return `<div class="stamp-grid">${cells.join('')}</div>`;
}

function renderCard(customer, card) {
  const remaining = Math.max(card.stamps_required - card.balance, 0);
  renderShell(`
    <p class="loyalty-customer-name">${escapeHtml(customer.nombre || 'Cliente frecuente')}</p>
    <p class="loyalty-customer-phone">${escapeHtml(customer.phone)}</p>
    ${stampGridHtml(card)}
    <p class="loyalty-progress-label">
      ${card.reward_available
        ? '<strong>¡Ya tienes una bebida gratis!</strong> Muéstrale esta pantalla al staff.'
        : `Te falta${remaining === 1 ? '' : 'n'} <strong>${remaining}</strong> compra${remaining === 1 ? '' : 's'} para tu bebida gratis`}
    </p>
    <button class="loyalty-switch" id="loyalty-back">Usar otro número</button>
    <p class="loyalty-footer">Sellos totales: ${card.lifetime_stamps}</p>
  `);
  document.getElementById('loyalty-back').addEventListener('click', () => renderPhoneForm());
}

async function onSubmitPhone(event) {
  event.preventDefault();
  const phone = document.getElementById('loyalty-phone').value.trim();
  lastPhone = phone;
  renderShell('<p class="loyalty-progress-label">Buscando tu tarjeta…</p>');
  try {
    const response = await fetch(`/api/loyalty/customers/${encodeURIComponent(phone)}`);
    if (response.status === 404) return renderSignupForm(phone);
    const data = await response.json();
    if (!data.success) return renderPhoneForm(data.message || 'No se pudo buscar tu tarjeta.');
    renderCard(data.customer, data.card);
  } catch {
    renderPhoneForm('No se pudo conectar. Intenta de nuevo.');
  }
}

async function onSubmitSignup(event, phone) {
  event.preventDefault();
  const nombre = document.getElementById('loyalty-nombre').value.trim();
  const marketingConsent = document.getElementById('loyalty-consent').checked;
  renderShell('<p class="loyalty-progress-label">Creando tu tarjeta…</p>');
  try {
    const response = await fetch('/api/loyalty/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, nombre: nombre || undefined, marketing_consent: marketingConsent })
    });
    const data = await response.json();
    if (!data.success) return renderPhoneForm(data.message || 'No se pudo crear tu tarjeta.');
    renderCard(data.customer, data.card);
  } catch {
    renderPhoneForm('No se pudo conectar. Intenta de nuevo.');
  }
}

renderPhoneForm();
