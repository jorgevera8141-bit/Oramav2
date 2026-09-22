const { z } = require('zod');

const pinSchema = z.union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value.length > 0, 'El PIN es requerido');

const clockPayloadSchema = z.object({
  nombre: z.string().trim().min(1),
  pin: pinSchema,
  screen: z.string().trim().min(1).max(80).optional()
});

module.exports = { clockPayloadSchema };
