const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

// The menu_items table has no unique constraint on the dish, so ON CONFLICT below never
// fires: running this on a menu that already has items would duplicate all of it (and
// anything joining on item name with it). Only seed an empty menu.
async function seedMenu(db = pool) {
  const { rows: [{ count }] } = await db.query('SELECT COUNT(*)::int AS count FROM menu_items');
  if (count > 0) {
    throw Object.assign(new Error('El menú ya tiene artículos; no se vuelve a cargar.'), { statusCode: 409 });
  }
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

    await db.query(
      'INSERT INTO menu_items (nombre, categoria, precio, activo, clave, clave_sat) VALUES ($1, $2, $3, 1, $4, $5) ON CONFLICT DO NOTHING',
      [nombre, categoria, precio, clave, claveSat]
    );
  }

  return { success: true, count: items.length };
}

module.exports = seedMenu;