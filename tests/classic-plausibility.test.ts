import assert from "node:assert/strict";
import { test } from "node:test";
import { generateRecipe, REGIONS } from "../lib/recipes.ts";
import { generateMeal } from "../lib/meals.ts";
import { encodeShare, decodeShare, specFromRecipe, recipeFromShare } from "../lib/share-recipe.ts";
import type { DietId, Recipe } from "../lib/recipe-types.ts";

const diets: DietId[] = ["balanced", "vegetarian", "vegan", "gluten-free", "dairy-free"];
const extras = (recipe: Recipe) => recipe.ingredients.filter((item) => item.id.startsWith("sat-"));

test("stuffed shells have feasible portions and one starch, with moist packet-cooked pasta", () => {
  let checked = 0;
  for (const region of REGIONS) for (const diet of diets) for (const servings of [1, 4, 12]) {
    const recipe = generateRecipe({ classicId: "shotgun-shells", regionId: region.id, diet, servings, seed: 7 });
    const shells = recipe.ingredients.find((item) => item.id === "jumbo-shells")!;
    const filling = recipe.ingredients.find((item) => ["sausage-meat", "cannellini-beans"].includes(item.id))!;
    const onion = recipe.ingredients.find((item) => item.id === "brown-onion")!;
    assert.equal(shells.amount, servings * 5, recipe.id);
    assert.ok((filling.amount + onion.amount) / shells.amount <= 35, recipe.id);
    assert.ok(!recipe.ingredients.some((item) => ["bbq-buns", "bbq-rice", "bbq-flatbread", "long-grain-rice", "potatoes"].includes(item.id)), recipe.id);
    assert.ok(!shells.aliases?.some((alias) => /cannelloni/.test(alias)), recipe.id);
    assert.match(recipe.steps.find((step) => step.title === "Soften the shells")!.detail, /al dente using their packet timing/);
    const fill = recipe.steps.find((step) => step.title === "Fill the shells")!;
    assert.ok(fill.detail.includes(`${servings * 25} ml hot water`), recipe.id);
    assert.match(fill.detail, /opening-up.*cover the dish tightly/);
    const heat = recipe.steps.find((step) => step.title === "Hot-smoke the shells")!;
    assert.match(heat.detail, /covered dish/);
    assert.match(heat.detail, /Uncover for only/);
    if (["balanced", "gluten-free", "dairy-free"].includes(diet)) assert.match(heat.detail, /75°C.*continue covered if needed/);
    assert.ok(!recipe.steps.some((step) => step.title === "Warm the buns"), recipe.id);
    checked++;
  }
  assert.equal(checked, REGIONS.length * diets.length * 3);
});

test("cottage-pie estimate covers its serial filling, oven and resting stages", () => {
  for (const region of REGIONS) for (const diet of diets) {
    const recipe = generateRecipe({ classicId: "cottage-pie", regionId: region.id, diet, servings: 4 });
    const serialMinutes = diet === "vegetarian" || diet === "vegan" ? 6 + 3 + 12 + 25 + 5 : 6 + 8 + 12 + 25 + 5;
    assert.ok(recipe.cookMinutes >= serialMinutes, recipe.id);
    assert.equal(recipe.totalMinutes, recipe.prepMinutes + recipe.cookMinutes);
  }
});

test("BBQ cooking estimates include required rest after the timed heat stages", () => {
  for (const [classicId, minimum] of [["grill-roasted-whole-chicken", 125], ["smoked-meatloaf", 100], ["smoked-brisket", 385], ["bbq-pulled-protein", 440]] as const) {
    const recipe = generateRecipe({ classicId, regionId: "japanese", servings: 4 });
    assert.ok(recipe.cookMinutes >= minimum, `${classicId}: ${recipe.cookMinutes}`);
  }
});

test("burnt ends finish delicate sauce only after the final pan cook, for every profile and diet", () => {
  for (const region of REGIONS) for (const diet of diets) for (const servings of [2, 4]) {
    const recipe = generateRecipe({ classicId: "burnt-ends", regionId: region.id, diet, servings, seed: 42 });
    const main = recipe.steps.findIndex((step) => ["Cube and finish in the pan", "Smoke, then finish in a pan"].includes(step.title));
    const base = recipe.steps.findIndex((step) => step.title === "Cook the regional sauce separately");
    const finish = recipe.steps.findIndex((step) => step.finishBoundary);
    assert.ok(main >= 0 && base >= 0 && finish > Math.max(main, base), recipe.id);
    assert.match(recipe.steps[finish].detail, /off the heat/);
    assert.match(recipe.steps[finish].detail, /do not return the finished sauce to the long pan cook/);
    assert.equal(recipe.steps.filter((step) => step.finishBoundary).length, 1);
    if (["balanced", "gluten-free", "dairy-free"].includes(diet)) {
      assert.match(recipe.steps[main].detail, /reserving its delicate finishing ingredients/);
      assert.match(recipe.steps[main].detail, /90–96°C/);
      assert.ok(recipe.cookMinutes >= (servings < 4 ? 285 : 345));
    }
  }
});

test("seeded fast mains prepare additions before cooking and retain final fresh service", () => {
  let checked = 0;
  for (const methodId of ["schnitzel", "patties", "pan-fried", "grilled", "stir-fried", "air-fried"]) for (const seed of [1, 7, 16, 42]) {
    const recipe = generateMeal({ mainId: "chicken", methodId, regionId: "thai", sideId: "rice-greens", servings: 2, seed });
    if (!extras(recipe).length) continue;
    const prepare = recipe.steps.findIndex((step) => step.title === "Prepare the finishing ingredients");
    const main = recipe.steps.findIndex((step) => ["Shallow-fry until crisp", "Cook the patties", "Pan-fry the main", "Grill the main", "Stir-fry the main", "Air-fry in batches"].includes(step.title));
    const finish = recipe.steps.findIndex((step) => step.finishBoundary);
    assert.ok(prepare >= 0 && prepare < main && main < finish, recipe.id);
    assert.match(recipe.steps[prepare].detail, /before starting the main's final cooking step/);
    assert.match(recipe.steps[main].detail, /75°C/);
    assert.doesNotMatch(recipe.steps.at(-1)!.detail, /Wash|3–5 minutes|Cook in a separate pan/);
    assert.equal(recipe.steps[prepare].minutes, 8);
    for (const item of extras(recipe)) {
      const portion = `${item.amount}${item.unit ? ` ${item.unit}` : ""} ${item.name}`;
      assert.equal(recipe.steps.map((step) => step.detail).join(" ").split(portion).length - 1, 1);
    }
    checked++;
  }
  assert.ok(checked >= 12, String(checked));
});

test("slow-cook additions overlap the final cooking minutes instead of waiting for the hot main", () => {
  const recipe = generateMeal({ mainId: "beef", methodId: "braised", regionId: "japanese", sideId: "rice-greens", servings: 4, seed: 42 });
  assert.ok(extras(recipe).length);
  const prepare = recipe.steps.find((step) => step.title === "Prepare the finishing ingredients")!;
  assert.match(prepare.detail, /During the final 8 minutes of the main's cooking or its stated rest/);
  assert.doesNotMatch(prepare.detail, /After the main has reached/);
  assert.deepEqual(recipeFromShare(decodeShare(encodeShare(specFromRecipe(recipe)))), recipe);
});
