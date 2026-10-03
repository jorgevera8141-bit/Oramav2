const { z } = require('zod');

// Everyone identifies with their own name and PIN, the same check as comps and Nómina.
const credentialsSchema = z.object({ nombre: z.string().min(1).max(120), pin: z.string().min(1).max(20) });

module.exports = { credentialsSchema };
