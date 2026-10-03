function resolveRoute(routes, hash, fallbackName = 'dashboard') {
  const name = (hash || '').replace(/^#/, '') || fallbackName;
  return { name, handler: routes[name] || routes[fallbackName] };
}

function createCleanupManager() {
  let current = null;
  return {
    run() {
      if (typeof current === 'function') {
        try { current(); } catch (error) { console.error(error); }
      }
      current = null;
    },
    set(fn) { current = typeof fn === 'function' ? fn : null; }
  };
}

// The first time a device is opened each business day it lands on Marcar (clock in / continue your
// shift); after that, and whenever a specific page was asked for, it opens where it was told to.
function landingRoute(hash, lastMarcarDay, today) {
  const noPageAsked = !hash || hash === '#';
  return noPageAsked && lastMarcarDay !== today ? '#marcar' : null;
}

if (typeof window !== 'undefined') {
  const routeCleanup = createCleanupManager();
  window.render = async function render() {
    const { name, handler } = resolveRoute(Orama.routes, location.hash, 'dashboard');
    setActive(name);
    routeCleanup.run();
    app.setAttribute('aria-busy', 'true');
    app.innerHTML = loading;
    try {
      const cleanup = await handler();
      routeCleanup.set(cleanup);
    } catch (error) {
      app.innerHTML = `<div class="error" role="alert">${escapeHtml(error.message)}</div>`;
    } finally {
      app.setAttribute('aria-busy', 'false');
      if (window.OramaFx) OramaFx.init(app);
    }
  };
  window.addEventListener('hashchange', window.render);
  let lastMarcarDay = null;
  try { lastMarcarDay = localStorage.getItem('orama.marcarDay'); } catch { /* storage blocked: treat as never seen */ }
  const landing = landingRoute(location.hash, lastMarcarDay, businessDate());
  if (landing) history.replaceState(null, '', landing);
  window.render();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { resolveRoute, createCleanupManager, landingRoute };
}
