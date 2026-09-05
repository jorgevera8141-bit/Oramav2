const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function seedMenu() {
  const filePath = path.join(__dirname, '..', '..', '..', 'seed_with_codes.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  const items = JSON.parse(raw);
  let counter = 1;

  for (const i of items) {
    const nombre = i['nombre '] || i.nombre;
    const categoria = i['categoria '] || i.categoria;
    const precio = i['precio '] || i.precio;
    const clave = i['clave '] || i.clave || `${String(nombre || '').slice(0, 2).toUpperCase()}${counter++}`;
    const claveSat = i.clave_sat || '';

    await pool.query(
      'INSERT INTO menu_items (nombre, categoria, precio, activo, clave, clave_sat) VALUES ($1, $2, $3, 1, $4, $5) ON CONFLICT DO NOTHING',
      [nombre, categoria, precio, clave, claveSat]
    );
  }

  return { success: true, count: items.length };
}

module.exports = seedMenu;