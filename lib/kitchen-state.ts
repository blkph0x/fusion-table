import { canonAllergen } from "./staples.ts";
import { foodWordHit } from "./food-words.ts";
import { normalizeCleanPrefs } from "./clean-prefs.ts";
import type { Recipe, DietId, SpiceHeat, CookPace } from "./recipe-types.ts";
import { shoppingForDinners, type WeekPlan, type WeekPlanInput } from "./planner.ts";
import { cookingRecipeKey } from "./recipe-identity.ts";

export type MealPreferences = { diet: DietId; spiceHeat: SpiceHeat; servings: number; cookPace: CookPace | ""; pantry: string };
export type PlanBrief = Omit<WeekPlanInput, "seed" | "locks">;
export type SavedRecipe = { recipe: Recipe; savedAt: string; notes: string; tested: boolean; rating: number; token?: string };
export const VIEWS = ["discover", "studio", "week", "shops", "trends", "cookbook"] as const;
export type View = typeof VIEWS[number];
export const AVOID_CHOICES = ["soy", "wheat", "gluten", "milk", "egg", "sesame", "oats", "fish", "crustacean", "peanut", "tree-nut", "celery", "mustard", "lupin", "mollusc", "sulphites"] as const;
const DIETS = ["balanced", "vegetarian", "vegan", "gluten-free", "dairy-free"];
const HEATS = ["gentle", "mild", "medium", "hot", "fiery"];
const PACES = ["", "quick", "morning", "lunch", "long"];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown, max = 1000): value is string[] => Array.isArray(value) && value.length <= max && value.every((item) => typeof item === "string" && item.length <= 4000);
const finite = (value: unknown, max = 1e9) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;

export function parseView(value: unknown): View | null {
  return typeof value === "string" && (VIEWS as readonly string[]).includes(value) ? value as View : null;
}

export function readMealPreferences(value: unknown): MealPreferences | null {
  if (!record(value) || !DIETS.includes(String(value.diet)) || !HEATS.includes(String(value.spiceHeat)) || !PACES.includes(String(value.cookPace)) || !Number.isInteger(value.servings) || (value.servings as number) < 1 || (value.servings as number) > 12 || typeof value.pantry !== "string" || value.pantry.length > 8000) return null;
  return { diet: value.diet as DietId, spiceHeat: value.spiceHeat as SpiceHeat, servings: value.servings as number, cookPace: value.cookPace as CookPace | "", pantry: value.pantry };
}

export function validRecipeSnapshot(value: unknown): value is Recipe {
  if (!record(value)) return false;
  for (const field of ["id", "classicId", "regionId", "title", "description", "fusionNote"]) if (typeof value[field] !== "string" || (value[field] as string).length > 20000) return false;
  if (!DIETS.includes(String(value.diet)) || !HEATS.includes(String(value.spiceHeat)) || !Number.isInteger(value.servings) || (value.servings as number) < 1 || (value.servings as number) > 12) return false;
  if (![value.prepMinutes, value.cookMinutes, value.totalMinutes].every((item) => finite(item, 100000))) return false;
  if (![value.equipment, value.tags, value.allergens, value.dietaryNotes].every((item) => strings(item))) return false;
  if (value.sourceLabel !== "Template-generated · not kitchen-tested") return false;
  if (!Array.isArray(value.ingredients) || !value.ingredients.length || value.ingredients.length > 200 || !value.ingredients.every((item) => record(item) && typeof item.id === "string" && typeof item.name === "string" && typeof item.unit === "string" && typeof item.category === "string" && finite(item.amount) && strings(item.allergens) && typeof item.inPantry === "boolean")) return false;
  if (!Array.isArray(value.steps) || !value.steps.length || value.steps.length > 200 || !value.steps.every((item) => record(item) && typeof item.title === "string" && typeof item.detail === "string" && item.detail.length <= 20000)) return false;
  for (const key of ["safetyNote", "sessionNote", "cleanSummary"]) if (value[key] !== undefined && (typeof value[key] !== "string" || (value[key] as string).length > 20000)) return false;
  if (value.safetySource !== undefined && (typeof value.safetySource !== "string" || !/^https:\/\/[^\s]+$/.test(value.safetySource))) return false;
  if (value.methodNotes !== undefined && !strings(value.methodNotes, 100)) return false;
  if (value.cleanStats !== undefined && (!record(value.cleanStats) || !Object.values(value.cleanStats).every((item) => finite(item)))) return false;
  if (!value.ingredients.every((item) => record(item) && (item.aliases === undefined || strings(item.aliases, 100)) && (item.notes === undefined || typeof item.notes === "string"))) return false;
  const recordedAllergens = new Set((value.allergens as string[]).map(canonAllergen));
  if (value.ingredients.some((item) => (item.allergens as string[]).some((allergen) => !recordedAllergens.has(canonAllergen(allergen))))) return false;
  if (!value.steps.every((item) => record(item) && (item.minutes === undefined || finite(item.minutes, 100000)))) return false;
  if (value.kind !== undefined && value.kind !== "meal" && value.kind !== "classic") return false;
  if (value.components !== undefined && (!record(value.components) || !["main", "side", "vegetables", "sauce"].every((key) => typeof (value.components as Record<string, unknown>)[key] === "string"))) return false;
  if (value.kind === "meal" && (![value.mainId, value.methodId, value.sideId].every((item) => typeof item === "string") || !record(value.components) || !["main", "side", "vegetables", "sauce"].every((key) => typeof (value.components as Record<string, unknown>)[key] === "string"))) return false;
  return true;
}

export function validSaved(value: unknown): value is SavedRecipe {
  return record(value) && typeof value.notes === "string" && value.notes.length <= 20000 && typeof value.savedAt === "string" && Number.isFinite(Date.parse(value.savedAt)) && typeof value.tested === "boolean" && Number.isInteger(value.rating) && (value.rating as number) >= 0 && (value.rating as number) <= 5 && validRecipeSnapshot(value.recipe) && (value.token === undefined || (typeof value.token === "string" && value.token.length <= 20000));
}

/** Ignore incomplete/corrupt sessions rather than crashing or claiming applied filters. */
export function readPlanSession(value: unknown): { plan: WeekPlan; brief: PlanBrief; locks: number[] } | null {
  if (!record(value) || !record(value.plan) || !record(value.brief)) return null;
  const plan = value.plan, brief = value.brief;
  if (!DIETS.includes(String(brief.diet)) || !HEATS.includes(String(brief.spiceHeat)) || !Number.isInteger(brief.days) || (brief.days as number) < 1 || (brief.days as number) > 14 || !Number.isInteger(brief.servings) || (brief.servings as number) < 1 || (brief.servings as number) > 12 || typeof brief.pantry !== "string" || !strings(brief.avoidAllergens, 30) || !strings(brief.dislikes, 40)) return null;
  if (!Array.isArray(plan.days) || plan.days.length !== brief.days || !plan.days.every((day, index) => record(day) && day.day === index + 1 && (day.recipe === null || validRecipeSnapshot(day.recipe)) && (day.reason === undefined || typeof day.reason === "string") && Array.isArray(day.options) && day.options.length <= 20 && day.options.every((option) => record(option) && [option.classicId, option.regionId, option.title].every((item) => typeof item === "string")))) return null;
  if (!Array.isArray(plan.shopping) || plan.shopping.length > 1500 || !plan.shopping.every((line) => record(line) && [line.id, line.name, line.unit, line.category].every((item) => typeof item === "string") && finite(line.amount) && strings(line.allergens) && Array.isArray(line.days) && line.days.every((day) => Number.isInteger(day) && day >= 1 && day <= (brief.days as number)))) return null;
  if (!strings(plan.notes) || !Array.isArray(plan.unfilledDays) || !plan.unfilledDays.every((day) => Number.isInteger(day) && day >= 1 && day <= (brief.days as number)) || plan.sourceLabel !== "Template-generated · not kitchen-tested") return null;
  const safeBrief: PlanBrief = { days: brief.days as number, servings: brief.servings as number, diet: brief.diet as DietId, spiceHeat: brief.spiceHeat as SpiceHeat, pantry: brief.pantry, avoidAllergens: [...brief.avoidAllergens], dislikes: [...brief.dislikes], clean: normalizeCleanPrefs(record(brief.clean) ? brief.clean : {}) };
  const candidate = plan as unknown as WeekPlan;
  if (candidate.days.some((day) => day.recipe && recipeConflicts(day.recipe, safeBrief).length)) return null;
  if (candidate.days.some((day) => day.recipe && (day.recipe.servings !== safeBrief.servings || day.recipe.spiceHeat !== safeBrief.spiceHeat || day.recipe.diet !== safeBrief.diet))) return null;
  return { plan: { ...candidate, shopping: shoppingForDinners(candidate.days), unfilledDays: candidate.days.filter((day) => !day.recipe).map((day) => day.day) }, brief: safeBrief, locks: Array.isArray(value.locks) ? [...new Set(value.locks.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= candidate.days.length))] : [] };
}

export function planBriefKey(brief: PlanBrief | null): string {
  if (!brief) return "";
  return JSON.stringify([brief.days, brief.servings, brief.diet || "balanced", brief.spiceHeat || "medium", typeof brief.pantry === "string" ? brief.pantry.trim() : brief.pantry, [...(brief.avoidAllergens || [])].sort(), [...(brief.dislikes || [])].map((item) => item.trim().toLowerCase()).sort(), Object.entries(normalizeCleanPrefs(brief.clean)).filter(([, value]) => value).sort()]);
}

export function recipeConflicts(recipe: Recipe, brief: Pick<WeekPlanInput, "diet" | "avoidAllergens" | "dislikes">): string[] {
  const problems: string[] = [];
  const avoid = new Set((brief.avoidAllergens || []).map(canonAllergen));
  const allergens = [...new Set([...recipe.allergens, ...recipe.ingredients.flatMap((item) => item.allergens)].map(canonAllergen))];
  for (const allergen of allergens) if (avoid.has(allergen) || (avoid.has("gluten") && ["wheat", "oats", "barley", "rye"].includes(allergen))) problems.push(`Contains ${allergen}`);
  if (brief.diet === "vegan" && recipe.diet !== "vegan") problems.push("Not a vegan recipe");
  if (brief.diet === "vegetarian" && !["vegan", "vegetarian"].includes(recipe.diet)) problems.push("Not a vegetarian recipe");
  if (brief.diet === "gluten-free" && allergens.some((item) => ["wheat", "oats", "barley", "rye", "gluten"].includes(item))) problems.push("Contains gluten ingredients");
  if (brief.diet === "dairy-free" && allergens.includes("milk")) problems.push("Contains milk");
  for (const dislike of brief.dislikes || []) if (recipe.ingredients.some((item) => [item.name, ...(item.aliases || [])].some((name) => foodWordHit(name, dislike)))) problems.push(`Includes ${dislike}`);
  return [...new Set(problems)];
}

export function importCookbook(raw: string, existing: SavedRecipe[]): SavedRecipe[] {
  if (raw.length > 8_000_000) throw new Error("That cookbook is too large. Import a file under 8 MB.");
  let entries: unknown;
  try { entries = JSON.parse(raw); } catch { throw new Error("That file is not a readable cookbook JSON export."); }
  if (!Array.isArray(entries) || !entries.length || entries.length > 100 || !entries.every(validSaved)) throw new Error("Choose a Fusion Table cookbook export with 1–100 complete recipes. Your existing cookbook has not changed.");
  const byId = new Map(existing.map((entry) => [cookingRecipeKey(entry.recipe), entry]));
  for (const entry of entries) if (!byId.has(cookingRecipeKey(entry.recipe))) byId.set(cookingRecipeKey(entry.recipe), entry);
  if (byId.size > 100) throw new Error("The combined cookbook exceeds 100 recipes. Export a backup and make room first.");
  return [...byId.values()];
}
