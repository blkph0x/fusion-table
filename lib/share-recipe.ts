import { getCut } from "./cuts.ts";
import { MEAL_REGIONS, generateMeal } from "./meals.ts";
import type { MealInput } from "./meal-types.ts";
import { SPICE_HEATS, type CookPace, type DietId, type Recipe, type RecipeConstraints, type RecipeInput, type SpiceHeat } from "./recipe-types.ts";
import { isCookPace } from "./cook-pace.ts";
import { CLASSICS, DIETS, REGIONS, generateRecipe } from "./recipes.ts";

const DIET_IDS = new Set<DietId>(DIETS.map((item) => item.id as DietId));
const HEATS = new Set<SpiceHeat>(SPICE_HEATS);
const AVOID = new Set(["soy", "wheat", "gluten", "milk", "egg", "sesame", "oats", "barley", "rye", "fish", "crustacean", "peanut", "tree-nut"]);
const WORD = /^[a-z0-9][a-z0-9 '.-]{0,39}$/i;

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
  return encodeBase64Url(JSON.stringify(clean));
}

export function decodeShare(token: string): ShareSpec {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{8,2500}$/.test(token)) {
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
      ...(clean.avoid?.length ? { avoidAllergens: clean.avoid } : {}),
      ...(clean.dislikes?.length ? { dislikes: clean.dislikes } : {}),
      ...(constraintsOf(clean) ? { constraints: constraintsOf(clean) } : {}),
    };
    return generateRecipe(input);
  } catch {
    throw new Error("This link is not a recipe Fusion Table can rebuild.");
  }
}

/** Best effort for a recipe already on screen. Pantry ticks are not part of the link. */
export function specFromRecipe(recipe: Recipe, extra?: { avoid?: string[]; dislikes?: string[] }): ShareSpec {
  const seedMatch = recipe.id.match(/-sat-(\d+)$/);
  const seed = seedMatch ? Number(seedMatch[1]) : undefined;
  const paceMatch = recipe.id.match(/-pace-(quick|morning|lunch|long)(?:-|$)/);
  const cookPace = recipe.cookPace ?? (paceMatch && isCookPace(paceMatch[1]) ? paceMatch[1] : undefined);
  const flags = constraintsFromId(recipe.id);
  const common = {
    v: 1 as const,
    regionId: recipe.regionId,
    diet: recipe.diet,
    spiceHeat: recipe.spiceHeat,
    servings: recipe.servings,
    ...(seed !== undefined ? { seed } : {}),
    ...(cookPace ? { cookPace } : {}),
    ...flags,
    ...(extra?.avoid?.length ? { avoid: extra.avoid } : {}),
    ...(extra?.dislikes?.length ? { dislikes: extra.dislikes } : {}),
  };
  if (recipe.kind === "meal" && recipe.mainId && recipe.methodId && recipe.sideId) {
    return normaliseShare({ ...common, kind: "meal", mainId: recipe.mainId, methodId: recipe.methodId, sideId: recipe.sideId });
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
  if (input.kind === "classic") {
    if (typeof input.classicId !== "string" || !CLASSICS.some((item) => item.id === input.classicId)) throw new Error("This link is not a Fusion Table recipe.");
    spec.classicId = input.classicId;
  } else {
    if (typeof input.mainId !== "string" || typeof input.methodId !== "string" || typeof input.sideId !== "string") {
      throw new Error("This link is not a Fusion Table recipe.");
    }
    spec.mainId = input.mainId;
    spec.methodId = input.methodId;
    spec.sideId = input.sideId;
    if (input.cutId !== undefined && input.cutId !== "") {
      if (typeof input.cutId !== "string" || !getCut(input.cutId)) throw new Error("This link is not a Fusion Table recipe.");
      spec.cutId = input.cutId;
    }
  }
  const avoid = wordList(input.avoid, AVOID);
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

function wordList(value: unknown, allowed?: Set<string>): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 12) throw new Error("This link is not a Fusion Table recipe.");
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
