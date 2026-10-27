import assert from "node:assert/strict";
import { test } from "node:test";
import { generateMeal } from "../lib/meals.ts";
import { planWeek } from "../lib/planner.ts";
import { importCookbook, parseView, planBriefKey, readMealPreferences, readPlanSession, recipeConflicts, validRecipeSnapshot, type PlanBrief, type SavedRecipe } from "../lib/kitchen-state.ts";

const recipe = generateMeal({ mainId: "chicken", methodId: "grilled", regionId: "thai", sideId: "rice-greens", servings: 2 });
const entry: SavedRecipe = { recipe, savedAt: "2026-10-26T00:00:00.000Z", notes: "Keep my notes", rating: 4, tested: true };

test("household preferences reject invalid persisted controls and routes", () => {
  const prefs = { diet: "vegan", spiceHeat: "gentle", servings: 3, cookPace: "", pantry: "rice" };
  assert.deepEqual(readMealPreferences(prefs), prefs);
  for (const patch of [{ servings: 0 }, { servings: 1.5 }, { servings: 13 }, { diet: "anything" }, { spiceHeat: "lava" }, { pantry: [] }, { cookPace: "24h" }]) assert.equal(readMealPreferences({ ...prefs, ...patch }), null);
  assert.equal(parseView("week"), "week");
  assert.equal(parseView("https://elsewhere.example"), null);
});

test("plan settings identity is stable for reordered exclusions but changes for meaningful edits", () => {
  const brief: PlanBrief = { days: 7, servings: 2, diet: "balanced", spiceHeat: "medium", pantry: "rice", avoidAllergens: ["milk", "egg"], dislikes: ["Onion", "garlic"], clean: { moreVegetables: true, fewerBottles: true } };
  assert.equal(planBriefKey(brief), planBriefKey({ ...brief, avoidAllergens: ["egg", "milk"], dislikes: ["garlic", "onion"], clean: { fewerBottles: true, moreVegetables: true } }));
  for (const patch of [{ servings: 4 }, { diet: "vegan" as const }, { avoidAllergens: ["milk"] }, { pantry: "rice, oil" }, { days: 3 }, { clean: {} }]) assert.notEqual(planBriefKey(brief), planBriefKey({ ...brief, ...patch }));
});

test("recipe snapshots and cookbook imports validate before merging and preserve existing notes", () => {
  assert.equal(validRecipeSnapshot(recipe), true);
  assert.equal(validRecipeSnapshot({ ...recipe, equipment: null }), false);
  assert.equal(validRecipeSnapshot({ ...recipe, ingredients: [{ ...recipe.ingredients[0], amount: -2 }] }), false);
  assert.equal(validRecipeSnapshot({ ...recipe, ingredients: [{ ...recipe.ingredients[0], aliases: {} }] }), false);
  assert.equal(validRecipeSnapshot({ ...recipe, ingredients: [{ ...recipe.ingredients[0], notes: {} }] }), false);
  assert.equal(validRecipeSnapshot({ ...recipe, methodNotes: "bad" }), false);
  assert.equal(validRecipeSnapshot({ ...recipe, safetyNote: {} }), false);
  assert.equal(validRecipeSnapshot({ ...recipe, kind: "classic", components: { sauce: {} } }), false);
  assert.equal(validRecipeSnapshot({ ...recipe, kind: "unrecognised" }), false);
  assert.equal(validRecipeSnapshot({ ...recipe, allergens: [] }), false);
  assert.equal(validRecipeSnapshot({ ...recipe, steps: [{ ...recipe.steps[0], minutes: -2 }] }), false);
  const imported = importCookbook(JSON.stringify([{ ...entry, notes: "overwrite me", rating: 0 }]), [entry]);
  assert.equal(imported.length, 1);
  assert.equal(imported[0].notes, "Keep my notes");
  assert.equal(imported[0].rating, 4);
  assert.throws(() => importCookbook('{"saved":[]}', [entry]), /cookbook export/);
  assert.throws(() => importCookbook(JSON.stringify([{ ...entry, recipe: { ...recipe, steps: [] } }]), [entry]), /complete recipes/);
  assert.throws(() => importCookbook(" ".repeat(8_000_001), [entry]), /too large/);
});

test("opened recipes report conflicts without rewriting a household or its saved snapshot", () => {
  assert.ok(recipeConflicts(recipe, { diet: "vegan" }).includes("Not a vegan recipe"));
  assert.ok(recipeConflicts(recipe, { dislikes: ["chicken"] }).includes("Includes chicken"));
  const withAllergen = { ...recipe, allergens: ["wheat", "sulphite", "crustaceans"] };
  assert.ok(recipeConflicts(withAllergen, { avoidAllergens: ["gluten", "sulphites", "crustacean"] }).includes("Contains wheat"));
  assert.ok(recipeConflicts(withAllergen, { avoidAllergens: ["sulphites"] }).includes("Contains sulphites"));
  const hiddenSoy = { ...recipe, allergens: [], ingredients: recipe.ingredients.map((item, index) => index === 0 ? { ...item, allergens: ["soy"] } : item) };
  assert.ok(recipeConflicts(hiddenSoy, { avoidAllergens: ["soy"] }).includes("Contains soy"));
});

test("a persisted plan restores its applied brief and rejects corrupt or falsely labelled sessions", () => {
  const brief: PlanBrief = { days: 1, servings: 2, diet: "balanced", spiceHeat: "medium", pantry: "", avoidAllergens: [], dislikes: [] };
  const plan = planWeek({ ...brief, seed: 42 });
  const restored = readPlanSession(JSON.parse(JSON.stringify({ plan, brief, locks: [1, 1, 30] })));
  assert.ok(restored);
  assert.deepEqual(restored.locks, [1]);
  assert.equal(restored.plan.days[0].recipe?.id, plan.days[0].recipe?.id);
  assert.equal(planBriefKey(restored.brief), planBriefKey(brief));
  assert.equal(readPlanSession({ plan: { ...plan, shopping: null }, brief }), null);
  assert.equal(readPlanSession({ plan: { ...plan, days: [{ ...plan.days[0], options: [null] }] }, brief }), null);
  assert.equal(readPlanSession({ plan, brief: { ...brief, servings: 12 } }), null);
  assert.deepEqual(readPlanSession({ plan: { ...plan, shopping: [] }, brief })?.plan.shopping, plan.shopping);
  const animalRecipe = { ...plan, days: [{ ...plan.days[0], recipe }] };
  assert.equal(readPlanSession({ plan: animalRecipe, brief: { ...brief, diet: "vegan" } }), null);
});

