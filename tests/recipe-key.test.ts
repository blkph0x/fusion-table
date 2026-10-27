import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateMeal } from "../lib/meals.ts";
import { cookingRecipeKey } from "../lib/recipe-identity.ts";
import type { Recipe } from "../lib/recipe-types.ts";

const base = { mainId: "chicken", methodId: "grilled", regionId: "thai", sideId: "rice-greens", servings: 2 };

describe("cookbook cooking-content identity", () => {
  it("keeps distinct cleaner plates even when their legacy template ids match", () => {
    const fewerBottles = generateMeal({ ...base, clean: { fewerBottles: true } });
    const moreVegetables = generateMeal({ ...base, clean: { moreVegetables: true } });
    assert.equal(fewerBottles.id, moreVegetables.id);
    assert.notDeepEqual(fewerBottles.ingredients, moreVegetables.ingredients);
    assert.notEqual(cookingRecipeKey(fewerBottles), cookingRecipeKey(moreVegetables));
    assert.ok(cookingRecipeKey(fewerBottles).startsWith(`${fewerBottles.id}-content-v1-`));
  });

  it("distinguishes actual cuts and preparation when a snapshot carries a colliding id", () => {
    const brisket = generateMeal({ ...base, mainId: "beef", methodId: "braised", cutId: "beef-brisket" });
    const chuck = generateMeal({ ...base, mainId: "beef", methodId: "braised", cutId: "beef-chuck" });
    const importedWithSameId: Recipe = { ...chuck, id: brisket.id };
    assert.notEqual(cookingRecipeKey(brisket), cookingRecipeKey(importedWithSameId));
  });

  it("does not fork the same cooked recipe for pantry ticks, display copy or generation metadata", () => {
    const original = generateMeal({ ...base, seed: 42, clean: { pantryFirstClean: true, fewerBottles: true } });
    const relabelled: Recipe = {
      ...original, title: "Tonight's dinner", description: "My notes", fusionNote: "Presentation copy",
      tags: ["Favourite"], dietaryNotes: ["Personal display note"], cleanSummary: "Display summary",
      generationInput: undefined, cleanStats: undefined,
      ingredients: original.ingredients.map((item) => ({ ...item, inPantry: !item.inPantry, aliases: ["My shopping alias"] })),
    };
    assert.equal(cookingRecipeKey(relabelled), cookingRecipeKey(original));
    assert.equal(cookingRecipeKey(JSON.parse(JSON.stringify(original)) as Recipe), cookingRecipeKey(original));
  });

  it("ignores ingredient/equipment/allergen ordering but preserves the cooking sequence and quantities", () => {
    const original = generateMeal(base);
    const reordered: Recipe = {
      ...original,
      ingredients: original.ingredients.slice().reverse().map((item) => ({ ...item, allergens: item.allergens.slice().reverse() })),
      equipment: original.equipment.slice().reverse(), allergens: original.allergens.slice().reverse(),
    };
    assert.equal(cookingRecipeKey(reordered), cookingRecipeKey(original));
    assert.notEqual(cookingRecipeKey({ ...original, steps: original.steps.slice().reverse() }), cookingRecipeKey(original));
    assert.notEqual(cookingRecipeKey({ ...original, ingredients: original.ingredients.map((item, index) => index ? item : { ...item, amount: item.amount + 1 }) }), cookingRecipeKey(original));
  });
});
