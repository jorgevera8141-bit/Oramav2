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

async function nomina() {
  // Check if user is management via PIN
  const { nombre, pin } = await Orama.prompt([
    { label: 'Nombre', name: 'nombre' },
    { label: 'PIN', name: 'pin', type: 'password' }
  ], { title: 'Acceso a Nómina', subtitle: 'Solo para gerentes' });

  if (!nombre || !pin) {
    Orama.toast('Acceso denegado', 'error');
    return;
  }

  try {
    // Verify staff is management
    const staffData = await api('/api/staff/active');
    const staffMember = staffData.staff.find(s => s.nombre === nombre && s.activo);
    if (!staffMember || staffMember.tipo !== 'management') {
      Orama.toast('Acceso denegado: solo gerentes', 'error');
      return;
    }

    // Load nomina interface
    app.innerHTML = pageHead('Nómina', 'Gestión de tiempo y pagos', 'Control de asistencia y cálculo de pagos', '/images/cafe-ambiance.jpg');

    // Get all staff for the interface
    const staffResponse = await api('/api/staff');
    const staffList = staffResponse.staff || [];

    // Get weekly payroll data
    const payrollResponse = await api('/api/payroll/weekly');
    const payrollData = payrollResponse.payroll || [];

    app.innerHTML += `
      <section class="panel">
        <div class="tabs">
          <button class="tab active" data-tab="clock">Marcación</button>
          <button class="tab" data-tab="rates">Tarifas</button>
          <button class="tab" data-tab="payroll">Nómina</button>
          <button class="tab" data-tab="tips">Propinas</button>
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
              <p><strong>Total nómina semanal:</strong> $${payrollResponse.summary.totalPayroll.toFixed(2)} MXN</p>
              <p><strong>Promedio por empleado:</strong> $${payrollResponse.summary.averageWeeklyEarnings.toFixed(2)} MXN</p>
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
                    <td>$${p.hourly_rate.toFixed(2)} MXN</td>
                    <td>${p.weeklyHours.toFixed(2)} hrs</td>
                    <td>$${p.weeklyEarnings.toFixed(2)} MXN</td>
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

        try {
          const response = await api('/api/staff/payroll/tips-distribution', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tips_amount: tipsAmount,
              distribution_type: distributionType,
              nombre,
              pin
            })
          });

          if (response.success) {
            let resultsHTML = `<h4>Resultado de la distribución:</h4>`;
            resultsHTML += `<p><strong>Total propinas:</strong> $${response.tipsAmount.toFixed(2)} MXN</p>`;
            resultsHTML += `<p><strong>Método:</strong> ${response.distributionType}</p>`;
            resultsHTML += `<p><strong>Distribuido:</strong> $${response.summary.totalDistributed.toFixed(2)} MXN</p>`;
            if (response.summary.remainingTips > 0) {
              resultsHTML += `<p><strong>Restante:</strong> $${response.summary.remainingTips.toFixed(2)} MXN</p>`;
            }
            resultsHTML += `<div class="mt-3"><strong>Distribución por empleado:</strong><ul>`;
            response.distribution.forEach(d => {
              resultsHTML += `<li><strong>${escapeHtml(d.nombre)}</strong>: $${d.amount.toFixed(2)} MXN`;
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
          Orama.toast('Error de conexión', 'error');
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
  } catch (error) {
    Orama.toast('Error al acceder a nómina: ' + error.message, 'error');
    console.error(error);
  }
}

async function pricing() {
  // Check if user is management via PIN
  const { nombre, pin } = await Orama.prompt([
    { label: 'Nombre', name: 'nombre' },
    { label: 'PIN', name: 'pin', type: 'password' }
  ], { title: 'Acceso a Calculadora de Precios', subtitle: 'Solo para gerentes' });

  if (!nombre || !pin) {
    Orama.toast('Acceso denegado', 'error');
    return;
  }

  try {
    // Verify staff is management
    const staffData = await api('/api/staff/active');
    const staffMember = staffData.staff.find(s => s.nombre === nombre && s.activo);
    if (!staffMember || staffMember.tipo !== 'management') {
      Orama.toast('Acceso denegado: solo gerentes', 'error');
      return;
    }

    // Load pricing interface
    app.innerHTML = pageHead('Calculadora de Precios', 'Análisis de costos y márgenes', 'Calcula el costo de producción y sugiere precios de venta', '/images/cafe-ambiance.jpg') +
      `<section class="panel">
        <div class="tabs">
          <button class="tab active" data-tab="calculator">Calculadora</button>
          <button class="tab" data-tab="recipes">Recetas Guardadas</button>
        </div>
        <div class="tab-content" id="calculator-tab">
          <h3>Calculadora de Costos</h3>
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
            <label>Ingredientes:</label>
            <div id="ingredientsContainer">
              <div class="ingredient-row">
                <input type="text" class="ingredient-name" placeholder="Nombre del ingrediente">
                <input type="number" class="quantity" placeholder="Cantidad" step="0.01" min="0">
                <input type="text" class="unit" placeholder="Unidad" value="pieza">
                <input type="number" class="unit-cost" placeholder="Costo unitario" step="0.01" min="0">
                <button class="button small" type="button" onclick="removeIngredient(this)">-</button>
              </div>
            </div>
            <button class="button secondary" type="button" onclick="addIngredientField()">+ Agregar ingrediente</button>
          </div>
          <div class="form-section">
            <label>Costos extra por unidad:</label>
            <div class="cost-grid">
              <div>
                <label>Embalaje (MXN):</label>
                <input type="number" id="extraPackaging" step="0.01" min="0" value="0">
              </div>
              <div>
                <label>Mano de obra (MXN):</label>
                <input type="number" id="extraLabor" step="0.01" min="0" value="0">
              </div>
              <div>
                <label>Otros (MXN):</label>
                <input type="number" id="extraOther" step="0.01" min="0" value="0">
              </div>
            </div>
          </div>
          <div class="form-section">
            <label>Margen objetivo (%):</label>
            <input type="number" id="targetMargin" step="0.1" min="0" max="1000" value="30">
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

    // Add event listeners
    document.getElementById('calculatePriceBtn').addEventListener('click', calculatePrice);
    document.getElementById('loadRecipesBtn').addEventListener('click', loadSavedRecipes);

    // Initialize with one ingredient row
    if (document.querySelectorAll('.ingredient-row').length === 0) {
      addIngredientField();
    }

  } catch (error) {
    Orama.toast('Error al acceder a la calculadora: ' + error.message, 'error');
    console.error(error);
  }
}

// Helper functions for the pricing interface
function addIngredientField() {
  const container = document.getElementById('ingredientsContainer');
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.innerHTML = `
    <input type="text" class="ingredient-name" placeholder="Nombre del ingrediente">
    <input type="number" class="quantity" placeholder="Cantidad" step="0.01" min="0">
    <input type="text" class="unit" placeholder="Unidad" value="pieza">
    <input type="number" class="unit-cost" placeholder="Costo unitario" step="0.01" min="0">
    <button class="button small" type="button" onclick="removeIngredient(this)">-</button>
  `;
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
    btn.textContent = 'Calculando...';

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

      const name = nameInput.value.trim();
      const quantity = parseFloat(quantityInput.value) || 0;
      const unit = unitInput.value.trim() || 'pieza';
      const unitCost = parseFloat(costInput.value) || 0;

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

      if (!ingredients.some(ing => ing.name === name && ing.unit === unit)) {
        ingredients.push({ name, quantity, unit, unitCost });
      }
    });

    if (hasError) {
      Orama.toast('Por favor complete todos los campos de ingredientes', 'error');
      return;
    }

    const extraCosts = {
      packaging: parseFloat(document.getElementById('extraPackaging').value) || 0,
      labor: parseFloat(document.getElementById('extraLabor').value) || 0,
      other: parseFloat(document.getElementById('extraOther').value) || 0
    };

    // Call API to calculate price
    const response = await api('/api/pricing/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: productId ? parseInt(productId) : undefined,
        productName: productName || undefined,
        ingredients,
        extraCosts,
        targetMargin,
        includeIVA
      })
    });

    btn.disabled = false;
    btn.textContent = 'Calcular Precio';

    if (response.success) {
      const result = response.calculation;
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
        <p class="price-label">$${result.totalCostPerServing.toFixed(2)} MXN</p>
      </div>
      <div>
        <label>Precio de venta sugerido:</label>
        <p class="price-label">$${result.suggestedSellingPrice.toFixed(2)} MXN</p>
      </div>
      <div>
        <label>Precio con IVA:</label>
        <p class="price-label">$${result.priceWithIVA.toFixed(2)} MXN</p>
      </div>
      <div>
        <label>Precio sin IVA:</label>
        <p class="price-label">$${result.priceWithoutIVA.toFixed(2)} MXN</p>
      </div>
      <div>
        <label>Margen actual:</label>
        <p class="price-label">${result.actualMargin.toFixed(2)}%</p>
      </div>
      <div>
        <label>Margen objetivo:</label>
        <p class="price-label">${result.targetMargin.toFixed(2)}%</p>
      </div>
      <div class="${isBelowTargetClass}">
        <label>Estado:</label>
        <p class="price-label">${result.isBelowTarget ? 'Por debajo del objetivo' : 'En o encima del objetivo'}</p>
      </div>
      <div>
        <label>Diferencia:</label>
        <p class="price-label">${result.savingsOrShortfall >= 0 ? '+' : ''}$${result.savingsOrShortfall.toFixed(2)} MXN</p>
      </div>
    </div>
    
    <div class="form-section">
      <button class="button secondary" onclick="saveAsRecipe()">Guardar como receta</button>
    </div>
  `;
}

async function saveAsRecipe() {
  try {
    const btn = document.querySelector('.results-section .button.secondary');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    const productId = document.getElementById('productSelect').value;
    const productName = document.getElementById('newProductName').value.trim();
    const targetMargin = parseFloat(document.getElementById('targetMargin').value) || 0;
    const includeIVA = document.getElementById('includeIVA').checked;

    if (!productId && !productName) {
      Orama.toast('Seleccione un producto existente o ingrese un nombre para un nuevo producto', 'error');
      return;
    }

    // Collect ingredients for saving
    const ingredients = [];
    const ingredientRows = document.querySelectorAll('.ingredient-row');
    ingredientRows.forEach(row => {
      const nameInput = row.querySelector('.ingredient-name');
      const quantityInput = row.querySelector('.quantity');
      const unitInput = row.querySelector('.unit');
      
      const name = nameInput.value.trim();
      const quantity = parseFloat(quantityInput.value) || 0;
      const unit = unitInput.value.trim() || 'pieza';
      
      if (name && quantity > 0) {
        ingredients.push({ name, quantity, unit });
      }
    });

    const extraCosts = {
      packaging: parseFloat(document.getElementById('extraPackaging').value) || 0,
      labor: parseFloat(document.getElementById('extraLabor').value) || 0,
      other: parseFloat(document.getElementById('extraOther').value) || 0
    };

    // If we have a product ID, save as recipe for that product
    if (productId) {
      // First, we need to find or create inventory items for each ingredient
      // For simplicity in this example, we'll just show a message
      // In a full implementation, we'd match ingredients to inventory items
      Orama.toast('Para guardar como receta oficial, los ingredientes deben coincidir con artículos de inventario existentes', 'info');
    } else {
      Orama.toast('Seleccione un producto existente para guardar la receta', 'warning');
    }

    btn.disabled = false;
    btn.textContent = 'Guardar como receta';
  } catch (error) {
    document.querySelector('.results-section .button.secondary').disabled = false;
    document.querySelector('.results-section .button.secondary').textContent = 'Guardar como receta';
    Orama.toast('Error al guardar receta: ' + error.message, 'error');
    console.error(error);
  }
}

async function loadSavedRecipes() {
  try {
    const btn = document.getElementById('loadRecipesBtn');
    btn.disabled = true;
    btn.textContent = 'Cargando...';

    // TODO: Implement loading saved recipes from API
    // For now, show placeholder
    const recipesList = document.getElementById('recipesList');
    recipesList.innerHTML = '<p>Funcionalidad de recetas guardadas estará disponible en una futura actualización.</p>';

    btn.disabled = false;
    btn.textContent = 'Cargar Recetas';
  } catch (error) {
    document.getElementById('loadRecipesBtn').disabled = false;
    document.getElementById('loadRecipesBtn').textContent = 'Cargar Recetas';
    Orama.toast('Error al cargar recetas: ' + error.message, 'error');
    console.error(error);
  }
}

// Make functions globally accessible for event handlers in HTML
window.addIngredientField = addIngredientField;
window.removeIngredient = removeIngredient;
window.calculatePrice = calculatePrice;
window.saveAsRecipe = saveAsRecipe;
window.loadSavedRecipes = loadSavedRecipes;

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
    await render();
  } catch (error) {
    app.innerHTML = `<div class="error" role="alert">${escapeHtml(error.message)}</div>`;
  }
});
