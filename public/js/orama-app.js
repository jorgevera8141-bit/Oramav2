'use strict';

const app = document.getElementById('app');
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function postJson(url, body) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function putJson(url, body) {
  return fetchJson(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function show(html) { app.innerHTML = html; }

function navLink(hash) {
  document.querySelectorAll('.nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === `#${hash}`);
  });
}

/* ─── DASHBOARD ─────────────────────────────────────────── */
async function renderDashboard() {
  navLink('dashboard');
  show('<div class="grid"><div class="card"><div class="muted">Cargando...</div></div></div>');
  try {
    const [fin, ordenes, lowStock] = await Promise.all([
      fetchJson('/api/finanzas'),
      fetchJson('/api/ordenes/dia'),
      fetchJson('/api/inventory/low-stock-count')
    ]);
    const abiertas = ordenes.filter(o => o.status === 'abierta').length;
    show(`
      <section class="grid">
        <div class="card">
          <h2>Ventas hoy</h2>
          <div class="kpi">${money.format(fin.ingresos || 0)}</div>
        </div>
        <div class="card">
          <h2>Órdenes abiertas</h2>
          <div class="kpi">${abiertas}</div>
        </div>
        <div class="card">
          <h2>Inventario bajo</h2>
          <div class="kpi">${lowStock.count ?? 0}</div>
        </div>
        <div class="card">
          <h2>Órdenes hoy</h2>
          <div class="kpi">${ordenes.length}</div>
        </div>
      </section>
    `);
  } catch (e) {
    show(`<div class="panel"><p class="muted">Error: ${e.message}</p></div>`);
  }
}

/* ─── MESAS ──────────────────────────────────────────────── */
async function renderMesas() {
  navLink('mesas');
  show('<div class="panel"><div class="muted">Cargando...</div></div>');
  try {
    const mesas = await fetchJson('/api/mesas');
    const cards = mesas.map(m => `
      <div class="card" style="cursor:pointer" onclick="abrirOrden(${m.id},'${escHtml(m.nombre)}')">
        <h3>${escHtml(m.nombre)}</h3>
        <span class="badge">${escHtml(m.status)}</span>
      </div>`).join('');
    show(`
      <section>
        <div class="row" style="margin-bottom:1rem">
          <h2 style="flex:1">Mesas</h2>
          <button onclick="nuevaMesa()">+ Nueva mesa</button>
        </div>
        <div class="grid">${cards || '<p class="muted">Sin mesas registradas.</p>'}</div>
      </section>
    `);
  } catch (e) {
    show(`<div class="panel"><p class="muted">Error: ${e.message}</p></div>`);
  }
}

async function nuevaMesa() {
  const nombre = prompt('Nombre de la mesa:');
  if (!nombre) return;
  await postJson('/api/mesas', { nombre });
  renderMesas();
}

window.abrirOrden = async function(mesaId, mesaNombre) {
  const items = await fetchJson('/api/menu').catch(() => []);
  const activos = items.filter(i => i.activo);
  const opts = activos.map(i => `<option value="${i.id}" data-precio="${i.precio}">${escHtml(i.nombre)} — ${money.format(i.precio)}</option>`).join('');
  show(`
    <section class="panel">
      <h2>Nueva orden — ${escHtml(mesaNombre)}</h2>
      <div class="row" style="margin-bottom:1rem">
        <select id="itemSelect" style="flex:1">${opts}</select>
        <input id="itemCantidad" type="number" min="1" value="1" style="width:80px" />
        <button onclick="agregarItemOrden()">Agregar</button>
      </div>
      <table id="orderItems"><tr><th>Item</th><th>Precio</th><th>Cant</th><th></th></tr></table>
      <div class="row" style="margin-top:1rem">
        <button onclick="confirmarOrden(${mesaId},'${escHtml(mesaNombre)}')">Confirmar orden</button>
        <button onclick="renderMesas()">Cancelar</button>
      </div>
    </section>
  `);
  window._orderLines = [];
};

window.agregarItemOrden = function() {
  const sel = document.getElementById('itemSelect');
  const cant = parseInt(document.getElementById('itemCantidad').value, 10) || 1;
  const nombre = sel.options[sel.selectedIndex].text.split(' — ')[0];
  const precio = parseFloat(sel.options[sel.selectedIndex].dataset.precio);
  window._orderLines = window._orderLines || [];
  window._orderLines.push({ item_nombre: nombre, precio, cantidad: cant });
  renderOrderTable();
};

function renderOrderTable() {
  const tbody = window._orderLines.map((l, idx) => `
    <tr>
      <td>${escHtml(l.item_nombre)}</td>
      <td>${money.format(l.precio)}</td>
      <td>${l.cantidad}</td>
      <td><button onclick="removeItem(${idx})">✕</button></td>
    </tr>`).join('');
  document.getElementById('orderItems').innerHTML =
    `<tr><th>Item</th><th>Precio</th><th>Cant</th><th></th></tr>${tbody}`;
}

window.removeItem = function(idx) {
  window._orderLines.splice(idx, 1);
  renderOrderTable();
};

window.confirmarOrden = async function(mesaId, mesaNombre) {
  if (!window._orderLines || window._orderLines.length === 0) {
    alert('Agrega al menos un item.');
    return;
  }
  await postJson('/api/ordenes', { mesa_id: mesaId, mesa_nombre: mesaNombre, items: window._orderLines });
  window._orderLines = [];
  renderMesas();
};

/* ─── ÓRDENES ────────────────────────────────────────────── */
async function renderOrdenes() {
  navLink('ordenes');
  show('<div class="panel"><div class="muted">Cargando...</div></div>');
  try {
    const ordenes = await fetchJson('/api/ordenes');
    const rows = ordenes.map(o => `
      <tr>
        <td>${o.id}</td>
        <td>${escHtml(o.mesa_nombre || '')}</td>
        <td><span class="badge">${escHtml(o.status)}</span></td>
        <td>${money.format(o.total || 0)}</td>
        <td>${o.created_at ? new Date(o.created_at).toLocaleString('es-MX') : ''}</td>
        <td>
          ${o.status === 'abierta' ? `<button onclick="cerrarOrden(${o.id})">Cerrar</button>` : ''}
          ${o.status === 'abierta' ? `<button onclick="cancelarOrden(${o.id})">Cancelar</button>` : ''}
        </td>
      </tr>`).join('');
    show(`
      <section>
        <h2>Órdenes</h2>
        <table>
          <tr><th>ID</th><th>Mesa</th><th>Status</th><th>Total</th><th>Fecha</th><th>Acciones</th></tr>
          ${rows || '<tr><td colspan="6" class="muted">Sin órdenes.</td></tr>'}
        </table>
      </section>
    `);
  } catch (e) {
    show(`<div class="panel"><p class="muted">Error: ${e.message}</p></div>`);
  }
}

window.cerrarOrden = async function(id) {
  const metodo = prompt('Método de pago (efectivo / tarjeta):', 'efectivo') || 'efectivo';
  await putJson(`/api/ordenes/${id}/cerrar`, { payment_method: metodo });
  renderOrdenes();
};

window.cancelarOrden = async function(id) {
  if (!confirm('¿Cancelar esta orden?')) return;
  await putJson(`/api/ordenes/${id}/cancelar`, {});
  renderOrdenes();
};

/* ─── MENÚ ───────────────────────────────────────────────── */
async function renderMenu() {
  navLink('menu');
  show('<div class="panel"><div class="muted">Cargando...</div></div>');
  try {
    const items = await fetchJson('/api/menu');
    window._menuItems = items;
    renderMenuTable(items);
  } catch (e) {
    show(`<div class="panel"><p class="muted">Error: ${e.message}</p></div>`);
  }
}

function renderMenuTable(items) {
  const cats = [...new Set(items.map(i => i.categoria))];
  const catOpts = cats.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  const rows = items.map(i => `
    <tr>
      <td>${i.id}</td>
      <td>${escHtml(i.nombre)}</td>
      <td>${escHtml(i.categoria)}</td>
      <td>${money.format(i.precio)}</td>
      <td><span class="badge">${i.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button onclick="toggleActivo(${i.id},${i.activo ? 0 : 1})">${i.activo ? 'Desactivar' : 'Activar'}</button>
        <button onclick="deleteMenuItem(${i.id})">Eliminar</button>
      </td>
    </tr>`).join('');
  show(`
    <section>
      <div class="row" style="margin-bottom:1rem">
        <h2 style="flex:1">Menú</h2>
        <input id="menuFilter" placeholder="Buscar..." oninput="filtrarMenu()" />
        <select id="catFilter" onchange="filtrarMenu()">
          <option value="">Todas las categorías</option>${catOpts}
        </select>
        <button onclick="showAddMenuItem()">+ Nuevo item</button>
      </div>
      <table id="menuTable">
        <tr><th>ID</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Status</th><th>Acciones</th></tr>
        ${rows || '<tr><td colspan="6" class="muted">Sin items.</td></tr>'}
      </table>
    </section>
  `);
}

window.filtrarMenu = function() {
  const q = (document.getElementById('menuFilter')?.value || '').toLowerCase();
  const cat = document.getElementById('catFilter')?.value || '';
  const filtered = (window._menuItems || []).filter(i =>
    i.nombre.toLowerCase().includes(q) &&
    (!cat || i.categoria === cat)
  );
  const rows = filtered.map(i => `
    <tr>
      <td>${i.id}</td>
      <td>${escHtml(i.nombre)}</td>
      <td>${escHtml(i.categoria)}</td>
      <td>${money.format(i.precio)}</td>
      <td><span class="badge">${i.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button onclick="toggleActivo(${i.id},${i.activo ? 0 : 1})">${i.activo ? 'Desactivar' : 'Activar'}</button>
        <button onclick="deleteMenuItem(${i.id})">Eliminar</button>
      </td>
    </tr>`).join('');
  const table = document.getElementById('menuTable');
  if (table) table.innerHTML = `<tr><th>ID</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Status</th><th>Acciones</th></tr>${rows}`;
};

window.toggleActivo = async function(id, val) {
  await putJson(`/api/menu/${id}`, { activo: val });
  renderMenu();
};

window.deleteMenuItem = async function(id) {
  if (!confirm('¿Eliminar este item?')) return;
  await fetch(`/api/menu/${id}`, { method: 'DELETE' });
  renderMenu();
};

window.showAddMenuItem = function() {
  show(`
    <section class="panel">
      <h2>Nuevo item de menú</h2>
      <div class="row" style="flex-direction:column;gap:.75rem">
        <input id="mNombre" placeholder="Nombre" />
        <input id="mCategoria" placeholder="Categoría" />
        <input id="mPrecio" type="number" placeholder="Precio" />
        <input id="mClave" placeholder="Clave interna" />
        <div class="row">
          <button onclick="guardarMenuItem()">Guardar</button>
          <button onclick="renderMenu()">Cancelar</button>
        </div>
      </div>
    </section>
  `);
};

window.guardarMenuItem = async function() {
  const body = {
    nombre: document.getElementById('mNombre').value,
    categoria: document.getElementById('mCategoria').value,
    precio: parseFloat(document.getElementById('mPrecio').value),
    clave: document.getElementById('mClave').value
  };
  await postJson('/api/menu/nuevo', body);
  renderMenu();
};

/* ─── INVENTARIO ─────────────────────────────────────────── */
async function renderInventario() {
  navLink('inventario');
  show('<div class="panel"><div class="muted">Cargando...</div></div>');
  try {
    const items = await fetchJson('/api/inventory');
    const rows = items.map(i => `
      <tr>
        <td>${i.id}</td>
        <td>${escHtml(i.name)}</td>
        <td>${i.current_stock} ${escHtml(i.unit)}</td>
        <td>${i.reorder_threshold}</td>
        <td><span class="badge" style="${Number(i.current_stock) <= Number(i.reorder_threshold) ? 'background:rgba(255,80,80,.2);color:#ff5050' : ''}">${Number(i.current_stock) <= Number(i.reorder_threshold) ? 'Bajo' : 'OK'}</span></td>
        <td>
          <button onclick="restockItem(${i.id})">Reabastecer</button>
        </td>
      </tr>`).join('');
    show(`
      <section>
        <div class="row" style="margin-bottom:1rem">
          <h2 style="flex:1">Inventario</h2>
          <button onclick="showAddInventoryItem()">+ Nuevo item</button>
          <button onclick="verShoppingList()">Lista de compras</button>
        </div>
        <table>
          <tr><th>ID</th><th>Nombre</th><th>Stock</th><th>Umbral</th><th>Status</th><th>Acciones</th></tr>
          ${rows || '<tr><td colspan="6" class="muted">Sin items.</td></tr>'}
        </table>
      </section>
    `);
  } catch (e) {
    show(`<div class="panel"><p class="muted">Error: ${e.message}</p></div>`);
  }
}

window.restockItem = async function(id) {
  const amount = parseFloat(prompt('Cantidad a reabastecer:') || '0');
  if (!amount) return;
  await postJson(`/api/inventory/${id}/restock`, { amount });
  renderInventario();
};

window.showAddInventoryItem = function() {
  show(`
    <section class="panel">
      <h2>Nuevo item de inventario</h2>
      <div class="row" style="flex-direction:column;gap:.75rem">
        <input id="iName" placeholder="Nombre" />
        <input id="iUnit" placeholder="Unidad (pieza, kg, lt...)" value="pieza" />
        <input id="iStock" type="number" placeholder="Stock inicial" value="0" />
        <input id="iThreshold" type="number" placeholder="Umbral de reorden" value="0" />
        <input id="iCosto" type="number" placeholder="Costo por unidad" value="0" />
        <div class="row">
          <button onclick="guardarInventoryItem()">Guardar</button>
          <button onclick="renderInventario()">Cancelar</button>
        </div>
      </div>
    </section>
  `);
};

window.guardarInventoryItem = async function() {
  const body = {
    name: document.getElementById('iName').value,
    unit: document.getElementById('iUnit').value || 'pieza',
    current_stock: parseFloat(document.getElementById('iStock').value) || 0,
    reorder_threshold: parseFloat(document.getElementById('iThreshold').value) || 0,
    cost_per_unit: parseFloat(document.getElementById('iCosto').value) || 0
  };
  await postJson('/api/inventory', body);
  renderInventario();
};

window.verShoppingList = async function() {
  const items = await fetchJson('/api/inventory/shopping-list');
  const rows = items.map(i => `<tr><td>${escHtml(i.name)}</td><td>${i.current_stock} ${escHtml(i.unit)}</td><td>${i.reorder_quantity}</td></tr>`).join('');
  show(`
    <section class="panel">
      <div class="row" style="margin-bottom:1rem">
        <h2 style="flex:1">Lista de compras</h2>
        <button onclick="renderInventario()">← Volver</button>
      </div>
      <table>
        <tr><th>Item</th><th>Stock actual</th><th>Cantidad a pedir</th></tr>
        ${rows || '<tr><td colspan="3" class="muted">Inventario en buen nivel.</td></tr>'}
      </table>
    </section>
  `);
};

/* ─── REPORTES ───────────────────────────────────────────── */
async function renderReportes() {
  navLink('reportes');
  show('<div class="panel"><div class="muted">Cargando...</div></div>');
  try {
    const [v2, horas, margenes] = await Promise.all([
      fetchJson('/api/reportes/v2'),
      fetchJson('/api/reportes/horas'),
      fetchJson('/api/reportes/margenes')
    ]);
    const cur = v2.current || {};
    const prev = v2.previous || {};
    const deltaVentas = Number(cur.total || 0) - Number(prev.total || 0);
    const deltaOrdenes = Number(cur.orders || 0) - Number(prev.orders || 0);

    const horasRows = horas.map(h => `<tr><td>${h.hour}:00</td><td>${h.total}</td></tr>`).join('');
    const margenesRows = margenes.slice(0, 10).map(m => `<tr><td>${escHtml(m.nombre)}</td><td>${money.format(m.revenue || 0)}</td></tr>`).join('');

    show(`
      <section>
        <h2>Reportes</h2>
        <div class="grid" style="margin-bottom:1rem">
          <div class="card">
            <p class="muted">Ventas (últimos 30 días)</p>
            <div class="kpi">${money.format(cur.total || 0)}</div>
            <p class="${deltaVentas >= 0 ? '' : 'muted'}">${deltaVentas >= 0 ? '▲' : '▼'} ${money.format(Math.abs(deltaVentas))} vs mes anterior</p>
          </div>
          <div class="card">
            <p class="muted">Órdenes (últimos 30 días)</p>
            <div class="kpi">${cur.orders || 0}</div>
            <p class="${deltaOrdenes >= 0 ? '' : 'muted'}">${deltaOrdenes >= 0 ? '▲' : '▼'} ${Math.abs(deltaOrdenes)} vs mes anterior</p>
          </div>
        </div>
        <div class="grid">
          <div class="panel">
            <h3>Horas pico</h3>
            <table><tr><th>Hora</th><th>Órdenes</th></tr>${horasRows || '<tr><td colspan="2" class="muted">Sin datos.</td></tr>'}</table>
          </div>
          <div class="panel">
            <h3>Top productos (ingresos)</h3>
            <table><tr><th>Item</th><th>Revenue</th></tr>${margenesRows || '<tr><td colspan="2" class="muted">Sin datos.</td></tr>'}</table>
          </div>
        </div>
      </section>
    `);
  } catch (e) {
    show(`<div class="panel"><p class="muted">Error: ${e.message}</p></div>`);
  }
}

/* ─── STAFF ──────────────────────────────────────────────── */
async function renderStaff() {
  navLink('staff');
  show('<div class="panel"><div class="muted">Cargando...</div></div>');
  try {
    const staff = await fetchJson('/api/staff');
    const rows = staff.map(s => `
      <tr>
        <td>${s.id}</td>
        <td>${escHtml(s.nombre)}</td>
        <td><span class="badge">${escHtml(s.tipo)}</span></td>
        <td><span class="badge">${s.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td><button onclick="toggleStaff(${s.id},${s.activo ? 0 : 1})">${s.activo ? 'Desactivar' : 'Activar'}</button></td>
      </tr>`).join('');
    show(`
      <section>
        <div class="row" style="margin-bottom:1rem">
          <h2 style="flex:1">Staff</h2>
          <button onclick="showAddStaff()">+ Nuevo miembro</button>
        </div>
        <table>
          <tr><th>ID</th><th>Nombre</th><th>Tipo</th><th>Status</th><th>Acciones</th></tr>
          ${rows || '<tr><td colspan="5" class="muted">Sin personal registrado.</td></tr>'}
        </table>
      </section>
    `);
  } catch (e) {
    show(`<div class="panel"><p class="muted">Error: ${e.message}</p></div>`);
  }
}

window.toggleStaff = async function(id, val) {
  await putJson(`/api/staff/${id}`, { activo: val });
  renderStaff();
};

window.showAddStaff = function() {
  show(`
    <section class="panel">
      <h2>Nuevo miembro de staff</h2>
      <div class="row" style="flex-direction:column;gap:.75rem">
        <input id="sNombre" placeholder="Nombre" />
        <input id="sPin" placeholder="PIN (4 dígitos)" type="password" maxlength="4" />
        <select id="sTipo">
          <option value="mesero">Mesero</option>
          <option value="cajero">Cajero</option>
          <option value="admin">Admin</option>
        </select>
        <div class="row">
          <button onclick="guardarStaff()">Guardar</button>
          <button onclick="renderStaff()">Cancelar</button>
        </div>
      </div>
    </section>
  `);
};

window.guardarStaff = async function() {
  const body = {
    nombre: document.getElementById('sNombre').value,
    pin: document.getElementById('sPin').value,
    tipo: document.getElementById('sTipo').value
  };
  await postJson('/api/staff', body);
  renderStaff();
};

/* ─── UTILS ──────────────────────────────────────────────── */
function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── ROUTER ─────────────────────────────────────────────── */
async function route() {
  const h = location.hash.replace('#', '') || 'dashboard';
  try {
    if (h === 'dashboard') return await renderDashboard();
    if (h === 'mesas') return await renderMesas();
    if (h === 'ordenes') return await renderOrdenes();
    if (h === 'menu') return await renderMenu();
    if (h === 'inventario') return await renderInventario();
    if (h === 'reportes') return await renderReportes();
    if (h === 'staff') return await renderStaff();
    return await renderDashboard();
  } catch (e) {
    show(`<div class="panel"><p class="muted">Error inesperado: ${e.message}</p></div>`);
  }
}

window.addEventListener('hashchange', route);
route();
