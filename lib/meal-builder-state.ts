import { cutsForMethod } from "./cut-method.ts";
import { MEAT_CUTS } from "./cuts.ts";
import { MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SIDES, getMethodsForMain } from "./meal-catalog.ts";
import type { Recipe } from "./recipe-types.ts";

/** Pending meal choices are separate from the completed recipe and household preferences. */
export interface MealBuilderDraft {
  mainId: string;
  methodId: string;
  regionId: string;
  sideId: string;
  cutId: string;
}

export function normalizeMealBuilderDraft(value: unknown): MealBuilderDraft {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const mainId = typeof raw.mainId === "string" && MAIN_INGREDIENTS.some((main) => main.id === raw.mainId) ? raw.mainId : "";
  const methodId = typeof raw.methodId === "string" && mainId && getMethodsForMain(mainId).some((method) => method.id === raw.methodId) ? raw.methodId : "";
  const regionId = typeof raw.regionId === "string" && MEAL_REGIONS.some((region) => region.id === raw.regionId) ? raw.regionId : "japanese";
  const sideId = typeof raw.sideId === "string" && MEAL_SIDES.some((side) => side.id === raw.sideId) ? raw.sideId : "rice-greens";
  const cutId = typeof raw.cutId === "string" && mainId && methodId && cutsForMethod(mainId, methodId).some((cut) => cut.id === raw.cutId) ? raw.cutId : "";
  return { mainId, methodId, regionId, sideId, cutId };
}

export function mealDraftFromRecipe(recipe: Recipe | null | undefined): MealBuilderDraft | null {
  if (recipe?.kind !== "meal") return null;
  // Old saved meals can predate generationInput but encode an explicit cut in their id.
  const legacyCut = !recipe.generationInput?.cutId ? MEAT_CUTS.find((cut) => cut.mainId === recipe.mainId && new RegExp(`-${cut.id}(?:-clean)?(?:-pace-(?:quick|morning|lunch|long))?(?:-sat-\\d+)?$`).test(recipe.id))?.id : undefined;
  return normalizeMealBuilderDraft({ mainId: recipe.mainId, methodId: recipe.methodId, regionId: recipe.regionId, sideId: recipe.sideId, cutId: recipe.generationInput?.cutId || legacyCut || "" });
}

/** Re-entering the studio must resume pending choices ahead of the last completed plate. */
export function restoreMealBuilderDraft(initialDraft: MealBuilderDraft | undefined, initialRecipe: Recipe | null | undefined, remembered?: unknown): MealBuilderDraft {
  return normalizeMealBuilderDraft(initialDraft || mealDraftFromRecipe(initialRecipe) || remembered);
}

/** A pending regional choice must never be labelled with the previous plate's ingredients. */
export function mealDraftMatchesRecipe(draft: MealBuilderDraft | null | undefined, recipe: Recipe | null | undefined): boolean {
  const made = mealDraftFromRecipe(recipe);
  if (!made) return false;
  return !draft || (Object.keys(made) as (keyof MealBuilderDraft)[]).every((key) => draft[key] === made[key]);
}
