const express = require('express');
const pool = require('../../config/database');
const { createInvoice } = require('./service');

const router = express.Router();

router.post('/factura', async (req, res) => {
  const invoice = await createInvoice(req.body || {});
  res.status(201).json({ success: true, factura: invoice });
});

router.get('/factura/:id/pdf', async (req, res) => {
  const { rows } = await pool.query('SELECT pdf_url FROM orama_facturas WHERE id = $1', [Number(req.params.id)]);
  res.json({ success: true, pdf_url: rows[0]?.pdf_url || null });
});

router.get('/factura/:id/xml', async (req, res) => {
  const { rows } = await pool.query('SELECT xml_url FROM orama_facturas WHERE id = $1', [Number(req.params.id)]);
  res.json({ success: true, xml_url: rows[0]?.xml_url || null });
});

router.post('/factura/:id/email', async (_req, res) => {
  res.json({ success: true, message: 'Correo solicitado' });
});

module.exports = router;