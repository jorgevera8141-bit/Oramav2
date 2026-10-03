const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveRoute, createCleanupManager } = require('../public/js/orama-router.js');

test('resolveRoute falls back to the fallback route on an empty hash', () => {
  const routes = { dashboard: () => 'd', mesas: () => 'm' };
  const { name, handler } = resolveRoute(routes, '', 'dashboard');
  assert.equal(name, 'dashboard');
  assert.equal(handler, routes.dashboard);
});

test('resolveRoute falls back to the fallback route on an unknown hash', () => {
  const routes = { dashboard: () => 'd', mesas: () => 'm' };
  const { name, handler } = resolveRoute(routes, '#nope', 'dashboard');
  assert.equal(name, 'nope');
  assert.equal(handler, routes.dashboard);
});

test('resolveRoute resolves a known hash to its own handler', () => {
  const routes = { dashboard: () => 'd', mesas: () => 'm' };
  const { name, handler } = resolveRoute(routes, '#mesas', 'dashboard');
  assert.equal(name, 'mesas');
  assert.equal(handler, routes.mesas);
});

test('cleanup manager runs a set cleanup exactly once', () => {
  const manager = createCleanupManager();
  let calls = 0;
  manager.set(() => { calls++; });
  manager.run();
  manager.run();
  assert.equal(calls, 1);
});

test('cleanup manager swallows an error thrown by the cleanup fn', () => {
  const manager = createCleanupManager();
  manager.set(() => { throw new Error('boom'); });
  assert.doesNotThrow(() => manager.run());
});

test('cleanup manager ignores a non-function passed to set', () => {
  const manager = createCleanupManager();
  manager.set('not a function');
  assert.doesNotThrow(() => manager.run());
});

const { landingRoute } = require('../public/js/orama-router.js');

test('landingRoute sends a device to Marcar the first time it is opened each business day', () => {
  assert.equal(landingRoute('', null, '2026-10-03'), '#marcar');
  assert.equal(landingRoute('#', '2026-10-02', '2026-10-03'), '#marcar', 'last seen yesterday');
});

test('landingRoute leaves the device alone once it has seen Marcar today, or when a page was asked for', () => {
  assert.equal(landingRoute('', '2026-10-03', '2026-10-03'), null);
  assert.equal(landingRoute('#caja', null, '2026-10-03'), null, 'a bookmarked page is never overridden');
  assert.equal(landingRoute('#marcar', null, '2026-10-03'), null);
});
