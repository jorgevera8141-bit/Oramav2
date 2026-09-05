const { z } = require('zod');

const cerrarSchema = z.object({
  payment_method: z.enum(['efectivo', 'tarjeta', 'mixto', 'cortesia', 'cliente_frecuente']).optional(),
  amount_cash: z.number().nonnegative().optional(),
  amount_card: z.number().nonnegative().optional(),
  notas: z.string().max(500).optional()
});

module.exports = { cerrarSchema };
