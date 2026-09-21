const categoryPhotos = {
  'Especialidades de Cafe': '/images/coffee-beans.jpg',
  'Cafe Espresso y Chocolate': '/images/coffee-beans.jpg',
  Reposteria: '/images/pastries.jpg',
  Tes: '/images/iced-tea.jpg'
};

async function dashboard() {
  const [ordersData, inventoryData] = await Promise.all([api('/api/ordenes/dia'), api('/api/inventory/low-stock-count')]);
  const orders = ordersData.ordenes || [];
  const closed = orders.filter((order) => order.status === 'cerrada');
  const open = orders.filter((order) => order.status === 'abierta');
  const cash = closed.reduce((sum, order) => sum + Number(order.amount_cash || 0), 0);
  const card = closed.reduce((sum, order) => sum + Number(order.amount_card || 0), 0);
  const total = closed.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const lowStockCount = Number(inventoryData.count || 0);

  app.innerHTML = pageHead(
    'Control de hoy',
    'Resumen',
    new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }),
    '/images/cafe-ambiance.jpg'
  ) +
    `<section class="grid dashboard-kpis">
      <article class="glass-card crystal-card kpi-card" data-fx="sheen">
        <p class="kpi-label">Ventas hoy</p>
        <p class="kpi-value">${money.format(total)}</p>
      </article>
      <article class="glass-card crystal-card kpi-card">
        <p class="kpi-label">Efectivo</p>
        <p class="kpi-value">${money.format(cash)}</p>
      </article>
      <article class="glass-card crystal-card kpi-card">
        <p class="kpi-label">Tarjeta</p>
        <p class="kpi-value">${money.format(card)}</p>
      </article>
      <article class="glass-card crystal-card kpi-card warn">
        <p class="kpi-label">Inventario bajo</p>
        <p class="kpi-value">${lowStockCount}</p>
      </article>
    </section>
    <section class="panel crystal-card panel-operational ${lowStockCount ? 'panel-warn' : ''}">
      <div class="panel-head">
        <h2>Centro operativo</h2>
        <span class="subtle">${open.length} órdenes abiertas</span>
      </div>
      <div class="ops-alert-row">
        <span class="badge badge-estado ${lowStockCount ? 'warn' : 'live'}">${lowStockCount ? '⚠' : '✓'} Inventario ${lowStockCount ? 'en atención' : 'estable'}</span>
      </div>
      ${orderTable(open, 'No hay órdenes abiertas')}
    </section>`;
}

function orderTable(orders, emptyMessage = 'Sin órdenes registradas') {
  return `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th scope="col">Orden</th>
          <th scope="col">Mesa</th>
          <th scope="col">Total</th>
          <th scope="col">Estado</th>
          <th scope="col">Acciones</th>
        </tr>
      </thead>
      <tbody>${orders.length
    ? orders.map((order) => `<tr>
          <td class="mono">#${order.id}</td>
          <td>${escapeHtml(order.mesa_nombre || 'Mostrador')}</td>
          <td class="mono">${money.format(Number(order.total || 0))}</td>
          <td class="status-cell">${statusBadge(order.status)}</td>
          <td>${order.status === 'abierta'
      ? `<div class="action-row order-actions">
                <button class="button" data-action="cerrar-efectivo" data-id="${order.id}" data-total="${order.total || 0}" aria-label="Cobrar orden #${order.id} en efectivo">Efectivo</button>
                <button class="button" data-action="cerrar-tarjeta" data-id="${order.id}" data-total="${order.total || 0}" aria-label="Cobrar orden #${order.id} con tarjeta">Tarjeta</button>
                <button class="button danger" data-action="cancel" data-id="${order.id}" aria-label="Cancelar orden #${order.id}">Cancelar</button>
              </div>`
      : '—'}</td>
        </tr>`).join('')
    : `<tr><td class="empty" colspan="5">${escapeHtml(emptyMessage)}</td></tr>`}
      </tbody>
    </table>
  </div>`;
}

async function mesas() {
  const data = await api('/api/mesas');
  app.innerHTML = pageHead('Sala', 'Mesas', 'Estado de las mesas en tiempo real') +
    `<section class="mesa-grid">${(data.mesas || []).map((mesa) => `<article class="mesa-card crystal-card ${mesa.status === 'ocupada' ? 'occupied' : ''}">
      <h2 class="mesa-name">${escapeHtml(mesa.nombre)}</h2>
      ${statusBadge(mesa.status)}
    </article>`).join('') || '<div class="empty">No hay mesas configuradas</div>'}</section>`;
}

async function orders() {
  const data = await api('/api/ordenes');
  const rows = data.ordenes || [];
  app.innerHTML = pageHead('Operación', 'Órdenes', 'Seguimiento de ventas y cobros') +
    `<section class="panel crystal-card">${orderTable(rows, 'Sin órdenes registradas')}</section>`;
}

async function staff() {
  const data = await api('/api/staff');
  app.innerHTML = pageHead('Equipo', 'Staff', 'Personal activo en operación') +
    `<section class="panel crystal-card"><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Tipo</th><th>Idioma</th><th>Estado</th></tr></thead><tbody>${(data.staff || []).map((member) => `<tr><td><span class="avatar">${escapeHtml(member.nombre).charAt(0).toUpperCase()}</span> ${escapeHtml(member.nombre)}</td><td>${escapeHtml(member.tipo)}</td><td>${escapeHtml(member.idioma)}</td><td>${member.activo ? statusBadge('disponible') : statusBadge('cancelada')}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Sin staff registrado</td></tr>'}</tbody></table></div></section>`;
}

Orama.routes.dashboard = dashboard;
Orama.routes.mesas = mesas;
Orama.routes.ordenes = orders;
Orama.routes.staff = staff;

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  if (action === 'cancel') {
    const confirmed = await Orama.confirm('¿Cancelar esta orden?', { danger: true, okText: 'Sí, cancelar' });
    if (!confirmed) return;
  }
  const row = button.closest('.action-row');
  (row ? row.querySelectorAll('button') : [button]).forEach((b) => { b.disabled = true; });
  try {
    if (action === 'cerrar-efectivo' || action === 'cerrar-tarjeta') {
      const amount = Number(button.dataset.total || 0);
      const payload = action === 'cerrar-tarjeta'
        ? { payment_method: 'tarjeta', amount_card: amount }
        : { payment_method: 'efectivo', amount_cash: amount };
      await api(`/api/ordenes/${id}/cerrar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else if (action === 'cancel') {
      await api(`/api/ordenes/${id}/cancelar`, { method: 'PUT' });
    }
    await render();
  } catch (error) {
    Orama.toast(error.message, 'error');
    (row ? row.querySelectorAll('button') : [button]).forEach((b) => { b.disabled = false; });
  }
});
