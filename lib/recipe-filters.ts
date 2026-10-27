import { foodWordHit } from "./food-words.ts";
import { canonAllergen } from "./staples.ts";
import type { Recipe } from "./recipe-types.ts";

export const SUPPORTED_ALLERGENS = [
  "soy", "wheat", "gluten", "milk", "egg", "sesame", "oats", "barley", "rye", "fish", "crustacean", "peanut", "tree-nut",
  "celery", "mustard", "mollusc", "sulphites", "lupin",
] as const;
const SUPPORTED = new Set<string>(SUPPORTED_ALLERGENS);

export interface RecipeFilters {
  avoidAllergens?: string[];
  dislikes?: string[];
}

/** Validate before building a recipe; hard exclusions are never silently dropped. */
export function normalizeRecipeFilters(input: RecipeFilters): Required<RecipeFilters> {
  if (input.avoidAllergens !== undefined && (!Array.isArray(input.avoidAllergens) || input.avoidAllergens.length > SUPPORTED.size || input.avoidAllergens.some((name) => typeof name !== "string" || !SUPPORTED.has(canonAllergen(name))))) {
    throw new Error("Use supported allergen names.");
  }
  if (input.dislikes !== undefined && (!Array.isArray(input.dislikes) || input.dislikes.length > 40 || input.dislikes.some((name) => typeof name !== "string" || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)))) {
    throw new Error("List up to 40 dislikes as ingredient names of 80 characters or fewer.");
  }
  return {
    avoidAllergens: [...new Set((input.avoidAllergens ?? []).map(canonAllergen))],
    dislikes: [...new Set((input.dislikes ?? []).map((name) => name.trim().replace(/\s+/g, " ")).filter(Boolean))],
  };
}

/** Check the complete plate, including its base, sides and seeded additions. */
export function assertRecipeFilters(recipe: Recipe, input: RecipeFilters): void {
  const filters = normalizeRecipeFilters(input);
  const allergens = new Set([...recipe.allergens, ...recipe.ingredients.flatMap((item) => item.allergens)].map(canonAllergen));
  const blocked = filters.avoidAllergens.find((name) => allergens.has(name) || (name === "gluten" && ["wheat", "barley", "rye", "oats"].some((grain) => allergens.has(grain))));
  if (blocked) throw new Error(`This plate contains the recorded allergen ${blocked}. Choose a different main, side or region.`);
  const disliked = recipe.ingredients.find((item) => filters.dislikes.some((token) => [item.name, ...(item.aliases ?? [])].some((name) => foodWordHit(name, token))));
  if (disliked) throw new Error(`This plate includes ${disliked.name}, which matches a hard dislike. Choose a different main, side or region.`);
}
