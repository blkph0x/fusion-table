import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeShoppingList, readCustomShopping } from "../lib/shopping-list.ts";

describe("shopping list sources", () => {
  it("gives grams and cloves distinct stable IDs and keeps IDs stable through editing a quantity", () => {
    const first = normalizeShoppingList([{ id: "garlic", name: "Garlic", amount: 15, unit: "g" }, { id: "garlic", name: "Garlic", amount: 3, unit: "cloves" }]);
    assert.notEqual(first[0].id, first[1].id);
    assert.equal(normalizeShoppingList([{ ...first[0], amount: 30 }])[0].id, first[0].id);
  });
  it("merges exact metric conversions so one product is not bought twice", () => {
    const rows = normalizeShoppingList([{ name: "Rice", amount: 0.5, unit: "kg" }, { name: " rice ", amount: 250, unit: "g" }, { name: "Milk", amount: 1, unit: "l" }, { name: "Milk", amount: 250, unit: "ml" }]);
    assert.deepEqual(rows.map(({ amount, unit }) => ({ amount, unit })), [{ amount: 750, unit: "g" }, { amount: 1250, unit: "ml" }]);
  });
  it("does not guess fresh-food density or spoon-to-weight conversions", () => {
    const rows = normalizeShoppingList([{ name: "Cumin", amount: 1, unit: "tsp" }, { name: "Cumin", amount: 20, unit: "g" }]);
    assert.equal(rows.length, 2);
  });
  it("preserves a custom display unit across edits and reloads while using the same physical-quantity identity", () => {
    const rows = normalizeShoppingList([{ name: "Rice", amount: 0.5, unit: "kg" }], [], { preserveUnits: true });
    assert.equal(rows[0].amount, 0.5); assert.equal(rows[0].unit, "kg");
    assert.equal(rows[0].id, normalizeShoppingList([{ name: "Rice", amount: 500, unit: "g" }])[0].id);
    assert.deepEqual(readCustomShopping(rows), rows);
    const merged = normalizeShoppingList([...rows, { name: "Rice", amount: 250, unit: "g" }], [], { preserveUnits: true });
    assert.equal(merged[0].amount, 0.75); assert.equal(merged[0].unit, "kg");
  });
  it("loads valid custom entries without trusting persisted extra fields", () => {
    const rows = readCustomShopping([{ name: "Rice", amount: 2, unit: "kg", category: "butcher", allergens: ["fish"] }, { name: "Milk", amount: -1, unit: "l" }, null]);
    assert.equal(rows.length, 1); assert.equal(rows[0].category, undefined); assert.deepEqual(rows[0].allergens, []);
  });
});
