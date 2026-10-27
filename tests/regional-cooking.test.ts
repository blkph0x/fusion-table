import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRegionalCooking, regionalCookingRole, type RegionalCookingInput } from "../lib/regional-cooking.ts";
import { PANTRY_ITEMS, REGION_TASTES, buildRegionProfile } from "../lib/region-pantry.ts";
import { exploreRegionProfile } from "../lib/region-diversity.ts";
import { SPICE_HEATS } from "../lib/recipe-types.ts";
import type { DraftIngredient } from "../lib/template-types.ts";

const ingredient = (id: string, name: string, amount = 1, unit = "tsp", category: DraftIngredient["category"] = "grocery"): DraftIngredient => ({ id, name, amount, unit, category, allergens: [] });
const oil = ingredient("neutral-oil", "Neutral cooking oil", 0.5, "tbsp");
const liquid = ingredient("vegetable-stock", "Vegetable stock", 120, "ml");
const item = (id: string): DraftIngredient => {
  const entry = PANTRY_ITEMS.find((entry) => entry.id === id)!;
  assert.ok(entry, id);
  return { id: entry.id, name: entry.name, amount: entry.amount, unit: entry.unit, category: entry.category, allergens: [...entry.allergens], ...(entry.notes ? { notes: entry.notes } : {}) };
};
const text = (plan: ReturnType<typeof buildRegionalCooking>) => plan.stages.map((stage) => stage.detail).join(" ");

function assertAllocated(input: RegionalCookingInput) {
  const snapshot = JSON.stringify(input), plan = buildRegionalCooking(input);
  const inputs = [
    ...(input.oil ? [{ ...input.oil, key: "oil:0" }] : []),
    ...(input.aromatics ?? []).map((entry, index) => ({ ...entry, key: `aromatics:${index}` })),
    ...(input.seasonings ?? []).map((entry, index) => ({ ...entry, key: `seasonings:${index}` })),
    ...(input.liquid ? [{ ...input.liquid, key: "liquid:0" }] : []),
    ...(input.body ? [{ ...input.body, key: "body:0" }] : []),
    ...(input.finish ?? []).map((entry, index) => ({ ...entry, key: `finish:${index}` })),
  ].filter((entry) => entry.amount > 0);
  const keys = plan.allocations.flatMap((allocation) => allocation.sourceKeys);
  assert.equal(new Set(keys).size, keys.length, "no original ingredient occurrence can be added twice");
  assert.deepEqual(keys.sort(), inputs.map((entry) => entry.key).sort());
  const totals = new Map<string, number>();
  for (const entry of inputs) totals.set(`${entry.id}|${entry.unit}`, (totals.get(`${entry.id}|${entry.unit}`) ?? 0) + entry.amount);
  for (const [key, expected] of totals) {
    const assigned = plan.allocations.filter((allocation) => `${allocation.id}|${allocation.unit}` === key).reduce((sum, allocation) => sum + allocation.amount, 0);
    assert.ok(Math.abs(assigned - expected * (input.quantityBasis === "already-scaled" ? 1 : input.servings / 4)) <= 0.00011, `${key}: ${assigned} vs ${expected}`);
  }
  for (const allocation of plan.allocations) {
    const stage = plan.stages.find((stage) => stage.id === allocation.stageId)!;
    assert.equal(stage.phase, allocation.phase);
    assert.ok(stage.detail.includes(String(allocation.amount)), `${allocation.id}: quantified stage`);
    assert.ok(stage.detail.toLowerCase().includes(allocation.name.toLowerCase()), `${allocation.id}: named stage`);
  }
  const phases = ["prepare", "heat", "temper", "soften", "bloom", "liquid", "simmer", "remove", "finish"];
  assert.ok(plan.stages.every((stage, index) => index === 0 || phases.indexOf(stage.phase) >= phases.indexOf(plan.stages[index - 1].phase)), "stage order cannot heat food before its preparation or cook after a delicate finish");
  for (const stage of plan.stages) for (const reference of [...(stage.removeIngredientIds ?? []), ...(stage.ingredientReferences ?? [])]) {
    assert.ok(plan.stages.slice(0, plan.stages.indexOf(stage) + 1).some((earlier) => earlier.ingredients.some((entry) => entry.id === reference)), `${reference}: references only an already allocated portion`);
  }
  assert.equal(JSON.stringify(input), snapshot, "planning cannot modify ingredient/allergen arrays");
  assert.doesNotMatch(text(plan), /undefined|\bNaN\b|\$\{|Add\s*\./);
  return plan;
}

describe("quantified regional cooking stages", () => {
  it("fries Thai curry paste before stock/coconut and keeps citrus/herbs for off-heat finishing", () => {
    const profile = buildRegionProfile("thai", false, "medium");
    const plan = assertAllocated({ ...profile, oil, liquid, body: ingredient("coconut-milk", "Coconut milk", 150, "ml"), servings: 2 });
    assert.match(plan.bloom, /1 tbsp vegan red curry paste.*Fry gently.*1–2 minutes/);
    assert.doesNotMatch(plan.start, /coconut milk|stock|lime juice|fresh coriander/i);
    assert.match(plan.addLiquid, /60 ml vegetable stock, 75 ml coconut milk/);
    assert.ok(plan.stages.findIndex((stage) => stage.id === "fry-pastes") < plan.stages.findIndex((stage) => stage.id === "add-liquid"));
    assert.match(plan.finish, /Off the heat.*15 ml lime juice/);
    assert.match(plan.finish, /7.5 g fresh coriander/);
    assert.doesNotMatch(plan.finish, /sesame|peanuts|garlic|curry paste/i);
  });

  it("tempers whole seeds before aromatics and blooms ground spices briefly before liquid", () => {
    const plan = assertAllocated({ aromatics: [item("shallot"), item("garlic")], seasonings: [item("mustard-seeds"), item("curry-leaves"), item("turmeric"), item("cumin")], oil, liquid, servings: 4 });
    assert.ok(plan.stages.findIndex((stage) => stage.id === "temper-seeds") < plan.stages.findIndex((stage) => stage.id === "soften-onions"));
    assert.ok(plan.stages.findIndex((stage) => stage.id === "soften-onions") < plan.stages.findIndex((stage) => stage.id === "soften-aromatics"));
    assert.match(plan.temper, /mustard seeds begin to pop/);
    assert.match(plan.temper, /dry.*curry leaves thoroughly/);
    assert.match(plan.bloom, /15–20 seconds.*liquid promptly.*do not scorch/);
    assert.doesNotMatch(plan.bloom, /mustard seeds|fresh curry leaves|shallots/i);
    assert.equal(regionalCookingRole({ ...item("mustard-seeds"), name: "Ground mustard seed" }), "ground-spice");
    assert.equal(regionalCookingRole(ingredient("bbq-garlic", "Garlic", 2, "cloves", "produce")), "aromatic");
    assert.equal(regionalCookingRole(ingredient("bbq-garlic-powder", "Garlic powder")), "ground-spice");
  });

  it("dissolves sugar and fermented condiments in liquid, keeping miso/yuzu kosho after the main endpoint", () => {
    const plan = assertAllocated({ seasonings: [item("miso"), item("yuzu-kosho"), item("gochujang"), item("kecap-manis"), item("palm-sugar")], finish: [item("sesame-oil")], oil, liquid, servings: 3 });
    assert.doesNotMatch(plan.start, /miso|yuzu|gochujang|kecap|sugar|sesame oil/i);
    assert.match(plan.simmer, /gochujang.*kecap manis.*palm sugar.*only after liquid is present/);
    assert.match(plan.finish, /Once the main has reached its cooking endpoint.*off the heat.*white miso.*yuzu kosho/);
    assert.match(plan.finish, /rather than bringing it back to a hard boil/);
    assert.match(plan.finish, /sesame oil only as a finishing seasoning, not as frying oil/);
    assert.ok(plan.stages.findIndex((stage) => stage.id === "add-liquid") < plan.stages.findIndex((stage) => stage.id === "dissolve-condiments"));
  });

  it("retrieves woody infusions, while finely minced tender lemongrass stays edible", () => {
    const woody = [item("bay-leaves"), item("pandan"), item("dried-lime"), item("galangal"), item("kaffir-lime-leaves"), { ...item("star-anise"), name: "Whole star anise", amount: 1, unit: "" }];
    const plan = assertAllocated({ aromatics: [...woody, item("lemongrass")], finish: [item("coriander")], oil, liquid, servings: 4 });
    assert.match(plan.soften, /lemongrass/);
    assert.doesNotMatch(plan.remove, /lemongrass/);
    assert.match(plan.simmer, /Knot the pandan leaf.*Pierce the dried limes/);
    assert.deepEqual(new Set(plan.stages.find((stage) => stage.id === "remove-infusions")!.removeIngredientIds), new Set(woody.map((entry) => entry.id)));
    assert.equal(plan.stages.find((stage) => stage.phase === "remove")!.ingredients.length, 0, "removal references the earlier portion");
    assert.match(plan.remove, /After the main has reached its cooking endpoint/);
    assert.equal(regionalCookingRole({ ...item("lemongrass"), notes: "Whole stalks, bruised." }), "woody-infusion");
  });

  it("infuses/strains annatto seeds and hydrates saffron without leaving ground spices burning while it soaks", () => {
    const plan = assertAllocated({ seasonings: [item("annatto"), item("saffron"), item("turmeric")], oil, liquid, servings: 6 });
    assert.match(plan.temper, /annatto seeds.*Strain out and discard/);
    assert.ok(plan.stages.findIndex((stage) => stage.id === "add-liquid") < plan.stages.findIndex((stage) => stage.id === "soak-saffron"));
    assert.match(plan.addLiquid, /soak 0.15 g saffron threads.*5 minutes/);
    assert.match(plan.addLiquid, /borrowed liquid.*not a second portion/);
    assert.ok(plan.equipment.includes("Fine sieve") && plan.equipment.includes("Small heatproof cup"));
    assert.equal(regionalCookingRole({ ...item("annatto"), name: "Ground annatto" }), "ground-spice");
    const wet = assertAllocated({ seasonings: [item("annatto")], liquid, servings: 4 });
    assert.match(wet.simmer, /strain out and discard the annatto seeds/i);
  });

  it("keeps fresh and delicate finishes explicit without adding imaginary ingredients", () => {
    const plan = assertAllocated({ finish: [item("coriander"), item("garam-masala"), item("shichimi"), ingredient("tahini", "Tahini", 2, "tbsp")], body: ingredient("cream", "Oat cream", 200, "ml"), servings: 2 });
    assert.equal(plan.start, "");
    assert.match(plan.finish, /Warm gently without a hard boil/);
    assert.match(plan.finish, /1 tbsp tahini.*warm water/);
    assert.doesNotMatch(plan.finish, /sesame oil|roasted nuts|peanuts|lemon|lime|coconut|stock/i);
    const herbsOnly = buildRegionalCooking({ finish: [item("basil")], servings: 4 });
    assert.doesNotMatch(text(herbsOnly), /sesame|nuts|citrus|chilli|garlic|stock|oil/i);
  });

  it("uses each duplicate quantity once, preserves distinct oil portions, and supports already-scaled callers", () => {
    const sameOil = ingredient("olive-oil", "Olive oil", 1, "tbsp");
    const input = { aromatics: [item("garlic")], seasonings: [{ ...item("garlic"), amount: 5 }], finish: [sameOil], oil: { ...sameOil, amount: 0.5 }, liquid, servings: 6 };
    const plan = assertAllocated(input);
    assert.equal(plan.allocations.find((entry) => entry.id === "garlic")!.amount, 30);
    assert.equal(plan.allocations.find((entry) => entry.id === "garlic")!.sourceKeys.length, 2);
    assert.match(plan.heatOil, /0.75 tbsp olive oil/);
    assert.match(plan.finish, /1.5 tbsp olive oil/);
    const already = assertAllocated({ ...input, quantityBasis: "already-scaled" });
    assert.equal(already.allocations.find((entry) => entry.id === "garlic")!.amount, 20);
    assert.ok(plan.totalMinutes >= plan.beforeLiquidMinutes + plan.simmerMinutes + plan.finishMinutes);
  });

  it("allocates all pantry IDs and all76 authored/seeded profiles across heat, diet and serving scales", () => {
    for (const entry of PANTRY_ITEMS) {
      const draft = item(entry.id);
      assert.notEqual(regionalCookingRole(draft), "gentle-default", entry.id);
      assertAllocated({ seasonings: [draft], oil, liquid, servings: 4 });
    }
    let checked = 0;
    for (const region of REGION_TASTES) for (const glutenFree of [false, true]) for (const heat of SPICE_HEATS) for (const seed of [undefined, 1, 2026]) for (const servings of [1, 3, 6, 12]) for (const hasOil of [false, true]) {
      const profile = seed === undefined ? buildRegionProfile(region.id, glutenFree, heat) : exploreRegionProfile(region.id, glutenFree, heat, { seed });
      const body = profile.body === "coconut" ? ingredient("coconut-milk", "Coconut milk", 150, "ml") : profile.body === "tomato" ? ingredient("passata", "Tomato passata", 200, "ml") : undefined;
      const plan = assertAllocated({ ...profile, body, oil: hasOil ? oil : undefined, liquid, servings });
      assert.ok(plan.allocations.every((allocation) => allocation.amount > 0));
      assert.ok(plan.stages.every((stage) => !stage.minutes || stage.minutes > 0));
      checked++;
    }
    assert.equal(checked, 18240);
  });

  it("defaults unknown products to gentle wet cooking and handles absent oil/empty profiles without guessing food", () => {
    const plan = assertAllocated({ seasonings: [ingredient("unknown-paste", "Unspecified regional paste")], servings: 2 });
    assert.equal(plan.start, "");
    assert.match(plan.addLiquid, /15 ml water/);
    assert.match(plan.simmer, /only after liquid is present/);
    assert.doesNotMatch(text(plan), /coconut|milk|stock|olive oil|sesame/);
    const empty = buildRegionalCooking({ servings: 2 });
    assert.deepEqual(empty.stages, []);
    assert.equal(empty.totalMinutes, 0);
    assert.throws(() => buildRegionalCooking({ servings: 0 }), /positive serving/);
    assert.throws(() => buildRegionalCooking({ seasonings: [ingredient("bad", "Bad", Number.NaN)], servings: 2 }), /valid quantity/);
  });

  it("lets a separate cooked sauce finish before the main while integrated miso still follows the main endpoint", () => {
    const input = { aromatics: [item("bay-leaves")], seasonings: [item("miso")], oil, liquid, servings: 4 };
    const integrated = assertAllocated(input), separate = assertAllocated({ ...input, separateSauce: true });
    assert.match(integrated.finish, /main has reached its cooking endpoint/);
    assert.match(separate.finish, /Once the sauce base is ready/);
    assert.match(separate.remove, /After the sauce has simmered/);
    assert.doesNotMatch(separate.finish + separate.remove, /main has reached/);
    assert.deepEqual(integrated.allocations, separate.allocations);
  });

  it("rehydrates whole ancho before heating oil and uses the prepared portion rather than charging it twice", () => {
    const plan = assertAllocated({ aromatics: [item("garlic")], seasonings: [item("ancho-chilli")], oil, liquid, servings: 2 });
    assert.match(plan.prepare, /1 dried ancho chillies.*15–30 minutes.*soft and pliable/);
    assert.ok(plan.start.indexOf("soak") < plan.start.indexOf("Heat "));
    assert.ok(plan.stages.findIndex((stage) => stage.id === "prepare-ancho") < plan.stages.findIndex((stage) => stage.id === "heat-oil"));
    assert.ok(plan.stages.findIndex((stage) => stage.id === "soften-aromatics") < plan.stages.findIndex((stage) => stage.id === "fry-prepared-ancho"));
    assert.equal(plan.allocations.filter((entry) => entry.id === "ancho-chilli").length, 1);
    assert.deepEqual(plan.stages.find((stage) => stage.id === "fry-prepared-ancho")!.ingredientReferences, ["ancho-chilli"]);
    assert.ok(plan.beforeLiquidMinutes >= 30);
    assert.ok(plan.equipment.includes("Blender or mini food processor"));
  });

  it("blooms spoon-measured ground star anise but infuses and removes explicitly whole or counted stars", () => {
    const ground = assertAllocated({ seasonings: [item("star-anise")], oil, liquid, servings: 2 });
    assert.equal(ground.allocations.find((allocation) => allocation.id === "star-anise")!.role, "ground-spice");
    assert.match(ground.bloom, /Use the measured star anise in ground form.*0.25 tsp star anise.*15–20 seconds/);
    assert.equal(ground.remove, "");
    assert.doesNotMatch(ground.simmer, /whole aromatic pieces|star anise/);
    for (const whole of [
      { ...item("star-anise"), amount: 2, unit: "" },
      { ...item("star-anise"), amount: 2, unit: "each" },
      { ...item("star-anise"), name: "Whole star anise", amount: 1, unit: "g" },
    ]) {
      const plan = assertAllocated({ seasonings: [whole], oil, liquid, servings: 4 });
      assert.equal(plan.allocations.find((allocation) => allocation.id === "star-anise")!.role, "woody-infusion");
      assert.match(plan.remove, /lift out and discard.*star anise/);
      assert.doesNotMatch(plan.bloom, /star anise/);
    }
    assert.equal(regionalCookingRole({ ...item("star-anise"), name: "Ground star anise", unit: "g" }), "ground-spice");
  });

  it("respects explicit powder and edible fine-cut forms without inventing whole pieces to retrieve", () => {
    const variants: { ingredient: DraftIngredient; role: string; phase: string }[] = [
      { ingredient: { ...item("mustard-seeds"), name: "Mustard powder" }, role: "ground-spice", phase: "bloom" },
      { ingredient: { ...item("fennel-seeds"), name: "Fennel seed powder" }, role: "ground-spice", phase: "bloom" },
      { ingredient: { ...item("galangal"), name: "Ground galangal", category: "grocery" }, role: "ground-spice", phase: "bloom" },
      { ingredient: { ...item("galangal"), name: "Very finely chopped galangal" }, role: "aromatic", phase: "soften" },
      { ingredient: { ...item("lemongrass"), name: "Lemongrass powder", category: "grocery" }, role: "ground-spice", phase: "bloom" },
      { ingredient: { ...item("kaffir-lime-leaves"), name: "Very finely julienned makrut lime leaves" }, role: "fresh-finish", phase: "finish" },
      { ingredient: { ...item("kaffir-lime-leaves"), name: "Makrut lime leaf powder", category: "grocery" }, role: "simmer-herb", phase: "simmer" },
      { ingredient: { ...item("dried-lime"), name: "Dried black lime powder", unit: "tsp" }, role: "wet-condiment", phase: "simmer" },
      { ingredient: { ...item("cumin"), name: "Whole cumin seeds" }, role: "whole-seeds", phase: "temper" },
      { ingredient: { ...item("ground-coriander"), name: "Whole coriander seeds" }, role: "whole-seeds", phase: "temper" },
    ];
    for (const variant of variants) {
      const plan = assertAllocated({ seasonings: [variant.ingredient], oil, liquid, servings: 3 });
      const allocation = plan.allocations.find((entry) => entry.id === variant.ingredient.id)!;
      assert.equal(allocation.role, variant.role, variant.ingredient.name);
      assert.equal(allocation.phase, variant.phase, variant.ingredient.name);
      assert.equal(plan.remove, "", variant.ingredient.name);
      if (/powder/i.test(variant.ingredient.name)) assert.doesNotMatch(text(plan), /begin to pop|pierce|discard the woody|retrieve/i);
      if (variant.ingredient.id === "kaffir-lime-leaves" && variant.role === "fresh-finish") assert.match(plan.finish, /remove the tough centre ribs.*slice the leaves extremely finely/i);
    }
    assert.equal(regionalCookingRole(item("annatto")), "annatto-infusion", "a ground alternative in notes must not change the actual seed form");
    assert.equal(regionalCookingRole({ ...item("star-anise"), name: "Whole star anise", notes: "Ground star anise is an optional alternative." }), "woody-infusion");
  });

  it("hydrates explicitly dried herb forms instead of washing them as fresh garnishes", () => {
    for (const id of ["basil", "coriander", "parsley", "dill", "tarragon", "perilla"]) {
      const dried = { ...item(id), name: `Dried ${item(id).name.replace(/^Fresh /, "")}`, amount: 1, unit: "tsp", category: "grocery" as const };
      const plan = assertAllocated({ finish: [dried], oil, liquid, servings: 4 });
      assert.equal(plan.allocations.find((entry) => entry.id === id)!.phase, "simmer");
      assert.match(plan.simmer, /Simmer gently in the liquid/);
      assert.doesNotMatch(plan.finish, /Wash|finely chop|dried/i);
    }
    const curry = assertAllocated({ seasonings: [{ ...item("curry-leaves"), name: "Dried curry leaves", category: "grocery" }], oil, liquid, servings: 4 });
    assert.match(curry.temper, /Measure .*dried curry leaves/);
    assert.doesNotMatch(curry.temper, /Wash and dry/);
  });

  it("toasts raw sesame before the hot stages and references that same portion at the finish", () => {
    const ready = assertAllocated({ finish: [item("sesame-seeds")], oil, liquid, servings: 4 });
    assert.equal(ready.prepare, "");
    assert.match(ready.finish, /1 tbsp toasted sesame seeds/);
    for (const name of ["Sesame seeds", "Raw sesame seeds", "Untoasted sesame seeds"]) {
      const raw = assertAllocated({ finish: [{ ...item("sesame-seeds"), name }], oil, liquid, servings: 4 });
      assert.match(raw.prepare, /1 tbsp .*sesame seeds.*1–2 minutes.*reserve this same measured portion/);
      assert.ok(raw.start.indexOf("dry pan") < raw.start.indexOf("Heat "));
      assert.equal(raw.allocations.filter((entry) => entry.id === "sesame-seeds").length, 1);
      assert.equal(raw.allocations.find((entry) => entry.id === "sesame-seeds")!.phase, "prepare");
      assert.match(raw.finish, /already toasted, reserved sesame seeds/);
      assert.doesNotMatch(raw.finish, /1 tbsp|dry pan|1–2 minutes/);
      assert.deepEqual(raw.stages.find((stage) => stage.id === "finish-toasted-sesame")!.ingredientReferences, ["sesame-seeds"]);
      assert.equal(raw.totalMinutes - ready.totalMinutes, 2);
      assert.ok(raw.equipment.includes("Dry frying pan"));
    }
  });
});
