const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveIngredientsCost } = require('../src/modules/pricing/service');

const inventory = {
  7: { id: 7, name: 'Leche', unit: 'litro', unit_cost: '22.00', current_stock: 10 },
  8: { id: 8, name: 'Café', unit: 'kg', unit_cost: '450.00', current_stock: 3 },
  9: { id: 9, name: 'Sin costo', unit: 'kg', unit_cost: '0', current_stock: 1 }
};
const fakeDb = { async query(_sql, params) { return { rows: inventory[params[0]] ? [inventory[params[0]]] : [] }; } };
const cost = (lines) => resolveIngredientsCost(lines, fakeDb);
const rejects = (promise, pattern) => assert.rejects(promise, (error) => error.statusCode === 400 && pattern.test(error.message));

test('18 g of beans costed per kg is $8.10, not $8,100 (the unit trap)', async () => {
  const total = await cost([{ ingredientName: 'Granos', quantityPerServing: 18, unit: 'g', costUnit: 'kg', unitCost: 450 }]);
  assert.equal(Number(total.toFixed(2)), 8.1);
});

test('without a cost unit, the quantity and the cost are in the same unit, as before', async () => {
  assert.equal(await cost([{ ingredientName: 'Vaso', quantityPerServing: 1, unit: 'pieza', unitCost: 3 }]), 3);
  assert.equal(Number((await cost([{ ingredientName: 'Granos', quantityPerServing: 18, unit: 'g', unitCost: 0.45 }])).toFixed(2)), 8.1);
});

test('ml of milk against a cost per litre converts too', async () => {
  const total = await cost([{ ingredientName: 'Leche', quantityPerServing: 250, unit: 'ml', costUnit: 'litro', unitCost: 22 }]);
  assert.equal(Number(total.toFixed(2)), 5.5);
});

test('an inventory line takes its cost and the unit it is costed in from the inventory', async () => {
  const total = await cost([{ inventoryItemId: 8, quantityPerServing: 18, unit: 'g' }, { inventoryItemId: 7, quantityPerServing: 250, unit: 'ml' }]);
  assert.equal(Number(total.toFixed(2)), 13.6, '18 g at 450/kg + 250 ml at 22/litre');
});

test('rows that repeat an ingredient all count (nothing is silently dropped)', async () => {
  const total = await cost([
    { ingredientName: 'Leche', quantityPerServing: 100, unit: 'ml', costUnit: 'litro', unitCost: 22 },
    { ingredientName: 'Leche', quantityPerServing: 150, unit: 'ml', costUnit: 'litro', unitCost: 22 }
  ]);
  assert.equal(Number(total.toFixed(2)), 5.5);
});

test('a missing or zero cost stops the calculation and names the ingredients', async () => {
  await rejects(cost([{ ingredientName: 'Granos', quantityPerServing: 18, unit: 'g' }]), /Falta el costo de: Granos/);
  await rejects(cost([{ ingredientName: 'Granos', quantityPerServing: 18, unit: 'g', unitCost: 0 }, { ingredientName: 'Leche', quantityPerServing: 1, unit: 'ml', unitCost: 0 }]), /Granos, Leche/);
  await rejects(cost([{ inventoryItemId: 9, quantityPerServing: 5, unit: 'g' }]), /Sin costo|insumo/);
});

test('incompatible or unknown units are refused instead of multiplied anyway', async () => {
  await rejects(cost([{ ingredientName: 'Leche', quantityPerServing: 250, unit: 'ml', costUnit: 'kg', unitCost: 22 }]), /ml/);
  await rejects(cost([{ ingredientName: 'Sal', quantityPerServing: 1, unit: 'pizca', unitCost: 1 }]), /pizca/);
});
