import assert from "node:assert/strict";
import { test } from "node:test";
import { mealDraftFromRecipe, mealDraftMatchesRecipe, normalizeMealBuilderDraft, restoreMealBuilderDraft } from "../lib/meal-builder-state.ts";
import { generateMeal } from "../lib/meals.ts";
import { generateRecipe } from "../lib/recipes.ts";
import { cookingRecipeKey } from "../lib/recipe-identity.ts";

const greek = generateMeal({ mainId: "halloumi", methodId: "grilled", regionId: "greek", sideId: "garden-salad", servings: 2, diet: "vegetarian" });

test("a pending region stops matching the previous Greek plate and survives a studio remount", () => {
  const made = mealDraftFromRecipe(greek)!;
  assert.equal(mealDraftMatchesRecipe(made, greek), true);
  const pending = { ...made, regionId: "japanese" };
  assert.equal(mealDraftMatchesRecipe(pending, greek), false);
  assert.deepEqual(restoreMealBuilderDraft(pending, greek, { ...made, regionId: "thai" }), pending);
  assert.equal(greek.regionId, "greek", "editing a draft must not rewrite a saved snapshot");
  assert.equal(mealDraftMatchesRecipe(undefined, greek), true);
});

test("main, method, side and explicit cut changes each invalidate only the pending result", () => {
  const recipe = generateMeal({ mainId: "beef", methodId: "braised", regionId: "thai", sideId: "rice-greens", cutId: "beef-brisket", servings: 2 });
  const draft = mealDraftFromRecipe(recipe)!;
  for (const patch of [{ mainId: "chicken" }, { methodId: "grilled" }, { sideId: "garden-salad" }, { cutId: "" }, { cutId: "beef-chuck" }]) assert.equal(mealDraftMatchesRecipe({ ...draft, ...patch }, recipe), false, JSON.stringify(patch));
  assert.equal(mealDraftMatchesRecipe(draft, { ...recipe, title: "My dinner" }), true);
  assert.equal(mealDraftMatchesRecipe(draft, null), false);
  assert.equal(mealDraftMatchesRecipe(draft, generateRecipe({ classicId: "pasta", regionId: "japanese", servings: 2 })), false);
  const legacy = { ...recipe }; delete legacy.generationInput;
  assert.equal(mealDraftFromRecipe(legacy)?.cutId, "beef-brisket");
  assert.equal(mealDraftMatchesRecipe(draft, legacy), true);
});

test("freshly opened recipes override remembered choices and corrupted remembered fields are bounded", () => {
  assert.deepEqual(restoreMealBuilderDraft(undefined, greek, { mainId: "chicken", methodId: "grilled", regionId: "thai" }), mealDraftFromRecipe(greek));
  assert.deepEqual(normalizeMealBuilderDraft({ mainId: "halloumi", methodId: "smoked", regionId: "unknown", sideId: null, cutId: "beef-brisket", diet: "vegan", pantry: "oregano" }), { mainId: "halloumi", methodId: "", regionId: "japanese", sideId: "rice-greens", cutId: "" });
  assert.deepEqual(normalizeMealBuilderDraft(["halloumi"]), { mainId: "", methodId: "", regionId: "japanese", sideId: "rice-greens", cutId: "" });
});

test("Greek then Japanese generation replaces regional ingredients without changing the selected main", () => {
  const originalIds = new Set(greek.ingredients.map((ingredient) => ingredient.id));
  for (const id of ["oregano", "dill", "boukovo"]) assert.ok(originalIds.has(id), `Greek fixture contains ${id}`);
  for (const seed of [undefined, 0, 1, 17, 42, 99]) {
    const input = { mainId: "halloumi", methodId: "grilled", regionId: "japanese", sideId: "garden-salad", servings: 2, diet: "vegetarian" as const, ...(seed === undefined ? {} : { seed }) };
    const before = generateMeal(input);
    generateMeal({ ...input, regionId: "greek" });
    const after = generateMeal(input);
    assert.equal(after.mainId, "halloumi");
    assert.equal(after.regionId, "japanese");
    assert.deepEqual(after.ingredients, before.ingredients);
    assert.deepEqual(after.steps, before.steps);
    assert.equal(cookingRecipeKey(after), cookingRecipeKey(before));
    assert.ok(after.ingredients.every((ingredient) => !["oregano", "dill", "boukovo"].includes(ingredient.id)), `No previous Greek seasoning remains for seed ${seed}`);
    assert.equal(mealDraftMatchesRecipe({ ...mealDraftFromRecipe(greek)!, regionId: "japanese" }, after), true);
  }
});
