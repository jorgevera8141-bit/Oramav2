async function barra() {
  let doneCount = 0;
  let pollTimer = null;
  let clockTimer = null;

  function updateClock() {
    const el = document.getElementById('barra-clock');
    if (el) el.textContent = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }

  function elapsed(createdAt) {
    const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    const label = minutes < 1 ? 'ahora' : minutes === 1 ? '1 min' : `${minutes} min`;
    return { label, minutes };
  }

  async function loadOrders() {
    const grid = document.getElementById('barra-grid');
    if (!grid) return;
    try {
      const data = await api('/api/ordenes');
      // Ready orders stay open for the cashier to collect; the bar only lists what still needs making.
      const orders = (data.ordenes || []).filter((order) => order.status === 'abierta' && !order.listo_at);
      const pendingEl = document.getElementById('barra-pending');
      if (pendingEl) pendingEl.textContent = orders.length;
      if (!orders.length) {
        grid.innerHTML = '<div class="empty">Sin órdenes pendientes</div>';
        return;
      }
      const cards = await Promise.all(orders.map(async (order) => {
        const itemsData = await api(`/api/ordenes/${order.id}/items`);
        const items = itemsData.items || [];
        const { label, minutes } = elapsed(order.created_at);
        const urgent = minutes >= 10;
        return `<article class="order-card ${urgent ? 'urgent' : ''}">
          <div class="order-card-head"><h2 class="order-card-mesa">${escapeHtml(order.mesa_nombre || 'Mostrador')}</h2><span class="badge ${urgent ? 'urgent' : 'available'}">${label}</span></div>
          <ul class="order-card-items">${items.length ? items.map((item) => `<li><span class="order-card-qty">x${item.cantidad}</span><span>${escapeHtml(item.item_nombre)}</span></li>`).join('') : '<li>Sin artículos</li>'}</ul>
          <button type="button" class="button" data-listo-id="${order.id}" aria-label="Marcar orden de ${escapeHtml(order.mesa_nombre || 'Mostrador')} como lista">Listo — Entregar</button>
        </article>`;
      }));
      grid.innerHTML = cards.join('');
    } catch (error) {
      grid.innerHTML = `<div class="error" role="alert">${escapeHtml(error.message)}</div>`;
    }
  }

  async function onGridClick(event) {
    const button = event.target.closest('[data-listo-id]');
    if (!button || button.disabled) return;
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = 'Marcando…';
    try {
      await api(`/api/ordenes/${button.dataset.listoId}/listo`, { method: 'PUT' });
      doneCount += 1;
      const doneEl = document.getElementById('barra-done');
      if (doneEl) doneEl.textContent = doneCount;
      Orama.toast('Orden marcada como lista', 'success');
      await loadOrders();
    } catch (error) {
      Orama.toast(error.message, 'error');
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  app.innerHTML = pageHead('Barra', 'Órdenes en preparación', 'Se actualiza automáticamente cada 30 segundos') +
    `<section class="status-strip" aria-label="Estado de la barra">
      <p class="status-strip-item"><span class="status-strip-value" id="barra-pending">0</span> pendientes</p>
      <p class="status-strip-item"><span class="status-strip-value" id="barra-done">0</span> entregadas hoy</p>
      <p class="status-strip-item"><span class="status-strip-value" id="barra-clock">--:--</span></p>
      <button type="button" class="button" data-refresh>Actualizar</button>
    </section>
    <section class="panel"><div id="barra-grid" class="orders-board">${loading}</div></section>`;

  document.getElementById('barra-grid').addEventListener('click', onGridClick);
  document.querySelector('[data-refresh]').addEventListener('click', loadOrders);

  updateClock();
  clockTimer = setInterval(updateClock, 1000);
  await loadOrders();
  pollTimer = setInterval(loadOrders, 30000);

  return () => {
    clearInterval(clockTimer);
    clearInterval(pollTimer);
  };
}

Orama.routes.barra = barra;
