/**
 * Fast ingredient frequency audit.
 * Run: node --experimental-strip-types scripts/ingredient-diversity-audit.mjs
 */
import { writeFileSync } from "node:fs";
import { REGION_TASTES, plateIds } from "../lib/region-pantry.ts";
import { generateMeal } from "../lib/meals.ts";
import { planWeek } from "../lib/planner.ts";
import { explorePoolSize, exploreRegionProfile } from "../lib/region-diversity.ts";

const STAPLEISH = new Set([
  "neutral-oil", "vegetable-stock", "onion", "passata", "coconut-milk",
  "coating-flour", "breadcrumbs", "cornflour",
]);

const REGIONS = [
  "thai", "indian", "japanese", "korean", "mexican", "chinese", "levantine",
  "vietnamese", "moroccan", "italian", "ethiopian", "caribbean", "french",
  "spanish", "greek", "indonesian", "peruvian", "turkish", "brazilian", "sichuan",
];

const COMBOS = [
  ["chicken", "curry"], ["chicken", "stir-fried"], ["tofu", "stir-fried"],
  ["salmon", "grilled"], ["beef", "pan-fried"], ["chickpeas", "curry"],
  ["prawns", "stir-fried"], ["white-fish", "baked"],
];

function bump(map, id, n = 1) {
  map.set(id, (map.get(id) || 0) + n);
}

function topEntries(map, limit = 25) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

const plateGlobal = new Map();
for (const region of REGION_TASTES) {
  for (const id of plateIds(region)) bump(plateGlobal, id);
}

const seededGlobal = new Map();
const unseededGlobal = new Map();
const perRegionUnique = {};
let seededSamples = 0;
let unseededSamples = 0;

for (const regionId of REGIONS) {
  const seen = new Set();
  for (const [mainId, methodId] of COMBOS) {
    try {
      const plain = generateMeal({ mainId, methodId, regionId, sideId: "rice-greens", servings: 4 });
      unseededSamples += 1;
      for (const ing of plain.ingredients) {
        if (STAPLEISH.has(ing.id) || ing.id.startsWith("sat-")) continue;
        bump(unseededGlobal, ing.id);
      }
    } catch { /* incompatible combo */ }
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]) {
      try {
        const meal = generateMeal({ mainId, methodId, regionId, sideId: "rice-greens", servings: 4, seed });
        seededSamples += 1;
        for (const ing of meal.ingredients) {
          if (STAPLEISH.has(ing.id) || ing.id.startsWith("sat-")) continue;
          bump(seededGlobal, ing.id);
          seen.add(ing.id);
        }
      } catch { /* incompatible */ }
    }
  }
  perRegionUnique[regionId] = {
    unique: seen.size,
    plate: plateIds(REGION_TASTES.find((r) => r.id === regionId)).length,
    pool: explorePoolSize(regionId),
    profileVariants: new Set(
      Array.from({ length: 24 }, (_, i) => {
        const p = exploreRegionProfile(regionId, false, "medium", { seed: i + 1 });
        return [...p.aromatics, ...p.seasonings, ...p.finish].map((x) => x.id).sort().join(",");
      }),
    ).size,
  };
}

const weekDom = new Map();
const weekUnique = [];
for (let seed = 1; seed <= 20; seed += 1) {
  const week = planWeek({ days: 7, servings: 4, seed });
  const ids = new Map();
  for (const day of week.days) {
    if (!day.recipe) continue;
    for (const ing of day.recipe.ingredients) {
      if (STAPLEISH.has(ing.id) || ing.id.startsWith("sat-")) continue;
      bump(ids, ing.id);
    }
  }
  weekUnique.push(ids.size);
  for (const [id, n] of ids) if (n >= 3) bump(weekDom, id);
}

function pctList(map, samples) {
  return topEntries(map, 20).map(([id, count]) => ({
    id,
    count,
    pctOfSamples: Number(((100 * count) / Math.max(1, samples)).toFixed(2)),
  }));
}

const report = {
  generatedAt: new Date().toISOString(),
  plateCatalogueTop: pctList(plateGlobal, REGION_TASTES.length).map((row) => ({
    id: row.id,
    regions: row.count,
    pctOfRegions: row.pctOfSamples,
  })),
  unseeded: {
    samples: unseededSamples,
    top: pctList(unseededGlobal, unseededSamples),
  },
  seeded: {
    samples: seededSamples,
    uniqueIds: seededGlobal.size,
    top: pctList(seededGlobal, seededSamples),
  },
  perRegion: perRegionUnique,
  week: {
    seeds: 20,
    avgUniqueIngredients: Number((weekUnique.reduce((a, b) => a + b, 0) / weekUnique.length).toFixed(2)),
    ingredientsOn3PlusDays: topEntries(weekDom, 15).map(([id, weeks]) => ({ id, weeks })),
  },
};

console.log(JSON.stringify(report, null, 2));
writeFileSync(new URL("./ingredient-diversity-after.json", import.meta.url), JSON.stringify(report, null, 2));
