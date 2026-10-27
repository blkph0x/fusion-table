import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AVOID_CHOICES } from "../lib/kitchen-state.ts";
import { planWeek } from "../lib/planner.ts";
import { assertRecipeFilters, SUPPORTED_ALLERGENS } from "../lib/recipe-filters.ts";

describe("household allergen planner integration", () => {
  it("accepts every checked UI allergen and keeps restrictions even when no dinner can fit", () => {
    const avoidAllergens = [...AVOID_CHOICES];
    const week = planWeek({ days: 2, servings: 2, seed: 42, avoidAllergens });
    assert.equal(week.days.length, 2);
    assert.deepEqual(week.unfilledDays, week.days.filter((day) => !day.recipe).map((day) => day.day));
    for (const day of week.days) {
      if (day.recipe) assert.doesNotThrow(() => assertRecipeFilters(day.recipe!, { avoidAllergens }));
      else assert.ok(day.reason, "An unfilled dinner must explain the restrictive result");
    }
  });

  it("keeps the hyphenated tree-nut exclusion and its supported alias canonical", () => {
    const canonical = planWeek({ days: 2, servings: 2, seed: 17, avoidAllergens: ["tree-nut"] });
    const alias = planWeek({ days: 2, servings: 2, seed: 17, avoidAllergens: ["tree nuts"] });
    assert.deepEqual(alias.days.map((day) => day.recipe?.id), canonical.days.map((day) => day.recipe?.id));
    for (const day of canonical.days) if (day.recipe) assert.doesNotThrow(() => assertRecipeFilters(day.recipe!, { avoidAllergens: ["tree-nut"] }));
  });

  it("uses the same complete supported list as direct generators instead of a separate allowlist", () => {
    assert.doesNotThrow(() => planWeek({ days: 1, servings: 2, seed: 7, avoidAllergens: [...SUPPORTED_ALLERGENS] }));
    assert.throws(() => planWeek({ days: 1, servings: 2, avoidAllergens: ["not-a-real-allergen"] }), /supported allergen/);
  });
});
