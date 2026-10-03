const { z } = require('zod');

// Every change is authorized by a manager's name and PIN, the same way Nómina and comps are.
const actor = { actor_nombre: z.string().min(1).max(120), actor_pin: z.string().min(1).max(20) };

const verifySchema = z.object(actor);
const gatePasscodeSchema = z.object({ ...actor, passcode: z.string().max(200) });
const staffPinSchema = z.object({ ...actor, pin: z.string().max(40) });
const createStaffSchema = z.object({ ...actor, nombre: z.string().max(200), tipo: z.string().max(20), pin: z.string().max(40) });
const activeSchema = z.object({ ...actor, activo: z.boolean() });

module.exports = { verifySchema, gatePasscodeSchema, staffPinSchema, createStaffSchema, activeSchema };
