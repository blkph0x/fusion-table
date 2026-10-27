import type { Recipe } from "./recipe-types.ts";
import { recipeFromShare, type ShareSpec } from "./share-recipe.ts";

/** The card, its image and its opened recipe share one fixed featured template. */
export const CLASSIC_INSPIRATIONS = [
  { classicId: "pasta", regionId: "japanese", title: "Miso mushroom pasta", pairing: "Italy meets Japan", description: "Vegetarian pasta with miso and mushrooms.", image: "/images/fusion-table-hero.png", diet: "vegetarian", servings: 2, spiceHeat: "medium" },
  { classicId: "tacos", regionId: "korean", title: "Seoul-inspired tacos", pairing: "Mexico meets Korea", description: "Korean-style seasoning on a taco.", image: "/images/korean-tacos.png", diet: "vegan", servings: 2, spiceHeat: "medium" },
  { classicId: "roast", regionId: "moroccan", title: "A Moroccan-style roast", pairing: "Sunday roast meets Morocco", description: "A tray roast with Moroccan-style spices.", image: "/images/moroccan-traybake.png", diet: "vegan", servings: 2, spiceHeat: "medium" },
] as const;

export type ClassicInspiration = typeof CLASSIC_INSPIRATIONS[number];

export function classicInspirationSpec(item: ClassicInspiration): ShareSpec {
  return { v: 1, kind: "classic", classicId: item.classicId, regionId: item.regionId, diet: item.diet, servings: item.servings, spiceHeat: item.spiceHeat };
}

export function openClassicInspiration(item: ClassicInspiration): { recipe: Recipe; spec: ShareSpec } {
  const spec = classicInspirationSpec(item);
  const recipe = recipeFromShare(spec);
  // Keep the visible card name on the opened view; cooking content remains the
  // authored template represented by its image/share spec, with no seeded finish.
  return { spec, recipe: { ...recipe, title: item.title } };
}
