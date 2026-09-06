async function corte() {
  const today = new Date().toISOString().slice(0, 10);

  async function loadCorte(date) {
    const container = document.getElementById('corte-content');
    container.innerHTML = loading;
    try {
      const data = await api(`/api/resumen?date=${date}`);
      const ordenes = Number(data.ordenes || 0);
      const total = Number(data.total || 0);
      const totalEfectivo = Number(data.total_efectivo || 0);
      const totalTarjeta = Number(data.total_tarjeta || 0);
      const promedio = ordenes > 0 ? total / ordenes : 0;
      const fechaDisplay = new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      if (!ordenes) {
        container.innerHTML = `<div class="empty">Sin órdenes cerradas para ${escapeHtml(fechaDisplay)}</div>`;
        return;
      }

      container.innerHTML = `
        <section class="grid">
          <article class="glass-card"><p class="kpi-label">Órdenes</p><p class="kpi-value">${ordenes}</p></article>
          <article class="glass-card"><p class="kpi-label">Promedio</p><p class="kpi-value">${money.format(promedio)}</p></article>
          <article class="glass-card"><p class="kpi-label">Efectivo</p><p class="kpi-value">${money.format(totalEfectivo)}</p></article>
          <article class="glass-card"><p class="kpi-label">Tarjeta</p><p class="kpi-value">${money.format(totalTarjeta)}</p></article>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Total del día</h2><span class="subtle">${escapeHtml(fechaDisplay)}</span></div>
          <p class="kpi-value" style="font-size:40px">${money.format(total)}</p>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Órdenes cerradas</h2><span class="subtle">${ordenes}</span></div>
          ${orderTable(data.ordenes_lista || [])}
        </section>
        <button type="button" class="button" style="width:100%;margin-top:16px" data-share-corte>📤 Compartir corte</button>`;

      container.dataset.shareText = [
        'ORAMA CAFÉ — Corte de Caja',
        fechaDisplay,
        `Órdenes: ${ordenes}`,
        `Promedio: ${money.format(promedio)}`,
        `Efectivo: ${money.format(totalEfectivo)}`,
        `Tarjeta: ${money.format(totalTarjeta)}`,
        `TOTAL: ${money.format(total)}`
      ].join('\n');
    } catch (error) {
      container.innerHTML = `<div class="error" role="alert">${escapeHtml(error.message)}</div>`;
    }
  }

  function onAppClick(event) {
    if (event.target.closest('[data-corte-ver]')) {
      const date = document.getElementById('corte-date').value || today;
      loadCorte(date);
      return;
    }
    if (event.target.closest('[data-share-corte]')) {
      const text = document.getElementById('corte-content').dataset.shareText || '';
      if (navigator.share) {
        navigator.share({ title: 'Corte de Caja — Orama Café', text }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => Orama.toast('Corte copiado al portapapeles', 'success'));
      } else {
        Orama.toast('No se pudo compartir en este navegador', 'warning');
      }
    }
  }

  app.innerHTML = pageHead('Cierre', 'Corte de Caja', 'Resumen de cobros por día') +
    `<section class="panel">
      <div class="filters">
        <div class="field-group" style="margin-bottom:0;flex:1"><label for="corte-date">Fecha del corte</label><input class="search" id="corte-date" type="date" value="${today}"></div>
        <button type="button" class="button" data-corte-ver style="align-self:flex-end">Ver</button>
      </div>
    </section>
    <div id="corte-content"></div>`;

  app.addEventListener('click', onAppClick);
  await loadCorte(today);

  return () => app.removeEventListener('click', onAppClick);
}

Orama.routes.corte = corte;
