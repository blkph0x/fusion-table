import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateMeal, MEAL_SIDES, MEAL_REGIONS, getMealCombinationCount } from "../lib/meals.ts";
import { buildSidePlan, preferredSidesForRegion, sideRegionCoverage } from "../lib/side-plans.ts";
import { PLATES } from "../lib/plates.ts";

describe("expanded side catalogue", () => {
  it("exposes ninety distinct sides and keeps combination maths honest", () => {
    assert.equal(MEAL_SIDES.length, 90);
    assert.equal(new Set(MEAL_SIDES.map((side) => side.id)).size, 90);
    assert.equal(getMealCombinationCount(), 1_744_200);
    assert.ok(MEAL_SIDES.every((side) => side.name && side.description && side.emoji));
  });

  it("builds every side for balanced, gluten-free and dairy-free without inventing prices", () => {
    for (const side of MEAL_SIDES) {
      for (const [gf, df] of [[false, false], [true, false], [false, true], [true, true]] as const) {
        const plan = buildSidePlan(side.id, gf, df, 4);
        assert.ok(plan.side.length > 2, side.id);
        assert.ok(plan.ingredients.length > 0, side.id);
        assert.ok(plan.steps.length >= 1, side.id);
        assert.ok(plan.minutes > 0, side.id);
        assert.ok(plan.ingredients.every((item) => Number.isFinite(item.amount) && item.amount > 0), side.id);
      }
      const meal = generateMeal({
        mainId: "chickpeas",
        methodId: "roasted",
        regionId: "home-kitchen",
        sideId: side.id,
        servings: 2,
        diet: "vegan",
      });
      assert.equal(meal.sideId, side.id);
      assert.ok(!("price" in (meal as object)));
      assert.equal(meal.sourceLabel, "Template-generated · not kitchen-tested");
    }
  });

  it("tags wheat and sesame sides clearly and substitutes under gluten-free", () => {
    const garlic = generateMeal({ mainId: "chicken", methodId: "baked", regionId: "italian", sideId: "garlic-bread", servings: 4 });
    assert.ok(garlic.allergens.includes("wheat") || garlic.ingredients.some((item) => item.allergens.includes("wheat")));
    const garlicGf = generateMeal({ mainId: "chicken", methodId: "baked", regionId: "italian", sideId: "garlic-bread", servings: 4, diet: "gluten-free" });
    assert.ok(!garlicGf.allergens.includes("wheat"));
    const sesame = generateMeal({ mainId: "tofu", methodId: "stir-fried", regionId: "japanese", sideId: "sesame-spinach", servings: 2, diet: "vegan" });
    assert.ok(sesame.allergens.includes("sesame") || sesame.ingredients.some((item) => item.allergens.includes("sesame")));
    const hummus = generateMeal({ mainId: "chickpeas", methodId: "baked", regionId: "levantine", sideId: "hummus-salad", servings: 2, diet: "vegan" });
    assert.ok(hummus.ingredients.some((item) => item.allergens.includes("sesame")));
  });

  it("covers meal regions with preferred sides and keeps curated plates on known sides", () => {
    const coverage = sideRegionCoverage();
    assert.ok(coverage.every((row) => row.regionCount > 0));
    for (const region of MEAL_REGIONS) {
      const preferred = preferredSidesForRegion(region.id);
      assert.ok(preferred.length > 0, region.id);
      assert.ok(preferred.every((id) => MEAL_SIDES.some((side) => side.id === id)), region.id);
    }
    for (const plate of PLATES) {
      assert.ok(MEAL_SIDES.some((side) => side.id === plate.sideId), `${plate.regionId}/${plate.sideId}`);
    }
    const used = new Set(PLATES.map((plate) => plate.sideId));
    assert.ok(used.size >= 18, `expected diversified plates, got ${used.size}`);
  });
});
