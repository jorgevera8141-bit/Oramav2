const { z } = require('zod');

const GASTO_CATEGORIAS = ['Insumos', 'Nomina', 'Renta', 'Servicios', 'Mantenimiento', 'Marketing', 'Otro'];

const createGastoSchema = z.object({
  categoria: z.enum(GASTO_CATEGORIAS),
  descripcion: z.string().max(200).optional(),
  monto: z.number().positive(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha debe tener formato YYYY-MM-DD')
});

module.exports = { createGastoSchema, GASTO_CATEGORIAS };
