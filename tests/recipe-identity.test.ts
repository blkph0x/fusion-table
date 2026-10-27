import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateMeal } from "../lib/meals.ts";
import { generateRecipe } from "../lib/recipes.ts";
import { SUPPORTED_ALLERGENS } from "../lib/recipe-filters.ts";
import { recipePdf } from "../lib/recipe-pdf.ts";
import type { Recipe } from "../lib/recipe-types.ts";
import { decodeShare, encodeShare, recipeFromShare, shareSpecMatchesRecipe, specFromRecipe, type ShareSpec } from "../lib/share-recipe.ts";

function cookingContent(recipe: Recipe) {
  return {
    id: recipe.id, title: recipe.title, description: recipe.description, servings: recipe.servings,
    ingredients: recipe.ingredients.map((item) => ({ ...item, inPantry: false })),
    steps: recipe.steps, allergens: recipe.allergens, equipment: recipe.equipment,
    totalMinutes: recipe.totalMinutes, cookPace: recipe.cookPace, sessionNote: recipe.sessionNote,
  };
}

function shareRoundTrip(recipe: Recipe): Recipe {
  return recipeFromShare(decodeShare(encodeShare(specFromRecipe(recipe))));
}

describe("complete recipe sharing identity", () => {
  it("keeps cleaner settings instead of adding sauces when a shared recipe or PDF is opened", () => {
    const original = generateMeal({
      mainId: "chicken", methodId: "grilled", regionId: "thai", sideId: "rice-greens", servings: 2,
      seed: 42, clean: { cleanMode: true, fewerBottles: true },
    });
    const rebuilt = shareRoundTrip(original);
    assert.deepEqual(cookingContent(rebuilt), cookingContent(original));
    assert.deepEqual(rebuilt.cleanSummary, original.cleanSummary);
    assert.deepEqual(rebuilt.cleanStats, original.cleanStats);
    assert.deepEqual(recipePdf(rebuilt), recipePdf(original));
  });

  it("keeps the butcher cut, constraints, seeded regional variety and cook session", () => {
    const original = generateMeal({
      mainId: "beef", methodId: "braised", regionId: "thai", sideId: "rice-greens", cutId: "beef-brisket",
      servings: 3, seed: 17, constraints: { glutenFree: true, dairyFree: true },
      clean: { moreVegetables: true }, softenIngredients: ["garlic", "ginger", "coriander"],
      avoidAllergens: ["milk"], dislikes: ["anchovies"], cookPace: "morning",
    });
    const spec = specFromRecipe(original);
    assert.equal(spec.cutId, "beef-brisket");
    assert.equal(spec.glutenFree, true);
    assert.deepEqual(spec.softenIngredients, ["garlic", "ginger", "coriander"]);
    const rebuilt = shareRoundTrip(original);
    assert.deepEqual(cookingContent(rebuilt), cookingContent(original));
    assert.match(rebuilt.ingredients[0].name, /brisket/i);
  });

  it("keeps classic clean flags and hard filters along with seed and session", () => {
    const original = generateRecipe({
      classicId: "tacos", regionId: "korean", servings: 3, diet: "vegan", spiceHeat: "hot", seed: 9,
      constraints: { glutenFree: true }, clean: { fewerBottles: true },
      avoidAllergens: ["fish"], dislikes: ["prawns"], cookPace: "quick",
    });
    const spec = specFromRecipe(original);
    assert.deepEqual(spec.clean, { fewerBottles: true });
    assert.deepEqual(spec.avoid, ["fish"]);
    assert.deepEqual(spec.dislikes, ["prawns"]);
    assert.deepEqual(cookingContent(shareRoundTrip(original)), cookingContent(original));
  });

  it("shares pantry-first cooking choices without sharing what is in the household pantry", () => {
    const original = generateMeal({
      mainId: "chicken", methodId: "grilled", regionId: "thai", sideId: "rice-greens", servings: 2,
      seed: 42, clean: { pantryFirstClean: true, fewerBottles: true }, pantry: "garlic, olive oil, jasmine rice",
    });
    assert.ok(original.ingredients.some((item) => item.inPantry));
    const rebuilt = shareRoundTrip(original);
    assert.deepEqual(cookingContent(rebuilt), cookingContent(original));
    assert.ok(rebuilt.ingredients.every((item) => !item.inPantry));
    assert.equal("pantry" in specFromRecipe(original), false);
    assert.equal("pantry" in (original.generationInput ?? {}), false);
  });

  it("retains input snapshots when a caller later edits their preference objects", () => {
    const clean = { fewerBottles: true };
    const softenIngredients = ["garlic"];
    const original = generateMeal({ mainId: "chicken", methodId: "grilled", regionId: "thai", servings: 2, seed: 42, clean, softenIngredients });
    clean.fewerBottles = false;
    softenIngredients.push("ginger");
    assert.deepEqual(specFromRecipe(original).clean, { fewerBottles: true });
    assert.deepEqual(specFromRecipe(original).softenIngredients, ["garlic"]);
    assert.deepEqual(cookingContent(shareRoundTrip(original)), cookingContent(original));
  });

  it("still opens old v1 links and preserves cuts recoverable from old recipe snapshots", () => {
    const oldSpec: ShareSpec = { v: 1, kind: "classic", classicId: "pasta", regionId: "japanese", diet: "vegetarian", spiceHeat: "medium", servings: 2 };
    const original = generateRecipe({ classicId: "pasta", regionId: "japanese", diet: "vegetarian", spiceHeat: "medium", servings: 2 });
    assert.deepEqual(cookingContent(recipeFromShare(decodeShare(encodeShare(oldSpec)))), cookingContent(original));
    const cutRecipe = generateMeal({ mainId: "beef", methodId: "braised", regionId: "thai", cutId: "beef-brisket", servings: 2 });
    const oldSnapshot = { ...cutRecipe };
    delete oldSnapshot.generationInput;
    assert.equal(specFromRecipe(oldSnapshot).cutId, "beef-brisket");
    assert.deepEqual(cookingContent(shareRoundTrip(oldSnapshot)), cookingContent(cutRecipe));
  });

  it("does not pretend it can reproduce missing cleaner settings in an old saved recipe", () => {
    const oldSnapshot = { ...generateMeal({ mainId: "chicken", methodId: "grilled", regionId: "thai", servings: 2, clean: { fewerBottles: true } }) };
    delete oldSnapshot.generationInput;
    assert.throws(() => specFromRecipe(oldSnapshot), /predates complete sharing/);
  });

  it("bounds and validates additional token options rather than silently discarding them", () => {
    const base: ShareSpec = { v: 1, kind: "meal", mainId: "chicken", methodId: "grilled", sideId: "rice-greens", regionId: "thai", diet: "balanced", spiceHeat: "medium", servings: 2 };
    for (const clean of [{ cleanMode: "yes" }, { surpriseSauce: true }, []]) {
      assert.throws(() => encodeShare({ ...base, clean } as unknown as ShareSpec), /not a Fusion Table recipe/);
    }
    assert.throws(() => encodeShare({ ...base, softenIngredients: ["<script>"] }), /not a Fusion Table recipe/);
    assert.throws(() => encodeShare({ ...base, softenIngredients: Array(81).fill("garlic") }), /not a Fusion Table recipe/);
    assert.throws(() => decodeShare("a".repeat(7501)), /not a Fusion Table recipe/);
    const allAvoid = decodeShare(encodeShare({ ...base, avoid: [...SUPPORTED_ALLERGENS] }));
    assert.deepEqual(allAvoid.avoid, [...SUPPORTED_ALLERGENS]);
    const longDislikes = Array.from({ length: 20 }, (_, n) => `ingredient ${n}`);
    assert.deepEqual(decodeShare(encodeShare({ ...base, dislikes: longDislikes })).dislikes, longDislikes);
  });

  it("verifies a current recipe while ignoring a renamed display title and pantry ticks", () => {
    const original = generateMeal({ mainId: "chicken", methodId: "grilled", regionId: "thai", servings: 2, seed: 42, clean: { cleanMode: true, fewerBottles: true } });
    const spec = specFromRecipe(original);
    assert.equal(shareSpecMatchesRecipe(spec, original), true);
    assert.equal(shareSpecMatchesRecipe(spec, { ...original, title: "My favourite dinner", ingredients: original.ingredients.map((item) => ({ ...item, inPantry: true })) }), true);
  });

  it("refuses links that would recreate changed quantities, methods or another recipe", () => {
    const original = generateMeal({ mainId: "chicken", methodId: "grilled", regionId: "thai", servings: 2, seed: 42 });
    const oldToken = encodeShare(specFromRecipe(original));
    const oldSpec = decodeShare(oldToken);
    const changedSnapshot = { ...original, ingredients: original.ingredients.map((item, index) => index ? item : { ...item, amount: item.amount + 25 }) };
    assert.equal(shareSpecMatchesRecipe(oldSpec, changedSnapshot), false);
    assert.equal(shareSpecMatchesRecipe(oldSpec, { ...original, steps: original.steps.map((step, index) => index ? step : { ...step, detail: "An older preparation instruction." }) }), false);
    assert.equal(shareSpecMatchesRecipe({ ...oldSpec, seed: 17 }, original), false);
  });

  it("returns false for malformed or unsupported old-token specifications without throwing", () => {
    const original = generateRecipe({ classicId: "pasta", regionId: "japanese", servings: 2 });
    for (const invalid of [null, undefined, "not a decoded token", [], { v: 0 }, { ...specFromRecipe(original), regionId: "retired-region" }, { ...specFromRecipe(original), clean: { cleanMode: "yes" } }]) {
      assert.equal(shareSpecMatchesRecipe(invalid, original), false);
    }
    assert.equal(shareSpecMatchesRecipe(specFromRecipe(original), {} as Recipe), false);
  });
});

describe("complete classic recipe exclusions", () => {
  it("rejects a recorded allergen in the base recipe even without a random seed", () => {
    assert.throws(() => generateRecipe({ classicId: "pasta", regionId: "japanese", servings: 2, avoidAllergens: ["soy"] }), /recorded allergen soy/);
    assert.throws(() => generateRecipe({ classicId: "pasta", regionId: "japanese", servings: 2, seed: 3, avoidAllergens: ["soy"] }), /recorded allergen soy/);
  });

  it("checks hard dislikes against the full base and aliases, with and without a seed", () => {
    for (const seed of [undefined, 3]) {
      assert.throws(() => generateRecipe({ classicId: "pasta", regionId: "japanese", servings: 2, seed, dislikes: ["mushroom"] }), /hard dislike/);
    }
    assert.throws(() => generateRecipe({ classicId: "pasta", regionId: "japanese", servings: 2, dislikes: [null] } as unknown as Parameters<typeof generateRecipe>[0]), /List up to 40 dislikes/);
  });
});
