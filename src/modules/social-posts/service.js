const { getProviders } = require('./providers');

// approve → SCHEDULED when a future publish time is set, otherwise APPROVED
// (ready for a manager to push to READY_FOR_PUBLICATION now).
function estadoTrasAprobacion(post, now = new Date()) {
  if (post.programado_para && new Date(post.programado_para).getTime() > now.getTime()) return 'SCHEDULED';
  return 'APPROVED';
}

// Runs every selected provider. None can return PUBLISHED (no API credentials by
// design), so the aggregate outcome is always READY_FOR_PUBLICATION.
async function publishToProviders(post) {
  const resultados = await Promise.all(getProviders(post.plataformas).map((provider) => provider.publish(post)));
  return { estado: 'READY_FOR_PUBLICATION', resultados };
}

module.exports = { estadoTrasAprobacion, publishToProviders };
