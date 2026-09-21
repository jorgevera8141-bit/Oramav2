async function nuevaOrden() {
  const [mesasData, menuData] = await Promise.all([api('/api/mesas'), api('/api/menu')]);
  const mesas = (mesasData.mesas || []).slice();
  const items = (menuData.menu || []).filter((item) => item.activo);
  const categories = ['Todos', ...new Set(items.map((item) => item.categoria))];

  const state = { mesa: null, cart: [], category: 'Todos', query: '', cartOpen: false, pricing: null };
  let previewTimer = null;
  let previewRequestId = 0;

  function filteredItems() {
    return items.filter((item) =>
      (state.category === 'Todos' || item.categoria === state.category)
      && item.nombre.toLowerCase().includes(state.query)
    );
  }

  function menuItemsMarkup() {
    const filtered = filteredItems();
    return filtered.length
      ? filtered.map((item) => `<article class="menu-item-card crystal-card">
          <div>
            <p class="menu-item-card-name">${escapeHtml(item.nombre)}</p>
            <p class="menu-item-card-price">${money.format(Number(item.precio || 0))}</p>
            <p class="menu-item-card-meta">${escapeHtml(item.categoria || 'General')}</p>
          </div>
          <button type="button" class="button" data-add-id="${item.id}" aria-label="Agregar ${escapeHtml(item.nombre)}">Agregar</button>
        </article>`).join('')
      : '<div class="empty">Sin resultados</div>';
  }

  function cartMarkup() {
    const count = state.cart.reduce((sum, line) => sum + line.cantidad, 0);
    const naiveTotal = state.cart.reduce((sum, line) => sum + line.precio * line.cantidad, 0);
    const pricing = state.pricing;
    const total = pricing ? pricing.total : naiveTotal;
    const promoRows = pricing && pricing.promociones_aplicadas.length
      ? pricing.promociones_aplicadas.map((promo) => `<div class="cart-item-row promo-row"><span class="cart-item-name">Promo ${escapeHtml(promo.nombre)}</span><span class="cart-item-price">-${money.format(promo.descuento)}</span></div>`).join('')
      : '';

    return `<div class="cart-shell crystal-card">
      <div class="cart-summary" data-cart-toggle>
        <span class="cart-summary-count">${count} artículo${count === 1 ? '' : 's'}</span>
        <span class="cart-summary-total">${money.format(total)}</span>
        <span class="cart-summary-toggle">${state.cartOpen ? 'Ocultar ▾' : 'Ver ▴'}</span>
      </div>
      <div class="cart-items ${state.cartOpen ? 'open' : ''}"><div class="cart-items-inner">${state.cart.length
    ? state.cart.map((line) => `<div class="cart-item-row"><span class="cart-item-name">${escapeHtml(line.item_nombre)}</span><span class="cart-item-qty">x${line.cantidad}</span><span class="cart-item-price">${money.format(line.precio * line.cantidad)}</span><button type="button" class="button danger" data-remove-id="${line.id}" aria-label="Quitar ${escapeHtml(line.item_nombre)}">−</button></div>`).join('')
    : '<p class="subtle">Carrito vacío</p>'}${promoRows}</div></div>
      <div class="cart-actions">
        <button type="button" class="button" data-change-mesa>Cambiar mesa</button>
        <button type="button" class="button" data-submit-order ${state.cart.length ? '' : 'disabled'}>Ordenar</button>
      </div>
    </div>`;
  }

  function refreshCart() {
    const el = document.getElementById('cart-bar-root');
    if (el) el.innerHTML = cartMarkup();
  }

  function refreshItems() {
    const el = document.getElementById('cart-menu-items');
    if (el) el.innerHTML = menuItemsMarkup();
  }

  function refreshCategories() {
    document.querySelectorAll('[data-category]').forEach((button) => {
      const active = button.dataset.category === state.category;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    if (!state.cart.length) {
      previewRequestId += 1;
      state.pricing = null;
      refreshCart();
      return;
    }
    previewTimer = setTimeout(async () => {
      previewRequestId += 1;
      const currentRequestId = previewRequestId;
      const previewItems = state.cart.map((line) => ({ menu_item_id: line.id, cantidad: line.cantidad }));
      try {
        const preview = await api('/api/promotions/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: previewItems })
        });
        if (currentRequestId !== previewRequestId) return;
        state.pricing = preview;
      } catch (_error) {
        if (currentRequestId !== previewRequestId) return;
        state.pricing = null;
      }
      refreshCart();
    }, 300);
  }

  function addToCart(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    const existing = state.cart.find((line) => line.id === id);
    if (existing) existing.cantidad += 1;
    else state.cart.push({ id, item_nombre: item.nombre, precio: Number(item.precio || 0), cantidad: 1 });
    refreshCart();
    schedulePreview();
  }

  function removeFromCart(id) {
    const existing = state.cart.find((line) => line.id === id);
    if (!existing) return;
    if (existing.cantidad > 1) existing.cantidad -= 1;
    else state.cart = state.cart.filter((line) => line.id !== id);
    refreshCart();
    schedulePreview();
  }

  async function submitOrder(button) {
    if (!state.cart.length) return;
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = 'Enviando…';
    try {
      const payload = {
        mesa_id: state.mesa.id,
        mesa_nombre: state.mesa.nombre,
        items: state.cart.map((line) => ({ menu_item_id: line.id, cantidad: line.cantidad }))
      };
      const result = await api('/api/ordenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const promoNote = (result.promociones_aplicadas || []).length ? ' — promo aplicada' : '';
      Orama.toast(`Orden enviada — ${money.format(Number(result.orden?.total || 0))}${promoNote}`, 'success');
      const mesaRecord = mesas.find((m) => m.id === state.mesa.id);
      if (mesaRecord) mesaRecord.status = 'ocupada';
      state.cart = [];
      state.cartOpen = false;
      state.pricing = null;
      refreshCart();
    } catch (error) {
      Orama.toast(error.message, 'error');
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  function renderMesaStep() {
    app.innerHTML = pageHead('Nueva orden', 'Elige una mesa', 'Selecciona dónde se sirve esta orden') +
      `<section class="mesa-grid">${mesas.length
    ? mesas.map((mesa) => `<button type="button" class="mesa-card crystal-card selectable ${mesa.status === 'ocupada' ? 'occupied' : ''}" data-mesa-id="${mesa.id}" data-mesa-nombre="${escapeHtml(mesa.nombre)}"><h2 class="mesa-name">${escapeHtml(mesa.nombre)}</h2>${statusBadge(mesa.status)}</button>`).join('')
    : '<div class="empty">No hay mesas configuradas</div>'}</section>`;
  }

  function renderMenuStep() {
    app.innerHTML = pageHead('Nueva orden', state.mesa.nombre, 'Toca un producto para agregarlo a la orden') +
      `<section class="panel crystal-card new-order-workspace">
        <div class="new-order-toolbar">
          <div class="search-field"><label for="cart-search">Buscar</label><input class="search" id="cart-search" type="search" placeholder="Ej. Capuchino"></div>
          <div class="category-strip">${categories.map((category) => `<button type="button" class="pill ${category === state.category ? 'active' : ''}" data-category="${escapeHtml(category)}" aria-pressed="${category === state.category ? 'true' : 'false'}">${escapeHtml(category)}</button>`).join('')}</div>
        </div>
        <div class="new-order-layout">
          <div id="cart-menu-items" class="new-order-menu">${menuItemsMarkup()}</div>
          <aside class="new-order-cart"><div id="cart-bar-root">${cartMarkup()}</div></aside>
        </div>
      </section>`;
    document.getElementById('cart-search').addEventListener('input', (event) => {
      state.query = event.target.value.toLowerCase();
      refreshItems();
    });
  }

  function onAppClick(event) {
    const mesaButton = event.target.closest('[data-mesa-id]');
    if (mesaButton) {
      state.mesa = { id: Number(mesaButton.dataset.mesaId), nombre: mesaButton.dataset.mesaNombre };
      state.cartOpen = false;
      renderMenuStep();
      return;
    }

    const categoryButton = event.target.closest('[data-category]');
    if (categoryButton) {
      state.category = categoryButton.dataset.category;
      state.query = '';
      const search = document.getElementById('cart-search');
      if (search) search.value = '';
      refreshCategories();
      refreshItems();
      return;
    }

    const addButton = event.target.closest('[data-add-id]');
    if (addButton) {
      if (window.matchMedia('(min-width: 900px)').matches) state.cartOpen = true;
      addToCart(Number(addButton.dataset.addId));
      return;
    }

    const removeButton = event.target.closest('[data-remove-id]');
    if (removeButton) {
      removeFromCart(Number(removeButton.dataset.removeId));
      return;
    }

    const cartToggle = event.target.closest('[data-cart-toggle]');
    if (cartToggle) {
      state.cartOpen = !state.cartOpen;
      refreshCart();
      return;
    }

    const changeMesa = event.target.closest('[data-change-mesa]');
    if (changeMesa) {
      state.mesa = null;
      state.cart = [];
      state.cartOpen = false;
      state.pricing = null;
      renderMesaStep();
      return;
    }

    const submitButton = event.target.closest('[data-submit-order]');
    if (submitButton && !submitButton.disabled) submitOrder(submitButton);
  }

  renderMesaStep();
  app.addEventListener('click', onAppClick);
  return () => {
    clearTimeout(previewTimer);
    app.removeEventListener('click', onAppClick);
  };
}

Orama.routes['nueva-orden'] = nuevaOrden;
