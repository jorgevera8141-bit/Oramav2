function menuFieldsMarkup(item = {}, prefix = 'menu') {
  const isActive = item.activo === undefined || Number(item.activo) === 1;
  return `
    <div class="field-group" style="margin-bottom:0"><label for="${prefix}-nombre">Producto</label><input class="search" id="${prefix}-nombre" type="text" maxlength="120" value="${escapeHtml(item.nombre || '')}" required></div>
    <div class="field-group" style="margin-bottom:0"><label for="${prefix}-categoria">Categoría</label><input class="search" id="${prefix}-categoria" type="text" maxlength="80" value="${escapeHtml(item.categoria || '')}" required></div>
    <div class="field-group" style="margin-bottom:0"><label for="${prefix}-precio">Precio</label><input class="search" id="${prefix}-precio" type="number" min="0" step="0.01" value="${Number(item.precio || 0)}" required></div>
    <div class="field-group" style="margin-bottom:0"><label for="${prefix}-clave">Clave</label><input class="search" id="${prefix}-clave" type="text" maxlength="40" value="${escapeHtml(item.clave || '')}"></div>
    <div class="field-group" style="margin-bottom:0"><label for="${prefix}-activo">Estado</label><select class="search" id="${prefix}-activo"><option value="1" ${isActive ? 'selected' : ''}>Activo</option><option value="0" ${!isActive ? 'selected' : ''}>Inactivo</option></select></div>`;
}

function readMenuFields(prefix = 'menu') {
  return {
    nombre: document.getElementById(`${prefix}-nombre`).value.trim(),
    categoria: document.getElementById(`${prefix}-categoria`).value.trim(),
    precio: Number(document.getElementById(`${prefix}-precio`).value || 0),
    clave: document.getElementById(`${prefix}-clave`).value.trim() || undefined,
    activo: Number(document.getElementById(`${prefix}-activo`).value)
  };
}

function menuTable(items) {
  return `<div class="table-wrap"><table><thead><tr><th scope="col">Producto</th><th scope="col">Categoría</th><th scope="col">Clave</th><th scope="col">Precio</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>${
    items.length ? items.map((item) =>
      `<tr>` +
      `<td>${escapeHtml(item.nombre)}</td>` +
      `<td>${escapeHtml(item.categoria)}</td>` +
      `<td class="mono">${escapeHtml(item.clave || '—')}</td>` +
      `<td class="mono">${money.format(Number(item.precio || 0))}</td>` +
      `<td>${Number(item.activo) ? statusBadge('disponible') : statusBadge('cancelada')}</td>` +
      `<td><div class="action-row">` +
      `<button type="button" class="button" data-edit-menu-item="${item.id}" aria-label="Editar ${escapeHtml(item.nombre)}">Editar</button>` +
      `<button type="button" class="button danger" data-delete-menu-item="${item.id}" aria-label="Eliminar ${escapeHtml(item.nombre)}">Eliminar</button>` +
      `</div></td></tr>`
    ).join('') : '<tr><td colspan="6" class="empty">Sin resultados</td></tr>'
  }</tbody></table></div>`;
}

async function menu() {
  const data = await api('/api/menu');
  const items = data.menu || [];
  const categories = ['Todos', ...new Set(items.map((item) => item.categoria))];
  let currentOverlay = null;

  function closeAnyModal() {
    if (currentOverlay) { currentOverlay.remove(); currentOverlay = null; }
  }

  function openEditModal(item) {
    closeAnyModal();
    const overlay = document.createElement('div');
    overlay.className = 'orama-overlay';
    overlay.innerHTML = `<div class="orama-modal" role="none" aria-modal="true">
      <p class="orama-modal-message">Editar producto</p>
      <div class="filters">${menuFieldsMarkup(item, 'modal-menu')}</div>
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
      const payload = readMenuFields('modal-menu');
      if (!payload.nombre || !payload.categoria) { Orama.toast('Nombre y categoría son requeridos', 'error'); return; }
      try {
        await api(`/api/menu/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        Orama.toast('Producto actualizado', 'success');
        closeAnyModal();
        await window.render();
      } catch (error) {
        Orama.toast(error.message, 'error');
      }
    });
  }

  async function onAppClick(event) {
    const editButton = event.target.closest('[data-edit-menu-item]');
    if (editButton) {
      const item = items.find((i) => String(i.id) === editButton.dataset.editMenuItem);
      if (item) openEditModal(item);
      return;
    }
    const deleteButton = event.target.closest('[data-delete-menu-item]');
    if (deleteButton) {
      const confirmed = await Orama.confirm('¿Eliminar este producto del menú?', { danger: true, okText: 'Sí, eliminar' });
      if (!confirmed) return;
      try {
        await api(`/api/menu/${deleteButton.dataset.deleteMenuItem}`, { method: 'DELETE' });
        Orama.toast('Producto eliminado', 'success');
        await window.render();
      } catch (error) {
        Orama.toast(error.message, 'error');
      }
    }
  }

  async function onAppSubmit(event) {
    if (event.target.id !== 'menu-form') return;
    event.preventDefault();
    const payload = readMenuFields('new-menu');
    if (!payload.nombre || !payload.categoria) { Orama.toast('Nombre y categoría son requeridos', 'error'); return; }
    try {
      await api('/api/menu/nuevo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      Orama.toast('Producto agregado', 'success');
      await window.render();
    } catch (error) {
      Orama.toast(error.message, 'error');
    }
  }

  app.innerHTML = pageHead('Catálogo', 'Menú', 'Productos activos de Orama Café') + `
    <section class="panel">
      <div class="panel-head"><h2>Agregar producto</h2></div>
      <form id="menu-form" class="filters">
        ${menuFieldsMarkup({}, 'new-menu')}
        <button type="submit" class="button" style="align-self:flex-end">Agregar</button>
      </form>
    </section>
    <section class="panel">
      <div class="filters">
        <div class="search-field"><label for="menu-search">Buscar</label><input class="search" id="menu-search" type="search" placeholder="Ej. Capuchino"></div>
        ${categories.map((category, index) => {
          const photo = categoryPhotos[category];
          return `<button class="pill ${index === 0 ? 'active' : ''} ${photo ? 'has-photo' : ''}" data-category="${escapeHtml(category)}"${photo ? ` style="--pill-photo:url('${photo}')"` : ''}>${escapeHtml(category)}</button>`;
        }).join('')}
      </div>
      <div id="menu-table">${menuTable(items)}</div>
    </section>`;

  let selected = 'Todos';
  const filterRender = () => {
    const query = document.getElementById('menu-search').value.toLowerCase();
    const filtered = items.filter((item) => (selected === 'Todos' || item.categoria === selected) && item.nombre.toLowerCase().includes(query));
    document.getElementById('menu-table').innerHTML = menuTable(filtered);
  };
  document.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => {
    selected = button.dataset.category;
    document.querySelectorAll('[data-category]').forEach((pill) => pill.classList.toggle('active', pill === button));
    filterRender();
  }));
  document.getElementById('menu-search').addEventListener('input', filterRender);

  app.addEventListener('click', onAppClick);
  app.addEventListener('submit', onAppSubmit);

  return () => {
    closeAnyModal();
    app.removeEventListener('click', onAppClick);
    app.removeEventListener('submit', onAppSubmit);
  };
}

Orama.routes.menu = menu;
