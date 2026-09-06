const test = require('node:test');
const assert = require('node:assert/strict');
const { getProvider, getProviders, PLATAFORMAS } = require('../src/modules/social-posts/providers');
const { estadoTrasAprobacion, publishToProviders } = require('../src/modules/social-posts/service');

const samplePost = {
  titular: 'Promo del día',
  caption: 'Solo hoy',
  cta: 'Ven a probarlo',
  hashtags: '#cafe #rosinal',
  imagen_url: '/uploads/abc.jpg',
  plataformas: ['instagram', 'facebook']
};

test('exposes exactly instagram and facebook', () => {
  assert.deepEqual([...PLATAFORMAS].sort(), ['facebook', 'instagram']);
});

test('getProvider throws a 400 for an unknown platform', () => {
  assert.throws(() => getProvider('tiktok'), (err) => err.statusCode === 400);
});

test('every provider reports READY_FOR_PUBLICATION, never PUBLISHED', async () => {
  for (const provider of getProviders(PLATAFORMAS)) {
    const result = await provider.publish(samplePost);
    assert.equal(result.status, 'READY_FOR_PUBLICATION');
    assert.notEqual(result.status, 'PUBLISHED');
  }
});

test('base SocialProvider.publish is abstract', async () => {
  const { SocialProvider } = require('../src/modules/social-posts/providers/base');
  await assert.rejects(() => new SocialProvider('x').publish({}));
});

test('publishToProviders aggregates to READY_FOR_PUBLICATION with one result per platform', async () => {
  const { estado, resultados } = await publishToProviders(samplePost);
  assert.equal(estado, 'READY_FOR_PUBLICATION');
  assert.equal(resultados.length, 2);
  assert.ok(resultados.every((r) => r.status === 'READY_FOR_PUBLICATION'));
});

test('estadoTrasAprobacion returns SCHEDULED only for a future programado_para', () => {
  const now = new Date('2026-09-06T12:00:00Z');
  assert.equal(estadoTrasAprobacion({ programado_para: '2026-09-10T14:30' }, now), 'SCHEDULED');
  assert.equal(estadoTrasAprobacion({ programado_para: '2026-09-01T14:30' }, now), 'APPROVED');
  assert.equal(estadoTrasAprobacion({ programado_para: null }, now), 'APPROVED');
});
