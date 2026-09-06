const PAYMENT_METHODS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'mixto', label: 'Mixto' },
  { id: 'cortesia', label: 'Cortesía' },
  { id: 'cliente_frecuente', label: 'Frecuente' }
];
const PAYMENT_LABELS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', mixto: 'Mixto', cortesia: 'Cortesía', cliente_frecuente: 'Cliente Frecuente' };

async function cashier() {
  let activasCache = [];
  let currentOverlay = null;

  function closeAnyModal() {
    if (currentOverlay) { currentOverlay.remove(); currentOverlay = null; }
  }

  async function loadActivas() {
    const container = document.getElementById('caja-activas');
    if (!container) return;
    try {
      const data = await api('/api/ordenes');
      activasCache = (data.ordenes || []).filter((order) => order.status === 'abierta');
      container.innerHTML = activasCache.length ? activasCache.map((order) => `<article class="order-card">
          <div class="order-card-head"><h2 class="order-card-mesa">${escapeHtml(order.mesa_nombre || 'Mostrador')}</h2><span class="mono">${money.format(Number(order.total || 0))}</span></div>
          <p class="subtle" style="margin:0 0 12px">${new Date(order.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>
          <div class="action-row">
            <button type="button" class="button" data-pay-id="${order.id}" aria-label="Cobrar orden de ${escapeHtml(order.mesa_nombre || 'Mostrador')}">Cobrar</button>
            <button type="button" class="button danger" data-cancel-id="${order.id}" aria-label="Cancelar orden de ${escapeHtml(order.mesa_nombre || 'Mostrador')}">Cancelar</button>
          </div>
        </article>`).join('') : '<div class="empty">No hay órdenes activas</div>';
    } catch (error) {
      container.innerHTML = `<div class="error" role="alert">${escapeHtml(error.message)}</div>`;
    }
  }

  async function loadHoy() {
    const container = document.getElementById('caja-hoy');
    if (!container) return;
    try {
      const data = await api('/api/ordenes/dia');
      container.innerHTML = orderTable(data.ordenes || []);
    } catch (error) {
      container.innerHTML = `<div class="error" role="alert">${escapeHtml(error.message)}</div>`;
    }
  }

  function switchTab(tab) {
    document.getElementById('caja-tab-activas').classList.toggle('active', tab === 'activas');
    document.getElementById('caja-tab-hoy').classList.toggle('active', tab === 'hoy');
    document.getElementById('caja-activas').hidden = tab !== 'activas';
    document.getElementById('caja-hoy').hidden = tab !== 'hoy';
    if (tab === 'hoy') loadHoy();
  }

  function paymentFieldsMarkup(method, total) {
    if (method === 'efectivo') {
      return `<div class="field-group"><label for="pay-efectivo">Cantidad recibida</label><input class="search" id="pay-efectivo" type="number" step="0.01" min="0" placeholder="0.00"></div>
        <div class="pay-highlight"><p class="pay-highlight-label">Cambio a entregar</p><p class="pay-highlight-value" id="pay-cambio">${money.format(0)}</p></div>`;
    }
    if (method === 'tarjeta') {
      return `<div class="pay-highlight"><p class="pay-highlight-label">Cobrar con tarjeta</p><p class="pay-highlight-value">${money.format(total)}</p></div>`;
    }
    if (method === 'mixto') {
      return `<div class="field-group"><label for="pay-mixto-efectivo">Efectivo</label><input class="search" id="pay-mixto-efectivo" type="number" step="0.01" min="0" placeholder="0.00"></div>
        <div class="field-group"><label for="pay-mixto-tarjeta">Tarjeta</label><input class="search" id="pay-mixto-tarjeta" type="number" step="0.01" min="0" placeholder="0.00"></div>
        <div class="pay-highlight"><p class="pay-highlight-label">Restante / cambio</p><p class="pay-highlight-value" id="pay-mixto-restante">${money.format(0)}</p></div>`;
    }
    if (method === 'cortesia') {
      return `<div class="field-group"><label for="pay-nota">Motivo (opcional)</label><input class="search" id="pay-nota" type="text" placeholder="Ej. Error en orden, cliente especial…"></div>
        <div class="pay-highlight"><p class="pay-highlight-label">Orden sin cargo</p><p class="pay-highlight-value">Cortesía</p></div>`;
    }
    return `<div class="field-group"><label for="pay-nota">Producto cortesía</label><input class="search" id="pay-nota" type="text" placeholder="Ej. Espresso, Café Americano…"></div>
      <div class="pay-highlight"><p class="pay-highlight-label">Cliente frecuente</p><p class="pay-highlight-value">Sin cargo</p></div>`;
  }

  function wireFieldEvents(order) {
    const efectivoInput = document.getElementById('pay-efectivo');
    if (efectivoInput) {
      efectivoInput.addEventListener('input', () => {
        const received = Number(efectivoInput.value || 0);
        const diff = received - Number(order.total);
        const el = document.getElementById('pay-cambio');
        el.textContent = `${money.format(Math.abs(diff))}${diff < 0 ? ' (faltan)' : ''}`;
        el.classList.toggle('negative', diff < 0);
      });
    }
    const mixtoEfectivo = document.getElementById('pay-mixto-efectivo');
    const mixtoTarjeta = document.getElementById('pay-mixto-tarjeta');
    if (mixtoEfectivo && mixtoTarjeta) {
      const recalc = () => {
        const ef = Number(mixtoEfectivo.value || 0);
        const ta = Number(mixtoTarjeta.value || 0);
        const remaining = Number(order.total) - ef - ta;
        const el = document.getElementById('pay-mixto-restante');
        el.textContent = remaining > 0 ? `${money.format(remaining)} pendiente` : remaining < 0 ? `${money.format(Math.abs(remaining))} cambio` : '✔ exacto';
        el.classList.toggle('negative', remaining > 0);
      };
      mixtoEfectivo.addEventListener('input', recalc);
      mixtoTarjeta.addEventListener('input', recalc);
    }
  }

  async function showReceipt(order, method, amountCash, amountCard) {
    let items = [];
    try { items = (await api(`/api/ordenes/${order.id}/items`)).items || []; } catch (error) { /* receipt still works without items */ }
    const methodLabel = PAYMENT_LABELS[method] || method;
    const now = new Date();
    const fecha = now.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hora = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const itemsHtml = items.map((item) => `<tr><td style="padding:3px 0;font-size:13px">x${item.cantidad} ${escapeHtml(item.item_nombre)}</td><td style="padding:3px 0;font-size:13px;text-align:right">${money.format(Number(item.precio) * Number(item.cantidad))}</td></tr>`).join('');
    const splitLine = method === 'mixto' ? `<div class="method">Efectivo: ${money.format(amountCash)} · Tarjeta: ${money.format(amountCard)}</div>` : '';
    const receiptHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo — Orama Café</title>
      <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Courier New',monospace;background:#fff;display:flex;justify-content:center;padding:20px}.receipt{width:300px;padding:20px 16px}.logo{text-align:center;font-size:22px;font-weight:700;letter-spacing:3px;font-family:Georgia,serif;color:#0d6b54;margin-bottom:12px}.divider{border-top:1px dashed #ccc;margin:10px 0}.meta{display:flex;justify-content:space-between;font-size:11px;color:#666;margin-bottom:8px}table{width:100%;border-collapse:collapse}.total-row td{font-size:15px;font-weight:700;color:#0d6b54;padding-top:8px}.method{font-size:12px;color:#666;margin-top:6px}.thanks{text-align:center;margin-top:16px;font-size:13px;color:#0d6b54;font-style:italic}.btn-row{display:flex;gap:10px;margin-top:20px;justify-content:center}.btn{padding:10px 24px;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}.btn-print{background:#0d6b54;color:#fff}.btn-close{background:#eee;color:#333}@media print{.btn-row{display:none}body{padding:0}}</style>
      </head><body><div class="receipt"><div class="logo">ORAMA CAFÉ</div><div class="divider"></div>
      <div class="meta"><span>${fecha} ${hora}</span><span>Orden #${order.id}</span></div><div class="divider"></div>
      <table>${itemsHtml}</table><div class="divider"></div>
      <table><tr class="total-row"><td>TOTAL</td><td style="text-align:right">${money.format(order.total)}</td></tr></table>
      ${splitLine}<div class="method">Método: ${methodLabel}</div><div class="divider"></div>
      <div class="thanks">¡Gracias por tu visita!<br>Vuelve pronto</div>
      <div class="btn-row"><button class="btn btn-print" onclick="window.print()">Imprimir</button><button class="btn btn-close" onclick="window.close()">Cerrar</button></div>
      </div></body></html>`;
    const win = window.open('', '_blank', 'width=360,height=600');
    if (win) { win.document.write(receiptHtml); win.document.close(); }
    else {
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:500;overflow-y:auto;padding:20px';
      modal.innerHTML = receiptHtml + '<button onclick="this.parentElement.remove()" style="position:fixed;top:10px;right:10px;background:#0d6b54;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:14px;cursor:pointer">Cerrar</button>';
      document.body.appendChild(modal);
    }
  }

  async function confirmPayment(order, method) {
    let amount_cash = 0;
    let amount_card = 0;
    let notas = '';

    if (method === 'efectivo') {
      const received = Number(document.getElementById('pay-efectivo')?.value || 0);
      if (received < Number(order.total)) { Orama.toast('La cantidad recibida es menor al total', 'warning'); return; }
      amount_cash = Number(order.total);
    } else if (method === 'tarjeta') {
      amount_card = Number(order.total);
    } else if (method === 'mixto') {
      const ef = Number(document.getElementById('pay-mixto-efectivo')?.value || 0);
      const ta = Number(document.getElementById('pay-mixto-tarjeta')?.value || 0);
      if (ef + ta < Number(order.total)) { Orama.toast('La suma no cubre el total', 'warning'); return; }
      amount_cash = ef;
      amount_card = ta;
    } else {
      notas = document.getElementById('pay-nota')?.value || '';
    }

    const confirmButton = document.querySelector('[data-pay-confirm]');
    confirmButton.disabled = true;
    confirmButton.textContent = 'Procesando…';
    try {
      await api(`/api/ordenes/${order.id}/cerrar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: method, amount_cash, amount_card, notas })
      });
      closeAnyModal();
      Orama.toast(`Cobro registrado — ${money.format(order.total)}`, 'success');
      await showReceipt(order, method, amount_cash, amount_card);
      await loadActivas();
    } catch (error) {
      Orama.toast(error.message, 'error');
      confirmButton.disabled = false;
      confirmButton.textContent = 'Confirmar cobro';
    }
  }

  function renderPaymentModal(order) {
    closeAnyModal();
    let method = 'efectivo';
    const overlay = document.createElement('div');
    overlay.className = 'orama-overlay';
    overlay.innerHTML = `<div class="orama-modal" role="none" aria-modal="true">
        <p class="subtle" style="margin:0 0 4px">${escapeHtml(order.mesa_nombre || 'Mostrador')}</p>
        <p class="orama-modal-message" style="font:700 28px 'JetBrains Mono',monospace;color:var(--cream)">${money.format(order.total)}</p>
        <div class="filters" id="pay-methods" style="margin-bottom:16px">${PAYMENT_METHODS.map((m, i) => `<button type="button" class="pill ${i === 0 ? 'active' : ''}" data-method="${m.id}">${m.label}</button>`).join('')}</div>
        <div id="pay-fields">${paymentFieldsMarkup(method, order.total)}</div>
        <div class="orama-modal-actions">
          <button type="button" class="button" data-pay-cancel>Cancelar</button>
          <button type="button" class="button" data-pay-confirm>Confirmar cobro</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    currentOverlay = overlay;
    wireFieldEvents(order);

    overlay.addEventListener('click', (event) => {
      const methodButton = event.target.closest('[data-method]');
      if (methodButton) {
        method = methodButton.dataset.method;
        overlay.querySelectorAll('#pay-methods .pill').forEach((pill) => pill.classList.toggle('active', pill.dataset.method === method));
        document.getElementById('pay-fields').innerHTML = paymentFieldsMarkup(method, order.total);
        wireFieldEvents(order);
        return;
      }
      if (event.target.closest('[data-pay-cancel]') || event.target === overlay) { closeAnyModal(); return; }
      if (event.target.closest('[data-pay-confirm]')) confirmPayment(order, method);
    });
  }

  async function cancelOrder(id) {
    const motivo = await Orama.prompt('Motivo de cancelación (opcional):', { placeholder: 'Opcional' });
    if (motivo === null) return;
    try {
      await api(`/api/ordenes/${id}/cancelar`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) });
      Orama.toast('Orden cancelada', 'success');
      await loadActivas();
    } catch (error) {
      Orama.toast(error.message, 'error');
    }
  }

  function onAppClick(event) {
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) { switchTab(tabButton.dataset.tab); return; }
    const payButton = event.target.closest('[data-pay-id]');
    if (payButton) {
      const order = activasCache.find((o) => o.id === Number(payButton.dataset.payId));
      if (order) renderPaymentModal(order);
      return;
    }
    const cancelButton = event.target.closest('[data-cancel-id]');
    if (cancelButton) cancelOrder(Number(cancelButton.dataset.cancelId));
  }

  app.innerHTML = pageHead('Caja', 'Cobros', 'Cobra, cancela o revisa las órdenes del día') +
    `<div class="tab-bar"><button type="button" class="tab-btn active" id="caja-tab-activas" data-tab="activas">Activas</button><button type="button" class="tab-btn" id="caja-tab-hoy" data-tab="hoy">Hoy</button></div>
    <section id="caja-activas" class="orders-board"></section>
    <section id="caja-hoy" class="panel" hidden></section>`;

  app.addEventListener('click', onAppClick);
  await loadActivas();

  return () => {
    app.removeEventListener('click', onAppClick);
    closeAnyModal();
  };
}

Orama.routes.caja = cashier;
