import assert from "node:assert/strict";
import { test } from "node:test";
import { generateMeal, MEAL_REGIONS } from "../lib/meals.ts";
import { recipeFromShare, specFromRecipe } from "../lib/share-recipe.ts";

const base = { mainId: "beef", methodId: "curry", regionId: "thai", sideId: "garden-salad", servings: 4 };

test("mince and lean chosen cuts never inherit a slow joint's simmer estimate", () => {
  for (const region of MEAL_REGIONS) for (const cutId of ["beef-mince", "beef-rump"]) {
    const recipe = generateMeal({ ...base, regionId: region.id, cutId });
    const simmer = recipe.steps.find(step => step.title === "Simmer the main")!;
    assert.equal(simmer.minutes, 20, `${region.id}/${cutId}`);
    assert.doesNotMatch(simmer.detail, /107–113|fork-tender/);
    assert.match(simmer.detail, cutId === "beef-mince" ? /75°C/ : /71°C/);
  }
  const joint = generateMeal({ ...base, cutId: "beef-chuck" });
  assert.ok(joint.steps.find(step => step.title === "Simmer the main")!.minutes! >= 100);
});

test("whole birds are rounded to whole shopping units at every serving size", () => {
  for (const [mainId, cutId, portions] of [["chicken", "chicken-whole", 4], ["chicken", "chicken-spatchcock", 4], ["turkey", "turkey-whole", 8]] as const) {
    for (const servings of [1, 2, 3, 4, 6, 8, 12]) for (const methodId of ["baked", "roasted", "poached", "steamed", "braised", "curry", "smoked"]) {
      const recipe = generateMeal({ ...base, mainId, cutId, methodId, servings });
      const main = recipe.ingredients.find(item => item.id === mainId)!;
      assert.equal(main.unit, "");
      assert.equal(main.amount, Math.ceil(servings / portions), `${cutId}/${methodId}/${servings}`);
      const text = recipe.steps.map(step => step.detail).join(" ");
      assert.match(text, /whole-bird shopping quantity is rounded up/);
      assert.match(text, /both must reach 75°C/);
      if (["baked", "roasted"].includes(methodId)) {
        assert.match(text, /Cook the whole bird unstuffed/);
        assert.doesNotMatch(text, /Spread in one layer/);
      }
      if (methodId === "smoked") {
        assert.match(text, /150–160°C/);
        assert.ok(!recipe.steps.some(step => step.title === "Manage the stall and finish"));
      }
    }
  }
});

test("slow-cut oven recipes use a covered moist stage and a realistic tenderness window", () => {
  for (const cutId of ["beef-chuck", "beef-brisket", "pork-shoulder", "lamb-shoulder"]) {
    const mainId = cutId.split("-")[0];
    const recipe = generateMeal({ ...base, mainId, cutId, methodId: "roasted" });
    const roast = recipe.steps.find(step => step.title === "Roast the main")!;
    assert.ok(roast.minutes! >= 180);
    assert.match(roast.detail, /160°C conventional.*cover tightly.*probe-tender/);
  }
});

test("gizzards get a tenderising preparation before quick cooking and sausages stay links until cooked", () => {
  const gizzards = generateMeal({ ...base, mainId: "chicken", cutId: "chicken-gizzard", methodId: "pan-fried" });
  assert.match(gizzards.steps.find(step => step.title === "Prepare your main")!.detail, /60–90 minutes until tender/);
  assert.ok(gizzards.prepMinutes >= 105);
  assert.ok(gizzards.equipment.includes("Saucepan"));
  const links = generateMeal({ ...base, cutId: "beef-sausage", methodId: "stir-fried" });
  assert.match(links.steps.find(step => step.title === "Stir-fry the main")!.detail, /whole links first.*75°C.*slice the cooked links/);
});

test("whole-bird portions and advance side preparation survive recipe sharing", () => {
  const recipe = generateMeal({ ...base, mainId: "chicken", methodId: "roasted", cutId: "chicken-whole", sideId: "sticky-rice-greens", servings: 3, seed: 7 });
  const reproduced = recipeFromShare(specFromRecipe(recipe));
  assert.deepEqual(reproduced.ingredients, recipe.ingredients);
  assert.deepEqual(reproduced.steps, recipe.steps);
  assert.equal(reproduced.totalMinutes, recipe.totalMinutes);
});

test("tongue is tenderised and peeled before every finishing method, while stock frames are not meal mains", () => {
  for (const methodId of ["pan-fried", "air-fried", "grilled", "braised", "curry", "roasted"]) {
    const recipe = generateMeal({ ...base, cutId: "beef-tongue", methodId });
    assert.match(recipe.steps.find(step => step.title === "Prepare your main")!.detail, /2–3 hours.*skewer enters easily.*peel off and discard/);
    assert.ok(recipe.prepMinutes >= 195);
  }
  assert.throws(() => generateMeal({ ...base, mainId: "chicken", cutId: "chicken-frame", methodId: "braised" }), /stock bones.*meaty main/i);
});
