import { getCut, MEAT_CUTS } from "./cuts.ts";
import { CLEAN_KNOB_IDS, type CleanPrefs } from "./clean-prefs.ts";
import { COOKING_METHODS, MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SIDES, generateMeal } from "./meals.ts";
import type { MealInput } from "./meal-types.ts";
import { SPICE_HEATS, type CookPace, type DietId, type Recipe, type RecipeConstraints, type RecipeInput, type SpiceHeat } from "./recipe-types.ts";
import { isCookPace } from "./cook-pace.ts";
import { CLASSICS, DIETS, REGIONS, generateRecipe } from "./recipes.ts";
import { SUPPORTED_ALLERGENS } from "./recipe-filters.ts";
import { cookingRecipeKey } from "./recipe-identity.ts";

const DIET_IDS = new Set<DietId>(DIETS.map((item) => item.id as DietId));
const HEATS = new Set<SpiceHeat>(SPICE_HEATS);
const AVOID = new Set<string>(SUPPORTED_ALLERGENS);
const WORD = /^[\p{L}\p{N}][\p{L}\p{N} '()./-]{0,79}$/u;
const INGREDIENT_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
// Keep share URLs below common reverse-proxy request-line limits.
const MAX_SHARE_TOKEN_LENGTH = 7500;

export interface ShareSpec {
  v: 1;
  kind: "classic" | "meal";
  classicId?: string;
  mainId?: string;
  methodId?: string;
  sideId?: string;
  cutId?: string;
  regionId: string;
  diet: DietId;
  spiceHeat: SpiceHeat;
  servings: number;
  seed?: number;
  cookPace?: CookPace;
  clean?: CleanPrefs;
  softenIngredients?: string[];
  avoid?: string[];
  dislikes?: string[];
  glutenFree?: boolean;
  dairyFree?: boolean;
  vegan?: boolean;
  vegetarian?: boolean;
  eggFree?: boolean;
}

/** UTF-8 base64url. The browser bundle has no Node Buffer. */
function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(token: string): string {
  const padded = token.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (token.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

export function encodeShare(spec: ShareSpec): string {
  const clean = normaliseShare(spec);
  const token = encodeBase64Url(JSON.stringify(clean));
  if (token.length > MAX_SHARE_TOKEN_LENGTH) throw new Error("This recipe has too many options for a share link.");
  return token;
}

export function decodeShare(token: string): ShareSpec {
  if (typeof token !== "string" || token.length > MAX_SHARE_TOKEN_LENGTH || !/^[A-Za-z0-9_-]{8,}$/.test(token)) {
    throw new Error("This link is not a Fusion Table recipe.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64Url(token));
  } catch {
    throw new Error("This link is not a Fusion Table recipe.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("This link is not a Fusion Table recipe.");
  }
  return normaliseShare(parsed as ShareSpec);
}

export function recipeFromShare(spec: ShareSpec): Recipe {
  const clean = normaliseShare(spec);
  try {
    if (clean.kind === "meal") {
      const input: MealInput = {
        mainId: clean.mainId || "",
        methodId: clean.methodId || "",
        regionId: clean.regionId,
        sideId: clean.sideId,
        servings: clean.servings,
        diet: clean.diet,
        spiceHeat: clean.spiceHeat,
        ...(clean.cutId ? { cutId: clean.cutId } : {}),
        ...(clean.seed !== undefined ? { seed: clean.seed } : {}),
        ...(clean.cookPace ? { cookPace: clean.cookPace } : {}),
        ...(clean.clean ? { clean: clean.clean } : {}),
        ...(clean.softenIngredients?.length ? { softenIngredients: clean.softenIngredients } : {}),
        ...(clean.avoid?.length ? { avoidAllergens: clean.avoid } : {}),
        ...(clean.dislikes?.length ? { dislikes: clean.dislikes } : {}),
        ...(constraintsOf(clean) ? { constraints: constraintsOf(clean) } : {}),
      };
      return generateMeal(input);
    }
    const input: RecipeInput = {
      classicId: clean.classicId || "",
      regionId: clean.regionId,
      servings: clean.servings,
      diet: clean.diet,
      spiceHeat: clean.spiceHeat,
      ...(clean.seed !== undefined ? { seed: clean.seed } : {}),
      ...(clean.cookPace ? { cookPace: clean.cookPace } : {}),
      ...(clean.clean ? { clean: clean.clean } : {}),
      ...(clean.avoid?.length ? { avoidAllergens: clean.avoid } : {}),
      ...(clean.dislikes?.length ? { dislikes: clean.dislikes } : {}),
      ...(constraintsOf(clean) ? { constraints: constraintsOf(clean) } : {}),
    };
    return generateRecipe(input);
  } catch {
    throw new Error("This link is not a recipe Fusion Table can rebuild.");
  }
}

/**
 * A saved/imported snapshot may predate template fixes or carry an unrelated token.
 * Only offer a rebuilding link/PDF when it still represents that cooking content.
 * Display titles and private pantry ownership do not affect the comparison.
 */
export function shareSpecMatchesRecipe(spec: unknown, recipe: Recipe): boolean {
  try {
    return cookingRecipeKey(recipeFromShare(spec as ShareSpec)) === cookingRecipeKey(recipe);
  } catch {
    return false;
  }
}

/** Repeat retained cooking choices; legacy snapshots fall back to their ids. Pantry ticks stay private. */
export function specFromRecipe(recipe: Recipe, extra?: { avoid?: string[]; dislikes?: string[] }): ShareSpec {
  const remembered = recipe.generationInput?.v === 1 ? recipe.generationInput : undefined;
  if (!remembered && recipe.cleanSummary) {
    throw new Error("This saved cleaner recipe predates complete sharing. Download its recipe file to keep the original ingredients.");
  }
  const seedMatch = recipe.id.match(/-sat-(\d+)$/);
  const seed = remembered?.seed ?? (seedMatch ? Number(seedMatch[1]) : undefined);
  const paceMatch = recipe.id.match(/-pace-(quick|morning|lunch|long)(?:-|$)/);
  const cookPace = remembered?.cookPace ?? recipe.cookPace ?? (paceMatch && isCookPace(paceMatch[1]) ? paceMatch[1] : undefined);
  const flags = remembered?.constraints ?? constraintsFromId(recipe.id);
  const avoid = remembered?.avoidAllergens ?? extra?.avoid;
  const dislikes = remembered?.dislikes ?? extra?.dislikes;
  const common = {
    v: 1 as const,
    regionId: recipe.regionId,
    diet: recipe.diet,
    spiceHeat: recipe.spiceHeat,
    servings: recipe.servings,
    ...(seed !== undefined ? { seed } : {}),
    ...(cookPace ? { cookPace } : {}),
    ...(remembered?.clean ? { clean: remembered.clean } : {}),
    ...flags,
    ...(avoid?.length ? { avoid } : {}),
    ...(dislikes?.length ? { dislikes } : {}),
  };
  if (recipe.kind === "meal" && recipe.mainId && recipe.methodId && recipe.sideId) {
    const cutId = remembered?.cutId ?? MEAT_CUTS.find((cut) => cut.mainId === recipe.mainId && new RegExp(`-${cut.id}(?:-clean)?(?:-pace-(?:quick|morning|lunch|long))?(?:-sat-\\d+)?$`).test(recipe.id))?.id;
    return normaliseShare({ ...common, kind: "meal", mainId: recipe.mainId, methodId: recipe.methodId, sideId: recipe.sideId,
      ...(cutId ? { cutId } : {}),
      ...(remembered?.softenIngredients?.length ? { softenIngredients: remembered.softenIngredients } : {}),
    });
  }
  return normaliseShare({ ...common, kind: "classic", classicId: recipe.classicId });
}

function constraintsOf(spec: ShareSpec): RecipeConstraints | undefined {
  const constraints: RecipeConstraints = {};
  if (spec.glutenFree) constraints.glutenFree = true;
  if (spec.dairyFree) constraints.dairyFree = true;
  if (spec.vegan) constraints.vegan = true;
  if (spec.vegetarian) constraints.vegetarian = true;
  if (spec.eggFree) constraints.eggFree = true;
  return Object.keys(constraints).length ? constraints : undefined;
}

function constraintsFromId(id: string): Partial<ShareSpec> {
  const flags: Partial<ShareSpec> = {};
  if (/(?:^|-)gf(?:-|$)/.test(id)) flags.glutenFree = true;
  if (/(?:^|-)df(?:-|$)/.test(id)) flags.dairyFree = true;
  if (/(?:^|-)eggless(?:-|$)/.test(id)) flags.eggFree = true;
  if (/(?:^|-)vegan(?:-|$)/.test(id)) flags.vegan = true;
  else if (/(?:^|-)veg(?:-|$)/.test(id)) flags.vegetarian = true;
  return flags;
}

function normaliseShare(input: ShareSpec): ShareSpec {
  if (!input || typeof input !== "object" || input.v !== 1) throw new Error("This link is not a Fusion Table recipe.");
  if (input.kind !== "classic" && input.kind !== "meal") throw new Error("This link is not a Fusion Table recipe.");
  const regions = input.kind === "meal" ? MEAL_REGIONS : REGIONS;
  if (typeof input.regionId !== "string" || !regions.some((item) => item.id === input.regionId)) {
    throw new Error("This link is not a Fusion Table recipe.");
  }
  if (!DIET_IDS.has(input.diet) || !HEATS.has(input.spiceHeat)) throw new Error("This link is not a Fusion Table recipe.");
  if (!Number.isInteger(input.servings) || input.servings < 1 || input.servings > 12) throw new Error("This link is not a Fusion Table recipe.");
  const spec: ShareSpec = {
    v: 1,
    kind: input.kind,
    regionId: input.regionId,
    diet: input.diet,
    spiceHeat: input.spiceHeat,
    servings: input.servings,
  };
  if (input.seed !== undefined) {
    if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new Error("This link is not a Fusion Table recipe.");
    spec.seed = input.seed;
  }
  if (input.cookPace !== undefined) {
    if (!isCookPace(input.cookPace)) throw new Error("This link is not a Fusion Table recipe.");
    spec.cookPace = input.cookPace;
  }
  if (input.clean !== undefined) {
    if (!input.clean || typeof input.clean !== "object" || Array.isArray(input.clean)) throw new Error("This link is not a Fusion Table recipe.");
    const clean: CleanPrefs = {};
    for (const [key, value] of Object.entries(input.clean)) {
      if (!(CLEAN_KNOB_IDS as readonly string[]).includes(key) || typeof value !== "boolean") throw new Error("This link is not a Fusion Table recipe.");
      if (value) clean[key as keyof CleanPrefs] = true;
    }
    if (Object.keys(clean).length) spec.clean = clean;
  }
  if (input.kind === "classic") {
    if (typeof input.classicId !== "string" || !CLASSICS.some((item) => item.id === input.classicId)) throw new Error("This link is not a Fusion Table recipe.");
    spec.classicId = input.classicId;
  } else {
    if (typeof input.mainId !== "string" || typeof input.methodId !== "string" || typeof input.sideId !== "string") {
      throw new Error("This link is not a Fusion Table recipe.");
    }
    if (!MAIN_INGREDIENTS.some((main) => main.id === input.mainId) || !COOKING_METHODS.some((method) => method.id === input.methodId) || !MEAL_SIDES.some((side) => side.id === input.sideId)) throw new Error("This link is not a Fusion Table recipe.");
    spec.mainId = input.mainId;
    spec.methodId = input.methodId;
    spec.sideId = input.sideId;
    if (input.softenIngredients !== undefined) {
      if (!Array.isArray(input.softenIngredients) || input.softenIngredients.length > 80 || input.softenIngredients.some((id) => typeof id !== "string" || !INGREDIENT_ID.test(id))) throw new Error("This link is not a Fusion Table recipe.");
      const ids = [...new Set(input.softenIngredients)];
      if (ids.length) spec.softenIngredients = ids;
    }
    if (input.cutId !== undefined && input.cutId !== "") {
      if (typeof input.cutId !== "string" || !getCut(input.cutId)) throw new Error("This link is not a Fusion Table recipe.");
      spec.cutId = input.cutId;
    }
  }
  const avoid = wordList(input.avoid, AVOID, AVOID.size);
  const dislikes = wordList(input.dislikes);
  if (avoid?.length) spec.avoid = avoid;
  if (dislikes?.length) spec.dislikes = dislikes;
  if (input.glutenFree === true) spec.glutenFree = true;
  if (input.dairyFree === true) spec.dairyFree = true;
  if (input.vegan === true) spec.vegan = true;
  if (input.vegetarian === true) spec.vegetarian = true;
  if (input.eggFree === true) spec.eggFree = true;
  return spec;
}

function wordList(value: unknown, allowed?: Set<string>, limit = 40): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > limit) throw new Error("This link is not a Fusion Table recipe.");
  const words: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") throw new Error("This link is not a Fusion Table recipe.");
    const word = item.trim().replace(/\s+/g, " ");
    if (!WORD.test(word)) throw new Error("This link is not a Fusion Table recipe.");
    const key = word.toLocaleLowerCase("en");
    if (allowed && !allowed.has(key)) throw new Error("This link is not a Fusion Table recipe.");
    if (!words.includes(allowed ? key : word)) words.push(allowed ? key : word);
  }
  return words;
}
