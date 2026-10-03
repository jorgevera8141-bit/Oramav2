const express = require('express');
const pool = require('../../config/database');
const { validate } = require('../../middleware/validate');
const { verifyStaffPin } = require('../../shared/pin-auth');
const service = require('./service');
const { credentialsSchema } = require('./schemas');

const router = express.Router();

const identify = (req) => verifyStaffPin(req.body.nombre, req.body.pin);
const person = (staff, state) => ({ id: staff.id, nombre: staff.nombre, tipo: staff.tipo, ...state });

// The name tiles are public inside the café code (names were already listed by /api/staff).
router.get('/marcar/tiles', async (_req, res) => {
  res.json({ success: true, tiles: await service.getTiles(pool) });
});

// Identify yourself. This never clocks anyone in or out: it only says where you stand.
router.post('/marcar/estado', validate(credentialsSchema), async (req, res) => {
  const staff = await identify(req);
  res.json({ success: true, persona: person(staff, await service.getShiftState(staff.id, pool)) });
});

router.post('/marcar/entrada', validate(credentialsSchema), async (req, res) => {
  const staff = await identify(req);
  const state = await service.startShift(staff.id, pool, new Date(), { screen: 'marcar' });
  res.json({ success: true, persona: person(staff, state), ya_estaba: state.ya_estaba });
});

router.post('/marcar/salida', validate(credentialsSchema), async (req, res) => {
  const staff = await identify(req);
  const state = await service.endShift(staff.id, pool);
  res.json({ success: true, persona: person(staff, state), entrada: state.entrada, salida: state.salida });
});

module.exports = router;
