// Accesos: change the café passcode and manage the team's PINs. Only managers get in (their name and
// PIN are asked on entry and sent with each change, as Nómina and comps do). Neither secret can be
// shown, because only hashes are stored; the screen says so and offers a reset instead.
async function accesos() {
  const auth = await promptForStaffPin({ title: 'Accesos', subtitle: 'Solo para gerentes' });
  if (!auth) { window.location.hash = '#dashboard'; return; }
  try {
    await api('/api/access/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor_nombre: auth.nombre, actor_pin: auth.pin }) });
  } catch (error) {
    Orama.toast(error.message, 'error');
    window.location.hash = '#dashboard';
    return;
  }
  const actor = { actor_nombre: auth.nombre, actor_pin: auth.pin };
  const PIN_RULE = 'De 4 a 10 dígitos.';

  const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...actor, ...body }) });

  function sourceBadge(gate) {
    if (gate.source === 'pos') return '<span class="badge-estado live">Guardado en el POS</span>';
    if (gate.source === 'env_forced') return '<span class="badge-estado warn">Forzado desde Railway</span>';
    return '<span class="badge-estado neutral">Variable de Railway</span>';
  }

  function sourceText(gate) {
    if (gate.source === 'env_forced') return 'GATE_FORCE_ENV está activo en Railway, así que se usa el código de Railway y el que se guarde aquí no cuenta hasta que quites esa variable.';
    if (gate.source === 'pos') {
      const when = gate.changed_at ? new Date(gate.changed_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: BUSINESS_TZ }) : '';
      return `Cambiado${when ? ` el ${when}` : ''}${gate.changed_by ? ` por ${gate.changed_by}` : ''}.`;
    }
    return 'Todavía se usa el código de la variable GATE_PASSCODE de Railway. Al cambiarlo aquí, el del POS lo reemplaza.';
  }

  function staffRows(staff) {
    if (!staff.length) return '<tr><td class="empty" colspan="4">Aún no hay personas.</td></tr>';
    return staff.map((person) => {
      const active = Number(person.activo) === 1;
      const name = escapeHtml(person.nombre);
      return `<tr>
        <td data-label="Nombre">${name}</td>
        <td data-label="Rol">${person.tipo === 'management' ? 'Gerente' : 'Staff'}</td>
        <td data-label="Estado"><span class="badge-estado ${active ? 'live' : 'muted'}">${active ? 'Activo' : 'Inactivo'}</span></td>
        <td data-label="Acciones"><div class="action-row">
          <button type="button" class="button" data-pin-id="${person.id}" data-name="${name}" aria-label="Cambiar PIN de ${name}">Cambiar PIN</button>
          <button type="button" class="button ${active ? 'danger' : ''}" data-active-id="${person.id}" data-name="${name}" data-set="${active ? 0 : 1}" aria-label="${active ? 'Desactivar' : 'Reactivar'} a ${name}">${active ? 'Desactivar' : 'Reactivar'}</button>
        </div></td>
      </tr>`;
    }).join('');
  }

  function render(status) {
    app.innerHTML = pageHead('Seguridad', 'Accesos', 'Código del café y PIN del equipo') + `
      <section class="panel">
        <div class="panel-head"><h2>Código de acceso del café</h2>${sourceBadge(status.gate)}</div>
        <p class="subtle" style="margin-top:0">${escapeHtml(sourceText(status.gate))}</p>
        <form id="gate-form" class="filters" autocomplete="off">
          <div class="field-group"><label for="gate-new">Nuevo código</label><input id="gate-new" class="search" type="password" minlength="4" maxlength="64" autocomplete="new-password" required></div>
          <div class="field-group"><label for="gate-confirm">Repite el código</label><input id="gate-confirm" class="search" type="password" minlength="4" maxlength="64" autocomplete="new-password" required></div>
          <button type="submit" class="button primary" style="align-self:flex-end">Cambiar código</button>
        </form>
        <p id="gate-error" class="error" role="alert" hidden></p>
        <p class="subtle">De 4 a 64 caracteres; mejor 8 o más. Por seguridad el código actual no se puede mostrar. Si lo olvidas, cámbialo aquí. Al cambiarlo, todos los dispositivos tendrán que escribir el nuevo.</p>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Equipo y PIN</h2><span class="subtle">${status.staff.length} personas</span></div>
        <div class="table-wrap"><table class="stack-table"><thead><tr><th scope="col">Nombre</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>${staffRows(status.staff)}</tbody></table></div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Agregar persona</h2></div>
        <form id="person-form" class="filters" autocomplete="off">
          <div class="field-group"><label for="person-name">Nombre</label><input id="person-name" class="search" maxlength="60" required></div>
          <div class="field-group"><label for="person-tipo">Rol</label><select id="person-tipo" class="search"><option value="staff">Staff</option><option value="management">Gerente</option></select></div>
          <div class="field-group"><label for="person-pin">PIN</label><input id="person-pin" class="search" type="password" inputmode="numeric" pattern="\\d{4,10}" maxlength="10" autocomplete="new-password" required></div>
          <button type="submit" class="button primary" style="align-self:flex-end">Agregar</button>
        </form>
        <p id="person-error" class="error" role="alert" hidden></p>
        <p class="subtle">${PIN_RULE} Un gerente puede cambiar códigos y PIN, y entrar a Nómina.</p>
      </section>`;
  }

  function showError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  async function reload() {
    try { render(await api('/api/access/status')); }
    catch (error) { app.innerHTML = `<div class="error" role="alert">${escapeHtml(error.message)}</div>`; }
  }

  // A small modal asking twice for a new PIN, in the style of the PIN prompt.
  function askNewPin(name) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'orama-overlay';
      overlay.innerHTML = `<div class="orama-modal" role="dialog" aria-modal="true">
        <p class="orama-modal-message">Nuevo PIN para ${name}<br><span class="subtle">${PIN_RULE}</span></p>
        <form id="new-pin-form">
          <div class="field-group"><label for="new-pin-1">Nuevo PIN</label><input id="new-pin-1" class="search" type="password" inputmode="numeric" pattern="\\d{4,10}" maxlength="10" autocomplete="new-password" required></div>
          <div class="field-group"><label for="new-pin-2">Repite el PIN</label><input id="new-pin-2" class="search" type="password" inputmode="numeric" pattern="\\d{4,10}" maxlength="10" autocomplete="new-password" required></div>
          <p id="new-pin-error" class="error" role="alert" hidden></p>
          <div class="orama-modal-actions"><button type="button" class="button" data-new-pin-cancel>Cancelar</button><button type="submit" class="button primary">Guardar</button></div>
        </form></div>`;
      document.body.appendChild(overlay);
      const first = overlay.querySelector('#new-pin-1');
      const second = overlay.querySelector('#new-pin-2');
      const errorEl = overlay.querySelector('#new-pin-error');
      first.focus();
      const close = (value) => { document.removeEventListener('keydown', onKey); overlay.remove(); resolve(value); };
      const onKey = (event) => { if (event.key === 'Escape') close(null); };
      document.addEventListener('keydown', onKey);
      overlay.querySelector('[data-new-pin-cancel]').addEventListener('click', () => close(null));
      overlay.addEventListener('click', (event) => { if (event.target === overlay) close(null); });
      overlay.querySelector('#new-pin-form').addEventListener('submit', (event) => {
        event.preventDefault();
        if (first.value !== second.value) { errorEl.textContent = 'Los PIN no coinciden.'; errorEl.hidden = false; return; }
        close(first.value);
      });
    });
  }

  async function onSubmit(event) {
    if (event.target.id === 'gate-form') {
      event.preventDefault();
      const code = document.getElementById('gate-new').value;
      if (code !== document.getElementById('gate-confirm').value) { showError('gate-error', 'Los códigos no coinciden.'); return; }
      showError('gate-error', '');
      if (!(await Orama.confirm('Todos los dispositivos tendrán que escribir el nuevo código. ¿Cambiarlo ahora?'))) return;
      try {
        await post('/api/access/gate-passcode', { passcode: code });
        Orama.toast('Código cambiado. Escríbelo cuando el navegador lo pida.', 'success');
        setTimeout(() => window.location.reload(), 1800);
      } catch (error) { showError('gate-error', error.message); }
    }
    if (event.target.id === 'person-form') {
      event.preventDefault();
      showError('person-error', '');
      try {
        await post('/api/access/staff', { nombre: document.getElementById('person-name').value, tipo: document.getElementById('person-tipo').value, pin: document.getElementById('person-pin').value });
        Orama.toast('Persona agregada', 'success');
        await reload();
      } catch (error) { showError('person-error', error.message); }
    }
  }

  async function onClick(event) {
    const pinButton = event.target.closest('[data-pin-id]');
    if (pinButton) {
      const pin = await askNewPin(escapeHtml(pinButton.dataset.name));
      if (!pin) return;
      try { await post(`/api/access/staff/${pinButton.dataset.pinId}/pin`, { pin }); Orama.toast('PIN cambiado', 'success'); }
      catch (error) { Orama.toast(error.message, 'error'); }
      return;
    }
    const activeButton = event.target.closest('[data-active-id]');
    if (activeButton) {
      const activate = activeButton.dataset.set === '1';
      const ok = await Orama.confirm(`${activate ? 'Reactivar' : 'Desactivar'} a ${activeButton.dataset.name}?`, { danger: !activate, okText: activate ? 'Reactivar' : 'Desactivar' });
      if (!ok) return;
      try { await post(`/api/access/staff/${activeButton.dataset.activeId}/active`, { activo: activate }); Orama.toast(activate ? 'Persona reactivada' : 'Persona desactivada', 'success'); await reload(); }
      catch (error) { Orama.toast(error.message, 'error'); }
    }
  }

  app.addEventListener('submit', onSubmit);
  app.addEventListener('click', onClick);
  await reload();
  return () => { app.removeEventListener('submit', onSubmit); app.removeEventListener('click', onClick); };
}

Orama.routes.accesos = accesos;
