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

const restockSchema = z.object({
  amount: z.number().finite().positive().max(1_000_000)
});

module.exports = { createInventoryItemSchema, updateInventoryItemSchema, restockSchema };
