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

async function buildInvoiceItems(ordenId) {
  const { rows } = await pool.query(
    `SELECT oi.item_nombre, oi.precio, oi.cantidad, mi.clave_sat
     FROM orden_items oi
     LEFT JOIN menu_items mi ON mi.nombre = oi.item_nombre
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

async function createInvoice(data) {
  const apiKey = process.env.FACTURAPI_KEY;
  if (!apiKey) throw Object.assign(new Error('Facturación no está configurada (falta FACTURAPI_KEY)'), { statusCode: 503 });

  const { rows: ordenRows } = await pool.query('SELECT * FROM ordenes WHERE id = $1', [data.orden_id]);
  const orden = ordenRows[0];
  if (!orden) throw Object.assign(new Error('Orden no encontrada'), { statusCode: 404 });
  if (orden.status !== 'cerrada') throw Object.assign(new Error('Solo se pueden facturar órdenes cerradas'), { statusCode: 409 });

  const items = await buildInvoiceItems(data.orden_id);
  const customer = buildCustomer(data);
  const payload = {
    customer,
    items,
    use: data.tipo === 'global' ? 'S01' : (data.uso_cfdi || 'G03'),
    payment_form: resolvePaymentForm(orden, data),
    payment_method: 'PUE'
  };

  const result = await requestJson('POST', '/invoices', payload, apiKey);
  if (result.statusCode < 200 || result.statusCode >= 300) {
    const message = result.body?.message || result.body?.errors?.[0]?.message || 'Facturapi no pudo timbrar la factura';
    throw Object.assign(new Error(message), { statusCode: 502 });
  }

  const { rows } = await pool.query(
    `INSERT INTO orama_facturas (orden_id, folio_fiscal, facturapi_id, rfc_receptor, razon_social, total, status)
     VALUES ($1,$2,$3,$4,$5,$6,'timbrada') RETURNING *`,
    [data.orden_id, result.body.uuid || '', result.body.id || '', customer.tax_id, customer.legal_name, orden.total]
  );
  return rows[0];
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
