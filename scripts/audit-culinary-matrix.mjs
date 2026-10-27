#!/usr/bin/env node
/**
 * Opt-in catalogue audit. Node >=22.13 with --experimental-strip-types.
 *
 * Plan only: node --experimental-strip-types scripts/audit-culinary-matrix.mjs
 * Smoke:    node --experimental-strip-types scripts/audit-culinary-matrix.mjs --smoke 24 --report D:/audit/smoke.json
 * Full:     node --experimental-strip-types scripts/audit-culinary-matrix.mjs --full --report D:/audit/full.json
 * Optional: --phases authored,variants,cuts,diets,classics --fail-fast
 *
 * No network, deployment, recipe edits or large recipe snapshots. Full runs are
 * deliberately excluded from the normal test suite. Runtime source hashes and
 * actual coverage distinguish a completed full audit from a smoke sample.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SIDES, generateMeal, getMainsForDiet } from "../lib/meals.ts";
import { cutsForMethod, prepareCut } from "../lib/cut-method.ts";
import { canonAllergen } from "../lib/staples.ts";
import { CLASSICS, REGIONS, generateRecipe } from "../lib/recipes.ts";

/** @typedef {import('../lib/meal-types.ts').MealInput} MealInput */
/** @typedef {import('../lib/recipe-types.ts').Recipe} Recipe */
/** @typedef {import('../lib/recipe-types.ts').DietId} DietId */
/** @typedef {import('../lib/recipe-types.ts').RecipeInput} RecipeInput */

const DIETS = /** @type {const} */ (["balanced", "vegetarian", "vegan", "gluten-free", "dairy-free"]);
const HEATS = /** @type {const} */ (["gentle", "mild", "medium", "hot", "fiery"]);
const SERVINGS = [1, 2, 4, 6, 12];
const CLEAN_PRESETS = [
  undefined,
  { fewerBottles: true },
  { moreVegetables: true, simplerMethod: true },
  { cleanMode: true, pantryFirstClean: true },
  { fewerBottles: true, allowSecondBottle: true },
];
const MAIN_BY_ID = new Map(MAIN_INGREDIENTS.map((main) => [main.id, main]));
const MAIN_STEPS = {
  schnitzel: ["Shallow-fry until crisp"], patties: ["Cook the patties"],
  curry: ["Simmer the main"], braised: ["Braise gently"],
  poached: ["Poach gently", "Poach the eggs"], steamed: ["Steam the main", "Steam the eggs"],
  baked: ["Bake the main"], roasted: ["Roast the main"],
  "air-fried": ["Air-fry in batches"], grilled: ["Grill the main"],
  smoked: ["Rest, then slice or pull", "Lift the smoked main carefully"],
  "stir-fried": ["Stir-fry the main"], "pan-fried": ["Pan-fry the main"],
};

// These are instruction references, deliberately not pantry/substitution aliases.
// Each entry ties an existing classic ingredient ID to the exact authored phase
// that uses its shorter name. Unknown/orphan ingredients still fail the audit.
const CLASSIC_PHASE_REFERENCES = [
  ["chicken-thigh", ["Prepare the filling and crunch", "Sear the filling", "Roast until ready", "Build even skewers"], ["chicken", "thighs"]],
  ["corn-tortillas", ["Warm, fill and serve"], ["tortillas"]],
  ["vegetable-stock", ["Prepare the stock and vegetables", "Stir and simmer"], ["stock"]],
  ["rolled-oats", ["Make the patties"], ["oats"]],
  ["burger-buns", ["Toast and assemble"], ["buns"]],
  ["red-onion", ["Heat the oven and prepare", "Prepare the topping", "Build even skewers"], ["onion", "onions"]],
  ["brown-onion", ["Prepare the pulled filling", "Prepare links and onions", "Fill the shells", "Mix the loaf", "Mix the lentil loaf"], ["onion", "onions"]],
  ["jasmine-rice", ["Cook the rice"], ["rice"]],
  ["firm-tofu", ["Prepare the filling and crunch", "Prepare the vegetables", "Prepare the main", "Build even skewers", "Prepare the tray", "Prepare the plant roast", "Prepare the plant centrepiece", "Prepare measured-thickness pieces", "Cut upright strips", "Prepare boat strips", "Prepare thick bites", "Prepare separate skewers"], ["tofu"]],
  ["cherry-tomatoes", ["Prepare the topping"], ["tomatoes"]],
  ["beef-brisket", ["Prepare the brisket"], ["brisket"]],
  ["bbq-buns", ["Warm the buns"], ["buns"]],
  ["salmon-fillet", ["Prepare the main", "Hot-smoke with a probe"], ["fillet"]],
  ["bbq-flatbread", ["Warm the flatbread", "Toast the bread"], ["flatbread"]],
  ["young-jackfruit", ["Prepare the pulled filling"], ["jackfruit"]],
  ["bbq-rice", ["Cook fresh rice near serving time", "Cook the grain completely first"], ["rice"]],
  ["plant-sausages", ["Prepare links and onions", "Cook gently, then brown"], ["links"]],
  ["red-pepper", ["Smoke the vegetables gently", "Grill the substantial toppings"], ["pepper"]],
  ["pork-ribs", ["Prepare the rack", "Prepare the ribs", "Stand the ribs on the rack", "Prepare the rib portion"], ["ribs"]],
  ["plain-soy-yogurt", ["Make the dip base"], ["soy yogurt"]],
  ["whole-trout", ["Prepare the cleaned fish"], ["fish"]],
  ["portobello", ["Prepare the plant roast", "Prepare the plant centrepiece"], ["mushroom", "mushrooms"]],
  ["turkey-breast", ["Prepare the breast"], ["breast"]],
  ["cooked-octopus", ["Prepare the main"], ["octopus"]],
  ["flank-steak", ["Prepare an even steak"], ["steak"]],
  ["lamb-chops", ["Prepare measured-thickness pieces"], ["chops"]],
  ["king-oyster", ["Cut upright strips", "Prepare boat strips", "Build an open boat", "Cube the plant pieces", "Cut the plant strips", "Prepare the main"], ["mushrooms"]],
  ["meatloaf-crumbs", ["Mix without overworking", "Mix the loaf"], ["breadcrumbs"]],
  ["pork-shoulder", ["Prepare the shoulder"], ["shoulder"]],
  ["bbq-sausages", ["Prepare links and onions"], ["sausage links"]],
  ["sirloin-steak", ["Prepare thick steaks"], ["steaks"]],
  ["black-pepper", ["Make the dip base"], ["pepper"]],
  ["chicken-wings", ["Prepare dry wings"], ["wings"]],
  ["pork-belly", ["Prepare the belly slab"], ["belly slab"]],
  ["whole-chicken", ["Prepare without stuffing"], ["bone-in portions", "bird"]],
  ["jumbo-shells", ["Soften the shells", "Fill the shells"], ["jumbo pasta shells"]],
];
const CLASSIC_REFERENCES_BY_ID = new Map(CLASSIC_PHASE_REFERENCES.map(([id, titles, terms]) => [id, { titles, terms }]));

function seedFor(region, pair, variant) {
  return (Math.imul(region + 1, 0x9e3779b1) ^ Math.imul(pair + 1, 0x85ebca77) ^ Math.imul(variant + 1, 0xc2b2ae3d)) >>> 0;
}

/** Catalogue-sized factories permit a small stratified smoke without walking two million cases. */
export function buildAuditPlan() {
  const pairs = MAIN_INGREDIENTS.flatMap((main) => main.methodIds.map((methodId) => ({ mainId: main.id, methodId })));
  const cutPairs = pairs.flatMap((pair) => cutsForMethod(pair.mainId, pair.methodId).map((cut) => ({ ...pair, cut })));
  const compatible = new Map(DIETS.map((diet) => [diet, getMainsForDiet(diet).flatMap((main) => main.methodIds.map((methodId) => ({ mainId: main.id, methodId })))]));
  const regions = MEAL_REGIONS.length, sides = MEAL_SIDES.length;
  const base = (pair, regionIndex, sideIndex) => ({ ...pair, regionId: MEAL_REGIONS[regionIndex].id, sideId: MEAL_SIDES[sideIndex].id, servings: 4, diet: /** @type {DietId} */ ("balanced") });
  const phases = [
    {
      id: "authored", count: regions * pairs.length * sides,
      /** @returns {MealInput} */
      caseAt(index) {
        const sideIndex = index % sides, rest = Math.floor(index / sides);
        return base(pairs[rest % pairs.length], Math.floor(rest / pairs.length), sideIndex);
      },
      coverage: "Every region × supported default main/method × explicitly selected side; balanced, authored, four servings.",
    },
    {
      id: "variants", count: regions * pairs.length * HEATS.length,
      /** @returns {MealInput} */
      caseAt(index) {
        const variant = index % HEATS.length, rest = Math.floor(index / HEATS.length), pair = rest % pairs.length, region = Math.floor(rest / pairs.length);
        return { ...base(pairs[pair], region, index % sides), seed: seedFor(region, pair, variant), spiceHeat: HEATS[variant], servings: SERVINGS[variant], ...(CLEAN_PRESETS[variant] ? { clean: { ...CLEAN_PRESETS[variant] } } : {}) };
      },
      coverage: "Every region/main-method receives five seeded cases, all five heats and servings 1/2/4/6/12; cleaner knobs and all sides rotate.",
    },
    {
      id: "cuts", count: regions * cutPairs.length,
      /** @returns {MealInput} */
      caseAt(index) {
        const cutIndex = index % cutPairs.length, region = Math.floor(index / cutPairs.length), pair = cutPairs[cutIndex];
        const variant = (region + cutIndex) % HEATS.length;
        return { ...base({ mainId: pair.mainId, methodId: pair.methodId }, region, index % sides), cutId: pair.cut.id, servings: SERVINGS[variant], spiceHeat: HEATS[variant], ...((region + cutIndex) % 2 ? { seed: seedFor(region, cutIndex, variant) } : {}) };
      },
      coverage: "Every supported chosen-cut/method × every region; sides, heat, servings and authored/seeded cases rotate.",
    },
    {
      id: "diets", count: DIETS.length * regions * sides,
      /** @returns {MealInput} */
      caseAt(index) {
        const sideIndex = index % sides, rest = Math.floor(index / sides), region = rest % regions, diet = DIETS[Math.floor(rest / regions)];
        const choices = compatible.get(diet), pair = choices[(region * sides + sideIndex) % choices.length];
        return { ...base(pair, region, sideIndex), diet, servings: [1, 4, 12][index % 3], spiceHeat: HEATS[index % HEATS.length], ...(index % 2 ? { seed: seedFor(region, sideIndex, index % HEATS.length) } : {}) };
      },
      coverage: "Every diet × every region × every side; compatible main/methods rotate. This is not every dietary main/method Cartesian product.",
    },
    {
      id: "classics", count: CLASSICS.length * REGIONS.length * DIETS.length * 2,
      /** @returns {RecipeInput} */
      caseAt(index) {
        const seeded = index % 2, rest = Math.floor(index / 2), diet = DIETS[rest % DIETS.length];
        const rest2 = Math.floor(rest / DIETS.length), region = REGIONS[rest2 % REGIONS.length], classic = CLASSICS[Math.floor(rest2 / REGIONS.length)];
        return { classicId: classic.id, regionId: region.id, diet, servings: SERVINGS[index % SERVINGS.length], spiceHeat: HEATS[(rest2 + rest) % HEATS.length], ...(seeded ? { seed: 7 } : {}) };
      },
      coverage: "Every classic × classic regional profile × all five diets, authored and seed7; heat and servings rotate.",
    },
  ];
  return {
    catalogue: { regions, sides, defaultMainMethods: pairs.length, supportedCutMethods: cutPairs.length, diets: DIETS.length, classics: CLASSICS.length, classicRegions: REGIONS.length },
    phases, plannedTotal: phases.reduce((sum, phase) => sum + phase.count, 0),
  };
}

function phraseOccurs(lower, phrase) {
  const needle = phrase.trim().toLowerCase();
  if (!needle) return false;
  let index = lower.indexOf(needle);
  while (index !== -1) {
    const before = index === 0 ? "" : lower[index - 1], after = lower[index + needle.length] ?? "";
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    index = lower.indexOf(needle, index + 1);
  }
  return false;
}

function authoredClassicReference(recipe, item) {
  const reference = CLASSIC_REFERENCES_BY_ID.get(item.id);
  return reference && recipe.steps.some((step) => reference.titles.includes(step.title)
    && reference.terms.some((term) => phraseOccurs(step.detail.toLowerCase(), term)));
}

function authoredSideReference(recipe, item) {
  // The gluten-free product qualifier is essential for buying the correct
  // miso, while this authored glaze phase calls that measured product miso.
  // Keep this instruction-only recognition separate from shopping aliases.
  return item.id === "white-miso" && recipe.steps.some((step) => step.title === "Roast, then glaze the aubergine"
    && phraseOccurs(step.detail.toLowerCase(), "miso"));
}

const CUT_REQUIREMENTS = new Map();
function expectedTemperature(input, main) {
  if (["chicken", "turkey", "duck"].includes(main.id)) return "75°C";
  if (input.cutId) {
    const key = `${input.mainId}|${input.methodId}|${input.cutId}`;
    if (!CUT_REQUIREMENTS.has(key)) {
      const cut = cutsForMethod(input.mainId, input.methodId).find((candidate) => candidate.id === input.cutId);
      const prep = cut && prepareCut(cut, input.methodId);
      CUT_REQUIREMENTS.set(key, { cut, temperature: prep?.endpoint.match(/\b(?:63|71|75)°C/)?.[0] });
    }
    const required = CUT_REQUIREMENTS.get(key)?.temperature;
    if (required) return required;
  }
  if (input.methodId === "patties" || input.methodId === "schnitzel" && main.category === "meat") return "75°C";
  return main.category === "seafood" ? "63°C" : "71°C";
}

/** Strict structural/content checks. Findings contain identifiers, not full recipe payloads. */
/** @param {Recipe} recipe @param {MealInput | RecipeInput} input */
export function inspectRecipe(recipe, input) {
  /** @type {{code:string,detail:string}[]} */
  const issues = [];
  const fail = (code, detail) => issues.push({ code, detail: String(detail).slice(0, 260) });
  const classic = "classicId" in input;
  const identityKeys = classic ? ["classicId", "regionId", "servings"] : ["mainId", "methodId", "regionId", "sideId", "servings"];
  for (const key of identityKeys) if (recipe[key] !== input[key]) fail("SELECTION_CHANGED", `${key}: requested ${input[key]}, got ${recipe[key]}`);
  if (classic ? recipe.kind === "meal" : recipe.kind !== "meal" || recipe.generation !== "authored") fail("RECIPE_KIND", classic ? "Expected classic generation." : "Expected authored complete-meal generation.");
  if (recipe.diet !== (input.diet ?? "balanced") || recipe.spiceHeat !== (input.spiceHeat ?? "medium")) fail("SETTINGS_CHANGED", "Diet or heat differs from requested settings.");
  if (![recipe.prepMinutes, recipe.cookMinutes, recipe.totalMinutes].every((minutes) => Number.isFinite(minutes) && minutes > 0) || Math.abs(recipe.prepMinutes + recipe.cookMinutes - recipe.totalMinutes) > 0.0001) fail("INVALID_TIME", "Times must be finite, positive and total prep plus cook.");
  if (!recipe.ingredients.length || recipe.ingredients.some((item) => !item.id || !item.name || !Number.isFinite(item.amount) || item.amount <= 0)) fail("INVALID_INGREDIENT", "Ingredient identity or positive finite quantity missing.");
  if (new Set(recipe.ingredients.map((item) => item.id)).size !== recipe.ingredients.length) fail("DUPLICATE_INGREDIENT_ID", "A shopping ingredient identifier is repeated.");
  if (!classic && !recipe.ingredients.some((item) => item.id === input.mainId)) fail("MAIN_MISSING", input.mainId);
  if (!recipe.steps.length || recipe.steps.some((step) => !step.title || !step.detail || step.minutes !== undefined && (!Number.isFinite(step.minutes) || step.minutes < 0))) fail("INVALID_STEP", "Every step needs text and valid timing when specified.");
  const text = recipe.steps.map((step) => step.detail).join(" "), lower = text.toLowerCase();
  if (/undefined|\bNaN\b|\$\{/.test(text)) fail("BROKEN_INSTRUCTION", "Unresolved value or interpolation in method text.");
  for (const item of recipe.ingredients) if (!lower.includes(item.name.toLowerCase()) && !lower.includes(item.id.replaceAll("-", " ")) && !(item.aliases ?? []).some((alias) => phraseOccurs(lower, alias)) && !authoredSideReference(recipe, item) && !(classic && authoredClassicReference(recipe, item))) fail("UNUSED_INGREDIENT", `${item.id}: ${item.name}`);
  const ingredientAllergens = [...new Set(recipe.ingredients.flatMap((item) => item.allergens).map(canonAllergen))].sort();
  const recipeAllergens = [...new Set(recipe.allergens.map(canonAllergen))].sort();
  if (ingredientAllergens.join("|") !== recipeAllergens.join("|")) fail("ALLERGEN_TAG_MISMATCH", `Ingredients ${ingredientAllergens.join(",")} / recipe ${recipeAllergens.join(",")}`);
  const diet = input.diet ?? "balanced";
  if ((diet === "vegan" || diet === "vegetarian") && recipe.ingredients.some((item) => ["butcher", "fishmonger"].includes(item.category))) fail("ANIMAL_MAIN_IN_PLANT_DIET", diet);
  const forbidden = diet === "vegan" ? ["milk", "egg", "fish", "crustacean", "mollusc"] : diet === "dairy-free" ? ["milk"] : diet === "gluten-free" ? ["wheat", "barley", "rye", "oats", "gluten"] : [];
  if (forbidden.some((allergen) => ingredientAllergens.includes(allergen))) fail("DIET_ALLERGEN_LEAK", `${diet}: ${ingredientAllergens.filter((allergen) => forbidden.includes(allergen)).join(",")}`);
  const finishIndexes = recipe.steps.flatMap((step, index) => (classic ? step.finishBoundary === true : step.title === "Finish the regional sauce") ? [index] : []);
  if (finishIndexes.length !== 1) fail("REGIONAL_FINISH_COUNT", `Expected one final regional sauce finish, got ${finishIndexes.length}.`);
  if (!classic) {
    const mainTitles = MAIN_STEPS[input.methodId] ?? [];
    const mainIndex = recipe.steps.findIndex((step) => mainTitles.includes(step.title));
    if (mainIndex < 0) fail("MAIN_COOKING_STEP_MISSING", `${input.methodId}: expected ${mainTitles.join(" / ")}`);
    if (finishIndexes.length === 1 && mainIndex >= finishIndexes[0]) fail("FINISH_BEFORE_MAIN", "Delicate regional finish occurs before the main cooking step.");
  }
  const addedPreparation = recipe.steps.findIndex((step) => step.title === "Prepare the finishing ingredients");
  if (finishIndexes.length === 1 && addedPreparation >= finishIndexes[0]) fail("LATE_SEEDED_PREPARATION", "Seeded ingredient preparation occurs after the delicate regional finish.");
  const main = !classic && MAIN_BY_ID.get(input.mainId);
  if (main && ["meat", "seafood"].includes(main.category)) {
    const temperature = expectedTemperature(input, main);
    if (!text.includes(temperature) || !recipe.safetyNote?.includes(temperature)) fail("MISSING_ENDPOINT", `${input.mainId}/${input.cutId ?? "default"}: expected ${temperature} in method and safety note.`);
    if (!recipe.equipment.includes("Food thermometer")) fail("THERMOMETER_MISSING", input.mainId);
    if (!/^https:\/\/www\.(?:foodstandards|foodauthority\.nsw|fsis\.usda)\.gov(?:\.au)?\//.test(recipe.safetySource ?? "")) fail("PRIMARY_SAFETY_SOURCE_MISSING", recipe.safetySource ?? "none");
  }
  if (classic && input.classicId !== "cold-smoked-platter" && recipe.ingredients.some((item) => ["butcher", "fishmonger"].includes(item.category))) {
    const temperature = recipe.safetyNote?.match(/\b(?:63|71|75)°C/)?.[0];
    if (!temperature || !text.includes(temperature)) fail("MISSING_ENDPOINT", "Classic animal-main endpoint must appear in both its safety note and method.");
    if (!recipe.equipment.some((item) => /food thermometer/i.test(item))) fail("THERMOMETER_MISSING", input.classicId);
    if (!/^https:\/\/www\.(?:foodstandards|foodauthority\.nsw|fsis\.usda)\.gov(?:\.au)?\//.test(recipe.safetySource ?? "")) fail("PRIMARY_SAFETY_SOURCE_MISSING", recipe.safetySource ?? "none");
  }
  if (!classic && input.mainId === "eggs" && (!/firm/.test(lower) || !/firm/.test(recipe.safetyNote ?? ""))) fail("EGG_ENDPOINT_MISSING", "Firm egg endpoint missing.");
  if ((!classic || recipe.methodNotes !== undefined) && (!recipe.methodNotes?.length || recipe.methodNotes.some((note) => typeof note !== "string" || !note.trim() || /undefined|\bNaN\b|\$\{/.test(note)))) fail("METHOD_NOTES_MISSING", "Method notes must contain usable guidance when provided; all complete meals require them.");
  if (!recipe.equipment.length || recipe.equipment.some((item) => typeof item !== "string" || !item.trim())) fail("EQUIPMENT_MISSING", "Equipment list is empty or malformed.");
  if (!classic && input.cutId && recipe.generationInput?.cutId !== input.cutId) fail("CUT_IDENTITY_LOST", input.cutId);
  return issues;
}

function sourceFingerprint() {
  const root = fileURLToPath(new URL("../lib/", import.meta.url));
  const files = readdirSync(root).filter((file) => file.endsWith(".ts")).sort();
  const hash = createHash("sha256");
  for (const file of files) hash.update(file).update("\0").update(readFileSync(path.join(root, file))).update("\0");
  return { sha256: hash.digest("hex"), files: files.length };
}

export function sampleIndexes(count, limit) {
  if (limit >= count) return Array.from({ length: count }, (_, index) => index);
  if (limit <= 1) return [0];
  return [...new Set(Array.from({ length: limit }, (_, index) => Math.floor(index * (count - 1) / (limit - 1))))];
}

function optionsFrom(argv) {
  const options = { mode: "plan", report: "", smoke: 24, phases: ["authored", "variants", "cuts", "diets", "classics"], failFast: false };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--full") options.mode = "full";
    else if (value === "--smoke") { options.mode = "smoke"; if (/^\d+$/.test(argv[index + 1] ?? "")) options.smoke = Number(argv[++index]); }
    else if (value === "--report") options.report = argv[++index] ?? "";
    else if (value === "--phases") options.phases = (argv[++index] ?? "").split(",");
    else if (value === "--fail-fast") options.failFast = true;
    else if (value === "--help" || value === "-h") options.mode = "help";
    else if (!value.startsWith("-") && !options.report) options.report = value;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!Number.isInteger(options.smoke) || options.smoke < 1 || options.smoke > 10_000) throw new Error("Choose 1–10000 smoke samples per phase.");
  if (!options.phases.length || options.phases.some((phase) => !["authored", "variants", "cuts", "diets", "classics"].includes(phase)) || new Set(options.phases).size !== options.phases.length) throw new Error("Choose unique phases from authored,variants,cuts,diets,classics.");
  if (["full", "smoke"].includes(options.mode) && (!options.report || !path.isAbsolute(options.report))) throw new Error("Pass --report with an absolute output JSON path (use D: on this workstation).");
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = optionsFrom(argv), plan = buildAuditPlan();
  const phases = plan.phases.filter((phase) => options.phases.includes(phase.id));
  const counts = Object.fromEntries(phases.map((phase) => [phase.id, phase.count]));
  const plannedTotal = phases.reduce((sum, phase) => sum + phase.count, 0);
  console.log(JSON.stringify({ mode: options.mode, catalogue: plan.catalogue, planned: counts, plannedTotal }));
  if (options.mode === "help") { console.log("Use --full or --smoke [samples-per-phase] --report ABSOLUTE.json. Optional --phases authored,variants,cuts,diets,classics --fail-fast. No mode runs plan only."); return 0; }
  if (options.mode === "plan") return 0;
  const started = performance.now(), fingerprint = sourceFingerprint();
  const report = {
    schemaVersion: 1, mode: options.mode, status: "running", startedAt: new Date().toISOString(), finishedAt: null,
    node: process.version, catalogue: plan.catalogue, source: fingerprint,
    planned: counts, plannedTotal, checked: 0, failedCases: 0, violations: 0, elapsedSeconds: 0,
    phases: phases.map((phase) => ({ id: phase.id, planned: phase.count, scheduled: options.mode === "full" ? phase.count : Math.min(phase.count, options.smoke), checked: 0, failedCases: 0, coverage: phase.coverage })),
    checks: ["selected identity/settings", "positive finite quantities and total time", "unique ingredient IDs", "ingredient name, ID or authored whole-phrase alias occurs in method", "exact allergen-tag union and diet exclusions", "one explicit regional finish; complete-meal finish after main", "seeded preparation before delicate finish", "animal endpoint/source/thermometer", "usable method notes/equipment", "chosen cut retained"],
    issueCounts: {}, examples: [],
    limits: ["This checks authored content and recorded ingredient tags, not actual cooking, taste, packet contents or cross-contact.", "All authored balanced combinations are exhaustive only after a completed full authored phase.", "Seed/heat/serving/clean and cut/diet variants use the stated rotating cases, not every possible input Cartesian product.", "Source hash covers local lib/*.ts at start and end; changing source invalidates the run."],
  };
  mkdirSync(path.dirname(options.report), { recursive: true });
  const save = () => { report.elapsedSeconds = Math.round((performance.now() - started) / 100) / 10; writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`); };
  let interrupted = false, lastProgress = started;
  const interrupt = () => { interrupted = true; };
  process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
  save();
  for (const [phaseIndex, phase] of phases.entries()) {
    const current = report.phases[phaseIndex];
    const indexes = options.mode === "smoke" ? sampleIndexes(phase.count, options.smoke) : null;
    const scheduled = indexes?.length ?? phase.count;
    for (let position = 0; position < scheduled; position++) {
      if (interrupted) break;
      const ordinal = indexes ? indexes[position] : position, input = phase.caseAt(ordinal);
      let issues;
      try { issues = inspectRecipe("classicId" in input ? generateRecipe(input) : generateMeal(input), input); }
      catch (error) { issues = [{ code: "GENERATION_ERROR", detail: (error instanceof Error ? error.message : String(error)).slice(0, 260) }]; }
      report.checked++; current.checked++;
      if (issues.length) {
        report.failedCases++; current.failedCases++; report.violations += issues.length;
        for (const issue of issues) {
          report.issueCounts[issue.code] = (report.issueCounts[issue.code] ?? 0) + 1;
          if (report.examples.length < 40 && report.examples.filter((example) => example.code === issue.code).length < 4) report.examples.push({ phase: phase.id, ordinal, ...issue, input });
        }
        if (options.failFast) break;
      }
      if (report.checked % 500 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
        if (performance.now() - lastProgress >= 10_000) {
          save(); console.log(JSON.stringify({ phase: phase.id, checked: report.checked, scheduled: report.phases.reduce((sum, entry) => sum + entry.scheduled, 0), failedCases: report.failedCases, elapsedSeconds: report.elapsedSeconds }));
          lastProgress = performance.now();
        }
      }
    }
    save();
    console.log(JSON.stringify({ phase: phase.id, checked: current.checked, planned: current.planned, failedCases: current.failedCases }));
    if (interrupted || options.failFast && report.failedCases) break;
  }
  const finalFingerprint = sourceFingerprint();
  if (finalFingerprint.sha256 !== fingerprint.sha256) {
    report.issueCounts.SOURCE_CHANGED = 1; report.violations++;
    report.source = { ...fingerprint, changedDuringRun: true, finalSha256: finalFingerprint.sha256 };
  }
  const completed = report.phases.every((phase) => phase.checked === phase.scheduled);
  report.status = interrupted ? "interrupted" : !completed ? "stopped-on-failure" : report.violations ? "failed" : options.mode === "full" ? "passed" : "smoke-passed";
  report.finishedAt = new Date().toISOString(); save();
  process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);
  console.log(JSON.stringify({ status: report.status, checked: report.checked, failedCases: report.failedCases, violations: report.violations, elapsedSeconds: report.elapsedSeconds, report: options.report }));
  return interrupted ? 130 : report.violations || !completed ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; }
}
