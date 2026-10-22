import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLASSICS, DIETS, REGIONS, generateRecipe } from "../lib/recipes.ts";
import { bbqProfileFor } from "../lib/bbq-regions.ts";
import { ingredientMatchesShop } from "../lib/shopping.ts";
import type { DietId, Recipe, RecipeIngredient } from "../lib/recipe-types.ts";
import type { Shop, ShopKind } from "../lib/locations.ts";

const ORIGINAL_CLASSICS = ["pasta", "tacos", "risotto", "burgers", "roast", "fried-rice", "flatbread", "cottage-pie"];
const ORIGINAL_REGIONS = ["japanese", "korean", "thai", "mexican", "indian", "levantine", "italian", "moroccan"];
const BBQ_IDS = [
  "smoked-brisket", "hot-smoked-fish", "cold-smoked-platter", "bbq-pulled-protein", "grilled-skewers",
  "bbq-sausages", "reverse-seared-steak", "smoked-vegetable-tray", "bbq-ribs", "smoked-cheese-dip",
  "grill-roasted-whole-fish", "smoked-grain-bowl", "bbq-wings", "smoked-pork-belly",
  "grill-roasted-whole-chicken", "smoked-turkey-breast", "grilled-prawns", "charred-octopus",
  "grilled-flank-steak", "bbq-lamb-chops",
];
const BBQ_REGION_IDS = [
  "texas-bbq", "carolina-bbq", "kansas-city-bbq", "argentine-asado", "korean-bbq", "japanese-yakitori",
  "cantonese-char-siu", "vietnamese-grill", "turkish-mangal", "greek-souvlaki", "spanish-plancha",
  "jamaican-jerk", "indian-tandoor", "mexican-al-pastor", "moroccan-mechoui", "south-african-braai",
];
const LABEL = "Template-generated · not kitchen-tested";
const recipeFor = (classicId: string, diet: DietId = "balanced", regionId = "texas-bbq", servings = 4) =>
  generateRecipe({ classicId, regionId, servings, diet, spiceHeat: "medium" });
const instructions = (recipe: Recipe) => recipe.steps.map((step) => `${step.title}: ${step.detail}`).join(" ");
const allGuidance = (recipe: Recipe) => [instructions(recipe), recipe.safetyNote, ...recipe.dietaryNotes, ...(recipe.methodNotes ?? [])].join(" ");
const isFuel = (item: RecipeIngredient) => /\b(?:wood chips|wood chunks|smoking wood|smoking pellets|charcoal|hickory chunks|oak chunks|fuel)\b/i.test(`${item.id.replaceAll("-", " ")} ${item.name}`);

function shop(id: string, kind: ShopKind, shopType?: string): Shop {
  return { id, kind, shopType, name: id, lat: 0, lon: 0, distanceKm: 1, address: null, website: null, phone: null, openingHours: null, osmUrl: `https://www.openstreetmap.org/node/${id}`, inventoryStatus: "unverified" };
}

describe("deterministic barbecue and smoking expansion", () => {
  it("retains every original selection and adds the promised distinct classics and profiles", () => {
    for (const id of [...ORIGINAL_CLASSICS, ...BBQ_IDS]) assert.ok(CLASSICS.some((entry) => entry.id === id), id);
    for (const id of [...ORIGINAL_REGIONS, ...BBQ_REGION_IDS]) assert.ok(REGIONS.some((entry) => entry.id === id), id);
    assert.equal(new Set(CLASSICS.map((entry) => entry.id)).size, CLASSICS.length);
    assert.equal(new Set(REGIONS.map((entry) => entry.id)).size, REGIONS.length);
    assert.ok(CLASSICS.length - ORIGINAL_CLASSICS.length >= 12);
    assert.ok(REGIONS.length - ORIGINAL_REGIONS.length >= 10);
    assert.deepEqual(DIETS.map((entry) => entry.id), ["balanced", "vegetarian", "vegan", "gluten-free", "dairy-free"]);
  });

  it("generates the complete classic × region × five-diet matrix with deterministic output and dietary safeguards", () => {
    let configurations = 0;
    for (const classic of CLASSICS) for (const region of REGIONS) for (const option of DIETS) {
      const diet = option.id as DietId;
      const input = { classicId: classic.id, regionId: region.id, servings: 4, diet, spiceHeat: "medium" as const };
      const recipe = generateRecipe(input);
      assert.deepEqual(generateRecipe({ ...input }), recipe, recipe.id);
      assert.equal(recipe.sourceLabel, LABEL, recipe.id);
      assert.equal(recipe.classicId, classic.id);
      assert.equal(recipe.regionId, region.id);
      assert.equal(recipe.diet, diet);
      assert.ok(!("model" in recipe) && !("requestedBrief" in recipe), recipe.id);
      assert.ok(recipe.ingredients.length >= 8 && recipe.steps.length >= 4, recipe.id);
      assert.ok(recipe.steps.every((step) => step.title && step.detail && !/\b(?:undefined|NaN)\b/.test(step.detail)), recipe.id);
      assert.equal(new Set(recipe.ingredients.map((item) => item.id)).size, recipe.ingredients.length, recipe.id);
      assert.ok(recipe.ingredients.every((item) => Number.isFinite(item.amount) && item.amount > 0 && item.inPantry === false), recipe.id);
      assert.ok(recipe.prepMinutes >= 0 && recipe.cookMinutes >= 0 && recipe.totalMinutes > 0, recipe.id);
      assert.equal(recipe.totalMinutes, recipe.prepMinutes + recipe.cookMinutes, recipe.id);
      assert.ok(!recipe.ingredients.some(isFuel), `${recipe.id}: fuel is not a required food ingredient`);
      assert.deepEqual(recipe.allergens, [...new Set(recipe.ingredients.flatMap((item) => item.allergens))].sort(), recipe.id);
      if (diet === "vegetarian" || diet === "vegan") {
        assert.ok(recipe.ingredients.every((item) => !["butcher", "fishmonger"].includes(item.category)), recipe.id);
      }
      if (diet === "dairy-free" || diet === "vegan") assert.ok(!recipe.allergens.includes("milk"), recipe.id);
      if (diet === "vegan") assert.ok(!recipe.allergens.some((allergen) => ["egg", "fish", "crustaceans", "molluscs"].includes(allergen)), recipe.id);
      if (diet === "gluten-free") assert.ok(!recipe.allergens.some((allergen) => ["wheat", "barley", "rye"].includes(allergen)), recipe.id);
      if (BBQ_IDS.includes(classic.id)) {
        assert.ok(recipe.methodNotes?.length, `${recipe.id}: missing technique notes`);
        const profile = bbqProfileFor(region.id, diet, "medium");
        if (profile) for (const item of [...profile.warm, ...profile.finish]) {
          assert.ok(instructions(recipe).toLowerCase().includes(item.name.toLowerCase()), `${recipe.id}: profile ingredient missing from method: ${item.name}`);
        }
      }
      configurations++;
    }
    assert.equal(configurations, CLASSICS.length * REGIONS.length * DIETS.length);
  });

  it("composes recipes without network access or randomness", () => {
    const originalFetch = globalThis.fetch;
    const originalRandom = Math.random;
    globalThis.fetch = () => { throw new Error("A template must not call a network service."); };
    Math.random = () => { throw new Error("A template must not depend on random selection."); };
    try {
      for (const classicId of BBQ_IDS) {
        const first = recipeFor(classicId, "vegan", "cantonese-char-siu");
        assert.deepEqual(recipeFor(classicId, "vegan", "cantonese-char-siu"), first);
      }
    } finally {
      globalThis.fetch = originalFetch;
      Math.random = originalRandom;
    }
  });

  it("selects appropriate animal cuts and already-cooked products for each technique", () => {
    const cuts: Record<string, RegExp> = {
      "smoked-brisket": /brisket/i,
      "bbq-pulled-protein": /pork shoulder/i,
      "bbq-ribs": /ribs/i,
      "bbq-wings": /wings/i,
      "smoked-pork-belly": /pork belly/i,
      "grill-roasted-whole-chicken": /whole chicken/i,
      "smoked-turkey-breast": /turkey breast/i,
      "grilled-flank-steak": /flank/i,
      "bbq-lamb-chops": /lamb.*chops/i,
      "grilled-prawns": /prawns|shrimp/i,
    };
    for (const [classicId, pattern] of Object.entries(cuts)) {
      const recipe = recipeFor(classicId);
      assert.ok(recipe.ingredients.some((item) => ["butcher", "fishmonger"].includes(item.category) && pattern.test(item.name)), classicId);
    }
    const steak = recipeFor("reverse-seared-steak");
    assert.ok(steak.ingredients.some((item) => item.category === "butcher" && /steak/i.test(item.name)));
    assert.match(allGuidance(steak), /thick|[34]\s?cm/i);
    const octopus = recipeFor("charred-octopus");
    const seafood = octopus.ingredients.find((item) => item.category === "fishmonger")!;
    assert.ok(seafood);
    assert.match(`${seafood.name} ${seafood.notes}`, /already.cooked|fully cooked|pre.cooked|ready.to.eat/i);
  });

  it("uses cut-specific thermometer endpoints and tenderness checks, including fully cooked seafood", () => {
    for (const classicId of ["grilled-skewers", "bbq-sausages", "bbq-wings", "grill-roasted-whole-chicken", "smoked-turkey-breast", "charred-octopus"]) {
      assert.match(instructions(recipeFor(classicId)), /75\s?°C/, classicId);
    }
    for (const classicId of ["hot-smoked-fish", "grill-roasted-whole-fish", "grilled-prawns"]) {
      assert.match(instructions(recipeFor(classicId)), /63\s?°C/, classicId);
    }
    for (const classicId of ["reverse-seared-steak", "grilled-flank-steak", "bbq-lamb-chops"]) {
      assert.match(instructions(recipeFor(classicId)), /71\s?°C/, classicId);
    }
    for (const classicId of ["smoked-brisket", "bbq-pulled-protein", "bbq-ribs"]) {
      const recipe = recipeFor(classicId);
      assert.match(instructions(recipe), /9[0-6](?:[–-]9[0-6])?\s?°C/, classicId);
      assert.match(instructions(recipe), /tender|probe/i, classicId);
      assert.ok(recipe.cookMinutes >= 120, classicId);
      assert.ok(recipeFor(classicId, "vegan").cookMinutes < recipe.cookMinutes, `${classicId}: plant adaptation needs its own duration`);
    }
    for (const classicId of BBQ_IDS.filter((id) => !["cold-smoked-platter", "smoked-vegetable-tray", "smoked-grain-bowl", "smoked-cheese-dip"].includes(id))) {
      const recipe = recipeFor(classicId);
      assert.match(allGuidance(recipe), /thermometer|probe/i, classicId);
      assert.match(recipe.safetySource ?? "", /^https:\/\/www\.(?:foodstandards|foodauthority\.nsw)\.gov\.au\//, classicId);
    }
  });

  it("keeps cold-smoked platters to commercially ready-to-eat products with explicit cold-chain guidance", () => {
    const fish = recipeFor("cold-smoked-platter");
    const fishItem = fish.ingredients.find((item) => item.category === "fishmonger")!;
    assert.ok(fishItem);
    assert.match(`${fishItem.name} ${fishItem.notes}`, /ready.to.eat|commercial/i);
    assert.match(allGuidance(fish), /5\s?°C/);
    assert.match(allGuidance(fish), /raw fish|curing|cure|cold.smok/i);
    assert.match(allGuidance(fish), /pregnan|vulnerable|older|immune|higher.risk/i);
    const vegetarian = recipeFor("cold-smoked-platter", "vegetarian");
    assert.match(vegetarian.ingredients.map((item) => `${item.name} ${item.notes}`).join(" "), /pasteuri[sz]ed/i);
    assert.ok(!vegetarian.ingredients.some((item) => item.category === "fishmonger"));
    const vegan = recipeFor("cold-smoked-platter", "vegan");
    assert.match(vegan.ingredients.map((item) => `${item.name} ${item.notes}`).join(" "), /ready.to.eat|fully cooked/i);
    assert.ok(!vegan.allergens.includes("milk"));
  });

  it("keeps gluten-free and plant alternatives distinct in pantry matching", () => {
    const sharedSeasoning = generateRecipe({ classicId: "smoked-brisket", regionId: "texas-bbq", servings: 4, pantry: "black pepper" });
    const pepper = sharedSeasoning.ingredients.find((item) => item.id === "black-pepper")!;
    assert.ok(pepper);
    assert.equal(pepper.name, "Ground black pepper");
    assert.equal(pepper.inPantry, true, "A merged base/profile ingredient must preserve the profile's explicit pantry alias.");
    const input = { classicId: "bbq-sausages", regionId: "cantonese-char-siu", servings: 4, diet: "gluten-free" as const };
    const gf = generateRecipe({ ...input, pantry: "soy sauce, ketchup, tomato ketchup, five-spice, rice vinegar, sausages, pork sausages, bread rolls, vegetable stock" });
    const protectedProducts = gf.ingredients.filter((item) => /gluten[ -]free/i.test(item.name));
    assert.ok(protectedProducts.length >= 3);
    for (const item of protectedProducts) assert.equal(item.inPantry, false, item.name);
    const exact = generateRecipe({ ...input, pantry: protectedProducts.map((item) => item.name) });
    for (const item of protectedProducts) assert.equal(exact.ingredients.find((entry) => entry.id === item.id)?.inPantry, true, item.name);
    const vegan = generateRecipe({ classicId: "smoked-cheese-dip", regionId: "texas-bbq", servings: 4, diet: "vegan", pantry: "milk, cheese, smoked cheese, cream, butter" });
    assert.ok(vegan.ingredients.every((item) => !item.inPantry));
    assert.ok(!vegan.allergens.some((allergen) => ["milk", "egg"].includes(allergen)));
  });

  it("gives vegetarian and vegan adaptations their own preparation and cooking instructions", () => {
    const plantMains: Record<string, RegExp> = {
      "smoked-brisket": /mushroom|tempeh/i,
      "hot-smoked-fish": /tofu/i,
      "cold-smoked-platter": /tofu|cheddar/i,
      "bbq-pulled-protein": /jackfruit.*beans|beans.*jackfruit/i,
      "grilled-skewers": /tofu/i,
      "bbq-sausages": /plant links|plant-based sausages|vegan chorizo/i,
      "reverse-seared-steak": /cauliflower/i,
      "smoked-vegetable-tray": /tofu|halloumi/i,
      "bbq-ribs": /tempeh.*mushroom|mushroom.*tempeh/i,
      "smoked-cheese-dip": /cannellini|cheddar.*provolone/i,
      "grill-roasted-whole-fish": /cauliflower/i,
      "smoked-grain-bowl": /tempeh/i,
      "bbq-wings": /cauliflower.*chickpeas|chickpeas.*cauliflower/i,
      "smoked-pork-belly": /tofu.*aubergine|aubergine.*tofu/i,
      "grill-roasted-whole-chicken": /tofu.*mushroom|mushroom.*tofu/i,
      "smoked-turkey-breast": /tempeh/i,
      "grilled-prawns": /tofu.*courgette|courgette.*tofu/i,
      "charred-octopus": /mushroom.*beans|beans.*mushroom/i,
      "grilled-flank-steak": /mushroom|portobello/i,
      "bbq-lamb-chops": /tofu/i,
    };
    const animalCuts = /\b(?:chicken|turkey|poultry|pork|beef|lamb|salmon|trout|mackerel|prawns?|shrimp|octopus|tentacles?|giblets?|breasts?|thighs?|wings?|brisket)\b/i;
    for (const classicId of BBQ_IDS) for (const region of REGIONS) for (const diet of ["vegetarian", "vegan"] as const) {
      const recipe = recipeFor(classicId, diet, region.id);
      const method = [instructions(recipe), ...(recipe.methodNotes ?? [])].join(" ");
      assert.match(method, plantMains[classicId], `${recipe.id}: the selected adaptation needs its own method`);
      assert.doesNotMatch(method, animalCuts, `${recipe.id}: animal cut instructions leaked into a plant adaptation`);
      if (diet === "vegan") {
        // Explicit plant products remain valid; an unqualified animal dairy/egg
        // instruction must not survive after the ingredient substitution.
        const withoutNamedPlantProducts = method.replace(/\b(?:coconut|soy|oat|almond|rice)\s+(?:milk|cream|yogh?urt)\b/gi, "plant product");
        assert.doesNotMatch(withoutNamedPlantProducts, /\b(?:milk|cheddar|provolone|halloumi|parmesan|butter|eggs?|cream|yogh?urt)\b/i, recipe.id);
      }
    }
  });

  it("scales BBQ food quantities once without weakening the safety guidance", () => {
    for (const classicId of BBQ_IDS) {
      const baseline = recipeFor(classicId, "balanced", "korean-bbq");
      for (const servings of [1, 2, 3, 8, 12]) {
        const scaled = recipeFor(classicId, "balanced", "korean-bbq", servings);
        for (const item of baseline.ingredients) {
          const amount = scaled.ingredients.find((entry) => entry.id === item.id)?.amount;
          assert.ok(amount !== undefined && Math.abs(amount - item.amount * servings / 4) <= 0.0001, `${scaled.id}: ${item.name}`);
        }
        assert.equal(scaled.safetyNote, baseline.safetyNote, scaled.id);
        assert.equal(scaled.sourceLabel, LABEL);
      }
    }
  });

  it("uses bone-in portions and shorter covered methods for small servings instead of fractional whole birds", () => {
    for (const servings of [1, 2, 3]) {
      const chicken = recipeFor("grill-roasted-whole-chicken", "balanced", "texas-bbq", servings);
      const main = chicken.ingredients.find((item) => item.id === "whole-chicken")!;
      assert.ok(main);
      assert.equal(main.name, "Bone-in chicken portions");
      assert.equal(main.amount, 400 * servings);
      assert.equal(main.unit, "g");
      assert.match(instructions(chicken), /bone-in portions/);
      assert.match(instructions(chicken), /45–65\s*minutes/);
      assert.match(instructions(chicken), /75\s?°C/);
      assert.doesNotMatch(instructions(chicken), /80–110\s*minutes/);

      const slowCuts: Array<[string, string, number]> = [
        ["smoked-brisket", "beef-brisket", 1200],
        ["bbq-pulled-protein", "pork-shoulder", 1200],
        ["bbq-ribs", "pork-ribs", 1400],
        ["smoked-pork-belly", "pork-belly", 1000],
      ];
      for (const [classicId, ingredientId, baseGrams] of slowCuts) {
        const small = recipeFor(classicId, "balanced", "texas-bbq", servings);
        const cut = small.ingredients.find((item) => item.id === ingredientId)!;
        assert.ok(cut, small.id);
        assert.equal(cut.amount, baseGrams * servings / 4, small.id);
        assert.equal(cut.unit, "g", small.id);
        assert.match(instructions(small), /cover/i, small.id);
        assert.match(instructions(small), /160\s?°C/, small.id);
        assert.match(instructions(small), /tender|pulls apart/i, small.id);
        assert.ok(small.cookMinutes < recipeFor(classicId).cookMinutes, small.id);
      }
    }
    for (const servings of [4, 8, 12]) {
      const chicken = recipeFor("grill-roasted-whole-chicken", "balanced", "texas-bbq", servings);
      const main = chicken.ingredients.find((item) => item.id === "whole-chicken")!;
      assert.equal(main.name, "Whole chicken, unstuffed");
      assert.equal(main.amount, 400 * servings);
      assert.match(instructions(chicken), /80–110\s*minutes/);
      assert.match(instructions(chicken), /75\s?°C/);
      if (servings > 4) assert.match(main.notes ?? "", /similarly sized birds|bone-in portions/);
    }
  });

  it("explains smoker versus kitchen methods and reserves regional sauces for a controlled finish", () => {
    for (const classicId of ["smoked-brisket", "hot-smoked-fish", "smoked-vegetable-tray", "smoked-grain-bowl", "smoked-turkey-breast"]) {
      const recipe = recipeFor(classicId);
      const notes = recipe.methodNotes?.join(" ") ?? "";
      assert.match(notes, /smok/i, classicId);
      assert.match(notes, /oven|kitchen/i, classicId);
      assert.ok(!recipe.ingredients.some(isFuel), classicId);
    }
    for (const regionId of ["kansas-city-bbq", "japanese-yakitori", "cantonese-char-siu", "south-african-braai"]) {
      const recipe = recipeFor("bbq-wings", "balanced", regionId);
      assert.match(allGuidance(recipe), /burn|scorch|sugar|sweet|after cooking|off the heat|finishing/i, regionId);
    }
  });

  it("routes BBQ spices, cheese, meat and seafood to suitable shops without generic specialty assumptions", () => {
    const spiceShop = shop("spices", "specialty", "spices");
    const cheeseShop = shop("cheese", "specialty", "cheese");
    const butcher = shop("butcher", "butcher", "butcher");
    const fishmonger = shop("seafood", "fishmonger", "seafood");
    const generic = shop("generic", "specialty");
    const samples = [
      recipeFor("smoked-brisket", "balanced", "texas-bbq"),
      recipeFor("smoked-brisket", "balanced", "turkish-mangal"),
      recipeFor("smoked-brisket", "balanced", "cantonese-char-siu"),
      recipeFor("smoked-brisket", "gluten-free", "cantonese-char-siu"),
    ].flatMap((recipe) => recipe.ingredients);
    for (const id of ["sweet-paprika", "garlic-powder", "onion-powder", "five-spice", "gf-five-spice", "dried-mint"]) {
      const item = samples.find((entry) => entry.id === id)!;
      assert.ok(item, id);
      assert.equal(ingredientMatchesShop(item, spiceShop), true, id);
      assert.equal(ingredientMatchesShop(item, generic), false, id);
    }
    const provolone: RecipeIngredient = { id: "smoked-provolone", name: "Pasteurised smoked provolone", amount: 100, unit: "g", category: "grocery", allergens: ["milk"], inPantry: false };
    assert.equal(ingredientMatchesShop(provolone, cheeseShop), true);
    assert.equal(ingredientMatchesShop({ ...provolone, name: "Dairy-free plant-based smoked provolone", allergens: [] }, cheeseShop), false);
    for (const item of recipeFor("smoked-cheese-dip", "vegan").ingredients) assert.equal(ingredientMatchesShop(item, cheeseShop), false, item.name);
    const beef = recipeFor("smoked-brisket").ingredients.find((item) => item.category === "butcher")!;
    const fish = recipeFor("hot-smoked-fish").ingredients.find((item) => item.category === "fishmonger")!;
    assert.ok(beef && fish);
    assert.equal(ingredientMatchesShop(beef, butcher), true);
    assert.equal(ingredientMatchesShop(beef, fishmonger), false);
    assert.equal(ingredientMatchesShop(fish, fishmonger), true);
    assert.equal(ingredientMatchesShop(fish, butcher), false);
    for (const item of [beef, fish, provolone]) assert.equal(ingredientMatchesShop(item, generic), false);
    assert.equal(spiceShop.inventoryStatus, "unverified");
  });
});
