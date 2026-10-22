import { CLASSICS, REGIONS, generateRecipe, parsePantry } from "./recipes.ts";
import { generateMeal } from "./meals.ts";
import { PLATES } from "./plates.ts";
import { canonAllergen } from "./staples.ts";
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
}

export interface PlannedDinner {
  day: number;
  recipe: Recipe | null;
  reason?: string;
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

function words(value: string): string[] {
  return normalise(value).split(" ").filter(Boolean);
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
  if (normalise(name) === token) return true;
  return words(name).some((word) => word === token || (word.endsWith("s") && word.slice(0, -1) === token));
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

export function planWeek(input: WeekPlanInput): WeekPlan {
  if (!input || typeof input !== "object") throw new Error("A week brief is required.");
  const days = input.days ?? 7;
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new Error("Choose between 1 and 14 days.");
  if (!Number.isInteger(input.servings) || input.servings < 1 || input.servings > 12) throw new Error("Choose between 1 and 12 whole servings.");
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

  type Slot = {
    kind: "classic" | "meal";
    classicId: string;
    regionId: string;
    anchor: string;
    mainId?: string;
    methodId?: string;
    sideId?: string;
  };
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
  function candidate(slot: Slot): { recipe: Recipe | null; reason?: string } {
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

  const eligible = slots.filter((slot) => candidate(slot).recipe);
  const usedPair = new Map<string, number>();
  const usedAnchor = new Map<string, number>();
  const usedKind = new Map<string, number>();
  const usedRegion = new Map<string, number>();
  const planned: PlannedDinner[] = [];

  for (let day = 1; day <= days; day += 1) {
    const lock = locks.get(day);
    if (lock) {
      const chosen = candidate({ kind: "classic", classicId: lock.classicId, regionId: lock.regionId, anchor: lock.classicId });
      if (!chosen.recipe) {
        planned.push({ day, recipe: null, reason: `Locked choice does not match your recorded filters (${chosen.reason}) and was not replaced.` });
        continue;
      }
      planned.push({ day, recipe: chosen.recipe });
      const key = pairKey(lock.classicId, lock.regionId);
      usedPair.set(key, (usedPair.get(key) ?? 0) + 1);
      usedAnchor.set(lock.classicId, (usedAnchor.get(lock.classicId) ?? 0) + 1);
      usedKind.set("classic", (usedKind.get("classic") ?? 0) + 1);
      usedRegion.set(lock.regionId, (usedRegion.get(lock.regionId) ?? 0) + 1);
      continue;
    }
    if (eligible.length === 0) {
      planned.push({ day, recipe: null, reason: "No template matches your recorded filters." });
      continue;
    }
    const pair = eligible.slice().sort((a, b) =>
      (usedPair.get(pairKey(a.classicId, a.regionId)) ?? 0) - (usedPair.get(pairKey(b.classicId, b.regionId)) ?? 0)
      || (usedKind.get(a.kind) ?? 0) - (usedKind.get(b.kind) ?? 0)
      || (usedAnchor.get(a.anchor) ?? 0) - (usedAnchor.get(b.anchor) ?? 0)
      || (usedRegion.get(a.regionId) ?? 0) - (usedRegion.get(b.regionId) ?? 0)
      || a.regionId.localeCompare(b.regionId)
      || a.classicId.localeCompare(b.classicId)
    )[0];
    const chosen = candidate(pair);
    planned.push({ day, recipe: chosen.recipe });
    const key = pairKey(pair.classicId, pair.regionId);
    usedPair.set(key, (usedPair.get(key) ?? 0) + 1);
    usedAnchor.set(pair.anchor, (usedAnchor.get(pair.anchor) ?? 0) + 1);
    usedKind.set(pair.kind, (usedKind.get(pair.kind) ?? 0) + 1);
    usedRegion.set(pair.regionId, (usedRegion.get(pair.regionId) ?? 0) + 1);
  }

  const shopping = new Map<string, WeekShoppingLine>();
  for (const day of planned) {
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

  const unfilledDays = planned.filter((day) => !day.recipe).map((day) => day.day);
  const notes = [WEEK_NOTE];
  if (unfilledDays.length > 0) {
    notes.push(`No plan found with available templates for day ${unfilledDays.join(", ")}. Hard filters stay in place. This is not a proof that no recipe exists.`);
  } else {
    notes.push("Dinners mix classic remixes and ingredient-led plates, including each region's staple food. This is the best spread of those templates, not a claim that no other meal exists.");
  }
  notes.push("Shop suggestions elsewhere in Fusion Table are places to ask. Stock and prices stay unverified.");
  if (constraints.glutenFree && diet !== "gluten-free") notes.push("Wheat, gluten, or oat filters use the gluten-free template, including burger mix without ordinary oats.");
  if (constraints.dairyFree && diet !== "dairy-free" && diet !== "vegan") notes.push("A milk filter uses the dairy-free template. It does not add a price.");
  if (constraints.eggFree && !constraints.vegan && diet !== "vegan") notes.push("An egg filter uses tofu in fried rice. Tofu is soy, so a soy filter can still refuse that day.");
  if (avoidList.some((name) => ["fish", "crustacean", "tree-nut", "peanut"].includes(name))) {
    notes.push("Fish, crustacean, and tree-nut filters remove templates that list those allergens. Peanut is not used in these templates. A template that does not list an allergen is not a packet check.");
  }

  return {
    days: planned,
    shopping: [...shopping.values()],
    notes,
    unfilledDays,
    sourceLabel: "Template-generated · not kitchen-tested",
  };
}
