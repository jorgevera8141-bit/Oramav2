const GASTO_CATEGORIAS = ['Insumos', 'Nomina', 'Renta', 'Servicios', 'Mantenimiento', 'Marketing', 'Otro'];

function defaultFinanzasRange() {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 5);
  from.setDate(1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

async function finanzas() {
  let range = defaultFinanzasRange();
  let pnl = null;
  let gastosList = [];
  let chart = null;

  function destroyChart() {
    if (chart) { chart.destroy(); chart = null; }
  }

  function renderShell() {
    app.innerHTML = pageHead('Finanzas', 'Finanzas', 'Ingresos, gastos y utilidad') + `
      <section class="panel">
        <div class="period-bar">
          <div class="field-group" style="margin-bottom:0"><label for="finanzas-from">Desde</label><input class="search" id="finanzas-from" type="date" value="${range.from}"></div>
          <div class="field-group" style="margin-bottom:0"><label for="finanzas-to">Hasta</label><input class="search" id="finanzas-to" type="date" value="${range.to}"></div>
          <button type="button" class="button" data-finanzas-ver style="align-self:flex-end">Ver</button>
        </div>
      </section>
      <nav class="tab-bar" role="tablist" aria-label="Secciones de finanzas">
        <button type="button" class="tab-btn active" data-tab="pnl" role="tab" aria-selected="true">P&amp;L</button>
        <button type="button" class="tab-btn" data-tab="gastos" role="tab" aria-selected="false">Gastos</button>
      </nav>
      <div id="finanzas-content"><div class="panel">${loading}</div></div>`;
  }

  function renderPnl() {
    const container = document.getElementById('finanzas-content');
    if (!pnl) { container.innerHTML = `<div class="panel">${loading}</div>`; return; }
    const { meses, categorias_gasto: categoriasGasto, resumen } = pnl;
    container.innerHTML = `
      <section class="grid">
        <article class="glass-card"><p class="kpi-label">Ingresos</p><p class="kpi-value">${money.format(resumen.ingresos)}</p></article>
        <article class="glass-card"><p class="kpi-label">Gastos</p><p class="kpi-value">${money.format(resumen.gastos)}</p></article>
        <article class="glass-card"><p class="kpi-label">Utilidad neta</p><p class="kpi-value">${money.format(resumen.neto)}</p></article>
      </section>
      <section class="glass-card chart-card">
        <div class="panel-head"><h2>Ingresos vs. gastos por mes</h2></div>
        <div class="chart-wrap"><canvas id="chart-pnl"></canvas></div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Gastos por categoría</h2></div>
        <div class="table-wrap"><table><thead><tr><th>Categoría</th><th>Total</th></tr></thead><tbody>
          ${categoriasGasto.length ? categoriasGasto.map((row) => `<tr><td>${escapeHtml(row.categoria)}</td><td class="mono">${money.format(Number(row.total))}</td></tr>`).join('') : '<tr><td colspan="2" class="empty">Sin gastos registrados en el rango</td></tr>'}
        </tbody></table></div>
      </section>`;

    loadChartJs().then(() => {
      destroyChart();
      chart = new Chart(document.getElementById('chart-pnl'), {
        type: 'bar',
        data: {
          labels: meses.map((m) => m.mes),
          datasets: [
            { label: 'Ingresos', data: meses.map((m) => m.ingresos), backgroundColor: '#2A9D8F' },
            { label: 'Gastos', data: meses.map((m) => m.gastos), backgroundColor: '#C97064' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#E8E0D4' } } },
          scales: { y: { ticks: { color: '#E8E0D4' } }, x: { ticks: { color: '#E8E0D4' } } }
        }
      });
    }).catch((error) => Orama.toast(error.message, 'error'));
  }

  function renderGastos() {
    const container = document.getElementById('finanzas-content');
    container.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h2>Registrar gasto</h2></div>
        <form id="gasto-form" class="filters">
          <div class="field-group" style="margin-bottom:0">
            <label for="gasto-categoria">Categoría</label>
            <select id="gasto-categoria" class="search">${GASTO_CATEGORIAS.map((cat) => `<option value="${cat}">${cat}</option>`).join('')}</select>
          </div>
          <div class="field-group" style="margin-bottom:0"><label for="gasto-descripcion">Descripción</label><input class="search" id="gasto-descripcion" type="text" maxlength="200"></div>
          <div class="field-group" style="margin-bottom:0"><label for="gasto-monto">Monto</label><input class="search" id="gasto-monto" type="number" min="0.01" step="0.01" required></div>
          <div class="field-group" style="margin-bottom:0"><label for="gasto-fecha">Fecha</label><input class="search" id="gasto-fecha" type="date" value="${new Date().toISOString().slice(0, 10)}" required></div>
          <button type="submit" class="button" style="align-self:flex-end">Agregar</button>
        </form>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Gastos del rango</h2><span class="subtle">${gastosList.length}</span></div>
        <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Monto</th><th></th></tr></thead><tbody>
          ${gastosList.length ? gastosList.map((g) => `<tr><td class="mono">${g.fecha.slice(0, 10)}</td><td>${escapeHtml(g.categoria)}</td><td>${escapeHtml(g.descripcion || '—')}</td><td class="mono">${money.format(Number(g.monto))}</td><td><button type="button" class="button danger" data-delete-gasto="${g.id}" aria-label="Eliminar gasto ${g.id}">Eliminar</button></td></tr>`).join('') : '<tr><td colspan="5" class="empty">Sin gastos en el rango</td></tr>'}
        </tbody></table></div>
      </section>`;
  }

  const renderers = { pnl: renderPnl, gastos: renderGastos };

  function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    renderers[tab]();
  }

  async function loadData() {
    document.getElementById('finanzas-content').innerHTML = `<div class="panel">${loading}</div>`;
    try {
      const [pnlData, gastosData] = await Promise.all([
        api(`/api/finanzas?from=${range.from}&to=${range.to}`),
        api(`/api/gastos?from=${range.from}&to=${range.to}`)
      ]);
      pnl = pnlData;
      gastosList = gastosData.gastos || [];
      switchTab(document.querySelector('.tab-btn.active')?.dataset.tab || 'pnl');
    } catch (error) {
      document.getElementById('finanzas-content').innerHTML = `<div class="error" role="alert">${escapeHtml(error.message)}</div>`;
    }
  }

  async function onAppSubmit(event) {
    if (event.target.id !== 'gasto-form') return;
    event.preventDefault();
    const payload = {
      categoria: document.getElementById('gasto-categoria').value,
      descripcion: document.getElementById('gasto-descripcion').value || undefined,
      monto: Number(document.getElementById('gasto-monto').value),
      fecha: document.getElementById('gasto-fecha').value
    };
    try {
      await api('/api/gastos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      Orama.toast('Gasto agregado', 'success');
      await loadData();
      switchTab('gastos');
    } catch (error) {
      Orama.toast(error.message, 'error');
    }
  }

  async function onAppClick(event) {
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) { switchTab(tabButton.dataset.tab); return; }
    if (event.target.closest('[data-finanzas-ver]')) {
      range = { from: document.getElementById('finanzas-from').value, to: document.getElementById('finanzas-to').value };
      await loadData();
      return;
    }
    const deleteButton = event.target.closest('[data-delete-gasto]');
    if (deleteButton) {
      const confirmed = await Orama.confirm('¿Eliminar este gasto?', { danger: true, okText: 'Sí, eliminar' });
      if (!confirmed) return;
      try {
        await api(`/api/gastos/${deleteButton.dataset.deleteGasto}`, { method: 'DELETE' });
        Orama.toast('Gasto eliminado', 'success');
        await loadData();
        switchTab('gastos');
      } catch (error) {
        Orama.toast(error.message, 'error');
      }
    }
  }

  renderShell();
  app.addEventListener('click', onAppClick);
  app.addEventListener('submit', onAppSubmit);
  await loadData();

  return () => {
    destroyChart();
    app.removeEventListener('click', onAppClick);
    app.removeEventListener('submit', onAppSubmit);
  };
}

Orama.routes.finanzas = finanzas;
