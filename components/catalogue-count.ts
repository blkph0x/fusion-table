import type { DietId } from "../lib/recipe-types.ts";
import { DIETS, CLASSICS, REGIONS } from "../lib/recipes.ts";
import { getMainsForDiet, MEAL_REGIONS, MEAL_SIDES, getMealCombinationCount, cutsForMethod } from "../lib/meals.ts";
export function catalogueCounts() {
  const dietaryRows = DIETS.reduce((total, diet) => total + getMainsForDiet(diet.id as DietId).reduce((sum, main) => sum + main.methodIds.reduce((n, method) => n + 1 + cutsForMethod(main.id, method).length, 0), 0), 0);
  const classicVariants = CLASSICS.length * REGIONS.length * DIETS.length;
  return { authoredCombinations: dietaryRows * MEAL_REGIONS.length * MEAL_SIDES.length + classicVariants, balancedMealCombinations: getMealCombinationCount(), classicDishes: CLASSICS.length, classicVariants, regions: MEAL_REGIONS.length, sides: MEAL_SIDES.length, diets: DIETS.length };
}
