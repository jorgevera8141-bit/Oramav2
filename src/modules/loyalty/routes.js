const express = require('express');
const { validate } = require('../../middleware/validate');
const { phoneSchema, crearClienteSchema, redimirSchema, ajusteManualSchema } = require('./schemas');
const service = require('./service');

const router = express.Router();

router.get('/loyalty/customers/:phone', async (req, res) => {
  const parsed = phoneSchema.safeParse(req.params.phone);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Teléfono inválido' });
  const customer = await service.findCustomerByPhone(parsed.data);
  if (!customer) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  const card = await service.getCard(customer.id);
  res.json({ success: true, customer, card });
});

router.post('/loyalty/customers', validate(crearClienteSchema), async (req, res) => {
  const existing = await service.findCustomerByPhone(req.body.phone);
  if (existing) {
    const card = await service.getCard(existing.id);
    return res.json({ success: true, customer: existing, card });
  }
  const customer = await service.createCustomer(req.body.phone, req.body.nombre, req.body.marketing_consent);
  const card = await service.getCard(customer.id);
  res.status(201).json({ success: true, customer, card });
});

router.post('/loyalty/redeem', validate(redimirSchema), async (req, res) => {
  const { customer_id, orden_id, actor_nombre, actor_pin } = req.body;
  const redencion = await service.redeemReward(customer_id, orden_id, actor_nombre, actor_pin);
  const card = await service.getCard(customer_id);
  res.status(201).json({ success: true, redencion, card });
});

router.post('/loyalty/adjust', validate(ajusteManualSchema), async (req, res) => {
  const { customer_id, cantidad, razon, actor_nombre, actor_pin } = req.body;
  await service.manualAdjustment(customer_id, cantidad, razon, actor_nombre, actor_pin);
  const card = await service.getCard(customer_id);
  res.json({ success: true, card });
});

module.exports = router;
