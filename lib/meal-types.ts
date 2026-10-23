import type { CookPace, DietId, Recipe, RecipeConstraints, SpiceHeat } from "./recipe-types.ts";

/** A main ingredient is never silently exchanged to satisfy a dietary preference. */
export interface MealInput {
  mainId: string;
  methodId: string;
  regionId: string;
  sideId?: string;
  servings: number;
  diet?: DietId;
  spiceHeat?: SpiceHeat;
  pantry?: string | string[];
  /** Extra tighten-only flags. They do not replace the selected main. */
  constraints?: RecipeConstraints;
  /**
   * Optional butcher cut. Omitted means the cooking method keeps its usual cut.
   * The recipe title stays the main ingredient; the shopping name uses the cut.
   */
  cutId?: string;
  /**
   * Omitted: the same choices always build the same template.
   * Set: a seeded SAT search chooses a finish. The same seed repeats it.
   * Filters passed with the seed are not relaxed.
   */
  seed?: number;
  /**
   * Omitted keeps the authored timing, including the recipe id.
   * Set adds a schedule note only.
   */
  cookPace?: CookPace;
  avoidAllergens?: string[];
  dislikes?: string[];
}

export interface NormalizedMealInput extends MealInput {
  sideId: string;
  diet: DietId;
  spiceHeat: SpiceHeat;
}

export interface MealRecipe extends Recipe {
  kind: "meal";
  mainId: string;
  methodId: string;
  sideId: string;
  components: { main: string; side: string; vegetables: string; sauce: string };
  generation: "authored";
}

export interface MealOption {
  id: string;
  name: string;
  description: string;
  emoji?: string;
}

export interface MainIngredientOption extends MealOption {
  emoji: string;
  category: "meat" | "seafood" | "plant" | "vegetarian";
  methodIds: readonly string[];
  /** Recognised names of the selected main, also useful to a model-output validator. */
  ingredientAliases: readonly string[];
}
