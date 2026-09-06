const CHART_JS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.1/chart.umd.min.js';
const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const PAYMENT_CHART_COLORS = { efectivo: '#2A9D8F', tarjeta: '#D4A84B' };

function loadChartJs() {
  if (window.Chart) return Promise.resolve();
  if (window.__chartJsLoading) return window.__chartJsLoading;
  window.__chartJsLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHART_JS_SRC;
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar Chart.js'));
    document.head.appendChild(script);
  });
  return window.__chartJsLoading;
}

function rangeForPeriod(period) {
  const to = new Date();
  const from = new Date(to);
  if (period === '7d') from.setDate(from.getDate() - 6);
  else if (period === '30d') from.setDate(from.getDate() - 29);
  else if (period === '90d') from.setDate(from.getDate() - 89);
  else from.setDate(from.getDate() - 6);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function deltaMarkup(current, previous, formatter) {
  if (!previous) return '<span class="kpi-delta flat">Sin período previo</span>';
  const diff = current - previous;
  const pct = previous !== 0 ? (diff / Math.abs(previous)) * 100 : 0;
  const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
  return `<span class="kpi-delta ${cls}">${arrow} ${pct.toFixed(1)}% vs. período anterior (${formatter(previous)})</span>`;
}

function csvFromRows(headers, rows) {
  const escapeCell = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.map(escapeCell).join(','), ...rows.map((row) => row.map(escapeCell).join(','))].join('\n');
}

function downloadCsv(filename, headers, rows) {
  const blob = new Blob([csvFromRows(headers, rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function reportes() {
  let period = '30d';
  let charts = {};
  let bundle = null;
  let margenes = null;
  let mesas = null;

  function destroyCharts() {
    Object.values(charts).forEach((chart) => chart && chart.destroy());
    charts = {};
  }

  function renderShell() {
    app.innerHTML = pageHead('Inteligencia', 'Reportes', 'Rendimiento del negocio por período') + `
      <section class="panel">
        <div class="period-bar">
          <div class="field-group" style="margin-bottom:0">
            <label for="reportes-period">Período</label>
            <select id="reportes-period" class="search">
              <option value="7d" ${period === '7d' ? 'selected' : ''}>Últimos 7 días</option>
              <option value="30d" ${period === '30d' ? 'selected' : ''}>Últimos 30 días</option>
              <option value="90d" ${period === '90d' ? 'selected' : ''}>Últimos 90 días</option>
            </select>
          </div>
        </div>
      </section>
      <nav class="tab-bar" role="tablist" aria-label="Secciones de reportes">
        <button type="button" class="tab-btn active" data-tab="resumen" role="tab" aria-selected="true">Resumen</button>
        <button type="button" class="tab-btn" data-tab="menu" role="tab" aria-selected="false">Menú</button>
        <button type="button" class="tab-btn" data-tab="operacion" role="tab" aria-selected="false">Operación</button>
      </nav>
      <div id="reportes-content"><div class="panel">${loading}</div></div>`;
  }

  function renderResumen() {
    const container = document.getElementById('reportes-content');
    if (!bundle) { container.innerHTML = `<div class="panel">${loading}</div>`; return; }
    const { current, previous, serie, pagos, categorias } = bundle;

    container.innerHTML = `
      <section class="grid">
        <article class="glass-card">
          <p class="kpi-label">Ingresos</p>
          <p class="kpi-value">${money.format(current.ingresos)}</p>
          ${deltaMarkup(current.ingresos, previous.ingresos, (v) => money.format(v))}
        </article>
        <article class="glass-card">
          <p class="kpi-label">Órdenes</p>
          <p class="kpi-value">${current.ordenes}</p>
          ${deltaMarkup(current.ordenes, previous.ordenes, (v) => String(v))}
        </article>
        <article class="glass-card">
          <p class="kpi-label">Ticket promedio</p>
          <p class="kpi-value">${money.format(current.ticket)}</p>
          ${deltaMarkup(current.ticket, previous.ticket, (v) => money.format(v))}
        </article>
        <article class="glass-card">
          <p class="kpi-label">Neto (ingresos - gastos)</p>
          <p class="kpi-value">${money.format(current.neto)}</p>
          ${deltaMarkup(current.neto, previous.neto, (v) => money.format(v))}
        </article>
      </section>
      <section class="chart-grid">
        <article class="glass-card chart-card">
          <div class="panel-head"><h2>Ingresos por día</h2></div>
          <div class="chart-wrap"><canvas id="chart-serie"></canvas></div>
        </article>
        <article class="glass-card chart-card">
          <div class="panel-head"><h2>Mezcla de pago</h2></div>
          <div class="chart-wrap donut"><canvas id="chart-pagos"></canvas></div>
        </article>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Ventas por categoría</h2></div>
        <div class="table-wrap"><table><thead><tr><th>Categoría</th><th>Cantidad</th><th>Total</th></tr></thead><tbody>
          ${categorias.length ? categorias.map((row) => `<tr><td>${escapeHtml(row.categoria || 'Sin categoría')}</td><td class="mono">${row.cantidad}</td><td class="mono">${money.format(Number(row.total))}</td></tr>`).join('') : '<tr><td colspan="3" class="empty">Sin ventas en el período</td></tr>'}
        </tbody></table></div>
      </section>`;

    loadChartJs().then(() => {
      destroyCharts();
      const serieLabels = serie.map((row) => new Date(`${row.d}`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }));
      charts.serie = new Chart(document.getElementById('chart-serie'), {
        type: 'bar',
        data: { labels: serieLabels, datasets: [{ label: 'Ingresos', data: serie.map((row) => Number(row.ingresos)), backgroundColor: '#2A9D8F' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#E8E0D4' } }, x: { ticks: { color: '#E8E0D4' } } } }
      });
      charts.pagos = new Chart(document.getElementById('chart-pagos'), {
        type: 'doughnut',
        data: {
          labels: pagos.map((row) => (row.payment_method === 'efectivo' ? 'Efectivo' : 'Tarjeta')),
          datasets: [{ data: pagos.map((row) => Number(row.total)), backgroundColor: pagos.map((row) => PAYMENT_CHART_COLORS[row.payment_method] || '#A89F91') }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#E8E0D4' } } } }
      });
    }).catch((error) => Orama.toast(error.message, 'error'));
  }

  function renderMenu() {
    const container = document.getElementById('reportes-content');
    if (!bundle || !margenes) { container.innerHTML = `<div class="panel">${loading}</div>`; return; }
    const threshold = margenes.threshold_pct;
    container.innerHTML = `
      <section class="chart-grid">
        <article class="glass-card">
          <div class="panel-head"><h2>Más vendidos</h2></div>
          <div class="table-wrap"><table><thead><tr><th>Producto</th><th>Cant.</th></tr></thead><tbody>
            ${bundle.top_qty.map((row) => `<tr><td>${escapeHtml(row.item_nombre)}</td><td class="mono">${row.cantidad}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">Sin datos</td></tr>'}
          </tbody></table></div>
        </article>
        <article class="glass-card">
          <div class="panel-head"><h2>Mayor ingreso</h2></div>
          <div class="table-wrap"><table><thead><tr><th>Producto</th><th>Ingreso</th></tr></thead><tbody>
            ${bundle.top_ingreso.map((row) => `<tr><td>${escapeHtml(row.item_nombre)}</td><td class="mono">${money.format(Number(row.ingreso))}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">Sin datos</td></tr>'}
          </tbody></table></div>
        </article>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Márgenes por producto</h2><span class="subtle">Receta en ${margenes.cobertura.con_receta}/${margenes.cobertura.total} productos</span></div>
        <div class="threshold-control">
          <label for="margin-threshold">Umbral de margen saludable</label>
          <input type="number" id="margin-threshold" min="0" max="100" value="${threshold}">
          <span>%</span>
          <button type="button" class="button" data-save-threshold>Guardar</button>
        </div>
        <div class="export-row"><button type="button" class="pill" data-export="margenes">Exportar CSV</button></div>
        <div class="table-wrap"><table class="margin-table"><thead><tr><th>Producto</th><th>Precio</th><th>Costo</th><th>Margen</th><th>% Margen</th><th>Vendidos (30d)</th></tr></thead><tbody>
          ${margenes.items.length ? margenes.items.map((item) => `<tr><td>${escapeHtml(item.nombre)}</td><td class="mono">${money.format(item.precio)}</td><td class="mono">${money.format(item.costo)}</td><td class="mono">${money.format(item.margen)}</td><td class="mono ${item.bajo_umbral ? 'low-margin' : ''}">${item.margen_pct === null ? '—' : item.margen_pct.toFixed(1) + '%'}${item.bajo_umbral ? '<span class="badge-low">Bajo</span>' : ''}</td><td class="mono">${item.vendidos_30d}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">Sin productos con receta de costo</td></tr>'}
        </tbody></table></div>
      </section>`;
  }

  function renderOperacion() {
    const container = document.getElementById('reportes-content');
    if (!bundle) { container.innerHTML = `<div class="panel">${loading}</div>`; return; }
    const celdas = bundle.horas || [];
    const grid = {};
    let max = 0;
    celdas.forEach((cell) => {
      grid[`${cell.dow}-${cell.hora}`] = cell;
      max = Math.max(max, Number(cell.ordenes));
    });
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const heatmapRows = DOW_LABELS.map((label, dow) => {
      const cells = hours.map((hour) => {
        const cell = grid[`${dow}-${hour}`];
        if (!cell || Number(cell.ordenes) === 0) return '<td class="empty-cell"></td>';
        const intensity = max > 0 ? Number(cell.ordenes) / max : 0;
        const bg = `rgba(42,157,143,${(0.15 + intensity * 0.75).toFixed(2)})`;
        return `<td style="background:${bg}" title="${label} ${hour}:00 — ${cell.ordenes} órdenes, ${money.format(Number(cell.ingresos))}">${cell.ordenes}</td>`;
      }).join('');
      return `<tr><th>${label}</th>${cells}</tr>`;
    }).join('');

    container.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h2>Horas pico (órdenes por día × hora)</h2></div>
        <div class="heatmap-wrap"><table class="heatmap">
          <thead><tr><th></th>${hours.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${heatmapRows}</tbody>
        </table></div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Desempeño por mesa</h2></div>
        <div class="export-row"><button type="button" class="pill" data-export="mesas">Exportar CSV</button></div>
        <div class="table-wrap"><table><thead><tr><th>Mesa</th><th>Órdenes</th><th>Ingresos</th><th>Ticket promedio</th><th>Min. promedio</th></tr></thead><tbody>
          ${(mesas || []).length ? mesas.map((row) => `<tr><td>${escapeHtml(row.mesa_nombre)}</td><td class="mono">${row.ordenes}</td><td class="mono">${money.format(Number(row.ingresos))}</td><td class="mono">${money.format(Number(row.ticket))}</td><td class="mono">${row.min_prom ? Number(row.min_prom).toFixed(0) : '—'}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">Sin órdenes cerradas en el período</td></tr>'}
        </tbody></table></div>
      </section>`;
  }

  const renderers = { resumen: renderResumen, menu: renderMenu, operacion: renderOperacion };

  function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    renderers[tab]();
  }

  async function loadData() {
    const { from, to } = rangeForPeriod(period);
    document.getElementById('reportes-content').innerHTML = `<div class="panel">${loading}</div>`;
    try {
      const [bundleData, margenesData, mesasData] = await Promise.all([
        api(`/api/reportes/v2?from=${from}&to=${to}`),
        api('/api/reportes/margenes'),
        api(`/api/reportes/mesas?from=${from}&to=${to}`)
      ]);
      const horas = await api(`/api/reportes/horas?from=${from}&to=${to}`);
      bundle = { ...bundleData, horas: horas.celdas || [] };
      margenes = margenesData;
      mesas = mesasData.mesas || [];
      switchTab(document.querySelector('.tab-btn.active')?.dataset.tab || 'resumen');
    } catch (error) {
      document.getElementById('reportes-content').innerHTML = `<div class="error" role="alert">${escapeHtml(error.message)}</div>`;
    }
  }

  function exportCurrentTab(tab) {
    if (!bundle) return;
    if (tab === 'margenes' && margenes) {
      downloadCsv('margenes.csv', ['Producto', 'Precio', 'Costo', 'Margen', 'Margen %', 'Vendidos 30d'],
        margenes.items.map((item) => [item.nombre, item.precio, item.costo, item.margen, item.margen_pct?.toFixed(1) ?? '', item.vendidos_30d]));
    } else if (tab === 'mesas' && mesas) {
      downloadCsv('mesas.csv', ['Mesa', 'Órdenes', 'Ingresos', 'Ticket promedio', 'Minutos promedio'],
        mesas.map((row) => [row.mesa_nombre, row.ordenes, row.ingresos, row.ticket, row.min_prom ? Number(row.min_prom).toFixed(0) : '']));
    }
  }

  async function onAppClick(event) {
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) { switchTab(tabButton.dataset.tab); return; }
    const exportButton = event.target.closest('[data-export]');
    if (exportButton) { exportCurrentTab(exportButton.dataset.export); return; }
    if (event.target.closest('[data-save-threshold]')) {
      const input = document.getElementById('margin-threshold');
      const value = Number(input.value);
      try {
        await api('/api/settings/margin_threshold_pct', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) });
        Orama.toast('Umbral actualizado', 'success');
        margenes = await api('/api/reportes/margenes');
        renderMenu();
      } catch (error) {
        Orama.toast(error.message, 'error');
      }
    }
  }

  function onPeriodChange(event) {
    if (event.target.id === 'reportes-period') {
      period = event.target.value;
      loadData();
    }
  }

  renderShell();
  app.addEventListener('click', onAppClick);
  app.addEventListener('change', onPeriodChange);
  await loadData();

  return () => {
    destroyCharts();
    app.removeEventListener('click', onAppClick);
    app.removeEventListener('change', onPeriodChange);
  };
}

Orama.routes.reportes = reportes;
