/**
 * Frequency audit: strong condiments across regions × seeds.
 * Usage: node scripts/region-affinity-audit.mjs [label]
 */
import { writeFileSync } from "node:fs";
import { generateMeal, MEAL_REGIONS } from "../lib/meals.ts";
import { planWeek } from "../lib/planner.ts";
import { fusionSearch } from "../lib/fusion-sat.ts";
import { markerLeak } from "../lib/region-affinity.ts";

const label = process.argv[2] || "audit";
const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233];
const WESTERN = [
  "italian", "mexican", "french", "greek", "spanish", "australian", "home-kitchen",
];
const MARKERS = [
  [/kimchi/i, "kimchi"],
  [/sriracha/i, "sriracha"],
  [/fish sauce|fish-sauce/i, "fish-sauce"],
  [/\bmiso\b/i, "miso"],
  [/gochujang/i, "gochujang"],
  [/soy sauce|tamari/i, "soy"],
];

function mealText(regionId, seed, sideId = "rice-greens") {
  const meal = generateMeal({
    mainId: "chicken",
    methodId: "stir-fried",
    regionId,
    sideId,
    servings: 4,
    seed,
    spiceHeat: "hot",
  });
  return {
    meal,
    text: meal.ingredients.map((i) => `${i.id} ${i.name}`).join(" "),
  };
}

const byRegion = {};
let westernKimchi = 0;
let westernTotal = 0;
let leakCount = 0;
const leakSamples = [];

for (const region of MEAL_REGIONS) {
  const regionId = region.id;
  const tallies = Object.fromEntries(MARKERS.map(([, name]) => [name, 0]));
  for (const seed of SEEDS) {
    const { meal, text } = mealText(regionId, seed);
    for (const [re, name] of MARKERS) {
      if (re.test(text)) tallies[name] += 1;
    }
    for (const item of meal.ingredients) {
      const leak = markerLeak(regionId, item.id, item.name);
      if (leak) {
        leakCount += 1;
        if (leakSamples.length < 12) leakSamples.push({ regionId, seed, leak, id: item.id });
      }
    }
    if (WESTERN.includes(regionId)) {
      westernTotal += 1;
      if (/kimchi/i.test(text)) westernKimchi += 1;
    }
  }
  byRegion[regionId] = Object.fromEntries(
    Object.entries(tallies).map(([k, v]) => [k, +(v / SEEDS.length * 100).toFixed(1)]),
  );
}

// SAT-only sriracha rate on Italian vs Thai
let satSrirachaItalian = 0;
let satSrirachaThai = 0;
const satN = 40;
for (let seed = 1; seed <= satN; seed += 1) {
  const it = fusionSearch({
    seed, regionId: "italian", diet: "omnivore", spiceHeat: "hot",
    glutenFree: false, dairyFree: false, vegan: false, vegetarian: false, eggFree: false,
    servings: 4,
  });
  const th = fusionSearch({
    seed, regionId: "thai", diet: "omnivore", spiceHeat: "hot",
    glutenFree: false, dairyFree: false, vegan: false, vegetarian: false, eggFree: false,
    servings: 4,
  });
  if (it.names.some((n) => /sriracha/i.test(n))) satSrirachaItalian += 1;
  if (th.names.some((n) => /sriracha/i.test(n))) satSrirachaThai += 1;
}

let weekKimchi = 0;
let weekKimchiNonKorean = 0;
let weekDays = 0;
for (let seed = 1; seed <= 40; seed += 1) {
  const week = planWeek({ days: 7, servings: 4, seed });
  for (const day of week.days) {
    if (!day.recipe) continue;
    weekDays += 1;
    const text = day.recipe.ingredients.map((i) => `${i.id} ${i.name}`).join(" ");
    if (/kimchi/i.test(text)) {
      weekKimchi += 1;
      if (day.recipe.regionId !== "korean") weekKimchiNonKorean += 1;
    }
  }
}

const summary = {
  label,
  generatedAt: new Date().toISOString(),
  seedsPerRegion: SEEDS.length,
  westernKimchiPct: westernTotal ? +(westernKimchi / westernTotal * 100).toFixed(2) : 0,
  westernSamples: westernTotal,
  markerLeaks: leakCount,
  leakSamples,
  satSrirachaItalianPct: +(satSrirachaItalian / satN * 100).toFixed(1),
  satSrirachaThaiPct: +(satSrirachaThai / satN * 100).toFixed(1),
  weekKimchiDays: weekKimchi,
  weekKimchiNonKorean,
  weekDays,
  weekKimchiPct: weekDays ? +(weekKimchi / weekDays * 100).toFixed(2) : 0,
  byRegion: {
    italian: byRegion.italian,
    mexican: byRegion.mexican,
    australian: byRegion.australian,
    "home-kitchen": byRegion["home-kitchen"],
    korean: byRegion.korean,
    japanese: byRegion.japanese,
    thai: byRegion.thai,
    vietnamese: byRegion.vietnamese,
  },
};

writeFileSync(
  new URL(`./region-affinity-${label}.json`, import.meta.url),
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
