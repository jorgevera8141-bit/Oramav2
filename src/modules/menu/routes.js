const express = require('express');
const pool = require('../../config/database');
const { validate, numericIdParam } = require('../../middleware/validate');
const { createMenuItemSchema, updateMenuItemSchema } = require('./schemas');

const router = express.Router();
router.param('id', numericIdParam);

router.get('/menu', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM menu_items ORDER BY id ASC');
  res.json({ success: true, menu: rows });
});

router.post('/menu/nuevo', validate(createMenuItemSchema), async (req, res) => {
  const data = req.body;
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
  const id = Number(req.params.id);
  await pool.query('DELETE FROM menu_items WHERE id = $1', [id]);
  res.status(204).end();
});

module.exports = router;