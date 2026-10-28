/**
 * Front-page meal suggestions: explore compatible core meals on every load,
 * keep Meal of the Week sticky for the calendar week.
 */

import { generateMeal, getMainsForDiet } from "./meals.ts";
import { MAIN_INGREDIENTS } from "./meal-catalog.ts";
import { DISCOVER_HISTORY_LIMIT, DISCOVER_PLATES, discoverCoreKey } from "./discover-pool.ts";
import type { CleanPrefs } from "./clean-prefs.ts";
import type { CookPace, DietId, SpiceHeat } from "./recipe-types.ts";
import { PLATES, type PlateSpec } from "./plates.ts";
import { mealBlurb, mealName } from "./meal-name.ts";
import { pickMealOfWeek, weekSeed, type MotwPick } from "./meal-of-week.ts";
import { encodeShare, specFromRecipe } from "./share-recipe.ts";
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
  mealOfWeekMatchesFilters: boolean;
  reusedRecentCores: number;
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

export interface HomeDiscoverOptions {
  loadSeed?: number;
  weekSeed?: number;
  suggestionCount?: number;
  servings?: number;
  diet?: DietId;
  spiceHeat?: SpiceHeat;
  pantry?: string;
  clean?: CleanPrefs;
  cookPace?: CookPace;
  avoidAllergens?: string[];
  dislikes?: string[];
  recentCoreKeys?: readonly string[];
}

function suggestionFromPlate(plate: PlateSpec, options: HomeDiscoverOptions): HomeSuggestion | null {
  try {
    const recipe = generateMeal({
      ...plate,
      servings: options.servings ?? 2,
      diet: options.diet ?? "balanced",
      spiceHeat: options.spiceHeat ?? "medium",
      ...(options.pantry ? { pantry: options.pantry } : {}),
      ...(options.clean ? { clean: options.clean } : {}),
      ...(options.cookPace ? { cookPace: options.cookPace } : {}),
      ...(options.avoidAllergens?.length ? { avoidAllergens: options.avoidAllergens } : {}),
      ...(options.dislikes?.length ? { dislikes: options.dislikes } : {}),
    });
    const title = mealName({ ...plate, sauceHint: recipe.components?.sauce });
    const named = { ...recipe, title };
    return {
      plate, recipe: named, title,
      description: mealBlurb({ ...plate, sauce: recipe.components?.sauce, vegetables: recipe.components?.vegetables }),
      regionLabel: regionShort(plate.regionId),
      shareToken: encodeShare(specFromRecipe(named)),
      totalMinutes: named.totalMinutes,
    };
  } catch { return null; }
}

// A shuffle does not need to regenerate and score the same weekly plate 48 times.
// The small cache includes every input affecting the exact displayed recipe.
const weeklyCache = new Map<string, { pick: MotwPick; matches: boolean }>();
function weeklyPick(options: HomeDiscoverOptions): { pick: MotwPick; matches: boolean } {
  const prefs = {
    diet: options.diet, spiceHeat: options.spiceHeat, servings: options.servings,
    pantry: options.pantry, clean: options.clean, cookPace: options.cookPace,
    avoidAllergens: options.avoidAllergens, dislikes: options.dislikes,
  };
  const key = JSON.stringify({ ...prefs, weekSeed: options.weekSeed ?? weekSeed() });
  const cached = weeklyCache.get(key);
  if (cached) return cached;
  let value: { pick: MotwPick; matches: boolean };
  try {
    value = { pick: pickMealOfWeek({ ...prefs, seed: options.weekSeed ?? weekSeed(), servings: options.servings ?? 4 }), matches: true };
  } catch {
    // Retain a typed fallback internally, but never display an incompatible hero.
    value = { pick: pickMealOfWeek({ seed: options.weekSeed ?? weekSeed() }), matches: false };
  }
  if (weeklyCache.size >= 16) weeklyCache.delete(weeklyCache.keys().next().value!);
  weeklyCache.set(key, value);
  return value;
}

const CATEGORY_BY_MAIN = new Map(MAIN_INGREDIENTS.map(main => [main.id, main.category]));
const count = (map: Map<string, number>, key: string) => map.get(key) ?? 0;
const bump = (map: Map<string, number>, key: string) => map.set(key, count(map, key) + 1);
function before(left: readonly number[], right: readonly number[]): boolean {
  for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return left[index] < right[index];
  return false;
}

/** Draw different main dishes, techniques and flavours, preferring unseen cores.
 * Sides cannot manufacture novelty. Hard exclusions are applied to the full plate.
 * When a narrowly filtered pool is exhausted, old compatible cores may reappear.
 */
export function buildHomeDiscover(options: HomeDiscoverOptions = {}): HomeDiscover {
  const loadSeed = options.loadSeed ?? (Date.now() ^ Math.floor(Math.random() * 0xffffffff));
  const weekly = weeklyPick(options), motw = weekly.pick;
  const motwKey = discoverCoreKey(motw.plate);
  const allowedMains = new Set(getMainsForDiet(options.diet).map(main => main.id));
  const pool = shuffle(DISCOVER_PLATES, loadSeed).filter(plate => discoverCoreKey(plate) !== motwKey && allowedMains.has(plate.mainId));
  const history = (options.recentCoreKeys ?? []).slice(-DISCOVER_HISTORY_LIMIT);
  const recent = new Map(history.map((key, index) => [key, index + 1]));
  const want = Math.max(0, Math.min(24, Math.floor(options.suggestionCount ?? 6)));
  const mains = new Map<string, number>(), categories = new Map<string, number>(), methods = new Map<string, number>(), regions = new Map<string, number>();
  const suggestions: HomeSuggestion[] = [];
  let checked = 0, reusedRecentCores = 0;
  // Bound synchronous work for impossible or very restrictive household filters.
  while (suggestions.length < want && pool.length && checked < 240) {
    let bestIndex = 0, bestScore: number[] | undefined;
    for (let index = 0; index < pool.length; index++) {
      const plate = pool[index], seen = recent.get(discoverCoreKey(plate)) ?? 0;
      const score = [seen ? 1 : 0, count(mains, plate.mainId), count(categories, CATEGORY_BY_MAIN.get(plate.mainId) ?? "plant"), count(methods, plate.methodId), count(regions, plate.regionId), seen];
      if (!bestScore || before(score, bestScore)) { bestScore = score; bestIndex = index; }
    }
    const [plate] = pool.splice(bestIndex, 1);
    checked++;
    const item = suggestionFromPlate(plate, options);
    if (!item) continue;
    suggestions.push(item);
    if (recent.has(discoverCoreKey(plate))) reusedRecentCores++;
    bump(mains, plate.mainId); bump(categories, CATEGORY_BY_MAIN.get(plate.mainId) ?? "plant");
    bump(methods, plate.methodId); bump(regions, plate.regionId);
  }
  return { mealOfWeek: motw, suggestions, loadSeed, mealOfWeekMatchesFilters: weekly.matches, reusedRecentCores };
}

/** Pure shuffle helper for tests. */
export function shufflePlates(seed: number, plates: readonly PlateSpec[] = PLATES): PlateSpec[] {
  return shuffle(plates, seed);
}
