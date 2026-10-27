import type { Recipe } from "./recipe-types.ts";
import { decodeShare, shareSpecMatchesRecipe, specFromRecipe, type ShareSpec } from "./share-recipe.ts";

/** Open the plate the visitor actually clicked; household adaptations require an explicit remix. */
export function openFeaturedRecipe(recipe: Recipe, token?: string): { recipe: Recipe; spec: ShareSpec } {
  const spec = token ? decodeShare(token) : specFromRecipe(recipe);
  if (!shareSpecMatchesRecipe(spec, recipe)) throw new Error("This featured plate could not be opened exactly. Refresh Discover and choose it again.");
  return { recipe, spec };
}
