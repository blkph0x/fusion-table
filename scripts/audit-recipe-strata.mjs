#!/usr/bin/env node
/** Reproducible 50-per-cooking-row audit; no network or image generation. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { COOKING_METHODS, MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SIDES, generateMeal, getMainsForDiet } from "../lib/meals.ts";
import { cutsForMethod } from "../lib/cut-method.ts";
import { CLASSICS, REGIONS, generateRecipe } from "../lib/recipes.ts";
import { markerLeak } from "../lib/region-affinity.ts";
import { buildSidePlan } from "../lib/side-plans.ts";
import { inspectRecipe } from "./audit-culinary-matrix.mjs";
import { encodeShare, recipeFromShare, specFromRecipe } from "../lib/share-recipe.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIETS = ["balanced", "vegetarian", "vegan", "gluten-free", "dairy-free"];
const HEATS = ["gentle", "mild", "medium", "hot", "fiery"];
const SERVINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CLEAN = [undefined, { fewerBottles: true }, { moreVegetables: true, simplerMethod: true }, { cleanMode: true, pantryFirstClean: true }, { fewerBottles: true, allowSecondBottle: true }];
const MAIN_BY_ID = new Map(MAIN_INGREDIENTS.map(main => [main.id, main]));

export function recipeAuditFingerprint() {
  const found = new Set();
  function visit(file) {
    const relative = path.relative(ROOT, file).replaceAll("\\", "/");
    if (found.has(relative)) return;
    found.add(relative);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+\.(?:ts|mjs))["']/g)) {
      const child = path.resolve(path.dirname(file), match[1]);
      if (child.startsWith(ROOT)) visit(child);
    }
  }
  for (const file of ["lib/meals.ts", "lib/recipes.ts", "scripts/audit-culinary-matrix.mjs", "scripts/audit-recipe-strata.mjs"]) visit(path.join(ROOT, file));
  const hash = createHash("sha256");
  for (const file of [...found].sort()) hash.update(file).update("\0").update(readFileSync(path.join(ROOT, file))).update("\0");
  return { sha256: hash.digest("hex"), files: [...found].sort(), scope: "Recipe-generator dependency graph and both structural/stratified auditors" };
}

export function auditCaseKey(input) { return JSON.stringify(input); }

export function buildStratifiedAuditPlan(samples = 50) {
  if (!Number.isInteger(samples) || samples < 1 || samples > 1000) throw new RangeError("Use 1–1000 samples per cooking row.");
  const rows = MAIN_INGREDIENTS.flatMap(main => main.methodIds.flatMap(methodId => [
    { mainId: main.id, methodId },
    ...cutsForMethod(main.id, methodId).map(cut => ({ mainId: main.id, methodId, cutId: cut.id })),
  ]));
  const diets = new Map(MAIN_INGREDIENTS.map(main => [main.id, DIETS.filter(diet => getMainsForDiet(diet).some(choice => choice.id === main.id))]));
  const mealCount = rows.length * samples, classicCount = CLASSICS.length * samples;
  return {
    samples, rows, mealCount, classicCount, total: mealCount + classicCount,
    catalogue: { mains: MAIN_INGREDIENTS.length, methods: COOKING_METHODS.length, mainMethods: rows.filter(row => !row.cutId).length, chosenCutMethods: rows.filter(row => row.cutId).length, cuts: new Set(rows.flatMap(row => row.cutId ? [row.cutId] : [])).size, regions: MEAL_REGIONS.length, sides: MEAL_SIDES.length, classics: CLASSICS.length, classicRegions: REGIONS.length },
    inputAt(index) {
      if (!Number.isInteger(index) || index < 0 || index >= mealCount + classicCount) throw new RangeError("Case is outside this audit plan.");
      const variant = index % samples;
      const rowIndex = Math.floor(index / samples);
      const seed = (Math.imul(rowIndex + 1, 0x9e3779b1) ^ Math.imul(variant + 1, 0x85ebca77)) >>> 0;
      const knobs = { servings: SERVINGS[(rowIndex + variant) % SERVINGS.length], spiceHeat: HEATS[variant % HEATS.length], ...(variant % 5 ? { seed } : {}), ...(CLEAN[variant % CLEAN.length] ? { clean: { ...CLEAN[variant % CLEAN.length] } } : {}) };
      if (index < mealCount) {
        const row = rows[rowIndex], choices = diets.get(row.mainId);
        return { ...row, regionId: MEAL_REGIONS[(rowIndex * 29 + variant * 17) % MEAL_REGIONS.length].id, sideId: MEAL_SIDES[(rowIndex * 31 + variant * 7) % MEAL_SIDES.length].id, diet: choices[(rowIndex + variant) % choices.length], ...knobs };
      }
      const classicIndex = Math.floor((index - mealCount) / samples);
      return { classicId: CLASSICS[classicIndex].id, regionId: REGIONS[(classicIndex * 7 + variant) % REGIONS.length].id, diet: DIETS[(classicIndex + variant) % DIETS.length], ...knobs };
    },
  };
}

function coverageKeys(input) {
  if ("classicId" in input) return { classic: input.classicId, classicRegion: input.regionId, diet: input.diet, heat: input.spiceHeat, servings: String(input.servings) };
  return { main: input.mainId, method: input.methodId, mainMethod: `${input.mainId}|${input.methodId}`, cookingRow: `${input.mainId}|${input.cutId ?? "default"}|${input.methodId}`, ...(input.cutId ? { cut: input.cutId } : {}), region: input.regionId, side: input.sideId, diet: input.diet, heat: input.spiceHeat, servings: String(input.servings) };
}

export function summarizeStratifiedCoverage(plan, indices = Array.from({ length: plan.total }, (_, index) => index)) {
  const counters = {};
  const unique = new Set();
  for (const index of indices) {
    const input = plan.inputAt(index), key = auditCaseKey(input);
    if (unique.has(key)) continue;
    unique.add(key);
    for (const [dimension, value] of Object.entries(coverageKeys(input))) {
      counters[dimension] ??= {};
      counters[dimension][value] = (counters[dimension][value] ?? 0) + 1;
    }
  }
  return { uniqueInputs: unique.size, dimensions: Object.fromEntries(Object.entries(counters).map(([key, values]) => [key, { groups: Object.keys(values).length, minimum: Math.min(...Object.values(values)), maximum: Math.max(...Object.values(values)), counts: values }])) };
}

/** Fifty review witnesses cover every main and technique before filling repeats. */
export function selectLiveWitnessIndices(plan, count = 50) {
  if (!Number.isInteger(count) || count < 1 || count > plan.mealCount) throw new RangeError("Choose a witness count within the meal audit.");
  const chosen = [], seenRows = new Set(), seenRegions = new Set(), seenSides = new Set(), seenCuts = new Set();
  const mainCounts = new Map(), methodCounts = new Map();
  function add(rowIndex) {
    let best = 0, bestScore = -Infinity;
    for (let variant = 0; variant < plan.samples; variant++) {
      const input = plan.inputAt(rowIndex * plan.samples + variant);
      const score = Number(!seenRegions.has(input.regionId)) * 8 + Number(!seenSides.has(input.sideId)) * 8 + Number(input.seed !== undefined);
      if (score > bestScore) { bestScore = score; best = variant; }
    }
    const index = rowIndex * plan.samples + best, input = plan.inputAt(index);
    chosen.push(index); seenRows.add(rowIndex); seenRegions.add(input.regionId); seenSides.add(input.sideId);
    if (input.cutId) seenCuts.add(input.cutId);
    mainCounts.set(input.mainId, (mainCounts.get(input.mainId) ?? 0) + 1);
    methodCounts.set(input.methodId, (methodCounts.get(input.methodId) ?? 0) + 1);
  }
  function bestRow(filter) {
    let best = -1, bestScore = -Infinity;
    for (const [index, row] of plan.rows.entries()) {
      if (seenRows.has(index) || !filter(row)) continue;
      const score = Number(!methodCounts.has(row.methodId)) * 20 + Number(Boolean(row.cutId && !seenCuts.has(row.cutId))) * 5 - (mainCounts.get(row.mainId) ?? 0) * 4 - (methodCounts.get(row.methodId) ?? 0);
      if (score > bestScore) { bestScore = score; best = index; }
    }
    return best;
  }
  for (const main of MAIN_INGREDIENTS) {
    if (chosen.length >= count) break;
    add(bestRow(row => row.mainId === main.id));
  }
  for (const method of COOKING_METHODS) {
    if (chosen.length >= count) break;
    if (methodCounts.has(method.id)) continue;
    const row = bestRow(item => item.methodId === method.id);
    if (row >= 0) add(row);
  }
  // Exercise form-specific instructions in the small live review, too.
  for (const cutId of ["chicken-whole", "chicken-liver", "beef-brisket", "lamb-shank", "beef-mince"]) {
    if (chosen.length >= count || seenCuts.has(cutId)) continue;
    const row = bestRow(item => item.cutId === cutId);
    if (row >= 0) add(row);
  }
  while (chosen.length < count) {
    const row = bestRow(() => true);
    if (row < 0) break;
    add(row);
  }
  return chosen;
}

/** Compare two ends of the serving range; whole birds intentionally round up. */
export function inspectServingScale(small, large, input) {
  const issues = [];
  if (small.servings !== 1 || large.servings !== 12) return [{ code: "SCALING_PROBE_SETTINGS", detail: "Scaling witnesses must use one and twelve servings." }];
  if (small.ingredients.length !== large.ingredients.length) issues.push({ code: "SCALING_INGREDIENT_SET", detail: "The same seed/options changed the ingredient set with servings." });
  for (const item of small.ingredients) {
    if (item.id === input.mainId && /whole|spatchcock/.test(input.cutId ?? "")) continue;
    const scaled = large.ingredients.find(other => other.id === item.id);
    if (!scaled || scaled.unit !== item.unit || Math.abs(scaled.amount - item.amount * 12) > 0.001) issues.push({ code: "SCALING_QUANTITY", detail: `${item.id}: ${item.amount} ${item.unit} at one serving / ${scaled?.amount} ${scaled?.unit} at twelve` });
  }
  return issues;
}

export function inspectShareRebuild(recipe) {
  try {
    const rebuilt = recipeFromShare(specFromRecipe(recipe));
    const content = item => JSON.stringify({ id: item.id, ingredients: item.ingredients, steps: item.steps, mainId: item.mainId, methodId: item.methodId, sideId: item.sideId, regionId: item.regionId, diet: item.diet, spiceHeat: item.spiceHeat, servings: item.servings });
    return content(rebuilt) === content(recipe) ? [] : [{ code: "SHARE_REBUILD_CHANGED", detail: "The share/PDF spec changed the recipe identity, ingredients, quantities or cooking method." }];
  } catch (error) { return [{ code: "SHARE_REBUILD_ERROR", detail: String(error instanceof Error ? error.message : error).slice(0, 300) }]; }
}

/** Additional plausibility checks are independent of generated quality assertions. */
export function inspectStratifiedRecipe(recipe, input) {
  const issues = inspectRecipe(recipe, input);
  const fail = (code, detail) => issues.push({ code, detail: String(detail).slice(0, 300) });
  if ("classicId" in input) return issues;
  const main = MAIN_BY_ID.get(input.mainId);
  const gf = input.diet === "gluten-free", df = ["vegan", "dairy-free"].includes(input.diet);
  const side = buildSidePlan(input.sideId, gf, df, input.servings);
  const sideIds = new Set(side.ingredients.map(item => item.id));
  for (const item of recipe.ingredients) {
    const leak = markerLeak(input.regionId, item.id, item.name);
    if (leak && !sideIds.has(item.id)) fail("NON_SIDE_REGIONAL_MARKER", `${item.id}: ${leak} outside ${input.regionId}`);
  }
  const mainIngredient = recipe.ingredients.find(item => item.id === input.mainId);
  if (mainIngredient?.unit === "g") {
    const perServing = mainIngredient.amount / input.servings;
    if (perServing < 40 || perServing > 700) fail("MAIN_PORTION_OUTLIER", `${input.mainId}: ${perServing} g per serving`);
  }
  // A named cook duration cannot exceed the full cook window. Step estimates can
  // overlap, so a sum of every step would be an invalid timing test.
  for (const step of recipe.steps) if ((step.minutes ?? 0) > recipe.totalMinutes + 0.001) fail("STEP_EXCEEDS_TOTAL_WINDOW", `${step.title}: ${step.minutes} / ${recipe.totalMinutes}`);
  if (recipe.tags.includes("broth bowl")) {
    const liquid = recipe.ingredients.filter(item => ["vegetable-stock", "coconut-milk", "passata"].includes(item.id) && item.unit === "ml").reduce((sum, item) => sum + item.amount, 0);
    if (liquid < input.servings * 100) fail("BROTH_WITHOUT_LIQUID", `${liquid} ml for ${input.servings} servings`);
  }
  if (input.cutId && /whole|spatchcock/.test(input.cutId)) {
    const birds = Math.ceil(input.servings / (input.mainId === "turkey" ? 8 : 4));
    if (!["", "whole", "bird"].includes(mainIngredient?.unit) || mainIngredient?.amount !== birds) fail("WHOLE_BIRD_QUANTITY", `${mainIngredient?.amount} ${mainIngredient?.unit}; expected ${birds} bird(s)`);
    if (!recipe.steps.some(step => /rest and carve|rest, then|lift the smoked/i.test(step.title))) fail("WHOLE_BIRD_REST_MISSING", input.cutId);
  }
  if (input.methodId === "smoked" && main.category === "meat") {
    const rest = recipe.steps.filter(step => step.title === "Rest, then slice or pull");
    const action = /(?:^|[.!?]\s+)Rest\b/g;
    if (rest.length !== 1 || [...rest[0].detail.matchAll(action)].length !== 1) fail("SMOKE_REST_REPEATED", "Rest must be one explicit handling stage, without a second rest copied from endpoint prose.");
    for (const step of recipe.steps.filter(item => ["Start the hot smoke", "Manage the stall and finish"].includes(item.title))) if (/(?:^|[.!?]\s+)Rest\b/.test(step.detail)) fail("SMOKE_REST_DURING_COOK", step.title);
    if (rest[0]) {
      const duration = rest[0].detail.match(/\bRest the smoked\b.*?(\d+)(?:[–-](\d+))? minutes\b/);
      if (!duration || (rest[0].minutes ?? 0) < Number(duration[1]) || (rest[0].minutes ?? 0) > Number(duration[2] ?? duration[1])) fail("SMOKE_REST_TIME_CONFLICT", `${rest[0].minutes} minutes does not agree with its rest instruction.`);
    }
    const mainMinutes = recipe.steps.filter(step => ["Start the hot smoke", "Manage the stall and finish", "Rest, then slice or pull"].includes(step.title)).reduce((sum, step) => sum + (step.minutes ?? 0), 0);
    if (recipe.cookMinutes < mainMinutes) fail("SMOKE_STAGES_EXCEED_COOK_TIME", `${mainMinutes} smoking/rest minutes / ${recipe.cookMinutes} cook minutes`);
  }
  if (["meat", "seafood"].includes(main.category) && /wash (?:the |raw )?(?:chicken|turkey|poultry)/i.test(recipe.steps.map(step => step.detail).join(" ").replace(/do not wash[^.]*[.]/gi, ""))) fail("RAW_POULTRY_WASHING", "Positive poultry-washing instruction found.");
  return issues;
}

function optionsFrom(argv) {
  const out = { run: false, samples: 50, report: "", witness: "", limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--run") out.run = true;
    else if (argv[i] === "--samples") out.samples = Number(argv[++i]);
    else if (argv[i] === "--report") out.report = argv[++i] ?? "";
    else if (argv[i] === "--witness") out.witness = argv[++i] ?? "";
    else if (argv[i] === "--limit") out.limit = Number(argv[++i]);
    else throw new Error(`Unknown option ${argv[i]}`);
  }
  if (out.run && (!out.report || !path.isAbsolute(out.report))) throw new Error("Pass --report with an absolute JSON path.");
  if (out.witness && !path.isAbsolute(out.witness)) throw new Error("Pass --witness with an absolute JSON path.");
  if (!Number.isInteger(out.limit) || out.limit < 0) throw new Error("Use a positive --limit or omit it.");
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  const options = optionsFrom(argv), plan = buildStratifiedAuditPlan(options.samples);
  const scheduled = options.limit ? Math.min(options.limit, plan.total) : plan.total;
  console.log(JSON.stringify({ catalogue: plan.catalogue, samplesPerCookingRow: plan.samples, scheduled, mealCases: plan.mealCount, classicCases: plan.classicCount }));
  if (!options.run) return 0;
  const source = recipeAuditFingerprint(), start = performance.now();
  const report = { schemaVersion: 1, definition: "stratified-cooking-rows-v1", status: "running", startedAt: new Date().toISOString(), finishedAt: null, source, node: process.version, samplesPerCookingRow: plan.samples, catalogue: plan.catalogue, planned: plan.total, scheduled, checked: 0, failedCases: 0, issueCounts: {}, examples: [], coverage: null, servingScale: { plannedPairs: plan.rows.length, checkedPairs: 0, failedPairs: 0 }, elapsedSeconds: 0, checks: ["Exact selected identities and settings", "Finite quantities, all ingredient references, exact allergen union and dietary exclusions", "Cooking endpoint, thermometer and safety-source presence", "One regional finish after the main and seeded preparation before finish", "Regional marker leakage outside explicitly selected side", "Main-portion outliers, whole-bird quantities and rest", "Individual step versus total cooking window", "Broth bowl retained-liquid minimum", "Every cooking row: one-versus-twelve serving ingredient quantities, with discrete whole-bird counts"], limits: ["Content and arithmetic checks cannot establish taste, successful kitchen execution, actual doneness or packet contents.", "Every default/chosen-cut cooking row receives the requested number of distinct rotating inputs; this is not fifty repetitions of every full Cartesian combination.", "Regional side choices are explicit fusion inputs and do not count as accidental main-seasoning leakage.", "A source change invalidates the run; rerun against the final frozen culinary source."] };
  mkdirSync(path.dirname(options.report), { recursive: true });
  const save = () => { report.elapsedSeconds = Math.round((performance.now() - start) / 100) / 10; writeFileSync(options.report, JSON.stringify(report, null, 2) + "\n"); };
  report.shareRoundTrips = { checked: 0, failed: 0 };
  report.checks.push("Fifty live witnesses: exact share rebuild identity, ingredients, quantities and cooking method");
  report.checks.push("Smoked meat: one rest stage, no rest during cooking, rest duration agrees with recorded timing");
  const checked = [], witness = [];
  const witnessIndices = new Set(selectLiveWitnessIndices(plan, Math.min(50, plan.mealCount)));
  let lastProgress = performance.now();
  save();
  for (let index = 0; index < scheduled; index++) {
    const input = plan.inputAt(index);
    try {
      const recipe = "classicId" in input ? generateRecipe(input) : generateMeal(input);
      const issues = inspectStratifiedRecipe(recipe, input);
      if (witnessIndices.has(index)) {
        const shareIssues = inspectShareRebuild(recipe);
        report.shareRoundTrips.checked++;
        if (shareIssues.length) report.shareRoundTrips.failed++;
        issues.push(...shareIssues);
      }
      if (issues.length) {
        report.failedCases++;
        for (const issue of issues) {
          report.issueCounts[issue.code] = (report.issueCounts[issue.code] ?? 0) + 1;
          if (report.examples.length < 50 && report.examples.filter(example => example.code === issue.code).length < 5) report.examples.push({ index, input, ...issue });
        }
      }
      if (witnessIndices.has(index)) witness.push({ input, shareSpec: specFromRecipe(recipe), shareToken: encodeShare(specFromRecipe(recipe)), expected: { id: recipe.id, title: recipe.title, mainId: recipe.mainId, cutId: recipe.generationInput?.cutId, methodId: recipe.methodId, regionId: recipe.regionId, sideId: recipe.sideId, servings: recipe.servings, diet: recipe.diet, ingredients: recipe.ingredients }, shoppingLines: recipe.ingredients.map(({ id, name, amount, unit, category, inPantry }) => ({ id, name, amount, unit, category, inPantry })) });
    } catch (error) {
      report.failedCases++; report.issueCounts.GENERATION_ERROR = (report.issueCounts.GENERATION_ERROR ?? 0) + 1;
      if (report.examples.length < 50) report.examples.push({ index, input, code: "GENERATION_ERROR", detail: String(error instanceof Error ? error.message : error).slice(0, 300) });
    }
    checked.push(index); report.checked++;
    if (report.checked % 500 === 0) {
      await new Promise(resolve => setImmediate(resolve));
      if (performance.now() - lastProgress > 10000) { save(); console.log(JSON.stringify({ checked: report.checked, scheduled, failedCases: report.failedCases, elapsedSeconds: report.elapsedSeconds })); lastProgress = performance.now(); }
    }
  }
  for (let row = 0; row < plan.rows.length && row * plan.samples < scheduled; row++) {
    const input = plan.inputAt(row * plan.samples + Math.min(7, plan.samples - 1));
    let issues;
    try { issues = inspectServingScale(generateMeal({ ...input, servings: 1 }), generateMeal({ ...input, servings: 12 }), input); }
    catch (error) { issues = [{ code: "SCALING_GENERATION_ERROR", detail: String(error instanceof Error ? error.message : error).slice(0, 300) }]; }
    report.servingScale.checkedPairs++;
    if (issues.length) {
      report.servingScale.failedPairs++;
      for (const issue of issues) {
        report.issueCounts[issue.code] = (report.issueCounts[issue.code] ?? 0) + 1;
        if (report.examples.length < 50 && report.examples.filter(example => example.code === issue.code).length < 5) report.examples.push({ input, ...issue });
      }
    }
    if (row % 100 === 0) await new Promise(resolve => setImmediate(resolve));
  }
  report.coverage = summarizeStratifiedCoverage(plan, checked);
  const finalSource = recipeAuditFingerprint();
  if (source.sha256 !== finalSource.sha256) { report.issueCounts.SOURCE_CHANGED = 1; report.finalSource = finalSource; }
  report.status = Object.keys(report.issueCounts).length ? "failed" : scheduled < plan.total ? "sample-passed" : "passed";
  report.finishedAt = new Date().toISOString(); save();
  if (options.witness) { mkdirSync(path.dirname(options.witness), { recursive: true }); writeFileSync(options.witness, JSON.stringify({ source, cases: witness }, null, 2)); }
  console.log(JSON.stringify({ status: report.status, checked: report.checked, failedCases: report.failedCases, issueCounts: report.issueCounts, elapsedSeconds: report.elapsedSeconds, report: options.report, witnessCases: witness.length }));
  return report.status === "failed" ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(error instanceof Error ? error.stack : error); process.exitCode = 2; }
}
