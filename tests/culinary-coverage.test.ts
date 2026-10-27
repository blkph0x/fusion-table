import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAuditPlan, inspectRecipe, sampleIndexes } from "../scripts/audit-culinary-matrix.mjs";
import { generateMeal, MEAL_REGIONS, MEAL_SIDES } from "../lib/meals.ts";
import { CLASSICS, REGIONS, generateRecipe } from "../lib/recipes.ts";
import type { MealInput } from "../lib/meal-types.ts";

test("opt-in audit plans the complete authored matrix without generating it during normal tests", () => {
  const plan = buildAuditPlan();
  assert.deepEqual(plan.catalogue, { regions: 76, sides: 90, defaultMainMethods: 266, supportedCutMethods: plan.catalogue.supportedCutMethods, diets: 5, classics: CLASSICS.length, classicRegions: REGIONS.length });
  assert.equal(plan.phases.find((phase) => phase.id === "authored")!.count, 1_819_440);
  assert.equal(plan.plannedTotal, plan.phases.reduce((sum, phase) => sum + phase.count, 0));
  for (const phase of plan.phases) {
    for (const index of sampleIndexes(phase.count, 9)) {
      const input = phase.caseAt(index);
      if ("classicId" in input) {
        assert.ok(REGIONS.some((region) => region.id === input.regionId));
        assert.ok(CLASSICS.some((classic) => classic.id === input.classicId));
      } else {
        assert.ok(MEAL_REGIONS.some((region) => region.id === input.regionId));
        assert.ok(MEAL_SIDES.some((side) => side.id === input.sideId));
      }
    }
  }
});

test("every region/main-method receives all five seeded heat/serving presets, rotating every side", () => {
  const phase = buildAuditPlan().phases.find((phase) => phase.id === "variants")!;
  const sideIds = new Set<string>(), regions = new Set<string>();
  for (let index = 0; index < phase.count; index += 5) {
    const cases = Array.from({ length: 5 }, (_, variant) => phase.caseAt(index + variant)) as MealInput[];
    assert.equal(new Set(cases.map((input) => `${input.regionId}|${input.mainId}|${input.methodId}`)).size, 1);
    assert.deepEqual(new Set(cases.map((input) => input.spiceHeat)), new Set(["gentle", "mild", "medium", "hot", "fiery"]));
    assert.deepEqual(cases.map((input) => input.servings), [1, 2, 4, 6, 12]);
    assert.ok(cases.every((input) => Number.isInteger(input.seed) && input.seed! >= 0 && input.seed! <= 0xffffffff));
    for (const input of cases) { sideIds.add(input.sideId!); regions.add(input.regionId); }
  }
  assert.equal(regions.size, 76);
  assert.equal(sideIds.size, 90);
});

test("audit detects substantive content and quantity failures with small real fixtures", () => {
  const input: MealInput = { mainId: "chicken", methodId: "grilled", regionId: "thai", sideId: "rice-greens", servings: 2 };
  const recipe = generateMeal(input);
  assert.deepEqual(inspectRecipe(recipe, input), []);
  const corrupted = structuredClone(recipe);
  corrupted.mainId = "beef";
  corrupted.ingredients.push({ ...corrupted.ingredients[0], amount: 0 });
  corrupted.ingredients.push({ id: "unmentioned-extra", name: "Unmentioned mystery ingredient", amount: 1, unit: "g", category: "grocery", inPantry: false, allergens: ["mustard"] });
  corrupted.totalMinutes += 1;
  corrupted.steps = corrupted.steps.filter((step) => step.title !== "Finish the regional sauce").map((step) => ({ ...step, detail: step.detail.replaceAll("75°C", "") }));
  corrupted.safetyNote = "Missing endpoint";
  corrupted.methodNotes = [];
  const codes = new Set(inspectRecipe(corrupted, input).map((issue) => issue.code));
  for (const code of ["SELECTION_CHANGED", "INVALID_TIME", "INVALID_INGREDIENT", "DUPLICATE_INGREDIENT_ID", "UNUSED_INGREDIENT", "ALLERGEN_TAG_MISMATCH", "REGIONAL_FINISH_COUNT", "MISSING_ENDPOINT", "METHOD_NOTES_MISSING"]) assert.ok(codes.has(code), code);
});

test("smoke indices are bounded, unique and include the edges of each phase", () => {
  assert.deepEqual(sampleIndexes(1_819_440, 3), [0, 909719, 1819439]);
  assert.deepEqual(sampleIndexes(2, 5), [0, 1]);
  assert.deepEqual(sampleIndexes(10, 1), [0]);
});

test("audit accepts authored side aliases and classic cold-service boundaries without weakening unused checks", () => {
  const input: MealInput = { mainId: "chicken", methodId: "grilled", regionId: "italian", sideId: "banana-leaf-rice", servings: 2 };
  assert.deepEqual(inspectRecipe(generateMeal(input), input), []);
  const misoInput: MealInput = { ...input, regionId: "indonesian", methodId: "schnitzel", sideId: "miso-aubergine-rice", diet: "gluten-free" };
  const misoRecipe = generateMeal(misoInput);
  assert.deepEqual(inspectRecipe(misoRecipe, misoInput), []);
  const orphanedMiso = structuredClone(misoRecipe);
  orphanedMiso.steps = orphanedMiso.steps.filter((step) => step.title !== "Roast, then glaze the aubergine");
  assert.ok(inspectRecipe(orphanedMiso, misoInput).some((issue) => issue.code === "UNUSED_INGREDIENT" && issue.detail.startsWith("white-miso:")));
  for (const classicId of ["pasta", "burgers", "cold-smoked-platter"]) {
    const input = { classicId, regionId: "japanese", servings: 2, seed: 7 };
    assert.deepEqual(inspectRecipe(generateRecipe(input), input), []);
  }
  const classicInput = { classicId: "burgers", regionId: "japanese", servings: 2 };
  const classic = generateRecipe(classicInput);
  const orphanedBuns = structuredClone(classic);
  orphanedBuns.steps = orphanedBuns.steps.filter((step) => step.title !== "Toast and assemble");
  assert.ok(inspectRecipe(orphanedBuns, classicInput).some((issue) => issue.code === "UNUSED_INGREDIENT" && issue.detail.startsWith("burger-buns:")));
});

test("classic ingredient references require the verified authored cooking phase", () => {
  const cases = [
    ["bbq-pulled-protein", "balanced"], ["grilled-skewers", "balanced"], ["bbq-sausages", "gluten-free"],
    ["reverse-seared-steak", "balanced"], ["bbq-ribs", "vegetarian"], ["smoked-cheese-dip", "balanced"],
    ["smoked-grain-bowl", "balanced"], ["bbq-wings", "balanced"], ["smoked-pork-belly", "balanced"],
    ["grill-roasted-whole-chicken", "balanced"], ["grilled-prawns", "vegetarian"], ["shotgun-shells", "gluten-free"],
    ["smoked-meatloaf", "vegetarian"], ["charred-octopus", "vegan"],
  ] as const;
  for (const [classicId, diet] of cases) {
    const input = { classicId, diet, regionId: "japanese", servings: 2, seed: 7 };
    assert.deepEqual(inspectRecipe(generateRecipe(input), input), [], classicId);
  }
  const input = { classicId: "bbq-pulled-protein", regionId: "japanese", servings: 1 };
  const orphaned = generateRecipe(input);
  orphaned.steps = orphaned.steps.map((step) => step.title === "Prepare the shoulder" ? { ...step, title: "Unrelated phase" } : step);
  assert.ok(inspectRecipe(orphaned, input).some((issue) => issue.code === "UNUSED_INGREDIENT" && issue.detail.startsWith("pork-shoulder:")));
});
