const { z } = require('zod');

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

module.exports = { cerrarSchema, cancelarSchema, pagoSchema };
