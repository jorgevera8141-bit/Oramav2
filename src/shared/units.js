// Kitchen units. A recipe says "18 g of beans" while the beans are bought and costed "per kg": the
// calculator converts the quantity to the unit the cost is quoted in, instead of multiplying them as typed.
// Grams to kilos, millilitres to litres; a weight, a volume and a count never convert into each other.
const UNITS = {
  kg: { family: 'peso', factor: 1000 },
  g: { family: 'peso', factor: 1 },
  l: { family: 'volumen', factor: 1000 },
  ml: { family: 'volumen', factor: 1 },
  pieza: { family: 'cantidad', factor: 1 }
};

const ALIASES = {
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  g: 'g', gr: 'g', gramo: 'g', gramos: 'g',
  l: 'l', lt: 'l', litro: 'l', litros: 'l',
  ml: 'ml', mililitro: 'ml', mililitros: 'ml',
  pieza: 'pieza', piezas: 'pieza', pz: 'pieza', unidad: 'pieza', unidades: 'pieza'
};

function badUnit(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function normalizeUnit(raw) {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return ALIASES[key] || null;
}

function convertQuantity(quantity, fromUnit, toUnit) {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!from) throw badUnit(`La unidad "${fromUnit}" no se reconoce. Usa kg, g, litro, ml o pieza.`);
  if (!to) throw badUnit(`La unidad "${toUnit}" no se reconoce. Usa kg, g, litro, ml o pieza.`);
  if (UNITS[from].family !== UNITS[to].family) {
    throw badUnit(`No se puede usar "${fromUnit}" con un costo por "${toUnit}": una es ${UNITS[from].family} y la otra ${UNITS[to].family}.`);
  }
  return (quantity * UNITS[from].factor) / UNITS[to].factor;
}

module.exports = { normalizeUnit, convertQuantity };
