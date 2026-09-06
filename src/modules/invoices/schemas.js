const { z } = require('zod');

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

const facturaSchema = z.object({
  orden_id: z.number().int().positive(),
  tipo: z.enum(['global', 'normal']).default('normal'),
  rfc: z.string().transform((value) => value.toUpperCase()).optional(),
  razon_social: z.string().min(1).max(255).optional(),
  regimen_fiscal: z.string().length(3).optional(),
  cp: z.string().regex(/^\d{5}$/).optional(),
  uso_cfdi: z.string().min(2).max(4).optional(),
  forma_pago_tarjeta: z.enum(['04', '28']).optional(),
  email: z.string().email().optional()
}).refine(
  (data) => data.tipo === 'global' || (!!data.rfc && RFC_REGEX.test(data.rfc) && !!data.razon_social && !!data.regimen_fiscal && !!data.cp && !!data.uso_cfdi),
  { message: 'rfc, razon_social, regimen_fiscal, cp y uso_cfdi son requeridos y válidos para una factura normal' }
);

module.exports = { facturaSchema, RFC_REGEX };
