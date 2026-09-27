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
  unit: z.string(), // e.g., 'g', 'ml', 'pieza', 'unidad'
  unitCost: z.number().nonnegative().optional() // If known, otherwise will be looked up
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

// Price calculation input schema
const priceCalculationSchema = z.object({
  productId: z.number().int().positive().optional(),
  productName: z.string().optional(), // For new products
  ingredients: z.array(ingredientLineSchema),
  extraCosts: extraCostsSchema,
  fixedCosts: fixedCostsSchema.default({}),
  estimatedMonthlyUnits: z.number().positive().optional(), // omit to skip full-cost pricing
  targetMargin: z.number().nonnegative().max(1000).default(30), // percent
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
  totalMonthlyFixedCosts: z.number().nonnegative(),
  estimatedMonthlyUnits: z.number().positive().nullable(),
  fixedCostPerUnit: z.number().nonnegative().nullable(),
  fullCostPerServing: z.number().nonnegative().nullable(),
  fullCostSellingPrice: z.number().nonnegative().nullable(),
  fullCostPriceWithIVA: z.number().nonnegative().nullable(),
  breakEvenUnits: z.number().int().nonnegative().nullable()
});

// Recipe save schema
const recipeSaveSchema = z.object({
  menuItemId: z.number().int().positive(),
  recipeName: z.string(),
  ingredients: z.array(z.object({
    inventoryItemId: z.number().int().positive(),
    quantityUsed: z.number().positive()
  })),
  extraCosts: extraCostsSchema,
  targetMargin: z.number().nonnegative().max(1000),
  includeIVA: z.boolean()
});

module.exports = {
  productSelectionSchema,
  ingredientLineSchema,
  extraCostsSchema,
  priceCalculationSchema,
  priceCalculationResultSchema,
  recipeSaveSchema
};
