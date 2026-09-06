const express = require('express');
const pool = require('../../config/database');
const { validate } = require('../../middleware/validate');
const { createPromotionSchema, updatePromotionSchema } = require('./schemas');

const router = express.Router();

async function getStaffTipo(nombre) {
  const { rows } = await pool.query('SELECT tipo FROM staff WHERE nombre = $1', [nombre]);
  return rows[0]?.tipo || 'staff';
}

async function logBitacora({ entidadTipo, entidadId, accion, actorNombre, actorTipo, estadoAnterior, estadoNuevo, detalle }) {
  await pool.query(
    `INSERT INTO bitacora (entidad_tipo, entidad_id, accion, actor_nombre, actor_tipo, estado_anterior, estado_nuevo, detalle)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [entidadTipo, entidadId, accion, actorNombre, actorTipo, estadoAnterior || null, estadoNuevo || null, detalle ? JSON.stringify(detalle) : null]
  );
}

router.get('/promotions', async (req, res) => {
  const estado = typeof req.query.estado === 'string' ? req.query.estado : null;
  const { rows } = estado
    ? await pool.query('SELECT * FROM promociones WHERE estado = $1 ORDER BY created_at DESC', [estado])
    : await pool.query('SELECT * FROM promociones ORDER BY created_at DESC');
  res.json({ success: true, promociones: rows });
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
