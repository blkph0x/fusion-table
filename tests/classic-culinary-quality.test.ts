import assert from "node:assert/strict";
import { test } from "node:test";
import { CLASSICS, REGIONS, generateRecipe } from "../lib/recipes.ts";
import type { DietId, Recipe } from "../lib/recipe-types.ts";

const originals = ["pasta", "tacos", "risotto", "burgers", "roast", "fried-rice", "flatbread", "cottage-pie"];
test("classics that require an animal-main thermometer endpoint include the thermometer", () => {
  for (const classic of CLASSICS) for (const region of REGIONS) {
    const recipe = generateRecipe({ classicId: classic.id, regionId: region.id, servings: 4 });
    if (recipe.safetyNote && /\b(?:63|71|75)°C/.test(recipe.safetyNote)) assert.ok(recipe.equipment.some(tool => /thermometer/i.test(tool)), recipe.id);
  }
});
const text = (recipe: Recipe) => recipe.steps.map((step) => `${step.title}. ${step.detail}`).join(" ");

test("every classic, regional profile and diet routes its listed regional ingredients into the method", () => {
  const basePasta = new Set(["pasta", "mushrooms", "brown-onion", "garlic", "olive-oil", "cream", "coconut-milk", "salt"]);
  for (const region of REGIONS) for (const diet of ["balanced", "vegetarian", "vegan", "gluten-free", "dairy-free"] as DietId[]) {
    const reference = generateRecipe({ classicId: "pasta", regionId: region.id, diet, servings: 3 });
    const regional = reference.ingredients.filter((ingredient) => !basePasta.has(ingredient.id));
    assert.ok(regional.length > 0);
    for (const classic of CLASSICS) {
      const recipe = generateRecipe({ classicId: classic.id, regionId: region.id, diet, servings: 3 });
      const method = text(recipe).toLowerCase();
      for (const ingredient of regional) {
        assert.ok(recipe.ingredients.some((item) => item.id === ingredient.id), `${recipe.id}: retains ${ingredient.id}`);
        assert.ok(method.includes(ingredient.name.toLowerCase()), `${recipe.id}: gives a cooking or finishing action for ${ingredient.name}`);
      }
    }
  }
});

test("Japanese miso is a deliberate off-heat finish, with ginger cooked first", () => {
  for (const classicId of [...originals, "reverse-seared-steak", "cold-smoked-platter"]) {
    const recipe = generateRecipe({ classicId, regionId: "japanese", servings: 2 });
    const misoStep = recipe.steps.findIndex((step) => /white miso/.test(step.detail));
    const gingerStep = recipe.steps.findIndex((step) => /fresh ginger/.test(step.detail));
    assert.ok(misoStep >= gingerStep && misoStep >= 0, recipe.id);
    assert.match(recipe.steps[misoStep].detail, /take the pan off the heat.*white miso/i, recipe.id);
    assert.match(recipe.steps[gingerStep].detail, /fresh ginger.*1–2 minutes.*without burning/i, recipe.id);
    assert.doesNotMatch(recipe.steps[misoStep].detail, /stir in[^.]*white miso[^.]*fry/i, recipe.id);
    if (["burgers", "flatbread", "reverse-seared-steak", "cold-smoked-platter"].includes(classicId)) assert.match(recipe.steps[misoStep].detail, /Once the sauce base is ready/, recipe.id);
  }
});

test("risotto cooks curry paste and aromatics before stock, and dissolves sweet condiments after stock", () => {
  const thai = generateRecipe({ classicId: "risotto", regionId: "thai", servings: 4 });
  const pasteStep = thai.steps.findIndex((step) => /red curry paste/.test(step.detail));
  const stockStep = thai.steps.findIndex((step) => /first ladle of warm stock/.test(step.detail));
  assert.ok(pasteStep < stockStep);
  assert.match(thai.steps[pasteStep].detail, /Fry gently.*1–2 minutes.*before adding the liquid/);
  assert.doesNotMatch(text(thai), /final 3 minutes of cooking/);
  const korean = generateRecipe({ classicId: "risotto", regionId: "korean", servings: 4 });
  const condimentStep = korean.steps.find((step) => /gochujang/.test(step.detail))!;
  assert.match(condimentStep.detail, /first ladle.*gochujang.*only after liquid is present/);
  assert.match(condimentStep.detail, /keep sweet or salty condiments away from a dry/);
});

test("delicate spice and woody herbs have explicit finishing or removal instructions", () => {
  for (const classicId of originals) {
    const indian = generateRecipe({ classicId, regionId: "indian", servings: 4 });
    assert.match(indian.steps.find((step) => /garam masala/.test(step.detail))!.detail, /Off the heat.*garam masala/);
    const home = generateRecipe({ classicId, regionId: "home-style", servings: 4 });
    assert.match(text(home), /bay leaf.*Infuse at a gentle simmer/);
    assert.match(text(home), /lift out and discard the woody pieces of bay leaf/);
  }
});

test("crisp formats cook wet regional sauces separately, cool yogurt mixes and retain their main endpoints", () => {
  for (const classicId of ["burgers", "flatbread", "roast"]) {
    const recipe = generateRecipe({ classicId, regionId: "thai", servings: 4 });
    const sauce = recipe.steps.find((step) => /Fry gently/.test(step.detail))!;
    assert.match(sauce.detail, /small saucepan/);
    assert.match(sauce.detail, /red curry paste.*Fry gently/);
    assert.match(sauce.detail, /before adding the liquid/);
    assert.ok(recipe.equipment.includes("Small saucepan"));
    if (classicId !== "roast") assert.match(sauce.detail, /cool.*fold into.*yogurt/);
    else assert.match(text(recipe), /75°C/);
    if (classicId === "burgers") {
      assert.doesNotMatch(recipe.steps[0].detail, /Add the .*red curry paste/);
      assert.match(text(recipe), /every patty reaches at least 75°C/);
    }
  }
});

test("classic plates retain one authored starch rather than gaining a second full grain or bread", () => {
  const expected: Record<string, string> = { pasta: "pasta", tacos: "corn-tortillas", risotto: "risotto-rice", burgers: "burger-buns", roast: "potatoes", "fried-rice": "jasmine-rice", flatbread: "flatbreads", "cottage-pie": "potatoes" };
  const additions = new Set(["short-grain-rice", "basmati-rice", "mexican-rice", "medium-grain-rice", "long-grain-rice", "staple-bread", "staple-flatbread", "polenta", "maize-meal", "couscous", "quinoa", "burghul", "rice-vermicelli"]);
  for (const region of REGIONS) for (const classicId of originals) for (const seed of [undefined, 42]) {
    const recipe = generateRecipe({ classicId, regionId: region.id, servings: 4, ...(seed === undefined ? {} : { seed }) });
    assert.ok(recipe.ingredients.some((item) => item.id === expected[classicId]), recipe.id);
    assert.ok(recipe.ingredients.every((item) => !additions.has(item.id)), recipe.id);
    assert.ok(!recipe.steps.some((step) => step.title === "Prepare the regional staple"), recipe.id);
  }
  const lentils = generateRecipe({ classicId: "cottage-pie", regionId: "levantine", servings: 4, diet: "vegan" });
  assert.ok(lentils.ingredients.some((item) => item.id === "lentils"), "the selected plant main must stay");
  const grainBowl = generateRecipe({ classicId: "smoked-grain-bowl", regionId: "mexican", servings: 4, diet: "vegan" });
  assert.ok(grainBowl.ingredients.some((item) => item.id === "cannellini-beans"), "authored rice-and-bean components must stay");
});

test("regional sauce amounts scale once and split base oil and stock without double allocation", () => {
  for (const servings of [1, 2, 6, 12]) {
    const pie = generateRecipe({ classicId: "cottage-pie", regionId: "japanese", servings });
    const stock = pie.ingredients.find((item) => item.id === "vegetable-stock")!.amount;
    assert.equal(stock, servings * 37.5);
    assert.match(text(pie), new RegExp(`${servings * 22.5} ml of the vegetable stock`));
    assert.match(text(pie), new RegExp(`Pour in ${servings * 15} ml vegetable stock`));
    assert.match(text(pie), new RegExp(`${servings * 0.5} tbsp white miso`));
    assert.equal(pie.ingredients.find((item) => item.id === "olive-oil")!.amount, servings * 0.75);
    assert.match(text(pie), new RegExp(`Heat ${servings * 0.125} tbsp olive oil`));
  }
});

test("every classic marks one authored finishing boundary before seeded extras are assembled", () => {
  for (const classic of CLASSICS) for (const region of REGIONS) {
    const recipe = generateRecipe({ classicId: classic.id, regionId: region.id, servings: 2 });
    assert.equal(recipe.steps.filter((step) => step.finishBoundary === true).length, 1, recipe.id);
  }
  const burger = generateRecipe({ classicId: "burgers", regionId: "japanese", servings: 2 });
  assert.equal(burger.steps.find((step) => step.finishBoundary)?.title, "Prepare the regional sauce and salad");
  const flatbread = generateRecipe({ classicId: "flatbread", regionId: "japanese", servings: 2 });
  assert.equal(flatbread.steps.find((step) => step.finishBoundary)?.title, "Make the regional yogurt sauce");
});

test("pasta enters its packet-timed final window after the regional base, then is tossed without waiting", () => {
  for (const region of REGIONS) {
    const recipe = generateRecipe({ classicId: "pasta", regionId: region.id, servings: 2 });
    const base = recipe.steps.findIndex((step) => step.title === "Build the mushroom base");
    const regional = recipe.steps.findIndex((step) => step.title === "Layer the regional sauce");
    const pasta = recipe.steps.findIndex((step) => step.title === "Cook the pasta and finish the sauce");
    assert.ok(base < regional && regional < pasta, recipe.id);
    assert.match(recipe.steps[base].detail, /leave the dry pasta out for now/);
    assert.match(recipe.steps[pasta].detail, /packet timing/);
    assert.match(recipe.steps[pasta].detail, /final 2–3 minutes.*warm gently without boiling hard/);
    assert.match(recipe.steps[pasta].detail, /drain the pasta when ready and toss it immediately/);
    assert.equal(recipe.steps.slice(0, pasta).filter((step) => /cook the pasta according to/i.test(step.detail)).length, 0);
  }
});

test("seeded pasta prepares extra vegetables before its packet cooking window, without holding drained pasta", () => {
  for (const region of REGIONS) for (const seed of [0, 42]) {
    const recipe = generateRecipe({ classicId: "pasta", regionId: region.id, servings: 2, seed });
    const packet = recipe.steps.findIndex((step) => step.title === "Cook the pasta and finish the sauce");
    const prep = recipe.steps.findIndex((step) => step.title === "Prepare the finishing ingredients");
    const finish = recipe.steps.findIndex((step) => step.title === "Finish and serve");
    assert.equal(recipe.steps[packet].finishBoundary, true, recipe.id);
    if (recipe.ingredients.some((ingredient) => ingredient.id.startsWith("sat-"))) assert.ok(prep >= 0 && prep < packet, recipe.id);
    assert.ok(packet < finish, recipe.id);
    assert.match(recipe.steps[packet].detail, /drain the pasta when ready and toss it immediately/);
    assert.ok(recipe.steps.slice(packet + 1).every((step) => step.title !== "Prepare the finishing ingredients"), recipe.id);
    assert.doesNotMatch(recipe.steps.at(-1)!.detail, /Cook in a separate pan.*3–5 minutes|Wash and thinly slice/);
  }
});

test("cold platter finishes warm-loosened ingredients before chilling and adds fresh seasoning without reheating", () => {
  for (const regionId of ["japanese", "levantine"]) {
    const recipe = generateRecipe({ classicId: "cold-smoked-platter", regionId, servings: 2 });
    const cooking = recipe.steps.find((step) => step.title === "Cook the regional sauce separately")!;
    const fresh = recipe.steps.find((step) => step.title === "Add the fresh sauce finish")!;
    const warmIngredient = regionId === "japanese" ? "white miso" : "tahini";
    assert.ok(cooking.detail.indexOf(warmIngredient) < cooking.detail.indexOf("Cool the small pan promptly"));
    assert.match(cooking.detail, /refrigerate at 5°C or colder/);
    assert.match(cooking.detail, /ready-to-eat main refrigerated; it is not cooked in this sauce/);
    assert.doesNotMatch(fresh.detail, new RegExp(`warm cooked sauce|${warmIngredient}`));
    assert.match(fresh.detail, /take the cooked sauce straight from the fridge/);
    assert.match(fresh.detail, /no reheating or further warm loosening is needed/);
    assert.equal(fresh.finishBoundary, true);
  }
});
