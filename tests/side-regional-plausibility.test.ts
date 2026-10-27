import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSidePlan, MEAL_SIDES } from "../lib/side-plans.ts";
import { buildRegionalCooking, regionalCookingRole, type RegionalCookingIngredient } from "../lib/regional-cooking.ts";

const method = (id: string, servings = 4, gf = false, df = false) => buildSidePlan(id, gf, df, servings).steps.filter((step) => step.title !== "Prepare the side ingredients").map((step) => step.detail).join(" ");
const item = (id: string, name: string, amount = 1, unit = "tsp"): RegionalCookingIngredient => ({ id, name, amount, unit, category: "grocery", allergens: [] });
const oil = item("oil", "Neutral cooking oil", 1, "tbsp");
const liquid = item("stock", "Vegetable stock", 120, "ml");

test("whole sorghum receives its producer's 50–60 minute tenderising window and enough boiling water", () => {
  for (const servings of [1, 4, 12]) {
    const plan = buildSidePlan("sorghum-salad", false, false, servings);
    const cooking = plan.steps.find((step) => step.title === "Cook the sorghum")!;
    assert.match(cooking.detail, /whole sorghum grain/);
    assert.match(cooking.detail, /50–60 minutes.*chewy-tender with no hard centre/);
    assert.ok(cooking.detail.includes(`${2000 * servings / 4} ml water`));
    assert.ok(cooking.detail.includes("Keep submerged"));
    assert.ok(plan.minutes >= 70, "A 40-minute sorghum budget is not the stated stovetop method.");
  }
});

test("short grain windows identify cracked or pearled forms and preserve slower dietary substitutions", () => {
  const freekeh = buildSidePlan("freekeh-salad", false, false, 4);
  assert.equal(freekeh.ingredients.find((entry) => entry.id === "freekeh")!.name, "Cracked freekeh");
  assert.match(method("freekeh-salad"), /20–25 minutes/);
  assert.match(freekeh.ingredients.find((entry) => entry.id === "freekeh")!.notes!, /whole freekeh.*longer/);
  assert.match(method("freekeh-salad", 4, true), /quinoa.*12–15 minutes/);
  assert.ok(!buildSidePlan("freekeh-salad", true, false, 4).ingredients.some((entry) => entry.allergens.includes("wheat")));

  const farro = buildSidePlan("kale-farro", false, false, 4);
  const brown = buildSidePlan("kale-farro", true, false, 4);
  assert.equal(farro.ingredients.find((entry) => entry.id === "farro")!.name, "Pearled farro");
  assert.match(method("kale-farro"), /pearled farro.*25–30 minutes/);
  assert.match(method("kale-farro", 4, true), /brown rice.*25–40 minutes/);
  assert.ok(brown.minutes >= 50 && brown.minutes > farro.minutes);
  assert.ok(!brown.ingredients.some((entry) => entry.allergens.includes("wheat")));
});

test("soft grain dishes give scaled starting liquid rather than a fixed pan of unspecified water", () => {
  const liquids = [
    { id: "polenta-greens", ml: 1000, df: true },
    { id: "polenta-greens", ml: 1000, df: false },
    { id: "risotto-style-side", ml: 1200, df: true },
    { id: "millet-greens", ml: 750, df: true },
    { id: "oat-risotto-greens", ml: 800, df: true },
  ];
  for (const row of liquids) for (const servings of [1, 4, 12]) {
    assert.ok(method(row.id, servings, false, row.df).includes(`${row.ml * servings / 4} ml`), `${row.id}/${servings}`);
  }
  assert.match(method("risotto-style-side"), /Reserve some of the hot water.*final pea step/);
  assert.match(method("risotto-style-side"), /If the rice has rested, loosen it with the reserved hot water/);
  assert.match(method("polenta-greens", 4, false, true), /packet's quantity for soft polenta.*adding a little boiling water if it becomes too stiff/);
  assert.match(method("oat-risotto-greens", 4, true), /rice flakes.*packet's cooking time/);
});

test("all ninety sides keep plausible four-person starch portions across form and diet variants", () => {
  const dryStarches = new Set(["rice", "jasmine-rice", "basmati-rice", "sticky-rice", "quinoa", "bulgur", "couscous", "orzo", "gf-pasta", "soba", "rice-noodles", "noodles", "soft-noodles", "freekeh", "barley", "farro", "brown-rice", "millet", "sorghum", "maize-meal", "polenta", "rolled-oats", "rice-flakes"]);
  assert.equal(MEAL_SIDES.length, 90);
  for (const side of MEAL_SIDES) for (const gf of [false, true]) for (const df of [false, true]) {
    const plan = buildSidePlan(side.id, gf, df, 4);
    for (const ingredient of plan.ingredients.filter((entry) => entry.unit === "g" && dryStarches.has(entry.id) && !/\bcooked\b/i.test(entry.name))) {
      assert.ok(ingredient.amount / 4 >= 40 && ingredient.amount / 4 <= 100, `${side.id}: accidental starch main rather than a four-person side`);
    }
    if (gf) assert.ok(plan.ingredients.every((entry) => !entry.allergens.some((tag) => ["wheat", "barley", "rye", "oats", "gluten"].includes(tag))), side.id);
    if (df) assert.ok(plan.ingredients.every((entry) => !entry.allergens.includes("milk")), side.id);
    if (plan.ingredients.some((entry) => dryStarches.has(entry.id))) {
      assert.match(plan.safetyNote!, /60°C or hotter.*shallow containers.*5°C or colder/);
      assert.match(plan.safetySource!, /^https:\/\/www\.foodstandards\.gov\.au\//);
      assert.match(plan.steps.at(-1)!.detail, /Do not leave a pot of rice cooling on the bench/);
    }
  }
});

test("powdered fresh-aromatic IDs receive brief spice blooming rather than fresh mincing and long frying", () => {
  for (const [id, name] of [["garlic", "Garlic powder"], ["ginger", "Ground ginger"], ["onion", "Onion powder"], ["shallot", "Powdered shallot"]]) {
    const powder = item(id, name);
    assert.equal(regionalCookingRole(powder, "aromatics"), "ground-spice");
    const plan = buildRegionalCooking({ aromatics: [powder], oil, liquid, servings: 4 });
    assert.match(plan.bloom, /15–20 seconds/);
    assert.equal(plan.soften, "");
    assert.doesNotMatch(plan.bloom, /finely minced|grated or sliced/);
  }
});

test("powder and flakes do not acquire imaginary chilli stems, while whole dried chillies retain preparation", () => {
  for (const id of ["dried-red-chilli", "facing-heaven-chilli"]) for (const name of ["Ground dried red chilli", "Dried red chilli flakes"]) {
    const plan = buildRegionalCooking({ seasonings: [item(id, name)], oil, liquid, servings: 4 });
    assert.doesNotMatch(plan.bloom, /Stem and break/);
  }
  const whole = item("dried-red-chilli", "Dried red chillies", 3, "");
  assert.match(buildRegionalCooking({ seasonings: [whole], oil, liquid, servings: 4 }).bloom, /Stem and break the whole dried chillies/);
  assert.match(buildRegionalCooking({ seasonings: [whole], liquid, servings: 4 }).simmer, /Stem and break the whole dried chillies/);
});

test("counted cloves and cinnamon quills are retrieved while cardamom seeds are ground and eaten", () => {
  const cloves = item("cloves", "Cloves", 3, "");
  const cinnamon = item("ceylon-cinnamon", "Ceylon cinnamon quill", 1, "each");
  const seeds = item("cardamom", "Cardamom seeds", 0.5, "tsp");
  assert.equal(regionalCookingRole(cloves), "woody-infusion");
  assert.equal(regionalCookingRole(cinnamon), "woody-infusion");
  assert.equal(regionalCookingRole(seeds), "crush-spice");
  const plan = buildRegionalCooking({ seasonings: [cloves, cinnamon, seeds], oil, liquid, servings: 4 });
  assert.match(plan.bloom, /Crush or grind 0.5 tsp cardamom seeds finely/);
  assert.deepEqual(new Set(plan.stages.find((stage) => stage.id === "remove-infusions")!.removeIngredientIds), new Set(["cloves", "ceylon-cinnamon"]));
});

test("implicit sauce water scales independently of whether supplied quantities were already scaled", () => {
  const spice = item("cumin", "Ground cumin", 3, "tsp");
  const plan = buildRegionalCooking({ seasonings: [spice], servings: 12, quantityBasis: "already-scaled" });
  assert.match(plan.addLiquid, /Add 90 ml water/);
  assert.equal(plan.allocations.find((entry) => entry.id === "cumin")!.amount, 3, "Already-scaled spice must not scale a second time.");
  const small = buildRegionalCooking({ seasonings: [item("cumin", "Ground cumin")], servings: 1 });
  assert.match(small.addLiquid, /Add 7.5 ml water/);
});

test("a delicate-only warm miso sauce establishes real liquid before borrowing a spoonful", () => {
  const plan = buildRegionalCooking({ finish: [item("miso", "White miso", 1.5, "tbsp")], servings: 4, separateSauce: true });
  const waterIndex = plan.stages.findIndex((stage) => stage.id === "add-water");
  const finishIndex = plan.stages.findIndex((stage) => stage.id === "delicate-pastes");
  assert.ok(waterIndex >= 0 && waterIndex < finishIndex);
  assert.match(plan.addLiquid, /30 ml water/);
  assert.match(plan.finish, /take the pan off the heat.*warm cooked sauce/);
});
