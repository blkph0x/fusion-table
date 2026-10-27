import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessRecipeQuality, assertRecipeQuality } from "../lib/recipe-quality.ts";
import { generateRecipe } from "../lib/recipes.ts";
import { generateMeal } from "../lib/meals.ts";
import type { Recipe } from "../lib/recipe-types.ts";

const base = () => generateRecipe({ classicId: "pasta", regionId: "italian", servings: 4 });
const codes = (recipe: Recipe) => assessRecipeQuality(recipe).issues.map(issue => issue.code);

describe("independent recipe quality postconditions", () => {
  it("accepts a separately finished sauce before a long main cook", () => {
    const recipe = generateRecipe({ classicId: "bbq-sausages", regionId: "japanese", servings: 4 });
    assert.equal(assessRecipeQuality(recipe).passed, true);
    const finish = recipe.steps.findIndex(step => step.finishBoundary);
    assert.ok(finish >= 0);
    assert.ok(recipe.steps.slice(finish + 1).some(step => (step.minutes ?? 0) > 20));
  });
  it("rejects explicit prolonged reheating of already finished sauce", () => {
    const recipe = base();
    recipe.steps = [{ title: "Finish", detail: "Stir in fresh herbs.", finishBoundary: true }, { title: "Cook", detail: "Return the finished sauce to the pan and simmer for 45 minutes.", minutes: 45 }];
    assert.ok(codes(recipe).includes("long-cook-after-finish"));
    assert.throws(() => assertRecipeQuality(recipe), /cooking review/);
  });
  it("rejects hidden invalid portions, duplicate identities and irreconcilable times", () => {
    const recipe = base();
    recipe.ingredients.push({ ...recipe.ingredients[0], amount: Number.NaN });
    recipe.totalMinutes = 0;
    assert.ok(codes(recipe).includes("duplicate-ingredient-id"));
    assert.ok(codes(recipe).includes("invalid-portion"));
    assert.ok(codes(recipe).includes("inconsistent-time"));
  });
  it("rejects raw kidney beans and unspecified cassava forms while accepting prepared forms", () => {
    const recipe = base();
    const ingredient = { ...recipe.ingredients[0], id: "test-beans", name: "Raw dried kidney beans", amount: 100, unit: "g" };
    recipe.ingredients = [ingredient];
    assert.ok(codes(recipe).includes("raw-kidney-beans"));
    ingredient.name = "Canned cooked kidney beans";
    assert.ok(!codes(recipe).includes("raw-kidney-beans"));
    ingredient.name = "Cassava";
    ingredient.notes = "";
    assert.ok(codes(recipe).includes("unverified-cassava-form"));
    ingredient.notes = "Commercially processed fully cooked pieces";
    assert.ok(!codes(recipe).includes("unverified-cassava-form"));
  });
  it("checks actual bean-filled shells and delicate liver rather than just meat cases", () => {
    const shells = generateRecipe({ classicId: "shotgun-shells", regionId: "thai", diet: "vegan", servings: 4 });
    const beans = shells.ingredients.find(item => item.id === "cannellini-beans")!;
    assert.ok(beans);
    beans.amount = 5000;
    assert.ok(codes(shells).includes("overfilled-open-shells"));
    const liver = base();
    liver.ingredients[0].name = "Chicken liver";
    liver.steps = [{ title: "Braise gently", detail: "Simmer.", minutes: 60 }];
    assert.ok(codes(liver).includes("liver-long-braise"));
  });
  it("distinguishes review warnings from broken recipes and never claims a taste probability", () => {
    const recipe = base();
    recipe.ingredients = [{ ...recipe.ingredients[0], name: "Dry rice", amount: 1000, unit: "g" }];
    const result = assessRecipeQuality(recipe);
    assert.equal(result.passed, true);
    assert.equal(result.score, 95);
    assert.equal(result.issues[0].severity, "warning");
    assertRecipeQuality(recipe);
  });
  it("retains postconditions after seed, serving and cleaner settings", () => {
    for (const servings of [1, 4, 12]) for (const regionId of ["thai", "italian", "japanese"]) {
      const recipe = generateMeal({ mainId: "chicken", methodId: "schnitzel", regionId, sideId: "rice-greens", servings, seed: servings * 83, clean: { moreVegetables: true } });
      assert.equal(assessRecipeQuality(recipe).passed, true, recipe.id);
    }
  });
});
