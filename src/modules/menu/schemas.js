const { z } = require('zod');

const MAX_PRICE = 100_000;

// The menu screen sends precio as a number and activo as 0/1; booleans are tolerated
// and stored as the integer the column holds.
const precio = z.coerce.number().finite().nonnegative().max(MAX_PRICE);
const activo = z.union([z.number().int().min(0).max(1), z.boolean()]).transform((value) => (value === true || value === 1 ? 1 : 0));

const createMenuItemSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  categoria: z.string().trim().min(1).max(80),
  precio,
  activo: activo.optional(),
  clave: z.string().trim().max(40).optional(),
  clave_sat: z.string().trim().max(20).optional()
});

const updateMenuItemSchema = createMenuItemSchema.partial();

module.exports = { createMenuItemSchema, updateMenuItemSchema };
