import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAIN_INGREDIENTS, getMethodsForMain } from "../lib/meal-catalog.ts";
import { getCut } from "../lib/cuts.ts";
import { cutAllowedForMethod, cutsForMethod } from "../lib/cut-method.ts";
import {
  NEVER_SMOKE_MAINS,
  SMOKE_MAINS,
  SMOKE_STAPLE_CUTS,
  cutAllowedForSmoke,
  defaultSmokePlan,
  mainAllowsSmoke,
} from "../lib/smoke-method.ts";
import { generateMeal, validateMealInput } from "../lib/meals.ts";

const base = { regionId: "japanese", sideId: "rice-greens", servings: 4 };

describe("smoke method allow / deny", () => {
  it("offers smoked only on realistic mains", () => {
    for (const main of MAIN_INGREDIENTS) {
      const has = getMethodsForMain(main.id).some((method) => method.id === "smoked");
      assert.equal(has, mainAllowsSmoke(main.id), main.id);
    }
    for (const id of ["eggs", "prawns", "halloumi", "paneer", "lentils", "kangaroo", "white-fish", "tuna", "sardines"]) {
      assert.equal(mainAllowsSmoke(id), false, id);
      assert.ok(NEVER_SMOKE_MAINS.has(id) || !SMOKE_MAINS.has(id), id);
      assert.throws(() => validateMealInput({ ...base, mainId: id, methodId: "smoked" }), /not a realistic method|not available/i);
    }
    for (const id of ["beef", "pork", "duck", "salmon", "chicken"]) {
      assert.ok(mainAllowsSmoke(id), id);
      assert.ok(getMethodsForMain(id).some((method) => method.id === "smoked"), id);
    }
  });

  it("forbids mince and steak cuts on smoked; allows brisket, ribs, belly", () => {
    assert.equal(cutAllowedForSmoke(getCut("beef-mince")!), false);
    assert.equal(cutAllowedForMethod(getCut("beef-mince")!, "smoked"), false);
    assert.equal(cutAllowedForSmoke(getCut("beef-rump")!), false);
    assert.ok(cutAllowedForSmoke(getCut("beef-brisket")!));
    assert.ok(cutAllowedForSmoke(getCut("pork-ribs")!));
    assert.ok(cutAllowedForSmoke(getCut("pork-belly")!));
    assert.ok(cutAllowedForSmoke(getCut("angus-brisket")!));
    assert.throws(() => generateMeal({ ...base, mainId: "beef", methodId: "smoked", cutId: "beef-mince" }), /mince|smoke/i);
    assert.throws(() => generateMeal({ ...base, mainId: "beef", methodId: "smoked", cutId: "beef-rump" }), /smoke|sensible cut|usual hot-smoke/i);
    const smokedCuts = cutsForMethod("beef", "smoked").map((cut) => cut.id);
    assert.ok(smokedCuts.includes("beef-brisket"));
    assert.equal(smokedCuts.includes("beef-mince"), false);
    assert.equal(smokedCuts.includes("beef-rump"), false);
  });

  it("lists smoke staple cuts without inventing mince smoking", () => {
    assert.ok(SMOKE_STAPLE_CUTS.has("beef-brisket"));
    assert.ok(SMOKE_STAPLE_CUTS.has("pork-ribs"));
    assert.ok(SMOKE_STAPLE_CUTS.has("pork-belly"));
    assert.equal(SMOKE_STAPLE_CUTS.has("beef-mince"), false);
    assert.equal(SMOKE_STAPLE_CUTS.has("wagyu-mince"), false);
  });
});

describe("smoked prep wording", () => {
  it("defaults brisket for beef smoked and talks bark, rest, slice — not patties", () => {
    const meal = generateMeal({ ...base, mainId: "beef", methodId: "smoked" });
    const text = meal.steps.map((step) => step.detail).join(" ");
    assert.match(meal.ingredients[0].name, /brisket/i);
    assert.match(text, /120–140|bark|rest|slice/i);
    assert.equal(/patty|patties|grind for burgers/i.test(text), false);
    assert.equal(/2 cm thickness/i.test(text), false);
    assert.ok(meal.cookMinutes >= 300);
  });

  it("smokes pork ribs and duck with realistic endpoints", () => {
    const ribs = generateMeal({ ...base, mainId: "pork", methodId: "smoked", cutId: "pork-ribs" });
    const ribText = ribs.steps.map((step) => step.detail).join(" ");
    assert.match(ribs.ingredients[0].name, /rib/i);
    assert.match(ribText, /smoke|probe|rest/i);
    assert.equal(/2 cm thickness|grind for|shape the patties/i.test(ribText), false);

    const belly = generateMeal({ ...base, mainId: "pork", methodId: "smoked", cutId: "pork-belly" });
    assert.match(belly.ingredients[0].name, /belly/i);
    assert.match(belly.steps[0].detail, /slab|slice|season/i);

    const duck = generateMeal({ ...base, mainId: "duck", methodId: "smoked" });
    assert.match(duck.ingredients[0].name, /duck/i);
    assert.match(duck.steps.map((step) => step.detail).join(" "), /75°C|poultry|smoke/i);
  });

  it("keeps sauce separate and never asks to smoke shaped patties", () => {
    const meal = generateMeal({ ...base, mainId: "beef", methodId: "smoked", cutId: "beef-brisket" });
    const titles = meal.steps.map((step) => step.title).join(" ");
    assert.match(titles, /hot smoke|stall|rest/i);
    assert.equal(/Shape the patties/i.test(titles), false);
    const plan = defaultSmokePlan("beef")!;
    assert.match(plan.preparation, /brisket|one piece/i);
    assert.match(plan.endpoint, /90–96|slice/i);
  });
});
