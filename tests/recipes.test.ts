import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLASSICS, DIETS, REGIONS, formatIngredientAmount, generateRecipe, parsePantry } from "../lib/recipes.ts";
import type { DietId, SpiceHeat } from "../lib/recipe-types.ts";
const ORIGINAL_CLASSICS = new Set(["pasta", "tacos", "risotto", "burgers", "roast", "fried-rice", "flatbread", "cottage-pie"]);

describe("fusion recipe engine", () => {
  it("produces complete, bounded recipes for every authored classic, region and dietary preference", () => {
    for (const classic of CLASSICS) for (const region of REGIONS) for (const diet of DIETS) {
      const recipe = generateRecipe({ classicId: classic.id, regionId: region.id, servings: 4, diet: diet.id as DietId });
      assert.ok(recipe.ingredients.length >= 8, recipe.id);
      assert.ok(recipe.steps.length >= 4, recipe.id);
      assert.ok(recipe.steps.every((step) => step.title && step.detail), recipe.id);
      assert.equal(new Set(recipe.ingredients.map((item) => item.id)).size, recipe.ingredients.length, recipe.id);
      assert.ok(recipe.ingredients.every((item) => Number.isFinite(item.amount) && item.amount > 0), recipe.id);
      assert.ok(recipe.totalMinutes > 0, recipe.id);
      assert.equal(recipe.sourceLabel, "Template-generated · not kitchen-tested");
      if (["vegan", "vegetarian"].includes(diet.id)) assert.ok(recipe.ingredients.every((item) => !["butcher", "fishmonger"].includes(item.category)), recipe.id);
      if (["vegan", "dairy-free"].includes(diet.id)) assert.ok(!recipe.allergens.includes("milk"), recipe.id);
      if (diet.id === "vegan") assert.ok(!recipe.allergens.includes("egg"), recipe.id);
      if (diet.id === "gluten-free") assert.ok(!recipe.allergens.includes("wheat"), recipe.id);
      // The original animal recipes use poultry/mince. Whole BBQ cuts and fish
      // have separate, cut-specific endpoint checks in bbq-recipes.test.ts.
      if (ORIGINAL_CLASSICS.has(classic.id) && recipe.ingredients.some((item) => item.category === "butcher")) {
        assert.ok(recipe.steps.some((step) => step.detail.includes("75°C")), recipe.id);
        assert.ok(recipe.safetySource?.startsWith("https://www.foodstandards.gov.au/"));
      }
    }
  });

  it("scales every ingredient from one through twelve servings without changing the method's safety endpoint", () => {
    for (const servings of [1, 2, 4, 8, 12]) {
      const original = generateRecipe({ classicId: "tacos", regionId: "japanese", servings: 4 });
      const scaled = generateRecipe({ classicId: "tacos", regionId: "japanese", servings });
      for (const item of original.ingredients) {
        const actual = scaled.ingredients.find((candidate) => candidate.id === item.id)!;
        assert.ok(Math.abs(actual.amount - item.amount * servings / 4) < 0.0001);
      }
      assert.ok(scaled.steps.some((step) => step.detail.includes("75°C")));
    }
  });

  it("uses actual substitutes in methods and does not ask a vegan to cook chicken, beef or eggs", () => {
    for (const classic of CLASSICS) {
      const recipe = generateRecipe({ classicId: classic.id, regionId: "thai", diet: "vegan", servings: 4 });
      const instructions = recipe.steps.map((step) => step.detail).join(" ");
      assert.ok(!/\b(chicken|beef|eggs|milk|cream|butter)\b/i.test(instructions.replaceAll("coconut milk", "plant liquid").replaceAll("soy milk", "plant liquid")), classic.id);
    }
  });

  it("requires exact pantry matches and keeps unsuitable dairy or gluten substitutions unmarked", () => {
    assert.deepEqual([...parsePantry("  garlic, Olive Oil; lime\nGARLIC")], ["garlic", "olive oil", "lime"]);
    const recipe = generateRecipe({ classicId: "pasta", regionId: "japanese", diet: "vegan", servings: 4, pantry: "garlic, olive oil, milk, butter, mushrooms" });
    assert.equal(recipe.ingredients.find((item) => item.id === "garlic")?.inPantry, true);
    assert.equal(recipe.ingredients.find((item) => item.id === "olive-oil")?.inPantry, true);
    assert.equal(recipe.ingredients.find((item) => item.id === "coconut-milk")?.inPantry, false);
    const gf = generateRecipe({ classicId: "pasta", regionId: "korean", diet: "gluten-free", servings: 4, pantry: "pasta, gochujang, soy sauce" });
    assert.equal(gf.ingredients.find((item) => item.id === "pasta")?.inPantry, false);
    assert.equal(gf.ingredients.find((item) => item.id === "gochujang")?.inPantry, false);
    assert.equal(gf.ingredients.find((item) => item.id === "soy-sauce")?.inPantry, false);
    const gfMiso = generateRecipe({ classicId: "pasta", regionId: "japanese", diet: "gluten-free", servings: 4, pantry: "white miso, miso" });
    assert.equal(gfMiso.ingredients.find((item) => item.id === "miso")?.inPantry, false);
  });

  it("reduces chilli paste for mild and increases it for hot", () => {
    for (const region of ["korean", "thai", "moroccan"]) {
      const mild = generateRecipe({ classicId: "tacos", regionId: region, servings: 4, spiceHeat: "mild" });
      const hot = generateRecipe({ classicId: "tacos", regionId: region, servings: 4, spiceHeat: "hot" });
      const id = region === "korean" ? "gochujang" : region === "thai" ? "red-curry-paste" : "harissa";
      assert.ok(mild.ingredients.find((item) => item.id === id)!.amount < hot.ingredients.find((item) => item.id === id)!.amount);
      assert.ok(mild.dietaryNotes.some((note) => note.includes("Mild")));
      const gentle = generateRecipe({ classicId: "tacos", regionId: region, servings: 4, spiceHeat: "gentle" });
      const fiery = generateRecipe({ classicId: "tacos", regionId: region, servings: 4, spiceHeat: "fiery" });
      assert.ok(gentle.ingredients.find((item) => item.id === id)!.amount < mild.ingredients.find((item) => item.id === id)!.amount);
      assert.ok(hot.ingredients.find((item) => item.id === id)!.amount < fiery.ingredients.find((item) => item.id === id)!.amount);
    }
    assert.throws(() => generateRecipe({ classicId: "tacos", regionId: "korean", servings: 4, spiceHeat: "extra" as SpiceHeat }));
  });

  it("rejects unknown selections and unbounded or fractional servings", () => {
    const base = { classicId: "pasta", regionId: "japanese", servings: 4 };
    for (const servings of [0, -1, 1.5, 13, NaN, Infinity]) assert.throws(() => generateRecipe({ ...base, servings }));
    assert.throws(() => generateRecipe({ ...base, classicId: "unknown" }));
    assert.throws(() => generateRecipe({ ...base, regionId: "unknown" }));
    assert.throws(() => generateRecipe({ ...base, diet: "unknown" as DietId }));
    assert.throws(() => generateRecipe({ ...base, pantry: [1] as unknown as string[] }));
  });

  it("formats small and fractional quantities without dropping units", () => {
    assert.equal(formatIngredientAmount(0.25, "tsp"), "0.25 tsp");
    assert.equal(formatIngredientAmount({ amount: 500, unit: "g" }), "500 g");
    assert.equal(formatIngredientAmount(2), "2");
    assert.equal(formatIngredientAmount(NaN, "g"), "");
  });
});
