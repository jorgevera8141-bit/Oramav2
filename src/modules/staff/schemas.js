const { z } = require('zod');

const pinSchema = z.union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value.length > 0, 'El PIN es requerido');

const clockPayloadSchema = z.object({
  nombre: z.string().trim().min(1),
  pin: pinSchema,
  screen: z.string().trim().min(1).max(80).optional()
});

// Manual correction of a time_clock row - lets a manager fix a missed or
// mistaken clock-in/clock-out instead of leaving bad hours in payroll
const timeClockEditSchema = z.object({
  clock_in: z.string().min(1),
  clock_out: z.string().min(1).nullable().optional(),
  total_break_minutes: z.number().int().nonnegative().default(0)
});

module.exports = { clockPayloadSchema, timeClockEditSchema };
