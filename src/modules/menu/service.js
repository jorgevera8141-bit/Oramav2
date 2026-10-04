function failure(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

// Deletes a menu item unless a promotion still points at it. The database already refuses a promotion's
// "lleva" product, but only with an opaque error, and a promotion's product list is not checked at all
// (the ids would be left dangling), so both are checked here and the answer names the promotions.
async function deleteMenuItem(db, id) {
  const { rows: [item] } = await db.query('SELECT id, nombre FROM menu_items WHERE id = $1', [id]);
  if (!item) throw failure('Producto no encontrado', 404);

  const { rows: promos } = await db.query(
    'SELECT nombre FROM promociones WHERE lleva_producto_id = $1 OR $1 = ANY(producto_ids) ORDER BY nombre',
    [id]
  );
  if (promos.length) {
    const names = promos.map((promo) => promo.nombre).join(', ');
    throw failure(
      `No se puede eliminar "${item.nombre}": está en ${promos.length === 1 ? 'la promoción' : 'las promociones'} ${names}. Quítalo de ahí o márcalo como inactivo.`,
      409
    );
  }

  await db.query('DELETE FROM menu_items WHERE id = $1', [id]);
  return item;
}

module.exports = { deleteMenuItem };
