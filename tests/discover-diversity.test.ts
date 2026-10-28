import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHomeDiscover } from "../lib/home-suggestions.ts";
import { DISCOVER_PLATES, DISCOVER_POOL_STATS, discoverCoreKey, readDiscoverHistory, rememberDiscoverCores } from "../lib/discover-pool.ts";
import { MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SIDES } from "../lib/meal-catalog.ts";
import { cookingRecipeKey } from "../lib/recipe-identity.ts";
import { recipeFromShare, decodeShare } from "../lib/share-recipe.ts";
import { foodWordHit } from "../lib/food-words.ts";
import { generateMeal } from "../lib/meals.ts";
import { generateRecipe } from "../lib/recipes.ts";
import { specFromRecipe } from "../lib/share-recipe.ts";

test("Discover has at least ten times as many core dishes, covering every main, technique, region and side", () => {
  assert.ok(DISCOVER_POOL_STATS.cores >= DISCOVER_POOL_STATS.previousCores * 10);
  assert.equal(new Set(DISCOVER_PLATES.map(discoverCoreKey)).size, DISCOVER_PLATES.length);
  assert.equal(DISCOVER_POOL_STATS.mains, MAIN_INGREDIENTS.length);
  assert.equal(DISCOVER_POOL_STATS.regions, MEAL_REGIONS.length);
  assert.equal(DISCOVER_POOL_STATS.methods, 13);
  assert.equal(DISCOVER_POOL_STATS.sides, MEAL_SIDES.length);
  assert.equal(discoverCoreKey({ mainId: "chicken", methodId: "grilled", regionId: "thai" }), "chicken|grilled|thai");
});

test("six suggestions spread mains, methods and regions and open the exact shown recipe", () => {
  for (const seed of [1, 2, 3, 10, 42, 507]) {
    const home = buildHomeDiscover({ loadSeed: seed, weekSeed: 202644 });
    assert.equal(home.suggestions.length, 6);
    assert.equal(new Set(home.suggestions.map(item => item.plate.mainId)).size, 6);
    assert.equal(new Set(home.suggestions.map(item => item.plate.methodId)).size, 6);
    assert.equal(new Set(home.suggestions.map(item => item.plate.regionId)).size, 6);
    const motw = discoverCoreKey(home.mealOfWeek.plate);
    for (const item of home.suggestions) {
      assert.notEqual(discoverCoreKey(item.plate), motw);
      assert.equal(cookingRecipeKey(recipeFromShare(decodeShare(item.shareToken))), cookingRecipeKey(item.recipe));
    }
  }
});

test("twenty successive shuffles do not repeat a main dish through a different side", () => {
  let recent: string[] = [];
  const seen = new Set<string>();
  for (let seed = 1; seed <= 20; seed++) {
    const home = buildHomeDiscover({ loadSeed: seed, weekSeed: 202644, recentCoreKeys: recent });
    assert.equal(home.suggestions.length, 6);
    assert.equal(home.reusedRecentCores, 0);
    for (const item of home.suggestions) {
      const core = discoverCoreKey(item.plate);
      assert.ok(!seen.has(core), core);
      seen.add(core);
    }
    recent = rememberDiscoverCores(recent, home.suggestions.map(item => item.plate));
  }
  assert.equal(seen.size, 120);
  assert.deepEqual(readDiscoverHistory(JSON.stringify(recent)), recent);
});

test("vegetable words in side ids cannot turn a chicken or seafood share into a vegetarian recipe", () => {
  for (const input of [
    { mainId: "prawns", methodId: "steamed", regionId: "italian", sideId: "roast-veg-tray" },
    { mainId: "chicken", methodId: "braised", regionId: "french", sideId: "barley-veg" },
  ]) {
    const original = generateMeal({ ...input, servings: 2 });
    const spec = specFromRecipe(original);
    assert.equal(spec.vegetarian, undefined);
    assert.equal(cookingRecipeKey(recipeFromShare(spec)), cookingRecipeKey(original));
  }
  const current = generateRecipe({ classicId: "pasta", regionId: "italian", diet: "balanced", servings: 2, constraints: { vegetarian: true, glutenFree: true } });
  const legacy = { ...current, generationInput: undefined };
  const spec = specFromRecipe(legacy);
  assert.equal(spec.vegetarian, true); assert.equal(spec.glutenFree, true);
  assert.equal(cookingRecipeKey(recipeFromShare(spec)), cookingRecipeKey(current));
});

test("household diet, heat, servings and hard exclusions apply before a suggestion is shown", () => {
  const options = { loadSeed: 37, weekSeed: 202644, diet: "vegan" as const, servings: 5, spiceHeat: "gentle" as const, avoidAllergens: ["wheat", "sesame", "peanut"], dislikes: ["mushrooms"] };
  const home = buildHomeDiscover(options);
  assert.equal(home.suggestions.length, 6);
  for (const item of [...home.suggestions, ...(home.mealOfWeekMatchesFilters ? [{ recipe: home.mealOfWeek.recipe }] : [])]) {
    assert.equal(item.recipe.diet, "vegan"); assert.equal(item.recipe.servings, 5); assert.equal(item.recipe.spiceHeat, "gentle");
    assert.ok(!item.recipe.allergens.some(name => options.avoidAllergens.includes(name)));
    assert.ok(!item.recipe.ingredients.some(ingredient => [ingredient.name, ...(ingredient.aliases ?? [])].some(name => foodWordHit(name, "mushrooms"))));
  }
  const same = buildHomeDiscover(options);
  assert.deepEqual(same.suggestions.map(item => item.shareToken), home.suggestions.map(item => item.shareToken));
});

test("blocked and malformed browser history never relax filters or break discovery", () => {
  assert.deepEqual(readDiscoverHistory("invalid"), []);
  assert.deepEqual(readDiscoverHistory(JSON.stringify(["arbitrary", null, 7])), []);
  assert.deepEqual(readDiscoverHistory("x".repeat(20_001)), []);
  const blocked = buildHomeDiscover({ loadSeed: 3, weekSeed: 202644, dislikes: MAIN_INGREDIENTS.flatMap(main => [main.name, main.ingredientAliases[0]]).slice(0, 40) });
  for (const item of blocked.suggestions) assert.ok(item.recipe.ingredients.length > 0);
  const none = buildHomeDiscover({ loadSeed: 4, weekSeed: 202644, dislikes: ["salt", "neutral cooking oil", "olive oil"] });
  assert.equal(none.suggestions.length, 0);
  assert.equal(none.mealOfWeekMatchesFilters, false);
});
