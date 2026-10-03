// Marcar: tap your name, enter your PIN, and the POS tells you where you stand. Identifying yourself
// never clocks you in: someone already on shift is recognised ("Ya estás en turno desde 8:02"), goes
// straight to where they work, and is never asked to clock in a second time. The shift lives on the
// server, so a restart, another device or a change of role all show the same thing. The PIN is asked
// every time; only the name of the last person is remembered, to point at their tile.
const MARCAR_DAY_KEY = 'orama.marcarDay';
const MARCAR_LAST_KEY = 'orama.lastStaff';
const MARCAR_IDLE_MS = 90 * 1000;
const MARCAR_REFRESH_MS = 45 * 1000;
const MARCAR_DESTINATIONS = [
  { hash: '#nueva-orden', label: 'Nueva orden' },
  { hash: '#barra', label: 'Barra' },
  { hash: '#caja', label: 'Caja' },
  { hash: '#mesas', label: 'Mesas' },
  { hash: '#dashboard', label: 'Resumen' }
];

const marcarStore = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked: the screen still works */ } }
};

const marcarPost = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function marcarClock(value) {
  return new Date(value).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: BUSINESS_TZ });
}

function marcarDuration(from, to = Date.now()) {
  const minutes = Math.max(0, Math.floor((new Date(to) - new Date(from)) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

function marcarBadge(tile) {
  if (tile.estado === 'en_turno') return `<span class="badge-estado live">En turno · ${marcarClock(tile.desde)}</span>`;
  if (tile.estado === 'olvido_salida') return '<span class="badge-estado danger">Turno sin cerrar</span>';
  if (tile.sin_entrada_hoy) return '<span class="badge-estado warn">Sin entrada hoy</span>';
  return '';
}

function marcarTilesMarkup(tiles, lastStaff) {
  if (!tiles.length) return '<div class="empty">Aún no hay personas. Un gerente puede agregarlas en Más > Accesos.</div>';
  return `<div class="mesa-grid">${tiles.map((tile) => {
    const name = escapeHtml(tile.nombre);
    const tone = tile.estado === 'en_turno' ? 'occupied' : tile.estado === 'olvido_salida' ? 'attention' : tile.sin_entrada_hoy ? 'expected' : '';
    return `<button type="button" class="mesa-card selectable marcar-tile ${tone}" data-marcar-name="${name}" aria-label="${name}${tile.estado === 'en_turno' ? ', en turno' : ''}">
      <h2 class="mesa-name">${name}</h2>${marcarBadge(tile)}${tile.nombre === lastStaff ? '<span class="last-used">Último en este equipo</span>' : ''}
    </button>`;
  }).join('')}</div>`;
}

// A small modal that checks the PIN against the server and shows a wrong or locked PIN inline.
function marcarAskPin(nombre) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'orama-overlay';
    overlay.innerHTML = `<div class="orama-modal" role="dialog" aria-modal="true">
      <p class="orama-modal-message">Hola, ${escapeHtml(nombre)}<br><span class="subtle">Escribe tu PIN</span></p>
      <form id="marcar-pin-form">
        <div class="field-group"><label for="marcar-pin">PIN</label><input id="marcar-pin" class="search" type="password" inputmode="numeric" maxlength="10" autocomplete="off" required></div>
        <p id="marcar-pin-error" class="error" role="alert" hidden></p>
        <div class="orama-modal-actions"><button type="button" class="button" data-marcar-cancel>Cancelar</button><button type="submit" class="button primary">Entrar</button></div>
      </form></div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#marcar-pin');
    const errorEl = overlay.querySelector('#marcar-pin-error');
    input.focus();
    const close = (value) => { document.removeEventListener('keydown', onKey); overlay.remove(); resolve(value); };
    const onKey = (event) => { if (event.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    overlay.querySelector('[data-marcar-cancel]').addEventListener('click', () => close(null));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(null); });
    overlay.querySelector('#marcar-pin-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const pin = input.value;
      const submit = overlay.querySelector('button[type=submit]');
      submit.disabled = true;
      try {
        const { persona } = await marcarPost('/api/marcar/estado', { nombre, pin });
        close({ nombre, pin, persona });
      } catch (error) {
        errorEl.textContent = error.message;
        errorEl.hidden = false;
        input.value = '';
        input.focus();
        submit.disabled = false;
      }
    });
  });
}

function marcarWhereMarkup(nombre) {
  const last = marcarStore.get(`orama.lastRoute.${nombre}`);
  return `<div class="marcar-where"><h3>¿A dónde vas?</h3><div class="action-row">${MARCAR_DESTINATIONS.map((dest) =>
    `<button type="button" class="button ${dest.hash === last ? 'primary' : ''}" data-marcar-go="${dest.hash}">${dest.label}</button>`).join('')}</div></div>`;
}

function marcarPersonMarkup(persona) {
  const name = escapeHtml(persona.nombre);
  if (persona.estado === 'fuera') {
    return `<p class="eyebrow">Hola</p><h2>${name}</h2><p class="subtle">Aún no marcas entrada hoy.</p>
      <button type="button" class="button primary marcar-big" data-marcar-act="entrada">Marcar entrada</button>`;
  }
  if (persona.estado === 'olvido_salida') {
    return `<p class="eyebrow">Hola</p><h2>${name}</h2>
      <p class="error" role="alert">Tu turno anterior (desde ${new Date(persona.desde).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: BUSINESS_TZ })}) sigue abierto. Pídele a un gerente que lo cierre en Nómina &gt; Corregir marcaciones.</p>
      ${marcarWhereMarkup(persona.nombre)}`;
  }
  return `<p class="eyebrow">Hola</p><h2>${name}</h2>
    <p><span class="badge-estado live">Ya estás en turno</span></p>
    <p class="subtle">Desde ${marcarClock(persona.desde)} (hace ${marcarDuration(persona.desde)})${persona.en_descanso ? ' · en descanso' : ''}</p>
    ${marcarWhereMarkup(persona.nombre)}
    <button type="button" class="button danger marcar-back" data-marcar-act="salida">Marcar salida</button>`;
}

// Shows one person's state with its single clock button. Used by the Marcar screen and by Nómina
// (where staff see only this). `hooks.onBack` adds a "No soy yo" button; `hooks.onDone` runs after a Salida.
async function marcarShowPerson(container, credentials, persona, hooks = {}) {
  let idleTimer = null;
  const arm = () => { clearTimeout(idleTimer); if (hooks.onBack) idleTimer = setTimeout(() => hooks.onBack(), MARCAR_IDLE_MS); };

  function paint(current) {
    container.innerHTML = `<div class="marcar-result">${marcarPersonMarkup(current)}${hooks.onBack ? '<div><button type="button" class="button marcar-back" data-marcar-back>No soy yo</button></div>' : ''}</div>`;
    arm();
  }

  async function act(kind) {
    const label = kind === 'entrada' ? 'Marcar entrada' : 'Marcar salida';
    if (kind === 'salida' && !(await Orama.confirm('¿Registrar tu salida?', { danger: true, okText: label }))) return;
    try {
      const result = await marcarPost(`/api/marcar/${kind}`, credentials);
      if (kind === 'entrada') {
        Orama.toast(result.ya_estaba ? 'Ya estabas en turno' : `Entrada registrada ${marcarClock(result.persona.desde)}`, 'success');
        paint(result.persona);
        return;
      }
      clearTimeout(idleTimer);
      container.innerHTML = `<div class="marcar-result"><p class="eyebrow">Hasta pronto</p><h2>${escapeHtml(persona.nombre)}</h2>
        <p><span class="badge-estado neutral">Salida registrada ${marcarClock(result.salida)}</span></p>
        <p class="subtle">Turno de ${marcarDuration(result.entrada, result.salida)}</p></div>`;
      if (hooks.onDone) setTimeout(() => hooks.onDone(), 6000);
    } catch (error) {
      Orama.toast(error.message, 'error');
    }
  }

  container.onclick = (event) => {
    arm();
    const actButton = event.target.closest('[data-marcar-act]');
    if (actButton) { act(actButton.dataset.marcarAct); return; }
    const goButton = event.target.closest('[data-marcar-go]');
    if (goButton) {
      marcarStore.set(`orama.lastRoute.${persona.nombre}`, goButton.dataset.marcarGo);
      window.location.hash = goButton.dataset.marcarGo;
      return;
    }
    if (event.target.closest('[data-marcar-back]') && hooks.onBack) hooks.onBack();
  };
  paint(persona);
  return () => { clearTimeout(idleTimer); container.onclick = null; };
}

// Used by Nómina for someone who is not a manager: only their own Marcación, nothing else.
async function marcarSelfCard(container, credentials) {
  try {
    const { persona } = await marcarPost('/api/marcar/estado', credentials);
    return await marcarShowPerson(container, credentials, persona);
  } catch (error) {
    container.innerHTML = `<div class="error" role="alert">${escapeHtml(error.message)}</div>`;
    Orama.toast(error.message, 'error');
    return null;
  }
}

async function marcar() {
  marcarStore.set(MARCAR_DAY_KEY, businessDate());
  app.innerHTML = pageHead('Turno', 'Marcar', 'Toca tu nombre para marcar entrada o salida, o para seguir con tu turno') +
    `<section class="panel"><div id="marcar-body">${loading}</div></section>`;
  const body = document.getElementById('marcar-body');
  let refreshTimer = null;
  let cleanupPerson = null;

  async function showTiles() {
    if (cleanupPerson) { cleanupPerson(); cleanupPerson = null; }
    clearInterval(refreshTimer);
    try {
      const { tiles } = await api('/api/marcar/tiles');
      body.innerHTML = marcarTilesMarkup(tiles, marcarStore.get(MARCAR_LAST_KEY));
    } catch (error) {
      body.innerHTML = `<div class="error" role="alert">${escapeHtml(error.message)}</div>`;
    }
    refreshTimer = setInterval(async () => {
      try { const { tiles } = await api('/api/marcar/tiles'); body.innerHTML = marcarTilesMarkup(tiles, marcarStore.get(MARCAR_LAST_KEY)); } catch { /* keep what is shown */ }
    }, MARCAR_REFRESH_MS);
  }

  async function onClick(event) {
    const tile = event.target.closest('[data-marcar-name]');
    if (!tile) return;
    const info = await marcarAskPin(tile.dataset.marcarName);
    if (!info) return;
    marcarStore.set(MARCAR_LAST_KEY, info.nombre);
    clearInterval(refreshTimer);
    cleanupPerson = await marcarShowPerson(body, { nombre: info.nombre, pin: info.pin }, info.persona, { onBack: showTiles, onDone: showTiles });
  }

  app.addEventListener('click', onClick);
  await showTiles();
  return () => { app.removeEventListener('click', onClick); clearInterval(refreshTimer); if (cleanupPerson) cleanupPerson(); };
}

Orama.routes.marcar = marcar;
