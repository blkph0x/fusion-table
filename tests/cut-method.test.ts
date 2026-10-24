import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MEAT_CUTS, getCut } from "../lib/cuts.ts";
import {
  cutAllowedForMethod,
  cutsForMethod,
  prepareCut,
} from "../lib/cut-method.ts";
import { generateMeal, validateMealInput } from "../lib/meals.ts";

const base = {
  mainId: "beef" as const,
  regionId: "japanese",
  sideId: "rice-greens",
  servings: 4,
};

/** Positive steak-cutting instructions — not “do not … steaks” refusals. */
const FORBIDDEN_STEAK_PHRASE = /(?:trim and portion the|portion the steaks? to|flatten the steaks?|cut (?:large )?pieces into individual portions|to an even 2 cm thickness)/i;
const GRIND_PHRASE = /grind|mince/i;
const PULL_PHRASE = /shred|pull/i;
const CUBE_PHRASE = /cubes?|3\s*cm/i;

function prepText(mainId: string, methodId: string, cutId: string): string {
  const meal = generateMeal({ ...base, mainId, methodId, cutId });
  return meal.steps.map((step) => step.detail).join(" ");
}

describe("cut × method allowlists", () => {
  it("forbids stew cuts with steak-style quick methods", () => {
    for (const cutId of ["beef-brisket", "angus-brisket", "wagyu-brisket", "beef-chuck", "beef-cheek", "beef-oxtail"]) {
      for (const methodId of ["grilled", "pan-fried", "schnitzel", "air-fried"]) {
        const cut = getCut(cutId)!;
        assert.equal(cutAllowedForMethod(cut, methodId), false, `${cutId}+${methodId}`);
        assert.throws(
          () => validateMealInput({ ...base, mainId: cut.mainId, methodId, cutId }),
          /slow-cooking cut|not a sensible cut|does not suit/i,
        );
      }
    }
  });

  it("forbids whole birds with schnitzel, patties and stir-fry", () => {
    const cut = getCut("chicken-whole")!;
    for (const methodId of ["schnitzel", "patties", "stir-fried", "grilled"]) {
      assert.equal(cutAllowedForMethod(cut, methodId), false, methodId);
      assert.throws(() => generateMeal({ ...base, mainId: "chicken", methodId, cutId: "chicken-whole" }), /whole bird|sensible cut/i);
    }
  });

  it("forbids mince as schnitzel steaks", () => {
    assert.equal(cutAllowedForMethod(getCut("beef-mince")!, "schnitzel"), false);
    assert.throws(() => generateMeal({ ...base, methodId: "schnitzel", cutId: "beef-mince" }), /mince|schnitzel/i);
  });

  it("lists only affinity cuts in the builder helper", () => {
    const grilled = cutsForMethod("beef", "grilled").map((cut) => cut.id);
    assert.ok(grilled.includes("beef-rump"));
    assert.ok(grilled.includes("wagyu-scotch"));
    assert.equal(grilled.includes("beef-brisket"), false);
    assert.equal(grilled.includes("beef-chuck"), false);
    const patties = cutsForMethod("beef", "patties").map((cut) => cut.id);
    assert.ok(patties.includes("beef-mince"));
    assert.ok(patties.includes("beef-brisket"));
    assert.equal(patties.includes("beef-rump"), false);
    const braised = cutsForMethod("beef", "braised").map((cut) => cut.id);
    assert.ok(braised.includes("beef-brisket"));
    assert.ok(braised.includes("beef-chuck"));
  });
});

describe("cut-aware prep wording", () => {
  it("grinds brisket for patties and never says cut steaks 2 cm thick", () => {
    const text = prepText("beef", "patties", "beef-brisket");
    assert.match(text, GRIND_PHRASE);
    assert.equal(FORBIDDEN_STEAK_PHRASE.test(text), false, text.slice(0, 400));
    const prep = prepareCut(getCut("beef-brisket")!, "patties")!;
    assert.match(prep.preparation, /grind/i);
    assert.equal(/2 cm thickness/i.test(prep.preparation), false);
  });

  it("pulls or shreds brisket when braised", () => {
    const text = prepText("beef", "braised", "beef-brisket");
    assert.match(text, PULL_PHRASE);
    assert.equal(/cut into even 3 cm cubes from the chuck/i.test(text), false);
    assert.equal(FORBIDDEN_STEAK_PHRASE.test(text), false);
    assert.match(text, /brisket/i);
  });

  it("cubes chuck for braise without steak language", () => {
    const text = prepText("beef", "braised", "beef-chuck");
    assert.match(text, CUBE_PHRASE);
    assert.equal(FORBIDDEN_STEAK_PHRASE.test(text), false);
  });

  it("keeps steak cuts on the grill at measured thickness", () => {
    const text = prepText("beef", "grilled", "beef-rump");
    assert.match(text, /2 cm thickness/i);
    assert.equal(/grind/i.test(text), false);
  });

  it("shapes mince for grill as patties or crumble, not steaks", () => {
    const prep = prepareCut(getCut("beef-mince")!, "grilled")!;
    assert.match(prep.preparation, /patties|crumbled/i);
    assert.equal(/2 cm thickness/i.test(prep.preparation), false);
    const text = prepText("beef", "grilled", "beef-mince");
    assert.equal(FORBIDDEN_STEAK_PHRASE.test(text), false);
  });

  it("cooks sausages as links", () => {
    const prep = prepareCut(getCut("beef-sausage")!, "grilled")!;
    assert.match(prep.preparation, /links/i);
    assert.equal(/2 cm thickness/i.test(prep.preparation), false);
  });

  it("leaves short ribs whole on the bone for braise", () => {
    const prep = prepareCut(getCut("beef-short-rib")!, "braised")!;
    assert.match(prep.preparation, /whole|on the bone/i);
    assert.equal(/3 cm cubes/i.test(prep.preparation), false);
  });

  it("flattens only true steak/fillet forms for schnitzel", () => {
    const steak = prepareCut(getCut("pork-loin")!, "schnitzel")!;
    assert.match(steak.preparation, /flatten/i);
    assert.equal(cutAllowedForMethod(getCut("pork-shoulder")!, "schnitzel"), false);
  });
});

describe("matrix coverage of every cut form", () => {
  it("every catalogue cut has at least one allowed method, and prepareCut returns for allowed pairs", () => {
    const methods = [
      "schnitzel", "baked", "pan-fried", "air-fried", "poached", "grilled",
      "stir-fried", "braised", "curry", "patties", "roasted", "steamed",
    ];
    for (const cut of MEAT_CUTS) {
      const allowed = methods.filter((method) => cutAllowedForMethod(cut, method));
      assert.ok(allowed.length > 0, `${cut.id} has no methods`);
      for (const method of allowed) {
        const prep = prepareCut(cut, method);
        assert.ok(prep, `${cut.id}+${method}`);
        if (cut.form === "slow" && method === "patties") {
          assert.match(prep!.preparation, GRIND_PHRASE);
          assert.equal(/2 cm thickness/i.test(prep!.preparation), false);
        }
        if (cut.form === "mince") {
          assert.equal(/2 cm thickness/i.test(prep!.preparation), false);
        }
      }
      for (const method of methods.filter((item) => !allowed.includes(item))) {
        assert.equal(prepareCut(cut, method), null, `${cut.id}+${method} should be null`);
      }
    }
  });
});
