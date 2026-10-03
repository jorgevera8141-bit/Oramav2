const express = require('express');
const pool = require('../../config/database');
const { validate, numericIdParam } = require('../../middleware/validate');
const { verifyStaffPin } = require('../../shared/pin-auth');
const { gateStore } = require('../../shared/gate-store');
const service = require('./service');
const { verifySchema, gatePasscodeSchema, staffPinSchema, createStaffSchema, activeSchema } = require('./schemas');

const router = express.Router();
router.param('id', numericIdParam);

const requireManager = (req) => verifyStaffPin(req.body.actor_nombre, req.body.actor_pin, 'management');

router.get('/access/status', async (_req, res) => {
  const status = await service.getAccessStatus(pool, gateStore, { forceEnv: process.env.GATE_FORCE_ENV === '1' });
  res.json({ success: true, ...status });
});

router.post('/access/verify', validate(verifySchema), async (req, res) => {
  const actor = await requireManager(req);
  res.json({ success: true, nombre: actor.nombre });
});

router.post('/access/gate-passcode', validate(gatePasscodeSchema), async (req, res) => {
  const actor = await requireManager(req);
  await service.changeGatePasscode({ passcode: req.body.passcode }, actor, { db: pool, store: gateStore });
  res.json({ success: true });
});

router.post('/access/staff', validate(createStaffSchema), async (req, res) => {
  const actor = await requireManager(req);
  const person = await service.createStaff({ nombre: req.body.nombre, tipo: req.body.tipo, pin: req.body.pin }, actor, pool);
  res.status(201).json({ success: true, persona: person });
});

router.post('/access/staff/:id/pin', validate(staffPinSchema), async (req, res) => {
  const actor = await requireManager(req);
  await service.changeStaffPin({ staffId: Number(req.params.id), pin: req.body.pin }, actor, pool);
  res.json({ success: true });
});

router.post('/access/staff/:id/active', validate(activeSchema), async (req, res) => {
  const actor = await requireManager(req);
  await service.setStaffActive({ staffId: Number(req.params.id), activo: req.body.activo }, actor, pool);
  res.json({ success: true });
});

module.exports = router;
