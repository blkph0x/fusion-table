import { normalizeCleanPrefs } from "./clean-prefs.ts";
import type { RecipeConstraints, RecipeGenerationInput } from "./recipe-types.ts";

/** Keep validated generation choices, never personal pantry quantities or ticks. */
export function rememberRecipeInput(input: Omit<RecipeGenerationInput, "v">): RecipeGenerationInput | undefined {
  const remembered: RecipeGenerationInput = { v: 1 };
  if (input.seed !== undefined) remembered.seed = input.seed;
  if (input.cookPace) remembered.cookPace = input.cookPace;
  if (input.cutId) remembered.cutId = input.cutId;
  const clean = normalizeCleanPrefs(input.clean);
  if (Object.keys(clean).length) remembered.clean = clean;
  const constraints: RecipeConstraints = {};
  for (const key of ["glutenFree", "dairyFree", "vegan", "vegetarian", "eggFree"] as const) {
    if (input.constraints?.[key] === true) constraints[key] = true;
  }
  if (Object.keys(constraints).length) remembered.constraints = constraints;
  if (input.avoidAllergens?.length) remembered.avoidAllergens = [...input.avoidAllergens];
  if (input.dislikes?.length) remembered.dislikes = [...input.dislikes];
  if (input.softenIngredients?.length) remembered.softenIngredients = [...input.softenIngredients];
  return Object.keys(remembered).length > 1 ? remembered : undefined;
}
