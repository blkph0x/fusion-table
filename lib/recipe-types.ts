export type IngredientCategory = "produce" | "butcher" | "fishmonger" | "grocery" | "specialty";
export type DietId = "balanced" | "vegetarian" | "vegan" | "gluten-free" | "dairy-free";
export type SpiceHeat = "mild" | "medium" | "hot";

export interface RecipeOption {
  id: string;
  name: string;
  description: string;
  emoji?: string;
  origin?: string;
}

export interface RecipeIngredient {
  id: string;
  name: string;
  amount: number;
  unit: string;
  category: IngredientCategory;
  inPantry: boolean;
  notes?: string;
  allergens: string[];
}

export interface RecipeStep {
  title: string;
  detail: string;
  minutes?: number;
}

export interface RecipeInput {
  classicId: string;
  regionId: string;
  servings: number;
  diet?: DietId;
  spiceHeat?: SpiceHeat;
  pantry?: string | string[];
}

export interface Recipe {
  id: string;
  classicId: string;
  regionId: string;
  title: string;
  description: string;
  fusionNote: string;
  prepMinutes: number;
  cookMinutes: number;
  totalMinutes: number;
  servings: number;
  diet: DietId;
  spiceHeat: SpiceHeat;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  equipment: string[];
  tags: string[];
  allergens: string[];
  dietaryNotes: string[];
  sourceLabel: "Template-generated · not kitchen-tested";
  safetyNote?: string;
  safetySource?: string;
  kind?: "classic" | "meal";
  mainId?: string;
  methodId?: string;
  sideId?: string;
  components?: { main: string; side: string; vegetables: string; sauce: string };
  generation?: "authored";
  methodNotes?: string[];
}
