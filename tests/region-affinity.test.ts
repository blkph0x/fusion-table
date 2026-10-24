import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateMeal, MEAL_REGIONS } from "../lib/meals.ts";
import { planWeek } from "../lib/planner.ts";
import { preferredSidesForRegion, sideRegionHints } from "../lib/side-plans.ts";
import { PLATES } from "../lib/plates.ts";
import {
  MARKER_REGIONS,
  SIDE_MARKER_REGIONS,
  markerLeak,
  regionAllowsMarker,
} from "../lib/region-affinity.ts";
import { exploreRegionProfile } from "../lib/region-diversity.ts";

const NON_KOREAN = MEAL_REGIONS.map((r) => r.id).filter((id) => id !== "korean");
const WESTERN = [
  "italian", "mexican", "french", "greek", "spanish", "australian", "home-kitchen",
  "argentine", "nordic", "hungarian", "portuguese",
];

function mealHas(regionId: string, seed: number, needle: RegExp): boolean {
  const meal = generateMeal({
    mainId: "chicken",
    methodId: "stir-fried",
    regionId,
    sideId: "rice-greens",
    servings: 4,
    seed,
    spiceHeat: "hot",
  });
  const text = meal.ingredients.map((i) => `${i.id} ${i.name}`).join(" ");
  return needle.test(text);
}

describe("region ingredient affinity", () => {
  it("keeps kimchi off non-Korean sides, plates and preferred lists", () => {
    assert.deepEqual([...sideRegionHints("kimchi-rice")], ["korean"]);
    assert.deepEqual([...SIDE_MARKER_REGIONS["kimchi-rice"]], ["korean"]);
    for (const regionId of NON_KOREAN) {
      assert.equal(preferredSidesForRegion(regionId).includes("kimchi-rice"), false, regionId);
    }
    assert.ok(preferredSidesForRegion("korean").includes("kimchi-rice"));
    assert.equal(PLATES.some((p) => p.sideId === "kimchi-rice" && p.regionId !== "korean"), false);
    for (const plate of PLATES.filter((p) => p.sideId === "kimchi-rice")) {
      assert.equal(plate.regionId, "korean");
    }
  });

  it("does not put kimchi, sriracha, fish sauce or miso on Western random samples", () => {
    for (const regionId of WESTERN) {
      for (const seed of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]) {
        const meal = generateMeal({
          mainId: "chicken",
          methodId: "pan-fried",
          regionId,
          sideId: "garden-salad",
          servings: 4,
          seed,
          spiceHeat: "hot",
        });
        for (const item of meal.ingredients) {
          const leak = markerLeak(regionId, item.id, item.name);
          assert.equal(leak, null, `${regionId} seed ${seed}: ${leak} via ${item.id}`);
        }
        assert.equal(mealHas(regionId, seed, /kimchi/i), false, regionId);
      }
    }
  });

  it("keeps sriracha and fish sauce on SE Asian plates only, and miso on Japanese", () => {
    let srirachaThai = 0;
    let srirachaItalian = 0;
    let misoJapanese = 0;
    let misoMexican = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      if (mealHas("thai", seed, /sriracha/i)) srirachaThai += 1;
      if (mealHas("italian", seed, /sriracha/i)) srirachaItalian += 1;
      if (mealHas("japanese", seed, /\bmiso\b/i)) misoJapanese += 1;
      if (mealHas("mexican", seed, /\bmiso\b/i)) misoMexican += 1;
      assert.equal(mealHas("french", seed, /fish sauce|fish-sauce/i), false);
      assert.equal(mealHas("korean", seed, /kimchi/i), false); // rice-greens side, not kimchi-rice
    }
    assert.ok(srirachaThai >= 1, "thai should still be able to draw sriracha");
    assert.equal(srirachaItalian, 0);
    assert.ok(misoJapanese >= 1, "japanese should still see miso");
    assert.equal(misoMexican, 0);
  });

  it("does not explore sibling strong markers onto the wrong region", () => {
    for (const regionId of ["cantonese", "italian", "mexican", "australian", "home-kitchen"]) {
      for (let seed = 1; seed <= 24; seed += 1) {
        const profile = exploreRegionProfile(regionId, false, "hot", { seed });
        for (const item of [...profile.aromatics, ...profile.seasonings, ...profile.finish]) {
          const leak = markerLeak(regionId, item.id, item.name);
          assert.equal(leak, null, `${regionId} seed ${seed}: ${leak}`);
        }
      }
    }
    assert.ok(regionAllowsMarker("korean", "gochujang"));
    assert.equal(regionAllowsMarker("italian", "gochujang"), false);
    assert.deepEqual([...MARKER_REGIONS.kimchi], ["korean"]);
  });

  it("keeps kimchi out of seeded weeks unless the dinner is Korean with kimchi-rice", () => {
    let kimchiDays = 0;
    let total = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const week = planWeek({ days: 7, servings: 4, seed });
      for (const day of week.days) {
        if (!day.recipe) continue;
        total += 1;
        const text = day.recipe.ingredients.map((i) => `${i.id} ${i.name}`).join(" ");
        if (!/kimchi/i.test(text)) continue;
        kimchiDays += 1;
        assert.equal(day.recipe.regionId, "korean", `kimchi on ${day.recipe.regionId} seed ${seed}`);
        assert.equal(day.recipe.sideId, "kimchi-rice");
      }
    }
    assert.ok(total > 200);
    // May appear on Korean plates; must not dominate the week catalogue.
    assert.ok(kimchiDays / total < 0.15, `kimchi ${kimchiDays}/${total}`);
  });

  it("aligns authored side marker hints with the affinity table", () => {
    for (const [sideId, regions] of Object.entries(SIDE_MARKER_REGIONS)) {
      assert.deepEqual([...sideRegionHints(sideId)].sort(), [...regions].sort(), sideId);
    }
  });
});
