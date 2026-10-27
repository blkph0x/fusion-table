import test from "node:test";
import assert from "node:assert/strict";
import { declarePantryOwnership, formatPantryQuantity, isConsumable, makeRecipe, pantryOnHand, pantryOwnedIds, prepareRecipe, rememberConsumables, weekNeeds, weekShortfalls } from "../lib/pantry.ts";

test("oils, butter and flour are pantry consumables, and a steak is not", () => {
  assert.equal(isConsumable("Extra virgin olive oil"), true);
  assert.equal(isConsumable("Unsalted butter"), true);
  assert.equal(isConsumable("Plain flour"), true);
  assert.equal(isConsumable("Chicken thigh"), false);
  assert.equal(isConsumable("Red pepper"), false);
  assert.equal(isConsumable("Roasted bell peppers"), false);
  assert.equal(isConsumable("Ground black pepper"), true);
  assert.equal(isConsumable("Dried red pepper flakes"), true);
});

test("making a meal uses what is on hand and shops only the shortfall", () => {
  const result = makeRecipe(
    [{ key: "olive oil", name: "Olive oil", unit: "tbsp", onHand: 1 }],
    [
      { id: "oil", name: "Olive oil", amount: 3, unit: "tbsp", have: false },
      { id: "chicken", name: "Chicken thigh", amount: 600, unit: "g", have: false },
      { id: "garlic", name: "Garlic", amount: 3, unit: "cloves", have: true },
    ],
  );
  const oil = result.shopping.find((line) => line.name === "Olive oil");
  assert.equal(oil?.amount, 2);
  assert.match(oil?.reason || "", /pantry/i);
  assert.equal(result.shopping.some((line) => line.name === "Garlic"), false);
  assert.equal(result.pantry.find((item) => item.name === "Garlic")?.onHand, 0);
  assert.ok(result.warnings.some((warning) => warning.includes("Olive oil")));
  assert.equal(result.shopping.some((line) => /\$|price/i.test(line.reason)), false);
});

test("a week plan warns before the pantry is used up", () => {
  const warnings = weekShortfalls(
    [{ key: "plain flour", name: "Plain flour", unit: "g", onHand: 50 }],
    [
      { name: "Plain flour", amount: 80, unit: "g" },
      { name: "Plain flour", amount: 40, unit: "g" },
    ],
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Have 50 g, need 120 g/);
});

test("flour left after a cook is marked low and is not given a price", () => {
  const result = makeRecipe(
    [{ key: "plain flour", name: "Plain flour", unit: "g", onHand: 100 }],
    [{ id: "flour", name: "Plain flour", amount: 80, unit: "g", have: true }],
  );
  assert.equal(result.pantry.find((item) => item.name === "Plain flour")?.onHand, 20);
  assert.match(result.warnings.join(" "), /getting low/);
  assert.equal(result.shopping.length, 0);
});

test("a week records oil and flour on the pantry before they are bought", () => {
  const tracked = rememberConsumables([], [
    { name: "Olive oil", amount: 2, unit: "tbsp" },
    { name: "Plain flour", amount: 200, unit: "g" },
    { name: "Chicken thigh", amount: 400, unit: "g" },
  ]);
  assert.deepEqual(tracked.map((item) => item.name).sort(), ["Olive oil", "Plain flour"]);
  assert.equal(tracked.every((item) => item.onHand === 0), true);
  const again = rememberConsumables(tracked, [{ name: "Olive oil", amount: 1, unit: "tbsp" }]);
  assert.equal(again.filter((item) => item.name === "Olive oil").length, 1);
  const needs = weekNeeds(tracked, [
    { name: "Olive oil", amount: 2, unit: "tbsp" },
    { name: "Chicken thigh", amount: 400, unit: "g" },
  ]);
  assert.equal(needs.find((line) => line.name === "Olive oil")?.amount, 2);
  assert.equal(needs.some((line) => /\$|price|cents/i.test(line.reason)), false);
});

test("a week shopping list is the shortfall only and has no price", () => {
  const lines = weekNeeds(
    [{ key: "plain flour", name: "Plain flour", unit: "g", onHand: 50 }],
    [
      { id: "flour", name: "Plain flour", amount: 80, unit: "g" },
      { id: "flour", name: "Plain flour", amount: 40, unit: "g" },
      { name: "Chicken thigh", amount: 200, unit: "g" },
    ],
  );
  assert.equal(lines.find((line) => line.name === "Plain flour")?.amount, 70);
  assert.equal(lines.find((line) => line.name === "Chicken thigh")?.amount, 200);
  assert.equal(lines.some((line) => /\$|price|cents/i.test(`${line.reason} ${line.amount}`)), false);
});

test("preparing shopping repeatedly never consumes stock or mutates the original records", () => {
  const pantry = [{ key: "olive oil", name: "Olive oil", unit: "tbsp", onHand: 5 }];
  const lines = [
    { id: "oil", name: "Olive oil", amount: 2, unit: "tbsp", have: true },
    { id: "garlic", name: "Garlic", amount: 3, unit: "cloves", have: true },
    { id: "chicken", name: "Chicken thigh", amount: 400, unit: "g", have: false },
  ];
  const original = structuredClone(pantry);
  const prepared = prepareRecipe(pantry, lines);
  const repeated = prepareRecipe(prepared.pantry, lines);
  assert.deepEqual(pantry, original);
  assert.deepEqual(repeated, prepared);
  assert.equal(pantryOnHand(prepared.pantry, "Olive oil", "tbsp"), 5);
  assert.equal(pantryOnHand(prepared.pantry, "Garlic", "cloves"), 3);
  assert.deepEqual(prepared.shopping.map((line) => [line.name, line.amount]), [["Chicken thigh", 400]]);
  const cooked = makeRecipe(prepared.pantry, lines);
  assert.equal(pantryOnHand(cooked.pantry, "Olive oil", "tbsp"), 3);
  assert.equal(pantryOnHand(cooked.pantry, "Garlic", "cloves"), 0);
  assert.equal(pantryOnHand(prepared.pantry, "Garlic", "cloves"), 3);
});

test("saved metric quantities cover compatible recipe units and are deducted once", () => {
  const pantry = [
    { key: "plain flour", name: "Plain flour", unit: "kg", onHand: 0.2 },
    { key: "plain flour", name: "Plain flour", unit: "g", onHand: 50 },
    { key: "milk", name: "Milk", unit: "litres", onHand: 0.5 },
  ];
  const needs = weekNeeds(pantry, [
    { name: "Plain flour", amount: 0.2, unit: "kg" },
    { name: "Plain flour", amount: 100, unit: "g" },
    { name: "Milk", amount: 200, unit: "ml" },
  ]);
  assert.deepEqual(needs.map((line) => [line.name, line.amount, line.unit]), [["Plain flour", 50, "g"]]);
  const cooked = makeRecipe(pantry, [
    { id: "flour", name: "Plain flour", amount: 150, unit: "g", have: false },
    { id: "milk", name: "Milk", amount: 0.2, unit: "l", have: false },
  ]);
  assert.equal(pantryOnHand(cooked.pantry, "Plain flour", "g"), 100);
  assert.equal(pantryOnHand(cooked.pantry, "Milk", "ml"), 300);
  assert.equal(pantryOnHand(pantry, "Plain flour", "kg"), 0.25);
});

test("spoons, counts and mass are not guessed from other units", () => {
  const needs = weekNeeds([
    { key: "olive oil", name: "Olive oil", unit: "ml", onHand: 100 },
    { key: "garlic", name: "Garlic", unit: "cloves", onHand: 5 },
  ], [
    { name: "Olive oil", amount: 2, unit: "tbsp" },
    { name: "Garlic", amount: 10, unit: "g" },
  ]);
  assert.deepEqual(needs.map((line) => [line.amount, line.unit]), [[2, "tbsp"], [10, "g"]]);
});

test("automatic ownership allocates pantry once across duplicate ingredient lines", () => {
  const pantry = [{ key: "garlic", name: "Garlic", unit: "g", onHand: 80 }];
  const lines = [
    { id: "main-garlic", name: "Garlic", amount: 50, unit: "g" },
    { id: "side-garlic", name: "Garlic", amount: 70, unit: "g" },
  ];
  const owned = pantryOwnedIds(pantry, lines);
  assert.deepEqual([...owned], ["main-garlic"]);
  const prepared = prepareRecipe(pantry, lines.map((line) => ({ ...line, have: owned.has(line.id) })));
  assert.equal(prepared.shopping.length, 1);
  assert.equal(prepared.shopping[0].amount, 40);
  assert.equal(pantryOnHand(prepared.pantry, "Garlic", "g"), 80);
});

test("declared ownership and a cook aggregate duplicate requirements before deduction", () => {
  const lines = [
    { id: "main-oil", name: "Olive oil", amount: 1, unit: "tbsp", have: true },
    { id: "side-oil", name: "Olive oil", amount: 2, unit: "tbsp", have: true },
  ];
  const prepared = prepareRecipe([], lines);
  assert.equal(pantryOnHand(prepared.pantry, "Olive oil", "tbsp"), 3);
  assert.equal(prepared.shopping.length, 0);
  const cooked = makeRecipe(prepared.pantry, lines);
  assert.equal(pantryOnHand(cooked.pantry, "Olive oil", "tbsp"), 0);
  assert.equal(cooked.shopping.length, 0);
});

test("counted ingredients have readable quantities without blank unit gaps", () => {
  assert.equal(formatPantryQuantity(2, ""), "2");
  assert.equal(formatPantryQuantity(0.5, "  "), "0.5");
  const warnings = weekShortfalls([], [{ name: "Lemon", amount: 2, unit: "" }]);
  assert.deepEqual(warnings, ["Not enough Lemon for this week. Have 0, need 2."]);
});

test("checkbox ownership immediately covers a shopping shortfall without using up any ingredient", () => {
  const original = [{ key: "halloumi", name: "Halloumi", unit: "g", onHand: 75 }];
  const lines = [{ id: "cheese", name: "Halloumi", amount: 200, unit: "g", have: true }];
  const owned = declarePantryOwnership(original, lines, "cheese");
  assert.equal(pantryOnHand(owned, "Halloumi", "g"), 200);
  assert.equal(weekNeeds(owned, lines).length, 0);
  assert.equal(pantryOnHand(original, "Halloumi", "g"), 75);
  const restored = declarePantryOwnership(owned, lines.map(line => ({ ...line, have: false })), "cheese", { amount: 75, unit: "g" });
  assert.equal(pantryOnHand(restored, "Halloumi", "g"), 75);
  assert.equal(weekNeeds(restored, lines)[0].amount, 125);
});

test("an explicit untick clears only its selected food and compatible measurement family", () => {
  const original = [
    { key: "legacy-key", name: "OLIVE-OIL", unit: "litres", onHand: 0.2 },
    { key: "olive oil", name: "Olive oil", unit: "ml", onHand: 50 },
    { key: "olive oil", name: "Olive oil", unit: "tbsp", onHand: 3 },
    { key: "sesame oil", name: "Sesame oil", unit: "ml", onHand: 200 },
  ];
  const lines = [
    { id: "main", name: "Olive oil", amount: 0.1, unit: "l", have: false },
    { id: "side", name: "Olive oil", amount: 20, unit: "ml", have: true },
  ];
  const next = declarePantryOwnership(original, lines, "main");
  assert.equal(pantryOnHand(next, "Olive oil", "ml"), 20);
  assert.equal(pantryOnHand(next, "Olive oil", "tbsp"), 3);
  assert.equal(pantryOnHand(next, "Sesame oil", "ml"), 200);
  assert.equal(pantryOnHand(original, "Olive oil", "ml"), 250);
});

test("duplicate checked uses are declared once as their combined quantity", () => {
  const lines = [
    { id: "main", name: "Garlic", amount: 50, unit: "g", have: true },
    { id: "side", name: "Garlic", amount: 0.07, unit: "kg", have: true },
  ];
  const first = declarePantryOwnership([], lines, "side");
  const repeated = declarePantryOwnership(first, lines, "side");
  assert.equal(pantryOnHand(repeated, "Garlic", "g"), 120);
  assert.deepEqual(repeated, first);
  const cleared = declarePantryOwnership(repeated, lines.map(line => ({ ...line, have: line.id !== "side" })), "side");
  assert.equal(pantryOnHand(cleared, "Garlic", "g"), 50);
  assert.equal(weekNeeds(cleared, lines)[0].amount, 70);
});

test("declarations cannot convert a partial weight into counts or change another similarly named food", () => {
  const stock = [{ key: "garlic", name: "Garlic", unit: "g", onHand: 40 }, { key: "garlic powder", name: "Garlic powder", unit: "g", onHand: 90 }];
  const next = declarePantryOwnership(stock, [{ id: "garlic", name: "Garlic", amount: 3, unit: "cloves", have: true }], "garlic");
  assert.equal(pantryOnHand(next, "Garlic", "cloves"), 3);
  assert.equal(pantryOnHand(next, "Garlic", "g"), 40);
  assert.equal(pantryOnHand(next, "Garlic powder", "g"), 90);
  const cleared = declarePantryOwnership(next, [{ id: "garlic", name: "Garlic", amount: 3, unit: "cloves", have: false }], "garlic", { amount: 100, unit: "g" });
  assert.equal(pantryOnHand(cleared, "Garlic", "cloves"), 0);
});
