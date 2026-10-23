import { CLASSICS, REGIONS, generateRecipe, parsePantry } from "./recipes.ts";
import { generateMeal, MEAL_SIDES } from "./meals.ts";
import { preferredSidesForRegion } from "./side-plans.ts";
import { PLATES } from "./plates.ts";
import { canonAllergen } from "./staples.ts";
import { applySatFusion } from "./fusion-sat.ts";
import { foodWordHit } from "./food-words.ts";
import { mix32 } from "./sat.ts";
import { exploreRegionProfile, dominantFlavourIds } from "./region-diversity.ts";
import type { DietId, Recipe, RecipeConstraints, SpiceHeat } from "./recipe-types.ts";

export const WEEK_NOTE =
  "This week is a rule over authored templates on this device, not a live model. Every dinner is template-generated and not kitchen-tested. It matches the recorded filters where the template lists an ingredient. It is not guaranteed allergy-safe. Check the packet. No shelf prices are included, so this is not a purchase total.";

export interface WeekPlanInput {
  days?: number;
  servings: number;
  diet?: DietId;
  spiceHeat?: SpiceHeat;
  pantry?: string | string[];
  /** Hard allergen names: soy, wheat, gluten, milk, egg, sesame, oats, fish, crustacean, peanut, tree-nut. */
  avoidAllergens?: string[];
  /** Hard dislikes. A match is the ingredient name, an alias, or a whole word. Filters are not relaxed. */
  dislikes?: string[];
  constraints?: RecipeConstraints;
  /** 1-based day locks. An unsafe lock is left empty rather than cooked. */
  locks?: { day: number; classicId: string; regionId: string }[];
  /**
   * Omitted: the same brief always yields the same week.
   * Set: pick among equally good templates so the same pantry can yield a different week.
   * Filters are not relaxed.
   */
  seed?: number;
}

export interface DinnerOption {
  classicId: string;
  regionId: string;
  title: string;
}

export interface PlannedDinner {
  day: number;
  recipe: Recipe | null;
  reason?: string;
  /** Other matching templates for this night. Filters are not relaxed. */
  options: DinnerOption[];
}

export interface WeekShoppingLine {
  id: string;
  name: string;
  amount: number;
  unit: string;
  category: string;
  allergens: string[];
  days: number[];
}

export interface WeekPlan {
  days: PlannedDinner[];
  shopping: WeekShoppingLine[];
  notes: string[];
  unfilledDays: number[];
  sourceLabel: "Template-generated · not kitchen-tested";
}

const AVOID = new Set(["soy", "wheat", "gluten", "milk", "egg", "sesame", "oats", "barley", "rye", "fish", "crustacean", "peanut", "tree-nut"]);

function normalise(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/[’']/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/[–—-]/g, " ").replace(/\s+/g, " ").trim();
}

function constraintsFor(input: WeekPlanInput, avoid: Set<string>): RecipeConstraints {
  const extra = input.constraints ?? {};
  const vegan = extra.vegan === true || input.diet === "vegan";
  return {
    vegan: extra.vegan === true,
    vegetarian: extra.vegetarian === true || vegan,
    dairyFree: extra.dairyFree === true || vegan || input.diet === "dairy-free" || avoid.has("milk"),
    glutenFree: extra.glutenFree === true || input.diet === "gluten-free" || ["wheat", "gluten", "oats", "barley", "rye"].some((name) => avoid.has(name)),
    eggFree: extra.eggFree === true || vegan || input.diet === "vegan" || avoid.has("egg"),
  };
}

function wordHit(name: string, token: string): boolean {
  return foodWordHit(name, token);
}

function disliked(recipe: Recipe, dislikes: string[]): boolean {
  if (dislikes.length === 0) return false;
  return recipe.ingredients.some((item) => dislikes.some((token) => [item.name, ...(item.aliases ?? [])].some((name) => wordHit(name, token))));
}

function blocked(recipe: Recipe, avoid: Set<string>, dislikes: string[]): string | null {
  const allergens = recipe.allergens.map(canonAllergen);
  const hit = allergens.find((allergen) => avoid.has(allergen) || (allergen === "wheat" && avoid.has("gluten")) || (allergen === "oats" && avoid.has("gluten")));
  if (hit) return `Contains recorded allergen ${hit}`;
  if (disliked(recipe, dislikes)) return "Contains a hard dislike";
  return null;
}

function pairKey(classicId: string, regionId: string): string {
  return `${classicId}:${regionId}`;
}

type Slot = {
  kind: "classic" | "meal";
  classicId: string;
  regionId: string;
  anchor: string;
  mainId?: string;
  methodId?: string;
  sideId?: string;
};

type Usage = {
  pair: Map<string, number>;
  anchor: Map<string, number>;
  kind: Map<string, number>;
  region: Map<string, number>;
  /** Regional flavour ingredients already used this week (not mains/sides/staples). */
  flavour: Map<string, number>;
};

type Prepared = {
  input: WeekPlanInput;
  days: number;
  seed?: number;
  locks: Map<number, { classicId: string; regionId: string }>;
  constraints: RecipeConstraints;
  diet: DietId;
  avoidList: string[];
  eligible: Slot[];
  candidate: (slot: Slot, soften?: readonly string[]) => { recipe: Recipe | null; reason?: string };
};

/** Structural / cooking ids that are not "flavour monotony" when they repeat. */
const FLAVOUR_IGNORE = new Set([
  "neutral-oil", "vegetable-stock", "onion", "passata", "coconut-milk",
  "coating-flour", "breadcrumbs", "cornflour",
]);

function mix(seed: number, classicId: string, regionId: string): number {
  return mix32(seed, `${classicId}\0${regionId}`);
}

function cmp(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function emptyUsage(): Usage {
  return { pair: new Map(), anchor: new Map(), kind: new Map(), region: new Map(), flavour: new Map() };
}

function remember(usage: Usage, slot: Slot, recipe?: Recipe | null) {
  const key = pairKey(slot.classicId, slot.regionId);
  usage.pair.set(key, (usage.pair.get(key) ?? 0) + 1);
  usage.anchor.set(slot.anchor, (usage.anchor.get(slot.anchor) ?? 0) + 1);
  usage.kind.set(slot.kind, (usage.kind.get(slot.kind) ?? 0) + 1);
  usage.region.set(slot.regionId, (usage.region.get(slot.regionId) ?? 0) + 1);
  if (!recipe) return;
  for (const id of flavourIdsOf(recipe)) {
    usage.flavour.set(id, (usage.flavour.get(id) ?? 0) + 1);
  }
}

function flavourIdsOf(recipe: Recipe): string[] {
  try {
    const profile = exploreRegionProfile(
      recipe.regionId,
      recipe.diet === "gluten-free",
      recipe.spiceHeat ?? "medium",
    );
    const regionFlavour = new Set(dominantFlavourIds(profile));
    return recipe.ingredients
      .map((item) => item.id)
      .filter((id) => !FLAVOUR_IGNORE.has(id) && !id.startsWith("sat-") && regionFlavour.has(id));
  } catch {
    return recipe.ingredients
      .map((item) => item.id)
      .filter((id) => !FLAVOUR_IGNORE.has(id) && !id.startsWith("sat-"));
  }
}

function softenFrom(usage: Usage): string[] {
  return [...usage.flavour.entries()]
    .filter(([, count]) => count >= 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id)
    .slice(0, 40);
}

function flavourCollision(recipe: Recipe, usage: Usage): number {
  let score = 0;
  for (const id of flavourIdsOf(recipe)) {
    const seen = usage.flavour.get(id) ?? 0;
    if (seen > 0) score += seen;
  }
  return score;
}

function slotFromRecipe(recipe: Recipe): Slot {
  const kind = recipe.kind === "meal" ? "meal" : "classic";
  return {
    kind,
    classicId: recipe.classicId,
    regionId: recipe.regionId,
    anchor: kind === "meal" ? recipe.mainId || recipe.classicId : recipe.classicId,
    mainId: recipe.mainId,
    methodId: recipe.methodId,
    sideId: recipe.sideId,
  };
}

/**
 * Variety bands come first, so a week does not repeat the same plate.
 * With no seed, ties stay alphabetical and the week is stable.
 * With a seed, ties inside a band follow that seed only. Alphabetical order is not the decider.
 * Flavour collision is scored later when a seed is set (needs the built plate).
 */
function rank(eligible: Slot[], usage: Usage, seed: number | undefined): Slot[] {
  return eligible.slice().sort((a, b) =>
    cmp(usage.pair.get(pairKey(a.classicId, a.regionId)) ?? 0, usage.pair.get(pairKey(b.classicId, b.regionId)) ?? 0)
    || cmp(usage.kind.get(a.kind) ?? 0, usage.kind.get(b.kind) ?? 0)
    || cmp(usage.anchor.get(a.anchor) ?? 0, usage.anchor.get(b.anchor) ?? 0)
    || cmp(usage.region.get(a.regionId) ?? 0, usage.region.get(b.regionId) ?? 0)
    || (seed == null ? 0 : cmp(mix(seed, a.classicId, a.regionId), mix(seed, b.classicId, b.regionId)))
    || (seed == null ? a.regionId.localeCompare(b.regionId) || a.classicId.localeCompare(b.classicId) : 0)
  );
}

/** Among equally banded options, prefer the plate that reuses fewer already-heavy flavours. */
function pickForDay(
  ordered: Slot[],
  usage: Usage,
  candidate: Prepared["candidate"],
  seed: number | undefined,
): { slot: Slot; recipe: Recipe } | null {
  const soften = seed == null ? [] : softenFrom(usage);
  const window = seed == null ? ordered : ordered.slice(0, Math.min(16, ordered.length));
  let best: { slot: Slot; recipe: Recipe; collision: number } | null = null;
  for (const slot of window) {
    const chosen = candidate(slot, soften);
    if (!chosen.recipe) continue;
    const collision = seed == null ? 0 : flavourCollision(chosen.recipe, usage);
    if (!best || collision < best.collision) {
      best = { slot, recipe: chosen.recipe, collision };
      if (collision === 0) break;
    }
  }
  if (best) return { slot: best.slot, recipe: best.recipe };
  for (const slot of ordered) {
    const chosen = candidate(slot, soften);
    if (chosen.recipe) return { slot, recipe: chosen.recipe };
  }
  return null;
}

function prepare(input: WeekPlanInput): Prepared {
  if (!input || typeof input !== "object") throw new Error("A week brief is required.");
  const days = input.days ?? 7;
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new Error("Choose between 1 and 14 days.");
  if (!Number.isInteger(input.servings) || input.servings < 1 || input.servings > 12) throw new Error("Choose between 1 and 12 whole servings.");
  if (input.seed != null && (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff)) {
    throw new Error("Choose a whole-number seed.");
  }
  const avoidList = (input.avoidAllergens ?? []).map(normalise).filter(Boolean);
  if (avoidList.some((name) => !AVOID.has(name))) throw new Error("Use a supported allergen name.");
  const avoid = new Set(avoidList);
  const dislikes = [...new Set((input.dislikes ?? []).map(normalise).filter(Boolean))].slice(0, 40);
  const constraints = constraintsFor(input, avoid);
  const diet = input.diet ?? "balanced";
  const spiceHeat = input.spiceHeat ?? "medium";
  const pantry = input.pantry;
  parsePantry(pantry);

  const locks = new Map<number, { classicId: string; regionId: string }>();
  for (const lock of input.locks ?? []) {
    if (!Number.isInteger(lock.day) || lock.day < 1 || lock.day > days) throw new Error("A locked day is outside this week.");
    if (!CLASSICS.some((option) => option.id === lock.classicId) || !REGIONS.some((option) => option.id === lock.regionId)) {
      throw new Error("A locked meal must use a supported classic and region.");
    }
    locks.set(lock.day, { classicId: lock.classicId, regionId: lock.regionId });
  }

  const slots: Slot[] = [
    ...CLASSICS.flatMap((classic) => REGIONS.map((region) => ({
      kind: "classic" as const, classicId: classic.id, regionId: region.id, anchor: classic.id,
    }))),
    ...PLATES.map((plate) => ({
      kind: "meal" as const,
      classicId: `meal:${plate.mainId}:${plate.methodId}:${plate.sideId}`,
      regionId: plate.regionId,
      anchor: plate.mainId,
      mainId: plate.mainId,
      methodId: plate.methodId,
      sideId: plate.sideId,
    })),
  ];
  const cache = new Map<string, { recipe: Recipe | null; reason?: string }>();
  const fusedCache = new Map<string, { recipe: Recipe | null; reason?: string }>();
  function baseOf(slot: Slot): { recipe: Recipe | null; reason?: string } {
    const key = pairKey(slot.classicId, slot.regionId);
    const cached = cache.get(key);
    if (cached) return cached;
    let built: Recipe;
    try {
      built = slot.kind === "meal"
        ? generateMeal({
          mainId: slot.mainId ?? "", methodId: slot.methodId ?? "", regionId: slot.regionId, sideId: slot.sideId,
          servings: input.servings, diet, spiceHeat, pantry, constraints,
        })
        : generateRecipe({ classicId: slot.classicId, regionId: slot.regionId, servings: input.servings, diet, spiceHeat, pantry, constraints });
    } catch (error) {
      const failed = { recipe: null, reason: error instanceof Error ? error.message : "Template could not be built." };
      cache.set(key, failed);
      return failed;
    }
    const reason = blocked(built, avoid, dislikes);
    const result = reason ? { recipe: null, reason } : { recipe: built };
    cache.set(key, result);
    return result;
  }
  function candidate(slot: Slot, soften: readonly string[] = []): { recipe: Recipe | null; reason?: string } {
    const base = baseOf(slot);
    if (!base.recipe || input.seed == null) return base;
    const softKey = soften.slice().sort().join(",");
    const key = `${pairKey(slot.classicId, slot.regionId)}|${softKey}`;
    const cached = fusedCache.get(key);
    if (cached) return cached;
    const daySeed = mix(input.seed, slot.classicId, slot.regionId);
    let fused: Recipe;
    try {
      // Rebuild with seed so regional pantry exploration and SAT run once together.
      fused = slot.kind === "meal"
        ? generateMeal({
          mainId: slot.mainId ?? "", methodId: slot.methodId ?? "", regionId: slot.regionId, sideId: slot.sideId,
          servings: input.servings, diet, spiceHeat, pantry, constraints,
          seed: daySeed,
          softenIngredients: [...soften],
          avoidAllergens: avoidList,
          dislikes,
        })
        : generateRecipe({
          classicId: slot.classicId, regionId: slot.regionId, servings: input.servings, diet, spiceHeat, pantry, constraints,
          seed: daySeed,
          avoidAllergens: avoidList,
          dislikes,
        });
    } catch (error) {
      // Fall back to SAT-on-base if a seeded rebuild fails.
      const seafoodAlready = base.recipe.allergens.includes("fish") || base.recipe.allergens.includes("crustacean");
      fused = applySatFusion(base.recipe, {
        seed: daySeed,
        regionId: slot.regionId,
        diet,
        spiceHeat,
        glutenFree: constraints.glutenFree === true,
        dairyFree: constraints.dairyFree === true,
        vegan: constraints.vegan === true || diet === "vegan",
        vegetarian: constraints.vegetarian === true || diet === "vegetarian" || diet === "vegan",
        eggFree: constraints.eggFree === true || diet === "vegan",
        avoid: avoidList,
        dislikes,
        mainId: slot.mainId,
        methodId: slot.methodId,
        servings: input.servings,
        pantry,
        seafoodAlready,
      });
      void error;
    }
    const reason = blocked(fused, avoid, dislikes);
    const result = reason ? { recipe: null, reason } : { recipe: fused };
    fusedCache.set(key, result);
    return result;
  }

  return {
    input, days, seed: input.seed, locks, constraints, diet, avoidList,
    eligible: slots.filter((slot) => baseOf(slot).recipe),
    candidate,
  };
}

function suggest(prepared: Prepared, planned: PlannedDinner[], day: number): DinnerOption[] {
  if (prepared.locks.has(day)) return [];
  const usage = emptyUsage();
  for (const other of planned) {
    if (other.day === day || !other.recipe) continue;
    remember(usage, slotFromRecipe(other.recipe), other.recipe);
  }
  const current = planned.find((item) => item.day === day)?.recipe;
  const options: DinnerOption[] = [];
  const soften = prepared.seed == null ? [] : softenFrom(usage);
  for (const slot of rank(prepared.eligible, usage, prepared.seed)) {
    if (current && slot.classicId === current.classicId && slot.regionId === current.regionId) continue;
    const recipe = prepared.candidate(slot, soften).recipe;
    if (!recipe) continue;
    options.push({ classicId: slot.classicId, regionId: slot.regionId, title: recipe.title });
    if (options.length === 3) break;
  }
  return options;
}

function withOptions(prepared: Prepared, planned: PlannedDinner[]): PlannedDinner[] {
  return planned.map((day) => ({ ...day, options: day.recipe ? suggest(prepared, planned, day.day) : [] }));
}

function assemble(prepared: Prepared, planned: PlannedDinner[]): WeekPlan {
  const days = withOptions(prepared, planned);
  const shopping = new Map<string, WeekShoppingLine>();
  for (const day of days) {
    if (!day.recipe) continue;
    for (const item of day.recipe.ingredients) {
      if (item.inPantry) continue;
      const existing = shopping.get(`${item.id}|${item.unit}`);
      if (!existing) {
        shopping.set(`${item.id}|${item.unit}`, {
          id: item.id, name: item.name, amount: item.amount, unit: item.unit,
          category: item.category, allergens: [...item.allergens], days: [day.day],
        });
      } else {
        existing.amount = Math.round((existing.amount + item.amount) * 10000) / 10000;
        if (!existing.days.includes(day.day)) existing.days.push(day.day);
      }
    }
  }
  const unfilledDays = days.filter((day) => !day.recipe).map((day) => day.day);
  const notes = [WEEK_NOTE];
  if (unfilledDays.length > 0) {
    notes.push(`No plan found with available templates for day ${unfilledDays.join(", ")}. Hard filters stay in place. This is not a proof that no recipe exists.`);
  } else {
    notes.push("Dinners mix classic remixes and ingredient-led plates, including each region's staple food. This is the best spread of those templates, not a claim that no other meal exists.");
  }
  if (prepared.seed != null) {
    notes.push("This is one matching spread. Plan again, or randomise one dinner, for a different meal. Hard filters stay in place. The order follows the seed, not an alphabetical list. Each dinner explores that region's pantry, then adds one satisfying assignment of a seeded SAT search. The same seed repeats it. This is not a proof of taste or of P versus NP.");
    const reused = [...shopping.values()]
      .filter((line) => line.days.length >= 3 && !FLAVOUR_IGNORE.has(line.id) && !line.id.startsWith("sat-"))
      .map((line) => line.name);
    if (reused.length) {
      notes.push(`Pantry reuse across the week (intentional): ${reused.slice(0, 8).join(", ")}. Softened in later picks rather than banned.`);
    }
  }
  notes.push("Shop suggestions elsewhere in Fusion Table are places to ask. Stock and prices stay unverified.");
  const { constraints, diet, avoidList } = prepared;
  if (constraints.glutenFree && diet !== "gluten-free") notes.push("Wheat, gluten, or oat filters use the gluten-free template, including burger mix without ordinary oats.");
  if (constraints.dairyFree && diet !== "dairy-free" && diet !== "vegan") notes.push("A milk filter uses the dairy-free template. It does not add a price.");
  if (constraints.eggFree && !constraints.vegan && diet !== "vegan") notes.push("An egg filter uses tofu in fried rice. Tofu is soy, so a soy filter can still refuse that day.");
  if (avoidList.some((name) => ["fish", "crustacean", "tree-nut", "peanut"].includes(name))) {
    notes.push("Fish, crustacean, and tree-nut filters remove templates that list those allergens. Peanut is not used in these templates. A template that does not list an allergen is not a packet check.");
  }
  return {
    days,
    shopping: [...shopping.values()],
    notes,
    unfilledDays,
    sourceLabel: "Template-generated · not kitchen-tested",
  };
}

function requireDay(plan: WeekPlan, day: number): PlannedDinner {
  const found = plan.days.find((item) => item.day === day);
  if (!found) throw new Error("That day is outside this week.");
  return found;
}

export function planWeek(input: WeekPlanInput): WeekPlan {
  const prepared = prepare(input);
  const usage = emptyUsage();
  const planned: PlannedDinner[] = [];
  for (let day = 1; day <= prepared.days; day += 1) {
    const lock = prepared.locks.get(day);
    if (lock) {
      const slot = { kind: "classic" as const, classicId: lock.classicId, regionId: lock.regionId, anchor: lock.classicId };
      const chosen = prepared.candidate(slot, softenFrom(usage));
      if (!chosen.recipe) {
        planned.push({ day, recipe: null, options: [], reason: `Locked choice does not match your recorded filters (${chosen.reason}) and was not replaced.` });
        continue;
      }
      planned.push({ day, recipe: chosen.recipe, options: [] });
      remember(usage, slot, chosen.recipe);
      continue;
    }
    if (prepared.eligible.length === 0) {
      planned.push({ day, recipe: null, options: [], reason: "No template matches your recorded filters." });
      continue;
    }
    const ordered = rank(prepared.eligible, usage, prepared.seed);
    const picked = pickForDay(ordered, usage, prepared.candidate, prepared.seed);
    if (!picked) {
      planned.push({ day, recipe: null, options: [], reason: "No template matches your recorded filters." });
      continue;
    }
    planned.push({ day, recipe: picked.recipe, options: [] });
    remember(usage, picked.slot, picked.recipe);
  }
  return assemble(prepared, planned);
}

/** Replace one night with another matching template. A locked or blocked night is left as it is. */
export function swapDinner(input: WeekPlanInput, plan: WeekPlan, day: number): WeekPlan {
  const prepared = prepare(input);
  const current = requireDay(plan, day);
  if (prepared.locks.has(day)) return plan;
  const usage = emptyUsage();
  for (const other of plan.days) {
    if (other.day === day || !other.recipe) continue;
    remember(usage, slotFromRecipe(other.recipe), other.recipe);
  }
  const soften = prepared.seed == null ? [] : softenFrom(usage);
  const next = rank(prepared.eligible, usage, prepared.seed).find((slot) => {
    if (current.recipe && slot.classicId === current.recipe.classicId && slot.regionId === current.recipe.regionId) return false;
    const recipe = prepared.candidate(slot, soften).recipe;
    return !!recipe && recipe.id !== current.recipe?.id;
  });
  const recipe = next ? prepared.candidate(next, soften).recipe : null;
  if (!recipe || recipe.id === current.recipe?.id) return plan;
  const planned = plan.days.map((item) => item.day === day ? { day, recipe, options: [], reason: undefined } : item);
  return assemble(prepared, planned);
}

/** Use one of the offered templates. A choice that fails the recorded filters is not cooked. */
export function chooseDinner(input: WeekPlanInput, plan: WeekPlan, day: number, classicId: string, regionId: string): WeekPlan {
  const prepared = prepare(input);
  requireDay(plan, day);
  if (prepared.locks.has(day)) return plan;
  const slot = prepared.eligible.find((item) => item.classicId === classicId && item.regionId === regionId);
  const recipe = slot ? prepared.candidate(slot).recipe : null;
  if (!recipe) return plan;
  const planned = plan.days.map((item) => item.day === day ? { day, recipe, options: [], reason: undefined } : item);
  return assemble(prepared, planned);
}

/**
 * Change only the accompaniment on an ingredient-led meal.
 * Classic remixes have no separate side slot — the plan is unchanged.
 * A side that fails recorded filters is refused rather than cooked.
 */
export function swapSide(input: WeekPlanInput, plan: WeekPlan, day: number, sideId: string): WeekPlan {
  const prepared = prepare(input);
  const current = requireDay(plan, day);
  if (prepared.locks.has(day)) return plan;
  if (!current.recipe || current.recipe.kind !== "meal" || !current.recipe.mainId || !current.recipe.methodId) return plan;
  if (!MEAL_SIDES.some((side) => side.id === sideId)) throw new Error("Choose a recognised side pairing.");
  if (current.recipe.sideId === sideId) return plan;

  const slot: Slot = {
    kind: "meal",
    classicId: `meal:${current.recipe.mainId}:${current.recipe.methodId}:${sideId}`,
    regionId: current.recipe.regionId,
    anchor: current.recipe.mainId,
    mainId: current.recipe.mainId,
    methodId: current.recipe.methodId,
    sideId,
  };
  const chosen = prepared.candidate(slot);
  if (!chosen.recipe) {
    throw new Error(`That side does not match your recorded filters (${chosen.reason ?? "blocked"}) and was not cooked.`);
  }
  const planned = plan.days.map((item) => item.day === day ? { day, recipe: chosen.recipe, options: [], reason: undefined } : item);
  return assemble(prepared, planned);
}

/** Other side pairings that still match the recorded filters for this meal-kind dinner. */
export function sideOptions(input: WeekPlanInput, plan: WeekPlan, day: number): { sideId: string; name: string; suggested?: boolean }[] {
  const prepared = prepare(input);
  const current = requireDay(plan, day);
  if (!current.recipe || current.recipe.kind !== "meal" || !current.recipe.mainId || !current.recipe.methodId) return [];
  const preferred = new Set(preferredSidesForRegion(current.recipe.regionId));
  const options: { sideId: string; name: string; suggested?: boolean }[] = [];
  const trySide = (side: (typeof MEAL_SIDES)[number]) => {
    if (side.id === current.recipe!.sideId) return;
    if (options.some((item) => item.sideId === side.id)) return;
    const slot: Slot = {
      kind: "meal",
      classicId: `meal:${current.recipe!.mainId}:${current.recipe!.methodId}:${side.id}`,
      regionId: current.recipe!.regionId,
      anchor: current.recipe!.mainId!,
      mainId: current.recipe!.mainId,
      methodId: current.recipe!.methodId,
      sideId: side.id,
    };
    if (!prepared.candidate(slot).recipe) return;
    options.push({ sideId: side.id, name: side.name, ...(preferred.has(side.id) ? { suggested: true } : {}) });
  };
  for (const side of MEAL_SIDES) {
    if (preferred.has(side.id)) trySide(side);
  }
  for (const side of MEAL_SIDES) {
    if (options.length >= 8) break;
    trySide(side);
  }
  return options.slice(0, 8);
}

/**
 * When a side is blocked by recorded filters, explain why and list safe alternatives.
 * Keeps the main, method and region; only the accompaniment changes.
 */
export function explainBlockedSide(input: WeekPlanInput, plan: WeekPlan, day: number, sideId: string): { reason: string; alternatives: { sideId: string; name: string }[] } {
  const prepared = prepare(input);
  const current = requireDay(plan, day);
  const alternatives = sideOptions(input, plan, day).map(({ sideId: id, name }) => ({ sideId: id, name }));
  if (!current.recipe || current.recipe.kind !== "meal" || !current.recipe.mainId || !current.recipe.methodId) {
    return { reason: "Only ingredient-led dinners have a separate side you can change.", alternatives };
  }
  const side = MEAL_SIDES.find((item) => item.id === sideId);
  if (!side) return { reason: "Choose a recognised side pairing.", alternatives };
  const slot: Slot = {
    kind: "meal",
    classicId: `meal:${current.recipe.mainId}:${current.recipe.methodId}:${sideId}`,
    regionId: current.recipe.regionId,
    anchor: current.recipe.mainId,
    mainId: current.recipe.mainId,
    methodId: current.recipe.methodId,
    sideId,
  };
  const chosen = prepared.candidate(slot);
  const detail = chosen.reason ?? "blocked by your recorded filters";
  const altNote = alternatives.length
    ? ` Try ${alternatives.slice(0, 3).map((item) => item.name).join(", ")} instead — the main stays put.`
    : " No other side matches your filters for this dinner.";
  return {
    reason: `${side.name} was not cooked (${detail}).${altNote}`,
    alternatives,
  };
}
