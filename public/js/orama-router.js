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
    }
  };
  window.addEventListener('hashchange', window.render);
  window.render();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { resolveRoute, createCleanupManager };
}
