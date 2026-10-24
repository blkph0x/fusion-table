import type { CleanPrefs } from "./clean-prefs.ts";

export type IngredientCategory = "produce" | "butcher" | "fishmonger" | "grocery" | "specialty";
export type DietId = "balanced" | "vegetarian" | "vegan" | "gluten-free" | "dairy-free";
/** Gentle and fiery sit outside the original three. Mild, medium and hot amounts stay put. */
export const SPICE_HEATS = ["gentle", "mild", "medium", "hot", "fiery"] as const;
export type SpiceHeat = (typeof SPICE_HEATS)[number];

export function isSpiceHeat(value: unknown): value is SpiceHeat {
  return typeof value === "string" && (SPICE_HEATS as readonly string[]).includes(value);
}

/** Classic and barbecue chilli flakes. Mild, medium and hot stay 0, 0.25 and 0.75. */
export function classicChilliAmount(heat: SpiceHeat): number {
  if (heat === "gentle") return 0;
  if (heat === "fiery") return 1.25;
  return { mild: 0, medium: 0.25, hot: 0.75 }[heat];
}

/** Paste amounts. The mild, medium and hot numbers are returned unchanged. */
export function pasteHeatAmount(
  heat: SpiceHeat,
  steps: { readonly mild: number; readonly medium: number; readonly hot: number },
  gentle: number,
  fiery: number,
): number {
  if (heat === "gentle") return gentle;
  if (heat === "fiery") return fiery;
  return steps[heat];
}
/** Omitted keeps the authored timing. Set only adds a schedule note. */
export type CookPace = "quick" | "morning" | "lunch" | "long";

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
  aliases?: string[];
}

export interface RecipeStep {
  title: string;
  detail: string;
  minutes?: number;
}

/** Extra rules stacked on the single diet choice. They tighten a recipe; they never relax it. */
export interface RecipeConstraints {
  vegan?: boolean;
  vegetarian?: boolean;
  dairyFree?: boolean;
  glutenFree?: boolean;
  eggFree?: boolean;
}

export interface RecipeInput {
  classicId: string;
  regionId: string;
  servings: number;
  diet?: DietId;
  spiceHeat?: SpiceHeat;
  pantry?: string | string[];
  /** Soft cleaner-meal knobs. Never relax hard exclusions. */
  clean?: CleanPrefs;
  constraints?: RecipeConstraints;
  /** Omitted keeps the authored template. Set adds one seeded SAT finish. */
  seed?: number;
  /**
   * Omitted keeps the authored timing, including the recipe id.
   * Set adds a schedule note only. It does not drop a thermometer endpoint.
   */
  cookPace?: CookPace;
  avoidAllergens?: string[];
  dislikes?: string[];
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
  /** Present only when the caller asked for a cook session. */
  cookPace?: CookPace;
  sessionNote?: string;
  kind?: "classic" | "meal";
  mainId?: string;
  methodId?: string;
  sideId?: string;
  components?: { main: string; side: string; vegetables: string; sauce: string };
  generation?: "authored";
  methodNotes?: string[];
  /** Soft clean-plate summary when cleaner prefs were applied. */
  cleanSummary?: string;
  cleanStats?: {
    ingredientCount: number;
    bottleCount: number;
    stepCount: number;
    produceCount: number;
    equipmentCount: number;
    score: number;
  };
}
