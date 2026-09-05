const express = require('express');
const pool = require('../../config/database');
const { z } = require('zod');

const router = express.Router();

router.get('/menu', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM menu_items ORDER BY id ASC');
  res.json({ success: true, menu: rows });
});

router.post('/menu/nuevo', async (req, res) => {
  const schema = z.object({
    nombre: z.string().min(1),
    categoria: z.string().min(1),
    precio: z.union([z.string(), z.number()]),
    activo: z.union([z.number(), z.boolean()]).optional(),
    clave: z.string().optional(),
    clave_sat: z.string().optional()
  });
  const data = schema.parse(req.body);

  const { rows } = await pool.query(
    'INSERT INTO menu_items (nombre, categoria, precio, activo, clave, clave_sat) VALUES ($1, $2, $3, COALESCE($4, 1), COALESCE($5, \'\'), COALESCE($6, \'\')) RETURNING *',
    [data.nombre, data.categoria, data.precio, data.activo, data.clave, data.clave_sat]
  );
  res.status(201).json({ success: true, item: rows[0] });
});

router.put('/menu/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, categoria, precio, activo, clave, clave_sat } = req.body || {};
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
  res.json({ success: true, item: rows[0] || null });
});

router.delete('/menu/:id', async (req, res) => {
  const id = Number(req.params.id);
  await pool.query('DELETE FROM menu_items WHERE id = $1', [id]);
  res.status(204).end();
});

module.exports = router;