const express = require('express');
const pool = require('../../config/database');
const { validate } = require('../../middleware/validate');
const { createPromotionSchema, updatePromotionSchema, pinActionSchema, reviewActionSchema, previewSchema } = require('./schemas');
const { verifyStaffPin } = require('../../shared/pin-auth');
const { logBitacora, getStaffTipo } = require('../../shared/audit');
const { hasWindowStarted, toDateString } = require('./engine');
const { sweepPromotionLifecycle, getActivePromotions, priceItems } = require('./service');

const router = express.Router();

router.get('/promotions', async (req, res) => {
  await sweepPromotionLifecycle();
  const estado = typeof req.query.estado === 'string' ? req.query.estado : null;
  const { rows } = estado
    ? await pool.query('SELECT * FROM promociones WHERE estado = $1 ORDER BY created_at DESC', [estado])
    : await pool.query('SELECT * FROM promociones ORDER BY created_at DESC');
  res.json({ success: true, promociones: rows });
});

router.get('/promotions/active', async (_req, res) => {
  const promociones = await getActivePromotions();
  res.json({ success: true, promociones });
});

router.post('/promotions/preview', validate(previewSchema), async (req, res) => {
  const pricing = await priceItems(req.body.items);
  res.json({ success: true, ...pricing });
});

router.get('/promotions/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query('SELECT * FROM promociones WHERE id = $1', [id]);
  if (!rows.length) throw Object.assign(new Error('Promoción no encontrada'), { statusCode: 404 });
  const { rows: historial } = await pool.query(
    'SELECT * FROM bitacora WHERE entidad_tipo = $1 AND entidad_id = $2 ORDER BY created_at ASC',
    ['promocion', id]
  );
  res.json({ success: true, promocion: rows[0], bitacora: historial });
});

router.post('/promotions', validate(createPromotionSchema), async (req, res) => {
  const b = req.body;
  const { rows } = await pool.query(
    `INSERT INTO promociones
     (nombre, descripcion, tipo, producto_ids, categoria, precio_promocional, porcentaje_descuento,
      compra_cantidad, lleva_producto_id, lleva_cantidad, lleva_descuento_pct,
      fecha_inicio, hora_inicio, fecha_fin, hora_fin, limite_unidades, condiciones, apilable, imagen_url, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [b.nombre, b.descripcion || null, b.tipo, b.producto_ids || null, b.categoria || null,
      b.precio_promocional || null, b.porcentaje_descuento || null, b.compra_cantidad || null,
      b.lleva_producto_id || null, b.lleva_cantidad || null, b.lleva_descuento_pct ?? 100,
      b.fecha_inicio, b.hora_inicio || null, b.fecha_fin, b.hora_fin || null,
      b.limite_unidades || null, b.condiciones || null, b.apilable ?? false, b.imagen_url || null, b.creado_por]
  );
  const promo = rows[0];
  const actorTipo = await getStaffTipo(b.creado_por);
  await logBitacora({
    entidadTipo: 'promocion', entidadId: promo.id, accion: 'creada',
    actorNombre: b.creado_por, actorTipo, estadoAnterior: null, estadoNuevo: promo.estado,
    detalle: { nombre: promo.nombre, tipo: promo.tipo }
  });
  res.status(201).json({ success: true, promocion: promo });
});

router.put('/promotions/:id', validate(updatePromotionSchema), async (req, res) => {
  const id = Number(req.params.id);
  const { rows: existingRows } = await pool.query('SELECT * FROM promociones WHERE id = $1', [id]);
  const existing = existingRows[0];
  if (!existing) throw Object.assign(new Error('Promoción no encontrada'), { statusCode: 404 });
  if (!['DRAFT', 'CHANGES_REQUESTED'].includes(existing.estado)) {
    throw Object.assign(new Error(`No se puede editar una promoción en estado ${existing.estado}.`), { statusCode: 400 });
  }
  const b = req.body;
  const { rows } = await pool.query(
    `UPDATE promociones SET
       nombre = COALESCE($1, nombre), descripcion = COALESCE($2, descripcion), tipo = COALESCE($3, tipo),
       producto_ids = COALESCE($4, producto_ids), categoria = COALESCE($5, categoria),
       precio_promocional = COALESCE($6, precio_promocional), porcentaje_descuento = COALESCE($7, porcentaje_descuento),
       compra_cantidad = COALESCE($8, compra_cantidad), lleva_producto_id = COALESCE($9, lleva_producto_id),
       lleva_cantidad = COALESCE($10, lleva_cantidad), lleva_descuento_pct = COALESCE($11, lleva_descuento_pct),
       fecha_inicio = COALESCE($12, fecha_inicio), hora_inicio = COALESCE($13, hora_inicio),
       fecha_fin = COALESCE($14, fecha_fin), hora_fin = COALESCE($15, hora_fin),
       limite_unidades = COALESCE($16, limite_unidades), condiciones = COALESCE($17, condiciones),
       apilable = COALESCE($18, apilable), imagen_url = COALESCE($19, imagen_url),
       estado = CASE WHEN estado = 'CHANGES_REQUESTED' THEN 'DRAFT' ELSE estado END,
       updated_at = now()
     WHERE id = $20 RETURNING *`,
    [b.nombre, b.descripcion, b.tipo, b.producto_ids, b.categoria, b.precio_promocional, b.porcentaje_descuento,
      b.compra_cantidad, b.lleva_producto_id, b.lleva_cantidad, b.lleva_descuento_pct,
      b.fecha_inicio, b.hora_inicio, b.fecha_fin, b.hora_fin, b.limite_unidades, b.condiciones,
      b.apilable, b.imagen_url, id]
  );
  const updated = rows[0];
  const actorNombre = b.creado_por || existing.creado_por;
  const actorTipo = await getStaffTipo(actorNombre);
  await logBitacora({
    entidadTipo: 'promocion', entidadId: id, accion: 'editada',
    actorNombre, actorTipo, estadoAnterior: existing.estado, estadoNuevo: updated.estado
  });
  res.json({ success: true, promocion: updated });
});

router.post('/promotions/:id/submit', validate(pinActionSchema), async (req, res) => {
  const id = Number(req.params.id);
  const staffMember = await verifyStaffPin(req.body.actor_nombre, req.body.actor_pin);
  const { rows } = await pool.query('SELECT * FROM promociones WHERE id = $1', [id]);
  const promo = rows[0];
  if (!promo) throw Object.assign(new Error('Promoción no encontrada'), { statusCode: 404 });
  if (!['DRAFT', 'CHANGES_REQUESTED'].includes(promo.estado)) {
    throw Object.assign(new Error(`No se puede enviar a revisión una promoción en estado ${promo.estado}.`), { statusCode: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (toDateString(promo.fecha_fin) < today) {
    throw Object.assign(new Error('No se puede enviar a revisión una promoción cuya fecha de expiración ya pasó.'), { statusCode: 400 });
  }
  const { rows: updatedRows } = await pool.query(
    "UPDATE promociones SET estado = 'PENDING_APPROVAL', updated_at = now() WHERE id = $1 RETURNING *", [id]
  );
  await logBitacora({
    entidadTipo: 'promocion', entidadId: id, accion: 'enviada_a_revision',
    actorNombre: staffMember.nombre, actorTipo: staffMember.tipo,
    estadoAnterior: promo.estado, estadoNuevo: 'PENDING_APPROVAL'
  });
  res.json({ success: true, promocion: updatedRows[0] });
});

router.post('/promotions/:id/review', validate(reviewActionSchema), async (req, res) => {
  const id = Number(req.params.id);
  const staffMember = await verifyStaffPin(req.body.actor_nombre, req.body.actor_pin, 'management');
  const { rows } = await pool.query('SELECT * FROM promociones WHERE id = $1', [id]);
  const promo = rows[0];
  if (!promo) throw Object.assign(new Error('Promoción no encontrada'), { statusCode: 404 });
  if (promo.estado !== 'PENDING_APPROVAL') {
    throw Object.assign(new Error(`Solo se pueden revisar promociones pendientes de aprobación (estado actual: ${promo.estado}).`), { statusCode: 400 });
  }
  let nuevoEstado;
  if (req.body.accion === 'reject') nuevoEstado = 'REJECTED';
  else if (req.body.accion === 'changes_requested') nuevoEstado = 'CHANGES_REQUESTED';
  else nuevoEstado = hasWindowStarted(promo, new Date()) ? 'ACTIVE' : 'SCHEDULED';

  const { rows: updatedRows } = await pool.query(
    'UPDATE promociones SET estado = $1, updated_at = now() WHERE id = $2 RETURNING *', [nuevoEstado, id]
  );
  const accionLabel = { approve: 'aprobada', reject: 'rechazada', changes_requested: 'cambios_solicitados' }[req.body.accion];
  await logBitacora({
    entidadTipo: 'promocion', entidadId: id, accion: accionLabel,
    actorNombre: staffMember.nombre, actorTipo: staffMember.tipo,
    estadoAnterior: 'PENDING_APPROVAL', estadoNuevo: nuevoEstado,
    detalle: req.body.nota ? { nota: req.body.nota } : null
  });
  res.json({ success: true, promocion: updatedRows[0] });
});

router.post('/promotions/:id/activate', validate(pinActionSchema), async (req, res) => {
  const id = Number(req.params.id);
  const staffMember = await verifyStaffPin(req.body.actor_nombre, req.body.actor_pin, 'management');
  const { rows } = await pool.query('SELECT * FROM promociones WHERE id = $1', [id]);
  const promo = rows[0];
  if (!promo) throw Object.assign(new Error('Promoción no encontrada'), { statusCode: 404 });
  if (!['APPROVED', 'SCHEDULED'].includes(promo.estado)) {
    throw Object.assign(new Error(`Solo se pueden activar promociones aprobadas o programadas (estado actual: ${promo.estado}).`), { statusCode: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (toDateString(promo.fecha_fin) < today) {
    throw Object.assign(new Error('No se pudo activar la promoción porque la fecha de expiración ya pasó.'), { statusCode: 400 });
  }
  const { rows: updatedRows } = await pool.query(
    "UPDATE promociones SET estado = 'ACTIVE', updated_at = now() WHERE id = $1 RETURNING *", [id]
  );
  await logBitacora({
    entidadTipo: 'promocion', entidadId: id, accion: 'activada',
    actorNombre: staffMember.nombre, actorTipo: staffMember.tipo,
    estadoAnterior: promo.estado, estadoNuevo: 'ACTIVE'
  });
  res.json({ success: true, promocion: updatedRows[0] });
});

router.post('/promotions/:id/deactivate', validate(pinActionSchema), async (req, res) => {
  const id = Number(req.params.id);
  const staffMember = await verifyStaffPin(req.body.actor_nombre, req.body.actor_pin, 'management');
  const { rows } = await pool.query('SELECT * FROM promociones WHERE id = $1', [id]);
  const promo = rows[0];
  if (!promo) throw Object.assign(new Error('Promoción no encontrada'), { statusCode: 404 });
  if (!['ACTIVE', 'SCHEDULED', 'APPROVED'].includes(promo.estado)) {
    throw Object.assign(new Error(`No se puede desactivar una promoción en estado ${promo.estado}.`), { statusCode: 400 });
  }
  const { rows: updatedRows } = await pool.query(
    "UPDATE promociones SET estado = 'CANCELLED', updated_at = now() WHERE id = $1 RETURNING *", [id]
  );
  await logBitacora({
    entidadTipo: 'promocion', entidadId: id, accion: 'desactivada',
    actorNombre: staffMember.nombre, actorTipo: staffMember.tipo,
    estadoAnterior: promo.estado, estadoNuevo: 'CANCELLED'
  });
  res.json({ success: true, promocion: updatedRows[0] });
});

router.delete('/promotions/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query('SELECT estado FROM promociones WHERE id = $1', [id]);
  if (!rows.length) throw Object.assign(new Error('Promoción no encontrada'), { statusCode: 404 });
  if (rows[0].estado !== 'DRAFT') {
    throw Object.assign(new Error('Solo se pueden eliminar promociones en borrador.'), { statusCode: 400 });
  }
  await pool.query('DELETE FROM promociones WHERE id = $1', [id]);
  res.json({ success: true });
});

module.exports = router;
