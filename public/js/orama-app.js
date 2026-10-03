const categoryPhotos = {
  'Especialidades de Cafe': '/images/coffee-beans.jpg',
  'Cafe Espresso y Chocolate': '/images/coffee-beans.jpg',
  'Reposteria': '/images/pastries.jpg',
  'Tes': '/images/iced-tea.jpg'
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

// Resolves null on cancel/Escape (never rejects), so callers just check for
// a falsy result instead of needing a try/catch around the prompt itself —
// closing the modal without touching anything shouldn't surface as an error.
async function promptForStaffPin({ title, subtitle }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'orama-overlay';
    overlay.innerHTML = `
      <div class="orama-modal" role="dialog" aria-modal="true">
        <p class="orama-modal-message">${escapeHtml(title)}<br><span class="subtle">${escapeHtml(subtitle)}</span></p>
        <form id="staff-pin-form">
          <div class="field-group">
            <label for="staff-nombre">Nombre</label>
            <input type="text" id="staff-nombre" class="search" required>
          </div>
          <div class="field-group">
            <label for="staff-pin">PIN</label>
            <input type="password" id="staff-pin" class="search" inputmode="numeric" maxlength="10" autocomplete="off" required>
          </div>
          <div class="orama-modal-actions">
            <button type="button" class="button" id="staff-pin-cancel">Cancelar</button>
            <button type="submit" class="button" id="staff-pin-ok">OK</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector('#staff-pin-form');
    const cancelBtn = overlay.querySelector('#staff-pin-cancel');
    const nombreInput = overlay.querySelector('#staff-nombre');
    const pinInput = overlay.querySelector('#staff-pin');

    const close = (value) => { overlay.remove(); resolve(value); };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const nombre = nombreInput.value.trim();
      const pin = pinInput.value;
      close(nombre && pin ? { nombre, pin } : null);
    });
    cancelBtn.addEventListener('click', () => close(null));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(null); });

    nombreInput.focus();
  });
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
  // Comped orders (cortesía, canje, a comped share of a split) are giveaways, not sales.
  const comps = closed.reduce((sum, order) => sum + Number(order.comp_value || 0), 0);
  const sales = closed.reduce((sum, order) => sum + Number(order.total || 0), 0) - comps;
  const open = orders.filter((order) => order.status === 'abierta');

  app.innerHTML = pageHead(
    'Control de hoy',
    'Resumen',
    new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }),
    '/images/cafe-ambiance.jpg',
    '<a class="button primary" href="#nueva-orden">Nueva orden</a>'
  ) + `<section class="grid"><article class="glass-card"><p class="kpi-label">Ventas hoy</p><p class="kpi-value">${money.format(sales)}</p>${comps > 0 ? `<div class="kpi-delta flat">Cortesías: ${money.format(comps)}</div>` : ''}</article><article class="glass-card"><p class="kpi-label">Efectivo</p><p class="kpi-value">${money.format(cash)}</p></article><article class="glass-card"><p class="kpi-label">Tarjeta</p><p class="kpi-value">${money.format(card)}</p></article><article class="glass-card kpi-card warn"><p class="kpi-label">Inventario bajo</p><p class="kpi-value">${inventoryData.count || 0}</p></article></section><section class="panel"><div class="panel-head"><h2>Órdenes abiertas</h2><span class="subtle">${open.length} activas</span></div>${orderTable(open)}</section>`;
}

function orderTable(orders) {
  return `<div class="table-wrap"><table class="stack-table"><thead><tr><th scope="col">Orden</th><th scope="col">Mesa</th><th scope="col">Total</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>${orders.length ? orders.map((order) => `<tr><td class="mono" data-label="Orden">#${order.id}</td><td data-label="Mesa">${escapeHtml(order.mesa_nombre || 'Mostrador')}</td><td class="mono" data-label="Total">${money.format(Number(order.total || 0))}</td><td data-label="Estado">${statusBadge(order.status)}</td><td data-label="Acciones">${order.status === 'abierta' ? `<div class="action-row"><button class="button" data-action="cerrar-efectivo" data-id="${order.id}" data-total="${order.total || 0}" aria-label="Cobrar orden #${order.id} en efectivo">Efectivo</button><button class="button" data-action="cerrar-tarjeta" data-id="${order.id}" data-total="${order.total || 0}" aria-label="Cobrar orden #${order.id} con tarjeta">Tarjeta</button><button class="button danger" data-action="cancel" data-id="${order.id}" aria-label="Cancelar orden #${order.id}">Cancelar</button></div>` : '—'}</td></tr>`).join('') : '<tr><td class="empty" colspan="5">No hay órdenes abiertas</td></tr>'}</tbody></table></div>`;
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
              <input id="staff-attendance-pin" class="search" type="password" inputmode="numeric" maxlength="10" autocomplete="off">
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
    const clockedInList = clockedIn.length
      ? `<div class="staff-live-list">${clockedIn.map(member => `
          <article class="staff-live-item">
            <div class="staff-live-top">
              <div>
                <p class="staff-live-name">${escapeHtml(member.nombre)}</p>
                <p class="staff-live-meta">Entrada: ${escapeHtml(formatClockDateTime(member.session?.login_time))}</p>
              </div>
              <span class="badge-estado live">En turno</span>
            </div>
            <div class="staff-live-bottom">
              <p class="staff-live-meta">Tiempo transcurrido</p>
              <p class="staff-live-duration mono" data-elapsed-start="${escapeHtml(member.session?.login_time || '')}">${escapeHtml(formatElapsedDuration(member.session?.login_time))}</p>
              ${member.session?.screen ? `<p class="staff-live-meta">Contexto: <span class="staff-screen-chip">${escapeHtml(member.session.screen)}</span></p>` : ''}
            </div>
          </article>
        `).join('')}</div>`
      : '<div class="empty">Nadie ha registrado entrada en este momento.</div>';
    container.innerHTML = `
      ${clockedInError ? `<div class="error" role="alert">${escapeHtml(clockedInError)}</div>` : ''}
      ${clockedInList}
    `;
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
      clockedIn = [];
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
      await refreshAttendanceData();
      return;
    }

    if (event.target.closest('[data-staff-summary-today]')) {
      resetSummaryRangeToToday();
      await refreshAttendanceData();
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
    loadClockedIn({ silent: true });
  }, 90000);

  return () => {
    app.removeEventListener('submit', onSubmit);
    app.removeEventListener('click', onClick);
    if (elapsedTimer) window.clearInterval(elapsedTimer);
    if (refreshTimer) window.clearInterval(refreshTimer);
  };
}

// Managers-only screens check the PIN on entry: a name alone proves nothing.
async function confirmManager({ nombre, pin }) {
  try {
    await api('/api/access/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor_nombre: nombre, actor_pin: pin }) });
    return true;
  } catch (error) {
    Orama.toast(error.message, 'error');
    window.location.hash = '#dashboard';
    return false;
  }
}

async function nomina() {
  // Check if user is management via PIN
  const auth = await promptForStaffPin({ title: 'Acceso a Nómina', subtitle: 'Solo para gerentes' });
  if (!auth) { window.location.hash = '#dashboard'; return; } // cancelled — back to the dashboard instead of a stuck loading spinner
  const { nombre, pin } = auth;

  try {
    // Verify staff is management
    const staffData = await api('/api/staff/active');
    const staffMember = staffData.staff.find(s => s.nombre === nombre && s.activo);
    if (!staffMember) {
      Orama.toast('Acceso denegado', 'error');
      return;
    }
    if (staffMember.tipo !== 'management') {
      // Staff see only their own Marcación here (their PIN is checked by the clock endpoints).
      app.innerHTML = pageHead('Nómina', 'Gestión de tiempo y pagos', 'Tu marcación de entrada y salida', '/images/cafe-ambiance.jpg') + '<section class="panel" id="nomina-self"></section>';
      return await marcarSelfCard(document.getElementById('nomina-self'), { nombre, pin });
    }
    if (!(await confirmManager(auth))) return;

    // Load nomina interface
    app.innerHTML = pageHead('Nómina', 'Gestión de tiempo y pagos', 'Control de asistencia y cálculo de pagos', '/images/cafe-ambiance.jpg');

    // Get all staff for the interface (rates are included only for a verified manager)
    const staffResponse = await api('/api/staff', { headers: managerHeaders(auth) });
    const staffList = staffResponse.staff || [];

    // Get weekly payroll data
    const payrollResponse = await api('/api/staff/payroll/weekly', { headers: managerHeaders(auth) });
    const payrollData = payrollResponse.payroll || [];

    app.innerHTML += `
      <section class="panel">
        <div class="tabs">
          <button class="tab active" data-tab="clock">Marcación</button>
          <button class="tab" data-tab="rates">Tarifas</button>
          <button class="tab" data-tab="payroll">Nómina</button>
          <button class="tab" data-tab="tips">Propinas</button>
          <button class="tab" data-tab="corregir">Corregir Marcaciones</button>
        </div>
        <div class="tab-content" id="clock-tab">
          <h3>Marcación de Entrada/Salida</h3>
          <div class="staff-grid">
            ${staffList.map(s => `
              <article class="staff-card ${s.activo ? 'active' : 'inactive'}">
                <div class="staff-info">
                  <span class="avatar">${escapeHtml(s.nombre).charAt(0).toUpperCase()}</span>
                  <div>
                    <strong>${escapeHtml(s.nombre)}</strong>
                    <span class="role">${escapeHtml(s.tipo)}</span>
                  </div>
                </div>
                <div class="clock-actions">
                  <button class="button success clock-in-btn" data-staff-id="${s.id}" ${!s.activo ? 'disabled' : ''}>
                    Entrada
                  </button>
                  <button class="button danger clock-out-btn" data-staff-id="${s.id}" ${!s.activo ? 'disabled' : ''}>
                    Salida
                  </button>
                  <div class="clock-status" data-staff-id="${s.id}">
                    <!-- Status will be updated by JS -->
                  </div>
                </div>
              </article>
            `).join('')}
          </div>
        </div>
        <div class="tab-content" id="rates-tab">
          <h3>Configuración de Tarifas Horarias</h3>
          <div class="staff-grid">
            ${staffList.map(s => `
              <article class="staff-card">
                <div class="staff-info">
                  <span class="avatar">${escapeHtml(s.nombre).charAt(0).toUpperCase()}</span>
                  <div>
                    <strong>${escapeHtml(s.nombre)}</strong>
                    <span class="role">${escapeHtml(s.tipo)}</span>
                  </div>
                </div>
                <div class="rate-settings">
                  <label>Tarifa por hora (MXN):</label>
                  <input type="number" step="0.01" min="0" value="${s.hourly_rate || 0}" data-staff-id="${s.id}" class="hourly-rate-input">
                  <span class="rate-currency">MXN/hora</span>
                </div>
              </article>
            `).join('')}
          </div>
          <button class="button primary" id="save-rates-btn">Guardar Tarifas</button>
        </div>
        <div class="tab-content" id="payroll-tab">
          <h3>Resumen Semanal de Nómina</h3>
          ${payrollData.length > 0 ? `
            <div class="payroll-summary">
              <p><strong>Total nómina semanal:</strong> ${money.format(payrollResponse.summary.totalPayroll)}</p>
              <p><strong>Promedio por empleado:</strong> ${money.format(payrollResponse.summary.averageWeeklyEarnings)}</p>
              <p><strong>Empleados activos:</strong> ${payrollResponse.summary.totalStaff}</p>
            </div>
            <table class="payroll-table">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Tipo</th>
                  <th>Tarifa/Hora</th>
                  <th>Horas Semanales</th>
                  <th>Pago Semanal</th>
                </tr>
              </thead>
              <tbody>
                ${payrollData.map(p => `
                  <tr>
                    <td><span class="avatar">${escapeHtml(p.nombre).charAt(0).toUpperCase()}</span> ${escapeHtml(p.nombre)}</td>
                    <td>${escapeHtml(p.tipo)}</td>
                    <td>${money.format(p.hourly_rate)}</td>
                    <td>${p.weeklyHours.toFixed(2)} hrs</td>
                    <td>${money.format(p.weeklyEarnings)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `
            <p class="empty">No hay datos de nómina disponibles</p>
          `}
        </div>
        <div class="tab-content" id="tips-tab">
          <h3>Distribución de Propinas</h3>
          <div class="tips-form">
            <label>Total de propinas a distribuir (MXN):</label>
            <input type="number" step="0.01" min="0" id="tips-amount" placeholder="Ej: 1500.00">
          </div>
          <div class="tips-options">
            <label>Método de distribución:</label>
            <select id="tips-distribution-type">
              <option value="hours_worked">Por horas trabajadas (recomendado)</option>
              <option value="equal">Distribución igual</option>
              <option value="percentage">Por porcentaje personalizado</option>
            </select>
          </div>
          <div id="tips-percentage-container" style="display: none;">
            <p>Ingrese porcentaje para cada empleado (total debe ser 100%):</p>
            <div id="tips-percentages"></div>
          </div>
          <button class="button primary" id="calculate-tips-btn">Calcular Distribución</button>
          <div id="tips-results" class="mt-4"></div>
        </div>
        <div class="tab-content" id="corregir-tab" style="display:none">
          <h3>Corregir Marcaciones</h3>
          <p class="subtle">Corrige entradas, salidas o descansos si alguien olvidó marcar o se equivocó. Últimos 7 días.</p>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th>Descanso (min)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="corregir-tbody">
                <tr><td colspan="5" class="empty">Cargando...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    `;

    // Add event listeners for tab switching
    const tabButtons = app.querySelectorAll('.tab');
    const tabContents = app.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;

        // Update active tab button
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        // Show corresponding tab content
        tabContents.forEach(content => {
          content.style.display = content.id === `${tab}-tab` ? 'block' : 'none';
        });
      });
    });

    // Add event listeners for clock in/out buttons
    const clockInButtons = app.querySelectorAll('.clock-in-btn');
    const clockOutButtons = app.querySelectorAll('.clock-out-btn');

    clockInButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const staffId = btn.dataset.staffId;
        btn.disabled = true;

        try {
          const response = await api('/api/staff/time-clock/clock-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staff_id: parseInt(staffId), nombre, pin })
          });

          if (response.success) {
            Orama.toast('Marcación de entrada registrada', 'success');
            // Update status display
            const statusEl = app.querySelector(`.clock-status[data-staff-id="${staffId}"]`);
            if (statusEl) {
              statusEl.innerHTML = '<span class="status-indicator online"></span> En sesión';
              statusEl.style.color = 'var(--success)';
            }
          } else {
            Orama.toast(response.error || 'Error al marcar entrada', 'error');
          }
        } catch (error) {
          Orama.toast('Error de conexión', 'error');
          console.error(error);
        } finally {
          btn.disabled = false;
        }
      });
    });

    clockOutButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const staffId = btn.dataset.staffId;
        btn.disabled = true;

        try {
          const response = await api('/api/staff/time-clock/clock-out', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staff_id: parseInt(staffId), nombre, pin })
          });

          if (response.success) {
            Orama.toast('Marcación de salida registrada', 'success');
            // Update status display
            const statusEl = app.querySelector(`.clock-status[data-staff-id="${staffId}"]`);
            if (statusEl) {
              statusEl.innerHTML = '<span class="status-indicator offline"></span> Fuera de sesión';
              statusEl.style.color = 'var(--danger)';
            }
          } else {
            Orama.toast(response.error || 'Error al marcar salida', 'error');
          }
        } catch (error) {
          Orama.toast('Error de conexión', 'error');
          console.error(error);
        } finally {
          btn.disabled = false;
        }
      });
    });

    // Add event listener for saving hourly rates
    const saveRatesBtn = app.querySelector('#save-rates-btn');
    if (saveRatesBtn) {
      saveRatesBtn.addEventListener('click', async () => {
        const rateInputs = app.querySelectorAll('.hourly-rate-input');
        const updates = [];

        rateInputs.forEach(input => {
          const staffId = input.dataset.staffId;
          const rate = parseFloat(input.value);
          if (!isNaN(rate) && rate >= 0) {
            updates.push(
              api(`/api/staff/${staffId}/hourly-rate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hourly_rate: rate, nombre, pin })
              })
            );
          }
        });

        if (updates.length === 0) {
          Orama.toast('No hay tarifas válidas para actualizar', 'warning');
          return;
        }

        try {
          const results = await Promise.all(updates);
          const failed = results.filter(r => !r.success);

          if (failed.length === 0) {
            Orama.toast('Tarifas actualizadas correctamente', 'success');
          } else {
            Orama.toast(`${failed.length} tarifas no se pudieron actualizar`, 'error');
          }
        } catch (error) {
          Orama.toast('Error al actualizar tarifas', 'error');
          console.error(error);
        }
      });
    }

    // Add event listener for tips calculation
    const calculateTipsBtn = app.querySelector('#calculate-tips-btn');
    if (calculateTipsBtn) {
      calculateTipsBtn.addEventListener('click', async () => {
        const tipsAmountInput = app.querySelector('#tips-amount');
        const distributionTypeSelect = app.querySelector('#tips-distribution-type');
        const tipsAmount = parseFloat(tipsAmountInput.value);
        const distributionType = distributionTypeSelect.value;

        if (isNaN(tipsAmount) || tipsAmount <= 0) {
          Orama.toast('Por favor ingrese un monto válido de propinas', 'error');
          return;
        }

        // Percentage mode: send what the inputs say; the server checks they add up to 100.
        const percentages = {};
        if (distributionType === 'percentage') {
          app.querySelectorAll('#tips-percentage-container input[data-staff-id]').forEach((input) => {
            percentages[input.dataset.staffId] = parseFloat(input.value) || 0;
          });
        }

        try {
          const response = await api('/api/staff/payroll/tips-distribution', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tips_amount: tipsAmount,
              distribution_type: distributionType,
              ...(distributionType === 'percentage' ? { percentages } : {}),
              nombre,
              pin
            })
          });

          if (response.success) {
            let resultsHTML = `<h4>Resultado de la distribución:</h4>`;
            resultsHTML += `<p><strong>Total propinas:</strong> ${money.format(response.tipsAmount)}</p>`;
            resultsHTML += `<p><strong>Método:</strong> ${response.distributionType}</p>`;
            resultsHTML += `<p><strong>Distribuido:</strong> ${money.format(response.summary.totalDistributed)}</p>`;
            if (response.summary.remainingTips > 0) {
              resultsHTML += `<p><strong>Restante:</strong> ${money.format(response.summary.remainingTips)}</p>`;
            }
            resultsHTML += `<div class="mt-3"><strong>Distribución por empleado:</strong><ul>`;
            response.distribution.forEach(d => {
              resultsHTML += `<li><strong>${escapeHtml(d.nombre)}</strong>: ${money.format(d.amount)}`;
              if (d.hoursWorked !== undefined) {
                resultsHTML += ` (${d.hoursWorked.toFixed(2)} hrs)`;
              }
              resultsHTML += `</li>`;
            });
            resultsHTML += `</ul></div>`;

            const resultsContainer = app.querySelector('#tips-results');
            resultsContainer.innerHTML = resultsHTML;
            resultsContainer.style.display = 'block';

            Orama.toast('Distribución calculada correctamente', 'success');
          } else {
            Orama.toast(response.error || 'Error al calcular distribución', 'error');
          }
        } catch (error) {
          Orama.toast(error.message || 'Error de conexión', 'error');
          console.error(error);
        }
      });
    }

    // Show/hide percentage inputs based on distribution type
    const distributionTypeSelect = app.querySelector('#tips-distribution-type');
    const tipsPercentageContainer = app.querySelector('#tips-percentage-container');
    if (distributionTypeSelect && tipsPercentageContainer) {
      distributionTypeSelect.addEventListener('change', () => {
        if (distributionTypeSelect.value === 'percentage') {
          tipsPercentageContainer.style.display = 'block';
          // Load staff for percentage inputs
          tipsPercentageContainer.innerHTML = `
            ${staffList.map(s => `
              <div class="percentage-input">
                <label>${escapeHtml(s.nombre)}:</label>
                <input type="number" step="0.01" min="0" max="100" value="0" data-staff-id="${s.id}">
                <span>%</span>
              </div>
            `).join('')}
            <p class="mt-2"><small>Total: <span id="percentage-total">0</span>%</small></p>
          `;

          // Add listener to calculate total percentage
          const percentageInputs = tipsPercentageContainer.querySelectorAll('input[data-staff-id]');
          const percentageTotalEl = tipsPercentageContainer.querySelector('#percentage-total');

          percentageInputs.forEach(input => {
            input.addEventListener('input', () => {
              const total = Array.from(percentageInputs).reduce((sum, inp) =>
                sum + (parseFloat(inp.value) || 0), 0);
              percentageTotalEl.textContent = total.toFixed(2);
            });
          });
        } else {
          tipsPercentageContainer.style.display = 'none';
        }
      });
    }

    // Initialize tab contents visibility
    tabContents.forEach((content, index) => {
      content.style.display = index === 0 ? 'block' : 'none';
    });

    // Load initial clock status
    try {
      const clockStatusResponse = await api(`/api/staff/time-clock/weekly-summary/0`); // This won't work, need a better approach
      // For now, we'll update status when users clock in/out
    } catch (error) {
      // Ignore errors in initial load
    }

    await loadCorregirTab(nombre, pin);
  } catch (error) {
    Orama.toast('Error al acceder a nómina: ' + error.message, 'error');
    console.error(error);
  }
}

function toDatetimeLocalValue(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadCorregirTab(nombre, pin) {
  const tbody = document.getElementById('corregir-tbody');
  if (!tbody) return;

  try {
    const response = await api('/api/staff/time-clock/recent', { headers: managerHeaders({ nombre, pin }) });
    const entries = response.entries || [];

    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">No hay marcaciones en los últimos 7 días</td></tr>';
      return;
    }

    tbody.innerHTML = entries.map(entry => `
      <tr data-entry-id="${entry.id}">
        <td>${escapeHtml(entry.nombre)}</td>
        <td><input type="datetime-local" class="correction-clock-in" value="${toDatetimeLocalValue(entry.clock_in)}"></td>
        <td><input type="datetime-local" class="correction-clock-out" value="${toDatetimeLocalValue(entry.clock_out)}"></td>
        <td><input type="number" class="correction-break" min="0" step="1" value="${entry.total_break_minutes || 0}"></td>
        <td>
          <button class="button small correction-save-btn" data-entry-id="${entry.id}">Guardar</button>
          <button class="button small danger correction-delete-btn" data-entry-id="${entry.id}">Eliminar</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.correction-save-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('tr');
        const clockInInput = row.querySelector('.correction-clock-in');
        const clockOutInput = row.querySelector('.correction-clock-out');
        const breakInput = row.querySelector('.correction-break');

        if (!clockInInput.value) {
          Orama.toast('La entrada es requerida', 'error');
          return;
        }

        btn.disabled = true;
        try {
          await api(`/api/staff/time-clock/${btn.dataset.entryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clock_in: new Date(clockInInput.value).toISOString(),
              clock_out: clockOutInput.value ? new Date(clockOutInput.value).toISOString() : null,
              total_break_minutes: parseInt(breakInput.value, 10) || 0,
              nombre,
              pin
            })
          });
          Orama.toast('Marcación corregida', 'success');
        } catch (error) {
          Orama.toast('Error al corregir: ' + error.message, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });

    tbody.querySelectorAll('.correction-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta marcación? Esta acción no se puede deshacer.')) return;
        btn.disabled = true;
        try {
          await api(`/api/staff/time-clock/${btn.dataset.entryId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, pin })
          });
          btn.closest('tr').remove();
          Orama.toast('Marcación eliminada', 'success');
        } catch (error) {
          Orama.toast('Error al eliminar: ' + error.message, 'error');
          btn.disabled = false;
        }
      });
    });
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Error al cargar marcaciones</td></tr>';
    console.error(error);
  }
}

// The manager who opened the Calculadora. Its routes are manager-only and check name and PIN on every request;
// the calculate request used to send neither, so "Calcular Precio" was always refused. Cleared on leaving the page.
let pricingAuth = null;
let pricingSettings = null;
let pricingInventory = [];
let lastPricingResult = null;

async function pricing() {
  // Check if user is management via PIN
  const auth = await promptForStaffPin({ title: 'Acceso a Calculadora de Precios', subtitle: 'Solo para gerentes' });
  if (!auth) { window.location.hash = '#dashboard'; return; } // cancelled — back to the dashboard instead of a stuck loading spinner
  const { nombre, pin } = auth;

  try {
    // Verify staff is management
    const staffData = await api('/api/staff/active');
    const staffMember = staffData.staff.find(s => s.nombre === nombre && s.activo);
    if (!staffMember || staffMember.tipo !== 'management') {
      Orama.toast('Acceso denegado: solo gerentes', 'error');
      return;
    }
    if (!(await confirmManager(auth))) return;
    pricingAuth = { nombre, pin };

    // Load pricing interface
    app.innerHTML = pageHead('Calculadora de Precios', 'Análisis de costos y márgenes', 'Calcula el costo de producción y sugiere precios de venta', '/images/cafe-ambiance.jpg') +
      `<section class="panel">
        <div class="tabs">
          <button class="tab active" data-tab="calculator">Calculadora</button>
          <button class="tab" data-tab="recipes">Recetas Guardadas</button>
        </div>
        <div class="tab-content" id="calculator-tab">
          <h3>Calculadora de Costos</h3>
          <div class="form-section" id="taxSettings">
            <label>Ajustes del negocio (se guardan para todos los cálculos)</label>
            <div class="cost-grid">
              <div>
                <label for="ivaRate">Tasa de IVA (%):</label>
                <input type="number" id="ivaRate" min="0" max="100" step="0.1" value="16">
              </div>
              <div>
                <label for="cardFeePct">Comisión de la terminal (%):</label>
                <input type="number" id="cardFeePct" min="0" max="20" step="0.01" value="0">
              </div>
              <div>
                <label for="cardSharePct">Ventas que se pagan con tarjeta (%):</label>
                <input type="number" id="cardSharePct" min="0" max="100" step="1" value="0">
              </div>
              <div>
                <label for="paidPerFree">Bebidas pagadas por cada gratis:</label>
                <input type="number" id="paidPerFree" min="0" step="1" value="0">
              </div>
              <div>
                <label for="roundTo">Redondear el precio de menú a ($):</label>
                <input type="number" id="roundTo" min="0" step="0.5" value="0">
              </div>
              <div>
                <label><input type="checkbox" id="pricesIncludeIva" checked> Los precios de mi menú ya incluyen IVA</label>
              </div>
              <div>
                <button type="button" class="button" id="saveTaxBtn">Guardar ajustes</button>
              </div>
            </div>
            <p class="subtle">Los márgenes se calculan sobre el precio sin IVA, que es lo que realmente gana el negocio. Un precio de $43 con IVA del 16% deja $37.07. La comisión de la terminal y las bebidas gratis del programa de lealtad (ej. 10 pagadas y 1 gratis) se suman al costo para que el precio las cubra. Con 0 no se agregan. Los costos fijos de abajo se guardan con este botón.</p>
          </div>
          <div class="form-section">
            <label for="productSelect">Producto existente:</label>
            <select id="productSelect">
              <option value="">-- Seleccionar producto --</option>
            </select>
          </div>
          <div class="form-section">
            <label for="newProductName">O crear nuevo producto:</label>
            <input type="text" id="newProductName" placeholder="Nombre del producto">
          </div>
          <div class="form-section">
            <label>Insumos: cuánto usas por porción y cuánto cuesta, como lo compras:</label>
            <div id="ingredientsContainer"></div>
            <datalist id="inventoryList"></datalist>
            <button class="button secondary" type="button" onclick="addIngredientField()">+ Agregar insumo</button>
            <span class="scale-recipe">
              <label for="scaleFactor">Multiplicar cantidades por:</label>
              <input type="number" id="scaleFactor" min="0.01" step="0.05" value="1" aria-label="Factor para escalar las cantidades (ej. 1.5 de chico a grande)">
              <button class="button small" type="button" id="scaleBtn">Aplicar</button>
            </span>
            <p class="subtle">Ejemplo: usas 18 g de café que compras a $450 por kg: Cantidad 18, unidad g, costo 450, "por kg". El sistema convierte las unidades solo. Todos los insumos necesitan un costo.</p>
          </div>
          <div class="form-section">
            <label>Tiempo de preparación y mano de obra:</label>
            <div class="cost-grid">
              <div>
                <label>Tiempo de preparación (minutos):</label>
                <input type="number" id="prepTimeMinutes" step="1" min="0" value="0">
              </div>
              <div>
                <label>Rendimiento (porciones que produce esa preparación):</label>
                <input type="number" id="yieldServings" step="1" min="1" value="1">
              </div>
              <div>
                <label>Tarifa de mano de obra (MXN/hora):</label>
                <input type="number" id="laborRatePerHour" step="0.01" min="0" value="0">
              </div>
              <div>
                <label>O usar tarifa de un empleado:</label>
                <select id="laborStaffSelect">
                  <option value="">-- Escribir tarifa manualmente --</option>
                </select>
              </div>
            </div>
            <p class="subtle">Costo de mano de obra = (minutos ÷ 60 × tarifa por hora) ÷ rendimiento. Ej: 20 min a $120/hora entre 10 porciones = $4.00 por porción.</p>
          </div>
          <div class="form-section">
            <label>Costos extra por unidad:</label>
            <div class="cost-grid">
              <div>
                <label>Embalaje (MXN):</label>
                <input type="number" id="extraPackaging" step="0.01" min="0" value="0">
              </div>
              <div>
                <label>Otros (MXN):</label>
                <input type="number" id="extraOther" step="0.01" min="0" value="0">
              </div>
              <div>
                <label>Mano de obra fija por porción (MXN, si no usas el tiempo de preparación):</label>
                <input type="number" id="extraLabor" step="0.01" min="0" value="0">
              </div>
            </div>
          </div>
          <div class="form-section">
            <label>Costos fijos mensuales de todo el café (se reparten entre todas las unidades que vende, no solo este producto):</label>
            <div class="cost-grid">
              <div>
                <label>Renta (MXN):</label>
                <input type="number" id="fixedRent" step="0.01" min="0" value="0">
              </div>
              <div>
                <label>Teléfono/Internet (MXN):</label>
                <input type="number" id="fixedPhone" step="0.01" min="0" value="0">
              </div>
              <div>
                <label>Nómina fija (MXN):</label>
                <input type="number" id="fixedPayroll" step="0.01" min="0" value="0">
              </div>
              <div>
                <label>Otros fijos (MXN):</label>
                <input type="number" id="fixedOther" step="0.01" min="0" value="0">
              </div>
              <div>
                <label>Unidades totales que vende TODO el café al mes (todos los productos):</label>
                <input type="number" id="estimatedMonthlyUnits" step="1" min="0" value="0">
                <button type="button" class="button small" id="useObservedUnitsBtn">Usar ventas reales (30 días)</button>
              </div>
            </div>
          </div>
          <div class="form-section">
            <label>Margen objetivo (%):</label>
            <input type="number" id="targetMargin" step="0.1" min="0" max="99.9" value="30">
          </div>
          <div class="form-section">
            <label>
              <input type="checkbox" id="includeIVA" checked>
              Incluir IVA (16%) en el precio de venta
            </label>
          </div>
          <button class="button primary" id="calculatePriceBtn">Calcular Precio</button>
        </div>
        <div class="tab-content" id="recipes-tab">
          <h3>Recetas Guardadas</h3>
          <div id="recipesList">
            <!-- Recipes will be loaded here -->
          </div>
          <button class="button secondary" id="loadRecipesBtn">Cargar Recetas</button>
        </div>
      </section>`;

    // Load products for the dropdown
    try {
      const productsResponse = await api('/api/pricing/products');
      const productSelect = document.getElementById('productSelect');
      if (productsResponse.success) {
        productsResponse.products.forEach(product => {
          const option = document.createElement('option');
          option.value = product.id;
          option.textContent = `${product.nombre} - $${product.precio}`;
          productSelect.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Error loading products:', error);
    }

    // Load staff hourly rates for the labor rate picker
    try {
      const staffResponse = await api('/api/staff', { headers: managerHeaders(auth) });
      const laborStaffSelect = document.getElementById('laborStaffSelect');
      (staffResponse.staff || []).filter((s) => s.activo).forEach((s) => {
        const option = document.createElement('option');
        option.value = s.hourly_rate || 0;
        option.textContent = `${s.nombre} - $${(s.hourly_rate || 0).toFixed(2)}/hora`;
        laborStaffSelect.appendChild(option);
      });
      laborStaffSelect.addEventListener('change', () => {
        if (laborStaffSelect.value !== '') {
          document.getElementById('laborRatePerHour').value = laborStaffSelect.value;
        }
      });
    } catch (error) {
      console.error('Error loading staff rates:', error);
    }

    // Add event listeners
    document.getElementById('calculatePriceBtn').addEventListener('click', calculatePrice);
    document.getElementById('loadRecipesBtn').addEventListener('click', loadSavedRecipes);
    document.getElementById('scaleBtn').addEventListener('click', scaleQuantities);
    document.getElementById('productSelect').addEventListener('change', (event) => loadRecipeIntoForm(event.target.value));
    loadInventoryList();

    // IVA setting (this whole page is managers-only; the save re-checks the manager PIN on the server)
    try {
      const { settings } = await api('/api/pricing/settings');
      pricingSettings = settings;
      document.getElementById('ivaRate').value = settings.ivaRate;
      document.getElementById('pricesIncludeIva').checked = settings.pricesIncludeIva;
      document.getElementById('cardFeePct').value = settings.cardFeePct;
      document.getElementById('cardSharePct').value = settings.cardSharePct;
      document.getElementById('paidPerFree').value = settings.paidPerFree;
      document.getElementById('roundTo').value = settings.roundTo;
      document.getElementById('useObservedUnitsBtn').textContent = `Usar ventas reales (${settings.observedMonthlyUnits} en 30 días)`;
    } catch (error) {
      console.error(error);
    }
    document.getElementById('saveTaxBtn').addEventListener('click', async () => {
      try {
        await api('/api/pricing/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre, pin, ...readBusinessSettingsForm() })
        });
        Orama.toast('Ajustes guardados', 'success');
      } catch (error) {
        Orama.toast(error.message, 'error');
      }
    });

    // Initialize with one ingredient row
    if (document.querySelectorAll('.ingredient-row').length === 0) {
      addIngredientField();
    }

    // Remember monthly fixed costs between visits (rent/phone/payroll rarely change)
    restoreFixedCostInputs();
    applySavedFixedCosts(pricingSettings);
    document.getElementById('useObservedUnitsBtn').addEventListener('click', () => {
      document.getElementById('estimatedMonthlyUnits').value = pricingSettings?.observedMonthlyUnits || 0;
      saveFixedCostInputs();
    });
    ['fixedRent', 'fixedPhone', 'fixedPayroll', 'fixedOther', 'estimatedMonthlyUnits', 'laborRatePerHour'].forEach((id) => {
      document.getElementById(id).addEventListener('change', saveFixedCostInputs);
    });

    return () => { pricingAuth = null; pricingInventory = []; lastPricingResult = null; };
  } catch (error) {
    Orama.toast('Error al acceder a la calculadora: ' + error.message, 'error');
    console.error(error);
  }
}

// Helper functions for the pricing interface
const FIXED_COST_STORAGE_KEY = 'orama-pricing-fixed-costs';

function readBusinessSettingsForm() {
  const number = (id) => parseFloat(document.getElementById(id).value) || 0;
  return {
    ivaRate: number('ivaRate'),
    pricesIncludeIva: document.getElementById('pricesIncludeIva').checked,
    cardFeePct: number('cardFeePct'),
    cardSharePct: number('cardSharePct'),
    paidPerFree: number('paidPerFree'),
    roundTo: number('roundTo'),
    fixedCosts: { rent: number('fixedRent'), phoneInternet: number('fixedPhone'), payroll: number('fixedPayroll'), other: number('fixedOther') }
  };
}

// Overhead saved on the server is the same on every device; it wins over what this browser remembered.
function applySavedFixedCosts(settings) {
  const fixed = settings?.fixedCosts;
  if (!fixed || !Object.values(fixed).some((value) => value > 0)) return;
  document.getElementById('fixedRent').value = fixed.rent;
  document.getElementById('fixedPhone').value = fixed.phoneInternet;
  document.getElementById('fixedPayroll').value = fixed.payroll;
  document.getElementById('fixedOther').value = fixed.other;
}

function saveFixedCostInputs() {
  try {
    localStorage.setItem(FIXED_COST_STORAGE_KEY, JSON.stringify({
      fixedRent: document.getElementById('fixedRent').value,
      fixedPhone: document.getElementById('fixedPhone').value,
      fixedPayroll: document.getElementById('fixedPayroll').value,
      fixedOther: document.getElementById('fixedOther').value,
      estimatedMonthlyUnits: document.getElementById('estimatedMonthlyUnits').value,
      laborRatePerHour: document.getElementById('laborRatePerHour').value
    }));
  } catch (error) {
    // localStorage unavailable (private mode, etc.) - not critical
  }
}

function restoreFixedCostInputs() {
  try {
    const saved = JSON.parse(localStorage.getItem(FIXED_COST_STORAGE_KEY) || '{}');
    Object.keys(saved).forEach((id) => {
      const input = document.getElementById(id);
      if (input && saved[id] !== undefined) input.value = saved[id];
    });
  } catch (error) {
    // Ignore corrupted/missing stored values
  }
}

// Units are chosen from a list, never typed: the quantity ("18 g") and the unit the cost is quoted in
// ("$450 per kg") are both explicit, and the server converts between them.
const INGREDIENT_UNITS = ['g', 'kg', 'ml', 'litro', 'pieza'];
const DEFAULT_COST_UNIT = { g: 'kg', kg: 'kg', ml: 'litro', litro: 'litro', pieza: 'pieza' };

function unitOptions(selected) {
  return INGREDIENT_UNITS.map((unit) => `<option value="${unit}"${unit === selected ? ' selected' : ''}>${unit}</option>`).join('');
}

function ingredientRowMarkup() {
  return `
    <input type="text" class="ingredient-name" list="inventoryList" placeholder="Insumo (ej. Café)" aria-label="Insumo" onchange="matchInventoryItem(this)">
    <input type="number" class="quantity" placeholder="Cantidad" step="0.01" min="0" aria-label="Cantidad usada por porción">
    <select class="unit" aria-label="Unidad de la cantidad" onchange="syncCostUnit(this)">${unitOptions('g')}</select>
    <span class="ingredient-cost-label">costo $</span>
    <input type="number" class="unit-cost" placeholder="Costo" step="0.01" min="0" aria-label="Costo del insumo">
    <span class="ingredient-cost-label">por</span>
    <select class="cost-unit" aria-label="El costo es por">${unitOptions('kg')}</select>
    <input type="number" class="yield-pct" placeholder="Rend. %" step="1" min="1" max="100" title="Rendimiento: % de lo que compras que sí usas (merma). Vacío = 100" aria-label="Rendimiento en porcentaje">
    <button class="button small danger" type="button" onclick="removeIngredient(this)" aria-label="Quitar insumo">-</button>
  `;
}

// Costs are usually quoted per kg, per litre or per piece: follow the quantity's unit by default.
function syncCostUnit(select) {
  const row = select.closest('.ingredient-row');
  row.querySelector('.cost-unit').value = DEFAULT_COST_UNIT[select.value] || select.value;
}

function addIngredientField() {
  const container = document.getElementById('ingredientsContainer');
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.innerHTML = ingredientRowMarkup();
  container.appendChild(row);
}

function removeIngredient(button) {
  const row = button.parentElement;
  if (document.querySelectorAll('.ingredient-row').length > 1) {
    row.remove();
  }
}

async function calculatePrice() {
  try {
    const btn = document.getElementById('calculatePriceBtn');
    btn.disabled = true;
    btn.textContent = 'Calculando…';

    const productId = document.getElementById('productSelect').value;
    const productName = document.getElementById('newProductName').value.trim();
    const targetMargin = parseFloat(document.getElementById('targetMargin').value) || 0;
    const includeIVA = document.getElementById('includeIVA').checked;

    // Validate inputs
    if (!productId && !productName) {
      Orama.toast('Seleccione un producto existente o ingrese un nombre para un nuevo producto', 'error');
      return;
    }

    // Collect ingredients
    const ingredients = [];
    const ingredientRows = document.querySelectorAll('.ingredient-row');
    let hasError = false;

    ingredientRows.forEach(row => {
      const nameInput = row.querySelector('.ingredient-name');
      const quantityInput = row.querySelector('.quantity');
      const unitInput = row.querySelector('.unit');
      const costInput = row.querySelector('.unit-cost');
      const costUnitInput = row.querySelector('.cost-unit');

      const name = nameInput.value.trim();
      const quantity = parseFloat(quantityInput.value) || 0;
      const unit = unitInput.value;
      const costUnit = costUnitInput.value;
      const unitCost = parseFloat(costInput.value) || 0;
      const yieldPct = parseFloat(row.querySelector('.yield-pct').value);

      if (!name) {
        hasError = true;
        nameInput.style.borderColor = 'var(--danger)';
      } else {
        nameInput.style.borderColor = '';
      }

      if (quantity <= 0) {
        hasError = true;
        quantityInput.style.borderColor = 'var(--danger)';
      } else {
        quantityInput.style.borderColor = '';
      }

      if (unitCost <= 0) {
        hasError = true;
        costInput.style.borderColor = 'var(--danger)';
      } else {
        costInput.style.borderColor = '';
      }

      ingredients.push({ ingredientName: name, quantityPerServing: quantity, unit, costUnit, unitCost, ...(yieldPct > 0 ? { yieldPct } : {}) });
    });

    if (hasError) {
      Orama.toast('Cada insumo necesita nombre, cantidad y costo (si es casi gratis, pon 0.01)', 'error');
      return;
    }

    const extraCosts = {
      packaging: parseFloat(document.getElementById('extraPackaging').value) || 0,
      labor: parseFloat(document.getElementById('extraLabor').value) || 0,
      other: parseFloat(document.getElementById('extraOther').value) || 0
    };

    const preparation = {
      prepTimeMinutes: parseFloat(document.getElementById('prepTimeMinutes').value) || 0,
      yieldServings: parseFloat(document.getElementById('yieldServings').value) || 1,
      laborRatePerHour: parseFloat(document.getElementById('laborRatePerHour').value) || 0
    };

    const fixedCosts = {
      rent: parseFloat(document.getElementById('fixedRent').value) || 0,
      phoneInternet: parseFloat(document.getElementById('fixedPhone').value) || 0,
      payroll: parseFloat(document.getElementById('fixedPayroll').value) || 0,
      other: parseFloat(document.getElementById('fixedOther').value) || 0
    };
    const estimatedMonthlyUnits = parseFloat(document.getElementById('estimatedMonthlyUnits').value) || 0;

    saveFixedCostInputs();

    // Call API to calculate price
    const response = await api('/api/pricing/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...pricingAuth,
        productId: productId ? parseInt(productId) : undefined,
        productName: productName || undefined,
        ingredients,
        extraCosts,
        preparation,
        fixedCosts,
        estimatedMonthlyUnits: estimatedMonthlyUnits > 0 ? estimatedMonthlyUnits : undefined,
        targetMargin,
        includeIVA
      })
    });

    btn.disabled = false;
    btn.textContent = 'Calcular Precio';

    if (response.success) {
      const result = response.calculation;
      lastPricingResult = result;
      showResults(result);
    } else {
      Orama.toast('Error en el cálculo: ' + (response.error || 'Error desconocido'), 'error');
    }
  } catch (error) {
    document.getElementById('calculatePriceBtn').disabled = false;
    document.getElementById('calculatePriceBtn').textContent = 'Calcular Precio';
    Orama.toast('Error al calcular precio: ' + error.message, 'error');
    console.error(error);
  }
}

function showResults(result) {
  // Create or update results display
  let resultsDiv = document.getElementById('pricingResults');
  if (!resultsDiv) {
    resultsDiv = document.createElement('div');
    resultsDiv.id = 'pricingResults';
    resultsDiv.className = 'results-section';
    const calculatorTab = document.getElementById('calculator-tab');
    calculatorTab.appendChild(resultsDiv);
  }

  const isBelowTargetClass = result.isBelowTarget ? 'alert' : 'success';

  resultsDiv.innerHTML = `
    <h3>Resultados del Cálculo</h3>
    <div class="results-grid">
      <div>
        <label>Costo total por porción:</label>
        <p class="price-label">${money.format(result.totalCostPerServing)}</p>
      </div>
      <div>
        <label>Precio sugerido (sin IVA):</label>
        <p class="price-label">${money.format(result.suggestedSellingPrice)}</p>
      </div>
      <div>
        <label>Precio para el menú${result.pricesIncludeIva ? ` (con IVA ${result.ivaRate}%)` : ''}:</label>
        <p class="price-label">${money.format(result.suggestedMenuPrice)}</p>
      </div>
      <div>
        <label>Margen actual (sobre el precio sin IVA):</label>
        <p class="price-label">${result.menuPriceNet > 0 ? `${result.actualMargin.toFixed(2)}%` : 'Sin precio en el menú'}</p>
      </div>
      <div>
        <label>Margen objetivo:</label>
        <p class="price-label">${result.targetMargin.toFixed(2)}%</p>
      </div>
      <div class="${isBelowTargetClass}">
        <label>Estado:</label>
        <p class="price-label">${result.menuPriceNet > 0 ? (result.isBelowTarget ? 'Por debajo del objetivo' : 'En o encima del objetivo') : 'Producto nuevo'}</p>
      </div>
      <div>
        <label>Diferencia vs. el precio del menú:</label>
        <p class="price-label">${result.savingsOrShortfall >= 0 ? '+' : ''}${money.format(result.savingsOrShortfall)}</p>
      </div>
      ${result.roundedMenuPrice !== null ? `
      <div>
        <label>Precio de menú redondeado:</label>
        <p class="price-label">${money.format(result.roundedMenuPrice)}</p>
        <p class="subtle">Deja ${result.marginAtRoundedPrice.toFixed(1)}% de margen</p>
      </div>` : ''}
      ${result.compsCostPerServing > 0 ? `
      <div>
        <label>Bebidas gratis (lealtad), por bebida pagada:</label>
        <p class="price-label">${money.format(result.compsCostPerServing)}</p>
      </div>` : ''}
      ${result.cardFeeRatePct > 0 ? `
      <div>
        <label>Comisión de tarjeta (% del precio sin IVA):</label>
        <p class="price-label">${result.cardFeeRatePct.toFixed(2)}%</p>
      </div>` : ''}
    </div>

    <h3 class="mt-4">Costo primo (Prime Cost)</h3>
    <p class="subtle">Insumos + embalaje + mano de obra, el indicador más usado en restaurantes/cafés. Para un negocio de servicio limitado como una cafetería, mantenerlo en 60% o menos del precio de venta.</p>
    <div class="results-grid">
      <div>
        <label>Costo de insumos:</label>
        <p class="price-label">${money.format(result.ingredientsCost)}</p>
      </div>
      <div>
        <label>Costo de embalaje:</label>
        <p class="price-label">${money.format(result.packagingCost)}</p>
      </div>
      <div>
        <label>Costo de mano de obra:</label>
        <p class="price-label">${money.format(result.laborCostPerServing)}</p>
      </div>
      <div>
        <label>Costo primo total:</label>
        <p class="price-label">${money.format(result.primeCost)}</p>
      </div>
      <div class="${result.primeCostPercent > 60 ? 'alert' : 'success'}">
        <label>Costo primo (% del ${result.primeCostBasis === 'menu' ? 'precio real sin IVA' : 'precio sugerido sin IVA'}):</label>
        <p class="price-label">${result.primeCostPercent.toFixed(1)}%</p>
      </div>
    </div>

    ${result.fullCostSellingPrice !== null && result.fullCostSellingPrice !== undefined ? `
      <h3 class="mt-4">Precio de costo completo (incluye renta, teléfono y nómina fija)</h3>
      <p class="subtle">Costos fijos mensuales de todo el café: ${money.format(result.totalMonthlyFixedCosts)} ÷ ${result.estimatedMonthlyUnits} unidades totales al mes = ${money.format(result.fixedCostPerUnit)} de costo fijo por unidad</p>
      <div class="results-grid">
        <div>
          <label>Costo completo por porción:</label>
          <p class="price-label">${money.format(result.fullCostPerServing)}</p>
        </div>
        <div>
          <label>Precio sugerido (costo completo):</label>
          <p class="price-label">${money.format(result.fullCostSellingPrice)}</p>
        </div>
        <div>
          <label>Precio con IVA (costo completo):</label>
          <p class="price-label">${money.format(result.fullCostPriceWithIVA)}</p>
        </div>
        <div>
          <label>Punto de equilibrio:</label>
          <p class="price-label">${result.breakEvenUnits !== null ? `${result.breakEvenUnits} unidades/mes` : 'N/A'}</p>
        </div>
      </div>
      <p class="subtle">A este precio, este producto cubre ingredientes, costos extra y su parte de renta/teléfono/nómina fija. El "precio de venta sugerido" de arriba solo cubre el costo de los ingredientes.</p>
    ` : `
      <p class="empty mt-4">Agrega renta, teléfono, nómina fija y las unidades estimadas por mes arriba para ver el precio que cubre también los costos fijos del negocio, no solo los ingredientes.</p>
    `}

    <div class="form-section">
      <button class="button secondary" onclick="saveAsRecipe()">Guardar como receta</button>
    </div>
  `;
}

// Ingredients come from the inventory so a saved recipe can deduct stock and cost itself from real prices.
async function loadInventoryList() {
  try {
    const { items } = await api('/api/pricing/inventory/search?q=');
    pricingInventory = items || [];
    document.getElementById('inventoryList').innerHTML = pricingInventory.map((item) => `<option value="${escapeHtml(item.name)}"></option>`).join('');
  } catch (error) {
    console.error('Error loading inventory:', error);
  }
}

// Picking an inventory name fills its cost and the unit that cost is quoted in, and remembers which item it is.
function matchInventoryItem(input) {
  const row = input.closest('.ingredient-row');
  const item = pricingInventory.find((candidate) => candidate.name.toLowerCase() === input.value.trim().toLowerCase());
  if (!item) { delete row.dataset.inventoryId; return; }
  row.dataset.inventoryId = item.id;
  const cost = Number(item.unit_cost) || 0;
  if (cost > 0) row.querySelector('.unit-cost').value = cost;
  if (INGREDIENT_UNITS.includes(item.unit)) row.querySelector('.cost-unit').value = item.unit;
}

// Sizes are separate menu items (CHICO, GRANDE): load one recipe, multiply, and save it on the other item.
function scaleQuantities() {
  const factor = parseFloat(document.getElementById('scaleFactor').value);
  if (!(factor > 0)) { Orama.toast('El factor debe ser mayor a 0', 'error'); return; }
  document.querySelectorAll('.ingredient-row .quantity').forEach((input) => {
    const value = parseFloat(input.value);
    if (value > 0) input.value = parseFloat((value * factor).toFixed(4));
  });
  document.getElementById('scaleFactor').value = 1;
}

async function loadRecipeIntoForm(menuItemId) {
  if (!menuItemId) return;
  try {
    const { recipe, extraCosts } = await api(`/api/pricing/recipe/${menuItemId}`);
    if (!recipe.length) return;
    document.getElementById('ingredientsContainer').innerHTML = '';
    recipe.forEach((line) => {
      addIngredientField();
      const row = document.querySelector('#ingredientsContainer .ingredient-row:last-child');
      row.dataset.inventoryId = line.inventory_item_id;
      row.querySelector('.ingredient-name').value = line.name;
      row.querySelector('.quantity').value = parseFloat(Number(line.quantity_used).toFixed(4));
      if (INGREDIENT_UNITS.includes(line.unit)) {
        row.querySelector('.unit').value = line.unit;
        row.querySelector('.cost-unit').value = line.unit;
      }
      row.querySelector('.unit-cost').value = Number(line.unit_cost) || '';
    });
    document.getElementById('extraPackaging').value = Number(extraCosts.packaging) || 0;
    document.getElementById('extraOther').value = Number(extraCosts.other) || 0;
    document.getElementById('extraLabor').value = Number(extraCosts.labor) || 0;
    document.getElementById('prepTimeMinutes').value = 0;
    Orama.toast('Receta guardada cargada. Cambia lo que necesites y calcula.', 'success');
  } catch (error) {
    Orama.toast(error.message, 'error');
  }
}

async function saveAsRecipe() {
  const btn = document.querySelector('.results-section .button.secondary');
  try {
    const menuItemId = parseInt(document.getElementById('productSelect').value, 10);
    if (!menuItemId) {
      Orama.toast('Elige el producto existente al que pertenece esta receta', 'error');
      return;
    }

    const ingredients = [];
    const unmatched = [];
    document.querySelectorAll('.ingredient-row').forEach((row) => {
      const name = row.querySelector('.ingredient-name').value.trim();
      const quantityUsed = parseFloat(row.querySelector('.quantity').value) || 0;
      if (!name || !(quantityUsed > 0)) return;
      if (!row.dataset.inventoryId) { unmatched.push(name); return; }
      const yieldPct = parseFloat(row.querySelector('.yield-pct').value);
      ingredients.push({ inventoryItemId: parseInt(row.dataset.inventoryId, 10), quantityUsed, unit: row.querySelector('.unit').value, ...(yieldPct > 0 ? { yieldPct } : {}) });
    });
    if (unmatched.length) {
      Orama.toast(`Estos insumos no están en el inventario, elígelos de la lista: ${unmatched.join(', ')}`, 'error');
      return;
    }
    if (!ingredients.length) { Orama.toast('Agrega al menos un insumo con cantidad', 'error'); return; }
    if (!lastPricingResult) { Orama.toast('Calcula el precio antes de guardar la receta', 'error'); return; }

    btn.disabled = true;
    btn.textContent = 'Guardando…';
    // Labour is saved as the per-serving figure the calculation used, whether it came from prep time or the fixed field.
    const extraCosts = {
      packaging: lastPricingResult.packagingCost,
      labor: lastPricingResult.laborCostPerServing,
      other: parseFloat(document.getElementById('extraOther').value) || 0
    };
    await api('/api/pricing/recipe/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...pricingAuth, menuItemId, ingredients, extraCosts })
    });
    Orama.toast('Receta guardada. El reporte de márgenes ya la usa.', 'success');
  } catch (error) {
    Orama.toast('Error al guardar receta: ' + error.message, 'error');
    console.error(error);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar como receta';
  }
}

async function loadSavedRecipes() {
  const btn = document.getElementById('loadRecipesBtn');
  try {
    btn.disabled = true;
    btn.textContent = 'Cargando…';
    const { recipes } = await api('/api/pricing/recipes');
    const list = document.getElementById('recipesList');
    list.innerHTML = recipes.length
      ? recipes.map((recipe) => `<div class="recipe-row"><span>${escapeHtml(recipe.nombre)} <span class="subtle">${recipe.ingredientes} insumos</span></span><button class="button small" type="button" data-recipe-id="${recipe.id}">Abrir</button></div>`).join('')
      : '<p class="empty">Todavía no hay recetas guardadas. Calcula un producto y usa "Guardar como receta".</p>';
    list.querySelectorAll('[data-recipe-id]').forEach((button) => button.addEventListener('click', () => {
      const select = document.getElementById('productSelect');
      select.value = button.dataset.recipeId;
      loadRecipeIntoForm(select.value);
      select.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  } catch (error) {
    Orama.toast('Error al cargar recetas: ' + error.message, 'error');
    console.error(error);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Cargar Recetas';
  }
}

// Make functions globally accessible for event handlers in HTML
window.addIngredientField = addIngredientField;
window.removeIngredient = removeIngredient;
window.calculatePrice = calculatePrice;
window.saveAsRecipe = saveAsRecipe;
window.loadSavedRecipes = loadSavedRecipes;
window.matchInventoryItem = matchInventoryItem;

Orama.routes.dashboard = dashboard;
Orama.routes.mesas = mesas;
Orama.routes.ordenes = orders;
Orama.routes.staff = staff;
Orama.routes.nomina = nomina;
Orama.routes.pricing = pricing;

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
    await window.render();
  } catch (error) {
    app.innerHTML = `<div class="error" role="alert">${escapeHtml(error.message)}</div>`;
  }
});