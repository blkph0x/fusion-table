import assert from "node:assert/strict";
import { test } from "node:test";
import { generateMeal } from "../lib/meals.ts";
import { MEAL_REGIONS } from "../lib/meals.ts";

test("substantive secondary side cooking starts with the accompaniment, before a quick main", () => {
  for (const sideId of ["couscous-veg", "barley-veg", "miso-aubergine-rice", "ratatouille-side"]) for (const clean of [undefined, { cleanMode: true }]) {
    const recipe = generateMeal({ mainId: "prawns", methodId: "pan-fried", regionId: "japanese", sideId, servings: 2, ...(clean ? { clean } : {}) });
    const main = recipe.steps.findIndex(step => step.title === "Pan-fry the main");
    const sideCooking = recipe.steps.filter(step => /roast the vegetables|pan-roast the vegetables|roast.*aubergine|cook the vegetables|add tomatoes/i.test(step.title));
    assert.ok(sideCooking.length > 0, sideId);
    assert.ok(sideCooking.every(step => recipe.steps.indexOf(step) < main), sideId);
    assert.match(recipe.steps[main].detail, /longest-cooking side/);
  }
});

test("simpler methods retain main cooking and the delicate finishing boundary", () => {
  for (const [mainId, methodId, regionId, sideId] of [["pumpkin", "pan-fried", "indian-korma", "soba-greens"], ["pork", "air-fried", "cuban", "gomen-style-greens"]]) {
    const recipe = generateMeal({ mainId, methodId, regionId, sideId, servings: 2, seed: 635461664, clean: { fewerBottles: true } });
    assert.equal(recipe.steps.filter(step => step.title === "Finish the regional sauce" && step.finishBoundary).length, 1);
    assert.ok(recipe.steps.some(step => ["Pan-fry the main", "Air-fry in batches"].includes(step.title)));
  }
});

test("long preparation and special side handling remain visible in full recipes", () => {
  const sticky = generateMeal({ mainId: "tofu", methodId: "grilled", regionId: "thai", sideId: "sticky-rice-greens", servings: 2 });
  assert.equal(sticky.steps[0].title, "Prepare the side in advance");
  assert.ok(sticky.prepMinutes >= 360);
  const cassava = generateMeal({ mainId: "chickpeas", methodId: "roasted", regionId: "cuban", sideId: "yuca-greens", servings: 2 });
  assert.ok(cassava.methodNotes?.some(note => /commercially|processed|ready.to.reheat/i.test(note)));
  assert.ok(cassava.dietaryNotes.some(note => /foodstandards.*cassava/.test(note)));
});

test("regional rice names never rewrite rice miso or its measured glaze water", () => {
  for (const region of MEAL_REGIONS) for (const servings of [1, 4, 12]) {
    const recipe = generateMeal({ mainId: "chicken", methodId: "grilled", regionId: region.id, sideId: "miso-aubergine-rice", servings, diet: "gluten-free" });
    const glaze = recipe.steps.find(step => /roast.*aubergine/i.test(step.title))!;
    assert.match(glaze.detail, /gluten-free white rice miso/);
    assert.doesNotMatch(glaze.detail, /Jasmine rice miso|short-grain rice miso|packet.*water/);
    assert.ok(glaze.detail.includes(`${Number((30 * servings / 4).toFixed(4))} ml water`));
  }
});

test("regional coconut rice counts its listed milk toward packet cooking liquid", () => {
  for (const sideId of ["mozambican-rice-coconut", "banana-leaf-rice"]) {
    const recipe = generateMeal({ mainId: "tofu", methodId: "grilled", regionId: "japanese", sideId, servings: 4 });
    const riceStep = recipe.steps.find(step => /\bg (?:dry )?(?:Japanese|japanese) short-grain rice/.test(step.detail))!;
    assert.ok(riceStep, sideId);
    assert.match(riceStep.detail, /coconut milk and water together.*total cooking-liquid amount/);
  }
  const explicitJasmine = generateMeal({ mainId: "tofu", methodId: "grilled", regionId: "japanese", sideId: "coconut-rice", servings: 4 });
  assert.match(explicitJasmine.steps.find(step => step.title === "Cook the coconut rice")!.detail, /280 g jasmine rice/);
});
