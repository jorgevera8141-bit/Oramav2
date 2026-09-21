window.Orama = window.Orama || {};
Orama.routes = Orama.routes || {};

const app = document.getElementById('app');
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>\'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const loading = '<div class="empty"><svg class="coffee-loader" viewBox="0 0 60 60" aria-label="Cargando"><path class="steam" d="M20 13c-5 5 5 7 0 12"/><path class="steam" d="M30 10c-5 5 5 7 0 12"/><path class="steam" d="M40 13c-5 5 5 7 0 12"/><path class="cup" d="M17 28h27l-3 15c-1 4-5 6-11 6s-10-2-11-6z"/><path class="cup" d="M44 31h5c6 0 6 9 0 10h-6"/><ellipse class="cup" cx="30" cy="49" rx="19" ry="3"/></svg></div>';
function apiErrorMessage(data) {
  const base = data.message || 'No se pudo cargar la información';
  const d = data.details;
  if (!d) return base;
  // Prefer the schema's own friendly refine messages; only fall back to raw
  // field-level errors when there are none.
  const form = (d.formErrors || []).filter(Boolean);
  const fields = form.length ? [] : Object.values(d.fieldErrors || {}).flat().filter(Boolean);
  const parts = form.concat(fields);
  return parts.length ? `${base}: ${parts.join(' · ')}` : base;
}
async function api(path, options) { const response = await fetch(path, options); const data = await response.json(); if (!response.ok || data.success === false) { const error = new Error(apiErrorMessage(data)); error.status = response.status; throw error; } return data; }
function pageHead(eyebrow, title, subtitle = '', photo = '') { const head = `<div class="page-head"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1>${subtitle ? `<p class="subtle">${escapeHtml(subtitle)}</p>` : ''}</div></div>`; return photo ? `<div class="hero-banner" style="background-image:url('${photo}')">${head}</div>` : head; }
function statusBadge(status) {
  const normalized = String(status || '').toLowerCase();
  const map = {
    disponible: 'available',
    abierta: 'available',
    ocupada: 'occupied',
    por_cobrar: 'occupied',
    cerrada: 'closed',
    cancelada: 'cancelled',
    pendiente: 'occupied',
    error: 'cancelled'
  };
  return `<span class="badge ${map[normalized] || ''}">${escapeHtml(status)}</span>`;
}
function setActive(route) { document.querySelectorAll('[data-route]').forEach((link) => { if (link.dataset.route === route) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); }); }

const ICON_PATHS = {
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  sparkle: '<path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2z"/>',
  receipt: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  'check-badge': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/>',
  message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>'
};
const ICON_FILLED = new Set(['sparkle', 'bolt']);
function icon(name) {
  const inner = ICON_PATHS[name];
  if (!inner) return '';
  const filled = ICON_FILLED.has(name);
  return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="${filled ? 'currentColor' : 'none'}" stroke="${filled ? 'none' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

(function initNavMore() {
  const toggle = document.querySelector('[data-nav-more-toggle]');
  const menu = document.querySelector('[data-nav-more-menu]');
  if (!toggle || !menu) return;
  const close = () => { toggle.setAttribute('aria-expanded', 'false'); menu.hidden = true; };
  const open = () => {
    const rect = toggle.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    toggle.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
  };
  toggle.addEventListener('click', (event) => { event.stopPropagation(); if (menu.hidden) open(); else close(); });
  menu.addEventListener('click', (event) => { if (event.target.closest('a')) close(); });
  document.addEventListener('click', (event) => { if (!menu.hidden && !menu.contains(event.target) && event.target !== toggle) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !menu.hidden) { close(); toggle.focus(); } });
  window.addEventListener('hashchange', close);
})();
