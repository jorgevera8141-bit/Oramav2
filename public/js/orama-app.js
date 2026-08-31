const app = document.getElementById('app');
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  return res.json();
}

function renderDashboard() {
  app.innerHTML = `
    <section class="grid">
      <div class="card"><h2>Ventas</h2><div class="kpi">$0</div></div>
      <div class="card"><h2>Órdenes abiertas</h2><div class="kpi">0</div></div>
      <div class="card"><h2>Inventario bajo</h2><div class="kpi">0</div></div>
    </section>`;
}

function renderSimple(title, content) {
  app.innerHTML = `<section class="panel"><h2>${title}</h2>${content}</section>`;
}

async function route() {
  const h = location.hash.replace('#', '') || 'dashboard';
  if (h === 'dashboard') return renderDashboard();
  if (h === 'mesas') return renderSimple('Mesas', '<div class="grid"><div class="card">Cargando...</div></div>');
  if (h === 'ordenes') return renderSimple('Órdenes', '<table><tr><th>ID</th><th>Mesa</th><th>Total</th></tr></table>');
  if (h === 'menu') return renderSimple('Menú', '<div class="row"><input placeholder="Filtrar..." /></div>');
  if (h === 'inventario') return renderSimple('Inventario', '<table><tr><th>Item</th><th>Stock</th></tr></table>');
  if (h === 'reportes') return renderSimple('Reportes', '<div class="grid"></div>');
  if (h === 'staff') return renderSimple('Staff', '<table><tr><th>Nombre</th><th>Tipo</th></tr></table>');
  renderDashboard();
}

window.addEventListener('hashchange', route);
route();