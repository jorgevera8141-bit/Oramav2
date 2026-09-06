const PROMO_ESTADO_LABELS = {
  DRAFT: 'Borrador',
  PENDING_APPROVAL: 'Pendiente de aprobación',
  CHANGES_REQUESTED: 'Cambios solicitados',
  APPROVED: 'Aprobada',
  SCHEDULED: 'Programada',
  ACTIVE: 'Activa',
  EXPIRED: 'Expirada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada'
};
const PROMO_ESTADO_CLASS = {
  DRAFT: 'neutral', PENDING_APPROVAL: 'warn', CHANGES_REQUESTED: 'warn', APPROVED: 'neutral',
  SCHEDULED: 'neutral', ACTIVE: 'live', EXPIRED: 'muted', REJECTED: 'danger', CANCELLED: 'danger'
};
const PROMO_TIPO_LABELS = {
  precio_fijo: 'Precio fijo / combo',
  descuento_porcentaje: '% de descuento',
  compra_x_lleva_y: 'Compra X, lleva Y'
};

function promoEstadoBadge(estado) {
  const label = PROMO_ESTADO_LABELS[estado] || estado;
  const cls = PROMO_ESTADO_CLASS[estado] || 'neutral';
  return `<span class="badge-estado ${cls}">${escapeHtml(label)}</span>`;
}

function promoResumenPrecio(promo) {
  if (promo.tipo === 'precio_fijo') return money.format(Number(promo.precio_promocional));
  if (promo.tipo === 'descuento_porcentaje') return `${Number(promo.porcentaje_descuento)}% OFF`;
  if (promo.tipo === 'compra_x_lleva_y') return `Compra ${promo.compra_cantidad}, lleva ${promo.lleva_cantidad} al ${Number(promo.lleva_descuento_pct)}% OFF`;
  return '';
}

function promoFieldsMarkup(promo = {}, menuItems, staffList, prefix = 'promo') {
  const tipo = promo.tipo || 'precio_fijo';
  const categorias = [...new Set(menuItems.map((m) => m.categoria))];
  const productOptions = (selectedIds) => menuItems.map((m) =>
    `<option value="${m.id}" ${selectedIds && selectedIds.includes(m.id) ? 'selected' : ''}>${escapeHtml(m.nombre)} (${escapeHtml(m.categoria)})</option>`
  ).join('');

  return `
    <div class="field-group"><label for="${prefix}-nombre">Nombre de la promoción</label><input class="search" id="${prefix}-nombre" type="text" maxlength="120" value="${escapeHtml(promo.nombre || '')}" required></div>
    <div class="field-group"><label for="${prefix}-descripcion">Descripción</label><input class="search" id="${prefix}-descripcion" type="text" maxlength="500" value="${escapeHtml(promo.descripcion || '')}"></div>
    <div class="field-group"><label for="${prefix}-tipo">Tipo de promoción</label>
      <select class="search" id="${prefix}-tipo" data-promo-tipo>
        ${Object.entries(PROMO_TIPO_LABELS).map(([value, label]) => `<option value="${value}" ${tipo === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </div>
    <div class="promo-type-fields" data-tipo-fields="precio_fijo" ${tipo === 'precio_fijo' ? '' : 'hidden'}>
      <div class="field-group"><label for="${prefix}-producto-ids-fijo">Producto(s) (combo si eliges más de uno)</label>
        <select class="search" id="${prefix}-producto-ids-fijo" multiple size="5">${productOptions(promo.producto_ids)}</select>
      </div>
      <div class="field-group"><label for="${prefix}-precio-promo">Precio promocional</label><input class="search" id="${prefix}-precio-promo" type="number" min="0.01" step="0.01" value="${promo.precio_promocional || ''}"></div>
    </div>
    <div class="promo-type-fields" data-tipo-fields="descuento_porcentaje" ${tipo === 'descuento_porcentaje' ? '' : 'hidden'}>
      <div class="field-group"><label for="${prefix}-categoria">Categoría (o elige productos específicos abajo)</label>
        <select class="search" id="${prefix}-categoria"><option value="">— Ninguna —</option>${categorias.map((c) => `<option value="${escapeHtml(c)}" ${promo.categoria === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
      </div>
      <div class="field-group"><label for="${prefix}-producto-ids-pct">Producto(s) específicos</label>
        <select class="search" id="${prefix}-producto-ids-pct" multiple size="5">${productOptions(promo.producto_ids)}</select>
      </div>
      <div class="field-group"><label for="${prefix}-porcentaje">Porcentaje de descuento</label><input class="search" id="${prefix}-porcentaje" type="number" min="0" max="100" step="1" value="${promo.porcentaje_descuento || ''}"></div>
    </div>
    <div class="promo-type-fields" data-tipo-fields="compra_x_lleva_y" ${tipo === 'compra_x_lleva_y' ? '' : 'hidden'}>
      <div class="field-group"><label for="${prefix}-producto-ids-bxy">Producto(s) que activan la promo</label>
        <select class="search" id="${prefix}-producto-ids-bxy" multiple size="5">${productOptions(promo.producto_ids)}</select>
      </div>
      <div class="field-group"><label for="${prefix}-compra-cantidad">Compra cantidad</label><input class="search" id="${prefix}-compra-cantidad" type="number" min="1" step="1" value="${promo.compra_cantidad || ''}"></div>
      <div class="field-group"><label for="${prefix}-lleva-producto">Producto que se obtiene</label>
        <select class="search" id="${prefix}-lleva-producto"><option value="">— Selecciona —</option>${menuItems.map((m) => `<option value="${m.id}" ${promo.lleva_producto_id === m.id ? 'selected' : ''}>${escapeHtml(m.nombre)}</option>`).join('')}</select>
      </div>
      <div class="field-group"><label for="${prefix}-lleva-cantidad">Lleva cantidad</label><input class="search" id="${prefix}-lleva-cantidad" type="number" min="1" step="1" value="${promo.lleva_cantidad || ''}"></div>
      <div class="field-group"><label for="${prefix}-lleva-pct">% de descuento en el producto obtenido (100 = gratis)</label><input class="search" id="${prefix}-lleva-pct" type="number" min="0" max="100" step="1" value="${promo.lleva_descuento_pct ?? 100}"></div>
    </div>
    <div class="field-group"><label for="${prefix}-fecha-inicio">Fecha de inicio</label><input class="search" id="${prefix}-fecha-inicio" type="date" value="${(promo.fecha_inicio || '').slice(0, 10)}" required></div>
    <div class="field-group"><label for="${prefix}-hora-inicio">Hora de inicio (opcional)</label><input class="search" id="${prefix}-hora-inicio" type="time" value="${promo.hora_inicio ? promo.hora_inicio.slice(0, 5) : ''}"></div>
    <div class="field-group"><label for="${prefix}-fecha-fin">Fecha de expiración</label><input class="search" id="${prefix}-fecha-fin" type="date" value="${(promo.fecha_fin || '').slice(0, 10)}" required></div>
    <div class="field-group"><label for="${prefix}-hora-fin">Hora de expiración (opcional)</label><input class="search" id="${prefix}-hora-fin" type="time" value="${promo.hora_fin ? promo.hora_fin.slice(0, 5) : ''}"></div>
    <div class="field-group"><label for="${prefix}-limite">Límite de unidades (opcional)</label><input class="search" id="${prefix}-limite" type="number" min="1" step="1" value="${promo.limite_unidades || ''}"></div>
    <div class="field-group"><label for="${prefix}-condiciones">Condiciones</label><input class="search" id="${prefix}-condiciones" type="text" maxlength="500" value="${escapeHtml(promo.condiciones || '')}"></div>
    <div class="field-group"><label for="${prefix}-imagen">URL de imagen (opcional)</label><input class="search" id="${prefix}-imagen" type="text" maxlength="300" value="${escapeHtml(promo.imagen_url || '')}"></div>
    <div class="field-group checkbox-field"><label><input type="checkbox" id="${prefix}-apilable" ${promo.apilable ? 'checked' : ''}> Permitir combinar con otras promociones (apilable)</label></div>
    <div class="field-group"><label for="${prefix}-creado-por">Creada por</label>
      <select class="search" id="${prefix}-creado-por">${staffList.map((s) => `<option value="${escapeHtml(s.nombre)}" ${promo.creado_por === s.nombre ? 'selected' : ''}>${escapeHtml(s.nombre)}</option>`).join('')}</select>
    </div>`;
}

function readPromoFields(prefix = 'promo') {
  const val = (id) => document.getElementById(`${prefix}-${id}`)?.value;
  const multiVal = (id) => Array.from(document.getElementById(`${prefix}-${id}`)?.selectedOptions || []).map((o) => Number(o.value));
  const tipo = val('tipo');
  const base = {
    nombre: val('nombre'), descripcion: val('descripcion') || undefined, tipo,
    fecha_inicio: val('fecha-inicio'), hora_inicio: val('hora-inicio') || undefined,
    fecha_fin: val('fecha-fin'), hora_fin: val('hora-fin') || undefined,
    limite_unidades: val('limite') ? Number(val('limite')) : undefined,
    condiciones: val('condiciones') || undefined,
    imagen_url: val('imagen') || undefined,
    apilable: document.getElementById(`${prefix}-apilable`)?.checked || false,
    creado_por: val('creado-por')
  };
  if (tipo === 'precio_fijo') {
    return { ...base, producto_ids: multiVal('producto-ids-fijo'), precio_promocional: Number(val('precio-promo')) };
  }
  if (tipo === 'descuento_porcentaje') {
    const productoIds = multiVal('producto-ids-pct');
    return {
      ...base,
      producto_ids: productoIds.length ? productoIds : undefined,
      categoria: productoIds.length ? undefined : (val('categoria') || undefined),
      porcentaje_descuento: Number(val('porcentaje'))
    };
  }
  return {
    ...base,
    producto_ids: multiVal('producto-ids-bxy'),
    compra_cantidad: Number(val('compra-cantidad')),
    lleva_producto_id: Number(val('lleva-producto')),
    lleva_cantidad: Number(val('lleva-cantidad')),
    lleva_descuento_pct: Number(val('lleva-pct'))
  };
}

function wireTipoSwitcher(prefix = 'promo') {
  const select = document.getElementById(`${prefix}-tipo`);
  select?.addEventListener('change', () => {
    document.querySelectorAll(`[data-tipo-fields]`).forEach((el) => {
      el.hidden = el.dataset.tipoFields !== select.value;
    });
  });
}

function promoCard(promo) {
  return `<article class="glass-card promo-card">
    <div class="promo-card-head">
      <h3>${escapeHtml(promo.nombre)}</h3>
      ${promoEstadoBadge(promo.estado)}
    </div>
    <p class="subtle">${escapeHtml(PROMO_TIPO_LABELS[promo.tipo] || promo.tipo)} · ${escapeHtml(promoResumenPrecio(promo))}</p>
    ${promo.descripcion ? `<p>${escapeHtml(promo.descripcion)}</p>` : ''}
    <p class="mono subtle">${escapeHtml((promo.fecha_inicio || '').slice(0, 10))} → ${escapeHtml((promo.fecha_fin || '').slice(0, 10))}</p>
    <p class="subtle">Creada por ${escapeHtml(promo.creado_por)} · ${escapeHtml((promo.created_at || '').slice(0, 10))}</p>
    <div class="action-row">
      ${['DRAFT', 'CHANGES_REQUESTED'].includes(promo.estado) ? `<button type="button" class="button" data-edit-promo="${promo.id}">Editar</button>` : ''}
      ${['DRAFT', 'CHANGES_REQUESTED'].includes(promo.estado) ? `<button type="button" class="button" data-submit-promo="${promo.id}">Enviar a revisión</button>` : ''}
      ${promo.estado === 'DRAFT' ? `<button type="button" class="button danger" data-delete-promo="${promo.id}">Eliminar</button>` : ''}
      ${promo.estado === 'PENDING_APPROVAL' ? `<button type="button" class="button" data-review-promo="${promo.id}">Revisar</button>` : ''}
      ${['APPROVED', 'SCHEDULED'].includes(promo.estado) ? `<button type="button" class="button" data-activate-promo="${promo.id}">Activar ahora</button>` : ''}
      ${promo.estado === 'ACTIVE' ? `<button type="button" class="button danger" data-deactivate-promo="${promo.id}">Desactivar</button>` : ''}
    </div>
  </article>`;
}

async function promociones() {
  let promos = [];
  let menuItems = [];
  let staffList = [];
  let currentOverlay = null;
  let activeTab = 'activa';

  function closeAnyModal() {
    if (currentOverlay) { currentOverlay.remove(); currentOverlay = null; }
  }

  async function loadAll() {
    const [promoData, menuData, staffData] = await Promise.all([
      api('/api/promotions'), api('/api/menu'), api('/api/staff/active')
    ]);
    promos = promoData.promociones || [];
    menuItems = (menuData.menu || []).filter((m) => m.activo);
    staffList = staffData.staff || [];
  }

  function renderTabContent() {
    const container = document.getElementById('promo-tab-content');
    if (activeTab === 'activa') {
      const activa = promos.find((p) => p.estado === 'ACTIVE');
      container.innerHTML = activa
        ? `<section class="promo-hero glass-card">
            ${activa.imagen_url ? `<div class="promo-hero-image" style="background-image:url('${escapeHtml(activa.imagen_url)}')"></div>` : ''}
            <div class="promo-hero-body">
              <p class="eyebrow">Promo del día</p>
              <h2>${escapeHtml(activa.nombre)}</h2>
              <p class="promo-hero-price">${escapeHtml(promoResumenPrecio(activa))}</p>
              ${activa.condiciones ? `<p class="subtle">${escapeHtml(activa.condiciones)}</p>` : ''}
              <div class="action-row"><button type="button" class="button danger" data-deactivate-promo="${activa.id}">Desactivar</button></div>
            </div>
          </section>`
        : `<div class="empty">Sin promoción activa hoy. Crea una promo y espera su aprobación para verla aquí.</div>`;
    } else if (activeTab === 'borradores') {
      const drafts = promos.filter((p) => p.estado === 'DRAFT');
      container.innerHTML = drafts.length ? `<section class="grid">${drafts.map(promoCard).join('')}</section>` : '<div class="empty">Sin borradores</div>';
    } else if (activeTab === 'pendientes') {
      const pending = promos.filter((p) => ['PENDING_APPROVAL', 'CHANGES_REQUESTED'].includes(p.estado));
      container.innerHTML = pending.length ? `<section class="grid">${pending.map(promoCard).join('')}</section>` : '<div class="empty">Sin promociones pendientes de aprobación</div>';
    } else if (activeTab === 'programadas') {
      const scheduled = promos.filter((p) => ['APPROVED', 'SCHEDULED'].includes(p.estado));
      container.innerHTML = scheduled.length ? `<section class="grid">${scheduled.map(promoCard).join('')}</section>` : '<div class="empty">Sin promociones aprobadas o programadas</div>';
    } else {
      const historial = promos.filter((p) => ['EXPIRED', 'REJECTED', 'CANCELLED'].includes(p.estado));
      container.innerHTML = historial.length ? `<section class="grid">${historial.map(promoCard).join('')}</section>` : '<div class="empty">Sin historial todavía</div>';
    }
  }

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    renderTabContent();
  }

  function openPromoModal(promo = null) {
    closeAnyModal();
    const overlay = document.createElement('div');
    overlay.className = 'orama-overlay';
    overlay.innerHTML = `<div class="orama-modal split-view" role="none" aria-modal="true">
      <p class="orama-modal-message">${promo ? 'Editar promoción' : 'Crear Promo del Día'}</p>
      <div class="filters">${promoFieldsMarkup(promo || {}, menuItems, staffList, 'modal-promo')}</div>
      <div class="orama-modal-actions">
        <button type="button" class="button" data-ui="cancel">Cancelar</button>
        <button type="button" class="button" data-ui="confirm">${promo ? 'Guardar cambios' : 'Crear promoción'}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    currentOverlay = overlay;
    wireTipoSwitcher('modal-promo');
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeAnyModal(); });
    overlay.querySelector('[data-ui="cancel"]').addEventListener('click', closeAnyModal);
    overlay.querySelector('[data-ui="confirm"]').addEventListener('click', async () => {
      const payload = readPromoFields('modal-promo');
      if (!payload.nombre || !payload.creado_por) {
        Orama.toast('Nombre y creador son requeridos', 'error');
        return;
      }
      try {
        if (promo) {
          await api(`/api/promotions/${promo.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          Orama.toast('Promoción actualizada', 'success');
        } else {
          await api('/api/promotions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          Orama.toast('Promoción creada como borrador', 'success');
        }
        closeAnyModal();
        await loadAll();
        renderTabContent();
      } catch (error) {
        Orama.toast(error.message, 'error');
      }
    });
  }

  function openPinModal({ title, requireNota = false, restrictTo = null }) {
    return new Promise((resolve) => {
      closeAnyModal();
      const options = (restrictTo ? staffList.filter((s) => s.tipo === restrictTo) : staffList);
      const overlay = document.createElement('div');
      overlay.className = 'orama-overlay';
      overlay.innerHTML = `<div class="orama-modal" role="none" aria-modal="true">
        <p class="orama-modal-message">${escapeHtml(title)}</p>
        <div class="field-group"><label for="pin-actor-nombre">Tu nombre</label>
          <select class="search" id="pin-actor-nombre">${options.map((s) => `<option value="${escapeHtml(s.nombre)}">${escapeHtml(s.nombre)}</option>`).join('')}</select>
        </div>
        <div class="field-group"><label for="pin-actor-pin">Tu PIN</label><input class="search" id="pin-actor-pin" type="password" inputmode="numeric" maxlength="10"></div>
        ${requireNota ? `<div class="field-group"><label for="pin-nota">Nota</label><input class="search" id="pin-nota" type="text" maxlength="500"></div>` : ''}
        <div class="orama-modal-actions">
          <button type="button" class="button" data-ui="cancel">Cancelar</button>
          <button type="button" class="button" data-ui="confirm">Confirmar</button>
        </div>
      </div>`;
      document.body.appendChild(overlay);
      currentOverlay = overlay;
      const close = (value) => { overlay.remove(); if (currentOverlay === overlay) currentOverlay = null; resolve(value); };
      overlay.addEventListener('click', (event) => { if (event.target === overlay) close(null); });
      overlay.querySelector('[data-ui="cancel"]').addEventListener('click', () => close(null));
      overlay.querySelector('[data-ui="confirm"]').addEventListener('click', () => {
        const actor_nombre = document.getElementById('pin-actor-nombre').value;
        const actor_pin = document.getElementById('pin-actor-pin').value;
        const nota = requireNota ? document.getElementById('pin-nota').value : undefined;
        if (!actor_pin) { Orama.toast('Ingresa tu PIN', 'error'); return; }
        close({ actor_nombre, actor_pin, nota });
      });
    });
  }

  function openReviewModal(promo) {
    closeAnyModal();
    const overlay = document.createElement('div');
    overlay.className = 'orama-overlay';
    overlay.innerHTML = `<div class="orama-modal split-view" role="none" aria-modal="true">
      <p class="orama-modal-message">Revisar promoción</p>
      <div class="promo-review-detail">
        <h3>${escapeHtml(promo.nombre)}</h3>
        <p class="subtle">${escapeHtml(PROMO_TIPO_LABELS[promo.tipo] || promo.tipo)} · ${escapeHtml(promoResumenPrecio(promo))}</p>
        ${promo.descripcion ? `<p>${escapeHtml(promo.descripcion)}</p>` : ''}
        <p class="mono subtle">Vigencia: ${escapeHtml((promo.fecha_inicio || '').slice(0, 10))}${promo.hora_inicio ? ' ' + promo.hora_inicio.slice(0, 5) : ''} → ${escapeHtml((promo.fecha_fin || '').slice(0, 10))}${promo.hora_fin ? ' ' + promo.hora_fin.slice(0, 5) : ''}</p>
        ${promo.condiciones ? `<p><strong>Condiciones:</strong> ${escapeHtml(promo.condiciones)}</p>` : ''}
        ${promo.limite_unidades ? `<p><strong>Límite:</strong> ${promo.limite_unidades} unidades</p>` : ''}
        ${promo.apilable ? '<p><strong>Apilable:</strong> sí</p>' : ''}
        ${promo.imagen_url ? `<img src="${escapeHtml(promo.imagen_url)}" alt="" style="max-width:100%;border-radius:8px;margin-top:8px">` : ''}
        <p class="mono subtle">Creada por ${escapeHtml(promo.creado_por)} · ${escapeHtml((promo.created_at || '').slice(0, 10))}</p>
      </div>
      <div class="filters">
        <div class="field-group"><label for="review-accion">Acción</label>
          <select class="search" id="review-accion">
            <option value="approve">Aprobar</option>
            <option value="changes_requested">Solicitar cambios</option>
            <option value="reject">Rechazar</option>
          </select>
        </div>
        <div class="field-group"><label for="review-actor">Tu nombre (gerencia)</label>
          <select class="search" id="review-actor">${staffList.filter((s) => s.tipo === 'management').map((s) => `<option value="${escapeHtml(s.nombre)}">${escapeHtml(s.nombre)}</option>`).join('')}</select>
        </div>
        <div class="field-group"><label for="review-pin">Tu PIN</label><input class="search" id="review-pin" type="password" inputmode="numeric" maxlength="10"></div>
        <div class="field-group"><label for="review-nota">Nota (requerida para solicitar cambios)</label><input class="search" id="review-nota" type="text" maxlength="500"></div>
      </div>
      <div class="orama-modal-actions">
        <button type="button" class="button" data-ui="cancel">Cerrar</button>
        <button type="button" class="button" data-ui="confirm">Confirmar</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    currentOverlay = overlay;
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeAnyModal(); });
    overlay.querySelector('[data-ui="cancel"]').addEventListener('click', closeAnyModal);
    overlay.querySelector('[data-ui="confirm"]').addEventListener('click', async () => {
      const accion = document.getElementById('review-accion').value;
      const actor_nombre = document.getElementById('review-actor').value;
      const actor_pin = document.getElementById('review-pin').value;
      const nota = document.getElementById('review-nota').value || undefined;
      if (!actor_pin) { Orama.toast('Ingresa tu PIN', 'error'); return; }
      if (accion === 'changes_requested' && !nota) { Orama.toast('La nota es requerida para solicitar cambios', 'error'); return; }
      try {
        await api(`/api/promotions/${promo.id}/review`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion, actor_nombre, actor_pin, nota })
        });
        Orama.toast('Revisión registrada', 'success');
        closeAnyModal();
        await loadAll();
        renderTabContent();
      } catch (error) {
        Orama.toast(error.message, 'error');
      }
    });
  }

  async function onAppClick(event) {
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) { switchTab(tabButton.dataset.tab); return; }
    if (event.target.closest('[data-create-promo]')) { openPromoModal(); return; }
    const editButton = event.target.closest('[data-edit-promo]');
    if (editButton) {
      const promo = promos.find((p) => String(p.id) === editButton.dataset.editPromo);
      if (promo) openPromoModal(promo);
      return;
    }
    const deleteButton = event.target.closest('[data-delete-promo]');
    if (deleteButton) {
      const confirmed = await Orama.confirm('¿Eliminar este borrador de promoción?', { danger: true, okText: 'Sí, eliminar' });
      if (!confirmed) return;
      try {
        await api(`/api/promotions/${deleteButton.dataset.deletePromo}`, { method: 'DELETE' });
        Orama.toast('Promoción eliminada', 'success');
        await loadAll();
        renderTabContent();
      } catch (error) {
        Orama.toast(error.message, 'error');
      }
      return;
    }
    const submitButton = event.target.closest('[data-submit-promo]');
    if (submitButton) {
      const result = await openPinModal({ title: '¿Enviar esta promoción a revisión?' });
      if (!result) return;
      try {
        await api(`/api/promotions/${submitButton.dataset.submitPromo}/submit`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result)
        });
        Orama.toast('Promoción enviada a revisión', 'success');
        await loadAll();
        renderTabContent();
      } catch (error) {
        Orama.toast(error.message, 'error');
      }
      return;
    }
    const reviewButton = event.target.closest('[data-review-promo]');
    if (reviewButton) {
      const promo = promos.find((p) => String(p.id) === reviewButton.dataset.reviewPromo);
      if (promo) openReviewModal(promo);
      return;
    }
    const activateButton = event.target.closest('[data-activate-promo]');
    if (activateButton) {
      const confirmed = await Orama.confirm('¿Activar esta promoción ahora mismo?', { okText: 'Sí, activar' });
      if (!confirmed) return;
      const result = await openPinModal({ title: 'Confirma con tu PIN de gerencia', restrictTo: 'management' });
      if (!result) return;
      try {
        await api(`/api/promotions/${activateButton.dataset.activatePromo}/activate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result)
        });
        Orama.toast('Promoción activada', 'success');
        await loadAll();
        renderTabContent();
      } catch (error) {
        Orama.toast(error.message, 'error');
      }
      return;
    }
    const deactivateButton = event.target.closest('[data-deactivate-promo]');
    if (deactivateButton) {
      const confirmed = await Orama.confirm('Esta promoción está activa ahora mismo. ¿Desactivarla?', { danger: true, okText: 'Sí, desactivar' });
      if (!confirmed) return;
      const result = await openPinModal({ title: 'Confirma con tu PIN de gerencia', restrictTo: 'management' });
      if (!result) return;
      try {
        await api(`/api/promotions/${deactivateButton.dataset.deactivatePromo}/deactivate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result)
        });
        Orama.toast('Promoción desactivada', 'success');
        await loadAll();
        renderTabContent();
      } catch (error) {
        Orama.toast(error.message, 'error');
      }
    }
  }

  app.innerHTML = pageHead('Marketing', 'Promociones', 'Promo del día, historial y aprobaciones') + `
    <section class="panel">
      <div class="panel-head"><h2>Promo del Día</h2>
        <button type="button" class="button" data-create-promo>+ Crear Promo del Día</button>
      </div>
    </section>
    <nav class="tab-bar" role="tablist" aria-label="Secciones de promociones">
      <button type="button" class="tab-btn active" data-tab="activa" role="tab" aria-selected="true">Activa</button>
      <button type="button" class="tab-btn" data-tab="borradores" role="tab" aria-selected="false">Borradores</button>
      <button type="button" class="tab-btn" data-tab="pendientes" role="tab" aria-selected="false">Pendientes</button>
      <button type="button" class="tab-btn" data-tab="programadas" role="tab" aria-selected="false">Aprobadas/Programadas</button>
      <button type="button" class="tab-btn" data-tab="historial" role="tab" aria-selected="false">Historial</button>
    </nav>
    <div id="promo-tab-content"><div class="panel">${loading}</div></div>`;

  app.addEventListener('click', onAppClick);
  await loadAll();
  renderTabContent();

  return () => {
    closeAnyModal();
    app.removeEventListener('click', onAppClick);
  };
}

Orama.routes.promociones = promociones;
