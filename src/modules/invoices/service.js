const pool = require('../../config/database');
const https = require('https');

const FACTURAPI_HOST = 'www.facturapi.io';
const FACTURAPI_BASE_PATH = '/v2';

// SAT c_ClaveProdServ "01010101" = "No existe en el catálogo". Legitimate only for
// genuinely uncatalogued items - see docs.facturapi.io. Using it for items that DO
// have a real match is a real SAT audit trigger, not a style choice.
const GENERIC_PRODUCT_KEY = '01010101';
const GENERIC_UNIT_KEY = 'H87'; // SAT c_ClaveUnidad "Pieza"

// Standard Mexican generic/public receptor for "factura global" (no real customer data).
const PUBLICO_GENERAL = { legal_name: 'PUBLICO EN GENERAL', tax_id: 'XAXX010101000', tax_system: '616' };
const BUSINESS_ZIP = '20000'; // Café Rosinal, Aguascalientes - used as the receptor zip for factura global only
const STAMP_TIMEOUT_MS = 30_000;

function requestJson(method, path, body, apiKey) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      { hostname: FACTURAPI_HOST, path: `${FACTURAPI_BASE_PATH}${path}`, method, headers: { Authorization: `Bearer ${apiKey}`, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) } },
      (res) => {
        let chunks = '';
        res.on('data', (chunk) => { chunks += chunk; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(chunks); } catch { parsed = { raw: chunks }; }
          resolve({ statusCode: res.statusCode, body: parsed });
        });
      }
    );
    req.setTimeout(STAMP_TIMEOUT_MS, () => req.destroy(new Error('Facturapi request timed out')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function requestBinary(path, apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: FACTURAPI_HOST, path: `${FACTURAPI_BASE_PATH}${path}`, method: 'GET', headers: { Authorization: `Bearer ${apiKey}` } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, contentType: res.headers['content-type'], buffer: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

function mapItemsToFacturapi(rows) {
  return rows.map((row) => ({
    quantity: Number(row.cantidad),
    product: {
      description: row.item_nombre,
      product_key: row.clave_sat || GENERIC_PRODUCT_KEY,
      price: Number(row.precio),
      unit_key: GENERIC_UNIT_KEY
    }
  }));
}

async function buildInvoiceItems(ordenId, db = pool) {
  // Join by menu_item_id; only rows saved before that column existed fall back to the
  // name, picking a single menu item so a duplicated name can't repeat invoice lines.
  const { rows } = await db.query(
    `SELECT oi.item_nombre, oi.precio, oi.cantidad, mi.clave_sat
     FROM orden_items oi
     LEFT JOIN menu_items mi ON mi.id = COALESCE(
       oi.menu_item_id,
       (SELECT m2.id FROM menu_items m2 WHERE m2.nombre = oi.item_nombre ORDER BY m2.id LIMIT 1)
     )
     WHERE oi.orden_id = $1`,
    [ordenId]
  );
  if (!rows.length) throw Object.assign(new Error('La orden no tiene artículos para facturar'), { statusCode: 400 });
  return mapItemsToFacturapi(rows);
}

function buildCustomer(data) {
  if (data.tipo === 'global') return { ...PUBLICO_GENERAL, address: { zip: BUSINESS_ZIP } };
  return {
    legal_name: data.razon_social,
    tax_id: data.rfc,
    tax_system: data.regimen_fiscal,
    ...(data.email ? { email: data.email } : {}),
    address: { zip: data.cp }
  };
}

function resolvePaymentForm(order, data) {
  if (data.tipo === 'global') return '01';
  if (order.payment_method === 'efectivo') return '01';
  if (order.payment_method === 'tarjeta') return data.forma_pago_tarjeta || '04';
  return '99'; // SAT "Por definir" - honest fallback for mixto/cortesia/cliente_frecuente
}

function invoiceError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

// A stamped CFDI is a legal document that cannot be undone from here, so the order is
// claimed (a 'pendiente' row, protected by the unique index on orden_id) BEFORE calling
// Facturapi. A second or concurrent request then finds the claim and never stamps again.
//   - Facturapi answers with an error  -> nothing was stamped: release the claim.
//   - Facturapi can't be reached/times out -> the outcome is unknown: keep the claim so
//     nobody blindly retries; someone has to check Facturapi first.
// Returns { invoice, created }; created is false when the order was already invoiced.
async function createInvoice(data, { db = pool, request = requestJson } = {}) {
  const apiKey = process.env.FACTURAPI_KEY;
  if (!apiKey) throw invoiceError('Facturación no está configurada (falta FACTURAPI_KEY)', 503);

  const { rows: ordenRows } = await db.query('SELECT * FROM ordenes WHERE id = $1', [data.orden_id]);
  const orden = ordenRows[0];
  if (!orden) throw invoiceError('Orden no encontrada', 404);
  if (orden.status !== 'cerrada') throw invoiceError('Solo se pueden facturar órdenes cerradas', 409);

  const items = await buildInvoiceItems(data.orden_id, db);
  const customer = buildCustomer(data);
  const payload = {
    customer,
    items,
    use: data.tipo === 'global' ? 'S01' : (data.uso_cfdi || 'G03'),
    payment_form: resolvePaymentForm(orden, data),
    payment_method: 'PUE'
  };

  const { rows: claimed } = await db.query(
    `INSERT INTO orama_facturas (orden_id, rfc_receptor, razon_social, total, status)
     VALUES ($1,$2,$3,$4,'pendiente')
     ON CONFLICT (orden_id) DO NOTHING RETURNING *`,
    [data.orden_id, customer.tax_id, customer.legal_name, orden.total]
  );
  const claim = claimed[0];
  if (!claim) {
    const { rows: existing } = await db.query('SELECT * FROM orama_facturas WHERE orden_id = $1', [data.orden_id]);
    if (existing[0]?.status === 'timbrada') return { invoice: existing[0], created: false };
    throw invoiceError('Esta orden ya tiene una factura en proceso. Revisa Facturapi antes de reintentar.', 409);
  }

  let result;
  try {
    result = await request('POST', '/invoices', payload, apiKey);
  } catch (error) {
    console.error('[facturapi] stamp outcome unknown, claim kept for order', data.orden_id, error.message);
    throw invoiceError('No se pudo confirmar con Facturapi si la factura se timbró. Revisa Facturapi antes de reintentar.', 502);
  }
  if (result.statusCode < 200 || result.statusCode >= 300) {
    await db.query("DELETE FROM orama_facturas WHERE id = $1 AND status = 'pendiente'", [claim.id]);
    const message = result.body?.message || result.body?.errors?.[0]?.message || 'Facturapi no pudo timbrar la factura';
    throw invoiceError(message, 502);
  }

  const { rows } = await db.query(
    `UPDATE orama_facturas SET folio_fiscal = $2, facturapi_id = $3, status = 'timbrada'
     WHERE id = $1 RETURNING *`,
    [claim.id, result.body.uuid || '', result.body.id || '']
  );
  return { invoice: rows[0], created: true };
}

async function downloadInvoiceFile(facturaId, type) {
  const apiKey = process.env.FACTURAPI_KEY;
  if (!apiKey) throw Object.assign(new Error('Facturación no está configurada'), { statusCode: 503 });
  const { rows } = await pool.query('SELECT facturapi_id FROM orama_facturas WHERE id = $1', [facturaId]);
  const facturapiId = rows[0]?.facturapi_id;
  if (!facturapiId) throw Object.assign(new Error('Factura no encontrada'), { statusCode: 404 });
  const result = await requestBinary(`/invoices/${facturapiId}/${type}`, apiKey);
  if (result.statusCode < 200 || result.statusCode >= 300) throw Object.assign(new Error('No se pudo descargar el archivo'), { statusCode: 502 });
  return result;
}

module.exports = { createInvoice, downloadInvoiceFile, buildInvoiceItems, mapItemsToFacturapi, buildCustomer, resolvePaymentForm, GENERIC_PRODUCT_KEY, PUBLICO_GENERAL, BUSINESS_ZIP };
