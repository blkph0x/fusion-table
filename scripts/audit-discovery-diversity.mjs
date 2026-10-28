#!/usr/bin/env node
/** Repeatable offline shuffle/identity audit; no retailer or image requests. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { buildHomeDiscover } from "../lib/home-suggestions.ts";
import { DISCOVER_POOL_STATS, discoverCoreKey, rememberDiscoverCores } from "../lib/discover-pool.ts";
import { cookingRecipeKey } from "../lib/recipe-identity.ts";
import { decodeShare, recipeFromShare } from "../lib/share-recipe.ts";
import { markerLeak } from "../lib/region-affinity.ts";

const reportIndex = process.argv.indexOf("--report");
const target = resolve(reportIndex < 0 ? "work/discovery-diversity-audit.json" : process.argv[reportIndex + 1]);
assert.ok(DISCOVER_POOL_STATS.cores >= 10 * DISCOVER_POOL_STATS.previousCores);
let history = [];
const cores = new Set(), mains = new Set(), regions = new Set(), methods = new Set(), sides = new Set();
const timings = [], heap = [], weeklyTitles = new Set();
const start = performance.now();
for (let run = 0; run < 50; run++) {
  const began = performance.now();
  const home = buildHomeDiscover({ loadSeed: 10_000 + run, weekSeed: 202644, recentCoreKeys: history });
  timings.push(performance.now() - began); heap.push(process.memoryUsage().heapUsed);
  assert.equal(home.suggestions.length, 6);
  assert.equal(home.reusedRecentCores, 0);
  assert.equal(new Set(home.suggestions.map(item => item.plate.mainId)).size, 6);
  assert.equal(new Set(home.suggestions.map(item => item.plate.methodId)).size, 6);
  assert.equal(new Set(home.suggestions.map(item => item.plate.regionId)).size, 6);
  weeklyTitles.add(home.mealOfWeek.title);
  for (const item of home.suggestions) {
    const core = discoverCoreKey(item.plate);
    assert.ok(!history.includes(core)); cores.add(core);
    mains.add(item.plate.mainId); methods.add(item.plate.methodId);
    regions.add(item.plate.regionId); sides.add(item.plate.sideId);
    assert.equal(cookingRecipeKey(recipeFromShare(decodeShare(item.shareToken))), cookingRecipeKey(item.recipe));
    assert.ok(item.recipe.ingredients.every(ingredient => !markerLeak(item.plate.regionId, ingredient.id, ingredient.name)));
  }
  history = rememberDiscoverCores(history, home.suggestions.map(item => item.plate));
}
assert.equal(weeklyTitles.size, 1);
assert.ok(cores.size >= 250);
const sourceFiles = ["lib/discover-pool.ts", "lib/home-suggestions.ts", "lib/meal-of-week.ts", "lib/share-recipe.ts", "app/page.tsx"];
const result = {
  status: "passed", shuffles: 50, recipesChecked: 300, uniqueCoresSeen: cores.size,
  pool: DISCOVER_POOL_STATS, expansion: DISCOVER_POOL_STATS.cores / DISCOVER_POOL_STATS.previousCores,
  sampledCoverage: { mains: mains.size, methods: methods.size, regions: regions.size, sides: sides.size },
  recentCoreLimit: history.length, noRecentCoreRepeats: true, exactShareRoundTrips: 300,
  regionalMarkerLeaks: 0, sameWeeklyPickThroughout: true,
  selectionMilliseconds: { cold: timings[0], averageWarm: timings.slice(1).reduce((a,b) => a+b, 0) / 49, p95: [...timings].sort((a,b) => a-b)[47], maximum: Math.max(...timings) },
  measuredHeapMegabytes: { minimum: Math.min(...heap) / 1024 ** 2, maximum: Math.max(...heap) / 1024 ** 2 },
  elapsedMilliseconds: performance.now() - start,
  sourceHashes: Object.fromEntries(sourceFiles.map(file => [file, createHash("sha256").update(readFileSync(resolve(file))).digest("hex")])),
  limitation: "Structural, selection and identity checks do not establish taste, nutritional adequacy or kitchen performance.",
};
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
