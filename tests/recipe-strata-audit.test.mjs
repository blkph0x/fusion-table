import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStratifiedAuditPlan, summarizeStratifiedCoverage, selectLiveWitnessIndices, inspectStratifiedRecipe, inspectServingScale, inspectShareRebuild } from "../scripts/audit-recipe-strata.mjs";
import { generateMeal } from "../lib/meals.ts";

test("stratified audit provides fifty distinct cases for every compatible cooking row", () => {
  const plan = buildStratifiedAuditPlan();
  assert.equal(plan.total, 47_050);
  assert.equal(plan.rows.length, 907);
  const coverage = summarizeStratifiedCoverage(plan);
  assert.equal(coverage.uniqueInputs, plan.total);
  for (const dimension of ["main", "method", "mainMethod", "cookingRow", "cut", "region", "side", "classic", "classicRegion", "diet", "heat", "servings"]) assert.ok(coverage.dimensions[dimension].minimum >= 50, dimension);
  assert.equal(coverage.dimensions.cookingRow.minimum, 50);
  assert.equal(coverage.dimensions.cookingRow.maximum, 50);
  assert.equal(coverage.dimensions.main.groups, 30);
  assert.equal(coverage.dimensions.cut.groups, 87);
  assert.equal(coverage.dimensions.method.groups, 13);
  assert.equal(coverage.dimensions.region.groups, 76);
  assert.equal(coverage.dimensions.side.groups, 90);
  assert.throws(() => buildStratifiedAuditPlan(0), /samples/);
  assert.throws(() => plan.inputAt(plan.total), /outside/);
});

test("fifty live witnesses cover every main and cooking method with distinct regions and sides", () => {
  const plan = buildStratifiedAuditPlan(), first = selectLiveWitnessIndices(plan);
  assert.deepEqual(first, selectLiveWitnessIndices(plan));
  assert.equal(first.length, 50);
  assert.equal(new Set(first).size, 50);
  const inputs = first.map(index => plan.inputAt(index));
  assert.equal(new Set(inputs.map(input => input.mainId)).size, 30);
  assert.equal(new Set(inputs.map(input => input.methodId)).size, 13);
  assert.equal(new Set(inputs.map(input => input.regionId)).size, 50);
  assert.equal(new Set(inputs.map(input => input.sideId)).size, 50);
  for (const id of ["chicken-whole", "chicken-liver", "beef-brisket", "lamb-shank", "beef-mince"]) assert.ok(inputs.some(input => input.cutId === id), id);
  for (const input of inputs) {
    const recipe = generateMeal(input);
    assert.deepEqual(inspectStratifiedRecipe(recipe, input), [], JSON.stringify(input));
    assert.deepEqual(inspectShareRebuild(recipe), [], JSON.stringify(input));
  }
});

test("share reconstruction catches a saved recipe that no longer matches its token", () => {
  const input = { mainId: "chicken", methodId: "grilled", regionId: "thai", sideId: "roast-veg-tray", servings: 2 };
  const recipe = generateMeal(input);
  assert.deepEqual(inspectShareRebuild(recipe), []);
  recipe.ingredients[0].amount += 1;
  assert.ok(inspectShareRebuild(recipe).some(issue => issue.code === "SHARE_REBUILD_CHANGED"));
});

test("audit rejects injected main-seasoning leaks while preserving an explicit fusion side", () => {
  const input = { mainId: "chicken", methodId: "grilled", regionId: "italian", sideId: "garden-salad", servings: 4 };
  const recipe = generateMeal(input);
  recipe.ingredients.push({ id: "kimchi", name: "Kimchi", amount: 20, unit: "g", category: "grocery", allergens: [], inPantry: false });
  recipe.steps.push({ title: "Serve", detail: "Serve the Kimchi.", minutes: 1 });
  assert.ok(inspectStratifiedRecipe(recipe, input).some(issue => issue.code === "NON_SIDE_REGIONAL_MARKER"));
  const sideInput = { ...input, sideId: "kimchi-rice" };
  assert.ok(!inspectStratifiedRecipe(generateMeal(sideInput), sideInput).some(issue => issue.code === "NON_SIDE_REGIONAL_MARKER"));
});

test("independent audit detects portion, duration and serving-scale corruption", () => {
  const input = { mainId: "chicken", methodId: "grilled", regionId: "thai", sideId: "rice-greens", servings: 1, seed: 987 };
  const small = generateMeal(input), large = generateMeal({ ...input, servings: 12 });
  assert.deepEqual(inspectServingScale(small, large, input), []);
  large.ingredients.find(item => item.id === "chicken").amount += 1;
  assert.ok(inspectServingScale(small, large, input).some(issue => issue.code === "SCALING_QUANTITY"));
  const corrupted = structuredClone(small);
  corrupted.ingredients.find(item => item.id === "chicken").amount = 9000;
  corrupted.steps[0].minutes = corrupted.totalMinutes + 10;
  const codes = new Set(inspectStratifiedRecipe(corrupted, input).map(issue => issue.code));
  assert.ok(codes.has("MAIN_PORTION_OUTLIER"));
  assert.ok(codes.has("STEP_EXCEEDS_TOTAL_WINDOW"));
});

test("whole birds scale as whole purchases rather than fractional carcasses", () => {
  const input = { mainId: "chicken", cutId: "chicken-whole", methodId: "roasted", regionId: "home-kitchen", sideId: "garden-salad", servings: 1, seed: 777 };
  const small = generateMeal(input), large = generateMeal({ ...input, servings: 12 });
  assert.equal(small.ingredients.find(item => item.id === "chicken").amount, 1);
  assert.equal(large.ingredients.find(item => item.id === "chicken").amount, 3);
  assert.deepEqual(inspectServingScale(small, large, input), []);
  assert.deepEqual(inspectStratifiedRecipe(small, input), []);
});

test("audit detects repeated rest instructions and a smoke phase that overruns its total", () => {
  const input = { mainId: "pork", cutId: "pork-belly", methodId: "smoked", regionId: "thai", sideId: "garden-salad", servings: 4 };
  const recipe = generateMeal(input);
  assert.deepEqual(inspectStratifiedRecipe(recipe, input), []);
  const start = recipe.steps.find(step => step.title === "Start the hot smoke");
  const rest = recipe.steps.find(step => step.title === "Rest, then slice or pull");
  start.minutes = 180; start.detail += " Rest 10 minutes.";
  rest.detail += " Rest 20 minutes, then slice."; rest.minutes = 100;
  const codes = new Set(inspectStratifiedRecipe(recipe, input).map(issue => issue.code));
  for (const code of ["SMOKE_REST_REPEATED", "SMOKE_REST_DURING_COOK", "SMOKE_REST_TIME_CONFLICT", "SMOKE_STAGES_EXCEED_COOK_TIME"]) assert.ok(codes.has(code), code);
});
