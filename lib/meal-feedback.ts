import { cookingRecipeKey } from "./recipe-identity.ts";
import { canonAllergen } from "./staples.ts";
import type { Recipe } from "./recipe-types.ts";

export const FEEDBACK_CATEGORIES = [
  { id: "too-salty", label: "Too salty" }, { id: "too-spicy", label: "Too spicy" },
  { id: "bland", label: "Bland" }, { id: "texture", label: "Texture" },
  { id: "timing", label: "Timing" }, { id: "quantities", label: "Quantities" },
  { id: "unclear-steps", label: "Unclear steps" }, { id: "bad-combination", label: "Ingredients do not work together" },
  { id: "unavailable", label: "Ingredient unavailable" }, { id: "cost", label: "Cost" },
  { id: "undercooked", label: "Cooking doneness concern" }, { id: "allergen-info", label: "Allergen information concern" },
  { id: "other", label: "Something else" },
] as const;
export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number]["id"];
export type FeedbackExperience = "cooked" | "would-try";
export type FeedbackSeverity = "minor" | "major" | "critical";
export const FEEDBACK_RECIPE_VERSION = "content-v1" as const;
export interface MealFeedback {
  recipeKey: string;
  categories: FeedbackCategory[];
  severity: FeedbackSeverity;
  note: string;
  ingredientId?: string;
  stepIndex?: number;
}
export interface FeedbackReasonCount {
  category: FeedbackCategory;
  label: string;
  count: number;
  cookedDevices: number;
  previewDevices: number;
  severeDevices: number;
}
export interface RecipeFeedbackSummary {
  recipeKey: string;
  recipeVersion: typeof FEEDBACK_RECIPE_VERSION;
  cookedDevices: number;
  previewDevices: number;
  starAverage: number | null;
  lowCookedDevices: number;
  reasonCounts: FeedbackReasonCount[];
  confidence: "none" | "small-sample" | "growing" | "established";
  rankAdjustment: number;
  requiresReview: boolean;
}

/** Compact, browser-safe exact cooking identity. It is grouping, not authentication. */
export function feedbackRecipeKey(recipe: Recipe): string {
  // A seed is provenance. Identical actual food must not fork feedback just because it was redrawn.
  const text = cookingRecipeKey({ ...recipe, id: recipe.id.replace(/-sat--?\d+$/, "") }) + JSON.stringify([
    recipe.kind ?? "classic", recipe.classicId, recipe.regionId, recipe.diet, recipe.spiceHeat,
    recipe.mainId ?? "", recipe.methodId ?? "", recipe.sideId ?? "",
  ]);
  const hashes = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const primes = [0x01000193, 0x85ebca77, 0xc2b2ae3d, 0x27d4eb2f];
  for (let index = 0; index < text.length; index++) for (let lane = 0; lane < hashes.length; lane++) {
    hashes[lane] = Math.imul(hashes[lane] ^ text.charCodeAt(index), primes[lane]);
  }
  return `recipe:v1:${hashes.map((hash) => (hash >>> 0).toString(16).padStart(8, "0")).join("")}`;
}

export function isFeedbackRecipe(value: unknown): value is Recipe {
  // Kept independent of the planner/session modules: planner ranking consumes this helper too.
  const record = (item: unknown): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item);
  const text = (item: unknown, max = 20000): item is string => typeof item === "string" && item.length <= max;
  const strings = (item: unknown, max = 1000): item is string[] => Array.isArray(item) && item.length <= max && item.every((entry) => text(entry, 4000));
  const number = (item: unknown, max = 100000): item is number => typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= max;
  if (!record(value)) return false;
  if (!["id", "title", "classicId", "regionId", "description", "fusionNote"].every((field) => text(value[field]))) return false;
  if (!text(value.id, 500) || !value.id || !["balanced", "vegetarian", "vegan", "gluten-free", "dairy-free"].includes(String(value.diet)) ||
      !["gentle", "mild", "medium", "hot", "fiery"].includes(String(value.spiceHeat)) || !Number.isInteger(value.servings) || (value.servings as number) < 1 || (value.servings as number) > 12) return false;
  if (![value.prepMinutes, value.cookMinutes, value.totalMinutes].every((item) => number(item)) ||
      ![value.equipment, value.tags, value.allergens, value.dietaryNotes].every((item) => strings(item)) ||
      value.sourceLabel !== "Template-generated · not kitchen-tested") return false;
  if (!Array.isArray(value.ingredients) || !value.ingredients.length || value.ingredients.length > 200 || !value.ingredients.every((item) =>
      record(item) && text(item.id, 120) && item.id.length > 0 && text(item.name) && text(item.unit, 120) &&
      ["produce", "butcher", "fishmonger", "grocery", "specialty"].includes(String(item.category)) && number(item.amount, 1e9) &&
      typeof item.inPantry === "boolean" && strings(item.allergens) && (item.notes === undefined || text(item.notes)) &&
      (item.aliases === undefined || strings(item.aliases, 100)))) return false;
  if (new Set(value.ingredients.map((item) => item.id)).size !== value.ingredients.length) return false;
  const declared = new Set((value.allergens as string[]).map(canonAllergen));
  if (value.ingredients.some((item) => (item.allergens as string[]).some((allergen) => !declared.has(canonAllergen(allergen))))) return false;
  if (!Array.isArray(value.steps) || !value.steps.length || value.steps.length > 200 || !value.steps.every((item) => record(item) &&
      text(item.title) && text(item.detail) && (item.minutes === undefined || number(item.minutes)))) return false;
  if (!["safetyNote", "sessionNote", "cleanSummary"].every((field) => value[field] === undefined || text(value[field])) ||
      value.methodNotes !== undefined && !strings(value.methodNotes, 100)) return false;
  if (value.kind !== undefined && value.kind !== "classic" && value.kind !== "meal") return false;
  if (!["mainId", "methodId", "sideId"].every((field) => value[field] === undefined || text(value[field], 120))) return false;
  if (value.kind === "meal" && (![value.mainId, value.methodId, value.sideId].every((item) => text(item, 120)) ||
      !record(value.components) || !["main", "side", "vegetables", "sauce"].every((field) => text((value.components as Record<string, unknown>)[field])))) return false;
  return true;
}

export function feedbackText(value: unknown, max = 1000): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function feedbackExperience(value: unknown): FeedbackExperience | undefined {
  return value === "cooked" || value === "would-try" ? value : undefined;
}

/** Reject stale/cross-recipe references; never repair a malformed reason into a different reason. */
export function readMealFeedback(value: unknown, recipeKey: string,
  references?: { ingredientIds: readonly string[]; stepCount: number }): { feedback?: MealFeedback; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Choose at least one reason for this report." };
  const row = value as Record<string, unknown>;
  if (row.recipeKey !== undefined && row.recipeKey !== recipeKey) return { error: "This reason belongs to another recipe version. Choose the reason again." };
  if (!Array.isArray(row.categories) || !row.categories.length || row.categories.length > FEEDBACK_CATEGORIES.length ||
      row.categories.some((id) => !FEEDBACK_CATEGORIES.some((item) => item.id === id)) || new Set(row.categories).size !== row.categories.length) {
    return { error: "Choose a supported reason for this report." };
  }
  if (row.severity !== undefined && !["minor", "major", "critical"].includes(String(row.severity))) return { error: "Choose how much this affected the meal." };
  if (row.note !== undefined && typeof row.note !== "string") return { error: "Send the reason note as text." };
  const note = feedbackText(row.note);
  if (row.categories.includes("other") && note.replace(/\s/g, "").length < 8) return { error: "Add a few useful words about what went wrong when choosing Something else." };
  if (row.ingredientId !== undefined && (typeof row.ingredientId !== "string" || row.ingredientId.length > 120 ||
      (row.ingredientId !== "" && references && !references.ingredientIds.includes(row.ingredientId)))) return { error: "Choose an ingredient from this recipe version." };
  if (row.stepIndex !== undefined && (!Number.isInteger(row.stepIndex) || (row.stepIndex as number) < 0 || (row.stepIndex as number) >= 200 ||
      (references && (row.stepIndex as number) >= references.stepCount))) return { error: "Choose a step from this recipe version." };
  return { feedback: { recipeKey, categories: [...row.categories] as FeedbackCategory[], severity: (row.severity ?? "major") as FeedbackSeverity,
    note, ...(row.ingredientId ? { ingredientId: row.ingredientId as string } : {}),
    ...(row.stepIndex !== undefined ? { stepIndex: row.stepIndex as number } : {}) } };
}

export function requiresFeedback(stars: number | null, want: string, again: string): boolean {
  return stars !== null && stars <= 2 || want === "no" || again === "wont";
}
