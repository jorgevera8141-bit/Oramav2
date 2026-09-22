const categoryPhotos = {
  'Especialidades de Cafe': '/images/coffee-beans.jpg',
  'Cafe Espresso y Chocolate': '/images/coffee-beans.jpg',
  Reposteria: '/images/pastries.jpg',
  Tes: '/images/iced-tea.jpg'
};

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatClockDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatElapsedDuration(loginTime, now = new Date()) {
  const start = new Date(loginTime);
  if (Number.isNaN(start.getTime())) return '—';
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${String(minutes).padStart(2, '0')} min`;
}

function formatSummaryHours(row) {
  const hours = Number.isFinite(Number(row.total_hours))
    ? Number(row.total_hours)
    : Number((Number(row.total_minutes || 0) / 60).toFixed(2));
  return hours.toFixed(2);
}

async function dashboard() {
  const [ordersData, inventoryData] = await Promise.all([
    api('/api/ordenes/dia'),
    api('/api/inventory/low-stock-count')
  ]);
  const orders = ordersData.ordenes || [];
  const closed = orders.filter((order) => order.status === 'cerrada');
  const cash = closed.reduce((sum, order) => sum + Number(order.amount_cash || 0), 0);
  const card = closed.reduce((sum, order) => sum + Number(order.amount_card || 0), 0);
  const open = orders.filter((order) => order.status === 'abierta');

  app.innerHTML = pageHead(
    'Control de hoy',
    'Resumen',
    new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }),
    '/images/cafe-ambiance.jpg'
  ) + `<section class="grid"><article class="glass-card"><p class="kpi-label">Ventas hoy</p><p class="kpi-value">${money.format(closed.reduce((sum, order) => sum + Number(order.total || 0), 0))}</p></article><article class="glass-card"><p class="kpi-label">Efectivo</p><p class="kpi-value">${money.format(cash)}</p></article><article class="glass-card"><p class="kpi-label">Tarjeta</p><p class="kpi-value">${money.format(card)}</p></article><article class="glass-card kpi-card warn"><p class="kpi-label">Inventario bajo</p><p class="kpi-value">${inventoryData.count || 0}</p></article></section><section class="panel"><div class="panel-head"><h2>Órdenes abiertas</h2><span class="subtle">${open.length} activas</span></div>${orderTable(open)}</section>`;
}

function orderTable(orders) {
  return `<div class="table-wrap"><table><thead><tr><th scope="col">Orden</th><th scope="col">Mesa</th><th scope="col">Total</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>${orders.length ? orders.map((order) => `<tr><td class="mono">#${order.id}</td><td>${escapeHtml(order.mesa_nombre || 'Mostrador')}</td><td class="mono">${money.format(Number(order.total || 0))}</td><td>${statusBadge(order.status)}</td><td>${order.status === 'abierta' ? `<div class="action-row"><button class="button" data-action="cerrar-efectivo" data-id="${order.id}" data-total="${order.total || 0}" aria-label="Cobrar orden #${order.id} en efectivo">Efectivo</button><button class="button" data-action="cerrar-tarjeta" data-id="${order.id}" data-total="${order.total || 0}" aria-label="Cobrar orden #${order.id} con tarjeta">Tarjeta</button><button class="button danger" data-action="cancel" data-id="${order.id}" aria-label="Cancelar orden #${order.id}">Cancelar</button></div>` : '—'}</td></tr>`).join('') : '<tr><td class="empty" colspan="5">No hay órdenes abiertas</td></tr>'}</tbody></table></div>`;
}

async function mesas() {
  const data = await api('/api/mesas');
  app.innerHTML = pageHead('Sala', 'Mesas', 'Estado de las mesas en tiempo real') + `<section class="mesa-grid">${(data.mesas || []).map((mesa) => `<article class="mesa-card ${mesa.status === 'ocupada' ? 'occupied' : ''}"><h2 class="mesa-name">${escapeHtml(mesa.nombre)}</h2>${statusBadge(mesa.status)}</article>`).join('') || '<div class="empty">No hay mesas configuradas</div>'}</section>`;
}

async function orders() {
  const data = await api('/api/ordenes');
  const rows = data.ordenes || [];
  app.innerHTML = pageHead('Operación', 'Órdenes', 'Seguimiento de ventas y cobros') + `<section class="panel">${orderTable(rows)}</section>`;
}

function staffTableMarkup(members) {
  return `<div class="table-wrap"><table><thead><tr><th scope="col">Nombre</th><th scope="col">Tipo</th><th scope="col">Idioma</th><th scope="col">Estado</th></tr></thead><tbody>${members.length ? members.map((member) => `<tr><td><span class="avatar">${escapeHtml(member.nombre).charAt(0).toUpperCase()}</span> ${escapeHtml(member.nombre)}</td><td>${escapeHtml(member.tipo)}</td><td>${escapeHtml(member.idioma || 'es')}</td><td>${member.activo ? statusBadge('disponible') : statusBadge('cancelada')}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">Sin staff registrado</td></tr>'}</tbody></table></div>`;
}

async function staff() {
  const data = await api('/api/staff');
  const members = data.staff || [];
  const activeMembers = members.filter((member) => member.activo);
  const initialDate = localDateValue();
  let range = { from: initialDate, to: initialDate };
  let clockedIn = [];
  let summary = [];
  let loadingClockedIn = true;
  let loadingSummary = true;
  let clockedInError = '';
  let summaryError = '';
  let submitting = false;
  let feedback = {
    tone: activeMembers.length ? 'neutral' : 'warning',
    message: activeMembers.length
      ? 'Selecciona a tu colaborador e ingresa el PIN para registrar entrada o salida.'
      : 'No hay personal activo disponible para registrar asistencia.'
  };
  let elapsedTimer = null;
  let refreshTimer = null;

  function renderShell() {
    app.innerHTML = pageHead('Equipo', 'Staff', 'Control de asistencia y personal activo en operación') + `
      <section class="staff-grid">
        <article class="glass-card staff-attendance-card">
          <div class="panel-head staff-panel-head">
            <div>
              <p class="eyebrow">Asistencia</p>
              <h2>Reloj de asistencia</h2>
              <p class="subtle">Entrada y salida con PIN, sin exponer credenciales.</p>
            </div>
          </div>
          <form id="staff-attendance-form" class="staff-attendance-form" novalidate>
            <div class="field-group staff-field-span">
              <label for="staff-attendance-member">Empleado</label>
              <select id="staff-attendance-member" class="search" ${activeMembers.length ? '' : 'disabled'}>
                ${activeMembers.length
                  ? activeMembers.map((member) => `<option value="${escapeHtml(member.nombre)}">${escapeHtml(member.nombre)} · ${escapeHtml(member.tipo)}</option>`).join('')
                  : '<option value="">Sin personal activo</option>'}
              </select>
            </div>
            <div class="field-group">
              <label for="staff-attendance-pin">PIN</label>
              <input id="staff-attendance-pin" class="search" type="password" inputmode="numeric" maxlength="10" autocomplete="current-password">
            </div>
            <div class="field-group">
              <label for="staff-attendance-screen">Pantalla / contexto (opcional)</label>
              <input id="staff-attendance-screen" class="search" type="text" maxlength="80" placeholder="POS, barra, caja, etc.">
            </div>
            <div class="staff-attendance-actions staff-field-span">
              <button type="submit" class="button" data-clock-action="in">Registrar entrada</button>
              <button type="submit" class="button" data-clock-action="out">Registrar salida</button>
            </div>
            <p id="staff-attendance-feedback" class="staff-inline-status ${feedback.tone}" role="status" aria-live="polite">${escapeHtml(feedback.message)}</p>
          </form>
        </article>

        <section class="panel staff-live-panel" aria-labelledby="staff-live-title">
          <div class="panel-head">
            <div>
              <h2 id="staff-live-title">Actualmente en turno</h2>
              <p class="subtle">Actualización automática discreta para pantallas POS.</p>
            </div>
            <button type="button" class="button" data-staff-live-refresh>Actualizar</button>
          </div>
          <div id="staff-live-content" aria-live="polite"></div>
        </section>
      </section>

      <section class="panel staff-summary-panel" aria-labelledby="staff-summary-title">
        <div class="panel-head">
          <div>
            <h2 id="staff-summary-title">Resumen de horas</h2>
            <p class="subtle">Preparado para futura exportación a CSV, Sheets o Excel.</p>
          </div>
        </div>
        <div class="staff-summary-toolbar">
          <div class="field-group">
            <label for="staff-summary-from">Desde</label>
            <input id="staff-summary-from" class="search" type="date" value="${range.from}">
          </div>
          <div class="field-group">
            <label for="staff-summary-to">Hasta</label>
            <input id="staff-summary-to" class="search" type="date" value="${range.to}">
          </div>
          <div class="staff-attendance-actions">
            <button type="button" class="button" data-staff-summary-apply>Ver resumen</button>
            <button type="button" class="button" data-staff-summary-today>Hoy</button>
          </div>
        </div>
        <div id="staff-summary-content" aria-live="polite"></div>
      </section>

      <section class="panel staff-table-panel" aria-labelledby="staff-table-title">
        <div class="panel-head">
          <div>
            <h2 id="staff-table-title">Staff registrado</h2>
            <p class="subtle">La administración actual se conserva sin cambios de comportamiento.</p>
          </div>
          <span class="subtle">${members.length} integrante(s)</span>
        </div>
        ${staffTableMarkup(members)}
      </section>`;
  }

  function syncFeedback() {
    const feedbackNode = document.getElementById('staff-attendance-feedback');
    if (!feedbackNode) return;
    feedbackNode.className = `staff-inline-status ${feedback.tone}`;
    feedbackNode.textContent = feedback.message;
  }

  function syncFormState() {
    const form = document.getElementById('staff-attendance-form');
    if (!form) return;
    form.setAttribute('aria-busy', String(submitting));
    form.querySelectorAll('button, select, input').forEach((element) => {
      element.disabled = submitting || !activeMembers.length;
    });
    syncFeedback();
  }

  function renderClockedIn() {
    const container = document.getElementById('staff-live-content');
    if (!container) return;
    if (loadingClockedIn) {
      container.innerHTML = `<div class="empty" role="status">Cargando asistencia...</div>`;
      return;
    }
    if (clockedInError && !clockedIn.length) {
      container.innerHTML = `<div class="error" role="alert">${escapeHtml(clockedInError)}</div>`;
      return;
    }
    container.innerHTML = `
      ${clockedInError ? `<div class="error" role="alert">${escapeHtml(clockedInError)}</div>` : ''}
      ${clockedIn.length ? `<div class="staff-live-list">${clockedIn.map((member) => `<article class="staff-live-item"><div class="staff-live-top"><div><p class="staff-live-name">${escapeHtml(member.nombre)}</p><p class="staff-live-meta">Entrada: ${escapeHtml(formatClockDateTime(member.session?.login_time))}</p></div><span class="badge-estado live">En turno</span></div><div class="staff-live-bottom"><p class="staff-live-meta">Tiempo transcurrido</p><p class="staff-live-duration mono" data-elapsed-start="${escapeHtml(member.session?.login_time || '')}">${escapeHtml(formatElapsedDuration(member.session?.login_time))}</p>${member.session?.screen ? `<p class="staff-live-meta">Contexto: <span class="staff-screen-chip">${escapeHtml(member.session.screen)}</span></p>` : ''}</div></article>`).join('')}</div>` : '<div class="empty">Nadie ha registrado entrada en este momento.</div>'}`;
  }

  function renderSummary() {
    const container = document.getElementById('staff-summary-content');
    if (!container) return;
    if (loadingSummary) {
      container.innerHTML = `<div class="empty" role="status">Cargando resumen de horas...</div>`;
      return;
    }
    if (summaryError && !summary.length) {
      container.innerHTML = `<div class="error" role="alert">${escapeHtml(summaryError)}</div>`;
      return;
    }
    container.innerHTML = `
      ${summaryError ? `<div class="error" role="alert">${escapeHtml(summaryError)}</div>` : ''}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Empleado</th>
              <th scope="col">Sesiones</th>
              <th scope="col">Minutos</th>
              <th scope="col">Horas</th>
            </tr>
          </thead>
          <tbody>
            ${summary.length ? summary.map((row) => `<tr><td>${escapeHtml(row.nombre)}</td><td class="mono">${Number(row.sessions_count || 0)}</td><td class="mono">${Number(row.total_minutes || 0)}</td><td class="mono">${escapeHtml(formatSummaryHours(row))}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">No hay sesiones en el rango seleccionado.</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  function tickElapsedDurations() {
    document.querySelectorAll('[data-elapsed-start]').forEach((node) => {
      node.textContent = formatElapsedDuration(node.dataset.elapsedStart);
    });
  }

  async function loadClockedIn(options = {}) {
    if (!options.silent) {
      loadingClockedIn = true;
      clockedInError = '';
      renderClockedIn();
    }
    try {
      const response = await api('/api/staff/clocked-in');
      clockedIn = response.staff || [];
      clockedInError = '';
    } catch (error) {
      clockedInError = error.message;
      if (!options.silent) clockedIn = [];
    } finally {
      loadingClockedIn = false;
      renderClockedIn();
      tickElapsedDurations();
    }
  }

  async function loadSummary(options = {}) {
    if (!options.silent) {
      loadingSummary = true;
      summaryError = '';
      renderSummary();
    }
    try {
      const query = new URLSearchParams({ from: range.from, to: range.to });
      const response = await api(`/api/staff/hours-summary?${query.toString()}`);
      summary = response.summary || [];
      summaryError = '';
    } catch (error) {
      summaryError = error.message;
      if (!options.silent) summary = [];
    } finally {
      loadingSummary = false;
      renderSummary();
    }
  }

  async function refreshAttendanceData(options = {}) {
    await Promise.all([
      loadClockedIn(options),
      loadSummary(options)
    ]);
  }

  function resetSummaryRangeToToday() {
    const today = localDateValue();
    range = { from: today, to: today };
    const fromInput = document.getElementById('staff-summary-from');
    const toInput = document.getElementById('staff-summary-to');
    if (fromInput) fromInput.value = range.from;
    if (toInput) toInput.value = range.to;
  }

  async function onSubmit(event) {
    if (event.target.id !== 'staff-attendance-form') return;
    event.preventDefault();
    const action = event.submitter?.dataset.clockAction || 'in';
    const nombre = document.getElementById('staff-attendance-member')?.value || '';
    const pinInput = document.getElementById('staff-attendance-pin');
    const screenInput = document.getElementById('staff-attendance-screen');
    const pin = pinInput?.value || '';
    const screen = screenInput?.value.trim() || '';

    if (!nombre) {
      feedback = { tone: 'error', message: 'Selecciona a un empleado activo.' };
      syncFormState();
      return;
    }
    if (!pin) {
      feedback = { tone: 'error', message: 'Ingresa el PIN para registrar la asistencia.' };
      syncFormState();
      pinInput?.focus();
      return;
    }

    const isClockOut = action === 'out';
    const endpoint = isClockOut ? '/api/staff/clock-out' : '/api/staff/clock-in';
    submitting = true;
    feedback = {
      tone: 'neutral',
      message: isClockOut ? 'Registrando salida...' : 'Registrando entrada...'
    };
    syncFormState();

    try {
      const response = await api(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, pin, ...(screen ? { screen } : {}) })
      });
      feedback = {
        tone: 'success',
        message: isClockOut
          ? `${response.staff?.nombre || nombre} registró su salida correctamente.`
          : `${response.staff?.nombre || nombre} registró su entrada correctamente.`
      };
      if (pinInput) pinInput.value = '';
      Orama.toast(feedback.message, 'success');
      await refreshAttendanceData({ silent: true });
    } catch (error) {
      feedback = { tone: 'error', message: error.message };
      Orama.toast(error.message, 'error');
    } finally {
      submitting = false;
      syncFormState();
    }
  }

  async function onClick(event) {
    if (event.target.closest('[data-staff-live-refresh]')) {
      await loadClockedIn();
      return;
    }

    if (event.target.closest('[data-staff-summary-today]')) {
      resetSummaryRangeToToday();
      await loadSummary();
      return;
    }

    if (event.target.closest('[data-staff-summary-apply]')) {
      const nextFrom = document.getElementById('staff-summary-from')?.value || '';
      const nextTo = document.getElementById('staff-summary-to')?.value || '';
      if (!nextFrom || !nextTo) {
        summaryError = 'Selecciona ambas fechas para consultar el resumen.';
        renderSummary();
        return;
      }
      if (nextFrom > nextTo) {
        summaryError = 'La fecha inicial no puede ser mayor que la final.';
        renderSummary();
        return;
      }
      range = { from: nextFrom, to: nextTo };
      await loadSummary();
    }
  }

  renderShell();
  syncFormState();
  renderClockedIn();
  renderSummary();
  app.addEventListener('submit', onSubmit);
  app.addEventListener('click', onClick);
  await refreshAttendanceData();

  elapsedTimer = window.setInterval(tickElapsedDurations, 60000);
  refreshTimer = window.setInterval(() => {
    loadClockedIn({ silent: true }).catch((error) => console.error(error));
  }, 90000);

  return () => {
    app.removeEventListener('submit', onSubmit);
    app.removeEventListener('click', onClick);
    if (elapsedTimer) window.clearInterval(elapsedTimer);
    if (refreshTimer) window.clearInterval(refreshTimer);
  };
}

Orama.routes.dashboard = dashboard;
Orama.routes.mesas = mesas;
Orama.routes.ordenes = orders;
Orama.routes.staff = staff;

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  if (action === 'cancel') {
    const confirmed = await Orama.confirm('¿Cancelar esta orden?', { danger: true, okText: 'Sí, cancelar' });
    if (!confirmed) return;
  }
  const row = button.closest('.action-row');
  (row ? row.querySelectorAll('button') : [button]).forEach((item) => {
    item.disabled = true;
  });
  try {
    if (action === 'cerrar-efectivo' || action === 'cerrar-tarjeta') {
      const amount = Number(button.dataset.total || 0);
      const payload = action === 'cerrar-tarjeta'
        ? { payment_method: 'tarjeta', amount_card: amount }
        : { payment_method: 'efectivo', amount_cash: amount };
      await api(`/api/ordenes/${id}/cerrar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else if (action === 'cancel') {
      await api(`/api/ordenes/${id}/cancelar`, { method: 'PUT' });
    }
    await render();
  } catch (error) {
    app.innerHTML = `<div class="error" role="alert">${escapeHtml(error.message)}</div>`;
  }
});
