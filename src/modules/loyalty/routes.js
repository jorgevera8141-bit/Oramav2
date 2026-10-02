const express = require('express');
const { validate } = require('../../middleware/validate');
const { createRateLimiter } = require('../../middleware/rate-limit');
const { phoneSchema, crearClienteSchema, redimirSchema, ajusteManualSchema } = require('./schemas');
const service = require('./service');

const router = express.Router();

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

// The card lookup and signup are public (the phone number is the only credential), so
// they are throttled per client address to make number-by-number enumeration and bulk
// fake signups slow. The PIN-gated actions get a tighter cap against PIN guessing.
const lookupLimiter = createRateLimiter({
  windowMs: 10 * MINUTE_MS, max: 60, message: 'Demasiadas consultas. Intenta de nuevo en unos minutos.'
});
const signupLimiter = createRateLimiter({
  windowMs: HOUR_MS, max: 20, message: 'Demasiados registros desde esta conexión. Intenta más tarde.'
});
const pinActionLimiter = createRateLimiter({
  windowMs: 10 * MINUTE_MS, max: 10, message: 'Demasiados intentos. Espera unos minutos.'
});

router.get('/loyalty/customers/:phone', lookupLimiter, async (req, res) => {
  const parsed = phoneSchema.safeParse(req.params.phone);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Teléfono inválido' });
  const customer = await service.findCustomerByPhone(parsed.data);
  if (!customer) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  service.assertCustomerActive(customer);
  const card = await service.getCard(customer.id);
  res.json({ success: true, customer: service.toPublicCustomer(customer), card });
});

router.post('/loyalty/customers', signupLimiter, validate(crearClienteSchema), async (req, res) => {
  const existing = await service.findCustomerByPhone(req.body.phone);
  if (existing) {
    service.assertCustomerActive(existing);
    const card = await service.getCard(existing.id);
    return res.json({ success: true, customer: service.toPublicCustomer(existing), card });
  }
  const customer = await service.createCustomer(req.body.phone, req.body.nombre, req.body.marketing_consent);
  service.assertCustomerActive(customer);
  const card = await service.getCard(customer.id);
  res.status(201).json({ success: true, customer: service.toPublicCustomer(customer), card });
});

router.post('/loyalty/redeem', pinActionLimiter, validate(redimirSchema), async (req, res) => {
  const { customer_id, orden_id, actor_nombre, actor_pin } = req.body;
  const redencion = await service.redeemReward(customer_id, orden_id, actor_nombre, actor_pin);
  const card = await service.getCard(customer_id);
  res.status(201).json({ success: true, redencion, card });
});

router.post('/loyalty/adjust', pinActionLimiter, validate(ajusteManualSchema), async (req, res) => {
  const { customer_id, cantidad, razon, actor_nombre, actor_pin } = req.body;
  await service.manualAdjustment(customer_id, cantidad, razon, actor_nombre, actor_pin);
  const card = await service.getCard(customer_id);
  res.json({ success: true, card });
});

module.exports = router;
