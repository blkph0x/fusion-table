import type { Recipe, RecipeIngredient } from "./recipe-types.ts";

export const RECIPE_QUALITY_VERSION = "recipe-rules-v1";
export type QualityIssue = { code: string; severity: "error" | "warning"; message: string; ingredientId?: string; stepIndex?: number };
export interface RecipeQuality { version: string; score: number; passed: boolean; ingredientCount: number; issues: QualityIssue[] }

const DRY_STARCH = /\b(?:rice|pasta|noodles?|couscous|quinoa|bulgur|burghul|barley|sorghum|freekeh|farro|millet|polenta|fonio|buckwheat|teff|orzo|soba|vermicelli)\b/i;
const NOT_DRY_GRAIN = /\b(?:flour|starch|vinegar|miso|sauce|milk|cooked|ready.to.heat|ready.to.eat|microwave|canned|tinned|drained)\b/i;
function grams(item: RecipeIngredient): number | null {
  return item.unit === "g" ? item.amount : item.unit === "kg" ? item.amount * 1000 : null;
}
function oilMl(item: RecipeIngredient): number {
  if (!/\boil\b/i.test(item.name)) return 0;
  return item.amount * (item.unit === "tbsp" ? 20 : item.unit === "tsp" ? 5 : item.unit === "ml" ? 1 : 0);
}

/** Explicit, reviewable cooking rules. The score is a rule score, never a taste probability. */
export function assessRecipeQuality(recipe: Recipe): RecipeQuality {
  const issues: QualityIssue[] = [];
  const add = (code: string, severity: QualityIssue["severity"], message: string, extra: Partial<QualityIssue> = {}) => issues.push({ code, severity, message, ...extra });
  if (!Number.isInteger(recipe.servings) || recipe.servings < 1 || recipe.servings > 12) add("invalid-servings", "error", "The meal needs a usable whole-number serving count.");
  const people = Math.max(1, recipe.servings);
  if (!recipe.ingredients.length || !recipe.steps.length) add("missing-recipe", "error", "Ingredients and a complete method are required.");
  if (![recipe.prepMinutes, recipe.cookMinutes, recipe.totalMinutes].every(n => Number.isFinite(n) && n >= 0) || recipe.totalMinutes < recipe.prepMinutes + recipe.cookMinutes) add("inconsistent-time", "error", "Preparation and cooking estimates must reconcile with the total.");
  const ids = new Set<string>();
  let dryStarchGrams = 0, measuredOilMl = 0;
  for (const item of recipe.ingredients) {
    if (ids.has(item.id)) add("duplicate-ingredient-id", "error", "The same ingredient identity occurs twice in the shopping list.", { ingredientId: item.id });
    ids.add(item.id);
    if (!item.id || !item.name.trim() || !Number.isFinite(item.amount) || item.amount <= 0) add("invalid-portion", "error", "Every ingredient needs a named, positive finite portion.", { ingredientId: item.id });
    const mass = grams(item);
    if (mass != null && DRY_STARCH.test(item.name) && !NOT_DRY_GRAIN.test(`${item.name} ${item.notes ?? ""}`)) dryStarchGrams += mass;
    measuredOilMl += oilMl(item);
    if (/\b(?:dried|dry|uncooked|raw)\s+(?:red\s+)?kidney beans\b/i.test(item.name) && !/\b(?:canned|tinned|cooked)\b/i.test(item.name)) add("raw-kidney-beans", "error", "A short template cannot substitute raw dried kidney beans for cooked canned beans.", { ingredientId: item.id });
    if (/\b(?:cassava|yuca)\b/i.test(item.name) && !/\b(?:fully cooked|cooked|ready.to.reheat|ready.to.heat|commercially processed)\b/i.test(`${item.name} ${item.notes ?? ""}`)) add("unverified-cassava-form", "error", "This short cassava method requires a specified commercially processed fully cooked product.", { ingredientId: item.id });
    if (/\bwhole (?:chicken|turkey)\b/i.test(item.name) && ["", "each"].includes(item.unit) && !Number.isInteger(item.amount)) add("fractional-whole-bird", "error", "A whole-bird shopping quantity must be rounded to actual birds.", { ingredientId: item.id });
  }
  if (dryStarchGrams / people > 130) add("large-dry-starch-portion", "warning", "The combined dry grain/noodle/pasta portion is above 130 g per person; review the plate's starch balance.");
  // Purchased frying oil is not necessarily eaten; this is a review prompt, not nutrition advice.
  if (measuredOilMl / people > 50) add("large-oil-allocation", "warning", "More than 50 ml cooking/finishing oil per person is allocated; review whether the method needs this amount.");
  const liver = recipe.ingredients.find(item => /\blivers?\b/i.test(item.name));
  if (liver) recipe.steps.forEach((step, stepIndex) => {
    if (["Braise gently", "Simmer the main"].includes(step.title) && (step.minutes ?? 0) > 25) add("liver-long-braise", "error", "Delicate liver must not inherit a slow joint's long tenderising simmer.", { ingredientId: liver.id, stepIndex });
  });
  const shells = recipe.ingredients.find(item => item.id === "jumbo-shells");
  if (shells && recipe.classicId === "shotgun-shells") {
    const filling = recipe.ingredients.filter(item => ["sausage-meat", "white-beans", "cannellini-beans", "brown-onion"].includes(item.id)).reduce((n, item) => n + (grams(item) ?? 0), 0);
    if (filling / shells.amount > 45) add("overfilled-open-shells", "error", "The measured filling exceeds the open jumbo-shell capacity used by this template.", { ingredientId: shells.id });
  }
  // A boundary may finish a SEPARATE sauce before the main cooks. Only an
  // explicit later long cook of that finished sauce is a failure.
  const firstFinish = recipe.steps.findIndex(step => step.finishBoundary === true);
  if (firstFinish >= 0) recipe.steps.slice(firstFinish + 1).forEach((step, offset) => {
    if ((step.minutes ?? 0) > 20 && /\b(?:simmer|boil|bake|roast|smoke|fry|grill|braise)\b/i.test(step.detail) && /\b(?:return|put|transfer|add)\b.{0,80}\b(?:finished|freshly finished) sauce\b/i.test(step.detail)) add("long-cook-after-finish", "error", "A long cooking stage follows the delicate final seasoning.", { stepIndex: firstFinish + 1 + offset });
  });
  const errors = issues.filter(issue => issue.severity === "error").length;
  return { version: RECIPE_QUALITY_VERSION, score: Math.max(0, 100 - errors * 25 - (issues.length - errors) * 5), passed: errors === 0, ingredientCount: recipe.ingredients.length, issues };
}

export function assertRecipeQuality(recipe: Recipe): void {
  const result = assessRecipeQuality(recipe);
  if (!result.passed) throw new Error(`This template needs a cooking review: ${result.issues.filter(issue => issue.severity === "error").map(issue => issue.message).join(" ")}`);
}
