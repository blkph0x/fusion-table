import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planWeek } from "../lib/planner.ts";
import { generateRecipe } from "../lib/recipes.ts";

describe("fusion week planner", () => {
  it("fills seven different dinners and does not invent a price", () => {
    const week = planWeek({ days: 7, servings: 4 });
    assert.equal(week.days.length, 7);
    assert.deepEqual(week.unfilledDays, []);
    const keys = week.days.map((day) => `${day.recipe?.classicId}:${day.recipe?.regionId}`);
    assert.equal(new Set(keys).size, 7);
    assert.equal(new Set(week.days.map((day) => day.recipe?.classicId)).size, 7);
    assert.ok(week.days.some((day) => day.recipe?.kind === "meal"));
    assert.ok(week.days.some((day) => day.recipe?.kind !== "meal"));
    assert.ok(week.days.every((day) => day.recipe?.sourceLabel === "Template-generated · not kitchen-tested"));
    assert.ok(week.notes.some((note) => note.includes("not a live model")));
    assert.ok(week.notes.some((note) => note.includes("not a purchase total")));
    assert.ok(week.shopping.length > 0);
    assert.ok(week.shopping.every((line) => line.amount > 0 && !("price" in line)));
  });

  it("stacks vegan and gluten-free without wheat, milk, egg, or oats", () => {
    const week = planWeek({ days: 7, servings: 2, diet: "vegan", constraints: { glutenFree: true }, avoidAllergens: ["wheat"] });
    assert.deepEqual(week.unfilledDays, []);
    for (const day of week.days) {
      const recipe = day.recipe!;
      assert.ok(!recipe.allergens.includes("wheat"), recipe.id);
      assert.ok(!recipe.allergens.includes("milk"), recipe.id);
      assert.ok(!recipe.allergens.includes("egg"), recipe.id);
      assert.ok(!recipe.allergens.includes("oats"), recipe.id);
      assert.ok(recipe.ingredients.every((item) => !["butcher", "fishmonger"].includes(item.category)), recipe.id);
    }
  });

  it("does not relax a sesame filter or a hard dislike, and leaves an unsafe lock empty", () => {
    const sesame = planWeek({ days: 7, servings: 4, avoidAllergens: ["sesame"] });
    assert.ok(sesame.days.every((day) => !day.recipe?.allergens.includes("sesame")));
    assert.ok(sesame.days.every((day) => !["japanese", "korean", "levantine"].includes(day.recipe?.regionId || "")));
    const chilli = planWeek({ days: 3, servings: 4, dislikes: ["chilli", "mushroom"] });
    assert.ok(chilli.days.every((day) => day.recipe?.ingredients.every((item) => !/chilli|mushroom/i.test(item.name))));
    const locked = planWeek({
      days: 2, servings: 4, avoidAllergens: ["sesame"],
      locks: [{ day: 1, classicId: "pasta", regionId: "japanese" }],
    });
    assert.equal(locked.days[0].recipe, null);
    assert.match(locked.days[0].reason || "", /not replaced/);
    assert.ok(locked.days[1].recipe);
    assert.notEqual(locked.days[1].recipe?.regionId, "japanese");
  });

  it("uses gluten-free burger mix without oats and egg-free fried rice without eggs", () => {
    const burger = generateRecipe({ classicId: "burgers", regionId: "indian", servings: 4, diet: "vegetarian", constraints: { glutenFree: true } });
    assert.ok(!burger.ingredients.some((item) => item.id === "rolled-oats"));
    assert.ok(!burger.steps.some((step) => /mix in the oats/i.test(step.detail)));
    const rice = generateRecipe({ classicId: "fried-rice", regionId: "thai", servings: 4, constraints: { eggFree: true } });
    assert.ok(rice.ingredients.some((item) => item.id === "firm-tofu"));
    assert.ok(!rice.allergens.includes("egg"));
    assert.ok(!rice.steps.some((step) => /\beggs\b/i.test(step.detail)));
  });

  it("keeps pantry matches off the merged list and refuses to drop every filter", () => {
    const week = planWeek({ days: 2, servings: 4, pantry: "garlic, olive oil" });
    assert.ok(week.shopping.every((line) => line.id !== "garlic" && line.id !== "olive-oil"));
    const blocked = planWeek({ days: 7, servings: 4, dislikes: ["garlic"] });
    assert.deepEqual(blocked.unfilledDays, [1, 2, 3, 4, 5, 6, 7]);
    assert.ok(blocked.notes.some((note) => note.includes("Hard filters stay in place")));
    assert.equal(blocked.shopping.length, 0);
  });

  it("rejects an unknown allergen and an unbounded week", () => {
    assert.throws(() => planWeek({ days: 7, servings: 4, avoidAllergens: ["mystery"] }));
    assert.throws(() => planWeek({ days: 0, servings: 4 }));
    assert.throws(() => planWeek({ days: 15, servings: 4 }));
    assert.throws(() => planWeek({ days: 7, servings: 4, locks: [{ day: 8, classicId: "pasta", regionId: "thai" }] }));
  });
});
