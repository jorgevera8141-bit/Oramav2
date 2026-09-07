const { z } = require('zod');
const { pinActionSchema, reviewActionSchema } = require('../promotions/schemas');
const { PLATAFORMAS } = require('./providers');

// datetime-local input value: "2026-09-10T14:30" (no seconds, no timezone)
const localDateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

const socialPostFields = {
  promocion_id: z.number().int().positive(),
  titular: z.string().max(120).optional(),
  caption: z.string().max(2200).optional(),
  cta: z.string().max(80).optional(),
  hashtags: z.string().max(500).optional(),
  imagen_url: z.string().max(300).optional(),
  imagenes_adicionales: z.array(z.string().max(300)).max(6).optional(),
  plataformas: z.array(z.enum(PLATAFORMAS)).min(1, 'Elige al menos una plataforma'),
  programado_para: z.string().regex(localDateTimeRegex, 'programado_para debe tener formato YYYY-MM-DDTHH:MM').optional(),
  creado_por: z.string().min(1).max(120)
};

const hasContent = (data) => !!(data.titular || data.caption);

const createSocialPostSchema = z.object(socialPostFields)
  .refine(hasContent, { message: 'La publicación necesita al menos un titular o un texto', path: ['caption'] });

const updateSocialPostSchema = z.object(socialPostFields).partial();

const aiActionSchema = pinActionSchema.extend({
  promocion_id: z.number().int().positive()
});

const aiDraftSchema = aiActionSchema.extend({
  contexto: z.string().max(1000).optional()
});

const aiImageSchema = aiActionSchema.extend({
  prompt: z.string().max(500).optional()
});

module.exports = {
  createSocialPostSchema,
  updateSocialPostSchema,
  pinActionSchema,
  reviewActionSchema,
  aiDraftSchema,
  aiImageSchema
};
