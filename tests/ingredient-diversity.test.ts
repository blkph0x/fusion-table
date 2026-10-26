import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateMeal, MAIN_INGREDIENTS, MEAL_SIDES } from "../lib/meals.ts";
import { planWeek } from "../lib/planner.ts";
import { REGION_TASTES, plateIds, signatureHeatId } from "../lib/region-pantry.ts";
import {
  explorePoolSize,
  exploreRegionProfile,
  regionTrueIds,
} from "../lib/region-diversity.ts";

const STAPLEISH = new Set([
  "neutral-oil", "vegetable-stock", "onion", "passata", "coconut-milk",
  "coating-flour", "breadcrumbs", "cornflour",
]);

const SAMPLE_REGIONS = [
  "thai", "indian", "japanese", "korean", "mexican", "chinese", "levantine",
  "vietnamese", "moroccan", "italian", "ethiopian", "caribbean", "french",
  "spanish", "greek", "indonesian", "peruvian", "turkish", "brazilian", "sichuan",
];

function bump(map: Map<string, number>, id: string) {
  map.set(id, (map.get(id) || 0) + 1);
}

describe("ingredient diversity", () => {
  it("keeps unseeded regional plates byte-stable and expands the explore pool past the fixed plate", () => {
    const input = { mainId: "chicken", methodId: "curry", regionId: "thai", sideId: "rice-greens", servings: 4 };
    assert.deepEqual(generateMeal(input), generateMeal(input));
    for (const region of REGION_TASTES) {
      const plate = plateIds(region).length;
      const pool = explorePoolSize(region.id);
      assert.ok(pool >= plate, `${region.id}: pool ${pool} < plate ${plate}`);
    }
    const thaiPool = explorePoolSize("thai");
    assert.ok(thaiPool >= 12, `thai pool ${thaiPool}`);
    const indianPool = explorePoolSize("indian");
    assert.ok(indianPool >= 16, `indian pool ${indianPool}`);
  });

  it("varies aromatics within a region across seeds while keeping the signature heat", () => {
    for (const regionId of SAMPLE_REGIONS) {
      const heat = signatureHeatId(regionId);
      const trueIds = regionTrueIds(regionId);
      const signatures = new Set<string>();
      const flavourHits = new Map<string, number>();
      for (let seed = 1; seed <= 24; seed += 1) {
        const profile = exploreRegionProfile(regionId, false, "medium", { seed });
        assert.ok(profile.seasonings.some((item) => item.id === heat), `${regionId} seed ${seed} missing heat`);
        for (const item of [...profile.aromatics, ...profile.seasonings, ...profile.finish]) {
          assert.ok(trueIds.has(item.id), `${regionId} seed ${seed} off-region ${item.id}`);
          bump(flavourHits, item.id);
        }
        signatures.add([
          ...profile.aromatics.map((item) => item.id),
          ...profile.seasonings.map((item) => item.id),
          ...profile.finish.map((item) => item.id),
        ].sort().join(","));
      }
      assert.ok(signatures.size >= 4, `${regionId} only ${signatures.size} profiles`);
      assert.ok(flavourHits.size >= Math.min(8, trueIds.size), `${regionId} only ${flavourHits.size} flavour ids`);
      assert.deepEqual(
        exploreRegionProfile(regionId, false, "medium", { seed: 7 }),
        exploreRegionProfile(regionId, false, "medium", { seed: 7 }),
      );
    }
  });

  it("meets min unique flavours per region over random meals and caps non-staple dominance", () => {
    const methods = ["curry", "stir-fried", "pan-fried", "grilled", "baked"];
    const sides = MEAL_SIDES.slice(0, 20).map((side) => side.id);
    const mains = MAIN_INGREDIENTS.filter((main) => ["chicken", "tofu", "salmon", "chickpeas", "beef", "prawns"].includes(main.id));
    const global = new Map<string, number>();
    let samples = 0;

    for (const regionId of SAMPLE_REGIONS) {
      const seen = new Set<string>();
      for (const main of mains) {
        for (const method of methods) {
          if (!main.methodIds.includes(method)) continue;
          for (const sideId of sides.slice(0, 3)) {
            for (const seed of [1, 2, 3, 5, 8, 13, 21]) {
              const meal = generateMeal({
                mainId: main.id,
                methodId: method,
                regionId,
                sideId,
                servings: 4,
                seed,
              });
              samples += 1;
              for (const item of meal.ingredients) {
                if (STAPLEISH.has(item.id) || item.id.startsWith("sat-")) continue;
                seen.add(item.id);
                bump(global, item.id);
              }
            }
          }
        }
      }
      assert.ok(seen.size >= 8, `${regionId} unique flavours ${seen.size}`);
    }

    assert.ok(samples > 500, `samples ${samples}`);
    const top = [...global.entries()].sort((a, b) => b[1] - a[1])[0];
    const topPct = (100 * top[1]) / samples;
    // Garlic used to land on nearly every plate. After exploration it should not dominate >70%.
    assert.ok(topPct < 70, `top ${top[0]} at ${topPct.toFixed(1)}% of ${samples}`);
  });

  it("softens already-heavy week flavours and labels intentional pantry reuse", () => {
    const heavy = exploreRegionProfile("thai", false, "medium", { seed: 1 });
    const soften = dominantSoft(heavy);
    const plain = exploreRegionProfile("thai", false, "medium", { seed: 42 });
    const softened = exploreRegionProfile("thai", false, "medium", { seed: 42, soften });
    // Same seed without soften can differ when soften is applied — both stay region-true.
    for (const item of [...softened.aromatics, ...softened.seasonings, ...softened.finish]) {
      assert.ok(regionTrueIds("thai").has(item.id), item.id);
    }
    void plain;

    const weeks = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => planWeek({ days: 7, servings: 4, seed }));
    for (const week of weeks) {
      assert.deepEqual(week.unfilledDays, []);
      const counts = new Map<string, number>();
      for (const day of week.days) {
        if (!day.recipe) continue;
        for (const item of day.recipe.ingredients) {
          if (STAPLEISH.has(item.id) || item.id.startsWith("sat-")) continue;
          bump(counts, item.id);
        }
      }
      const over = [...counts.entries()].filter(([, n]) => n >= 5);
      assert.ok(over.length <= 3, `too many 5-day flavours: ${over.map(([id, n]) => `${id}:${n}`).join(", ")}`);
    }
    assert.ok(weeks.some((week) => week.notes.some((note) => /pantry reuse|explores that region's pantry/i.test(note))));
  });
});

function dominantSoft(profile: ReturnType<typeof exploreRegionProfile>): string[] {
  return [
    ...profile.aromatics.map((item) => item.id),
    ...profile.seasonings.map((item) => item.id),
    ...profile.finish.map((item) => item.id),
  ];
}
