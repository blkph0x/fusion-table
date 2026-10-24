/**
 * Soft "cleaner meal" preferences on top of hard diet/allergen/dislike clauses.
 * Cleaner = fewer ingredients, fewer bottled sauces, simpler technique — not lower quality.
 */

import type { Recipe, RecipeIngredient, RecipeStep } from "./recipe-types.ts";

export interface CleanPrefs {
  /** Master soft preference: leaner profiles, cleaner scoring, *_none SAT bias. */
  cleanMode?: boolean;
  fewerBottles?: boolean;
  moreVegetables?: boolean;
  simplerMethod?: boolean;
  pantryFirstClean?: boolean;
  /** Opt-in: allow a second bottled sauce when fewerBottles is on. */
  allowSecondBottle?: boolean;
}

export const CLEAN_KNOB_IDS = [
  "cleanMode",
  "fewerBottles",
  "moreVegetables",
  "simplerMethod",
  "pantryFirstClean",
  "allowSecondBottle",
] as const;

export type CleanKnobId = (typeof CLEAN_KNOB_IDS)[number];

export const CLEAN_KNOB_LABELS: Readonly<Record<CleanKnobId, string>> = {
  cleanMode: "Clean / minimal plate",
  fewerBottles: "Fewer bottles",
  moreVegetables: "More vegetables",
  simplerMethod: "Simpler method",
  pantryFirstClean: "Pantry-first clean",
  allowSecondBottle: "Allow a second bottle",
};

const BOTTLE_ID = /sauce|paste|stock|miso|gochujang|sriracha|tamari|kecap|douban|harissa|berbere|curry|passata|coconut-milk|oyster|fish-sauce|soy-sauce|sweet-chilli|neutral-oil|olive-oil|sesame-oil|vinegar|mayo|ketchup/;
const BOTTLE_NAME = /\b(sauce|paste|stock|miso|gochujang|sriracha|tamari|kecap|harissa|berbere|passata|coconut milk|oyster|fish sauce|soy sauce|sweet chilli|cooking oil|olive oil|sesame oil|vinegar|mayo|mayonnaise)\b/i;
const PASTE_ID = /paste|gochujang|miso|harissa|berbere|douban|duo-jiao|sambal|curry/;
const ACID_ID = /juice|vinegar|tamarind|sumac|lime|lemon/;
const AROMA_ID = /garlic|ginger|shallot|onion|lemongrass|galangal|star-anise|curry-leaves|pandan/;
const GRAIN_ID = /rice|noodle|pasta|couscous|quinoa|bulgur|bread|tortilla|chapati|naan|injera|polenta|orzo|farro|barley|oat|damper|pita|focaccia|flatbread|vermicelli|soba|ugali|millet|sorghum|arepa/;
const VEG_SIDE = new Set([
  "garden-salad", "steamed-broccoli", "roast-veg-tray", "roast-pumpkin", "coleslaw-corn",
  "sesame-spinach", "quinoa-avocado", "cauli-rice-greens", "lentil-salad", "beetroot-salad",
  "ratatouille", "sukuma-wiki", "gomen-greens", "plantain-greens", "yuca-greens",
]);
const FRESH_SIDE_BOOST = new Set([
  ...VEG_SIDE,
  "jasmine-cucumber", "vermicelli-herb", "papaya-salad", "hummus-salad", "flatbread-salad",
  "focaccia-salad", "orzo-salad", "tortilla-salsa",
]);
const CLEAN_METHODS = new Set(["pan-fried", "grilled", "steamed", "roasted", "baked", "stir-fried", "poached"]);
const HEAVY_METHODS = new Set(["schnitzel", "patties", "pulled", "air-fried"]);

export function normalizeCleanPrefs(raw: unknown): CleanPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: CleanPrefs = {};
  for (const key of CLEAN_KNOB_IDS) {
    if (src[key] === true) out[key] = true;
  }
  return out;
}

export function cleanActive(prefs?: CleanPrefs | null): boolean {
  if (!prefs) return false;
  return !!(prefs.cleanMode || prefs.fewerBottles || prefs.moreVegetables || prefs.simplerMethod || prefs.pantryFirstClean);
}

export function isBottleIngredient(item: { id: string; name: string; category?: string; unit?: string }): boolean {
  if (BOTTLE_ID.test(item.id) || BOTTLE_NAME.test(item.name)) return true;
  if (item.category === "grocery" && (item.unit === "ml" || item.unit === "tbsp") && /oil|sauce|paste|stock|milk|vinegar/i.test(`${item.id} ${item.name}`)) {
    return true;
  }
  return false;
}

export function countBottles(ingredients: readonly { id: string; name: string; category?: string; unit?: string }[]): number {
  return ingredients.filter(isBottleIngredient).length;
}

export function countProduce(ingredients: readonly { id: string; name: string; category?: string }[]): number {
  return ingredients.filter((item) => item.category === "produce").length;
}

export function mealCleanStats(recipe: Pick<Recipe, "ingredients" | "steps" | "equipment">): {
  ingredientCount: number;
  bottleCount: number;
  stepCount: number;
  produceCount: number;
  equipmentCount: number;
} {
  return {
    ingredientCount: recipe.ingredients.length,
    bottleCount: countBottles(recipe.ingredients),
    stepCount: recipe.steps.length,
    produceCount: countProduce(recipe.ingredients),
    equipmentCount: recipe.equipment.length,
  };
}

/** Lower is cleaner. Soft score only — never used to override hard filters. */
export function cleanlinessScore(
  recipe: Pick<Recipe, "ingredients" | "steps" | "equipment" | "methodId" | "sideId">,
  prefs?: CleanPrefs | null,
): number {
  const stats = mealCleanStats(recipe);
  let score = stats.ingredientCount + stats.bottleCount * 2.5 + stats.stepCount * 0.75 + Math.max(0, stats.equipmentCount - 3) * 0.5;
  const method = recipe.methodId ?? "";
  if (HEAVY_METHODS.has(method)) score += 4;
  else if (!CLEAN_METHODS.has(method) && method) score += 1.5;
  if (recipe.sideId && VEG_SIDE.has(recipe.sideId)) score -= 1.5;
  if (prefs?.fewerBottles) score += stats.bottleCount * 1.5;
  if (prefs?.moreVegetables) score -= stats.produceCount * 0.6;
  if (prefs?.simplerMethod && HEAVY_METHODS.has(method)) score += 3;
  if (prefs?.pantryFirstClean) {
    const pantryHits = recipe.ingredients.filter((item) => item.inPantry).length;
    score -= pantryHits * 0.4;
  }
  return Math.round(score * 100) / 100;
}

export function methodCleanRank(methodId: string, prefs?: CleanPrefs | null): number {
  if (!prefs?.simplerMethod && !prefs?.cleanMode) return 0;
  if (CLEAN_METHODS.has(methodId)) return 0;
  if (HEAVY_METHODS.has(methodId)) return 3;
  return 1;
}

export function sideCleanRank(sideId: string, prefs?: CleanPrefs | null): number {
  if (!prefs?.moreVegetables && !prefs?.cleanMode) return 0;
  if (VEG_SIDE.has(sideId)) return 0;
  if (FRESH_SIDE_BOOST.has(sideId)) return 1;
  if (GRAIN_ID.test(sideId)) return 2;
  return 1;
}

/** Prefer fresh/veg sides for clean prefs; never invent unknown side ids. */
export function orderSidesForClean(sideIds: readonly string[], prefs?: CleanPrefs | null): string[] {
  if (!cleanActive(prefs)) return [...sideIds];
  return [...sideIds].sort((a, b) =>
    sideCleanRank(a, prefs) - sideCleanRank(b, prefs)
    || a.localeCompare(b)
  );
}

export function preferCleanPlate(
  plates: readonly { methodId: string; sideId: string }[],
  prefs?: CleanPrefs | null,
): number {
  if (!cleanActive(prefs) || plates.length === 0) return 0;
  return plates.reduce((sum, plate) => sum + methodCleanRank(plate.methodId, prefs) + sideCleanRank(plate.sideId, prefs), 0);
}

type DraftLike = { id: string; name: string; amount: number; unit: string; category: string; allergens: string[]; notes?: string; aliases?: readonly string[] };

/** Drop lower-impact duplicate aromatics; keep one acid; demote paste when fresh heat exists. */
export function consolidateDrafts<T extends DraftLike>(
  aromatics: readonly T[],
  seasonings: readonly T[],
  finish: readonly T[],
  prefs?: CleanPrefs | null,
  spiceHeat?: string,
): { aromatics: T[]; seasonings: T[]; finish: T[] } {
  if (!cleanActive(prefs)) {
    return { aromatics: [...aromatics], seasonings: [...seasonings], finish: [...finish] };
  }
  const budget = prefs?.cleanMode || prefs?.fewerBottles ? 10 : 12;
  let aro = [...aromatics];
  let seas = [...seasonings];
  let fin = [...finish];

  // One acid source in finish.
  const acids = fin.filter((item) => ACID_ID.test(item.id) || ACID_ID.test(item.name));
  if (acids.length > 1) {
    const keep = acids[0];
    fin = [keep, ...fin.filter((item) => !acids.includes(item))];
  }

  // Cap aromatics to 2 (clean) / 3.
  const aromaCap = prefs?.cleanMode || prefs?.fewerBottles ? 2 : 3;
  if (aro.length > aromaCap) {
    const ranked = aro.slice().sort((a, b) => {
      const au = a.id === "garlic" ? 1 : 0;
      const bu = b.id === "garlic" ? 1 : 0;
      return au - bu || a.id.localeCompare(b.id);
    });
    aro = ranked.slice(0, aromaCap);
  }

  // Prefer whole/fresh over paste when heat is not hot/fiery.
  const hot = spiceHeat === "hot" || spiceHeat === "fiery";
  if ((prefs?.fewerBottles || prefs?.cleanMode) && !hot) {
    seas = seas.filter((item) => !PASTE_ID.test(item.id) || item.id.includes("heat") === false);
    // Keep at least signature-looking simmer if we wiped everything.
    if (seas.length === 0 && seasonings.length) seas = [seasonings[0]];
  }

  // Soft ingredient budget across the three slots (main/side added later).
  let total = aro.length + seas.length + fin.length;
  while (total > Math.max(4, budget - 6) && (aro.length > 1 || seas.length > 1 || fin.length > 2)) {
    if (seas.length > 1) seas = seas.slice(0, -1);
    else if (aro.length > 1) aro = aro.slice(0, -1);
    else if (fin.length > 2) fin = fin.slice(0, -1);
    else break;
    total = aro.length + seas.length + fin.length;
  }

  return { aromatics: aro, seasonings: seas, finish: fin };
}

/** Round oils/spices/herbs to cleaner kitchen amounts. */
export function cleanRoundAmount(amount: number, unit: string, id: string): number {
  if (!(amount > 0)) return amount;
  if (unit === "tbsp" || unit === "tsp") {
    const step = unit === "tbsp" ? 0.5 : 0.25;
    return Math.max(step, Math.round(amount / step) * step);
  }
  if (unit === "g" || unit === "ml") {
    if (AROMA_ID.test(id) || /herb|spice|pepper|cumin|paprika|turmeric|coriander|mint|parsley|oregano|thyme/.test(id)) {
      if (amount < 5) return Math.max(1, Math.round(amount));
      if (amount < 40) return Math.round(amount / 5) * 5;
      return Math.round(amount / 10) * 10;
    }
    if (/oil|sauce|paste|stock|juice|vinegar/.test(id)) {
      if (amount < 50) return Math.round(amount / 5) * 5;
      return Math.round(amount / 10) * 10;
    }
  }
  return Number(amount.toFixed(4));
}

export function applyCleanRounding<T extends { id: string; amount: number; unit: string }>(
  ingredients: readonly T[],
  prefs?: CleanPrefs | null,
): T[] {
  if (!cleanActive(prefs)) return [...ingredients];
  return ingredients.map((item) => ({
    ...item,
    amount: cleanRoundAmount(item.amount, item.unit, item.id),
  }));
}

/** Soft vegetable boost + grain trim on amounts (does not drop required staples). */
export function applyPortionBalance<T extends RecipeIngredient>(
  ingredients: readonly T[],
  prefs?: CleanPrefs | null,
): T[] {
  if (!prefs?.moreVegetables && !prefs?.cleanMode) return [...ingredients];
  return ingredients.map((item) => {
    if (item.category === "produce") {
      return { ...item, amount: Number((item.amount * 1.15).toFixed(4)) };
    }
    if (GRAIN_ID.test(item.id) && item.unit === "g") {
      return { ...item, amount: Number((item.amount * 0.85).toFixed(4)) };
    }
    return item;
  });
}

/** Collapse adjacent prep steps that share a board; drop spare thermometer wording when no animal. */
export function tidySteps(steps: readonly RecipeStep[], equipment: readonly string[], hasAnimalEndpoint: boolean): {
  steps: RecipeStep[];
  equipment: string[];
} {
  const merged: RecipeStep[] = [];
  for (const step of steps) {
    const prev = merged[merged.length - 1];
    if (
      prev
      && /prepare|chop|wash|board/i.test(prev.title + prev.detail)
      && /prepare|chop|wash|board/i.test(step.title + step.detail)
      && (prev.minutes ?? 0) + (step.minutes ?? 0) <= 25
    ) {
      merged[merged.length - 1] = {
        title: prev.title,
        detail: `${prev.detail} ${step.detail}`,
        minutes: (prev.minutes ?? 0) + (step.minutes ?? 0) || undefined,
      };
      continue;
    }
    merged.push({ ...step });
  }
  // Prefer one-pan wording when both sauce and main use a frying pan.
  const eq = [...equipment];
  if (eq.includes("Small saucepan") && eq.includes("Wide frying pan") && merged.some((s) => /regional sauce/i.test(s.title))) {
    for (let i = 0; i < merged.length; i += 1) {
      if (/Make the regional sauce/i.test(merged[i].title)) {
        merged[i] = {
          ...merged[i],
          detail: merged[i].detail.replace(/small saucepan/gi, "same wide pan (wipe if needed)"),
        };
      }
    }
  }
  const gear = hasAnimalEndpoint ? eq : eq.filter((item) => item !== "Food thermometer");
  return { steps: merged, equipment: gear };
}

export function cleanSummaryNote(stats: ReturnType<typeof mealCleanStats>, prefs?: CleanPrefs | null): string {
  const bits = [
    `${stats.ingredientCount} ingredients`,
    `${stats.stepCount} steps`,
    `${stats.bottleCount} bottle${stats.bottleCount === 1 ? "" : "s"}`,
  ];
  if (prefs?.moreVegetables || prefs?.cleanMode) bits.push(`${stats.produceCount} produce items`);
  return `Clean plate used ${stats.bottleCount} bottle${stats.bottleCount === 1 ? "" : "s"} · ${bits.join(" · ")}. Soft preference only; hard filters stay.`;
}

/** Light macro-style annotation from amounts (rough, not nutrition advice). */
export function balanceAnnotation(ingredients: readonly RecipeIngredient[]): string {
  let proteinG = 0;
  let vegG = 0;
  let grainG = 0;
  for (const item of ingredients) {
    const g = item.unit === "g" ? item.amount : item.unit === "each" ? item.amount * 80 : 0;
    if (item.category === "butcher" || item.category === "fishmonger" || /tofu|tempeh|egg|paneer|halloumi|lentil|chickpea|bean/.test(item.id)) {
      proteinG += g;
    } else if (item.category === "produce") {
      vegG += g;
    } else if (GRAIN_ID.test(item.id)) {
      grainG += g;
    }
  }
  const total = proteinG + vegG + grainG;
  if (total < 50) return "Balance note: amounts are light; treat as a template, not nutrition advice.";
  const p = Math.round((proteinG / total) * 100);
  const v = Math.round((vegG / total) * 100);
  const c = Math.max(0, 100 - p - v);
  return `Rough plate split by weight (template only, not nutrition advice): ~${p}% protein-side, ~${v}% vegetables, ~${c}% grain/starch.`;
}

/** Soft SAT biases: which option ids to forbid under clean prefs. */
export function cleanSatForbidden(optionId: string, prefs?: CleanPrefs | null, spiceHeat?: string): boolean {
  if (!cleanActive(prefs)) return false;
  const fewer = prefs?.fewerBottles || prefs?.cleanMode;
  const fresh = prefs?.moreVegetables || prefs?.cleanMode;
  const hot = spiceHeat === "hot" || spiceHeat === "fiery";
  if (fewer) {
    if (optionId === "umami_oyster" || optionId === "umami_fish" || optionId === "umami_miso") return true;
    if (optionId === "umami_soy" && !prefs?.allowSecondBottle) return true;
    if ((optionId === "heat_sriracha" || optionId === "heat_both") && !hot) return true;
    if (optionId === "form_cold_stir") return true;
  }
  if (fresh) {
    if (optionId === "extra_none") return false;
    // Prefer fresh lanes by demoting empty fresh when other fresh options exist — handled in openLane bias.
  }
  if (prefs?.simplerMethod || prefs?.cleanMode) {
    if (optionId === "form_cold_stir" || optionId === "form_hot_stir") return true;
  }
  return false;
}

/** Soft preference: force plain none options when fewer bottles and not hot. */
export function cleanSatPreferNone(lane: string, prefs?: CleanPrefs | null, spiceHeat?: string): boolean {
  if (!prefs?.fewerBottles && !prefs?.cleanMode) return false;
  const hot = spiceHeat === "hot" || spiceHeat === "fiery";
  if (lane === "umami") return !prefs?.allowSecondBottle;
  if (lane === "heat") return !hot;
  if (lane === "extra") return !!(prefs?.cleanMode || prefs?.fewerBottles);
  if (lane === "aroma") return !!(prefs?.cleanMode && prefs?.fewerBottles);
  return false;
}

export function isFreshSide(sideId: string): boolean {
  return FRESH_SIDE_BOOST.has(sideId) || VEG_SIDE.has(sideId);
}

export function isHeavyMethod(methodId: string): boolean {
  return HEAVY_METHODS.has(methodId);
}
