#!/usr/bin/env node
/** Opt-in deterministic pricing audit. No retailer requests or account/ledger mutations. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { estimateIngredientCost, estimateRecipeCost, INGREDIENT_ESTIMATE_VERSION } from "../lib/ingredient-estimates.ts";
import { generateMeal, getMainsForDiet, MEAL_REGIONS, MEAL_SIDES } from "../lib/meals.ts";
import { cutsForMethod } from "../lib/cut-method.ts";
import { generateRecipe, CLASSICS, REGIONS } from "../lib/recipes.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2), reportArg = args.indexOf("--report");
const reportFile = path.resolve(root, reportArg >= 0 ? args[reportArg + 1] : "docs/audit-evidence-2026-10-27/account-pricing-coverage.json");
const diets = ["balanced", "vegetarian", "vegan", "gluten-free", "dairy-free"];
const heats = ["gentle", "mild", "medium", "hot", "fiery"], servingsOptions = [1, 2, 4, 6, 12];
const fixture = JSON.parse(readFileSync(path.join(root, "tests/fixtures/pricing-ingredients.json"), "utf8"));
const files = ["lib/ingredient-estimates.ts", "lib/shopping-costs.ts", "lib/price-provider-cache.ts", "lib/catalogue.ts", "lib/coles-catalogue.ts", "lib/product-match.ts", "app/api/shopping-prices/automatic-offers.ts", "scripts/audit-pricing-coverage.mjs"];
const source = () => createHash("sha256").update(files.map(file => `${file}\0${readFileSync(path.join(root, file), "utf8")}\0`).join("")).digest("hex");
const sourceBefore = source(), start = performance.now(), digest = createHash("sha256");
const issues = [], names = new Set(), units = new Set(), regions = new Set(), sides = new Set(), mains = new Set(), methods = new Set(), profiles = new Map();
let meals = 0, ingredientLines = 0, canonicalPairs = 0, minPerServing = Infinity, maxPerServing = 0, minMeal = null, maxMeal = null;
for (const row of fixture.ingredients) {
  const result = estimateIngredientCost({ ...row, amount: 1 });
  canonicalPairs++;
  if (!result || result.profileId === "general-ingredient-allowance") issues.push({ kind: "canonical-pair", name: row.name, unit: row.unit, result });
}
function inspect(recipe, input) {
  const result = estimateRecipeCost(recipe.ingredients, recipe.servings);
  meals++; ingredientLines += recipe.ingredients.length;
  if (!result.complete || !Number.isSafeInteger(result.recipeCents) || result.recipeCents <= 0 || !Number.isSafeInteger(result.purchaseCents) || result.purchaseCents < result.recipeCents) issues.push({ kind: "recipe-total", input, title: recipe.title, result });
  for (const [index, row] of result.lines.entries()) {
    const estimate = row.estimate;
    names.add(recipe.ingredients[index].name); units.add(recipe.ingredients[index].unit);
    if (!estimate) { issues.push({ kind: "missing-ingredient", input, ingredient: recipe.ingredients[index] }); continue; }
    profiles.set(estimate.profileId, (profiles.get(estimate.profileId) ?? 0) + 1);
    if (estimate.observed !== false || estimate.currency !== "AUD" || !estimate.assumptions.length) issues.push({ kind: "missing-provenance", input, ingredient: row.name });
  }
  if (result.perServingCents < minPerServing) { minPerServing = result.perServingCents; minMeal = { input, title: recipe.title, perServingCents: result.perServingCents }; }
  if (result.perServingCents > maxPerServing) { maxPerServing = result.perServingCents; maxMeal = { input, title: recipe.title, perServingCents: result.perServingCents }; }
  digest.update(JSON.stringify([input, recipe.title, result.lines.map(row => [row.id, row.estimate?.recipeCents, row.estimate?.purchaseCents, row.estimate?.profileId])])).update("\n");
}
for (const [di, diet] of diets.entries()) {
  const rows = getMainsForDiet(diet).flatMap(main => main.methodIds.flatMap(methodId => [
    { mainId: main.id, methodId }, ...cutsForMethod(main.id, methodId).map(cut => ({ mainId: main.id, methodId, cutId: cut.id })),
  ]));
  for (const [ri, region] of MEAL_REGIONS.entries()) for (let si = 0; si < 12; si++) {
    const row = rows[(ri * 37 + si * 17 + di) % rows.length], side = MEAL_SIDES[(ri * 7 + si * 11 + di) % MEAL_SIDES.length];
    const input = { ...row, regionId: region.id, sideId: side.id, diet, spiceHeat: heats[(ri + di + si) % heats.length], servings: servingsOptions[(ri + di * 2 + si) % servingsOptions.length], ...(si % 3 === 0 ? { seed: (ri * 3919 + si * 7 + di) >>> 0 } : {}) };
    regions.add(region.id); sides.add(side.id); mains.add(row.mainId); methods.add(row.methodId);
    try { inspect(generateMeal(input), input); } catch (error) { issues.push({ kind: "generation", input, error: String(error) }); }
  }
  for (const [ci, classic] of CLASSICS.entries()) for (const [ri, region] of REGIONS.entries()) {
    const input = { classicId: classic.id, regionId: region.id, diet, spiceHeat: heats[(ri + di + ci) % heats.length], servings: servingsOptions[(ri + di * 2 + ci) % servingsOptions.length], ...(ci % 3 === 0 ? { seed: (ri * 3919 + ci * 7 + di) >>> 0 } : {}) };
    try { inspect(generateRecipe(input), input); } catch (error) { issues.push({ kind: "generation", input, error: String(error) }); }
  }
}
const result = { completedAt: new Date().toISOString(), status: issues.length ? "failed" : "passed", version: INGREDIENT_ESTIMATE_VERSION, scope: "All 568 canonical authored ingredient/name-unit pairs plus 8,810 generated meals: all 4,250 classic/diet/region settings with rotating heat/servings/seed, and 4,560 stratified ingredient-led meals across 76 regions, 90 sides, 5 diets, cuts and methods. No claim of live quote coverage or exhaustive random seeds.", canonicalPairs, meals, ingredientLines, ingredientNames: names.size, units: [...units].sort(), regions: regions.size, sides: sides.size, mains: mains.size, methods: methods.size, profiles: Object.fromEntries([...profiles].sort()), minMeal, maxMeal, issueCount: issues.length, issues: issues.slice(0, 100), pricingSourceSha256: sourceBefore, pricingSourceChangedDuringRun: source() !== sourceBefore, witnessSha256: digest.digest("hex"), elapsedSeconds: Math.round((performance.now() - start) / 1000 * 100) / 100 };
if (result.pricingSourceChangedDuringRun) { result.status = "failed"; result.issueCount++; result.issues.push({ kind: "source-changed" }); }
mkdirSync(path.dirname(reportFile), { recursive: true }); writeFileSync(reportFile, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: result.status, meals, ingredientLines, canonicalPairs, issueCount: result.issueCount, reportFile, elapsedSeconds: result.elapsedSeconds }));
if (result.status !== "passed") process.exitCode = 1;
