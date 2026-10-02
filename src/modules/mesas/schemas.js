const { z } = require('zod');

const createMesaSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  status: z.enum(['disponible', 'ocupada']).optional()
});

module.exports = { createMesaSchema };
