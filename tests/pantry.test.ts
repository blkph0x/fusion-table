import test from "node:test";
import assert from "node:assert/strict";

const { isConsumable, makeRecipe, rememberConsumables, weekNeeds, weekShortfalls } = await import(new URL("../lib/pantry.ts", import.meta.url).href);

test("oils, butter and flour are pantry consumables, and a steak is not", () => {
  assert.equal(isConsumable("Extra virgin olive oil"), true);
  assert.equal(isConsumable("Unsalted butter"), true);
  assert.equal(isConsumable("Plain flour"), true);
  assert.equal(isConsumable("Chicken thigh"), false);
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
