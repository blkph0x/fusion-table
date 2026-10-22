import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COOKING_METHODS, MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SIDES, generateMeal, getMealCombinationCount, getMainsForDiet, getMethodsForMain, validateMealInput } from "../lib/meals.ts";
import type { MealInput } from "../lib/meal-types.ts";
import type { DietId, SpiceHeat } from "../lib/recipe-types.ts";

const base: MealInput = { mainId: "chicken", methodId: "schnitzel", regionId: "japanese", sideId: "rice-greens", servings: 4 };
const diets: DietId[] = ["balanced", "vegetarian", "vegan", "gluten-free", "dairy-free"];
const instructions = (recipe: ReturnType<typeof generateMeal>) => recipe.steps.map((step) => step.detail).join(" ");

describe("ingredient-first complete meal engine", () => {
  it("counts only supported main/method/region/side configurations and exposes every promised chicken method", () => {
    assert.equal(MAIN_INGREDIENTS.length, 22);
    assert.equal(COOKING_METHODS.length, 12);
    assert.equal(MEAL_REGIONS.length, 20);
    assert.equal(MEAL_SIDES.length, 6);
    assert.equal(MAIN_INGREDIENTS.reduce((sum, main) => sum + main.methodIds.length, 0), 195);
    assert.equal(getMealCombinationCount(), 23_400);
    for (const id of ["schnitzel", "baked", "pan-fried", "air-fried", "poached", "grilled", "stir-fried", "braised", "curry", "patties", "roasted", "steamed"]) {
      assert.ok(getMethodsForMain("chicken").some((method) => method.id === id));
    }
    assert.deepEqual(getMethodsForMain("missing"), []);
    for (const main of MAIN_INGREDIENTS) {
      assert.equal(new Set(main.methodIds).size, main.methodIds.length, main.id);
      assert.ok(main.methodIds.every((id) => COOKING_METHODS.some((method) => method.id === id)), main.id);
      assert.ok(main.ingredientAliases.length > 0, main.id);
    }
  });

  it("generates complete meals for every compatible configuration and dietary preference", () => {
    let tested = 0;
    for (const diet of diets) for (const main of getMainsForDiet(diet)) for (const methodId of main.methodIds) for (const region of MEAL_REGIONS) for (const side of MEAL_SIDES) {
      const meal = generateMeal({ mainId: main.id, methodId, regionId: region.id, sideId: side.id, servings: 4, diet });
      assert.equal(meal.kind, "meal", meal.id);
      assert.equal(meal.mainId, main.id, meal.id);
      assert.equal(meal.methodId, methodId, meal.id);
      assert.equal(meal.sideId, side.id, meal.id);
      assert.equal(meal.regionId, region.id, meal.id);
      assert.equal(meal.generation, "authored", meal.id);
      assert.equal(meal.sourceLabel, "Template-generated · not kitchen-tested", meal.id);
      assert.ok(meal.ingredients.length >= 8, meal.id);
      assert.ok(meal.steps.length >= 6, meal.id);
      assert.ok(meal.steps.every((step) => step.title && step.detail && !step.detail.includes("undefined")), meal.id);
      assert.ok(Object.values(meal.components).every((component) => component.length > 2), meal.id);
      assert.ok(meal.ingredients.every((item) => Number.isFinite(item.amount) && item.amount > 0), meal.id);
      assert.equal(new Set(meal.ingredients.map((item) => item.id)).size, meal.ingredients.length, meal.id);
      assert.ok(meal.ingredients.some((item) => item.id === main.id), meal.id);
      assert.ok(meal.prepMinutes > 0 && meal.cookMinutes > 0 && meal.totalMinutes === meal.prepMinutes + meal.cookMinutes, meal.id);
      assert.ok(meal.equipment.length > 0, meal.id);
      if (diet === "vegan" || diet === "vegetarian") assert.ok(meal.ingredients.every((item) => !["butcher", "fishmonger"].includes(item.category)), meal.id);
      if (diet === "vegan" || diet === "dairy-free") assert.ok(!meal.allergens.includes("milk"), meal.id);
      if (diet === "vegan") assert.ok(!meal.allergens.includes("egg"), meal.id);
      if (diet === "gluten-free") assert.ok(!meal.allergens.some((allergen) => ["wheat", "barley", "rye"].includes(allergen)), meal.id);
      const text = instructions(meal).toLowerCase();
      for (const item of meal.ingredients) assert.ok(text.includes(item.name.toLowerCase()) || text.includes(item.id.replaceAll("-", " ")), `${meal.id}: unused ingredient ${item.name}`);
      tested++;
    }
    assert.ok(tested > 90_000);
  });

  it("selects appropriate cuts and meaningfully different processes for the same main", () => {
    const schnitzel = generateMeal(base);
    const poached = generateMeal({ ...base, methodId: "poached" });
    const braised = generateMeal({ ...base, methodId: "braised" });
    const patties = generateMeal({ ...base, methodId: "patties" });
    assert.match(schnitzel.ingredients[0].name, /breast/);
    assert.match(instructions(schnitzel), /1 cm thickness/);
    assert.match(instructions(schnitzel), /coating batter/);
    assert.match(instructions(poached), /without a rolling boil/);
    assert.match(instructions(poached), /Discard the poaching liquid/);
    assert.match(braised.ingredients[0].name, /thigh/);
    assert.match(patties.ingredients[0].name, /mince/);
    assert.match(instructions(patties), /1.5 cm thick/);
    assert.ok(braised.cookMinutes > schnitzel.cookMinutes);
    const beefBraise = generateMeal({ ...base, mainId: "beef", methodId: "braised" });
    const beefGrill = generateMeal({ ...base, mainId: "beef", methodId: "grilled" });
    assert.match(beefBraise.ingredients[0].name, /chuck/);
    assert.match(beefGrill.ingredients[0].name, /rump steaks/);
    assert.ok(beefBraise.cookMinutes > 100);
    assert.ok(beefGrill.cookMinutes < 40);
    assert.match(instructions(generateMeal({ ...base, mainId: "cauliflower" })), /Simmer the slabs and florets in water for 4 minutes/);
    assert.match(instructions(generateMeal({ ...base, mainId: "mushrooms", methodId: "patties" })), /liquid evaporates/);
    assert.match(instructions(generateMeal({ ...base, mainId: "courgette", methodId: "patties" })), /squeeze firmly/);
    assert.match(instructions(generateMeal({ ...base, mainId: "chickpeas", methodId: "patties" })), /already-cooked canned/);
    const eggCurry = generateMeal({ ...base, mainId: "eggs", methodId: "curry" });
    assert.match(eggCurry.steps[0].detail, /whole in their shells/);
    assert.doesNotMatch(eggCurry.steps[0].detail, /Crack each/);
  });

  it("retains the selected main and rejects incompatible diets or methods", () => {
    for (const main of MAIN_INGREDIENTS) for (const diet of diets) {
      const compatible = getMainsForDiet(diet).some((item) => item.id === main.id);
      const input = { ...base, mainId: main.id, methodId: main.methodIds[0], diet };
      if (compatible) assert.equal(generateMeal(input).mainId, main.id);
      else assert.throws(() => generateMeal(input), /does not fit/);
    }
    assert.throws(() => generateMeal({ ...base, mainId: "prawns", methodId: "braised" }), /not available/);
    assert.throws(() => generateMeal({ ...base, mainId: "eggs", methodId: "schnitzel" }), /not available/);
    assert.throws(() => generateMeal({ ...base, mainId: "lentils", methodId: "grilled" }), /not available/);
    assert.throws(() => generateMeal({ ...base, mainId: "halloumi", diet: "dairy-free" }), /does not fit/);
  });

  it("starts long braises before fast sides and includes precooking and chilling in patty prep", () => {
    for (const side of MEAL_SIDES) {
      const meal = generateMeal({ ...base, mainId: "beef", methodId: "braised", sideId: side.id });
      const braiseIndex = meal.steps.findIndex((step) => step.title === "Braise gently");
      const sideIndex = meal.steps.findIndex((step) => step.title.startsWith("Near the end:"));
      assert.ok(braiseIndex > 0 && sideIndex > braiseIndex, side.id);
      assert.match(meal.steps[braiseIndex].detail, /During the final/);
      assert.match(meal.steps[sideIndex].detail, /Keep it hot and serve promptly/);
    }
    const patties = generateMeal({ ...base, mainId: "pumpkin", methodId: "patties" });
    assert.ok(patties.prepMinutes >= 45);
    assert.match(instructions(patties), /Cool before shaping/);
    assert.match(instructions(patties), /Refrigerate for 15 minutes/);
  });

  it("scales all ingredient quantities for every main and method from one through twelve servings", () => {
    for (const main of MAIN_INGREDIENTS) for (const methodId of main.methodIds) {
      const original = generateMeal({ ...base, mainId: main.id, methodId });
      for (const servings of [1, 2, 6, 12]) {
        const scaled = generateMeal({ ...base, mainId: main.id, methodId, servings });
        assert.equal(scaled.ingredients.length, original.ingredients.length);
        for (const item of original.ingredients) {
          const actual = scaled.ingredients.find((candidate) => candidate.id === item.id)!;
          assert.ok(Math.abs(actual.amount - item.amount * servings / 4) <= 0.0001, `${scaled.id}: ${item.id}`);
        }
        assert.equal(scaled.safetyNote, original.safetyNote, scaled.id);
        if (servings === 12) assert.match(instructions(scaled), /cook in batches/);
      }
    }
    const eggs = generateMeal({ ...base, mainId: "eggs", methodId: "baked", servings: 3 });
    assert.equal(eggs.ingredients.find((item) => item.id === "eggs")!.amount, 6);
    assert.match(instructions(eggs), /3 ovenproof ramekins/);
    const single = generateMeal({ ...base, servings: 1 });
    assert.match(instructions(single), /20 g plain flour with 27.5 ml water/);
  });

  it("uses explicit gluten-free alternatives and their actual cooking instructions", () => {
    const quinoa = generateMeal({ ...base, sideId: "couscous-veg", diet: "gluten-free" });
    assert.ok(quinoa.ingredients.some((item) => item.id === "quinoa"));
    assert.ok(!quinoa.ingredients.some((item) => item.id === "couscous"));
    assert.match(instructions(quinoa), /simmer covered for about 15 minutes/);
    assert.match(instructions(quinoa), /rice flour/);
    assert.match(instructions(quinoa), /gluten-free vegan breadcrumbs/);
    assert.match(instructions(generateMeal({ ...base, sideId: "noodles-crunch", diet: "gluten-free" })), /gluten-free rice noodles/);
    assert.match(instructions(generateMeal({ ...base, sideId: "flatbread-salad", diet: "gluten-free" })), /gluten-free vegan flatbreads/);
    const vegan = generateMeal({ ...base, mainId: "tofu", regionId: "thai", diet: "vegan" });
    assert.ok(vegan.ingredients.some((item) => item.name === "Vegan red curry paste"));
    assert.ok(!vegan.allergens.some((allergen) => ["egg", "milk", "fish", "crustaceans"].includes(allergen)));
    assert.match(instructions(vegan), /coating batter/);
  });

  it("only marks exact pantry names or suitable explicit aliases, including restricted products", () => {
    const recipe = generateMeal({ ...base, mainId: "tofu", regionId: "thai", diet: "vegan", pantry: "garlic, tofu, milk, butter, curry paste, oil, rice" });
    const item = (id: string) => recipe.ingredients.find((entry) => entry.id === id)!;
    assert.equal(item("garlic").inPantry, true);
    assert.equal(item("tofu").inPantry, true);
    assert.equal(item("rice").inPantry, true);
    assert.equal(item("coconut-milk").inPantry, false);
    assert.equal(item("red-curry-paste").inPantry, false);
    assert.equal(item("neutral-oil").inPantry, false);
    const gf = generateMeal({ ...base, diet: "gluten-free", pantry: "soy sauce, miso, white miso, breadcrumbs, flour, vegetable stock" });
    for (const id of ["soy-sauce", "miso", "breadcrumbs", "coating-flour", "vegetable-stock"]) assert.equal(gf.ingredients.find((entry) => entry.id === id)!.inPantry, false, id);
    const explicit = generateMeal({ ...base, diet: "gluten-free", pantry: ["GLUTEN FREE TAMARI", "gluten-free white miso", "rice flour", "gluten-free vegan breadcrumbs", "gluten-free vegetable stock"] });
    for (const id of ["soy-sauce", "miso", "breadcrumbs", "coating-flour", "vegetable-stock"]) assert.equal(explicit.ingredients.find((entry) => entry.id === id)!.inPantry, true, id);
    const korean = generateMeal({ ...base, regionId: "korean", diet: "gluten-free", pantry: "gochujang, soy sauce" });
    assert.equal(korean.ingredients.find((entry) => entry.id === "gochujang")!.inPantry, false);
  });

  it("keeps sufficient doneness instructions and primary safety sources for each animal main", () => {
    for (const main of MAIN_INGREDIENTS.filter((item) => ["meat", "seafood"].includes(item.category))) for (const methodId of main.methodIds) {
      const meal = generateMeal({ ...base, mainId: main.id, methodId });
      const temperature = ["chicken", "turkey"].includes(main.id) || ["patties", "schnitzel"].includes(methodId) && main.category === "meat" || methodId === "patties" ? "75°C" : main.category === "seafood" ? "63°C" : "71°C";
      assert.ok(instructions(meal).includes(temperature), meal.id);
      assert.ok(meal.safetyNote?.includes(temperature), meal.id);
      assert.match(meal.safetySource!, /^https:\/\/www\.(foodstandards|foodauthority\.nsw)\.gov\.au\//);
      assert.ok(meal.equipment.includes("Food thermometer"), meal.id);
    }
    for (const method of getMethodsForMain("eggs")) {
      const meal = generateMeal({ ...base, mainId: "eggs", methodId: method.id });
      assert.match(instructions(meal), /firm/);
      assert.match(meal.safetyNote!, /whites and yolks are firm/);
    }
  });

  it("varies heat without dropping required sauce ingredients and keeps recipe identity stable", () => {
    for (const region of MEAL_REGIONS) {
      const mild = generateMeal({ ...base, regionId: region.id, spiceHeat: "mild" });
      const hot = generateMeal({ ...base, regionId: region.id, spiceHeat: "hot" });
      const chilliId: Record<string, string> = { korean: "gochujang", thai: "red-curry-paste", moroccan: "harissa", peruvian: "aji-amarillo", ethiopian: "berbere" };
      const id = chilliId[region.id] ?? "chilli-flakes";
      assert.ok(mild.ingredients.find((item) => item.id === id)!.amount < hot.ingredients.find((item) => item.id === id)!.amount, region.id);
      assert.notEqual(mild.id, hot.id);
      assert.equal(mild.classicId, hot.classicId);
      assert.ok(mild.dietaryNotes.some((note) => note.includes("Mild")));
    }
    const same = generateMeal(base);
    assert.deepEqual(same, generateMeal(base));
    assert.notEqual(same.classicId, generateMeal({ ...base, methodId: "poached" }).classicId);
    assert.notEqual(same.classicId, generateMeal({ ...base, sideId: "potato-slaw" }).classicId);
  });

  it("merges shared shopping ingredients while keeping component amounts explicit in the method", () => {
    const courgette = generateMeal({ ...base, mainId: "courgette", methodId: "roasted", sideId: "couscous-veg" });
    assert.equal(courgette.ingredients.filter((item) => item.id === "courgette").length, 1);
    assert.equal(courgette.ingredients.find((item) => item.id === "courgette")!.amount, 1100);
    assert.match(instructions(courgette), /prepare 800 g courgette/);
    assert.match(instructions(courgette), /300 g chopped courgette/);
    const lentils = generateMeal({ ...base, mainId: "lentils", methodId: "patties", sideId: "lentil-salad" });
    assert.equal(lentils.ingredients.find((item) => item.id === "lentils")!.amount, 1200);
    const poached = generateMeal({ ...base, methodId: "poached" });
    assert.equal(poached.ingredients.find((item) => item.id === "vegetable-stock")!.amount, 920);
    assert.match(instructions(poached), /800 ml vegetable stock \(the poaching portion\)/);
    assert.match(instructions(poached), /120 ml vegetable stock/);
  });

  it("normalizes defaults and rejects malformed or unbounded inputs", () => {
    const normalized = validateMealInput({ mainId: "chicken", methodId: "poached", regionId: "greek", servings: 4 });
    assert.equal(normalized.sideId, "rice-greens");
    assert.equal(normalized.diet, "balanced");
    assert.equal(normalized.spiceHeat, "medium");
    for (const servings of [0, -1, 1.5, 13, NaN, Infinity]) assert.throws(() => generateMeal({ ...base, servings }), /Servings/);
    for (const field of ["mainId", "methodId", "regionId", "sideId"]) assert.throws(() => generateMeal({ ...base, [field]: "missing" }));
    assert.throws(() => generateMeal({ ...base, diet: "anything" as DietId }));
    assert.throws(() => generateMeal({ ...base, spiceHeat: "extra" as SpiceHeat }));
    for (const pantry of [[1], {}, 3, null, Array.from({ length: 101 }, () => "rice"), "x".repeat(8001)]) assert.throws(() => generateMeal({ ...base, pantry: pantry as string[] }));
    assert.throws(() => generateMeal(null as unknown as MealInput));
    assert.throws(() => generateMeal([] as unknown as MealInput));
  });
});
