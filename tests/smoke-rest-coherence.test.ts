import assert from "node:assert/strict";
import { test } from "node:test";
import { MAIN_INGREDIENTS, generateMeal } from "../lib/meals.ts";
import { cutsForMethod } from "../lib/cut-method.ts";

const base = { methodId: "smoked", regionId: "thai", sideId: "garden-salad", servings: 4 };
const restAction = /(?:^|[.!?]\s+)Rest\b/g;

test("every smoked meat default and compatible cut has one authoritative rest instruction", () => {
  let checked = 0;
  for (const main of MAIN_INGREDIENTS.filter(item => item.category === "meat" && item.methodIds.includes("smoked"))) {
    for (const cut of [undefined, ...cutsForMethod(main.id, "smoked")]) {
      const recipe = generateMeal({ ...base, mainId: main.id, ...(cut ? { cutId: cut.id } : {}) });
      const rest = recipe.steps.filter(step => step.title === "Rest, then slice or pull");
      assert.equal(rest.length, 1, `${main.id}/${cut?.id}`);
      assert.equal([...rest[0].detail.matchAll(restAction)].length, 1, `${main.id}/${cut?.id}: ${rest[0].detail}`);
      for (const step of recipe.steps.filter(item => ["Start the hot smoke", "Manage the stall and finish"].includes(item.title))) {
        assert.ok(!restAction.test(step.detail), `${main.id}/${cut?.id}: rest before the rest stage`);
        restAction.lastIndex = 0;
      }
      const endpoint = ["chicken", "turkey", "duck"].includes(main.id) ? "75°C" : "71°C";
      assert.ok(rest[0].detail.includes(endpoint), `${main.id}/${cut?.id}: endpoint lost`);
      const minutes = recipe.steps.filter(step => ["Start the hot smoke", "Manage the stall and finish", "Rest, then slice or pull"].includes(step.title)).reduce((sum, step) => sum + (step.minutes ?? 0), 0);
      assert.ok(recipe.cookMinutes >= minutes, `${main.id}/${cut?.id}: rest omitted from timing`);
      checked++;
    }
  }
  assert.ok(checked >= 30);
});

test("authored rib, shoulder, breast and whole-bird rests agree with their step duration", () => {
  for (const [mainId, cutId, label, minutes] of [
    ["beef", undefined, "20–30 minutes", 25], ["pork", undefined, "10–15 minutes", 13],
    ["lamb", undefined, "20 minutes", 20], ["chicken", undefined, "10 minutes", 10],
    ["turkey", undefined, "15 minutes", 15], ["duck", undefined, "10 minutes", 10],
    ["pork", "pork-belly", "10 minutes", 10], ["chicken", "chicken-whole", "15 minutes", 15],
    ["turkey", "turkey-whole", "25 minutes", 25],
  ] as const) {
    const recipe = generateMeal({ ...base, mainId, ...(cutId ? { cutId } : {}) });
    const rest = recipe.steps.find(step => step.title === "Rest, then slice or pull")!;
    assert.ok(rest.detail.includes(label), `${mainId}/${cutId}: ${rest.detail}`);
    assert.equal(rest.minutes, minutes, `${mainId}/${cutId}`);
  }
});

test("smoked fish and plant mains retain their handling instead of gaining a meat rest", () => {
  for (const mainId of ["salmon", "tofu", "tempeh", "mushrooms", "jackfruit"]) {
    const recipe = generateMeal({ ...base, mainId });
    assert.ok(!recipe.steps.some(step => step.title === "Rest, then slice or pull"));
    const lift = recipe.steps.find(step => step.title === "Lift the smoked main carefully")!;
    assert.equal(lift.minutes, 1);
    assert.match(lift.detail, /no long meat-style rest/);
    if (mainId === "salmon") assert.match(lift.detail, /63°C/);
  }
});

test("three-hour smoke joints partition their cooking stages without inventing an extra hour", () => {
  for (const [mainId, cutId] of [["lamb", "lamb-shank"], ["pork", "pork-belly"]]) {
    const recipe = generateMeal({ ...base, mainId, cutId });
    const start = recipe.steps.find(step => step.title === "Start the hot smoke")!;
    const finish = recipe.steps.find(step => step.title === "Manage the stall and finish")!;
    assert.equal(start.minutes, 120);
    assert.equal(finish.minutes, 60);
    assert.match(start.detail, /about 120 minutes/);
    assert.match(start.detail, /part of the same total smoke time/);
    assert.ok(recipe.cookMinutes >= 180 + recipe.steps.find(step => step.title === "Rest, then slice or pull")!.minutes!);
  }
});
