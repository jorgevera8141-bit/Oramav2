const PAYMENT_METHODS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'mixto', label: 'Mixto' },
  { id: 'cortesia', label: 'Cortesía' },
  { id: 'cliente_frecuente', label: 'Frecuente' }
];
const PAYMENT_LABELS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', mixto: 'Mixto', cortesia: 'Cortesía', cliente_frecuente: 'Cliente Frecuente' };
const REGIMENES_FISCALES = [
  ['601', 'General de Ley Personas Morales'],
  ['603', 'Personas Morales con Fines no Lucrativos'],
  ['605', 'Sueldos y Salarios'],
  ['606', 'Arrendamiento'],
  ['608', 'Demás ingresos'],
  ['612', 'Personas Físicas con Actividades Empresariales'],
  ['616', 'Sin obligaciones fiscales'],
  ['621', 'Incorporación Fiscal'],
  ['626', 'RESICO']
];
const USOS_CFDI = [
  ['G01', 'Adquisición de mercancías'],
  ['G03', 'Gastos en general'],
  ['P01', 'Por definir'],
  ['S01', 'Sin efectos fiscales']
];
let facturacionEnabledCache = null;
async function isFacturacionEnabled() {
  if (facturacionEnabledCache === null) {
    try { facturacionEnabledCache = !!(await api('/api/factura/status')).enabled; } catch (error) { facturacionEnabledCache = false; }
  }
  return facturacionEnabledCache;
}

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
            <button type="button" class="button" data-split-id="${order.id}" aria-label="Dividir cuenta de ${escapeHtml(order.mesa_nombre || 'Mostrador')}">Dividir</button>
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

  function wireFieldEvents(total) {
    const efectivoInput = document.getElementById('pay-efectivo');
    if (efectivoInput) {
      efectivoInput.addEventListener('input', () => {
        const received = Number(efectivoInput.value || 0);
        const diff = received - Number(total);
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
        const remaining = Number(total) - ef - ta;
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
    let redenciones = [];
    try {
      const data = await api(`/api/ordenes/${order.id}/items`);
      items = data.items || [];
      redenciones = data.redenciones || [];
    } catch (error) { /* receipt still works without items */ }
    const methodLabel = PAYMENT_LABELS[method] || method;
    const now = new Date();
    const fecha = now.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hora = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const grouped = new Map();
    items.forEach((item) => {
      const regularUnit = Number(item.precio) + Number(item.descuento_unitario || 0);
      const existing = grouped.get(item.item_nombre) || { cantidad: 0, subtotal: 0 };
      existing.cantidad += Number(item.cantidad);
      existing.subtotal += regularUnit * Number(item.cantidad);
      grouped.set(item.item_nombre, existing);
    });
    const itemsHtml = Array.from(grouped.entries()).map(([nombre, g]) => `<tr><td style="padding:3px 0;font-size:13px">x${g.cantidad} ${escapeHtml(nombre)}</td><td style="padding:3px 0;font-size:13px;text-align:right">${money.format(g.subtotal)}</td></tr>`).join('');
    const promoHtml = redenciones.length
      ? redenciones.map((r) => `<tr><td style="padding:3px 0;font-size:13px;font-style:italic;color:#0d6b54">Promo ${escapeHtml(r.nombre)}</td><td style="padding:3px 0;font-size:13px;text-align:right;color:#0d6b54">-${money.format(Number(r.descuento_aplicado))}</td></tr>`).join('')
      : '';
    const splitLine = method === 'mixto' ? `<div class="method">Efectivo: ${money.format(amountCash)} · Tarjeta: ${money.format(amountCard)}</div>` : '';
    const receiptHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo — Orama Café</title>
      <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Courier New',monospace;background:#fff;display:flex;justify-content:center;padding:20px}.receipt{width:300px;padding:20px 16px}.logo{text-align:center;font-size:22px;font-weight:700;letter-spacing:3px;font-family:Georgia,serif;color:#0d6b54;margin-bottom:12px}.divider{border-top:1px dashed #ccc;margin:10px 0}.meta{display:flex;justify-content:space-between;font-size:11px;color:#666;margin-bottom:8px}table{width:100%;border-collapse:collapse}.total-row td{font-size:15px;font-weight:700;color:#0d6b54;padding-top:8px}.method{font-size:12px;color:#666;margin-top:6px}.thanks{text-align:center;margin-top:16px;font-size:13px;color:#0d6b54;font-style:italic}.btn-row{display:flex;gap:10px;margin-top:20px;justify-content:center}.btn{padding:10px 24px;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}.btn-print{background:#0d6b54;color:#fff}.btn-close{background:#eee;color:#333}@media print{.btn-row{display:none}body{padding:0}}</style>
      </head><body><div class="receipt"><div class="logo">ORAMA CAFÉ</div><div class="divider"></div>
      <div class="meta"><span>${fecha} ${hora}</span><span>Orden #${order.id}</span></div><div class="divider"></div>
      <table>${itemsHtml}</table>${promoHtml ? `<div class="divider"></div><table>${promoHtml}</table>` : ''}<div class="divider"></div>
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

  function openFacturaFlow(order, method) {
    closeAnyModal();
    const overlay = document.createElement('div');
    overlay.className = 'orama-overlay';
    overlay.innerHTML = '<div class="orama-modal" id="factura-body" role="none" aria-modal="true"></div>';
    document.body.appendChild(overlay);
    currentOverlay = overlay;
    const body = overlay.querySelector('#factura-body');
    let lastFactura = null;
    let formaPagoTarjeta = '28';

    function setBody(html) { body.innerHTML = html; }

    function renderPrompt() {
      setBody(`<p class="orama-modal-message">🧾 ¿Facturar esta venta?</p>
        <p class="subtle" style="margin-bottom:18px">Total: ${money.format(order.total)}</p>
        <div class="orama-modal-actions"><button type="button" class="button" data-factura-skip>Omitir</button><button type="button" class="button" data-factura-start>Facturar</button></div>`);
    }

    function renderForm() {
      const regimenOpts = REGIMENES_FISCALES.map(([value, label]) => `<option value="${value}">${value} - ${escapeHtml(label)}</option>`).join('');
      const usoOpts = USOS_CFDI.map(([value, label]) => `<option value="${value}">${value} - ${escapeHtml(label)}</option>`).join('');
      const tarjetaField = method === 'tarjeta' ? `<div class="field-group"><label>¿Débito o crédito?</label><div class="filters"><button type="button" class="pill ${formaPagoTarjeta === '28' ? 'active' : ''}" data-forma-pago="28">Débito</button><button type="button" class="pill ${formaPagoTarjeta === '04' ? 'active' : ''}" data-forma-pago="04">Crédito</button></div></div>` : '';
      setBody(`<p class="orama-modal-message">Datos de facturación</p>
        <p class="subtle" style="margin-bottom:14px">Total: ${money.format(order.total)}</p>
        <button type="button" class="button" style="width:100%;margin-bottom:14px" data-factura-global>⚡ Factura Global (sin datos)</button>
        <div class="field-group"><label for="factura-rfc">RFC</label><input class="search" id="factura-rfc" maxlength="13" style="text-transform:uppercase" placeholder="XAXX010101000"></div>
        <div class="field-group"><label for="factura-razon">Razón Social / Nombre</label><input class="search" id="factura-razon" placeholder="Nombre completo o razón social"></div>
        <div class="field-group"><label for="factura-regimen">Régimen Fiscal</label><select class="search" id="factura-regimen"><option value="">Selecciona…</option>${regimenOpts}</select></div>
        <div class="field-group"><label for="factura-cp">Código Postal</label><input class="search" id="factura-cp" maxlength="5" inputmode="numeric" placeholder="20000"></div>
        <div class="field-group"><label for="factura-uso">Uso del CFDI</label><select class="search" id="factura-uso"><option value="">Selecciona…</option>${usoOpts}</select></div>
        ${tarjetaField}
        <div class="field-group"><label for="factura-email">Correo (opcional)</label><input class="search" id="factura-email" type="email" placeholder="cliente@correo.com"></div>
        <p class="subtle" id="factura-error" style="color:var(--terracotta);min-height:18px"></p>
        <div class="orama-modal-actions"><button type="button" class="button" data-factura-cancel>Cancelar</button><button type="button" class="button" data-factura-submit>Timbrar factura</button></div>`);
    }

    function renderSuccess(factura) {
      setBody(`<p class="orama-modal-message">✅ Factura timbrada</p>
        <div class="pay-highlight"><p class="pay-highlight-label">FOLIO FISCAL (UUID)</p><p class="pay-highlight-value" style="font-size:13px;word-break:break-all">${escapeHtml(factura.folio_fiscal || '—')}</p></div>
        <div class="action-row" style="margin-bottom:12px"><button type="button" class="button" data-factura-email>📧 Correo</button><button type="button" class="button" data-factura-whatsapp>📱 WhatsApp</button></div>
        <a href="/api/factura/${factura.id}/pdf" target="_blank" class="subtle" style="display:block;text-align:center;margin-bottom:12px">Ver PDF</a>
        <div class="orama-modal-actions"><button type="button" class="button" data-factura-cancel>Cerrar</button></div>`);
    }

    async function submitFactura(payload) {
      const submitButtons = body.querySelectorAll('[data-factura-submit],[data-factura-global]');
      submitButtons.forEach((button) => { button.disabled = true; });
      try {
        const result = await api('/api/factura', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orden_id: order.id, ...payload }) });
        lastFactura = result.factura;
        renderSuccess(result.factura);
      } catch (error) {
        submitButtons.forEach((button) => { button.disabled = false; });
        const errorEl = document.getElementById('factura-error');
        if (errorEl) errorEl.textContent = error.message;
      }
    }

    overlay.addEventListener('click', async (event) => {
      if (event.target === overlay || event.target.closest('[data-factura-cancel]') || event.target.closest('[data-factura-skip]')) { closeAnyModal(); return; }
      if (event.target.closest('[data-factura-start]')) { renderForm(); return; }
      const formaPagoBtn = event.target.closest('[data-forma-pago]');
      if (formaPagoBtn) { formaPagoTarjeta = formaPagoBtn.dataset.formaPago; renderForm(); return; }
      if (event.target.closest('[data-factura-global]')) { submitFactura({ tipo: 'global' }); return; }
      if (event.target.closest('[data-factura-submit]')) {
        const rfc = document.getElementById('factura-rfc').value.trim().toUpperCase();
        const razon_social = document.getElementById('factura-razon').value.trim();
        const regimen_fiscal = document.getElementById('factura-regimen').value;
        const cp = document.getElementById('factura-cp').value.trim();
        const uso_cfdi = document.getElementById('factura-uso').value;
        const email = document.getElementById('factura-email').value.trim();
        const errorEl = document.getElementById('factura-error');
        if (!rfc || !razon_social || !regimen_fiscal || !cp || !uso_cfdi) { errorEl.textContent = 'Completa todos los campos requeridos'; return; }
        if (!/^\d{5}$/.test(cp)) { errorEl.textContent = 'El código postal debe tener 5 dígitos'; return; }
        submitFactura({ tipo: 'normal', rfc, razon_social, regimen_fiscal, cp, uso_cfdi, email: email || undefined, forma_pago_tarjeta: method === 'tarjeta' ? formaPagoTarjeta : undefined });
        return;
      }
      if (event.target.closest('[data-factura-email]')) {
        const email = await Orama.prompt('Correo para reenviar la factura:', { placeholder: 'cliente@correo.com' });
        if (!email) return;
        try {
          await api(`/api/factura/${lastFactura.id}/email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
          Orama.toast('Correo enviado', 'success');
        } catch (error) { Orama.toast(error.message, 'error'); }
        return;
      }
      if (event.target.closest('[data-factura-whatsapp]')) {
        const pdfUrl = `${window.location.origin}/api/factura/${lastFactura.id}/pdf`;
        window.open(`https://wa.me/?text=${encodeURIComponent('Aquí tienes tu factura de Orama Café: ' + pdfUrl)}`, '_blank');
      }
    });

    renderPrompt();
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
      const canFacturar = Number(order.total) > 0 && method !== 'cortesia' && method !== 'cliente_frecuente' && await isFacturacionEnabled();
      if (canFacturar) openFacturaFlow(order, method);
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
    wireFieldEvents(order.total);

    overlay.addEventListener('click', (event) => {
      const methodButton = event.target.closest('[data-method]');
      if (methodButton) {
        method = methodButton.dataset.method;
        overlay.querySelectorAll('#pay-methods .pill').forEach((pill) => pill.classList.toggle('active', pill.dataset.method === method));
        document.getElementById('pay-fields').innerHTML = paymentFieldsMarkup(method, order.total);
        wireFieldEvents(order.total);
        return;
      }
      if (event.target.closest('[data-pay-cancel]') || event.target === overlay) { closeAnyModal(); return; }
      if (event.target.closest('[data-pay-confirm]')) confirmPayment(order, method);
    });
  }

  function openSplitFlow(order) {
    closeAnyModal();
    const overlay = document.createElement('div');
    overlay.className = 'orama-overlay';
    overlay.innerHTML = '<div class="orama-modal split-view" id="split-body" role="none" aria-modal="true"></div>';
    document.body.appendChild(overlay);
    currentOverlay = overlay;
    const body = overlay.querySelector('#split-body');

    let items = [];
    let persons = [];
    let personCounter = 0;
    let payingPersonId = null;
    let payingMethod = 'efectivo';

    function personSubtotal(personId) {
      return items.filter((item) => item.personId === personId).reduce((sum, item) => sum + item.precio, 0);
    }

    function renderMain() {
      const paidCount = persons.filter((p) => p.paid).length;
      const allPaid = persons.length > 0 && persons.every((p) => p.paid);
      const unassigned = items.filter((item) => !item.personId);

      const personsHtml = persons.map((person) => {
        const personItems = items.filter((item) => item.personId === person.id);
        const subtotal = personItems.reduce((sum, item) => sum + item.precio, 0);
        return `<div class="order-card" style="margin-bottom:10px">
          <div class="order-card-head"><h2 class="order-card-mesa" style="font-size:16px">${escapeHtml(person.name)}</h2><span class="mono">${money.format(subtotal)}</span></div>
          <p class="subtle" style="margin:0 0 10px">${person.paid ? '✅ Pagado' : 'Pendiente'}</p>
          ${personItems.length ? `<ul class="order-card-items">${personItems.map((item) => `<li style="justify-content:space-between"><span>${escapeHtml(item.nombre)}</span><span class="mono">${money.format(item.precio)}</span>${!person.paid ? `<button type="button" class="button danger" style="min-height:32px;width:auto;padding:2px 10px" data-unassign="${item.id}">×</button>` : ''}</li>`).join('')}</ul>` : '<p class="subtle">Sin artículos</p>'}
          ${!person.paid && subtotal > 0 ? `<button type="button" class="button" data-pay-person="${person.id}">Cobrar ${money.format(subtotal)}</button>` : ''}
        </div>`;
      }).join('');

      const unassignedHtml = unassigned.length
        ? unassigned.map((item) => `<div class="menu-item-card"><div><p class="menu-item-card-name">${escapeHtml(item.nombre)}</p><p class="menu-item-card-price">${money.format(item.precio)}</p></div><div class="filters">${persons.map((p) => `<button type="button" class="pill" data-assign-item="${item.id}" data-assign-person="${p.id}">${escapeHtml(p.name)}</button>`).join('')}</div></div>`).join('')
        : (persons.length ? '<p class="subtle">Todos los artículos asignados</p>' : '<p class="subtle">Agrega personas para asignar artículos</p>');

      body.innerHTML = `
        <p class="orama-modal-message">✂️ Dividir cuenta</p>
        <p class="subtle" style="margin-bottom:14px">Total orden: ${money.format(order.total)}</p>
        <div class="field-group">
          <label for="split-equal-n">División igualitaria</label>
          <div style="display:flex;gap:9px">
            <input class="search" id="split-equal-n" type="number" min="2" max="20" placeholder="2" style="max-width:100px">
            <button type="button" class="button" data-equal-split>Dividir en partes iguales</button>
          </div>
        </div>
        <button type="button" class="button" style="width:100%;margin-bottom:14px" data-add-person>+ Agregar persona</button>
        <div id="split-persons">${personsHtml || '<p class="subtle">Sin personas agregadas</p>'}</div>
        <p class="eyebrow" style="margin-top:14px">Artículos sin asignar</p>
        <div id="split-unassigned">${unassignedHtml}</div>
        <p class="subtle" style="text-align:center;margin:14px 0">${paidCount} de ${persons.length} pagado${persons.length !== 1 ? 's' : ''}</p>
        <div class="orama-modal-actions">
          <button type="button" class="button" data-split-close>Cerrar</button>
          <button type="button" class="button" data-close-split-order ${allPaid && unassigned.length === 0 && persons.length > 0 ? '' : 'disabled'}>Cerrar orden completa</button>
        </div>`;
    }

    function renderPersonPayment() {
      const person = persons.find((p) => p.id === payingPersonId);
      const subtotal = personSubtotal(payingPersonId);
      body.innerHTML = `
        <p class="subtle" style="margin:0 0 4px">${escapeHtml(person.name)}</p>
        <p class="orama-modal-message" style="font:700 28px 'JetBrains Mono',monospace;color:var(--cream)">${money.format(subtotal)}</p>
        <div class="filters" id="split-pay-methods" style="margin-bottom:16px">${PAYMENT_METHODS.map((m) => `<button type="button" class="pill ${m.id === payingMethod ? 'active' : ''}" data-split-method="${m.id}">${m.label}</button>`).join('')}</div>
        <div id="pay-fields">${paymentFieldsMarkup(payingMethod, subtotal)}</div>
        <div class="orama-modal-actions">
          <button type="button" class="button" data-split-pay-cancel>Cancelar</button>
          <button type="button" class="button" data-split-pay-confirm>Confirmar cobro</button>
        </div>`;
      wireFieldEvents(subtotal);
    }

    function confirmPersonPayment() {
      const person = persons.find((p) => p.id === payingPersonId);
      const subtotal = personSubtotal(payingPersonId);
      let amount_cash = 0;
      let amount_card = 0;
      if (payingMethod === 'efectivo') {
        const received = Number(document.getElementById('pay-efectivo')?.value || 0);
        if (received < subtotal) { Orama.toast('La cantidad recibida es menor al total', 'warning'); return; }
        amount_cash = subtotal;
      } else if (payingMethod === 'tarjeta') {
        amount_card = subtotal;
      } else if (payingMethod === 'mixto') {
        const ef = Number(document.getElementById('pay-mixto-efectivo')?.value || 0);
        const ta = Number(document.getElementById('pay-mixto-tarjeta')?.value || 0);
        if (ef + ta < subtotal) { Orama.toast('La suma no cubre el total', 'warning'); return; }
        amount_cash = ef;
        amount_card = ta;
      }
      person.paid = true;
      person.pago = { payment_method: payingMethod, amount_cash, amount_card, persona_nombre: person.name };
      Orama.toast(`${person.name}: cobro registrado`, 'success');
      payingPersonId = null;
      renderMain();
    }

    async function closeSplitOrder() {
      const button = body.querySelector('[data-close-split-order]');
      if (button) { button.disabled = true; button.textContent = 'Cerrando…'; }
      try {
        const pagos = persons.map((p) => p.pago).filter(Boolean);
        await api(`/api/ordenes/${order.id}/cerrar`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pagos }) });
        closeAnyModal();
        Orama.toast('Orden dividida cerrada correctamente', 'success');
        await loadActivas();
      } catch (error) {
        Orama.toast(error.message, 'error');
        if (button) { button.disabled = false; button.textContent = 'Cerrar orden completa'; }
      }
    }

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-split-close]')) { closeAnyModal(); return; }
      if (event.target.closest('[data-add-person]')) {
        personCounter += 1;
        persons.push({ id: personCounter, name: `Persona ${personCounter}`, paid: false, pago: null });
        renderMain();
        return;
      }
      if (event.target.closest('[data-equal-split]')) {
        const n = Number(document.getElementById('split-equal-n')?.value || 0);
        if (n < 2) { Orama.toast('Mínimo 2 personas', 'warning'); return; }
        persons = [];
        personCounter = 0;
        for (let i = 0; i < n; i++) { personCounter += 1; persons.push({ id: personCounter, name: `Persona ${personCounter}`, paid: false, pago: null }); }
        items.forEach((item, index) => { item.personId = persons[index % n].id; });
        renderMain();
        return;
      }
      const assignBtn = event.target.closest('[data-assign-item]');
      if (assignBtn) {
        const item = items.find((i) => i.id === assignBtn.dataset.assignItem);
        if (item) item.personId = Number(assignBtn.dataset.assignPerson);
        renderMain();
        return;
      }
      const unassignBtn = event.target.closest('[data-unassign]');
      if (unassignBtn) {
        const item = items.find((i) => i.id === unassignBtn.dataset.unassign);
        if (item) item.personId = null;
        renderMain();
        return;
      }
      const payPersonBtn = event.target.closest('[data-pay-person]');
      if (payPersonBtn) { payingPersonId = Number(payPersonBtn.dataset.payPerson); payingMethod = 'efectivo'; renderPersonPayment(); return; }
      const splitMethodBtn = event.target.closest('[data-split-method]');
      if (splitMethodBtn) { payingMethod = splitMethodBtn.dataset.splitMethod; renderPersonPayment(); return; }
      if (event.target.closest('[data-split-pay-cancel]')) { payingPersonId = null; renderMain(); return; }
      if (event.target.closest('[data-split-pay-confirm]')) { confirmPersonPayment(); return; }
      const closeSplitBtn = event.target.closest('[data-close-split-order]');
      if (closeSplitBtn && !closeSplitBtn.disabled) closeSplitOrder();
    });

    (async () => {
      try {
        const data = await api(`/api/ordenes/${order.id}/items`);
        const raw = data.items || [];
        raw.forEach((rawItem) => {
          for (let i = 0; i < Number(rawItem.cantidad); i++) items.push({ id: `${rawItem.id}_${i}`, nombre: rawItem.item_nombre, precio: Number(rawItem.precio), personId: null });
        });
        renderMain();
      } catch (error) {
        body.innerHTML = `<div class="error" role="alert">${escapeHtml(error.message)}</div>`;
      }
    })();
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
    const splitButton = event.target.closest('[data-split-id]');
    if (splitButton) {
      const order = activasCache.find((o) => o.id === Number(splitButton.dataset.splitId));
      if (order) openSplitFlow(order);
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
