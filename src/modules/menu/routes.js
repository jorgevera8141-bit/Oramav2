const express = require('express');
const pool = require('../../config/database');
const { validate, numericIdParam } = require('../../middleware/validate');
const { createMenuItemSchema, updateMenuItemSchema } = require('./schemas');
const { nextClave } = require('./clave');
const { deleteMenuItem } = require('./service');

const router = express.Router();
router.param('id', numericIdParam);

router.get('/menu', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM menu_items ORDER BY id ASC');
  res.json({ success: true, menu: rows });
});

// The clave a new product would get, from the claves already in use (see ./clave.js).
async function suggestClave(nombre, categoria) {
  const { rows } = await pool.query('SELECT categoria, clave FROM menu_items');
  return nextClave({ nombre, categoria }, rows);
}

router.get('/menu/siguiente-clave', async (req, res) => {
  const nombre = String(req.query.nombre || '').slice(0, 120);
  const categoria = String(req.query.categoria || '').slice(0, 80);
  res.json({ success: true, clave: await suggestClave(nombre, categoria) });
});

router.post('/menu/nuevo', validate(createMenuItemSchema), async (req, res) => {
  const data = { ...req.body };
  // Left blank, the clave follows the pattern of the existing ones.
  if (!data.clave) data.clave = await suggestClave(data.nombre, data.categoria);
  const { rows } = await pool.query(
    'INSERT INTO menu_items (nombre, categoria, precio, activo, clave, clave_sat) VALUES ($1, $2, $3, COALESCE($4, 1), COALESCE($5, \'\'), COALESCE($6, \'\')) RETURNING *',
    [data.nombre, data.categoria, data.precio, data.activo, data.clave, data.clave_sat]
  );
  res.status(201).json({ success: true, item: rows[0] });
});

router.put('/menu/:id', validate(updateMenuItemSchema), async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, categoria, precio, activo, clave, clave_sat } = req.body;
  const { rows } = await pool.query(
    `UPDATE menu_items
     SET nombre = COALESCE($1, nombre),
         categoria = COALESCE($2, categoria),
         precio = COALESCE($3, precio),
         activo = COALESCE($4, activo),
         clave = COALESCE($5, clave),
         clave_sat = COALESCE($6, clave_sat)
     WHERE id = $7
     RETURNING *`,
    [nombre, categoria, precio, activo, clave, clave_sat, id]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
  res.json({ success: true, item: rows[0] });
});

router.delete('/menu/:id', async (req, res) => {
  await deleteMenuItem(pool, Number(req.params.id));
  res.json({ success: true });
});

module.exports = router;