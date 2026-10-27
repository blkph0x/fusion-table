import assert from "node:assert/strict";
import { test } from "node:test";
import { generateMeal, MEAL_REGIONS } from "../lib/meals.ts";
import { cutsForMethod, cutAllowedForMethod } from "../lib/cut-method.ts";
import { getCut } from "../lib/cuts.ts";
import { recipeFromShare, specFromRecipe } from "../lib/share-recipe.ts";

const base = { regionId: "thai", sideId: "garden-salad", servings: 4 };

test("liver finishes briefly in cooked sauce instead of inheriting a joint braise", () => {
  for (const region of MEAL_REGIONS) for (const mainId of ["beef", "lamb", "chicken"]) for (const methodId of ["curry", "braised"]) for (const servings of [1, 4, 12]) {
    const recipe = generateMeal({ ...base, mainId, methodId, cutId: `${mainId}-liver`, regionId: region.id, servings });
    const finish = recipe.steps.find(step => ["Simmer the main", "Braise gently"].includes(step.title))!;
    assert.equal(finish.minutes, 8, recipe.id);
    assert.match(finish.detail, /cooked regional sauce.*before adding.*1 cm liver slices/);
    assert.match(finish.detail, /75\u00b0C/);
    assert.doesNotMatch(finish.detail, /fork-tender|107|110|120/);
    assert.ok(!recipe.steps.some(step => step.title === "Brown the main for the braise"));
  }
});

test("bone-in shopping portions account for bones at household serving scales", () => {
  for (const [mainId, cutId, grams] of [["chicken", "chicken-maryland", 1500], ["chicken", "chicken-wing", 1200], ["chicken", "chicken-drumstick", 1000], ["lamb", "lamb-shank", 1400], ["beef", "beef-oxtail", 1200]] as const) for (const servings of [1, 2, 4, 6, 12]) {
    const recipe = generateMeal({ ...base, mainId, methodId: "braised", cutId, servings });
    assert.equal(recipe.ingredients.find(item => item.id === mainId)!.amount, grams * servings / 4);
    assert.match(recipe.steps.find(step => step.title === "Prepare your main")!.detail, /raw shopping weight includes bones/);
  }
  const maryland = generateMeal({ ...base, mainId: "chicken", cutId: "chicken-maryland", methodId: "roasted" });
  assert.equal(maryland.steps.find(step => step.title === "Roast the main")!.minutes, 50);
  assert.deepEqual(recipeFromShare(specFromRecipe(maryland)).ingredients, maryland.ingredients);
});

test("a home mincer never receives bone-in slow joints", () => {
  for (const id of ["beef-osso", "beef-oxtail", "beef-short-rib", "lamb-shank", "pork-hock", "pork-ribs", "pork-trotter"]) assert.equal(cutAllowedForMethod(getCut(id)!, "patties"), false, id);
  assert.ok(cutsForMethod("beef", "patties").some(cut => cut.id === "beef-brisket"));
});

test("paneer schnitzel has coat-able slabs and quick rack cooking uses rib cutlets", () => {
  const paneer = generateMeal({ ...base, mainId: "paneer", methodId: "schnitzel" });
  assert.match(paneer.steps.find(step => step.title === "Prepare your main")!.detail, /broad 1 cm slabs/);
  assert.doesNotMatch(paneer.ingredients.find(item => item.id === "paneer")!.notes!, /2 cm cubes/);
  const rack = generateMeal({ ...base, mainId: "lamb", cutId: "lamb-rack", methodId: "pan-fried" });
  assert.match(rack.steps.find(step => step.title === "Prepare your main")!.detail, /individual rib cutlets.*intact rack/);
  assert.match(rack.steps.find(step => step.title === "Pan-fry the main")!.detail, /71\u00b0C/);
});

test("thin stir-fry strips have short batch cooks and larger households include all batches once", () => {
  for (const servings of [1, 4, 6, 12]) {
    const recipe = generateMeal({ ...base, mainId: "beef", methodId: "stir-fried", servings });
    const fry = recipe.steps.find(step => step.title === "Stir-fry the main")!;
    const batches = Math.ceil(150 * servings / 250);
    assert.match(fry.detail, /2\u20133 minutes per batch/);
    assert.ok(fry.detail.includes(`about ${batches * 3} minutes across`));
    assert.equal(fry.minutes, batches * 3);
    assert.ok(recipe.cookMinutes >= fry.minutes!);
  }
  const fish = generateMeal({ ...base, mainId: "salmon", methodId: "stir-fried" });
  assert.match(fish.steps.find(step => step.title === "Stir-fry the main")!.detail, /turning gently with a fish slice/);
});

test("one oven is never assumed to run conflicting main and side temperatures simultaneously", () => {
  const recipe = generateMeal({ ...base, mainId: "chicken", cutId: "chicken-whole", methodId: "roasted", sideId: "roast-veg-tray" });
  const sequence = recipe.steps.map(step => step.detail).join(" ");
  assert.match(sequence, /One-oven sequence/);
  assert.match(sequence, /do not try to run one oven at two temperatures/);
  assert.match(sequence, /refrigerate at 5\u00b0C/);
  assert.ok(recipe.steps.findIndex(step => step.title === "Reheat the oven side while the main rests") > recipe.steps.findIndex(step => step.title === "Roast the main"));
  assert.ok(recipe.cookMinutes >= 90 + 15 + 40);
});
