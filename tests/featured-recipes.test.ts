import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openFeaturedRecipe } from "../lib/featured-recipes.ts";
import { buildHomeDiscover } from "../lib/home-suggestions.ts";
import { cookingRecipeKey } from "../lib/recipe-identity.ts";
import { encodeShare, recipeFromShare, specFromRecipe } from "../lib/share-recipe.ts";

describe("Discover opens the exact featured plate", () => {
  it("keeps Tonight's Ideas unchanged instead of applying another household recipe", () => {
    const discover = buildHomeDiscover({ loadSeed: 17, weekSeed: 42, suggestionCount: 6 });
    assert.equal(discover.suggestions.length, 6);
    for (const item of discover.suggestions) {
      const opened = openFeaturedRecipe(item.recipe, item.shareToken);
      assert.equal(opened.recipe, item.recipe, "Opening must preserve the displayed snapshot");
      assert.equal(opened.recipe.title, item.title);
      assert.equal(opened.recipe.servings, 2);
      assert.equal(opened.recipe.spiceHeat, "medium");
      assert.deepEqual(opened.recipe.ingredients, item.recipe.ingredients);
      assert.equal(cookingRecipeKey(recipeFromShare(opened.spec)), cookingRecipeKey(item.recipe));
      assert.equal(opened.spec.seed, undefined);
      assert.equal(opened.spec.clean, undefined);
    }
  });

  it("keeps the Meal of the Week's visible servings, diet and original cooking content", () => {
    const pick = buildHomeDiscover({ loadSeed: 17, weekSeed: 42 }).mealOfWeek;
    const token = encodeShare(specFromRecipe(pick.recipe));
    const opened = openFeaturedRecipe(pick.recipe, token);
    assert.equal(opened.recipe.title, pick.title);
    assert.equal(opened.recipe.servings, pick.recipe.servings);
    assert.equal(opened.recipe.diet, pick.recipe.diet);
    assert.deepEqual(opened.recipe.steps, pick.recipe.steps);
    assert.equal(cookingRecipeKey(recipeFromShare(opened.spec)), cookingRecipeKey(pick.recipe));
    assert.deepEqual(openFeaturedRecipe(pick.recipe), opened);
  });

  it("rejects mismatched or invalid card tokens instead of opening a different dish", () => {
    const [first, second] = buildHomeDiscover({ loadSeed: 17, weekSeed: 42 }).suggestions;
    assert.throws(() => openFeaturedRecipe(first.recipe, second.shareToken), /could not be opened exactly/);
    assert.throws(() => openFeaturedRecipe(first.recipe, "invalid token"), /not a Fusion Table recipe/);
  });
});
