import assert from "node:assert/strict";
import { test } from "node:test";
import { generateRecipe } from "../lib/recipes.ts";
import { generateMeal } from "../lib/meals.ts";
import { enumerateRecipeFinishes, type FusionSpec } from "../lib/fusion-sat.ts";
import { modelSatisfies } from "../lib/sat.ts";
import { markerLeak } from "../lib/region-affinity.ts";
const input = { mainId: "chicken", methodId: "grilled", regionId: "thai", sideId: "rice-greens", servings: 4 };
const spec: FusionSpec = { seed: 1, regionId: "thai", diet: "balanced", spiceHeat: "medium", glutenFree: false, dairyFree: false, vegan: false, vegetarian: false, eggFree: false, mainId: "chicken", methodId: "grilled", servings: 4 };
const limits = { maxModels: 1024, maxTotalWork: 50000000, maxTotalSteps: 100000, maxProofWork: 2000000 };
test("finite finish graph exhaustion is complete, unique and hard-constraint checked", () => {
  const recipe = generateMeal(input);
  const before = structuredClone(recipe);
  const result = enumerateRecipeFinishes(recipe, spec, limits);
  assert.equal(result.complete, true);
  assert.equal(result.termination, "exhausted");
  assert.ok(result.modelCount > 8);
  assert.equal(new Set(result.models.map(model => model.assignment.slice(1).map(Number).join(""))).size, result.modelCount);
  for (const model of result.models) {
    assert.ok(modelSatisfies(result.clauses, model.assignment));
    assert.ok(model.picks.length <= 2);
    for (const pick of model.picks) {
      assert.equal(markerLeak(recipe.regionId, pick.id, pick.name), null);
      assert.ok(!["butcher", "fishmonger"].includes(pick.category));
      assert.ok(Number.isFinite(pick.amount) && pick.amount > 0);
    }
  }
  assert.deepEqual(recipe, before);
  const differentSeed = enumerateRecipeFinishes(recipe, { ...spec, seed: 99 }, limits);
  assert.equal(differentSeed.complete, true);
  assert.deepEqual(result.models.map(model => model.assignment.join(",")).sort(), differentSeed.models.map(model => model.assignment.join(",")).sort());
});
test("finish graph caps stay incomplete and whole-word dislikes exclude every model", () => {
  const recipe = generateMeal(input);
  const capped = enumerateRecipeFinishes(recipe, spec, { ...limits, maxModels: 2 });
  assert.equal(capped.complete, false);
  assert.equal(capped.modelCount, 2);
  const result = enumerateRecipeFinishes(recipe, { ...spec, dislikes: ["carrot", "cucumber"], avoid: ["sesame", "peanut"] }, limits);
  assert.equal(result.complete, true);
  for (const model of result.models) for (const pick of model.picks) {
    assert.doesNotMatch(pick.name, /carrot|cucumber/i);
    assert.ok(!pick.allergens.some(allergen => ["sesame", "peanut"].includes(allergen)));
  }
});

test("fresh red pepper is the same vegetable as capsicum, while chilli flakes remain a different form", () => {
  const skewers = generateRecipe({ classicId: "grilled-skewers", regionId: "thai", servings: 4 });
  assert.ok(skewers.ingredients.some(item => item.name === "Red pepper"));
  const result = enumerateRecipeFinishes(skewers, { ...spec, mainId: undefined, methodId: undefined }, limits);
  assert.equal(result.complete, true);
  assert.ok(result.models.every(model => model.picks.every(pick => pick.id !== "sat-capsicum")));
  const pasta = generateRecipe({ classicId: "pasta", regionId: "japanese", servings: 4 });
  const flakes = pasta.ingredients.find(item => /chilli flakes/i.test(item.name))!;
  assert.ok(flakes); flakes.name = "Red pepper flakes";
  const distinct = enumerateRecipeFinishes(pasta, { ...spec, regionId: "japanese", mainId: undefined, methodId: undefined }, limits);
  assert.equal(distinct.complete, true);
  assert.ok(distinct.models.some(model => model.picks.some(pick => pick.id === "sat-capsicum")));
});
