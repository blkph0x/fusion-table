import type { Recipe } from "./recipe-types.ts";

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** Synchronous browser-safe fingerprint for local deduplication, not authentication. */
function fingerprint(text: string): string {
  const hashes = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const primes = [0x01000193, 0x85ebca77, 0xc2b2ae3d, 0x27d4eb2f];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    for (let lane = 0; lane < hashes.length; lane += 1) {
      hashes[lane] = Math.imul(hashes[lane] ^ code, primes[lane]);
    }
  }
  return hashes.map((hash) => (hash >>> 0).toString(16).padStart(8, "0")).join("");
}

/**
 * Legacy ids describe broad template choices and can collide for cleaner variants.
 * Add the actual cooking content while leaving the generator's public id intact.
 * Pantry ownership, display labels and generation provenance do not fork a save.
 */
export function cookingRecipeKey(recipe: Recipe): string {
  const ingredients = recipe.ingredients.map((item) => [
    item.id, item.name, item.amount, item.unit, item.notes ?? "", sortedUnique(item.allergens),
  ]);
  // Ingredient-list order is presentation; step order is part of the method.
  ingredients.sort((left, right) => {
    const a = JSON.stringify(left), b = JSON.stringify(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const content = JSON.stringify({
    v: 1,
    servings: recipe.servings,
    ingredients,
    steps: recipe.steps.map((step) => [step.title, step.detail, step.minutes ?? null]),
    equipment: sortedUnique(recipe.equipment),
    allergens: sortedUnique(recipe.allergens),
    timing: [recipe.prepMinutes, recipe.cookMinutes, recipe.totalMinutes],
    safety: recipe.safetyNote ?? "",
    session: recipe.sessionNote ?? "",
    methodNotes: recipe.methodNotes ?? [],
  });
  return `${recipe.id}-content-v1-${fingerprint(content)}`;
}
