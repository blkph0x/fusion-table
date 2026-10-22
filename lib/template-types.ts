import type { DietId, RecipeIngredient, RecipeInput, RecipeStep, SpiceHeat } from "./recipe-types.ts";

/** Four-serving authored quantities; the public generator scales them once. */
export type DraftIngredient = Omit<RecipeIngredient, "inPantry"> & { aliases?: string[] };

export interface Profile {
  title: string;
  tags: string[];
  warm: DraftIngredient[];
  finish: DraftIngredient[];
  note: string;
}

export interface RecipeContext {
  input: Required<Pick<RecipeInput, "classicId" | "regionId" | "servings">> & { diet: DietId; spiceHeat: SpiceHeat };
  vegan: boolean;
  vegetarian: boolean;
  dairyFree: boolean;
  glutenFree: boolean;
  /** Tightens only. Older callers omit it; that means eggs are still allowed. */
  eggFree?: boolean;
  profile: Profile;
}

export interface BaseRecipe {
  name: string;
  description: string;
  ingredients: DraftIngredient[];
  steps: RecipeStep[];
  prep: number;
  cook: number;
  equipment: string[];
  meat?: boolean;
  safetyNote?: string;
  safetySource?: string;
  dietaryNotes?: string[];
  methodNotes?: string[];
}
