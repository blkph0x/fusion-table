import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSidePlan, MEAL_SIDES } from "../lib/side-plans.ts";
import { generateMeal } from "../lib/meals.ts";

const text = (id: string, gf = false, df = false, servings = 4) => buildSidePlan(id, gf, df, servings).steps.map((step) => `${step.title}. ${step.detail}`).join(" ");

test("all ninety sides keep four-serving draft quantities, bounded instructions and usable late-step metadata", () => {
  assert.equal(MEAL_SIDES.length, 90);
  for (const side of MEAL_SIDES) for (const gf of [false, true]) for (const df of [false, true]) {
    const base = buildSidePlan(side.id, gf, df, 4);
    for (const servings of [1, 2, 4, 12]) {
      const plan = buildSidePlan(side.id, gf, df, servings);
      assert.deepEqual(plan.ingredients.map(({ id, amount, unit }) => [id, amount, unit]), base.ingredients.map(({ id, amount, unit }) => [id, amount, unit]), `${side.id}: generator scales draft amounts once`);
      assert.ok(plan.ingredients.every((item) => Number.isFinite(item.amount) && item.amount > 0));
      assert.equal(new Set(plan.ingredients.map((item) => item.id)).size, plan.ingredients.length, side.id);
      assert.ok(plan.steps.every((step) => step.title && step.detail && Number.isFinite(step.minutes) && step.minutes! > 0));
      assert.ok(plan.minutes >= Math.max(...plan.steps.map((step) => step.minutes!)), side.id);
      assert.ok(plan.equipment.length > 0);
      assert.ok(Array.isArray(plan.finishStepIndexes));
      assert.equal(new Set(plan.finishStepIndexes).size, plan.finishStepIndexes!.length);
      for (const index of plan.finishStepIndexes!) {
        assert.ok(Number.isInteger(index) && index >= 0 && index < plan.steps.length, side.id);
        assert.notEqual(plan.steps[index].title, "Prepare the side ingredients", side.id);
      }
      assert.ok(plan.steps.every((step) => !step.finishBoundary), "side scheduling must not create a SAT main boundary");
      if (gf) assert.ok(plan.ingredients.every((item) => item.allergens.every((allergen) => !["wheat", "barley", "rye", "oats", "gluten"].includes(allergen))), side.id);
      if (df) assert.ok(plan.ingredients.every((item) => !item.allergens.includes("milk")), side.id);
    }
  }
});

test("cassava uses a labelled fully cooked product, never a raw-root short-boil safety claim", () => {
  const plan = buildSidePlan("yuca-greens", true, true, 2);
  const yuca = plan.ingredients.find((item) => item.id === "yuca")!;
  assert.match(yuca.name, /Fully cooked peeled/);
  assert.match(yuca.notes!, /commercially processed.*fully cooked.*ready to reheat/i);
  assert.ok(yuca.aliases!.every((alias) => /fully cooked/.test(alias)));
  assert.match(text("yuca-greens"), /discard all the cooking water/);
  assert.match(text("yuca-greens"), /Do not substitute raw or unlabelled roots, raw frozen cassava, bitter cassava or cassava leaves/);
  assert.match(plan.safetySource!, /^https:\/\/www.foodstandards.gov.au\//);
  assert.match(plan.safetyNote!, /ordinary cooking alone is not reliable/);
});

test("tostones soften, flatten and refry with separate measured oil portions", () => {
  for (const servings of [1, 2, 4, 12]) {
    const plan = buildSidePlan("tostones-side", false, false, servings);
    const method = text("tostones-side", false, false, servings);
    assert.match(method, /centres soften enough to flatten/);
    assert.match(method, /press each warm round.*5–8 mm thick/);
    assert.match(method, /Refry the flattened pieces/);
    assert.match(method, /lightly oiled pan-fried adaptation/);
    assert.equal((method.match(new RegExp(`${servings * 0.375} tbsp`, "g")) || []).length, 2);
    assert.equal(plan.ingredients.find((item) => item.id === "olive-oil")!.amount, 3);
    assert.match(method, /lime juice alongside/);
  }
});

test("sticky rice counts advance soaking separately and steams hydrated grains above the water", () => {
  const plan = buildSidePlan("sticky-rice-greens", false, false, 4);
  assert.equal(plan.prepMinutes, 360);
  assert.match(plan.prepNote!, /packet's soaking time/);
  assert.match(text("sticky-rice-greens"), /soak.*Drain the soaked rice well.*cloth-lined steamer above simmering water/);
  assert.match(text("sticky-rice-greens"), /keeping the rice out of the water/);
  assert.ok(plan.minutes >= 30);
});

test("miso aubergine records soy and uses a labelled GF glaze only after the vegetable cooks", () => {
  for (const gf of [false, true]) {
    const plan = buildSidePlan("miso-aubergine-rice", gf, true, 4);
    const miso = plan.ingredients.find((item) => item.id === "white-miso")!;
    assert.ok(miso.allergens.includes("soy"));
    if (gf) { assert.match(miso.name, /Gluten-free/); assert.ok(miso.aliases!.every((alias) => /gluten-free/.test(alias))); }
    assert.match(text("miso-aubergine-rice", gf), /onto the cooked aubergine.*only 3–5 minutes/);
    assert.match(text("miso-aubergine-rice", gf), /Do not roast the miso coating for the full cooking time/);
  }
  assert.throws(() => generateMeal({ mainId: "chicken", methodId: "grilled", regionId: "home-kitchen", sideId: "miso-aubergine-rice", servings: 2, avoidAllergens: ["soy"] }), /soy/);
});

test("named side flavours have real portions, cooking actions and removal of inedible infusions", () => {
  const named: Record<string, string[]> = {
    "pandan-rice-beans": ["side-pandan"], "lemongrass-rice": ["side-lemongrass"], "banana-leaf-rice": ["side-banana-leaf"],
    "biryani-style-rice": ["side-cumin-seeds", "side-cardamom", "side-cinnamon"], "jewelled-rice": ["side-pomegranate"],
    "harissa-carrots-couscous": ["side-harissa"], "patatas-bravas-side": ["side-passata", "side-smoked-paprika"], "elote-style-corn": ["side-yoghurt", "side-sweet-paprika"],
  };
  for (const [id, expected] of Object.entries(named)) {
    const plan = buildSidePlan(id, false, false, 4);
    for (const ingredient of expected) assert.ok(plan.ingredients.some((item) => item.id === ingredient), `${id}: ${ingredient}`);
  }
  assert.match(text("pandan-rice-beans"), /discard the whole pandan leaf/);
  assert.match(text("lemongrass-rice"), /discard all woody lemongrass/);
  assert.match(text("banana-leaf-rice"), /Remove all leaf pieces before eating/);
  assert.match(text("biryani-style-rice"), /discard all cardamom pod shells and the cinnamon stick/);
  assert.match(text("harissa-carrots-couscous"), /for 1–2 minutes.*then add.*water/);
});

test("oil divisions and cooked-rice forms survive servings and regional staple handling", () => {
  for (const servings of [1, 2, 4, 12]) {
    const jeera = text("biryani-style-rice", false, false, servings);
    assert.equal((jeera.match(new RegExp(`${servings * 0.125} tbsp`, "g")) || []).length, 2, "rice and dressing each use half the one-tablespoon draft portion");
    const carrots = text("harissa-carrots-couscous", true, true, servings);
    assert.match(carrots, new RegExp(`${servings * 0.375} tbsp of the olive oil`));
    assert.match(carrots, new RegExp(`remaining ${servings * 0.125} tbsp olive oil`));
    const meal = generateMeal({ mainId: "tofu", methodId: "grilled", regionId: "japanese", sideId: "spring-onion-fried-rice", servings, diet: "vegan" });
    const rice = meal.ingredients.find((item) => item.id === "side-cooked-rice")!;
    assert.equal(rice.amount, servings * 150);
    assert.match(rice.name, /Cooked long-grain rice/);
    assert.match(rice.notes!, /Cooked weight, not dry rice/);
    assert.ok(!meal.ingredients.some((item) => item.id === "short-grain-rice"));
  }
});

test("long secondary cooking is scheduled early, while cold sauces and salad dressings stay late", () => {
  for (const id of ["couscous-veg", "miso-aubergine-rice", "ratatouille-side", "barley-veg"]) assert.deepEqual(buildSidePlan(id, false, false, 4).finishStepIndexes, [], id);
  const carrots = buildSidePlan("harissa-carrots-couscous", true, false, 4);
  assert.ok(!carrots.finishStepIndexes!.includes(carrots.steps.findIndex((step) => /quinoa alongside/.test(step.title))));
  const salad = buildSidePlan("garden-salad", false, false, 4);
  assert.match(salad.steps[salad.finishStepIndexes![0]].title, /Dress/);
  for (const id of ["rice-greens", "pea-mash-beans"]) {
    const plan = buildSidePlan(id, false, false, 4);
    assert.match(plan.steps[plan.finishStepIndexes![0]].title, /Steam/);
  }
  const pickle = buildSidePlan("pickle-cucumber-rice", false, false, 4);
  assert.ok(!pickle.finishStepIndexes!.includes(pickle.steps.findIndex((step) => /Quick-pickle/.test(step.title))), "the marinating window must begin before final dressing");
  for (const id of ["ratatouille-side", "gomen-style-greens", "mushroom-rice-side"]) {
    const plan = buildSidePlan(id, false, false, 4);
    assert.ok(plan.minutes >= plan.steps.reduce((sum, step) => sum + step.minutes!, 0), id);
  }
  assert.match(text("egg-free-spaetzle-greens"), /frying pan.*Cook over medium heat.*until wilted/);
  assert.match(text("risotto-style-side"), /stock is not required or listed/);
});

test("prepared dairy-free foods use explicit suitable labels and side objects do not leak mutations", () => {
  for (const id of ["paratha-salad", "roti-salad", "xinjiang-bread-salad", "damper-salad", "idli-veg", "arepa-salad"]) {
    const plan = buildSidePlan(id, true, true, 4);
    const bread = plan.ingredients[0];
    assert.match(bread.name, /vegan|dairy-free/i, id);
    assert.match(bread.notes!, /explicitly labelled gluten-free/);
    assert.match(bread.notes!, /vegan, dairy-free and egg-free/);
  }
  const first = buildSidePlan("garden-salad", false, false, 4);
  first.ingredients.find((item) => item.id === "lemon-juice")!.amount = 999;
  first.ingredients[0].allergens.push("milk");
  const second = buildSidePlan("garden-salad", false, false, 4);
  assert.equal(second.ingredients.find((item) => item.id === "lemon-juice")!.amount, 30);
  assert.ok(second.ingredients.every((item) => !item.allergens.includes("milk")));
  for (const servings of [0, 13, 1.5, NaN]) assert.throws(() => buildSidePlan("rice-greens", false, false, servings), /servings/);
});
