const { z } = require('zod');

const crearOrdenItemSchema = z.object({
  menu_item_id: z.number().int().positive(),
  cantidad: z.number().int().positive()
});

const crearOrdenSchema = z.object({
  mesa_id: z.number().int().positive().optional(),
  mesa_nombre: z.string().max(80).optional(),
  items: z.array(crearOrdenItemSchema).min(1),
  notas: z.string().max(500).optional()
});

const pagoSchema = z.object({
  payment_method: z.enum(['efectivo', 'tarjeta', 'mixto', 'cortesia', 'cliente_frecuente']),
  amount_cash: z.number().nonnegative().default(0),
  amount_card: z.number().nonnegative().default(0),
  persona_nombre: z.string().max(120).optional()
});

const cerrarSchema = z.object({
  payment_method: z.enum(['efectivo', 'tarjeta', 'mixto', 'cortesia', 'cliente_frecuente', 'dividido']).optional(),
  amount_cash: z.number().nonnegative().optional(),
  amount_card: z.number().nonnegative().optional(),
  notas: z.string().max(500).optional(),
  pagos: z.array(pagoSchema).min(1).optional()
});

const cancelarSchema = z.object({
  motivo: z.string().max(500).optional()
});

module.exports = { cerrarSchema, cancelarSchema, pagoSchema, crearOrdenSchema };
