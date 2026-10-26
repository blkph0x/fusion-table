/**
 * Front-page meal suggestions: shuffle curated plates on every load,
 * keep Meal of the Week sticky for the calendar week.
 */

import { generateMeal } from "./meals.ts";
import { PLATES, type PlateSpec } from "./plates.ts";
import { mealBlurb, mealName } from "./meal-name.ts";
import { pickMealOfWeek, weekSeed, type MotwPick } from "./meal-of-week.ts";
import { encodeShare } from "./share-recipe.ts";
import type { MealRecipe } from "./meal-types.ts";

export interface HomeSuggestion {
  plate: PlateSpec;
  recipe: MealRecipe;
  title: string;
  description: string;
  regionLabel: string;
  shareToken: string;
  /** Minutes for the card chip. */
  totalMinutes: number;
}

export interface HomeDiscover {
  mealOfWeek: MotwPick;
  suggestions: HomeSuggestion[];
  /** Seed used for this shuffle (client can pass Date.now()). */
  loadSeed: number;
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

function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function regionShort(regionId: string): string {
  return regionId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function suggestionFromPlate(plate: PlateSpec, servings = 2): HomeSuggestion | null {
  try {
    const recipe = generateMeal({
      mainId: plate.mainId,
      methodId: plate.methodId,
      regionId: plate.regionId,
      sideId: plate.sideId,
      servings,
      spiceHeat: "medium",
    });
    const title = mealName({
      regionId: plate.regionId,
      mainId: plate.mainId,
      methodId: plate.methodId,
      sideId: plate.sideId,
      sauceHint: recipe.components?.sauce,
    });
    const named = { ...recipe, title };
    const shareToken = encodeShare({
      v: 1,
      kind: "meal",
      mainId: plate.mainId,
      methodId: plate.methodId,
      regionId: plate.regionId,
      sideId: plate.sideId,
      diet: "balanced",
      spiceHeat: "medium",
      servings,
    });
    return {
      plate,
      recipe: named,
      title,
      description: mealBlurb({
        regionId: plate.regionId,
        mainId: plate.mainId,
        methodId: plate.methodId,
        sideId: plate.sideId,
        sauce: recipe.components?.sauce,
        vegetables: recipe.components?.vegetables,
      }),
      regionLabel: regionShort(plate.regionId),
      shareToken,
      totalMinutes: named.totalMinutes,
    };
  } catch {
    return null;
  }
}

/**
 * Build discover payload: MOTW for the ISO week + N randomised plates for this load.
 * Excludes the MOTW plate from the suggestion strip so the composition does not double up.
 */
export function buildHomeDiscover(options?: {
  loadSeed?: number;
  weekSeed?: number;
  suggestionCount?: number;
  servings?: number;
}): HomeDiscover {
  const loadSeed = options?.loadSeed ?? (Date.now() ^ (Math.floor(Math.random() * 0xffffffff)));
  const motw = pickMealOfWeek({ seed: options?.weekSeed ?? weekSeed(), servings: options?.servings ?? 4 });
  const motwKey = `${motw.plate.regionId}|${motw.plate.mainId}|${motw.plate.methodId}|${motw.plate.sideId}`;
  const pool = shuffle(PLATES, loadSeed).filter(
    (p) => `${p.regionId}|${p.mainId}|${p.methodId}|${p.sideId}` !== motwKey,
  );
  const want = options?.suggestionCount ?? 6;
  const suggestions: HomeSuggestion[] = [];
  for (const plate of pool) {
    if (suggestions.length >= want) break;
    const item = suggestionFromPlate(plate, options?.servings ?? 2);
    if (item) suggestions.push(item);
  }
  return { mealOfWeek: motw, suggestions, loadSeed };
}

/** Pure shuffle helper for tests. */
export function shufflePlates(seed: number, plates: readonly PlateSpec[] = PLATES): PlateSpec[] {
  return shuffle(plates, seed);
}
