const express = require('express');
const pool = require('../../config/database');
const { createInvoice } = require('./service');

const router = express.Router();

router.post('/factura', async (req, res) => {
  const invoice = await createInvoice(req.body || {});
  res.status(201).json(invoice);
});

router.get('/factura/:id/pdf', async (req, res) => {
  const { rows } = await pool.query('SELECT pdf_url FROM orama_facturas WHERE id = $1', [Number(req.params.id)]);
  res.json(rows[0] || {});
});

router.get('/factura/:id/xml', async (req, res) => {
  const { rows } = await pool.query('SELECT xml_url FROM orama_facturas WHERE id = $1', [Number(req.params.id)]);
  res.json(rows[0] || {});
});

router.post('/factura/:id/email', async (_req, res) => {
  res.json({ ok: true });
});

module.exports = router;