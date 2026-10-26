/**
 * Appetising, region-true meal titles.
 * Prefer cut + method + side cues over "Region main · method".
 */

import { COOKING_METHODS, MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SIDES } from "./meal-catalog.ts";

const REGION_SHORT: Readonly<Record<string, string>> = {
  japanese: "Japanese",
  korean: "Korean",
  thai: "Thai",
  "thai-green": "Thai green",
  "thai-massaman": "Thai massaman",
  mexican: "Mexican",
  indian: "Indian",
  levantine: "Levantine",
  italian: "Italian",
  moroccan: "Moroccan",
  greek: "Greek",
  spanish: "Spanish",
  french: "French",
  vietnamese: "Vietnamese",
  chinese: "Chinese",
  cantonese: "Cantonese",
  sichuan: "Sichuan",
  indonesian: "Indonesian",
  malaysian: "Malaysian",
  caribbean: "Caribbean",
  peruvian: "Peruvian",
  ethiopian: "Ethiopian",
  turkish: "Turkish",
  brazilian: "Brazilian",
  australian: "Australian",
  "home-kitchen": "Home-kitchen",
  argentine: "Argentine",
  nordic: "Nordic",
  hungarian: "Hungarian",
  portuguese: "Portuguese",
};

const METHOD_PHRASE: Readonly<Record<string, string>> = {
  grilled: "grilled",
  "pan-fried": "pan-fried",
  "stir-fried": "stir-fried",
  baked: "baked",
  roasted: "roast",
  braised: "braised",
  curry: "curry",
  steamed: "steamed",
  poached: "poached",
  "air-fried": "air-fried",
  smoked: "smoked",
  schnitzel: "schnitzel",
  patties: "patties",
};

const SIDE_HOOK: Readonly<Record<string, string>> = {
  "rice-greens": "rice & greens",
  "potato-slaw": "potatoes & slaw",
  "couscous-veg": "couscous & veg",
  "noodles-crunch": "noodles & crunch",
  "flatbread-salad": "flatbread salad",
  "lentil-salad": "lentil salad",
  "garden-salad": "garden salad",
  "mashed-potato": "mash",
  "roast-pumpkin": "roast pumpkin",
  "steamed-broccoli": "broccoli & rice",
  "garlic-bread": "garlic bread",
  "jasmine-cucumber": "jasmine rice",
  "coconut-rice": "coconut rice",
  "kimchi-rice": "kimchi rice",
  "basmati-raita": "basmati & raita",
  "chapati-salad": "chapati",
  "bulgur-tabbouleh": "tabbouleh",
  "hummus-salad": "hummus",
  "polenta-greens": "polenta",
  "sesame-spinach": "sesame spinach",
  "quinoa-avocado": "quinoa & avocado",
  "tortilla-salsa": "tortillas",
  "black-bean-rice": "black-bean rice",
  "coleslaw-corn": "slaw & corn",
  "vermicelli-herb": "herb vermicelli",
  "gai-lan-rice": "gai lan rice",
  "sticky-rice-greens": "sticky rice",
  "injera-salad": "injera",
  "pita-fattoush": "fattoush",
};

export interface MealNameInput {
  regionId: string;
  mainId: string;
  methodId: string;
  sideId: string;
  /** Optional butcher cut shopping name, e.g. "beef brisket". */
  cutLabel?: string;
  sauceHint?: string;
}

function regionLabel(regionId: string): string {
  if (REGION_SHORT[regionId]) return REGION_SHORT[regionId];
  const named = MEAL_REGIONS.find((r) => r.id === regionId)?.name.replace(/-inspired$/i, "").trim();
  return named || "Fusion";
}

function mainLabel(mainId: string, cutLabel?: string): string {
  if (cutLabel) {
    const trimmed = cutLabel.trim();
    if (trimmed) return trimmed.toLocaleLowerCase("en");
  }
  const main = MAIN_INGREDIENTS.find((m) => m.id === mainId);
  return (main?.name || mainId).toLocaleLowerCase("en");
}

function methodBit(methodId: string, mainId: string): string {
  if (methodId === "schnitzel") return "schnitzel";
  if (methodId === "patties") return "patties";
  if (methodId === "curry") {
    if (["chickpeas", "lentils", "butter-beans", "black-beans", "kidney-beans", "tofu", "tempeh", "paneer"].includes(mainId)) {
      return "curry";
    }
    return "in curry sauce";
  }
  return METHOD_PHRASE[methodId] || methodId.replace(/-/g, " ");
}

function sideBit(sideId: string): string | null {
  if (SIDE_HOOK[sideId]) return SIDE_HOOK[sideId];
  const side = MEAL_SIDES.find((s) => s.id === sideId);
  if (!side) return null;
  const short = side.name.replace(/\s*&\s*/g, " & ").trim();
  return short.length <= 28 ? short.toLocaleLowerCase("en") : null;
}

/** Clear, appetising title for a generated meal. */
export function mealName(input: MealNameInput): string {
  const region = regionLabel(input.regionId);
  const main = mainLabel(input.mainId, input.cutLabel);
  const method = methodBit(input.methodId, input.mainId);
  const side = sideBit(input.sideId);

  if (input.methodId === "schnitzel") {
    return side ? `${region} ${main} schnitzel with ${side}` : `${region} ${main} schnitzel`;
  }
  if (input.methodId === "patties") {
    return side ? `${region} ${main} patties with ${side}` : `${region} ${main} patties`;
  }
  if (input.methodId === "curry") {
    const head = main.includes("curry") ? `${region} ${main}` : `${region} ${main} curry`;
    return side ? `${head} with ${side}` : head;
  }
  if (input.methodId === "smoked") {
    return side ? `${region} smoked ${main} with ${side}` : `${region} smoked ${main}`;
  }

  const verbFirst = ["grilled", "baked", "roasted", "braised", "steamed", "poached", "pan-fried", "stir-fried", "air-fried"].includes(input.methodId);
  const core = verbFirst
    ? `${region} ${method} ${main}`
    : `${region} ${main} ${method}`;
  return side ? `${core} with ${side}` : core;
}

/** Short card blurb under the title. */
export function mealBlurb(input: MealNameInput & { vegetables?: string; sauce?: string }): string {
  const method = COOKING_METHODS.find((m) => m.id === input.methodId)?.name.toLowerCase() || input.methodId;
  const side = MEAL_SIDES.find((s) => s.id === input.sideId)?.name || "sides";
  const sauce = input.sauceHint || input.sauce || "a regional sauce";
  return `${method} ${mainLabel(input.mainId, input.cutLabel)} with ${side.toLocaleLowerCase("en")} and ${sauce}. Template — not kitchen-tested.`;
}

const METHOD_ONLY = /·\s*(grilled|baked|roasted|braised|steamed|poached|pan-fried|stir-fried|air-fried|smoked|curry-style simmer|schnitzel|patties)\s*$/i;

/** Heuristic: reject the old "Japanese chicken · grilled" shape; seeded SAT tails use an em dash. */
export function namingLooksGeneric(title: string): boolean {
  if (METHOD_ONLY.test(title)) return true;
  if (/^[A-Za-z][A-Za-z-]*-inspired\s+\S+\s+·\s+/i.test(title)) return true;
  if (/\b[a-z]+ plate\b/i.test(title) && !/dinner plate|on the plate/i.test(title)) return true;
  return false;
}
