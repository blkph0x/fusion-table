import assert from "node:assert/strict";
import { test } from "node:test";
import { getCut, type MeatCut } from "../lib/cuts.ts";
import { buildStirFryCoating, type StirFryCoatingInput } from "../lib/main-techniques.ts";

const base: StirFryCoatingInput = { mainId: "beef", methodId: "stir-fried", regionId: "cantonese", main: { id: "beef", name: "Lean beef strips", amount: 600, unit: "g" }, servings: 4, mainOil: 2 };

test("a light coating uses 1.5% starch and 60 ml water per kg without adding oil", () => {
  const result = buildStirFryCoating(base)!;
  assert.equal(result.ingredient.amount, 9);
  assert.equal(result.ingredient.unit, "g");
  assert.deepEqual(result.ingredient.allergens, []);
  assert.equal(result.coatingOil, 0.5);
  assert.equal(result.panOil, 1.5);
  assert.equal(result.coatingOil + result.panOil, base.mainOil);
  assert.match(result.detail, /600 g.*9 g cornflour.*36 ml cold water.*10 ml neutral cooking oil.*remaining 30 ml/);
  assert.equal(result.restMinutes, 15);
});

test("ingredient quantities remain four-serving drafts while preparation scales exactly once", () => {
  for (const [servings, meat, starch, water, oil, pan] of [[1, 150, 2.25, 9, 2.5, 7.5], [2, 300, 4.5, 18, 5, 15], [8, 1200, 18, 72, 20, 60]] as const) {
    const result = buildStirFryCoating({ ...base, servings })!;
    assert.equal(result.ingredient.amount, 9);
    assert.equal(result.coatingOil, 0.5);
    assert.equal(result.panOil, 1.5);
    assert.ok(result.detail.includes(`${meat} g prepared`));
    assert.ok(result.detail.includes(`${starch} g cornflour`));
    assert.ok(result.detail.includes(`${water} ml cold water`));
    assert.ok(result.detail.includes(`${oil} ml neutral cooking oil`));
    assert.ok(result.detail.includes(`remaining ${pan} ml`));
    assert.equal(Number((result.ingredient.amount * servings / 4).toFixed(4)), starch);
  }
});

test("kilogram inputs and reduced main oil retain measured metric water and exact allocations", () => {
  const equivalent = buildStirFryCoating({ ...base, main: { ...base.main, amount: 0.6, unit: "kg" }, mainOil: 1 })!;
  assert.equal(equivalent.ingredient.amount, 9);
  assert.match(equivalent.detail, /36 ml cold water/);
  assert.match(equivalent.detail, /5 ml neutral cooking oil.*remaining 15 ml/);
  for (const mainOil of [0.1, 0.3, 0.5, 1, 1.5, 2, 3]) {
    const result = buildStirFryCoating({ ...base, mainOil })!;
    assert.equal(result.coatingOil + result.panOil, mainOil);
  }
});

test("only the explicitly scoped regional thin-meat stir-fries receive the coating", () => {
  for (const regionId of ["chinese", "cantonese", "sichuan", "hunan", "taiwanese", "shanghainese", "yunnan"]) for (const mainId of ["beef", "chicken", "pork", "turkey"]) {
    assert.ok(buildStirFryCoating({ ...base, regionId, mainId, main: { ...base.main, id: mainId, name: `Boneless ${mainId} strips` } }), `${regionId}:${mainId}`);
  }
  for (const regionId of ["japanese", "korean", "thai", "italian", "mexican", "home-kitchen", "xinjiang"]) assert.equal(buildStirFryCoating({ ...base, regionId }), null, regionId);
  for (const mainId of ["duck", "salmon", "white-fish", "prawns", "tofu", "halloumi", "lamb"]) assert.equal(buildStirFryCoating({ ...base, mainId }), null, mainId);
  for (const methodId of ["pan-fried", "grilled", "braised", "curry", "patties", "schnitzel"]) assert.equal(buildStirFryCoating({ ...base, methodId }), null, methodId);
});

test("whole birds, bone-in cuts, mince, offal and sausage forms are excluded", () => {
  for (const id of ["chicken-whole", "chicken-thigh-bone", "beef-mince", "chicken-liver", "beef-oxtail", "beef-short-rib", "beef-sausage", "chicken-frame"]) {
    const cut = getCut(id)!;
    assert.ok(cut, id);
    assert.equal(buildStirFryCoating({ ...base, mainId: cut.mainId, main: { ...base.main, name: cut.shoppingName }, cut }), null, id);
  }
  for (const name of ["Whole chicken", "Bone-in chicken pieces", "Chicken on the bone", "Ground beef", "Raw beef sausages"]) assert.equal(buildStirFryCoating({ ...base, main: { ...base.main, name } }), null, name);
  assert.ok(buildStirFryCoating({ ...base, cut: getCut("beef-chuck"), main: { ...base.main, name: "Boneless beef chuck" } }));
  assert.ok(buildStirFryCoating({ ...base, cut: getCut("beef-rump") }));
  assert.equal(buildStirFryCoating({ ...base, cut: getCut("chicken-breast") }), null);
  const unknownSlow: MeatCut = { ...getCut("beef-chuck")!, shoppingName: "Unspecified beef joint" };
  assert.equal(buildStirFryCoating({ ...base, cut: unknownSlow }), null);
});

test("corn and maize exclusions skip the coating without confusing peppercorn", () => {
  for (const restriction of ["corn", "maize", "cornflour", "corn flour", "cornstarch", "corn starch", "maize starch", "starch", "corn (maize)", "Corn/maize allergy"]) {
    assert.equal(buildStirFryCoating({ ...base, avoid: [restriction] }), null, restriction);
    assert.equal(buildStirFryCoating({ ...base, dislikes: [restriction] }), null, restriction);
  }
  assert.ok(buildStirFryCoating({ ...base, dislikes: ["peppercorn"], avoid: ["egg", "soy", "wheat"] }));
});

test("raw coating instructions mandate fridge handling and disposal without introducing bicarbonate, egg or rinsing", () => {
  const result = buildStirFryCoating(base)!;
  assert.match(result.detail, /refrigerate at 5°C or colder for 15 minutes/);
  assert.match(result.detail, /Keep chilled until cooking/);
  assert.match(result.detail, /stated thermometer endpoint/);
  assert.match(result.detail, /Discard any coating mixture left in the raw-meat bowl/);
  assert.match(result.detail, /Wash hands, the bowl and utensils/);
  assert.doesNotMatch(result.detail, /room temperature|room-temp|bicarb|baking soda|egg|rins|soy sauce|oyster sauce/i);
  assert.match(result.ingredient.notes!, /pure maize starch, not wheat flour/i);
});

test("invalid amounts, unknown mass units and absent usable oil do not invent a coating", () => {
  for (const amount of [0, -1, NaN, Infinity]) assert.equal(buildStirFryCoating({ ...base, main: { ...base.main, amount } }), null);
  for (const unit of ["each", "", "ml", "cup"]) assert.equal(buildStirFryCoating({ ...base, main: { ...base.main, unit } }), null);
  for (const mainOil of [0, -1, NaN, Infinity]) assert.equal(buildStirFryCoating({ ...base, mainOil }), null);
  for (const servings of [0, -1, 1.5, NaN, Infinity]) assert.equal(buildStirFryCoating({ ...base, servings }), null);
});
