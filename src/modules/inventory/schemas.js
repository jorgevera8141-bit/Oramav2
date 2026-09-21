const { z } = require('zod');

const createInventoryItemSchema = z.object({
  name: z.string().min(1).max(120),
  unit: z.string().min(1).max(30).optional(),
  current_stock: z.number().nonnegative().optional(),
  reorder_threshold: z.number().nonnegative().optional(),
  reorder_quantity: z.number().nonnegative().optional(),
  cost_per_unit: z.number().nonnegative().optional(),
  supplier_name: z.string().max(120).optional(),
  supplier_contact: z.string().max(120).optional()
});

const updateInventoryItemSchema = createInventoryItemSchema.partial();

const inventoryIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

const restockInventoryItemSchema = z.object({
  amount: z.preprocess((value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? Number(trimmed) : Number.NaN;
    }
    return value;
  }, z.number().refine(Number.isFinite, 'La cantidad debe ser un número finito.').positive('La cantidad debe ser mayor que cero.'))
});

module.exports = {
  createInventoryItemSchema,
  inventoryIdParamSchema,
  restockInventoryItemSchema,
  updateInventoryItemSchema
};
