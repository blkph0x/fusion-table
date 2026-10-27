import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateMeal, MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SIDES } from "../lib/meals.ts";
import { buildSidePlan } from "../lib/side-plans.ts";
import { cutsForMethod } from "../lib/cut-method.ts";
import { markerLeak } from "../lib/region-affinity.ts";
import { applySatFusion, fusionSearch, fusionAdmits } from "../lib/fusion-sat.ts";

const base = { mainId: "chicken", methodId: "grilled", regionId: "home-kitchen", sideId: "rice-greens", servings: 4 };
const text = (recipe: ReturnType<typeof generateMeal>) => recipe.steps.map((step) => step.detail).join(" ");

describe("complete meal integrity", () => {
  it("checks every side's measured citrus and oil against its steps, variants and serving sizes", () => {
    let checked = 0;
    for (const side of MEAL_SIDES) for (const gf of [false, true]) for (const df of [false, true]) for (const servings of [1, 4, 12]) {
      const plan = buildSidePlan(side.id, gf, df, servings);
      const details = plan.steps.map((step) => step.detail).join(" ");
      assert.doesNotMatch(details, /\$\{|undefined|\bNaN\b/, side.id);
      if (gf) assert.ok(plan.ingredients.every((item) => !item.allergens.some((allergen) => ["wheat", "barley", "rye", "oats"].includes(allergen))), side.id);
      if (df) assert.ok(plan.ingredients.every((item) => !item.allergens.includes("milk")), side.id);
      for (const id of ["lemon-juice", "lime-juice", "olive-oil"]) {
        const item = plan.ingredients.find((ingredient) => ingredient.id === id);
        if (!item) continue;
        const pattern = new RegExp(`(\\d+(?:\\.\\d+)?) ${item.unit} (?:of the )?${id.replace("-", " ")}`, "gi");
        const used = [...details.matchAll(pattern)].reduce((sum, match) => sum + Number(match[1]), 0);
        assert.ok(Math.abs(used - item.amount * servings / 4) < 0.0001, `${side.id}/${gf}/${df}/${servings}: ${id} listed ${item.amount * servings / 4}, used ${used}`);
      }
      checked += 1;
    }
    assert.equal(checked, 1_080);
  });

  it("keeps cleaner ingredient portions equal to the method portions", () => {
    const meal = generateMeal({ ...base, clean: { cleanMode: true, moreVegetables: true } });
    const rice = meal.ingredients.find((item) => item.id === "rice");
    const beans = meal.ingredients.find((item) => item.id === "green-beans");
    assert.equal(rice?.amount, 300);
    assert.equal(beans?.amount, 400);
    assert.match(text(meal), /300 g long-grain rice/);
    assert.match(text(meal), /400 g green beans/);
    assert.ok(meal.ingredients.every((item) => Number.isFinite(item.amount) && item.amount > 0));
  });

  it("describes the trimmed sauce and regional rice consistently at service", () => {
    const meal = generateMeal({
      mainId: "tofu", methodId: "grilled", regionId: "thai", sideId: "rice-greens",
      servings: 3, diet: "vegan", spiceHeat: "gentle", seed: 2140067310,
      clean: { cleanMode: true, fewerBottles: true },
    });
    assert.ok(!meal.ingredients.some((item) => item.id === "coconut-milk"));
    assert.doesNotMatch(meal.components.sauce, /coconut/i);
    assert.doesNotMatch(meal.description, /coconut/i);
    const serving = meal.steps.find((step) => step.title === "Bring the meal together")!;
    assert.doesNotMatch(serving.detail, /coconut|long-grain rice/i);
    assert.match(meal.components.side, /Jasmine rice/);
    assert.match(serving.detail, /Jasmine rice/);
    assert.ok(serving.detail.includes(meal.components.sauce));
  });

  it("keeps the selected side instead of adding extra regional starches", () => {
    const rice = generateMeal(base);
    assert.equal(rice.sideId, "rice-greens");
    assert.ok(!rice.ingredients.some((item) => /bread|potato|chapati|noodle|couscous/i.test(item.name)));
    const salad = generateMeal({ ...base, regionId: "indian", sideId: "garden-salad" });
    assert.ok(!salad.ingredients.some((item) => /rice|bread|potato|chapati|noodle|couscous/i.test(item.name)));
    const japanese = generateMeal({ ...base, regionId: "japanese" });
    assert.match(japanese.ingredients.find((item) => item.id === "short-grain-rice")!.name, /Japanese short-grain rice/);
    assert.match(text(japanese), /Japanese short-grain rice/);
    assert.match(text(japanese), /water amount directed on the rice packet/);
    assert.doesNotMatch(text(japanese), /600 ml water/);
    const smokedRice = generateMeal({ ...base, methodId: "smoked", regionId: "japanese" });
    assert.match(text(smokedRice), /Japanese short-grain rice/);
    assert.doesNotMatch(text(smokedRice), /600 ml water/);
  });

  it("finishes short smoked animal cooks before resting and uses a smoke timeline for sides", () => {
    for (const mainId of ["chicken", "salmon"]) {
      const meal = generateMeal({ ...base, mainId, methodId: "smoked" });
      const smoking = meal.steps.find((step) => step.title === "Start the hot smoke")!;
      assert.match(smoking.detail, /Hot-smoke for about .* minutes total/);
      assert.match(smoking.detail, mainId === "salmon" ? /63°C/ : /75°C/);
      assert.doesNotMatch(smoking.detail, /half of the cook/);
      const side = meal.steps.find((step) => step.title.startsWith("Near the end:") && step.detail.includes("Prepare sides alongside the main"))!;
      assert.match(side.detail, /minutes of the smoke/);
      assert.doesNotMatch(side.detail, /simmer|slow-cooking meat/);
    }
  });

  it("only chooses a broth bowl when the base has enough retained simmering liquid", () => {
    const input = {
      mainId: "tofu", regionId: "thai", sideId: "rice-greens", servings: 3,
      diet: "vegan" as const, spiceHeat: "gentle" as const, seed: 3336188269,
      clean: { cleanMode: true, fewerBottles: true },
    };
    const grilled = generateMeal({ ...input, methodId: "grilled" });
    assert.equal(grilled.ingredients.find((item) => item.id === "vegetable-stock")!.amount, 30);
    assert.ok(!grilled.tags.includes("broth bowl"));
    assert.deepEqual(generateMeal({ ...input, methodId: "grilled" }), grilled);
    const curry = generateMeal({ ...input, methodId: "curry" });
    assert.ok(curry.tags.includes("broth bowl"));
    assert.match(curry.steps.at(-1)!.detail, /finished curry or braising liquid/);
    const liquid = curry.ingredients.filter((item) => ["vegetable-stock", "coconut-milk", "passata"].includes(item.id)).reduce((sum, item) => sum + item.amount, 0);
    assert.ok(liquid >= curry.servings * 100);
    const poached = generateMeal({ ...input, mainId: "chicken", diet: "balanced", methodId: "poached" });
    assert.ok(poached.ingredients.find((item) => item.id === "vegetable-stock")!.amount >= poached.servings * 100);
    assert.ok(!poached.tags.includes("broth bowl"), "discarded poaching stock is not broth for service");
    const unseeded = generateMeal({ ...input, methodId: "curry", seed: undefined });
    const tooDry = { ...unseeded, ingredients: unseeded.ingredients.map((item) => ["vegetable-stock", "coconut-milk", "passata"].includes(item.id) ? { ...item, amount: 10 } : item) };
    const finished = applySatFusion(tooDry, { ...input, methodId: "curry", glutenFree: false, dairyFree: true, vegan: true, vegetarian: true, eggFree: true, brothReady: true });
    assert.ok(!finished.tags.includes("broth bowl"), "caller cannot opt a dry recipe into a broth form");
    assert.ok(!finished.allergens.includes("milk"));
  });

  it("explains the actual seeded sauce instead of the region's unselected default seasonings", () => {
    for (const seed of [1, 7, 42, 99]) {
      const meal = generateMeal({ mainId: "halloumi", methodId: "grilled", regionId: "japanese", sideId: "garden-salad", servings: 2, seed });
      assert.ok(meal.fusionNote.split(". ")[0].includes(meal.components!.sauce));
    }
  });

  it("keeps raw salads crisp when scheduling sides near the end of a smoke", () => {
    for (const seed of [undefined, 1, 251]) {
      const meal = generateMeal({ mainId: "chicken", methodId: "smoked", regionId: "filipino", sideId: "garden-salad", servings: 2, ...(seed === undefined ? {} : { seed }) });
      const prep = meal.steps.find((step) => /near the end: prepare the side ingredients/i.test(step.title));
      const salad = meal.steps.find((step) => /^dress just before serving/i.test(step.title));
      assert.ok(prep && salad, "the salad has preparation near service and a separate late dressing");
      assert.match(prep.detail, /lettuce/i);
      assert.match(salad.detail, /minutes before serving/);
      assert.doesNotMatch(salad.detail, /keep it hot|cook the salad/i);
      assert.match(meal.steps.map((step) => step.detail).join(" "), /75°C/);
    }
  });

  it("defers service until a coherent finish without losing the main's endpoint", () => {
    let coldCount = 0;
    for (let seed = 1; seed <= 24; seed += 1) {
      const meal = generateMeal({ ...base, regionId: "thai", seed });
      const transformed = meal.tags.at(-1) !== "as plated";
      if (!transformed) continue;
      const beforeFinish = meal.steps.slice(0, -1).map((step) => step.detail).join(" ");
      assert.match(beforeFinish, /75°C/);
      assert.doesNotMatch(beforeFinish, /serve promptly|serve immediately|serve straightaway/i);
      const assembly = meal.steps.find((step) => step.title === "Bring the meal together")!;
      assert.match(assembly.detail, /Follow the final step below before serving/);
      assert.ok(meal.steps.indexOf(assembly) < meal.steps.length - 1);
      if (/cold|chopped salad/.test(meal.tags.at(-1)!)) {
        assert.match(meal.steps.at(-1)!.detail, /until cold/);
        coldCount += 1;
      }
    }
    assert.equal(coldCount, 0, "seeded finishing must preserve this main's chosen hot cooking method");
  });

  it("enforces exclusions on the whole plate with and without a seed", () => {
    for (const seed of [undefined, 1, 42]) {
      assert.throws(() => generateMeal({ ...base, mainId: "salmon", seed, avoidAllergens: ["fish"] }), /recorded allergen fish/);
      assert.throws(() => generateMeal({ ...base, mainId: "salmon", seed, dislikes: ["salmon"] }), /hard dislike/);
      assert.throws(() => generateMeal({ ...base, sideId: "sesame-spinach", seed, avoidAllergens: ["sesame"] }), /recorded allergen sesame/);
      assert.throws(() => generateMeal({ ...base, sideId: "garden-salad", seed, dislikes: ["cucumber"] }), /hard dislike/);
      assert.throws(() => generateMeal({ ...base, seed, avoidAllergens: ["celery"] }), /recorded allergen celery/);
      const gf = generateMeal({ ...base, sideId: "garlic-bread", seed, avoidAllergens: ["gluten"] });
      assert.ok(!gf.allergens.some((allergen) => ["wheat", "barley", "rye", "oats"].includes(allergen)));
      const df = generateMeal({ ...base, sideId: "mashed-potato", seed, avoidAllergens: ["milk"] });
      assert.ok(!df.allergens.includes("milk"));
      const filtered = generateMeal({ ...base, regionId: "thai", seed, spiceHeat: "hot", dislikes: ["chilli"] });
      assert.ok(filtered.ingredients.every((item) => !/sriracha|bird.?s eye|chill[iy]/i.test(item.name)));
    }
  });

  it("tightens a selected diet with explicit constraints instead of retaining meat", () => {
    for (const constraints of [{ vegan: true }, { vegetarian: true }]) {
      assert.throws(() => generateMeal({ ...base, constraints }), /does not fit/);
      const plant = generateMeal({ ...base, mainId: "chickpeas", methodId: "roasted", constraints, seed: 17 });
      assert.equal(plant.mainId, "chickpeas");
      assert.ok(plant.ingredients.every((item) => !["butcher", "fishmonger"].includes(item.category)));
      if (constraints.vegan) assert.ok(!plant.allergens.some((allergen) => ["milk", "egg"].includes(allergen)));
    }
    assert.throws(() => generateMeal({ ...base, constraints: { vegan: "yes" } } as never), /true or false/);
    assert.throws(() => generateMeal({ ...base, avoidAllergens: [4] } as never), /supported allergen/);
    assert.throws(() => generateMeal({ ...base, dislikes: [4] } as never), /ingredient names/);
  });

  it("writes usable sauce instructions after disliked flavour ingredients are omitted", () => {
    const meal = generateMeal({ ...base, dislikes: ["garlic", "thyme", "oregano", "bay", "lemon", "parsley"] });
    const sauce = meal.steps.find((step) => step.title === "Make the regional sauce base")!;
    assert.doesNotMatch(sauce.detail, /Add\s+(?:and|,)|stir in\s*\./);
    assert.match(meal.components.sauce, /adjusted for your exclusions/);
    assert.ok(meal.ingredients.every((item) => !/garlic|thyme|oregano|bay|lemon|parsley/i.test(item.name)));
  });

  it("specifies dietary versions of purchased garlic bread, kimchi and oat sides", () => {
    const kimchi = generateMeal({ ...base, mainId: "tofu", regionId: "korean", sideId: "kimchi-rice", diet: "vegan" });
    assert.match(kimchi.ingredients.find((item) => item.id === "kimchi")!.name, /vegan/i);
    const bread = generateMeal({ ...base, mainId: "chickpeas", methodId: "roasted", regionId: "italian", sideId: "garlic-bread", diet: "vegan" });
    assert.match(bread.ingredients.find((item) => item.id === "garlic-bread")!.name, /vegan/i);
    const oats = generateMeal({ ...base, sideId: "oat-risotto-greens", diet: "gluten-free" });
    assert.ok(!oats.allergens.includes("oats"));
    assert.match(text(oats), /gluten-free rice flakes/);
  });

  it("excludes oyster sauce for a recorded mollusc avoidance", () => {
    const spec = { seed: 42, regionId: "chinese", diet: "balanced" as const, spiceHeat: "medium" as const, glutenFree: false, dairyFree: false, vegan: false, vegetarian: false, eggFree: false, servings: 4, mainId: "chicken", methodId: "grilled" };
    assert.equal(fusionAdmits(spec, ["umami_oyster"]), true);
    assert.equal(fusionAdmits({ ...spec, avoid: ["mollusc"] }, ["umami_oyster"]), false);
    const result = fusionSearch({ ...spec, avoid: ["mollusc"] });
    assert.ok(!result.pickIds.includes("sat-oyster"));
  });

  it("covers every region and main/method with seeded, scaled compatible cuts", () => {
    let checked = 0;
    for (const [mainIndex, main] of MAIN_INGREDIENTS.entries()) for (const [methodIndex, methodId] of main.methodIds.entries()) {
      const region = MEAL_REGIONS[(mainIndex * 13 + methodIndex * 7) % MEAL_REGIONS.length];
      const cut = cutsForMethod(main.id, methodId)[0];
      const input = { ...base, mainId: main.id, methodId, regionId: region.id, ...(cut ? { cutId: cut.id } : {}), seed: checked + 101, servings: checked % 2 ? 1 : 12, spiceHeat: (checked % 2 ? "gentle" : "fiery") as "gentle" | "fiery" };
      const meal = generateMeal(input);
      assert.equal(meal.mainId, main.id);
      assert.equal(meal.methodId, methodId);
      assert.ok(meal.ingredients.every((item) => item.amount > 0 && Number.isFinite(item.amount)));
      assert.doesNotMatch(text(meal), /\$\{|undefined|\bNaN\b/);
      for (const item of meal.ingredients) assert.equal(markerLeak(region.id, item.id, item.name), null, `${meal.id}: ${item.name}`);
      const other = generateMeal({ ...input, servings: input.servings === 1 ? 12 : 1 });
      const ratio = other.servings / meal.servings;
      for (const item of meal.ingredients) {
        const scaled = other.ingredients.find((entry) => entry.id === item.id);
        assert.ok(scaled, `${meal.id}/${item.id}`);
        assert.ok(Math.abs(scaled.amount - item.amount * ratio) <= 0.001, `${meal.id}/${item.id}`);
      }
      checked += 1;
    }
    assert.equal(checked, 266);
    for (const region of MEAL_REGIONS) {
      const meal = generateMeal({ ...base, regionId: region.id, seed: 2026 });
      assert.equal(meal.regionId, region.id);
      for (const item of meal.ingredients) assert.equal(markerLeak(region.id, item.id, item.name), null, `${region.id}: ${item.name}`);
    }
  });
});
