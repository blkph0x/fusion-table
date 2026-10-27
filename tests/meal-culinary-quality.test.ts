import assert from "node:assert/strict";
import { test } from "node:test";
import { generateMeal, MAIN_INGREDIENTS, MEAL_REGIONS } from "../lib/meals.ts";
import { recipeFromShare, specFromRecipe } from "../lib/share-recipe.ts";

test("Thai schnitzel keeps a crisp coating and cooks paste before liquid, with fresh finishing at service", () => {
  const recipe = generateMeal({ mainId: "chicken", methodId: "schnitzel", regionId: "thai", sideId: "garden-salad", servings: 4 });
  const crumb = recipe.steps.findIndex(step => step.title === "Crumb the schnitzel");
  const base = recipe.steps.findIndex(step => step.title === "Make the regional sauce base");
  const fry = recipe.steps.findIndex(step => step.title === "Shallow-fry until crisp");
  const finish = recipe.steps.findIndex(step => step.title === "Finish the regional sauce");
  assert.ok(crumb < base && base < fry && fry < finish);
  assert.match(recipe.steps[crumb].detail, /refrigerate for 5–10 minutes while making the sauce base/);
  assert.ok(recipe.steps[base].detail.indexOf("red curry paste") < recipe.steps[base].detail.indexOf("Pour in"));
  assert.match(recipe.steps[base].detail, /Fry gently.*before adding the liquid/);
  assert.doesNotMatch(recipe.steps[base].detail, /lime juice|fresh coriander/);
  assert.match(recipe.steps[finish].detail, /Off the heat.*lime juice/);
  assert.match(recipe.steps[finish].detail, /alongside the crisp coating/);
  assert.match(recipe.steps[fry].detail, /75°C/);
  const seeded = generateMeal({ mainId: "chicken", methodId: "schnitzel", regionId: "thai", sideId: "garden-salad", servings: 4, seed: 7 });
  assert.match(seeded.components.sauce, /^red curry paste, coconut milk/);
});

test("Japanese braising adds miso only after the main endpoint and removes woody infusions before service", () => {
  const recipe = generateMeal({ mainId: "chicken", methodId: "braised", regionId: "japanese", sideId: "rice-greens", servings: 2 });
  const base = recipe.steps.find(step => step.title === "Build the braising base")!;
  const simmer = recipe.steps.findIndex(step => step.title === "Braise gently");
  const finish = recipe.steps.findIndex(step => step.title === "Finish the regional sauce");
  assert.doesNotMatch(base.detail, /white miso/);
  assert.ok(finish > simmer);
  assert.match(recipe.steps[simmer].detail, /75°C/);
  assert.match(recipe.steps[finish].detail, /endpoint.*off the heat.*white miso/);
  const thai = generateMeal({ mainId: "chicken", methodId: "curry", regionId: "thai-green", sideId: "rice-greens", servings: 2 });
  assert.match(thai.steps.find(step => step.title === "Finish the regional sauce")!.detail, /lift out and discard.*lime leaves.*before the final garnishes/);
});

test("Chinese stir-fry coating is chilled, uses the existing oil portions and survives sharing and scaling", () => {
  for (const servings of [1, 2, 4, 8]) {
    const recipe = generateMeal({ mainId: "beef", methodId: "stir-fried", regionId: "chinese", sideId: "rice-greens", servings });
    const coating = recipe.steps.find(step => step.title === "Coat and chill the stir-fry slices")!;
    const fry = recipe.steps.find(step => step.title === "Stir-fry the main")!;
    assert.ok(coating);
    assert.match(coating.detail, /refrigerate at 5°C or colder for 15 minutes/);
    assert.doesNotMatch(coating.detail, /room temperature|rinse|bicarbonate|egg white/i);
    assert.match(fry.detail, /remaining pan portion after the coating/);
    assert.ok(recipe.prepMinutes >= 30);
    const starch = recipe.ingredients.find(item => item.id === "cornflour")!;
    assert.ok(coating.detail.includes(`${starch.amount} g cornflour`));
    assert.deepEqual(recipeFromShare(specFromRecipe(recipe)).steps, recipe.steps);
  }
  const excluded = generateMeal({ mainId: "beef", methodId: "stir-fried", regionId: "chinese", sideId: "rice-greens", servings: 2, dislikes: ["corn"] });
  assert.ok(!excluded.ingredients.some(item => item.id === "cornflour"));
  assert.ok(!excluded.steps.some(step => step.title === "Coat and chill the stir-fry slices"));
});

test("every main/method and regional profile receives one final sauce finish with consistent timing", () => {
  let checked = 0;
  for (const region of MEAL_REGIONS) for (const seed of [undefined, 7]) {
    const recipe = generateMeal({ mainId: "chicken", methodId: "grilled", regionId: region.id, sideId: "garden-salad", servings: 3, ...(seed === undefined ? {} : { seed }) });
    assert.equal(recipe.steps.filter(step => step.title === "Finish the regional sauce").length, 1, recipe.id);
    assert.equal(recipe.totalMinutes, recipe.prepMinutes + recipe.cookMinutes);
    const finish = recipe.steps.findIndex(step => step.title === "Finish the regional sauce");
    assert.ok(finish > recipe.steps.findIndex(step => step.title === "Grill the main"), recipe.id);
    checked++;
  }
  for (const main of MAIN_INGREDIENTS) for (const methodId of main.methodIds) {
    const recipe = generateMeal({ mainId: main.id, methodId, regionId: "thai", sideId: "garden-salad", servings: 2 });
    assert.equal(recipe.steps.filter(step => step.title === "Finish the regional sauce").length, 1, recipe.id);
    assert.ok(recipe.ingredients.every(item => Number.isFinite(item.amount) && item.amount > 0), recipe.id);
    assert.ok(recipe.cookMinutes >= 3 && recipe.totalMinutes === recipe.prepMinutes + recipe.cookMinutes);
    checked++;
  }
  assert.equal(checked, MEAL_REGIONS.length * 2 + 266);
});

test("long smokes schedule the sauce near service and include the actual rest", () => {
  const recipe = generateMeal({ mainId: "beef", methodId: "smoked", regionId: "thai", sideId: "garden-salad", servings: 2 });
  const smoke = recipe.steps.findIndex(step => step.title === "Start the hot smoke");
  const sauce = recipe.steps.findIndex(step => step.title === "Near the end: make the regional sauce base");
  const rest = recipe.steps.findIndex(step => step.title === "Rest, then slice or pull");
  assert.ok(smoke < sauce && sauce < rest);
  assert.match(recipe.steps[smoke].detail, /during the final.*so the sauce is ready near service/);
  assert.doesNotMatch(recipe.steps[sauce].detail, /keep.*over very low heat while cooking the main/i);
  const smokeTime = recipe.steps.filter(step => ["Start the hot smoke", "Manage the stall and finish", "Rest, then slice or pull"].includes(step.title)).reduce((sum,step)=>sum+(step.minutes ?? 0),0);
  assert.ok(recipe.cookMinutes >= smokeTime);
  const fish = generateMeal({ mainId: "salmon", methodId: "smoked", regionId: "japanese", sideId: "garden-salad", servings: 2 });
  assert.ok(!fish.steps.some(step => step.title === "Rest, then slice or pull"));
  assert.match(fish.steps.find(step=>step.title === "Lift the smoked main carefully")!.detail,/keeping the fish.*intact/);
});

test("dried-chilli soaking precedes browning and its time is counted once in preparation", () => {
  const recipe = generateMeal({ mainId:"beef",methodId:"braised",regionId:"oaxacan",sideId:"rice-greens",servings:2,seed:1 });
  const prepare = recipe.steps.findIndex(step=>step.title === "Prepare the regional ingredients");
  const brown = recipe.steps.findIndex(step=>step.title === "Brown the main for the braise");
  assert.ok(prepare >= 0 && prepare < brown);
  assert.match(recipe.steps[prepare].detail,/15–30 minutes/);
  const sauce = recipe.steps.find(step=>step.title === "Build the braising base")!;
  assert.doesNotMatch(sauce.detail,/soak.*15–30 minutes/);
  assert.ok(recipe.prepMinutes >= 45);
});
