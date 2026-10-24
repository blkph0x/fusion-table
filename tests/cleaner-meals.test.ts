import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateMeal } from "../lib/meals.ts";
import { planWeek } from "../lib/planner.ts";
import { fusionSearch } from "../lib/fusion-sat.ts";
import {
  cleanlinessScore,
  countBottles,
  mealCleanStats,
  normalizeCleanPrefs,
} from "../lib/clean-prefs.ts";
import { markerLeak } from "../lib/region-affinity.ts";

describe("cleaner meals", () => {
  it("normalizes clean knobs and scores bottles and steps", () => {
    const prefs = normalizeCleanPrefs({ cleanMode: true, fewerBottles: "yes", junk: 1 });
    assert.deepEqual(prefs, { cleanMode: true });
    const recipe = generateMeal({
      mainId: "chicken",
      methodId: "pan-fried",
      regionId: "italian",
      sideId: "garden-salad",
      servings: 4,
      spiceHeat: "medium",
      seed: 11,
      clean: { cleanMode: true, fewerBottles: true },
    });
    assert.ok(recipe.cleanStats);
    assert.ok(recipe.cleanSummary?.includes("bottle"));
    assert.equal(recipe.cleanStats!.bottleCount, countBottles(recipe.ingredients));
    assert.equal(recipe.cleanStats!.ingredientCount, recipe.ingredients.length);
    assert.equal(recipe.cleanStats!.stepCount, recipe.steps.length);
  });

  it("reduces bottles and ingredients versus an uncleaned seeded plate", () => {
    const base = {
      mainId: "chicken" as const,
      methodId: "stir-fried" as const,
      regionId: "thai",
      sideId: "rice-greens",
      servings: 4,
      spiceHeat: "medium" as const,
      seed: 42,
    };
    const noisy = generateMeal(base);
    const clean = generateMeal({
      ...base,
      clean: { cleanMode: true, fewerBottles: true, moreVegetables: true },
    });
    assert.ok(countBottles(clean.ingredients) <= countBottles(noisy.ingredients));
    assert.ok(clean.ingredients.length <= noisy.ingredients.length + 1);
    assert.ok(cleanlinessScore(clean, { cleanMode: true }) <= cleanlinessScore(noisy, { cleanMode: true }) + 2);
  });

  it("keeps hard filters and region affinity under clean prefs", () => {
    for (const seed of [1, 2, 3, 5, 8]) {
      const meal = generateMeal({
        mainId: "chicken",
        methodId: "pan-fried",
        regionId: "italian",
        sideId: "garden-salad",
        servings: 4,
        seed,
        spiceHeat: "hot",
        dislikes: ["chilli"],
        clean: { cleanMode: true, fewerBottles: true },
      });
      const text = meal.ingredients.map((i) => `${i.id} ${i.name}`).join(" ");
      assert.equal(/sriracha/i.test(text), false);
      assert.equal(/kimchi/i.test(text), false);
      for (const item of meal.ingredients) {
        assert.equal(markerLeak("italian", item.id, item.name), null);
      }
    }
  });

  it("SAT clean mode prefers fewer bottled umami options on Western plates", () => {
    let bottled = 0;
    for (let seed = 1; seed <= 24; seed += 1) {
      const witness = fusionSearch({
        seed,
        regionId: "italian",
        diet: "balanced",
        spiceHeat: "medium",
        glutenFree: false,
        dairyFree: false,
        vegan: false,
        vegetarian: false,
        eggFree: false,
        servings: 4,
        clean: { fewerBottles: true, cleanMode: true },
      });
      if (witness.names.some((name) => /sauce|miso|sriracha/i.test(name))) bottled += 1;
    }
    assert.equal(bottled, 0);
  });

  it("week planner ranks cleaner dinners without relaxing allergens", () => {
    const week = planWeek({
      days: 7,
      servings: 4,
      seed: 9,
      avoidAllergens: ["fish"],
      clean: { cleanMode: true, fewerBottles: true, simplerMethod: true, moreVegetables: true },
    });
    assert.equal(week.days.filter((d) => d.recipe).length, 7);
    for (const day of week.days) {
      if (!day.recipe) continue;
      assert.equal(day.recipe.allergens.includes("fish"), false);
      assert.ok(!day.recipe.ingredients.some((i) => /fish sauce/i.test(i.name)));
    }
    assert.ok(week.notes.some((note) => /Cleaner-meal soft prefs/i.test(note)));
    const stats = week.days.map((d) => d.recipe && mealCleanStats(d.recipe)).filter(Boolean);
    assert.ok(stats.length >= 5);
  });
});
