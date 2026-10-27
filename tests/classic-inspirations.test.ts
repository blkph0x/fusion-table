import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLASSIC_INSPIRATIONS, classicInspirationSpec, openClassicInspiration } from "../lib/classic-inspirations.ts";
import { cookingRecipeKey } from "../lib/recipe-identity.ts";
import { decodeShare, encodeShare, recipeFromShare, shareSpecMatchesRecipe } from "../lib/share-recipe.ts";

describe("featured classic cards open the displayed recipe", () => {
  it("uses identical classic, region, diet, servings and heat for each card, image token and opened recipe", () => {
    for (const item of CLASSIC_INSPIRATIONS) {
      const imageSpec = decodeShare(encodeShare(classicInspirationSpec(item)));
      const opened = openClassicInspiration(item);
      assert.deepEqual(opened.spec, imageSpec);
      assert.equal(opened.recipe.title, item.title);
      for (const field of ["classicId", "regionId", "diet", "servings", "spiceHeat"] as const) assert.equal(opened.recipe[field], item[field], `${item.title}: ${field}`);
      assert.equal(cookingRecipeKey(opened.recipe), cookingRecipeKey(recipeFromShare(imageSpec)));
      assert.equal(shareSpecMatchesRecipe(opened.spec, opened.recipe), true);
    }
  });

  it("opens a fixed unseeded template without household remixes or extra finishes", () => {
    for (const item of CLASSIC_INSPIRATIONS) {
      const first = openClassicInspiration(item);
      const second = openClassicInspiration(item);
      assert.deepEqual(first, second);
      assert.equal(first.spec.seed, undefined);
      assert.equal(first.spec.clean, undefined);
      assert.equal(first.spec.cookPace, undefined);
      assert.equal(first.recipe.cookPace, undefined);
      assert.doesNotMatch(first.recipe.id, /-sat-|\bpace-/);
      assert.ok(first.recipe.steps.every((step) => !/seeded SAT|seeded search/.test(step.detail)));
    }
  });
});
