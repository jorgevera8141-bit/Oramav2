const { z } = require('zod');

// Product selection schema
const productSelectionSchema = z.object({
  productId: z.number().int().positive(),
  name: z.string().optional() // For new product entries
});

// Ingredient line schema (can be from inventory or manual)
const ingredientLineSchema = z.object({
  inventoryItemId: z.number().int().positive().optional(), // If from inventory
  ingredientName: z.string().optional(), // If manual entry
  quantityPerServing: z.number().positive(),
  unit: z.string(), // the unit the quantity is in: kg, g, litro, ml, pieza
  costUnit: z.string().optional(), // the unit the cost is quoted in (defaults to `unit`); converted from `unit`
  unitCost: z.number().nonnegative().optional(), // If known, otherwise will be looked up
  yieldPct: z.number().optional() // percent of what is bought that is usable (waste); 100 when omitted
});

// Extra costs schema
const extraCostsSchema = z.object({
  packaging: z.number().nonnegative().default(0),
  labor: z.number().nonnegative().default(0),
  other: z.number().nonnegative().default(0)
});

// Monthly fixed/overhead costs (rent, phone, salaried payroll, etc.) - used to
// spread overhead across estimated monthly volume for full-cost pricing
const fixedCostsSchema = z.object({
  rent: z.number().nonnegative().default(0),
  phoneInternet: z.number().nonnegative().default(0),
  payroll: z.number().nonnegative().default(0),
  other: z.number().nonnegative().default(0)
});

// Preparation time and labor wage - real labor cost per serving is
// (prepTimeMinutes/60 * laborRatePerHour) / yieldServings, not a guessed flat number
const preparationSchema = z.object({
  prepTimeMinutes: z.number().nonnegative().default(0),
  yieldServings: z.number().positive().default(1), // servings one prep batch produces
  laborRatePerHour: z.number().nonnegative().default(0)
});

// Price calculation input schema
const priceCalculationSchema = z.object({
  productId: z.number().int().positive().optional(),
  productName: z.string().optional(), // For new products
  ingredients: z.array(ingredientLineSchema),
  extraCosts: extraCostsSchema,
  preparation: preparationSchema.default({}),
  fixedCosts: fixedCostsSchema.optional(), // omit to use the overhead saved in the settings
  estimatedMonthlyUnits: z.number().positive().optional(), // omit to skip full-cost pricing
  targetMargin: z.number().min(0).lt(100, 'El margen objetivo debe ser menor a 100%.').default(30), // percent
  includeIVA: z.boolean().default(true)
});

// Price calculation result schema
const priceCalculationResultSchema = z.object({
  totalCostPerServing: z.number().nonnegative(),
  suggestedSellingPrice: z.number().nonnegative(),
  actualMargin: z.number(),
  targetMargin: z.number(),
  includeIVA: z.boolean(),
  priceWithIVA: z.number().nonnegative(),
  priceWithoutIVA: z.number().nonnegative(),
  isBelowTarget: z.boolean(),
  savingsOrShortfall: z.number(),
  ingredientsCost: z.number().nonnegative(),
  packagingCost: z.number().nonnegative(),
  laborCostPerServing: z.number().nonnegative(),
  primeCost: z.number().nonnegative(),
  primeCostPercent: z.number().nonnegative(),
  totalMonthlyFixedCosts: z.number().nonnegative(),
  estimatedMonthlyUnits: z.number().positive().nullable(),
  fixedCostPerUnit: z.number().nonnegative().nullable(),
  fullCostPerServing: z.number().nonnegative().nullable(),
  fullCostSellingPrice: z.number().nonnegative().nullable(),
  fullCostPriceWithIVA: z.number().nonnegative().nullable(),
  breakEvenUnits: z.number().int().nonnegative().nullable()
});

// Tax settings: the IVA rate (percent) and whether menu prices already include it
const taxSettingsSchema = z.object({
  ivaRate: z.number().min(0).max(100),
  pricesIncludeIva: z.boolean()
});

// Business settings: every field optional so a client that only knows about IVA still works.
const businessSettingsSchema = z.object({
  cardFeePct: z.number().min(0).max(20).optional(),
  cardSharePct: z.number().min(0).max(100).optional(),
  paidPerFree: z.number().min(0).max(1000).optional(),
  roundTo: z.number().min(0).max(1000).optional(),
  fixedCosts: z.object({
    rent: z.number().min(0).optional(),
    phoneInternet: z.number().min(0).optional(),
    payroll: z.number().min(0).optional(),
    other: z.number().min(0).optional()
  }).optional()
});

const settingsSchema = taxSettingsSchema.partial().and(businessSettingsSchema);

// Recipe save schema: ingredients are inventory items (quantity in `unit`, converted to the inventory's own
// unit when stored) and the per-serving costs that are not ingredients.
const recipeSaveSchema = z.object({
  menuItemId: z.number().int().positive(),
  recipeName: z.string().optional(),
  ingredients: z.array(z.object({
    inventoryItemId: z.number().int().positive(),
    quantityUsed: z.number().positive(),
    unit: z.string().optional(),
    yieldPct: z.number().optional()
  })).min(1, 'La receta necesita al menos un insumo.'),
  extraCosts: extraCostsSchema
});

module.exports = {
  productSelectionSchema,
  ingredientLineSchema,
  extraCostsSchema,
  fixedCostsSchema,
  preparationSchema,
  priceCalculationSchema,
  priceCalculationResultSchema,
  taxSettingsSchema,
  businessSettingsSchema,
  settingsSchema,
  recipeSaveSchema
};
