import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MEAL_REGIONS, MAIN_INGREDIENTS, MEAL_SIDES, generateMeal } from "../lib/meals.ts";
import { PLATES } from "../lib/plates.ts";
import { REGIONS, generateRecipe } from "../lib/recipes.ts";
import { coveredStapleRegions, staplesFor } from "../lib/staples.ts";

describe("regional staples", () => {
  it("covers every classic and meal region, and gluten-free staples do not list wheat", () => {
    const ids = new Set(coveredStapleRegions());
    for (const region of [...REGIONS, ...MEAL_REGIONS]) {
      assert.ok(ids.has(region.id), region.id);
      const staples = staplesFor(region.id, { glutenFree: false, dairyFree: false });
      assert.ok(staples.length > 0, region.id);
      const gf = staplesFor(region.id, { glutenFree: true, dairyFree: true });
      assert.ok(gf.every((item) => !item.allergens.some((allergen) => ["wheat", "barley", "rye"].includes(allergen))), region.id);
    }
  });

  it("specialises existing rice while keeping complete classic plates to their chosen starch", () => {
    const grainRice = (id: string) => /rice/i.test(id) && !/vinegar|miso|flour|noodle|vermicelli|paper/i.test(id);
    const pasta = generateRecipe({ classicId: "pasta", regionId: "japanese", servings: 4 });
    assert.ok(pasta.ingredients.some((item) => item.id === "pasta"));
    assert.equal(pasta.ingredients.filter((item) => grainRice(item.id)).length, 0);
    const tacos = generateRecipe({ classicId: "tacos", regionId: "mexican", servings: 4 });
    assert.equal(tacos.ingredients.filter((item) => item.id === "corn-tortillas").length, 1);
    assert.ok(!tacos.ingredients.some((item) => item.id === "pinto-beans" || item.id === "mexican-rice"));
    const meal = generateMeal({ mainId: "salmon", methodId: "grilled", regionId: "japanese", sideId: "rice-greens", servings: 4 });
    const rice = meal.ingredients.filter((item) => grainRice(item.id));
    assert.equal(rice.length, 1);
    assert.match(rice[0].name, /short-grain/i);
    assert.ok(meal.steps.some((step) => step.detail.includes(rice[0].name)));
    const skewers = generateRecipe({ classicId: "grilled-skewers", regionId: "japanese-yakitori", servings: 4 });
    const skewerRice = skewers.ingredients.filter((item) => grainRice(item.id));
    assert.equal(skewerRice.length, 1);
    assert.match(skewerRice[0].name, /short-grain/i);
    const links = generateRecipe({ classicId: "bbq-sausages", regionId: "texas-bbq", servings: 4, diet: "vegan", constraints: { glutenFree: true } });
    assert.ok(!links.allergens.includes("wheat"));
    assert.ok(links.ingredients.some((item) => /gluten-free plant-based sausages/i.test(item.name)));
  });

  it("names 100% teff injera without a wheat tag, and keeps gluten-free Indian plates wheat-free", () => {
    const injeraMeal = generateMeal({ mainId: "lentils", methodId: "braised", regionId: "ethiopian", sideId: "injera-salad", servings: 4, diet: "vegan" });
    const injera = injeraMeal.ingredients.find((item) => item.id === "injera");
    assert.ok(injera);
    assert.match(injera.name, /100% teff/);
    assert.deepEqual(injera.allergens, []);
    assert.ok(injeraMeal.steps.some((step) => step.detail.includes(injera.name) && /wheat or barley/i.test(step.detail)));
    const indian = generateMeal({ mainId: "chicken", methodId: "curry", regionId: "indian", sideId: "rice-greens", servings: 4, diet: "gluten-free" });
    assert.ok(!indian.allergens.includes("wheat"));
    assert.ok(indian.ingredients.some((item) => /basmati/i.test(item.name)));
    assert.ok(!indian.ingredients.some((item) => /flatbread|chapati/i.test(item.name)));
  });

  it("maps plancha almonds to tree-nut and keeps every curated plate compatible", () => {
    const plancha = generateRecipe({ classicId: "pasta", regionId: "spanish-plancha", servings: 4 });
    assert.ok(plancha.allergens.includes("tree-nut"));
    assert.ok(!plancha.allergens.includes("tree nuts"));
    const regions = new Set(MEAL_REGIONS.map((region) => region.id));
    for (const plate of PLATES) {
      assert.ok(regions.has(plate.regionId), plate.regionId);
      const main = MAIN_INGREDIENTS.find((item) => item.id === plate.mainId);
      assert.ok(main, plate.mainId);
      assert.ok(main.methodIds.includes(plate.methodId), `${plate.mainId} ${plate.methodId}`);
      assert.ok(MEAL_SIDES.some((side) => side.id === plate.sideId));
    }
    const plateRegions = new Set(PLATES.map((plate) => plate.regionId));
    assert.equal(plateRegions.size, 20);
    assert.ok(MEAL_REGIONS.length > plateRegions.size);
    assert.ok([...plateRegions].every((id) => regions.has(id)));
  });
});
