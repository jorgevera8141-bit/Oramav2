const pool = require('../../config/database');
const https = require('https');

function postJson(urlString, body, headers = {}) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlString);
      const data = JSON.stringify(body);
      const req = https.request(
        {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            ...headers
          }
        },
        (res) => {
          let chunks = '';
          res.on('data', (c) => {
            chunks += c.toString();
          });
          res.on('end', () => {
            let parsed = null;
            try {
              parsed = JSON.parse(chunks);
            } catch {
              parsed = { raw: chunks };
            }
            resolve({ statusCode: res.statusCode, body: parsed });
          });
        }
      );
      req.on('error', () => resolve({ statusCode: 500, body: null }));
      req.write(data);
      req.end();
    } catch {
      resolve({ statusCode: 500, body: null });
    }
  });
}

async function createInvoice({ orden_id, rfc_receptor, razon_social, total }) {
  const idempotencyKey = `orden-${orden_id}`;
  const apiUrl = process.env.FACTURAPI_URL || 'https://facturapi.io/api/v1/invoices';
  const result = await postJson(
    apiUrl,
    { orden_id, rfc_receptor, razon_social, total },
    { Authorization: `Bearer ${process.env.FACTURAPI_KEY || ''}`, 'Idempotency-Key': idempotencyKey }
  );

  if (result.statusCode < 200 || result.statusCode >= 300 || !result.body) {
    throw Object.assign(new Error('FacturAPI no pudo crear la factura'), { statusCode: 502 });
  }

  const { rows } = await pool.query(
    `INSERT INTO orama_facturas (orden_id, folio_fiscal, facturapi_id, rfc_receptor, razon_social, total, status, pdf_url, xml_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [orden_id, result.body?.folio_fiscal || '', result.body?.id || '', rfc_receptor, razon_social, total, 'timbrada', result.body?.pdf_url || '', result.body?.xml_url || '']
  );
  return rows[0];
}

module.exports = { createInvoice };