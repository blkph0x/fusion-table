import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateMeal } from "../lib/meals.ts";
import { planWeek } from "../lib/planner.ts";
import { fusionAdmits, fusionSearch } from "../lib/fusion-sat.ts";
import { generateRecipe } from "../lib/recipes.ts";

it("blocks a plural chilli dislike and does not put fish on a vegan plate", () => {
  const hot = fusionSearch({
    seed: 7,
    regionId: "thai",
    diet: "balanced",
    spiceHeat: "hot",
    glutenFree: false,
    dairyFree: false,
    vegan: false,
    vegetarian: false,
    eggFree: false,
    servings: 2,
    dislikes: ["chillies"],
  });
  assert.equal(hot.names.some((name) => /chilli|sriracha/i.test(name)), false);
  const vegan = fusionSearch({
    seed: 8,
    regionId: "thai",
    diet: "vegan",
    spiceHeat: "hot",
    glutenFree: false,
    dairyFree: true,
    vegan: true,
    vegetarian: true,
    eggFree: true,
    servings: 2,
  });
  assert.equal(vegan.names.some((name) => /fish|prawn|oyster|shrimp/i.test(name)), false);
});

const chickenThai = {
  mainId: "chicken",
  methodId: "schnitzel",
  regionId: "thai",
  sideId: "rice-greens",
  servings: 2,
  diet: "balanced" as const,
  spiceHeat: "medium" as const,
};

function added(recipe: { ingredients: { id: string; name: string; allergens: string[] }[] }) {
  return recipe.ingredients.filter((item) => item.id.startsWith("sat-"));
}

describe("seeded fusion plates", () => {
  it("keeps an unseeded meal byte-for-byte and changes the plate when the seed changes", () => {
    const plain = generateMeal(chickenThai);
    assert.deepEqual(plain, generateMeal(chickenThai));
    assert.equal(plain.id.includes("-sat-"), false);
    const first = generateMeal({ ...chickenThai, seed: 1 });
    assert.deepEqual(first, generateMeal({ ...chickenThai, seed: 1 }));
    assert.notEqual(first.id, plain.id);
    assert.match(first.fusionNote, /not a live model/);
    assert.match(first.fusionNote, /not a proof about P versus NP/);
    assert.equal(first.sourceLabel, "Template-generated · not kitchen-tested");
    const meals = Array.from({ length: 24 }, (_, index) => generateMeal({ ...chickenThai, seed: index + 1 }));
    const signatures = meals.map((meal) => {
      const extra = added(meal).map((item) => item.id).join(",");
      const text = meal.steps.map((step) => step.detail).join(" ");
      for (const item of added(meal)) assert.ok(text.includes(item.name), item.name);
      assert.equal(meal.mainId, chickenThai.mainId);
      assert.equal(meal.methodId, chickenThai.methodId);
      assert.equal(meal.sideId, chickenThai.sideId);
      assert.ok(added(meal).length <= 2);
      assert.ok(added(meal).every((item) => !["sat-fish", "sat-prawns", "sat-tofu"].includes(item.id)));
      assert.doesNotMatch(meal.title, /cold stir-fry|hot stir-fry|chopped salad|lettuce wraps|as plated with/i);
      return `${meal.title}|${extra}`;
    });
    assert.ok(new Set(signatures).size >= 10, signatures.join("\n"));
    const forms = meals.map((meal) => meal.tags.at(-1));
    assert.ok(forms.every((form) => form === "regional finish" || form === "warm vegetable finish"), forms.join("\n"));
  });

  it("keeps Thai fish sauce and sriracha, and Chinese oyster sauce, on the right plates", () => {
    const thai = {
      seed: 7,
      regionId: "thai",
      diet: "balanced" as const,
      spiceHeat: "hot" as const,
      glutenFree: false,
      dairyFree: false,
      vegan: false,
      vegetarian: false,
      eggFree: false,
      servings: 2,
      mainId: "chicken",
      methodId: "schnitzel",
    };
    assert.equal(fusionAdmits(thai, ["form_cold_stir", "extra_fish", "umami_fish", "heat_both", "acid_lime"]), true);
    assert.equal(fusionAdmits(thai, ["umami_oyster"]), false);
    assert.equal(fusionAdmits(thai, ["form_cold_stir", "acid_none"]), false);
    assert.equal(fusionAdmits({ ...thai, avoid: ["fish"] }, ["extra_fish"]), false);
    assert.equal(fusionAdmits({ ...thai, avoid: ["fish"] }, ["umami_fish"]), false);
    assert.equal(fusionAdmits({ ...thai, spiceHeat: "mild" }, ["heat_both"]), false);
    assert.equal(fusionAdmits({ ...thai, dislikes: ["chilli"] }, ["heat_birds"]), false);
    const chinese = { ...thai, regionId: "chinese" };
    assert.equal(fusionAdmits(chinese, ["form_cold_stir", "umami_oyster", "acid_lime"]), true);
    assert.equal(fusionAdmits(chinese, ["heat_sriracha"]), false);
    assert.equal(fusionAdmits({ ...chinese, diet: "vegan", mainId: "tofu", methodId: "stir-fried" }, ["umami_oyster"]), false);
    const italian = { ...thai, regionId: "italian" };
    assert.equal(fusionAdmits(italian, ["heat_sriracha"]), false);
    assert.equal(fusionAdmits(italian, ["umami_miso"]), false);
    assert.equal(fusionAdmits(italian, ["umami_fish"]), false);
    const witness = fusionSearch(thai);
    assert.equal(witness.sat, true);
    assert.ok(witness.variables >= 16);
    assert.ok(witness.variables <= 64);
    assert.ok(witness.clauses > witness.variables);
  });

  it("obeys heat, diet and allergen clauses", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const mild = generateMeal({ ...chickenThai, seed, spiceHeat: "mild" });
      assert.ok(added(mild).every((item) => !/sriracha|bird/i.test(item.name)));
      assert.doesNotMatch(mild.title, /sriracha|bird/i);
      const hot = generateMeal({ ...chickenThai, seed, spiceHeat: "hot" });
      // The Thai plate already lists bird's eye. A hot search may add sriracha, or choose bird's eye again and keep the one line.
      const birdLines = hot.ingredients.filter((item) => /bird/i.test(item.name));
      assert.ok(hot.ingredients.some((item) => /sriracha|bird/i.test(item.name)));
      assert.equal(birdLines.length, 1, `seed ${seed}`);
      assert.ok(added(hot).some((item) => /sriracha/i.test(item.name)) || birdLines[0].id === "birds-eye-chilli", `seed ${seed}`);
      const vegan = generateMeal({ ...chickenThai, mainId: "tofu", methodId: "stir-fried", seed, diet: "vegan" });
      assert.ok(added(vegan).every((item) => !item.allergens.some((allergen) => ["fish", "crustacean", "milk", "egg"].includes(allergen))));
      assert.ok(added(vegan).every((item) => !/oyster|fish sauce|prawn|firm white fish/i.test(item.name)));
      const glutenFree = generateMeal({ ...chickenThai, seed, diet: "gluten-free" });
      assert.ok(added(glutenFree).every((item) => !item.allergens.includes("wheat")));
      const noFish = generateMeal({ ...chickenThai, seed, avoidAllergens: ["fish"] });
      assert.ok(added(noFish).every((item) => !item.allergens.includes("fish")));
      assert.ok(added(noFish).every((item) => !/fish|oyster/i.test(item.name)));
      const noChilli = generateMeal({ ...chickenThai, seed, spiceHeat: "hot", dislikes: ["chilli"] });
      assert.ok(added(noChilli).every((item) => !/sriracha|bird|chilli/i.test(item.name)));
      const witness = fusionSearch({
        seed,
        regionId: "thai",
        diet: "balanced",
        spiceHeat: "medium",
        glutenFree: false,
        dairyFree: false,
        vegan: false,
        vegetarian: false,
        eggFree: false,
        servings: 2,
        mainId: "chicken",
        methodId: "schnitzel",
      });
      assert.equal(witness.sat, true);
      assert.equal(witness.satisfied, true);
      assert.ok(witness.variables >= 7);
      assert.ok(witness.clauses > witness.variables);
    }
  });

  it("does not make a seeded week alphabetical or identical, and does not relax a filter", () => {
    const stable = planWeek({ days: 7, servings: 4 });
    assert.deepEqual(stable.days.map((day) => day.recipe?.id), planWeek({ days: 7, servings: 4 }).days.map((day) => day.recipe?.id));
    assert.ok(stable.days.every((day) => !day.recipe?.id.includes("-sat-")));
    const weeks = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => planWeek({ days: 7, servings: 4, seed }));
    const orders = weeks.map((week) => week.days.map((day) => `${day.recipe?.classicId}:${day.recipe?.regionId}`).join("|"));
    assert.ok(new Set(orders).size >= 4, orders.join("\n"));
    const openingRegions = weeks.map((week) => week.days[0].recipe?.regionId);
    assert.ok(new Set(openingRegions).size >= 3, openingRegions.join(","));
    assert.ok(weeks[0].days.some((day) => day.recipe?.id.includes("-sat-")));
    assert.deepEqual(weeks[0].days.map((day) => day.recipe?.id), planWeek({ days: 7, servings: 4, seed: 1 }).days.map((day) => day.recipe?.id));
    assert.ok(weeks[0].notes.some((note) => note.includes("bounded set of SAT-verified models") && note.includes("not proven taste or an exhaustive search")));
    assert.ok(weeks[0].notes.some((note) => note.includes("not a live model")));
    const sesame = planWeek({ days: 7, servings: 4, avoidAllergens: ["sesame"], seed: 11 });
    assert.ok(sesame.days.every((day) => !day.recipe?.allergens.includes("sesame")));
    assert.ok(sesame.days.every((day) => !day.recipe?.ingredients.some((item) => /sesame/i.test(item.name))));
    const vegan = planWeek({ days: 7, servings: 2, diet: "vegan", constraints: { glutenFree: true }, avoidAllergens: ["wheat"], seed: 6 });
    assert.deepEqual(vegan.unfilledDays, []);
    for (const day of vegan.days) {
      const recipe = day.recipe!;
      assert.ok(!recipe.allergens.includes("wheat"), recipe.id);
      assert.ok(!recipe.allergens.includes("fish"), recipe.id);
      assert.ok(!recipe.allergens.includes("milk"), recipe.id);
      assert.ok(recipe.ingredients.every((item) => !["butcher", "fishmonger"].includes(item.category)), recipe.id);
    }
  });

  it("varies a classic remix without changing the unseeded template", () => {
    const input = { classicId: "pasta", regionId: "thai", servings: 4, diet: "balanced" as const };
    const plain = generateRecipe(input);
    assert.deepEqual(plain, generateRecipe(input));
    const seeded = [1, 2, 3, 4, 5, 6].map((seed) => generateRecipe({ ...input, seed }));
    assert.deepEqual(seeded[0], generateRecipe({ ...input, seed: 1 }));
    assert.ok(new Set(seeded.map((recipe) => recipe.title)).size >= 2);
    assert.ok(seeded.every((recipe) => recipe.sourceLabel === "Template-generated · not kitchen-tested"));
  });
});
