const { z } = require('zod');
const { PROMOTION_TIPOS } = require('./engine');

const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const promotionFields = {
  nombre: z.string().min(1).max(120),
  descripcion: z.string().max(500).optional(),
  tipo: z.enum(PROMOTION_TIPOS),
  producto_ids: z.array(z.number().int().positive()).min(1).optional(),
  categoria: z.string().max(80).optional(),
  precio_promocional: z.number().positive().optional(),
  porcentaje_descuento: z.number().min(0).max(100).optional(),
  compra_cantidad: z.number().int().positive().optional(),
  lleva_producto_id: z.number().int().positive().optional(),
  lleva_cantidad: z.number().int().positive().optional(),
  lleva_descuento_pct: z.number().min(0).max(100).optional(),
  fecha_inicio: z.string().regex(dateRegex, 'fecha_inicio debe tener formato YYYY-MM-DD'),
  hora_inicio: z.string().regex(timeRegex, 'hora_inicio debe tener formato HH:MM').optional(),
  fecha_fin: z.string().regex(dateRegex, 'fecha_fin debe tener formato YYYY-MM-DD'),
  hora_fin: z.string().regex(timeRegex, 'hora_fin debe tener formato HH:MM').optional(),
  limite_unidades: z.number().int().positive().optional(),
  condiciones: z.string().max(500).optional(),
  apilable: z.boolean().optional(),
  imagen_url: z.string().max(300).optional(),
  creado_por: z.string().min(1).max(120)
};

function typeFieldsPresent(data) {
  if (data.tipo === 'precio_fijo') {
    return !!data.precio_promocional && Array.isArray(data.producto_ids) && data.producto_ids.length > 0;
  }
  if (data.tipo === 'descuento_porcentaje') {
    return data.porcentaje_descuento != null && ((Array.isArray(data.producto_ids) && data.producto_ids.length > 0) || !!data.categoria);
  }
  if (data.tipo === 'compra_x_lleva_y') {
    return !!data.compra_cantidad && !!data.lleva_producto_id && !!data.lleva_cantidad
      && Array.isArray(data.producto_ids) && data.producto_ids.length > 0;
  }
  return true;
}

const createPromotionSchema = z.object(promotionFields)
  .refine((data) => data.fecha_fin >= data.fecha_inicio, {
    message: 'La fecha de expiración no puede ser anterior a la fecha de inicio', path: ['fecha_fin']
  })
  .refine(typeFieldsPresent, { message: 'Faltan campos requeridos para este tipo de promoción' });

const updatePromotionSchema = z.object(promotionFields).partial();

const pinActionSchema = z.object({
  actor_nombre: z.string().min(1).max(120),
  actor_pin: z.string().min(1).max(20)
});

const reviewActionSchema = pinActionSchema.extend({
  accion: z.enum(['approve', 'reject', 'changes_requested']),
  nota: z.string().max(500).optional()
}).refine((data) => data.accion !== 'changes_requested' || !!data.nota, {
  message: 'Se requiere una nota explicando los cambios solicitados', path: ['nota']
});

module.exports = { createPromotionSchema, updatePromotionSchema, pinActionSchema, reviewActionSchema };
