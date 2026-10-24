import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SpiceHeat } from "../lib/recipe-types.ts";
import { generateMeal } from "../lib/meals.ts";
import { PLATES } from "../lib/plates.ts";
import {
  PANTRY_ITEMS,
  PANTRY_SOURCES,
  REGION_TASTES,
  buildRegionProfile,
  regionsUsing,
  signatureHeatId,
} from "../lib/region-pantry.ts";

const BIRDS_EYE = [
  "balinese", "cambodian", "filipino", "indonesian", "isaan", "lao", "malaysian", "maluku",
  "peranakan", "thai", "thai-green", "thai-panang", "thai-yellow", "vietnamese",
];

const NOT_BIRDS_EYE = [
  "australian", "cantonese", "french", "greek", "hungarian", "italian", "japanese",
  "korean", "mexican", "persian", "spanish",
];

const BANNED_NAME = /fish sauce|oyster|belacan|shrimp paste|dried shrimp|prahok|ngapi/i;

function plateItems(regionId: string, glutenFree = false, heat: SpiceHeat = "medium") {
  const profile = buildRegionProfile(regionId, glutenFree, heat);
  return [...profile.aromatics, ...profile.seasonings, ...profile.finish];
}

describe("region pantry", () => {
  it("links every catalogue item to a region, and puts bird's eye only on cuisines that use it", () => {
    assert.equal(REGION_TASTES.length, 76);
    assert.equal(PANTRY_SOURCES.herbsAndSpices, "https://en.wikipedia.org/wiki/List_of_culinary_herbs_and_spices");
    assert.equal(PANTRY_SOURCES.chilliPastes, "https://en.wikipedia.org/wiki/Chili_sauce");
    assert.ok(PANTRY_ITEMS.length >= 120);
    for (const item of PANTRY_ITEMS) assert.ok(regionsUsing(item.id).length > 0, item.id);
    assert.deepEqual([...regionsUsing("birds-eye-chilli")].sort(), BIRDS_EYE);
    for (const id of NOT_BIRDS_EYE) assert.equal(regionsUsing("birds-eye-chilli").includes(id), false, id);
    for (const region of REGION_TASTES) {
      assert.match(region.description, /\.$/, region.id);
      assert.equal(signatureHeatId(region.id), region.heat, region.id);
    }
    const thai = REGION_TASTES.find((region) => region.id === "thai");
    assert.equal(thai?.heat, "red-curry-paste");
    assert.equal(thai?.sideHeat, "birds-eye-chilli");
  });

  it("keeps the locked condiment names and scales each signature heat from mild to hot", () => {
    const byId = new Map(PANTRY_ITEMS.map((item) => [item.id, item]));
    const red = byId.get("red-curry-paste")!;
    assert.equal(red.name, "Vegan red curry paste");
    assert.deepEqual(red.aliases, ["vegan red curry paste"]);
    assert.equal(red.notes, "Choose a paste without fish sauce or shrimp; check allergens and heat.");
    assert.equal(red.glutenFree?.name, "Gluten-free vegan red curry paste");
    assert.deepEqual(red.glutenFree?.aliases, ["gluten free vegan red curry paste"]);

    const gochujang = byId.get("gochujang")!;
    assert.equal(gochujang.name, "Vegan gochujang");
    assert.deepEqual(gochujang.allergens, ["soy", "wheat"]);
    assert.deepEqual(gochujang.aliases, ["vegan gochujang"]);
    assert.equal(gochujang.notes, "Choose a vegan product; heat varies by brand.");
    assert.equal(gochujang.glutenFree?.name, "Gluten-free vegan gochujang");
    assert.deepEqual(gochujang.glutenFree?.allergens, ["soy"]);
    assert.deepEqual(gochujang.glutenFree?.aliases, ["gluten free vegan gochujang", "gluten-free gochujang"]);
    assert.equal(gochujang.glutenFree?.notes, "Choose a vegan product; heat varies by brand.");

    const miso = byId.get("miso")!;
    assert.equal(miso.name, "White miso");
    assert.deepEqual(miso.allergens, ["soy"]);
    assert.deepEqual(miso.aliases, ["white miso", "rice miso"]);
    assert.equal(miso.notes, "Use a rice-based miso; check the label for other allergens.");
    assert.equal(miso.glutenFree?.name, "Gluten-free white miso");
    assert.deepEqual(miso.glutenFree?.allergens, ["soy"]);
    assert.deepEqual(miso.glutenFree?.aliases, ["gluten free white miso", "gluten-free miso"]);
    assert.equal(miso.glutenFree?.notes, "Use a rice-based miso; check the label for other allergens.");

    const soy = byId.get("soy-sauce")!;
    assert.equal(soy.name, "Soy sauce");
    assert.deepEqual(soy.allergens, ["soy", "wheat"]);
    assert.deepEqual(soy.aliases, ["soy sauce"]);
    assert.equal("notes" in soy, false);
    assert.equal(soy.glutenFree?.name, "Gluten-free tamari");
    assert.deepEqual(soy.glutenFree?.allergens, ["soy"]);
    assert.deepEqual(soy.glutenFree?.aliases, ["gluten free tamari", "gluten-free soy sauce"]);
    assert.equal(soy.glutenFree?.notes, "Choose a product explicitly labelled gluten-free.");

    assert.equal(byId.get("harissa")!.name, "Harissa paste");
    assert.deepEqual(byId.get("harissa")!.aliases, ["harissa"]);
    assert.equal(byId.get("aji-amarillo")!.name, "Ají amarillo paste");

    const kecap = byId.get("kecap-manis")!;
    assert.equal(kecap.glutenFree?.name, "Gluten-free kecap manis");
    assert.deepEqual(kecap.glutenFree?.allergens, ["soy"]);
    assert.equal(kecap.glutenFree?.allergens.includes("wheat"), false);

    const gfGochujang = plateItems("korean", true).find((item) => item.id === "gochujang")!;
    assert.equal(gfGochujang.name, "Gluten-free vegan gochujang");
    assert.deepEqual(gfGochujang.allergens, ["soy"]);
    const plainSoy = plateItems("japanese").find((item) => item.id === "soy-sauce")!;
    assert.equal(plainSoy.name, "Soy sauce");
    assert.equal(plainSoy.notes, undefined);

    for (const item of PANTRY_ITEMS) assert.doesNotMatch(item.name, BANNED_NAME, item.id);
    for (const id of ["sichuan-pepper", "sansho", "timur", "grains-of-paradise", "black-pepper", "white-pepper", "pepperberry"]) {
      const item = byId.get(id)!;
      assert.equal(item.aliases.some((alias) => alias === "chilli" || alias === "chili"), false, id);
    }

    for (const region of REGION_TASTES) {
      const id = signatureHeatId(region.id);
      assert.notEqual(id, "chilli-flakes", region.id);
      const mild = plateItems(region.id, false, "mild").find((item) => item.id === id)!;
      const hot = plateItems(region.id, false, "hot").find((item) => item.id === id)!;
      assert.ok(mild.amount > 0 && mild.amount < hot.amount, region.id);
    }
    assert.equal(plateItems("ethiopian", false, "gentle").some((item) => item.id === "mitmita"), false);
    assert.equal(plateItems("ethiopian", false, "medium").some((item) => item.id === "mitmita"), false);
    assert.equal(plateItems("ethiopian", false, "hot").some((item) => item.id === "mitmita"), true);
    assert.equal(plateItems("ethiopian", false, "fiery").some((item) => item.id === "mitmita"), true);
    for (const region of REGION_TASTES) {
      const id = signatureHeatId(region.id);
      const gentle = plateItems(region.id, false, "gentle").find((item) => item.id === id)!;
      const mild = plateItems(region.id, false, "mild").find((item) => item.id === id)!;
      const hot = plateItems(region.id, false, "hot").find((item) => item.id === id)!;
      const fiery = plateItems(region.id, false, "fiery").find((item) => item.id === id)!;
      assert.ok(gentle.amount > 0 && gentle.amount < mild.amount && hot.amount < fiery.amount, region.id);
    }
    const cantonese = plateItems("cantonese").map((item) => item.id);
    assert.ok(cantonese.includes("white-pepper"));
    assert.equal(cantonese.some((id) => /oyster/i.test(id)), false);
  });

  it("keeps peanut off the week-planner plates and repeats an unseeded regional meal", () => {
    const plateRegions = new Set(PLATES.map((plate) => plate.regionId));
    assert.equal(plateRegions.size, 20);
    for (const regionId of plateRegions) {
      assert.equal(plateItems(regionId).some((item) => item.allergens.includes("peanut")), false, regionId);
    }
    for (const regionId of ["thai-massaman", "thai-panang", "west-african"]) {
      assert.equal(plateItems(regionId).some((item) => item.allergens.includes("peanut")), true, regionId);
    }
    const input = { mainId: "chicken", methodId: "curry", regionId: "sichuan", sideId: "rice-greens", servings: 4 };
    assert.deepEqual(generateMeal(input), generateMeal(input));
    const thai = generateMeal({ ...input, regionId: "thai" });
    assert.equal(thai.ingredients.find((item) => item.id === "birds-eye-chilli")?.amount, 4);
    assert.ok(thai.ingredients.some((item) => item.id === "red-curry-paste"));
    assert.equal(thai.ingredients.some((item) => item.id === "chilli-flakes"), false);
  });
});
