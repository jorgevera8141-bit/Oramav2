const { z } = require('zod');

const phoneSchema = z.string().trim().regex(/^\d{10}$/, 'El teléfono debe tener 10 dígitos');

const buscarClienteSchema = z.object({
  phone: phoneSchema
});

const crearClienteSchema = z.object({
  phone: phoneSchema,
  nombre: z.string().trim().max(120).optional(),
  marketing_consent: z.boolean().default(false)
});

const redimirSchema = z.object({
  customer_id: z.number().int().positive(),
  orden_id: z.number().int().positive(),
  actor_nombre: z.string().min(1),
  actor_pin: z.string().min(1)
});

const ajusteManualSchema = z.object({
  customer_id: z.number().int().positive(),
  cantidad: z.number().int().refine((n) => n !== 0, 'La cantidad no puede ser cero'),
  razon: z.string().min(1).max(300),
  actor_nombre: z.string().min(1),
  actor_pin: z.string().min(1)
});

module.exports = { phoneSchema, buscarClienteSchema, crearClienteSchema, redimirSchema, ajusteManualSchema };
