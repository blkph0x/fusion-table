import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CLASSICS, REGIONS, generateRecipe } from "../lib/recipes.ts";
import { generateMeal } from "../lib/meals.ts";
import { PLATES } from "../lib/plates.ts";
import type { DietId, Recipe, RecipeConstraints } from "../lib/recipe-types.ts";

const variants: { id: string; diet: DietId; constraints?: RecipeConstraints }[] = [
  { id: "balanced", diet: "balanced" },
  { id: "vegetarian", diet: "vegetarian" },
  { id: "vegan", diet: "vegan" },
  { id: "gluten-free", diet: "gluten-free" },
  { id: "dairy-free", diet: "dairy-free" },
  { id: "vegan-gf", diet: "vegan", constraints: { glutenFree: true } },
  { id: "vegetarian-gf", diet: "vegetarian", constraints: { glutenFree: true } },
  { id: "dairy-free-gf", diet: "dairy-free", constraints: { glutenFree: true } },
  { id: "vegetarian-df", diet: "vegetarian", constraints: { dairyFree: true } },
  { id: "vegetarian-df-gf", diet: "vegetarian", constraints: { dairyFree: true, glutenFree: true } },
];

const templates = [];

function pushTemplate(recipe: Recipe, variantId: string, kind: "classic" | "meal", anchorId: string) {
  templates.push({
    classicId: recipe.classicId,
    regionId: recipe.regionId,
    variant: variantId,
    kind,
    anchorId,
    title: recipe.title,
    description: recipe.description,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    steps: recipe.steps.map((step, index) => `${index + 1}. ${step.title}. ${step.detail}`),
    safetyNote: recipe.safetyNote ?? "",
    notes: recipe.dietaryNotes,
    ingredients: recipe.ingredients.map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      allergens: item.allergens,
      aliases: item.aliases ?? [],
      notes: item.notes ?? "",
    })),
  });
}

for (const variant of variants) {
  for (const classic of CLASSICS) {
    for (const region of REGIONS) {
      const recipe = generateRecipe({
        classicId: classic.id,
        regionId: region.id,
        servings: 4,
        diet: variant.diet,
        spiceHeat: "medium",
        constraints: variant.constraints,
      });
      pushTemplate(recipe, variant.id, "classic", classic.id);
    }
  }
  for (const plate of PLATES) {
    try {
      const meal = generateMeal({
        mainId: plate.mainId,
        methodId: plate.methodId,
        regionId: plate.regionId,
        sideId: plate.sideId,
        servings: 4,
        diet: variant.diet,
        spiceHeat: "medium",
        constraints: variant.constraints,
      });
      pushTemplate(meal, variant.id, "meal", plate.mainId);
    } catch {
      // The selected main does not fit this diet. It is skipped, not replaced.
    }
  }
}

const catalog = {
  source: "fusion-table",
  heat: "medium",
  yieldServings: 4,
  notice: "Template-generated, not kitchen-tested. Not a live model. No shelf prices. Regional staples are included. Check the packet.",
  templates,
};

const target = resolve(process.argv[2] ?? "examples/mealplanner-catalog.json");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(catalog));
const meals = templates.filter((template) => template.kind === "meal").length;
console.log(`${templates.length} templates (${meals} ingredient meals) -> ${target}`);
