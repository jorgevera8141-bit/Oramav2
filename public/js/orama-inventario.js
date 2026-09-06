function inventarioFieldsMarkup(item = {}, prefix = 'inv') {
  return `
    <div class="field-group" style="margin-bottom:0"><label for="${prefix}-name">Insumo</label><input class="search" id="${prefix}-name" type="text" maxlength="120" value="${escapeHtml(item.name || '')}" required></div>
    <div class="field-group" style="margin-bottom:0"><label for="${prefix}-unit">Unidad</label><input class="search" id="${prefix}-unit" type="text" maxlength="30" value="${escapeHtml(item.unit || 'pieza')}"></div>
    <div class="field-group" style="margin-bottom:0"><label for="${prefix}-stock">Existencia</label><input class="search" id="${prefix}-stock" type="number" min="0" step="0.01" value="${Number(item.current_stock || 0)}"></div>
    <div class="field-group" style="margin-bottom:0"><label for="${prefix}-threshold">Punto de reorden</label><input class="search" id="${prefix}-threshold" type="number" min="0" step="0.01" value="${Number(item.reorder_threshold || 0)}"></div>
    <div class="field-group" style="margin-bottom:0"><label for="${prefix}-quantity">Cantidad a reordenar</label><input class="search" id="${prefix}-quantity" type="number" min="0" step="0.01" value="${Number(item.reorder_quantity || 0)}"></div>
    <div class="field-group" style="margin-bottom:0"><label for="${prefix}-cost">Costo por unidad</label><input class="search" id="${prefix}-cost" type="number" min="0" step="0.01" value="${Number(item.cost_per_unit || 0)}"></div>
    <div class="field-group" style="margin-bottom:0"><label for="${prefix}-supplier">Proveedor</label><input class="search" id="${prefix}-supplier" type="text" maxlength="120" value="${escapeHtml(item.supplier_name || '')}"></div>
    <div class="field-group" style="margin-bottom:0"><label for="${prefix}-contact">Contacto</label><input class="search" id="${prefix}-contact" type="text" maxlength="120" value="${escapeHtml(item.supplier_contact || '')}"></div>`;
}

function readInventarioFields(prefix = 'inv') {
  return {
    name: document.getElementById(`${prefix}-name`).value.trim(),
    unit: document.getElementById(`${prefix}-unit`).value.trim() || undefined,
    current_stock: Number(document.getElementById(`${prefix}-stock`).value || 0),
    reorder_threshold: Number(document.getElementById(`${prefix}-threshold`).value || 0),
    reorder_quantity: Number(document.getElementById(`${prefix}-quantity`).value || 0),
    cost_per_unit: Number(document.getElementById(`${prefix}-cost`).value || 0),
    supplier_name: document.getElementById(`${prefix}-supplier`).value.trim() || undefined,
    supplier_contact: document.getElementById(`${prefix}-contact`).value.trim() || undefined
  };
}

function inventarioTable(items) {
  return `<div class="table-wrap"><table><thead><tr><th>Insumo</th><th>Existencia</th><th>Unidad</th><th>Reorden</th><th>Proveedor</th><th>Acciones</th></tr></thead><tbody>${
    items.length ? items.map((item) => {
      const low = Number(item.current_stock) <= Number(item.reorder_threshold);
      return `<tr class="${low ? 'low' : ''}">` +
        `<td>${escapeHtml(item.name)}</td>` +
        `<td class="mono">${Number(item.current_stock || 0)}</td>` +
        `<td>${escapeHtml(item.unit)}</td>` +
        `<td class="mono">${Number(item.reorder_threshold || 0)}</td>` +
        `<td>${escapeHtml(item.supplier_name || '—')}</td>` +
        `<td><div class="action-row">` +
        `<button type="button" class="button" data-edit-item="${item.id}" aria-label="Editar ${escapeHtml(item.name)}">Editar</button>` +
        `<button type="button" class="button danger" data-delete-item="${item.id}" aria-label="Eliminar ${escapeHtml(item.name)}">Eliminar</button>` +
        `</div></td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">Sin inventario</td></tr>'
  }</tbody></table></div>`;
}

async function inventario() {
  let items = [];
  let currentOverlay = null;

  function closeAnyModal() {
    if (currentOverlay) { currentOverlay.remove(); currentOverlay = null; }
  }

  async function loadItems() {
    const data = await api('/api/inventory');
    items = data.inventory || [];
    document.getElementById('inventario-table').innerHTML = inventarioTable(items);
  }

  function openEditModal(item) {
    closeAnyModal();
    const overlay = document.createElement('div');
    overlay.className = 'orama-overlay';
    overlay.innerHTML = `<div class="orama-modal" role="none" aria-modal="true">
      <p class="orama-modal-message">Editar insumo</p>
      <div class="filters">${inventarioFieldsMarkup(item, 'modal-inv')}</div>
      <div class="orama-modal-actions">
        <button type="button" class="button" data-ui="cancel">Cancelar</button>
        <button type="button" class="button" data-ui="confirm">Guardar</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    currentOverlay = overlay;
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeAnyModal(); });
    overlay.querySelector('[data-ui="cancel"]').addEventListener('click', closeAnyModal);
    overlay.querySelector('[data-ui="confirm"]').addEventListener('click', async () => {
      const payload = readInventarioFields('modal-inv');
      if (!payload.name) { Orama.toast('El nombre es requerido', 'error'); return; }
      try {
        await api(`/api/inventory/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        Orama.toast('Insumo actualizado', 'success');
        closeAnyModal();
        await loadItems();
      } catch (error) {
        Orama.toast(error.message, 'error');
      }
    });
  }

  async function onAppClick(event) {
    const editButton = event.target.closest('[data-edit-item]');
    if (editButton) {
      const item = items.find((i) => String(i.id) === editButton.dataset.editItem);
      if (item) openEditModal(item);
      return;
    }
    const deleteButton = event.target.closest('[data-delete-item]');
    if (deleteButton) {
      const confirmed = await Orama.confirm('¿Eliminar este insumo del inventario?', { danger: true, okText: 'Sí, eliminar' });
      if (!confirmed) return;
      try {
        await api(`/api/inventory/${deleteButton.dataset.deleteItem}`, { method: 'DELETE' });
        Orama.toast('Insumo eliminado', 'success');
        await loadItems();
      } catch (error) {
        Orama.toast(error.message, 'error');
      }
    }
  }

  async function onAppSubmit(event) {
    if (event.target.id !== 'inventario-form') return;
    event.preventDefault();
    const payload = readInventarioFields();
    if (!payload.name) { Orama.toast('El nombre es requerido', 'error'); return; }
    try {
      await api('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      Orama.toast('Insumo agregado', 'success');
      event.target.reset();
      document.getElementById('inv-unit').value = 'pieza';
      await loadItems();
    } catch (error) {
      Orama.toast(error.message, 'error');
    }
  }

  app.innerHTML = pageHead('Abastecimiento', 'Inventario', 'Existencias y puntos de reorden') + `
    <section class="panel">
      <div class="panel-head"><h2>Agregar insumo</h2></div>
      <form id="inventario-form" class="filters">
        ${inventarioFieldsMarkup()}
        <button type="submit" class="button" style="align-self:flex-end">Agregar</button>
      </form>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Insumos</h2></div>
      <div id="inventario-table">${loading}</div>
    </section>`;

  app.addEventListener('click', onAppClick);
  app.addEventListener('submit', onAppSubmit);
  await loadItems();

  return () => {
    closeAnyModal();
    app.removeEventListener('click', onAppClick);
    app.removeEventListener('submit', onAppSubmit);
  };
}

Orama.routes.inventario = inventario;
