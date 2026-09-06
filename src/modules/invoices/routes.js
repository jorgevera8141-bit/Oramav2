const express = require('express');
const { createInvoice, downloadInvoiceFile } = require('./service');
const { validate } = require('../../middleware/validate');
const { facturaSchema } = require('./schemas');

const router = express.Router();

function requireFacturacionEnabled(_req, res, next) {
  if (process.env.FACTURACION_ENABLED !== 'true') {
    return res.status(503).json({ success: false, message: 'La facturación electrónica no está habilitada en este entorno' });
  }
  next();
}

router.get('/factura/status', (_req, res) => {
  res.json({ success: true, enabled: process.env.FACTURACION_ENABLED === 'true' });
});

router.post('/factura', requireFacturacionEnabled, validate(facturaSchema), async (req, res) => {
  const invoice = await createInvoice(req.body);
  res.status(201).json({ success: true, factura: invoice });
});

router.get('/factura/:id/pdf', requireFacturacionEnabled, async (req, res) => {
  const file = await downloadInvoiceFile(Number(req.params.id), 'pdf');
  res.setHeader('Content-Type', file.contentType || 'application/pdf');
  res.send(file.buffer);
});

router.get('/factura/:id/xml', requireFacturacionEnabled, async (req, res) => {
  const file = await downloadInvoiceFile(Number(req.params.id), 'xml');
  res.setHeader('Content-Type', file.contentType || 'application/xml');
  res.send(file.buffer);
});

router.post('/factura/:id/email', requireFacturacionEnabled, async (_req, res) => {
  res.json({ success: true, message: 'Correo solicitado' });
});

module.exports = router;
