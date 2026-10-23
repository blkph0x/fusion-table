import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseDinner, planWeek, sideOptions, swapDinner, swapSide } from "../lib/planner.ts";
import { generateRecipe } from "../lib/recipes.ts";
import { MEAL_SIDES } from "../lib/meals.ts";

describe("fusion week planner", () => {
  it("fills seven different dinners and does not invent a price", () => {
    const week = planWeek({ days: 7, servings: 4 });
    assert.equal(week.days.length, 7);
    assert.deepEqual(week.unfilledDays, []);
    const keys = week.days.map((day) => `${day.recipe?.classicId}:${day.recipe?.regionId}`);
    assert.equal(new Set(keys).size, 7);
    assert.equal(new Set(week.days.map((day) => day.recipe?.classicId)).size, 7);
    assert.ok(week.days.some((day) => day.recipe?.kind === "meal"));
    assert.ok(week.days.some((day) => day.recipe?.kind !== "meal"));
    assert.ok(week.days.every((day) => day.recipe?.sourceLabel === "Template-generated · not kitchen-tested"));
    assert.ok(week.notes.some((note) => note.includes("not a live model")));
    assert.ok(week.notes.some((note) => note.includes("not a purchase total")));
    assert.ok(week.shopping.length > 0);
    assert.ok(week.shopping.every((line) => line.amount > 0 && !("price" in line)));
  });

  it("stacks vegan and gluten-free without wheat, milk, egg, or oats", () => {
    const week = planWeek({ days: 7, servings: 2, diet: "vegan", constraints: { glutenFree: true }, avoidAllergens: ["wheat"] });
    assert.deepEqual(week.unfilledDays, []);
    for (const day of week.days) {
      const recipe = day.recipe!;
      assert.ok(!recipe.allergens.includes("wheat"), recipe.id);
      assert.ok(!recipe.allergens.includes("milk"), recipe.id);
      assert.ok(!recipe.allergens.includes("egg"), recipe.id);
      assert.ok(!recipe.allergens.includes("oats"), recipe.id);
      assert.ok(recipe.ingredients.every((item) => !["butcher", "fishmonger"].includes(item.category)), recipe.id);
    }
  });

  it("does not relax a sesame filter or a hard dislike, and leaves an unsafe lock empty", () => {
    const sesame = planWeek({ days: 7, servings: 4, avoidAllergens: ["sesame"] });
    assert.ok(sesame.days.every((day) => !day.recipe?.allergens.includes("sesame")));
    assert.ok(sesame.days.every((day) => !["japanese", "korean", "levantine"].includes(day.recipe?.regionId || "")));
    const chilli = planWeek({ days: 3, servings: 4, dislikes: ["chilli", "mushroom"] });
    assert.ok(chilli.days.every((day) => day.recipe?.ingredients.every((item) => !/chilli|mushroom/i.test(item.name))));
    const locked = planWeek({
      days: 2, servings: 4, avoidAllergens: ["sesame"],
      locks: [{ day: 1, classicId: "pasta", regionId: "japanese" }],
    });
    assert.equal(locked.days[0].recipe, null);
    assert.match(locked.days[0].reason || "", /not replaced/);
    assert.ok(locked.days[1].recipe);
    assert.notEqual(locked.days[1].recipe?.regionId, "japanese");
  });

  it("uses gluten-free burger mix without oats and egg-free fried rice without eggs", () => {
    const burger = generateRecipe({ classicId: "burgers", regionId: "indian", servings: 4, diet: "vegetarian", constraints: { glutenFree: true } });
    assert.ok(!burger.ingredients.some((item) => item.id === "rolled-oats"));
    assert.ok(!burger.steps.some((step) => /mix in the oats/i.test(step.detail)));
    const rice = generateRecipe({ classicId: "fried-rice", regionId: "thai", servings: 4, constraints: { eggFree: true } });
    assert.ok(rice.ingredients.some((item) => item.id === "firm-tofu"));
    assert.ok(!rice.allergens.includes("egg"));
    assert.ok(!rice.steps.some((step) => /\beggs\b/i.test(step.detail)));
  });

  it("keeps pantry matches off the merged list and refuses to drop every filter", () => {
    const week = planWeek({ days: 2, servings: 4, pantry: "garlic, olive oil" });
    assert.ok(week.shopping.every((line) => line.id !== "garlic" && line.id !== "olive-oil"));
    const blocked = planWeek({ days: 7, servings: 4, dislikes: ["garlic"] });
    assert.deepEqual(blocked.unfilledDays, [1, 2, 3, 4, 5, 6, 7]);
    assert.ok(blocked.notes.some((note) => note.includes("Hard filters stay in place")));
    assert.equal(blocked.shopping.length, 0);
  });

  it("rejects an unknown allergen and an unbounded week", () => {
    assert.throws(() => planWeek({ days: 7, servings: 4, avoidAllergens: ["mystery"] }));
    assert.throws(() => planWeek({ days: 0, servings: 4 }));
    assert.throws(() => planWeek({ days: 15, servings: 4 }));
    assert.throws(() => planWeek({ days: 7, servings: 4, locks: [{ day: 8, classicId: "pasta", regionId: "thai" }] }));
    assert.throws(() => planWeek({ days: 1, servings: 1, seed: 1.5 }));
    assert.throws(() => planWeek({ days: 1, servings: 1, seed: -1 }));
  });

  it("keeps an unseeded week stable and lets a seed change the dinners", () => {
    const ids = (seed?: number) => planWeek({ days: 7, servings: 4, seed }).days.map((day) => day.recipe?.id);
    const stable = ids();
    assert.deepEqual(stable, ids());
    const seeded = [1, 2, 3, 4, 5].map((seed) => ids(seed));
    assert.ok(seeded.some((row) => row.join("|") !== stable.join("|")));
    assert.deepEqual(seeded[0], ids(1));
    const varied = planWeek({ days: 7, servings: 4, seed: 1 });
    assert.equal(new Set(varied.days.map((day) => day.recipe?.id)).size, 7);
    assert.ok(varied.days.some((day) => day.recipe?.kind === "meal"));
    assert.ok(varied.days.some((day) => day.recipe?.kind !== "meal"));
    assert.ok(varied.days.every((day) => day.options.length === 3));
    assert.ok(varied.days.every((day) => day.options.every((option) => option.classicId !== day.recipe?.classicId || option.regionId !== day.recipe?.regionId)));
    assert.ok(varied.notes.some((note) => note.includes("one matching spread")));
    const swapped = swapDinner({ days: 7, servings: 4, seed: 9 }, varied, 1);
    assert.notEqual(swapped.days[0].recipe?.id, varied.days[0].recipe?.id);
    assert.deepEqual(swapped.days.slice(1).map((day) => day.recipe?.id), varied.days.slice(1).map((day) => day.recipe?.id));
    const option = varied.days[2].options[0];
    const chosen = chooseDinner({ days: 7, servings: 4, seed: 9 }, varied, 3, option.classicId, option.regionId);
    assert.equal(chosen.days[2].recipe?.classicId, option.classicId);
    assert.equal(chosen.days[2].recipe?.regionId, option.regionId);
    assert.equal(chosen.days[0].recipe?.id, varied.days[0].recipe?.id);
  });

  it("does not relax filters when a seed or a randomise asks for another meal", () => {
    const sesame = planWeek({ days: 7, servings: 4, avoidAllergens: ["sesame"], seed: 11 });
    assert.ok(sesame.days.every((day) => !day.recipe?.allergens.includes("sesame")));
    const offered = sesame.days[0].options[0];
    const picked = chooseDinner({ days: 7, servings: 4, avoidAllergens: ["sesame"], seed: 12 }, sesame, 1, offered.classicId, offered.regionId);
    assert.ok(!picked.days[0].recipe?.allergens.includes("sesame"));
    const swapped = swapDinner({ days: 7, servings: 4, avoidAllergens: ["sesame"], seed: 12 }, sesame, 1);
    assert.ok(swapped.days.every((day) => !day.recipe?.allergens.includes("sesame")));
    const refused = chooseDinner(
      { days: 7, servings: 4, avoidAllergens: ["sesame"], seed: 12 },
      sesame, 1, "pasta", "japanese",
    );
    assert.equal(refused.days[0].recipe?.id, sesame.days[0].recipe?.id);
    const locked = planWeek({
      days: 2, servings: 4, avoidAllergens: ["sesame"], seed: 4,
      locks: [{ day: 1, classicId: "pasta", regionId: "japanese" }],
    });
    const stillLocked = swapDinner({
      days: 2, servings: 4, avoidAllergens: ["sesame"], seed: 8,
      locks: [{ day: 1, classicId: "pasta", regionId: "japanese" }],
    }, locked, 1);
    assert.equal(stillLocked.days[0].recipe, null);
    assert.match(stillLocked.days[0].reason || "", /not replaced/);
    const blocked = planWeek({ days: 3, servings: 4, dislikes: ["garlic"], seed: 6 });
    assert.deepEqual(blocked.unfilledDays, [1, 2, 3]);
    const plural = planWeek({ days: 2, servings: 4, dislikes: ["chillies"], seed: 3 });
    for (const day of plural.days) {
      const names = (day.recipe?.ingredients ?? []).flatMap((item) => [item.name, ...(item.aliases ?? [])]).join(" ");
      assert.equal(/chilli|chili/i.test(names), false);
    }
  });

  it("swaps only the side on a meal-kind dinner and refuses a broccoli dislike on steamed broccoli", () => {
    const brief = { days: 7, servings: 4, seed: 21 };
    const week = planWeek(brief);
    const mealDay = week.days.find((day) => day.recipe?.kind === "meal" && day.recipe.mainId !== "broccoli");
    assert.ok(mealDay?.recipe?.mainId && mealDay.recipe.methodId && mealDay.recipe.sideId);
    const other = MEAL_SIDES.find((side) => side.id !== mealDay!.recipe!.sideId && side.id !== "steamed-broccoli");
    assert.ok(other);
    const swapped = swapSide(brief, week, mealDay!.day, other!.id);
    const after = swapped.days.find((day) => day.day === mealDay!.day)!.recipe!;
    assert.equal(after.kind, "meal");
    assert.equal(after.mainId, mealDay!.recipe!.mainId);
    assert.equal(after.methodId, mealDay!.recipe!.methodId);
    assert.equal(after.regionId, mealDay!.recipe!.regionId);
    assert.equal(after.sideId, other!.id);
    assert.notEqual(after.id, mealDay!.recipe!.id);
    const classicDay = week.days.find((day) => day.recipe && day.recipe.kind !== "meal");
    if (classicDay) {
      const unchanged = swapSide(brief, week, classicDay.day, "garden-salad");
      assert.equal(unchanged.days.find((day) => day.day === classicDay.day)?.recipe?.id, classicDay.recipe?.id);
    }
    const filter = { days: 7, servings: 4, seed: 21, dislikes: ["broccoli"] };
    assert.throws(() => swapSide(filter, week, mealDay!.day, "steamed-broccoli"), /not cooked|recorded filters|dislike/i);
    const options = sideOptions({ days: 7, servings: 4, dislikes: ["broccoli"] }, week, mealDay!.day);
    assert.ok(!options.some((option) => option.sideId === "steamed-broccoli"));
    const wheat = planWeek({ days: 3, servings: 2, avoidAllergens: ["wheat"], seed: 8 });
    const wheatMeal = wheat.days.find((day) => day.recipe?.kind === "meal");
    if (wheatMeal) {
      const gfGarlic = swapSide({ days: 3, servings: 2, avoidAllergens: ["wheat"], seed: 8 }, wheat, wheatMeal.day, "garlic-bread");
      const recipe = gfGarlic.days.find((day) => day.day === wheatMeal.day)?.recipe;
      assert.ok(recipe);
      assert.ok(!recipe!.allergens.includes("wheat"));
      assert.match(recipe!.ingredients.find((item) => item.id === "garlic-bread")?.name || "", /gluten-free/i);
    }
  });
});
