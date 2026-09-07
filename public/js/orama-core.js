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
async function api(path, options) { const response = await fetch(path, options); const data = await response.json(); if (!response.ok || data.success === false) throw new Error(apiErrorMessage(data)); return data; }
function pageHead(eyebrow, title, subtitle = '', photo = '') { const head = `<div class="page-head"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1>${subtitle ? `<p class="subtle">${escapeHtml(subtitle)}</p>` : ''}</div></div>`; return photo ? `<div class="hero-banner" style="background-image:url('${photo}')">${head}</div>` : head; }
function statusBadge(status) { const map = { disponible: 'available', ocupada: 'occupied', cerrada: 'closed', cancelada: 'cancelled' }; return `<span class="badge ${map[status] || ''}">${escapeHtml(status)}</span>`; }
function setActive(route) { document.querySelectorAll('[data-route]').forEach((link) => { if (link.dataset.route === route) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); }); }
