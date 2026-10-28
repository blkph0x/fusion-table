import { getCut } from "./cuts.ts";
import type { Recipe } from "./recipe-types.ts";

/** Keep the chosen shopping cut visible when the dish title names only its main. */
export function chosenCutLabel(recipe: Pick<Recipe, "generationInput">): string | null {
  const id = recipe.generationInput?.cutId;
  return id ? getCut(id)?.shoppingName ?? null : null;
}
