const express = require('express');
const path = require('path');
const pool = require('./config/database');

const mesasRoutes = require('./modules/mesas/routes');
const menuRoutes = require('./modules/menu/routes');
const ordersRoutes = require('./modules/orders/routes');
const inventoryRoutes = require('./modules/inventory/routes');
const invoicesRoutes = require('./modules/invoices/routes');
const reportsRoutes = require('./modules/reports/routes');
const staffRoutes = require('./modules/staff/routes');
const settingsRoutes = require('./modules/settings/routes');
const gastosRoutes = require('./modules/gastos/routes');
const promotionsRoutes = require('./modules/promotions/routes');
const socialPostsRoutes = require('./modules/social-posts/routes');
const uploadsRoutes = require('./modules/uploads/routes');

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => res.json({ status: 'ok', version: '2.0' }));

app.use('/api', mesasRoutes);
app.use('/api', menuRoutes);
app.use('/api', ordersRoutes);
app.use('/api', inventoryRoutes);
app.use('/api', invoicesRoutes);
app.use('/api', reportsRoutes);
app.use('/api', staffRoutes);
app.use('/api', settingsRoutes);
app.use('/api', gastosRoutes);
app.use('/api', promotionsRoutes);
app.use('/api', socialPostsRoutes);
app.use('/api', uploadsRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Error interno del servidor' });
});

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS mesas (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    status TEXT DEFAULT 'disponible'
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL,
    precio NUMERIC NOT NULL,
    activo INTEGER DEFAULT 1,
    clave TEXT,
    clave_sat TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ordenes (
    id SERIAL PRIMARY KEY,
    mesa_id INTEGER,
    mesa_nombre TEXT,
    status TEXT DEFAULT 'abierta',
    total NUMERIC DEFAULT 0,
    payment_method TEXT DEFAULT 'efectivo',
    amount_cash NUMERIC DEFAULT 0,
    amount_card NUMERIC DEFAULT 0,
    notas TEXT,
    closed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS orden_items (
    id SERIAL PRIMARY KEY,
    orden_id INTEGER,
    item_nombre TEXT,
    precio NUMERIC,
    cantidad INTEGER DEFAULT 1,
    menu_item_id INTEGER,
    descuento_unitario NUMERIC DEFAULT 0
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS gastos (
    id SERIAL PRIMARY KEY,
    categoria TEXT NOT NULL,
    descripcion TEXT,
    monto NUMERIC NOT NULL,
    fecha DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS staff (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    pin TEXT NOT NULL,
    tipo TEXT NOT NULL,
    idioma TEXT DEFAULT 'es',
    activo INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS staff_sessions (
    id SERIAL PRIMARY KEY,
    staff_id INTEGER,
    screen TEXT,
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    logout_time TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS orama_facturas (
    id SERIAL PRIMARY KEY,
    orden_id INTEGER REFERENCES ordenes(id),
    folio_fiscal TEXT,
    facturapi_id TEXT,
    rfc_receptor TEXT,
    razon_social TEXT,
    total NUMERIC,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'timbrada',
    pdf_url TEXT,
    xml_url TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS inventory_items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'pieza',
    current_stock NUMERIC NOT NULL DEFAULT 0,
    reorder_threshold NUMERIC NOT NULL DEFAULT 0,
    reorder_quantity NUMERIC NOT NULL DEFAULT 0,
    cost_per_unit NUMERIC NOT NULL DEFAULT 0,
    supplier_name TEXT,
    supplier_contact TEXT,
    last_restocked_at TIMESTAMP,
    last_restocked_by INTEGER REFERENCES staff(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS recipe_items (
    id SERIAL PRIMARY KEY,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity_used NUMERIC NOT NULL DEFAULT 0,
    UNIQUE(menu_item_id, inventory_item_id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS inventory_movements (
    id SERIAL PRIMARY KEY,
    inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    change_amount NUMERIC NOT NULL,
    reason TEXT NOT NULL CHECK(reason IN ('sale','manual_adjustment','restock','waste')),
    order_id INTEGER,
    staff_id INTEGER REFERENCES staff(id),
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS orama_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS orden_pagos (
    id SERIAL PRIMARY KEY,
    orden_id INTEGER REFERENCES ordenes(id),
    payment_method TEXT NOT NULL,
    amount_cash NUMERIC NOT NULL DEFAULT 0,
    amount_card NUMERIC NOT NULL DEFAULT 0,
    persona_nombre TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS promociones (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('precio_fijo','descuento_porcentaje','compra_x_lleva_y')),
    producto_ids INTEGER[],
    categoria TEXT,
    precio_promocional NUMERIC,
    porcentaje_descuento NUMERIC,
    compra_cantidad INTEGER,
    lleva_producto_id INTEGER REFERENCES menu_items(id),
    lleva_cantidad INTEGER,
    lleva_descuento_pct NUMERIC DEFAULT 100,
    fecha_inicio DATE NOT NULL,
    hora_inicio TIME,
    fecha_fin DATE NOT NULL,
    hora_fin TIME,
    limite_unidades INTEGER,
    condiciones TEXT,
    apilable BOOLEAN NOT NULL DEFAULT false,
    imagen_url TEXT,
    estado TEXT NOT NULL DEFAULT 'DRAFT' CHECK (estado IN
      ('DRAFT','PENDING_APPROVAL','CHANGES_REQUESTED','APPROVED','SCHEDULED','ACTIVE','EXPIRED','REJECTED','CANCELLED')),
    creado_por TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS promocion_redenciones (
    id SERIAL PRIMARY KEY,
    promocion_id INTEGER REFERENCES promociones(id),
    orden_id INTEGER REFERENCES ordenes(id),
    descuento_aplicado NUMERIC NOT NULL,
    unidades INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS publicaciones_sociales (
    id SERIAL PRIMARY KEY,
    promocion_id INTEGER REFERENCES promociones(id),
    titular TEXT,
    caption TEXT,
    cta TEXT,
    hashtags TEXT,
    imagen_url TEXT,
    imagenes_adicionales TEXT[],
    plataformas TEXT[],
    programado_para TIMESTAMP,
    estado TEXT NOT NULL DEFAULT 'DRAFT' CHECK (estado IN
      ('DRAFT','PENDING_APPROVAL','CHANGES_REQUESTED','APPROVED','SCHEDULED','READY_FOR_PUBLICATION','REJECTED')),
    creado_por TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bitacora (
    id SERIAL PRIMARY KEY,
    entidad_tipo TEXT NOT NULL,
    entidad_id INTEGER NOT NULL,
    accion TEXT NOT NULL,
    actor_nombre TEXT NOT NULL,
    actor_tipo TEXT NOT NULL,
    estado_anterior TEXT,
    estado_nuevo TEXT,
    detalle JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query('ALTER TABLE orden_items ADD COLUMN IF NOT EXISTS promocion_id INTEGER REFERENCES promociones(id)');
  await pool.query('ALTER TABLE orden_items ADD COLUMN IF NOT EXISTS menu_item_id INTEGER REFERENCES menu_items(id)');
  await pool.query('ALTER TABLE orden_items ADD COLUMN IF NOT EXISTS descuento_unitario NUMERIC DEFAULT 0');
  await pool.query('ALTER TABLE promocion_redenciones ADD COLUMN IF NOT EXISTS unidades INTEGER NOT NULL DEFAULT 1');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_bitacora_entidad ON bitacora(entidad_tipo, entidad_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_promocion_redenciones_promo ON promocion_redenciones(promocion_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_orden_pagos_orden ON orden_pagos(orden_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_inv_mov_item ON inventory_movements(inventory_item_id, created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_inv_mov_reason ON inventory_movements(reason)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_inv_mov_order ON inventory_movements(order_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_recipe_menu ON recipe_items(menu_item_id)');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_orden ON orama_facturas(orden_id)');
  await pool.query(`CREATE OR REPLACE FUNCTION mx(ts timestamp) RETURNS timestamp AS $$ SELECT ts AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City' $$ LANGUAGE sql STABLE;`);
  await pool.query(`INSERT INTO orama_settings (key, value) VALUES ('margin_threshold_pct', '70') ON CONFLICT DO NOTHING`);
}

async function start() {
  await initDb();
  const port = process.env.PORT || 3000;
  const server = app.listen(port, () => console.log(`Orama v2 on ${port}`));

  const shutdown = async () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = app;