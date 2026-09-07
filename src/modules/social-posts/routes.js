const express = require('express');
const pool = require('../../config/database');
const { validate } = require('../../middleware/validate');
const { verifyStaffPin } = require('../../shared/pin-auth');
const { logBitacora, getStaffTipo } = require('../../shared/audit');
const { notifyApprovalRequested } = require('../../shared/notify');
const { createSocialPostSchema, updateSocialPostSchema, pinActionSchema, reviewActionSchema, aiDraftSchema, aiImageSchema } = require('./schemas');
const { estadoTrasAprobacion, publishToProviders } = require('./service');
const { generateCopy, AI_MODEL, AI_BACKEND } = require('./ai');
const { generateImage, IMAGE_MODEL, IMAGE_BACKEND } = require('./image-gen');
const { assertUnderDailyLimit } = require('./ai-usage');

const router = express.Router();

const EDITABLE = ['DRAFT', 'CHANGES_REQUESTED'];

function notFound() {
  return Object.assign(new Error('Publicación no encontrada'), { statusCode: 404 });
}

async function loadPost(id) {
  const { rows } = await pool.query('SELECT * FROM publicaciones_sociales WHERE id = $1', [id]);
  if (!rows.length) throw notFound();
  return rows[0];
}

async function loadPromo(id) {
  const { rows } = await pool.query('SELECT * FROM promociones WHERE id = $1', [id]);
  if (!rows.length) throw Object.assign(new Error('La promoción indicada no existe.'), { statusCode: 400 });
  return rows[0];
}

// AI draft helpers — PIN-gated (any staff) and capped because each call costs
// money. They only return suggested content; nothing is persisted here and the
// approval workflow is untouched.
router.post('/social-posts/ai/draft', validate(aiDraftSchema), async (req, res) => {
  const staff = await verifyStaffPin(req.body.actor_nombre, req.body.actor_pin);
  await assertUnderDailyLimit();
  const promo = await loadPromo(req.body.promocion_id);
  const copy = await generateCopy(promo, req.body.contexto);
  await logBitacora({
    entidadTipo: 'ai_generacion', entidadId: promo.id, accion: 'texto',
    actorNombre: staff.nombre, actorTipo: staff.tipo, detalle: { model: AI_MODEL, via: AI_BACKEND }
  });
  res.json({ success: true, ...copy });
});

router.post('/social-posts/ai/image', validate(aiImageSchema), async (req, res) => {
  const staff = await verifyStaffPin(req.body.actor_nombre, req.body.actor_pin);
  await assertUnderDailyLimit();
  const promo = await loadPromo(req.body.promocion_id);
  const result = await generateImage(promo, req.body.prompt);
  await logBitacora({
    entidadTipo: 'ai_generacion', entidadId: promo.id, accion: 'imagen',
    actorNombre: staff.nombre, actorTipo: staff.tipo, detalle: { model: IMAGE_MODEL, via: IMAGE_BACKEND, prompt: result.prompt }
  });
  res.json({ success: true, url: result.url, width: result.width, height: result.height });
});

router.get('/social-posts', async (req, res) => {
  const { estado, promocion_id: promocionId } = req.query;
  const clauses = [];
  const params = [];
  if (typeof estado === 'string') { params.push(estado); clauses.push(`estado = $${params.length}`); }
  if (promocionId) { params.push(Number(promocionId)); clauses.push(`promocion_id = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT ps.*, p.nombre AS promocion_nombre
     FROM publicaciones_sociales ps
     LEFT JOIN promociones p ON p.id = ps.promocion_id
     ${where} ORDER BY ps.created_at DESC`,
    params
  );
  res.json({ success: true, publicaciones: rows });
});

router.get('/social-posts/:id', async (req, res) => {
  const id = Number(req.params.id);
  const post = await loadPost(id);
  const { rows: historial } = await pool.query(
    'SELECT * FROM bitacora WHERE entidad_tipo = $1 AND entidad_id = $2 ORDER BY created_at ASC',
    ['publicacion_social', id]
  );
  res.json({ success: true, publicacion: post, bitacora: historial });
});

router.post('/social-posts', validate(createSocialPostSchema), async (req, res) => {
  const b = req.body;
  const { rows: promoRows } = await pool.query('SELECT id FROM promociones WHERE id = $1', [b.promocion_id]);
  if (!promoRows.length) throw Object.assign(new Error('La promoción indicada no existe.'), { statusCode: 400 });

  const { rows } = await pool.query(
    `INSERT INTO publicaciones_sociales
     (promocion_id, titular, caption, cta, hashtags, imagen_url, imagenes_adicionales, plataformas, programado_para, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [b.promocion_id, b.titular || null, b.caption || null, b.cta || null, b.hashtags || null,
      b.imagen_url || null, b.imagenes_adicionales || null, b.plataformas, b.programado_para || null, b.creado_por]
  );
  const post = rows[0];
  await logBitacora({
    entidadTipo: 'publicacion_social', entidadId: post.id, accion: 'creada',
    actorNombre: b.creado_por, actorTipo: await getStaffTipo(b.creado_por),
    estadoAnterior: null, estadoNuevo: post.estado, detalle: { plataformas: post.plataformas }
  });
  res.status(201).json({ success: true, publicacion: post });
});

router.put('/social-posts/:id', validate(updateSocialPostSchema), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await loadPost(id);
  if (!EDITABLE.includes(existing.estado)) {
    throw Object.assign(new Error(`No se puede editar una publicación en estado ${existing.estado}.`), { statusCode: 400 });
  }
  const b = req.body;
  const { rows } = await pool.query(
    `UPDATE publicaciones_sociales SET
       titular = COALESCE($1, titular), caption = COALESCE($2, caption), cta = COALESCE($3, cta),
       hashtags = COALESCE($4, hashtags), imagen_url = COALESCE($5, imagen_url),
       imagenes_adicionales = COALESCE($6, imagenes_adicionales), plataformas = COALESCE($7, plataformas),
       programado_para = COALESCE($8, programado_para),
       estado = CASE WHEN estado = 'CHANGES_REQUESTED' THEN 'DRAFT' ELSE estado END,
       updated_at = now()
     WHERE id = $9 RETURNING *`,
    [b.titular, b.caption, b.cta, b.hashtags, b.imagen_url, b.imagenes_adicionales,
      b.plataformas, b.programado_para, id]
  );
  const updated = rows[0];
  const actorNombre = b.creado_por || existing.creado_por;
  await logBitacora({
    entidadTipo: 'publicacion_social', entidadId: id, accion: 'editada',
    actorNombre, actorTipo: await getStaffTipo(actorNombre),
    estadoAnterior: existing.estado, estadoNuevo: updated.estado
  });
  res.json({ success: true, publicacion: updated });
});

router.post('/social-posts/:id/submit', validate(pinActionSchema), async (req, res) => {
  const id = Number(req.params.id);
  const staffMember = await verifyStaffPin(req.body.actor_nombre, req.body.actor_pin);
  const post = await loadPost(id);
  if (!EDITABLE.includes(post.estado)) {
    throw Object.assign(new Error(`No se puede enviar a revisión una publicación en estado ${post.estado}.`), { statusCode: 400 });
  }
  const { rows } = await pool.query(
    "UPDATE publicaciones_sociales SET estado = 'PENDING_APPROVAL', updated_at = now() WHERE id = $1 RETURNING *", [id]
  );
  await logBitacora({
    entidadTipo: 'publicacion_social', entidadId: id, accion: 'enviada_a_revision',
    actorNombre: staffMember.nombre, actorTipo: staffMember.tipo,
    estadoAnterior: post.estado, estadoNuevo: 'PENDING_APPROVAL'
  });
  notifyApprovalRequested('publicacion_social', rows[0], staffMember.nombre)
    .catch((error) => console.error('[notify]', error.message));
  res.json({ success: true, publicacion: rows[0] });
});

router.post('/social-posts/:id/review', validate(reviewActionSchema), async (req, res) => {
  const id = Number(req.params.id);
  const staffMember = await verifyStaffPin(req.body.actor_nombre, req.body.actor_pin, 'management');
  const post = await loadPost(id);
  if (post.estado !== 'PENDING_APPROVAL') {
    throw Object.assign(new Error(`Solo se pueden revisar publicaciones pendientes de aprobación (estado actual: ${post.estado}).`), { statusCode: 400 });
  }
  let nuevoEstado;
  if (req.body.accion === 'reject') nuevoEstado = 'REJECTED';
  else if (req.body.accion === 'changes_requested') nuevoEstado = 'CHANGES_REQUESTED';
  else nuevoEstado = estadoTrasAprobacion(post);

  const { rows } = await pool.query(
    'UPDATE publicaciones_sociales SET estado = $1, updated_at = now() WHERE id = $2 RETURNING *', [nuevoEstado, id]
  );
  const accionLabel = { approve: 'aprobada', reject: 'rechazada', changes_requested: 'cambios_solicitados' }[req.body.accion];
  await logBitacora({
    entidadTipo: 'publicacion_social', entidadId: id, accion: accionLabel,
    actorNombre: staffMember.nombre, actorTipo: staffMember.tipo,
    estadoAnterior: 'PENDING_APPROVAL', estadoNuevo: nuevoEstado,
    detalle: req.body.nota ? { nota: req.body.nota } : null
  });
  res.json({ success: true, publicacion: rows[0] });
});

router.post('/social-posts/:id/publish', validate(pinActionSchema), async (req, res) => {
  const id = Number(req.params.id);
  const staffMember = await verifyStaffPin(req.body.actor_nombre, req.body.actor_pin, 'management');
  const post = await loadPost(id);
  if (!['APPROVED', 'SCHEDULED'].includes(post.estado)) {
    throw Object.assign(new Error(`Solo se pueden publicar publicaciones aprobadas o programadas (estado actual: ${post.estado}).`), { statusCode: 400 });
  }
  const { estado, resultados } = await publishToProviders(post);
  const { rows } = await pool.query(
    'UPDATE publicaciones_sociales SET estado = $1, updated_at = now() WHERE id = $2 RETURNING *', [estado, id]
  );
  await logBitacora({
    entidadTipo: 'publicacion_social', entidadId: id, accion: 'preparada_para_publicacion',
    actorNombre: staffMember.nombre, actorTipo: staffMember.tipo,
    estadoAnterior: post.estado, estadoNuevo: estado, detalle: { resultados }
  });
  res.json({ success: true, publicacion: rows[0], resultados });
});

router.delete('/social-posts/:id', async (req, res) => {
  const id = Number(req.params.id);
  const post = await loadPost(id);
  if (post.estado !== 'DRAFT') {
    throw Object.assign(new Error('Solo se pueden eliminar publicaciones en borrador.'), { statusCode: 400 });
  }
  await pool.query('DELETE FROM publicaciones_sociales WHERE id = $1', [id]);
  res.json({ success: true });
});

module.exports = router;
