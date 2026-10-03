const test = require('node:test');
const assert = require('node:assert/strict');
const { toRecipeRows } = require('../src/modules/pricing/service');
const { recipeSaveSchema } = require('../src/modules/pricing/schemas');

const inventory = {
  7: { id: 7, name: 'Leche', unit: 'litro' },
  8: { id: 8, name: 'Café', unit: 'kg' }
};
const loadItem = async (id) => inventory[id];
const rows = (ingredients) => toRecipeRows(ingredients, loadItem);

test('18 g of coffee is stored as 0.018 kg, the unit inventory counts in', async () => {
  const [row] = await rows([{ inventoryItemId: 8, quantityUsed: 18, unit: 'g' }]);
  assert.deepEqual(row, { inventoryItemId: 8, quantityUsed: 0.018 });
});

test('waste is stored as the amount really consumed: 100 g usable at 80% yield uses 125 g', async () => {
  const [row] = await rows([{ inventoryItemId: 8, quantityUsed: 100, unit: 'g', yieldPct: 80 }]);
  assert.equal(row.quantityUsed, 0.125);
});

test('without a unit the quantity is already in the inventory unit', async () => {
  const [row] = await rows([{ inventoryItemId: 7, quantityUsed: 0.25 }]);
  assert.equal(row.quantityUsed, 0.25);
});

test('the same inventory item on two lines is added up, not rejected by the unique key', async () => {
  const result = await rows([
    { inventoryItemId: 7, quantityUsed: 200, unit: 'ml' },
    { inventoryItemId: 7, quantityUsed: 0.05 }
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].quantityUsed, 0.25);
});

test('an inventory item that does not exist is a 400 that names it, and a wrong unit family is refused', async () => {
  await assert.rejects(rows([{ inventoryItemId: 99, quantityUsed: 1 }]), (e) => e.statusCode === 400 && /#99/.test(e.message));
  await assert.rejects(rows([{ inventoryItemId: 7, quantityUsed: 5, unit: 'g' }]), (e) => e.statusCode === 400);
});

test('the save schema needs at least one ingredient and keeps the extra costs', () => {
  const ok = recipeSaveSchema.safeParse({ menuItemId: 3, ingredients: [{ inventoryItemId: 8, quantityUsed: 18, unit: 'g' }], extraCosts: { packaging: 3 } });
  assert.equal(ok.success, true);
  assert.equal(ok.data.extraCosts.labor, 0);
  assert.equal(recipeSaveSchema.safeParse({ menuItemId: 3, ingredients: [], extraCosts: {} }).success, false);
});
