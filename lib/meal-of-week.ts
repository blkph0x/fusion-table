/**
 * Meal of the week: score curated plates for simplicity, wholesomeness
 * (protein + veg + grain/starch + healthy fat where apt) and quick/easy cook.
 * Uses existing meal metadata — no nutrition database.
 */

import { generateMeal } from "./meals.ts";
import { MAIN_INGREDIENTS } from "./meal-catalog.ts";
import { PLATES, type PlateSpec } from "./plates.ts";
import { mealName } from "./meal-name.ts";
import type { MealRecipe } from "./meal-types.ts";
import type { RecipeIngredient } from "./recipe-types.ts";
import type { MealInput } from "./meal-types.ts";

const QUICK_METHODS = new Set(["stir-fried", "pan-fried", "grilled", "steamed", "poached", "air-fried"]);
const SLOW_METHODS = new Set(["braised", "smoked", "curry"]);
const GRAIN_SIDE = /rice|noodle|couscous|quinoa|polenta|injera|flatbread|pita|chapati|tortilla|bread|bulgur|freekeh|ugali|orzo|focaccia|vermicelli|basmati|jasmine|mash|potato|yuca|plantain|tostones|arepa|millet/i;
const VEG_SIDE = /salad|greens|spinach|broccoli|slaw|cucumber|pumpkin|veg|gomen|sukuma|coleslaw|avocado|tabbouleh|fattoush|herb|gai.?lan|beans|corn|raita/i;
const HEALTHY_FAT = /avocado|olive|sesame|tahini|hummus|peanut|coconut|oil|butter|halloumi|salmon|sardine|tuna/i;

export interface FoodGroups {
  protein: boolean;
  vegetable: boolean;
  grainOrStarch: boolean;
  healthyFat: boolean;
}

export interface MotwScore {
  total: number;
  simplicity: number;
  wholesomeness: number;
  quickEasy: number;
  groups: FoodGroups;
  totalMinutes: number;
  ingredientCount: number;
  stepCount: number;
}

export interface MotwPick {
  plate: PlateSpec;
  recipe: MealRecipe;
  score: MotwScore;
  title: string;
}

function hasProtein(mainId: string, ingredients: readonly RecipeIngredient[]): boolean {
  const main = MAIN_INGREDIENTS.find((m) => m.id === mainId);
  if (main && (main.category === "meat" || main.category === "seafood" || main.category === "vegetarian" || main.category === "plant")) {
    return true;
  }
  return ingredients.some((i) => /chicken|beef|lamb|pork|fish|tofu|tempeh|egg|lentil|chickpea|bean|prawn|salmon|halloumi|paneer|duck|turkey/i.test(i.name));
}

function detectGroups(recipe: MealRecipe): FoodGroups {
  const names = recipe.ingredients.map((i) => i.name).join(" | ");
  const sideBlob = `${recipe.sideId} ${recipe.components?.side ?? ""} ${recipe.components?.vegetables ?? ""}`;
  return {
    protein: hasProtein(recipe.mainId || "", recipe.ingredients),
    vegetable: VEG_SIDE.test(sideBlob) || /spinach|broccoli|cabbage|carrot|tomato|cucumber|pepper|courgette|pumpkin|bean|greens|lettuce|aubergine|cauliflower/i.test(names),
    grainOrStarch: GRAIN_SIDE.test(sideBlob) || GRAIN_SIDE.test(names),
    healthyFat: HEALTHY_FAT.test(names) || /avocado|sesame|olive|hummus|tahini/i.test(sideBlob),
  };
}

export function scoreMealOfWeek(recipe: MealRecipe): MotwScore {
  const groups = detectGroups(recipe);
  const ingredientCount = recipe.ingredients.length;
  const stepCount = recipe.steps.length;
  const equipmentCount = recipe.equipment?.length ?? 0;
  const totalMinutes = recipe.totalMinutes || recipe.prepMinutes + recipe.cookMinutes;
  const methodId = recipe.methodId || "";

  // Simplicity: fewer ingredients, steps, kit; no specialised smoker gear bias.
  let simplicity = 40;
  simplicity -= Math.max(0, ingredientCount - 10) * 1.5;
  simplicity -= Math.max(0, stepCount - 5) * 2;
  simplicity -= Math.max(0, equipmentCount - 4) * 1.5;
  if (methodId === "smoked") simplicity -= 8;
  if (QUICK_METHODS.has(methodId)) simplicity += 6;
  simplicity = clamp(simplicity, 0, 40);

  // Wholesomeness: cover major food groups.
  let wholesomeness = 0;
  if (groups.protein) wholesomeness += 10;
  if (groups.vegetable) wholesomeness += 10;
  if (groups.grainOrStarch) wholesomeness += 8;
  if (groups.healthyFat) wholesomeness += 6;
  if (groups.protein && groups.vegetable && groups.grainOrStarch) wholesomeness += 6;
  wholesomeness = clamp(wholesomeness, 0, 40);

  // Quick / easy: time + method.
  let quickEasy = 30;
  if (totalMinutes <= 35) quickEasy += 8;
  else if (totalMinutes <= 50) quickEasy += 4;
  else if (totalMinutes <= 70) quickEasy += 0;
  else if (totalMinutes <= 100) quickEasy -= 6;
  else quickEasy -= 14;
  if (QUICK_METHODS.has(methodId)) quickEasy += 6;
  if (SLOW_METHODS.has(methodId)) quickEasy -= 8;
  if (stepCount <= 6) quickEasy += 3;
  quickEasy = clamp(quickEasy, 0, 40);

  const total = Math.round(simplicity + wholesomeness + quickEasy);
  return {
    total,
    simplicity: Math.round(simplicity),
    wholesomeness: Math.round(wholesomeness),
    quickEasy: Math.round(quickEasy),
    groups,
    totalMinutes,
    ingredientCount,
    stepCount,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** ISO week key so MOTW is stable within a calendar week, randomised across weeks. */
export function weekSeed(date = new Date()): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const day = new Date(utc);
  const dayNum = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart.getTime()) / 86400000) + 1) / 7);
  return day.getUTCFullYear() * 100 + week;
}

/**
 * Pick meal of the week from curated plates.
 * Scores every plate (or a shuffled sample), returns the best that clears a floor.
 */
export function pickMealOfWeek(options?: Pick<MealInput, "diet" | "spiceHeat" | "pantry" | "clean" | "cookPace" | "avoidAllergens" | "dislikes"> & {
  plates?: readonly PlateSpec[];
  seed?: number;
  servings?: number;
  sampleSize?: number;
}): MotwPick {
  const plates = [...(options?.plates ?? PLATES)];
  const seed = options?.seed ?? weekSeed();
  const rand = mulberry32(seed);
  // Shuffle then take a capped sample so scoring stays cheap.
  for (let i = plates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [plates[i], plates[j]] = [plates[j], plates[i]];
  }
  const sample = plates.slice(0, Math.min(options?.sampleSize ?? 48, plates.length));
  let best: MotwPick | null = null;
  for (const plate of sample) {
    try {
      const recipe = generateMeal({
        mainId: plate.mainId,
        methodId: plate.methodId,
        regionId: plate.regionId,
        sideId: plate.sideId,
        servings: options?.servings ?? 4,
        diet: options?.diet, spiceHeat: options?.spiceHeat ?? "medium",
        pantry: options?.pantry, clean: options?.clean, cookPace: options?.cookPace,
        avoidAllergens: options?.avoidAllergens, dislikes: options?.dislikes,
      });
      const score = scoreMealOfWeek(recipe);
      const title = mealName({
        regionId: plate.regionId,
        mainId: plate.mainId,
        methodId: plate.methodId,
        sideId: plate.sideId,
        sauceHint: recipe.components?.sauce,
      });
      const pick: MotwPick = { plate, recipe: { ...recipe, title }, score, title };
      if (!best || pick.score.total > best.score.total) best = pick;
    } catch {
      /* Skip incompatible plate for current catalog. */
    }
  }
  if (!best) {
    if (options?.diet || options?.avoidAllergens?.length || options?.dislikes?.length) throw new Error("No weekly plate matched the recorded household filters.");
    const plate = PLATES[0];
    const recipe = generateMeal({
      mainId: plate.mainId,
      methodId: plate.methodId,
      regionId: plate.regionId,
      sideId: plate.sideId,
      servings: 4,
    });
    const score = scoreMealOfWeek(recipe);
    const title = mealName({
      regionId: plate.regionId,
      mainId: plate.mainId,
      methodId: plate.methodId,
      sideId: plate.sideId,
    });
    return { plate, recipe: { ...recipe, title }, score, title };
  }
  return best;
}
