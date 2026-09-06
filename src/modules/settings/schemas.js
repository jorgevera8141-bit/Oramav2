const { z } = require('zod');

const updateSettingSchema = z.object({
  value: z.number().min(0).max(100)
});

module.exports = { updateSettingSchema };
