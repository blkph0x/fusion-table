import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateRecipe } from "../lib/recipes.ts";
import { generateMeal } from "../lib/meals.ts";

describe("classic preparation and final assembly", () => {
  it("serves hot stuffed shells with slaw and one starch", () => {
    for (const seed of [651244, 1]) for (const servings of [2, 3, 6]) {
      const recipe = generateRecipe({ classicId: "shotgun-shells", regionId: "korean-bbq", seed, diet: "balanced", servings, spiceHeat: "medium" });
      const finish = recipe.steps.at(-1)!;
      const previous = recipe.steps.slice(0, -1).map((step) => step.detail).join(" ");
      assert.match(previous, /75°C/);
      assert.doesNotMatch(previous, /serve promptly|serve immediately|serve straightaway/i);
      assert.ok(!recipe.steps.some((step) => step.title === "Prepare the regional staple"));
      assert.ok(!recipe.ingredients.some((item) => item.id === "short-grain-rice"));
      assert.ok(recipe.ingredients.some((item) => item.id === "jumbo-shells"));
      assert.ok(!recipe.ingredients.some((item) => item.id === "bbq-buns"));
      assert.ok(recipe.ingredients.some((item) => item.id === "cabbage"));
      assert.doesNotMatch(finish.detail, /\bSAT\b|P versus NP|satisfying assignment/);
      assert.doesNotMatch(finish.detail, /until cold|chill the main|cold stir-fry/);
      assert.doesNotMatch(recipe.title, /cold|wraps|stir-fry|as plated/i);
    }
  });

  it("does not add a second cooking step when an existing rice is only renamed", () => {
    const recipe = generateRecipe({ classicId: "grilled-skewers", regionId: "japanese-yakitori", servings: 2 });
    assert.ok(recipe.ingredients.some((item) => item.id === "short-grain-rice"));
    assert.ok(!recipe.steps.some((step) => step.title === "Prepare the regional staple"));
    assert.ok(recipe.steps.some((step) => /rice/i.test(step.detail)));
  });

  it("keeps a chickpea curry free of random secondary proteins and phantom seafood cooking steps", () => {
    const recipe = generateMeal({ mainId: "chickpeas", methodId: "curry", regionId: "thai", sideId: "rice-greens", servings: 2, seed: 16 });
    assert.ok(recipe.ingredients.some((item) => /chickpea/i.test(item.name)));
    assert.ok(recipe.ingredients.every((item) => !["sat-prawns", "sat-fish", "sat-tofu"].includes(item.id)));
    assert.equal(recipe.methodId, "curry");
    assert.doesNotMatch(recipe.title, /cooked peeled prawns|cold stir-fry|as plated/i);
    const finish = recipe.steps.at(-1)!.detail;
    assert.doesNotMatch(finish, /Cook the added prawns|cooked seafood additions|peeled prawns|until cold/);
    assert.doesNotMatch(finish, /Cook the added fish/, "bottled fish sauce must not create phantom raw fish to cook");
  });
});
