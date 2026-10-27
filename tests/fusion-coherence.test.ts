import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySatFusion, fusionAdmits } from "../lib/fusion-sat.ts";
import { generateMeal, MAIN_INGREDIENTS, MEAL_REGIONS } from "../lib/meals.ts";
import { CLASSICS, REGIONS, generateRecipe } from "../lib/recipes.ts";
import { markerLeak } from "../lib/region-affinity.ts";
import { foodWordHit } from "../lib/food-words.ts";
import { encodeShare, decodeShare, specFromRecipe, recipeFromShare } from "../lib/share-recipe.ts";
import type { Recipe } from "../lib/recipe-types.ts";

const chicken = { mainId: "chicken", methodId: "grilled", regionId: "italian", sideId: "garden-salad", servings: 2 };
const extras = (recipe: Recipe) => recipe.ingredients.filter((item) => item.id.startsWith("sat-"));
const finalText = (recipe: Recipe) => recipe.steps.at(-1)!.detail;

function coherentFinish(recipe: Recipe) {
  const additions = extras(recipe);
  assert.ok(additions.length <= 2, recipe.id);
  assert.ok(additions.every((item) => item.category !== "butcher" && item.category !== "fishmonger" && !/tofu|tempeh/i.test(item.name)), recipe.id);
  assert.doesNotMatch(recipe.title, /as plated|cold stir.fry|hot toss|lettuce wrap|chopped salad|cooked peeled prawns|cooked white fish/i, recipe.id);
  assert.doesNotMatch(finalText(recipe), /slice the cooked|chop it|raw peeled prawns|added fish|added prawns/i, recipe.id);
  if (recipe.classicId !== "cold-smoked-platter") assert.doesNotMatch(finalText(recipe), /chill/i, recipe.id);
  for (const item of additions) {
    assert.ok(finalText(recipe).includes(item.name), `${recipe.id}: preparation for ${item.name}`);
    assert.equal(markerLeak(recipe.regionId, item.id, item.name), null, recipe.id);
    const base = recipe.ingredients.filter((other) => !other.id.startsWith("sat-"));
    assert.ok(!base.some((other) => foodWordHit(other.name, item.name)), `${recipe.id}: duplicate ${item.name}`);
  }
  assert.doesNotMatch(recipe.steps.slice(0, -1).map((step) => step.detail).join(" "), /serve promptly|serve immediately|serve straightaway/i, recipe.id);
}

describe("coherent seeded finishes on complete meals", () => {
  it("fixes Italian grilled chicken seeds that formerly added tamarind/tofu, prawns/ginger and wombok", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const recipe = generateMeal({ ...chicken, seed });
      coherentFinish(recipe);
      assert.doesNotMatch(extras(recipe).map((item) => item.name).join(" "), /tamarind|ginger|wombok|sprouts|snow peas|rice vinegar/i);
      assert.equal(recipe.mainId, chicken.mainId);
      assert.equal(recipe.methodId, chicken.methodId);
      assert.equal(recipe.sideId, chicken.sideId);
      assert.match(recipe.title, /^Italian grilled chicken with garden salad/);
      assert.match(recipe.steps.map((step) => step.detail).join(" "), /75°C/);
    }
  });

  it("does not slice filled shells, burgers or cottage pie into a new cold/wrap/stir-fry structure", () => {
    for (const classicId of ["shotgun-shells", "burgers", "cottage-pie"]) for (const regionId of ["italian", "korean-bbq", "home-style"]) for (const seed of [1, 16, 651244]) {
      const recipe = generateRecipe({ classicId, regionId, servings: 3, seed });
      coherentFinish(recipe);
      assert.equal(recipe.classicId, classicId);
      assert.doesNotMatch(finalText(recipe), /slice the cooked pieces|shape of a stir.fry|fill the lettuce/i);
    }
  });

  it("covers every region and every compatible main/method without growing a second protein", () => {
    let checked = 0;
    for (const region of MEAL_REGIONS) for (const seed of [1, 2026, 0xffffffff]) {
      const recipe = generateMeal({ ...chicken, regionId: region.id, seed });
      coherentFinish(recipe);
      checked++;
    }
    for (const [mainIndex, main] of MAIN_INGREDIENTS.entries()) for (const [methodIndex, methodId] of main.methodIds.entries()) {
      const recipe = generateMeal({ ...chicken, mainId: main.id, methodId, regionId: MEAL_REGIONS[(mainIndex * 13 + methodIndex * 7) % MEAL_REGIONS.length].id, seed: checked + 17 });
      coherentFinish(recipe);
      assert.equal(recipe.mainId, main.id);
      assert.equal(recipe.methodId, methodId);
      assert.equal(recipe.sideId, chicken.sideId);
      checked++;
    }
    assert.equal(checked, MEAL_REGIONS.length * 3 + 266);
    // All classic structures and regional profiles also enter this application path.
    for (const [index, classic] of CLASSICS.entries()) for (const region of REGIONS) {
      coherentFinish(generateRecipe({ classicId: classic.id, regionId: region.id, servings: 2, seed: index + 17 }));
    }
  });

  it("keeps meaningful deterministic variation, exact scaled quantities and stable share regeneration", () => {
    const recipes = Array.from({ length: 24 }, (_, index) => generateMeal({ ...chicken, regionId: "thai", sideId: "rice-greens", seed: index + 1 }));
    assert.ok(new Set(recipes.map((recipe) => `${recipe.title}|${recipe.ingredients.map((item) => item.id).join(",")}`)).size >= 16);
    assert.ok(new Set(recipes.map((recipe) => recipe.ingredients.filter((item) => !item.id.startsWith("sat-")).map((item) => item.id).join(","))).size >= 12, "regional pantry exploration still varies the base flavour");
    for (const recipe of recipes.slice(0, 8)) {
      const input = { ...chicken, regionId: "thai", sideId: "rice-greens", seed: recipe.generationInput!.seed! };
      assert.deepEqual(recipe, generateMeal(input));
      const scaled = generateMeal({ ...input, servings: 6 });
      for (const item of extras(recipe)) assert.equal(extras(scaled).find((other) => other.id === item.id)?.amount, item.amount * 3);
      const token = encodeShare(specFromRecipe(recipe));
      assert.deepEqual(recipeFromShare(decodeShare(token)), recipe);
    }
  });

  it("keeps hard diets, allergens, dislikes, pantry flags and cleaner preferences strict", () => {
    for (const seed of [1, 2, 7, 16, 2026]) {
      const recipe = generateMeal({ ...chicken, mainId: "tofu", methodId: "stir-fried", regionId: "thai", sideId: "rice-greens", diet: "vegan", constraints: { glutenFree: true, eggFree: true }, avoidAllergens: ["wheat", "milk", "egg", "fish", "crustacean", "mollusc"], dislikes: ["carrot", "capsicum", "cucumber", "spring onion"], clean: { cleanMode: true, fewerBottles: true }, pantry: ["Wombok", "Bean sprouts", "Snow peas"], seed });
      coherentFinish(recipe);
      assert.ok(recipe.ingredients.every((item) => !["butcher", "fishmonger"].includes(item.category)));
      assert.ok(!recipe.allergens.some((allergen) => ["wheat", "milk", "egg", "fish", "crustacean", "mollusc"].includes(allergen)));
      assert.ok(extras(recipe).every((item) => !/carrot|capsicum|cucumber|spring onions/i.test(item.name)));
      for (const item of extras(recipe)) if (["sat-wombok", "sat-sprouts", "sat-snow-peas"].includes(item.id)) assert.equal(item.inPantry, true);
      const plain = generateMeal({ ...chicken, mainId: "chickpeas", methodId: "curry", regionId: "thai", seed });
      assert.ok(!extras(plain).some((item) => /fish|prawn|tofu/i.test(item.name)), "balanced plant main is still the chosen main");
    }
  });

  it("gives real preparation for every finish and cooks sprouts rather than serving them raw", () => {
    let sprouts = 0, warm = 0;
    for (let seed = 1; seed <= 32; seed++) {
      const recipe = generateMeal({ ...chicken, regionId: "thai", seed });
      coherentFinish(recipe);
      if (extras(recipe).some((item) => item.id === "sat-sprouts")) {
        const preparation = recipe.steps.find((step) => step.title === "Prepare the finishing ingredients")!;
        assert.match(preparation.detail, /Cook \d+(?:\.\d+)? g Bean sprouts in boiling water until steaming hot/);
        sprouts++;
      }
      if (recipe.tags.includes("warm vegetable finish")) {
        assert.ok(extras(recipe).some((item) => ["sat-capsicum", "sat-wombok", "sat-carrot", "sat-sprouts", "sat-snow-peas"].includes(item.id)));
        assert.match(finalText(recipe), /do not chop or stir.fry the finished main/i);
        warm++;
      }
    }
    assert.ok(sprouts > 0 && warm > 0);
  });

  it("adds no invented ingredients, title suffix or eight-minute delay when the existing plate needs no finish", () => {
    const plain = generateMeal(chicken);
    const finished = applySatFusion(plain, { seed: 1, regionId: "italian", diet: "balanced", spiceHeat: "medium", glutenFree: false, dairyFree: false, vegan: false, vegetarian: false, eggFree: false, servings: 2, dislikes: ["capsicum", "carrot"] });
    assert.equal(extras(finished).length, 0);
    assert.equal(finished.title, plain.title);
    assert.equal(finished.totalMinutes, plain.totalMinutes);
    assert.match(finished.id, /-sat-1$/);
    assert.match(finalText(finished), /No extra ingredient is needed/);
  });

  it("retains the standalone solver's existing diet/allergen clauses", () => {
    const spec = { seed: 7, regionId: "thai", diet: "balanced" as const, spiceHeat: "hot" as const, glutenFree: false, dairyFree: false, vegan: false, vegetarian: false, eggFree: false, servings: 2 };
    assert.equal(fusionAdmits(spec, ["extra_prawn", "acid_lime"]), true);
    assert.equal(fusionAdmits({ ...spec, avoid: ["crustacean"] }, ["extra_prawn"]), false);
    assert.equal(fusionAdmits({ ...spec, diet: "vegan", vegan: true }, ["extra_prawn"]), false);
  });

  it("prepares seeded additions before delicate curry/schnitzel sauce finishes and assembles without cooking again", () => {
    let checked = 0;
    for (const methodId of ["curry", "schnitzel"]) for (const regionId of ["thai", "japanese"]) for (const seed of [1, 2, 7, 16, 2026]) {
      const recipe = generateMeal({ ...chicken, methodId, regionId, sideId: "rice-greens", servings: 3, seed });
      const additions = extras(recipe);
      if (!additions.length) continue;
      const prepareIndex = recipe.steps.findIndex((step) => step.title === "Prepare the finishing ingredients");
      const finishIndex = recipe.steps.findIndex((step) => step.title === "Finish the regional sauce");
      const mainIndex = recipe.steps.findIndex((step) => step.title === (methodId === "curry" ? "Simmer the main" : "Shallow-fry until crisp"));
      assert.ok(mainIndex >= 0 && prepareIndex < finishIndex && mainIndex < finishIndex, recipe.id);
      if (methodId === "schnitzel") {
        assert.ok(prepareIndex < mainIndex, recipe.id);
        assert.match(recipe.steps[prepareIndex].detail, /before starting the main's final cooking step/);
      } else {
        assert.ok(mainIndex < prepareIndex, recipe.id);
        assert.match(recipe.steps[prepareIndex].detail, /During the final 8 minutes/);
      }
      assert.match(recipe.steps[mainIndex].detail, /75°C/, recipe.id);
      assert.equal(recipe.steps.at(-1)!.title, "Assemble the finished meal");
      assert.doesNotMatch(finalText(recipe), /Wash|Cook in a separate pan|Cook .*boiling water|thinly slice|finely shred|3–5 minutes|8 minutes/, recipe.id);
      assert.match(finalText(recipe), /already prepared/);
      assert.equal(recipe.steps.at(-1)!.minutes, undefined);
      assert.equal(recipe.steps[prepareIndex].minutes, 8);
      for (const addition of additions) {
        const phrase = `${addition.amount}${addition.unit ? ` ${addition.unit}` : ""} ${addition.name}`;
        const details = recipe.steps.map((step) => step.detail).join(" ");
        assert.ok(recipe.steps[prepareIndex].detail.includes(phrase), `${recipe.id}: ${phrase}`);
        assert.equal(details.split(phrase).length - 1, 1, `${recipe.id}: quantity used once for ${addition.name}`);
      }
      if (methodId === "schnitzel") {
        assert.match(recipe.steps[prepareIndex].detail, /crisp main uncovered on a rack/);
        assert.match(finalText(recipe), /sauce beside the crisp coating/);
      }
      if (regionId === "japanese") {
        const detail = recipe.steps[finishIndex].detail.toLowerCase();
        for (const condiment of recipe.ingredients.filter((item) => ["miso", "yuzu-kosho"].includes(item.id))) {
          assert.ok(detail.indexOf("off the heat") >= 0 && detail.indexOf("off the heat") < detail.indexOf(condiment.name.toLowerCase()), recipe.id);
        }
      }
      checked++;
    }
    assert.ok(checked >= 12, `actual nonempty finishing cases: ${checked}`);
  });

  it("moves the existing eight-minute allowance once and leaves legacy classics' preparation in their final step", () => {
    const input = { ...chicken, mainId: "chickpeas", methodId: "curry", regionId: "thai", sideId: "rice-greens", servings: 2 };
    const plain = generateMeal(input);
    const spec = { ...input, seed: 16, diet: "balanced" as const, spiceHeat: "medium" as const, glutenFree: false, dairyFree: false, vegan: false, vegetarian: false, eggFree: false };
    const finished = applySatFusion(plain, spec);
    assert.ok(extras(finished).length > 0);
    assert.equal(finished.cookMinutes - plain.cookMinutes, 8);
    assert.equal(finished.totalMinutes - plain.totalMinutes, 8);
    const stepMinutes = (recipe: Recipe) => recipe.steps.reduce((total, step) => total + (step.minutes ?? 0), 0);
    assert.equal(stepMinutes(finished) - stepMinutes(plain), 8);
    assert.equal(finished.steps.filter((step) => step.title === "Prepare the finishing ingredients").length, 1);
    const authoredClassic = generateRecipe({ classicId: "shotgun-shells", regionId: "thai", servings: 2 });
    // Truly legacy recipes can still lack explicit boundary metadata.
    const classic = { ...authoredClassic, steps: authoredClassic.steps.map((step) => { const copy = { ...step }; delete copy.finishBoundary; return copy; }) };
    assert.ok(!classic.steps.some((step) => step.title === "Finish the regional sauce"));
    const legacy = applySatFusion(classic, { ...spec, mainId: undefined, methodId: undefined });
    assert.ok(!legacy.steps.some((step) => step.title === "Prepare the finishing ingredients"));
    assert.notEqual(legacy.steps.at(-1)!.title, "Assemble the finished meal");
  });

  it("uses explicit classic finish boundaries so Japanese42 additions precede sauce finish and assembly", () => {
    for (const classicId of ["pasta", "burgers", "flatbread", "risotto", "tacos", "roast", "fried-rice", "cottage-pie", "shotgun-shells", "grilled-skewers"]) {
      const recipe = generateRecipe({ classicId, regionId: "japanese", servings: 2, seed: 42 });
      coherentFinish(recipe);
      const additions = extras(recipe);
      const boundary = recipe.steps.findIndex((step) => step.finishBoundary);
      assert.ok(boundary >= 0, recipe.id);
      assert.equal(recipe.steps.at(-1)!.title, "Assemble the finished meal");
      if (additions.length) {
        const preparation = recipe.steps.findIndex((step) => step.title === "Prepare the finishing ingredients");
        assert.ok(preparation >= 0 && preparation < boundary, recipe.id);
        assert.equal(recipe.steps[preparation].minutes, 8);
        for (const addition of additions) assert.ok(recipe.steps[preparation].detail.includes(`${addition.amount}${addition.unit ? ` ${addition.unit}` : ""} ${addition.name}`));
        if (["burgers", "flatbread"].includes(classicId)) {
          assert.doesNotMatch(recipe.steps[preparation].detail, /After the main has reached/);
          assert.match(recipe.steps[preparation].detail, /Keep any uncooked main chilled/);
        }
      }
      assert.doesNotMatch(finalText(recipe), /Cook the main|Wash|3–5 minutes|Cook .*boiling water/);
      assert.equal(recipe.steps.at(-1)!.minutes, undefined);
    }
  });

  it("keeps seeded cold-smoked salmon, cheddar and ready-to-eat tofu chilled without recooking the main", () => {
    for (const diet of ["balanced", "vegetarian", "vegan"] as const) for (const regionId of ["japanese", "thai", "home-style"]) for (const seed of [1, 7, 42]) {
      const recipe = generateRecipe({ classicId: "cold-smoked-platter", regionId, servings: 2, diet, seed });
      coherentFinish(recipe);
      assert.equal(recipe.tags.at(-1), "regional finish");
      assert.ok(!extras(recipe).some((item) => item.id === "sat-sprouts"), "cold fresh finish avoids a new cook-and-chill cycle");
      const last = recipe.steps.at(-1)!;
      assert.equal(last.title, "Assemble the finished meal");
      assert.match(last.detail, /chilled purchased ready-to-eat main/);
      assert.match(last.detail, /5°C or colder until service/);
      assert.doesNotMatch(last.detail, /Cook the main|fully cooked main|cooking endpoint|hot toss|warm the main/i);
      const keep = recipe.steps.find((step) => step.title === "Keep the chilled components ready")!;
      assert.ok(keep);
      assert.doesNotMatch(keep.detail, /fully cooked main/i);
      const preparation = recipe.steps.find((step) => step.title === "Prepare the finishing ingredients");
      if (preparation) {
        assert.match(preparation.detail, /Keep the purchased ready-to-eat main refrigerated at 5°C or colder/);
        assert.doesNotMatch(preparation.detail, /After the main has reached|Cook in a separate pan|Cook .*boiling water/);
        assert.ok(recipe.steps.indexOf(preparation) < recipe.steps.findIndex((step) => step.finishBoundary));
      }
    }
  });
});
