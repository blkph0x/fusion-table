import { SPICE_HEATS, type DietId, type IngredientCategory, type RecipeIngredient, type RecipeStep, type SpiceHeat } from "./recipe-types.ts";
import type { MainIngredientOption, MealInput, MealRecipe, NormalizedMealInput } from "./meal-types.ts";
import { COOKING_METHODS, MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SAFETY_SOURCES, MEAL_SIDES, getMainsForDiet } from "./meal-catalog.ts";
import { applyStaples, canonAllergen, stapleStep } from "./staples.ts";
import { getCut, type MeatCut } from "./cuts.ts";
import { assertCutForMethod, prepareCut } from "./cut-method.ts";
import { defaultSmokePlan, mainAllowsSmoke, smokeMismatchMessage } from "./smoke-method.ts";
import { applySatFusion } from "./fusion-sat.ts";
import { applyCookPace, isCookPace } from "./cook-pace.ts";
import { foodWordHit } from "./food-words.ts";
import { exploreRegionProfile } from "./region-diversity.ts";
import { buildSidePlan, preferredSidesForRegion } from "./side-plans.ts";
import {
  applyCleanRounding,
  applyPortionBalance,
  balanceAnnotation,
  cleanActive,
  cleanlinessScore,
  cleanSummaryNote,
  consolidateDrafts,
  mealCleanStats,
  normalizeCleanPrefs,
  orderSidesForClean,
  tidySteps,
} from "./clean-prefs.ts";

export { COOKING_METHODS, MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SAFETY_SOURCES, MEAL_SIDES, getMethodsForMain, getMainsForDiet, getMealCombinationCount } from "./meal-catalog.ts";
export { cutsForMethod, cutAllowedForMethod } from "./cut-method.ts";
export { mainAllowsSmoke, SMOKE_MAINS, NEVER_SMOKE_MAINS, SMOKE_STAPLE_CUTS } from "./smoke-method.ts";
export type { MealInput, MealRecipe, NormalizedMealInput } from "./meal-types.ts";

type DraftIngredient = Omit<RecipeIngredient, "inPantry"> & { aliases?: readonly string[] };
interface RegionProfile {
  sauce: string;
  aromatics: DraftIngredient[];
  seasonings: DraftIngredient[];
  finish: DraftIngredient[];
  body: "coconut" | "tomato" | "stock";
}
interface MainPlan {
  ingredient: DraftIngredient;
  preparation: string;
  endpoint: string;
  minutes: number;
  safetyNote?: string;
  safetySource?: string;
}
interface SidePlan {
  side: string;
  vegetables: string;
  ingredients: DraftIngredient[];
  steps: RecipeStep[];
  equipment: string[];
  minutes: number;
}

const DIET_IDS: readonly DietId[] = ["balanced", "vegetarian", "vegan", "gluten-free", "dairy-free"];
const HEAT_IDS: readonly SpiceHeat[] = SPICE_HEATS;
const SLOW_METHODS = new Set(["braised", "curry"]);
const LEGUMES = new Set(["chickpeas", "lentils", "butter-beans", "black-beans", "kidney-beans"]);
const DAIRY_MAINS = new Set(["halloumi", "paneer"]);
const ROOTS = new Set(["pumpkin", "sweet-potato"]);

function ingredient(id: string, name: string, amount: number, unit: string, category: IngredientCategory = "grocery", allergens: string[] = [], notes?: string, aliases?: readonly string[]): DraftIngredient {
  return { id, name, amount, unit, category, allergens, ...(notes ? { notes } : {}), ...(aliases ? { aliases: [...aliases] } : {}) };
}

function normalizeTerm(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/[’']/g, "").replace(/[–—-]/g, " ").replace(/\s+/g, " ");
}

export function validateMealInput(input: MealInput): NormalizedMealInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Choose a main ingredient and a cooking method.");
  const main = MAIN_INGREDIENTS.find((item) => item.id === input.mainId);
  if (!main) throw new Error("Choose a recognised main ingredient.");
  if (!COOKING_METHODS.some((item) => item.id === input.methodId)) throw new Error("Choose a recognised cooking method.");
  if (!main.methodIds.includes(input.methodId)) throw new Error(`${main.name} is not available with that cooking method. Choose one of its suggested methods.`);
  if (input.methodId === "smoked" && !mainAllowsSmoke(main.id)) throw new Error(smokeMismatchMessage(main.id));
  if (!MEAL_REGIONS.some((item) => item.id === input.regionId)) throw new Error("Choose a recognised flavour region.");
  const sideId = input.sideId ?? "rice-greens";
  if (!MEAL_SIDES.some((item) => item.id === sideId)) throw new Error("Choose a recognised side pairing.");
  const diet = input.diet ?? "balanced";
  if (!DIET_IDS.includes(diet)) throw new Error("Choose a recognised dietary preference.");
  const requested = input.constraints ?? {};
  if (requested === null || typeof requested !== "object" || Array.isArray(requested)) throw new Error("Dietary constraints must be a set of flags.");
  const dairyFree = diet === "dairy-free" || diet === "vegan" || requested.dairyFree === true;
  const eggFree = diet === "vegan" || requested.eggFree === true;
  if (!getMainsForDiet(diet).some((item) => item.id === main.id)) throw new Error(`${main.name} does not fit the ${diet} preference. Select a compatible main ingredient.`);
  if (dairyFree && DAIRY_MAINS.has(main.id)) throw new Error(`${main.name} does not fit the dairy-free preference. Select a compatible main ingredient.`);
  if (eggFree && main.id === "eggs") throw new Error("Eggs do not fit an egg-free preference. Select a compatible main ingredient.");
  const spiceHeat = input.spiceHeat ?? "medium";
  if (!HEAT_IDS.includes(spiceHeat)) throw new Error("Choose gentle, mild, medium, hot or fiery.");
  let cutId: string | undefined;
  if (input.cutId !== undefined && input.cutId !== "") {
    if (typeof input.cutId !== "string") throw new Error("Choose a recognised cut, or leave it to match the method.");
    cutId = assertCutForMethod(input.cutId.trim(), main.id, input.methodId);
  }
  let seed: number | undefined;
  if (input.seed !== undefined && input.seed !== null) {
    if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new Error("Choose a whole-number seed.");
    seed = input.seed;
  }
  let softenIngredients: string[] | undefined;
  if (input.softenIngredients !== undefined) {
    if (!Array.isArray(input.softenIngredients) || !input.softenIngredients.every((id) => typeof id === "string")) {
      throw new Error("softenIngredients must be a list of ingredient ids.");
    }
    softenIngredients = input.softenIngredients.map((id) => id.trim()).filter(Boolean).slice(0, 80);
  }
  const supportedAvoid = new Set(["soy", "wheat", "gluten", "milk", "egg", "sesame", "oats", "barley", "rye", "fish", "crustacean", "peanut", "tree-nut"]);
  let avoidAllergens: string[] | undefined;
  if (input.avoidAllergens !== undefined) {
    if (!Array.isArray(input.avoidAllergens)) throw new Error("List allergens by their supported names.");
    avoidAllergens = input.avoidAllergens.map((name) => name.trim().toLocaleLowerCase("en")).filter(Boolean);
    if (avoidAllergens.some((name) => !supportedAvoid.has(name))) throw new Error("Use a supported allergen name.");
  }
  let dislikes: string[] | undefined;
  if (input.dislikes !== undefined) {
    if (!Array.isArray(input.dislikes)) throw new Error("List dislikes as ingredient names.");
    dislikes = input.dislikes.map((name) => name.trim()).filter(Boolean).slice(0, 40);
  }
  if (input.cookPace !== undefined && !isCookPace(input.cookPace)) throw new Error("Choose a cook session: quick, morning, lunch or long.");
  if (!Number.isInteger(input.servings) || input.servings < 1 || input.servings > 12) throw new Error("Servings must be a whole number between 1 and 12.");
  if (input.pantry !== undefined) {
    if (typeof input.pantry === "string") {
      if (input.pantry.length > 8000) throw new Error("Keep the pantry list under 8,000 characters.");
    } else if (!Array.isArray(input.pantry) || input.pantry.length > 100 || !input.pantry.every((entry) => typeof entry === "string" && entry.length <= 200)) {
      throw new Error("The pantry must be text or a list of up to 100 ingredient names.");
    }
  }
  const clean = normalizeCleanPrefs(input.clean);
  let resolvedSide = sideId;
  if (cleanActive(clean) && (clean.moreVegetables || clean.cleanMode) && input.sideId === undefined) {
    const ordered = orderSidesForClean(preferredSidesForRegion(input.regionId), clean);
    if (ordered[0]) resolvedSide = ordered[0];
  }
  return {
    mainId: main.id, methodId: input.methodId, regionId: input.regionId, sideId: resolvedSide, servings: input.servings, diet, spiceHeat,
    ...(input.pantry !== undefined ? { pantry: input.pantry } : {}),
    ...(Object.keys(clean).length ? { clean } : {}),
    ...(cutId ? { cutId } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(softenIngredients ? { softenIngredients } : {}),
    ...(input.cookPace ? { cookPace: input.cookPace } : {}),
    ...(avoidAllergens ? { avoidAllergens } : {}),
    ...(dislikes ? { dislikes } : {}),
  };
}

function withCut(plan: MainPlan, cut: MeatCut, method: string): MainPlan {
  const affinity = prepareCut(cut, method);
  if (!affinity) {
    throw new Error(`Choose a recognised cut for this main, or leave it to match the method.`);
  }
  const preparation = affinity.preparation;
  const endpoint = affinity.endpoint;
  // Smoked cut plans carry absolute minutes in minutesBump; other methods add a bump.
  const minutes = method === "smoked" && affinity.minutesBump
    ? affinity.minutesBump
    : plan.minutes + (affinity.minutesBump ?? 0);
  const notes = [preparation, cut.packetNote].filter(Boolean).join(" ");
  const aliases = [...new Set([...(plan.ingredient.aliases ?? []), ...cut.aliases, cut.shoppingName])];
  const safetyNote = endpoint === plan.endpoint || !plan.safetySource
    ? plan.safetyNote
    : `${endpoint} Timing is a guide: thickness, equipment and batch size change cooking time. Keep raw animal ingredients separate from ready-to-eat food and wash hands, utensils and work surfaces after handling them.`;
  return {
    ...plan,
    preparation,
    endpoint,
    minutes,
    ...(safetyNote ? { safetyNote } : {}),
    ingredient: { ...plan.ingredient, name: cut.shoppingName, notes, aliases },
  };
}

function amount(value: number, servings: number): string {
  return String(Number((value * servings / 4).toFixed(4)));
}

function describe(items: readonly DraftIngredient[], servings: number): string {
  return items.map((item) => `${amount(item.amount, servings)}${item.unit ? ` ${item.unit}` : ""} ${item.name.toLocaleLowerCase("en")}`).join(", ");
}

function regionalProfile(
  regionId: string,
  glutenFree: boolean,
  heat: SpiceHeat,
  seed?: number,
  soften?: readonly string[],
  clean?: ReturnType<typeof normalizeCleanPrefs>,
): RegionProfile {
  return exploreRegionProfile(regionId, glutenFree, heat, {
    ...(seed !== undefined ? { seed } : {}),
    ...(soften && soften.length ? { soften } : {}),
    ...(clean && Object.keys(clean).length ? { clean } : {}),
  });
}

function hitsDislike(item: DraftIngredient, dislikes: readonly string[]): boolean {
  return dislikes.some((token) => [item.name, ...(item.aliases ?? [])].some((label) => foodWordHit(label, token)));
}

/** A hard dislike removes that regional ingredient. It does not swap in another cuisine. */
function withoutDislikes(profile: RegionProfile, dislikes: readonly string[]): RegionProfile {
  if (dislikes.length === 0) return profile;
  const keep = (items: DraftIngredient[]) => items.filter((item) => !hitsDislike(item, dislikes));
  return { ...profile, aromatics: keep(profile.aromatics), seasonings: keep(profile.seasonings), finish: keep(profile.finish) };
}

const COOK_TIMES: Record<string, Record<string, number>> = {
  chicken: { schnitzel: 12, baked: 25, "pan-fried": 15, "air-fried": 18, poached: 20, grilled: 16, smoked: 90, "stir-fried": 9, braised: 40, curry: 25, patties: 15, roasted: 30, steamed: 20 },
  turkey: { schnitzel: 12, baked: 25, "pan-fried": 15, "air-fried": 18, poached: 22, grilled: 16, smoked: 120, "stir-fried": 9, braised: 50, curry: 30, patties: 15, roasted: 30, steamed: 22 },
  beef: { schnitzel: 10, "pan-fried": 12, "air-fried": 14, grilled: 12, smoked: 360, "stir-fried": 7, braised: 120, curry: 110, patties: 14, roasted: 22 },
  lamb: { "pan-fried": 12, "air-fried": 14, grilled: 12, smoked: 300, "stir-fried": 7, braised: 110, curry: 100, patties: 14, roasted: 24 },
  pork: { schnitzel: 12, baked: 25, "pan-fried": 14, "air-fried": 16, grilled: 14, smoked: 240, "stir-fried": 8, braised: 110, curry: 100, patties: 15, roasted: 25 },
  salmon: { baked: 16, "pan-fried": 10, "air-fried": 12, poached: 12, grilled: 12, smoked: 45, "stir-fried": 8, curry: 12, patties: 14, roasted: 16, steamed: 12 },
  "white-fish": { schnitzel: 10, baked: 18, "pan-fried": 10, "air-fried": 12, poached: 12, grilled: 12, curry: 12, patties: 14, roasted: 18, steamed: 12 },
  prawns: { "pan-fried": 6, "air-fried": 8, poached: 6, grilled: 6, "stir-fried": 6, curry: 7, steamed: 7 },
  tofu: { schnitzel: 12, baked: 25, "pan-fried": 12, "air-fried": 18, grilled: 12, smoked: 40, "stir-fried": 10, braised: 20, curry: 18, patties: 14, roasted: 25, steamed: 12 },
  tempeh: { schnitzel: 12, baked: 25, "pan-fried": 12, "air-fried": 18, grilled: 12, smoked: 45, "stir-fried": 10, braised: 20, curry: 20, patties: 14, roasted: 25, steamed: 18 },
  halloumi: { schnitzel: 8, baked: 15, "pan-fried": 6, "air-fried": 10, grilled: 6, roasted: 15 },
  eggs: { baked: 18, "pan-fried": 8, poached: 8, curry: 20, steamed: 18 },
  chickpeas: { baked: 25, "pan-fried": 12, "air-fried": 16, braised: 20, curry: 20, patties: 16, roasted: 30 },
  lentils: { braised: 15, curry: 15, patties: 16 },
  "butter-beans": { baked: 25, "pan-fried": 12, braised: 20, curry: 20, patties: 16, roasted: 25 },
  mushrooms: { schnitzel: 12, baked: 22, "pan-fried": 12, "air-fried": 15, grilled: 12, smoked: 50, "stir-fried": 9, braised: 25, curry: 20, patties: 16, roasted: 25, steamed: 12 },
  aubergine: { schnitzel: 14, baked: 30, "pan-fried": 18, "air-fried": 20, grilled: 16, "stir-fried": 15, braised: 30, curry: 25, roasted: 30, steamed: 18 },
  cauliflower: { schnitzel: 14, baked: 30, "pan-fried": 15, "air-fried": 20, grilled: 16, "stir-fried": 12, braised: 25, curry: 25, patties: 16, roasted: 30, steamed: 12 },
  pumpkin: { baked: 35, "pan-fried": 18, "air-fried": 22, braised: 25, curry: 25, patties: 16, roasted: 35, steamed: 18 },
  "sweet-potato": { baked: 35, "pan-fried": 18, "air-fried": 22, braised: 25, curry: 25, patties: 16, roasted: 35, steamed: 18 },
  courgette: { schnitzel: 10, baked: 22, "pan-fried": 10, "air-fried": 14, grilled: 10, "stir-fried": 8, braised: 18, curry: 18, patties: 16, roasted: 22, steamed: 8 },
  broccoli: { baked: 22, "pan-fried": 12, "air-fried": 15, "stir-fried": 10, braised: 18, curry: 18, patties: 16, roasted: 22, steamed: 9 },
  duck: { schnitzel: 12, baked: 28, "pan-fried": 16, "air-fried": 18, poached: 22, grilled: 16, smoked: 150, "stir-fried": 10, braised: 50, curry: 35, patties: 16, roasted: 35, steamed: 22 },
  kangaroo: { schnitzel: 8, "pan-fried": 8, "air-fried": 10, grilled: 8, "stir-fried": 5, braised: 70, curry: 60, patties: 14, roasted: 16 },
  tuna: { baked: 12, "pan-fried": 8, "air-fried": 10, grilled: 8, "stir-fried": 6, curry: 10, roasted: 12 },
  sardines: { baked: 12, "pan-fried": 8, "air-fried": 10, grilled: 8, roasted: 14 },
  "black-beans": { baked: 25, "pan-fried": 12, "air-fried": 16, braised: 20, curry: 20, patties: 16, roasted: 30 },
  "kidney-beans": { baked: 25, "pan-fried": 12, braised: 20, curry: 20, patties: 16, roasted: 25 },
  jackfruit: { baked: 30, "pan-fried": 15, smoked: 60, "stir-fried": 12, braised: 25, curry: 25, roasted: 35 },
  paneer: { schnitzel: 8, baked: 18, "pan-fried": 8, "air-fried": 12, grilled: 8, "stir-fried": 8, curry: 15, roasted: 18 },
};

function mainPlan(main: MainIngredientOption, method: string): MainPlan {
  const id = main.id;
  const slow = SLOW_METHODS.has(method);
  const smoked = method === "smoked";
  const patty = method === "patties";
  const quickPieces = method === "stir-fried";
  const schnitzel = method === "schnitzel";
  let name = main.name;
  let quantity = main.category === "plant" && !["tofu", "tempeh", ...LEGUMES].includes(id) ? 800 : 600;
  let unit = "g";
  let category: IngredientCategory = main.category === "meat" ? "butcher" : main.category === "seafood" ? "fishmonger" : main.category === "plant" && !["tofu", "tempeh", ...LEGUMES].includes(id) ? "produce" : "grocery";
  let preparation = "";
  let allergens: string[] = [];
  let endpoint = "Cook until hot through and tender; check the thickest piece.";
  let safetySource: string | undefined;
  if (smoked) {
    const smoke = defaultSmokePlan(id);
    if (!smoke) throw new Error(smokeMismatchMessage(id));
    name = smoke.shoppingName;
    if (id === "salmon") { allergens = ["fish"]; category = "fishmonger"; }
    if (id === "tofu" || id === "tempeh") allergens = ["soy"];
    if (id === "jackfruit" || LEGUMES.has(id)) category = "grocery";
    if (["mushrooms", "aubergine"].includes(id)) category = "produce";
    preparation = smoke.preparation;
    endpoint = smoke.endpoint;
    safetySource = smoke.safetySource;
    const safetyNote = `${endpoint} Timing is a guide: cut thickness, smoker temperature and weather change cooking time. Use fuel-burning smokers outdoors only. Keep raw animal ingredients separate from ready-to-eat food and wash hands, utensils and work surfaces after handling them.`;
    return { ingredient: ingredient(id, name, quantity, unit, category, allergens, preparation, main.ingredientAliases), preparation, endpoint, minutes: smoke.minutes, safetyNote, safetySource };
  }
  if (["chicken", "turkey", "duck"].includes(id)) {
    name = `${main.name} ${patty ? "mince" : slow || method === "roasted" ? "boneless skinless thigh" : "breast fillets"}`;
    preparation = patty ? "Keep the raw mince refrigerated until shaping." : schnitzel ? "Slice the breast horizontally and flatten between baking paper to an even 1 cm thickness. Do not wash raw poultry." : quickPieces ? "Slice across the grain into even 1 cm strips. Do not wash raw poultry." : slow ? "Trim and cut the thigh into 3 cm pieces. Do not wash raw poultry." : "Cut large pieces into individual portions no thicker than 2.5 cm, and pat dry with disposable kitchen paper. Do not wash raw poultry.";
    endpoint = "Check several thickest pieces with a clean food thermometer: the centre must reach 75°C. Continue cooking if needed.";
    safetySource = MEAL_SAFETY_SOURCES.poultryAndMince;
  } else if (["beef", "lamb", "pork"].includes(id)) {
    const cut = id === "beef" ? "chuck" : "shoulder";
    name = patty ? `${main.name} mince` : slow ? `Boneless ${main.name.toLowerCase()} ${cut}` : id === "beef" ? "Beef rump steaks" : id === "lamb" ? "Lamb leg steaks" : "Boneless pork loin steaks";
    preparation = patty ? "Keep the raw mince refrigerated until shaping." : slow ? `Trim excess fat from the ${cut} and cut into even 3 cm cubes.` : schnitzel ? "Trim and flatten the steaks between baking paper to an even 8–10 mm thickness." : quickPieces ? "Slice the steak across the grain into thin 5 mm strips." : "Trim and portion the steaks to an even 2 cm thickness; pat dry.";
    endpoint = patty || schnitzel ? "The centre must reach 75°C on a clean food thermometer; check several pieces and cook longer if needed." : slow ? "Cook until fork-tender as well as at least 71°C in the centre; shoulder and chuck need time to soften. Extend the gentle simmer if still tough." : "Check the centre of the thickest pieces reaches at least 71°C for a medium result, then rest for 3 minutes before slicing.";
    safetySource = patty || schnitzel ? MEAL_SAFETY_SOURCES.poultryAndMince : MEAL_SAFETY_SOURCES.cookingTemperatures;
  } else if (id === "kangaroo") {
    name = patty ? "Kangaroo mince" : "Kangaroo steaks";
    preparation = patty ? "Keep the raw mince refrigerated until shaping. Kangaroo is very lean." : slow ? "Trim and cut the steak into even 3 cm cubes. Kangaroo is very lean, so keep the simmer gentle and stop once it is fork-tender." : schnitzel ? "Trim and flatten the steaks between baking paper to an even 8–10 mm thickness. Kangaroo is very lean." : quickPieces ? "Slice the steak across the grain into thin 5 mm strips. Kangaroo is very lean; do not cook it past the endpoint." : "Trim and portion the steaks to an even 2 cm thickness and pat dry. Kangaroo is very lean; do not cook it past the endpoint.";
    endpoint = patty || schnitzel ? "The centre must reach 75°C on a clean food thermometer; check several pieces and cook longer if needed." : slow ? "Cook until fork-tender as well as at least 71°C in the centre. Extend the gentle simmer if still tough, and add a splash of water if it dries." : "Check the centre of the thickest pieces reaches at least 71°C for a medium result, then rest for 3 minutes before slicing.";
    safetySource = patty || schnitzel ? MEAL_SAFETY_SOURCES.poultryAndMince : MEAL_SAFETY_SOURCES.cookingTemperatures;
  } else if (main.category === "seafood") {
    allergens = id === "prawns" ? ["crustaceans"] : ["fish"];
    name = id === "prawns" ? "Raw peeled, deveined prawns" : id === "salmon" ? "Boneless skinless salmon fillets" : id === "tuna" ? "Boneless skinless tuna steaks" : id === "sardines" ? "Fresh sardines, gutted and scaled" : "Firm boneless skinless white fish fillets";
    preparation = id === "prawns" ? "Use thawed raw prawns, remove any remaining shells and veins, and pat dry." : id === "sardines" ? "Use fresh sardines, not a cured or smoked pack. Gut and scale them if the fishmonger has not, rinse the cavity, pat dry, and check for remaining bones." : id === "tuna" ? (slow || quickPieces ? "Trim the steaks and cut into even 3 cm pieces. Check for bones. Do not serve the tuna rare." : "Trim the steaks to an even 2.5 cm thickness and pat dry. Check for bones. Do not serve the tuna rare.") : patty ? "Check carefully for bones, then finely chop the raw fish with a knife. Keep chilled until shaping." : slow || quickPieces ? "Check carefully for bones and cut into chunky 3 cm pieces." : "Check carefully for bones and portion into fillets no thicker than 2.5 cm.";
    endpoint = patty ? "The centre of each patty must reach 75°C on a clean food thermometer; cook longer if needed." : id === "prawns" ? "Cook until the prawns are opaque throughout and the thickest part reaches 63°C. Avoid overcooking once this endpoint is reached." : id === "tuna" ? "Cook until the thickest part reaches 63°C on a clean food thermometer and the flesh is opaque. Do not serve it rare." : "Cook until the thickest part reaches 63°C on a clean food thermometer and the flesh is opaque and flakes easily.";
    safetySource = patty ? MEAL_SAFETY_SOURCES.poultryAndMince : MEAL_SAFETY_SOURCES.cookingTemperatures;
  } else if (id === "tofu" || id === "tempeh") {
    name = id === "tofu" ? "Plain firm tofu" : "Plain soy tempeh";
    allergens = ["soy"];
    preparation = id === "tofu" ? `Drain and press the tofu in a clean towel for 10 minutes. ${patty ? "Crumble finely and squeeze out excess liquid." : schnitzel || method === "grilled" ? "Cut into 1.5 cm slabs." : "Cut into even 2 cm cubes."}` : `Use plain soy tempeh and check its package cooking instructions. ${patty ? "Crumble finely." : schnitzel || method === "grilled" ? "Slice into 1 cm slabs." : "Cut into 1.5 cm pieces."}`;
    endpoint = "Cook until hot throughout and browned where appropriate. Follow any longer cooking requirement on the packet.";
  } else if (id === "halloumi") {
    name = "Vegetarian-rennet halloumi"; quantity = 500; allergens = ["milk"];
    preparation = "Check that the halloumi uses vegetarian rennet. Drain, pat dry and slice 1 cm thick; it is already salty, so add no salt to the main.";
    endpoint = "Cook until golden at the edges and hot through; serve promptly while supple.";
  } else if (id === "paneer") {
    name = "Paneer"; quantity = 500; allergens = ["milk"];
    preparation = "Use plain paneer, not a fried or syrup-soaked product. Drain, pat dry and cut into 2 cm cubes. It contains milk.";
    endpoint = "Cook until golden at the edges and hot through. Paneer is already set; do not boil it hard or it toughens.";
  } else if (id === "eggs") {
    name = "Eggs"; quantity = 8; unit = ""; allergens = ["egg"];
    preparation = method === "curry" ? "Use clean, intact eggs and keep them whole in their shells for boiling. Discard any cracked or damaged egg." : "Use intact, clean eggs. Crack each into a separate cup before adding it to the pan or ramekin; discard any damaged egg.";
    endpoint = "Cook until both the whites and yolks are firm; extend the cooking time if the centre is still runny.";
    safetySource = MEAL_SAFETY_SOURCES.eggs;
  } else if (LEGUMES.has(id)) {
    name = id === "chickpeas" ? "Canned chickpeas, drained" : id === "lentils" ? "Canned green or brown lentils, drained" : id === "butter-beans" ? "Canned butter beans, drained" : id === "black-beans" ? "Canned black beans, drained" : "Canned red kidney beans, drained";
    preparation = "Use already-cooked canned pulses: the ingredient quantity is the drained weight. Drain, rinse and pat very dry." + (id === "kidney-beans" ? " Use a can. Do not cook dried kidney beans from scratch in this short method." : "") + (patty ? " Mash coarsely, leaving a little texture." : "");
    endpoint = "Heat until steaming hot throughout; the pulses are already cooked. Do not substitute uncooked dried beans or lentils directly.";
  } else if (id === "jackfruit") {
    name = "Young green jackfruit in brine, drained"; quantity = 800; category = "grocery";
    preparation = "Use young jackfruit packed in brine, not syrup and not ripe sweet jackfruit. Drain, rinse, and pull or cut it into even pieces. It is already processed; this method heats it through.";
    endpoint = "Heat until steaming hot throughout and tender. Do not use jackfruit in syrup.";
  } else {
    const names: Record<string, string> = { mushrooms: schnitzel || method === "grilled" ? "Portobello mushrooms" : "Mushrooms", aubergine: "Aubergine (eggplant)", cauliflower: "Cauliflower", pumpkin: "Peeled pumpkin", "sweet-potato": "Peeled sweet potato", courgette: "Courgette (zucchini)", broccoli: "Broccoli" };
    name = names[id]; category = "produce";
    if (id === "mushrooms") preparation = patty ? "Finely chop the mushrooms, dry-fry for 8–10 minutes until their liquid evaporates, then cool before mixing the patties." : schnitzel || method === "grilled" ? "Wipe the mushroom caps clean, trim the stems flush and keep the caps whole." : "Wipe clean, trim and cut into thick, even slices.";
    if (id === "aubergine") preparation = schnitzel || method === "grilled" || method === "pan-fried" ? `Trim and cut into even 1 cm planks.${schnitzel ? " Steam the slices for 5 minutes until just pliable, then pat dry before coating." : ""}` : "Trim and cut into even 2 cm cubes; the centre must become fully soft, not spongy.";
    if (id === "cauliflower") preparation = patty ? "Cut into florets, steam for 10 minutes until tender, then drain thoroughly, cool and chop very finely." : schnitzel || method === "grilled" ? "Cut through the core into 2 cm slabs, keeping loose florets. Simmer the slabs and florets in water for 4 minutes, drain, cool slightly and pat dry before coating or grilling." : "Cut into even 2 cm florets and thinly slice the tender core.";
    if (ROOTS.has(id)) preparation = patty ? "Cut into 2 cm cubes, simmer in water for 12–15 minutes until tender, drain thoroughly, steam-dry and mash. Cool before shaping." : method === "pan-fried" ? "Cut into 1 cm cubes. Simmer in water for 5 minutes, drain and steam-dry before frying." : `Peel${id === "pumpkin" ? ", remove the seeds," : ""} and cut into even 2 cm cubes.`;
    if (id === "courgette") preparation = patty ? "Coarsely grate, wrap in a clean tea towel and squeeze firmly to remove as much liquid as possible." : schnitzel || method === "grilled" ? "Trim and slice lengthways into even 1 cm planks; pat dry." : "Trim and cut into 1.5 cm half-moons.";
    if (id === "broccoli") preparation = patty ? "Cut into florets, peel and chop the stem, steam for 7 minutes, drain thoroughly, cool and chop finely." : "Cut into small, even florets. Peel the thick stem and slice it thinly so it cooks at the same rate.";
    endpoint = id === "aubergine" ? "Cook until soft and creamy all the way through; extend cooking if any centre is still firm or spongy." : "Cook until a knife slides into the thickest piece easily; keep some texture and avoid scorching the edges.";
  }
  const safetyNote = safetySource ? `${endpoint} Timing is a guide: thickness, equipment and batch size change cooking time. Keep raw animal ingredients separate from ready-to-eat food and wash hands, utensils and work surfaces after handling them.` : undefined;
  return { ingredient: ingredient(id, name, quantity, unit, category, allergens, preparation, main.ingredientAliases), preparation, endpoint, minutes: COOK_TIMES[id][method], ...(safetyNote ? { safetyNote, safetySource } : {}) };
}

function sidePlan(sideId: string, glutenFree: boolean, dairyFree: boolean, servings: number): SidePlan {
  return buildSidePlan(sideId, glutenFree, dairyFree, servings);
}

function mergeIngredients(drafts: readonly DraftIngredient[], servings: number, pantry?: string | string[]): RecipeIngredient[] {
  const pantryParts = Array.isArray(pantry) ? pantry : (pantry ?? "").split(/[,;\n]/);
  const available = new Set(pantryParts.slice(0, 100).map(normalizeTerm).filter(Boolean));
  const merged = new Map<string, DraftIngredient>();
  for (const draft of drafts) {
    const previous = merged.get(draft.id);
    if (previous) {
      if (previous.unit !== draft.unit || previous.name !== draft.name) throw new Error(`Conflicting ingredient definition: ${draft.id}`);
      merged.set(draft.id, { ...previous, amount: previous.amount + draft.amount, allergens: [...new Set([...previous.allergens, ...draft.allergens].map(canonAllergen))], aliases: [...new Set([...(previous.aliases ?? []), ...(draft.aliases ?? [])])], notes: [...new Set([previous.notes, draft.notes].filter(Boolean))].join(" ") });
    } else merged.set(draft.id, { ...draft, allergens: draft.allergens.map(canonAllergen) });
  }
  return [...merged.values()].map((entry) => ({
    ...entry,
    ...(entry.aliases ? { aliases: [...entry.aliases] } : {}),
    amount: Number((entry.amount * servings / 4).toFixed(4)),
    inPantry: [entry.name, ...(entry.aliases ?? [])].some((term) => available.has(normalizeTerm(term))),
  }));
}

/** Build a complete meal from explicit compatible cuts, techniques, regional sauces and side plans. */
export function generateMeal(rawInput: MealInput): MealRecipe {
  const input = validateMealInput(rawInput);
  const { mainId, methodId, regionId, sideId, servings, diet, spiceHeat } = input;
  const requested = rawInput.constraints ?? {};
  const glutenFree = diet === "gluten-free" || requested.glutenFree === true;
  const dairyFree = diet === "dairy-free" || diet === "vegan" || requested.dairyFree === true;
  const main = MAIN_INGREDIENTS.find((entry) => entry.id === mainId)!;
  const method = COOKING_METHODS.find((entry) => entry.id === methodId)!;
  const region = MEAL_REGIONS.find((entry) => entry.id === regionId)!;
  const chosen = input.cutId ? getCut(input.cutId) : undefined;
  const clean = normalizeCleanPrefs(input.clean);
  const plan = chosen ? withCut(mainPlan(main, methodId), chosen, methodId) : mainPlan(main, methodId);
  const rawProfile = withoutDislikes(
    regionalProfile(regionId, glutenFree, spiceHeat, input.seed, input.softenIngredients, clean),
    input.dislikes ?? [],
  );
  const consolidated = consolidateDrafts(
    rawProfile.aromatics,
    rawProfile.seasonings,
    rawProfile.finish,
    clean,
    spiceHeat,
  );
  const profile: RegionProfile = {
    ...rawProfile,
    aromatics: consolidated.aromatics,
    seasonings: consolidated.seasonings,
    finish: consolidated.finish,
  };
  const side = sidePlan(sideId, glutenFree, dairyFree, servings);
  const gf = glutenFree;
  const integrated = SLOW_METHODS.has(methodId);
  const smoking = methodId === "smoked";
  const slowMeat = main.category === "meat" && !["chicken", "turkey", "duck"].includes(mainId) && integrated;
  const deferSides = (integrated || smoking) && plan.minutes > side.minutes + 5;
  const ingredients: DraftIngredient[] = [plan.ingredient, ...side.ingredients, ...profile.aromatics, ...profile.seasonings, ...profile.finish];
  const steps: RecipeStep[] = [];
  const equipment = new Set<string>(["Chopping board and knife", ...side.equipment]);
  const needsThermometer = (main.category === "meat" || main.category === "seafood") && !!plan.endpoint;
  if (needsThermometer) equipment.add("Food thermometer");
  const oil = (quantity: number) => ingredient("neutral-oil", "Neutral cooking oil", quantity, "tbsp", "grocery", [], "For example, rapeseed or sunflower oil.", ["neutral cooking oil", "rapeseed oil", "sunflower oil"]);
  const stock = (quantity: number) => ingredient("vegetable-stock", gf ? "Gluten-free vegetable stock" : "Vegetable stock", quantity, "ml", "grocery", ["celery"], "Prepared liquid stock; use a vegan product and check its label for allergens.", gf ? ["gluten free vegetable stock"] : ["vegetable stock"]);
  const crumbs = (quantity: number) => ingredient("breadcrumbs", gf ? "Gluten-free vegan breadcrumbs" : "Vegan breadcrumbs", quantity, "g", "grocery", gf ? [] : ["wheat"], "Choose crumbs without milk or egg.", gf ? ["gluten free vegan breadcrumbs"] : ["vegan breadcrumbs"]);
  const mainOil = ["poached", "steamed", "smoked"].includes(methodId) || mainId === "eggs" && methodId === "curry" ? 0 : ["schnitzel", "patties"].includes(methodId) ? 4 : (cleanActive(clean) ? 1 : 2);
  if (mainOil) ingredients.push(oil(mainOil));
  const range = `${Math.max(3, plan.minutes - 3)}–${plan.minutes + 3}`;
  steps.push({ title: "Prepare your main", detail: `For ${servings} ${servings === 1 ? "person" : "people"}, prepare ${describe([plan.ingredient], servings)}. ${plan.preparation} Wash and prepare the side vegetables; measure the separate portions listed in the steps. ${servings > 6 ? "Use several trays or cook in batches for this larger meal; allow extra time and never crowd the pan or basket." : "Keep raw animal ingredients and their utensils separate from the salad and cooked food."}`, minutes: methodId === "patties" && main.category === "plant" ? 25 : 15 });
  // Long simmers begin before fast starches. Rice/noodles should finish near service,
  // rather than being cooked and left waiting through a two-hour meat braise.
  if (!deferSides) steps.push(side.steps[0]);

  let body: DraftIngredient | undefined;
  const skipBodyBottle = (clean.fewerBottles || clean.cleanMode) && !integrated && profile.body !== "stock";
  if (!skipBodyBottle) {
    if (profile.body === "coconut") body = ingredient("coconut-milk", "Coconut milk", integrated ? 400 : 150, "ml", "grocery", [], "Unsweetened canned coconut milk.", ["coconut milk"]);
    if (profile.body === "tomato") body = ingredient("passata", "Tomato passata", integrated ? 400 : 200, "ml", "grocery", [], "Plain sieved tomatoes.", ["passata", "tomato passata"]);
  }
  if (body) ingredients.push(body);
  const sauceOil = cleanActive(clean) && !integrated ? 0.5 : 1;
  if (sauceOil > 0) ingredients.push(oil(sauceOil));
  const sauceLiquid = integrated
    ? (slowMeat ? 700 : profile.body === "stock" ? 400 : 250)
    : profile.body === "stock"
      ? (cleanActive(clean) ? 80 : 120)
      : (cleanActive(clean) ? 40 : 60);
  const liquid = stock(sauceLiquid);
  ingredients.push(liquid);
  const finish = `Remove from the heat and stir in ${describe(profile.finish, servings)}.`;
  if (!integrated) {
    equipment.add("Small saucepan");
    steps.push({ title: "Make the regional sauce", detail: `Heat ${amount(sauceOil, servings)} tbsp neutral cooking oil in a small saucepan over low-medium heat. Add ${describe(profile.aromatics, servings)} and soften for 2 minutes without burning. Add ${describe(profile.seasonings, servings)}, ${describe([liquid], servings)}${body ? ` and ${describe([body], servings)}` : ""}. Simmer gently for 4–5 minutes, stirring, until lightly reduced. ${finish} Keep warm and serve separately so any crisp coating stays crisp.`, minutes: 8 });
  }

  if (methodId === "schnitzel") {
    const flour = ingredient("coating-flour", gf ? "Rice flour" : "Plain flour", 80, "g", "grocery", gf ? [] : ["wheat"], "For the coating batter.", gf ? ["rice flour"] : ["plain flour"]);
    const breadcrumb = crumbs(140); ingredients.push(flour, breadcrumb);
    equipment.add("Wide frying pan"); equipment.add("Two shallow bowls");
    steps.push({ title: "Crumb the schnitzel", detail: `Whisk ${describe([flour], servings)} with ${amount(110, servings)} ml water to make a smooth, coating batter. Put ${describe([breadcrumb], servings)} in another shallow bowl. Dip the prepared ${main.name.toLowerCase()} in the batter, let excess drip away, then press into the crumbs on both sides. Discard any leftover coating mixture that touched raw ingredients.`, minutes: 8 });
    steps.push({ title: "Shallow-fry until crisp", detail: `Heat the ${amount(mainOil, servings)} tbsp neutral cooking oil allocated to the main in a wide frying pan over medium heat. Fry the crumbed pieces in uncrowded batches for about ${range} minutes total, turning carefully halfway, until golden on both sides. Reduce the heat if the crumbs brown too quickly. ${plan.endpoint} Drain briefly on a rack or kitchen paper.`, minutes: plan.minutes });
  } else if (methodId === "patties") {
    const breadcrumb = crumbs(main.category === "plant" ? 100 : 60);
    const binder = ingredient("cornflour", "Cornflour (corn starch)", main.category === "plant" ? 30 : 15, "g", "grocery", [], "Use pure maize starch, not wheat starch.", ["corn starch", "maize starch"]);
    ingredients.push(breadcrumb, binder); equipment.add("Mixing bowl"); equipment.add("Wide frying pan");
    steps.push({ title: "Shape the patties", detail: `Combine the prepared, ${main.category === "plant" ? "well-drained and cooled" : "chilled"} ${main.name.toLowerCase()} with ${describe([breadcrumb, binder], servings)}. ${main.category === "plant" ? "Mash or squeeze the mixture firmly so it binds; add water a teaspoon at a time only if it crumbles." : `Add ${amount(30, servings)} ml cold water and mix just until the mixture holds together.`} Shape ${servings * 2} small patties about 1.5 cm thick. Refrigerate for 15 minutes to firm up; keep raw animal mixtures chilled.`, minutes: 20 });
    steps.push({ title: "Cook the patties", detail: `Heat ${amount(mainOil, servings)} tbsp neutral cooking oil in a wide pan over medium heat. Fry the patties in batches for about ${range} minutes total, turning once carefully, until a firm crust forms on both sides. Lower the heat if the outside browns before the centre is ready. ${plan.endpoint}`, minutes: plan.minutes });
  } else if (integrated) {
    const onion = ingredient("onion", "Brown onion", 150, "g", "produce", [], "Finely diced.", ["onion", "brown onion"]);
    ingredients.push(onion); equipment.add("Heavy saucepan with lid");
    if (mainId === "eggs") steps.push({ title: "Hard-boil the eggs", detail: `Place ${amount(8, servings)} eggs in a saucepan, cover with water and bring to a gentle boil. Cook for about 10–12 minutes, until both whites and yolks are firm. Cool under running water, peel and set aside.`, minutes: 12 });
    steps.push({ title: methodId === "braised" ? "Build the braising base" : "Build the curry-style sauce", detail: `Heat ${amount(mainOil + sauceOil, servings)} tbsp neutral cooking oil in a heavy saucepan over medium heat. Soften ${describe([onion], servings)} for 5 minutes. Add ${describe(profile.aromatics, servings)} and cook for 2 minutes. Stir in ${describe(profile.seasonings, servings)}, then immediately add ${describe([liquid], servings)}${body ? ` and ${describe([body], servings)}` : ""}. Bring to a gentle simmer.`, minutes: 8 });
    steps.push({ title: methodId === "braised" ? "Braise gently" : "Simmer the main", detail: mainId === "eggs" ? `Simmer the sauce uncovered for 8 minutes, then add the peeled hard-boiled eggs and warm for 2–3 minutes, turning gently. ${plan.endpoint} ${finish}` : `Add the prepared ${main.name.toLowerCase()} to the sauce. ${main.category === "seafood" ? "Keep it at a very gentle simmer, turning the pieces carefully." : "Cover with a lid slightly ajar and keep at a low, gentle simmer, stirring occasionally."} Cook for about ${range} minutes${slowMeat ? ", or longer if needed for the meat to become fork-tender" : ""}. Add a splash of water if it catches or reduces before the main is cooked; uncover briefly to reduce if the finished sauce is too thin. ${deferSides ? `During the final ${side.minutes} minutes, prepare the sides in the following steps so they finish close to serving time. ` : ""}${plan.endpoint} ${finish}`, minutes: plan.minutes });
  } else if (methodId === "poached") {
    equipment.add("Wide saucepan with lid");
    if (mainId === "eggs") steps.push({ title: "Poach the eggs", detail: `Bring a wide pan of water to a gentle simmer. Slide each egg in from a cup; work in uncrowded batches. Keep the water gently moving, not boiling hard, and poach for about 6–8 minutes. ${plan.endpoint} Lift out with a slotted spoon and drain well.`, minutes: 8 });
    else {
      const poachingStock = stock(800); ingredients.push(poachingStock);
      steps.push({ title: "Poach gently", detail: `Put ${amount(800, servings)} ml vegetable stock (the poaching portion) in a snug saucepan, adding water as necessary to cover the prepared ${main.name.toLowerCase()} by about 1 cm. Bring to a gentle simmer, add the main, then lower the heat and cover partially. Cook for about ${range} minutes without a rolling boil. ${plan.endpoint} Lift out with a slotted spoon. Discard the poaching liquid; the regional sauce was prepared separately.`, minutes: plan.minutes });
    }
  } else if (methodId === "steamed") {
    equipment.add("Steamer with lid");
    if (mainId === "eggs") {
      equipment.add("Heatproof ramekins");
      steps.push({ title: "Steam the eggs", detail: `Beat ${amount(8, servings)} eggs with ${amount(200, servings)} ml water. Divide among heatproof ramekins, cover each loosely with foil and place in a steamer above gently simmering water. Cover and steam for about ${range} minutes. The centres must be completely set and firm, with no liquid egg; extend steaming if needed. Remove carefully with oven gloves.`, minutes: plan.minutes });
    } else steps.push({ title: "Steam the main", detail: `Bring water to a steady simmer below a steamer basket. Arrange the prepared ${main.name.toLowerCase()} in a single layer on a heatproof plate or suitable steamer liner, leaving space for steam to circulate. Cover and steam for about ${range} minutes; replenish water safely if needed. ${plan.endpoint} Lift out carefully and spoon the regional sauce over at the table.`, minutes: plan.minutes });
  } else if (methodId === "baked" || methodId === "roasted") {
    const temp = methodId === "roasted" && main.category === "plant" ? 220 : 200;
    equipment.add(mainId === "eggs" ? "Ovenproof ramekins" : "Baking tray or ovenproof dish");
    steps.push({ title: methodId === "roasted" ? "Roast the main" : "Bake the main", detail: mainId === "eggs" ? `Heat the oven to 180°C conventional (160°C fan). Divide ${amount(mainOil, servings)} tbsp neutral cooking oil between ${servings} ovenproof ramekins. Crack 2 eggs into each and set the ramekins on a baking tray. Bake for about ${range} minutes, until both whites and yolks are firm. Check and extend the time if the centre remains runny.` : `Heat the oven to ${temp}°C conventional (${temp - 20}°C fan). Toss or brush the prepared ${main.name.toLowerCase()} with ${amount(mainOil, servings)} tbsp neutral cooking oil. ${methodId === "roasted" ? "Spread in one layer on a roomy tray with space between pieces, so they brown instead of steaming." : "Arrange in a single layer in an ovenproof dish or on a lined tray."} Cook for about ${range} minutes${main.category === "plant" ? ", turning halfway" : ""}. ${plan.endpoint} Keep the regional sauce separate until serving.`, minutes: plan.minutes });
  } else if (methodId === "air-fried") {
    equipment.add("Air fryer");
    steps.push({ title: "Air-fry in batches", detail: `Preheat the air fryer to 190°C if the manufacturer recommends it. Pat the prepared ${main.name.toLowerCase()} dry and brush or toss with ${amount(mainOil, servings)} tbsp neutral cooking oil. Arrange in one uncrowded layer, using batches if needed. Cook for about ${range} minutes, turning or shaking halfway. Check early because air fryers vary. ${plan.endpoint} Allow extra time for additional batches; add the sauce after cooking.`, minutes: plan.minutes });
  } else if (methodId === "grilled") {
    equipment.add("Grill pan or barbecue");
    steps.push({ title: "Grill the main", detail: `Heat a grill pan or barbecue to medium-high. Brush the prepared ${main.name.toLowerCase()} with ${amount(mainOil, servings)} tbsp neutral cooking oil. ${mainId === "prawns" ? "Thread prawns onto metal skewers to make them easier to turn. " : mainId === "tuna" ? "Oil the grill plate so the steaks release. " : mainId === "sardines" ? "Use a fish basket so the sardines stay intact. " : main.category === "seafood" ? "Use a fish basket or a well-oiled grill plate so the fillets stay intact. " : ""}Cook for about ${range} minutes total, turning carefully halfway and adjusting the heat if it scorches. ${plan.endpoint} Add the regional sauce after grilling so the seasoning does not burn.`, minutes: plan.minutes });
    if (mainId === "prawns") equipment.add("Metal skewers");
    if (mainId === "sardines") equipment.add("Fish basket");
  } else if (methodId === "smoked") {
    equipment.add("Outdoor smoker or covered barbecue with an indirect zone");
    equipment.add("Food thermometer");
    equipment.add("Lidded roasting dish or butcher paper rated for cooking");
    const longJoint = plan.minutes >= 180;
    const plantSmoke = main.category === "plant";
    steps.push({
      title: "Start the hot smoke",
      detail: plantSmoke
        ? `Stabilise an outdoor smoker or covered barbecue at 120–140°C with an indirect zone (no flames under the food). Put the prepared ${main.name.toLowerCase()} in the indirect zone. Hot-smoke for about ${range} minutes, checking early if pieces are thin. ${plan.endpoint} Keep the regional sauce separate so sugars do not burn on the grate.`
        : `Use the smoker outdoors only. Stabilise the cooking chamber at 120–140°C and monitor grate temperature with a separate probe. Put the prepared ${main.name.toLowerCase()} in the indirect zone with a centre probe. Smoke for the first ${longJoint ? "2–3 hours" : "half of the cook"} until the surface has developed a dry bark; keep the cooker steadily hot. Never burn wood or a smoking tray in an ordinary indoor oven.`,
      minutes: longJoint ? Math.min(180, plan.minutes) : Math.max(20, Math.round(plan.minutes * 0.55)),
    });
    if (longJoint && !plantSmoke) {
      steps.push({
        title: "Manage the stall and finish",
        detail: `When the surface is set and the centre stalls (often around 70–75°C), wrap the joint with a splash of hot water in a tightly covered roasting dish or butcher paper. Continue at 130–140°C until ${plan.endpoint} Total smoke time is about ${range} minutes for this piece; thicker joints need longer. ${deferSides ? `During the final ${side.minutes} minutes, prepare the sides so they finish near service. ` : ""}`,
        minutes: Math.max(60, plan.minutes - 180),
      });
    }
    steps.push({
      title: "Rest, then slice or pull",
      detail: plantSmoke
        ? `Lift the ${main.name.toLowerCase()} carefully. ${plan.endpoint} Serve with the regional sauce at the table.`
        : `Rest the smoked ${main.name.toLowerCase()} ${longJoint ? "20–30 minutes" : "10–15 minutes"} loosely covered. Then slice across the grain, pull apart, or portion between bones as the cut allows. ${plan.endpoint} Offer the regional sauce separately so any bark stays intact.`,
      minutes: longJoint ? 25 : 12,
    });
  } else if (methodId === "stir-fried") {
    equipment.add("Wok or large frying pan");
    steps.push({ title: "Stir-fry the main", detail: `Heat a wok or large frying pan over medium-high heat. Add ${amount(mainOil, servings)} tbsp neutral cooking oil and the prepared ${main.name.toLowerCase()} in small batches. Stir-fry for about ${range} minutes per batch, turning frequently${mainId === "aubergine" || mainId === "cauliflower" || mainId === "broccoli" ? "; add a splash of water and cover briefly if the centre needs to soften" : ""}. ${plan.endpoint} Return cooked batches to the pan and toss gently with the warm regional sauce for 30 seconds.`, minutes: plan.minutes });
  } else {
    equipment.add("Wide frying pan");
    steps.push({ title: "Pan-fry the main", detail: mainId === "eggs" ? `Heat ${amount(mainOil, servings)} tbsp neutral cooking oil in a non-stick frying pan over medium-low heat. Slide in the eggs, cover and cook gently for about 6–8 minutes. Turn carefully if necessary; cook until both whites and yolks are firm. Work in batches so the eggs have space.` : `Heat ${amount(mainOil, servings)} tbsp neutral cooking oil in a wide frying pan over medium heat. Add the prepared ${main.name.toLowerCase()} in one uncrowded layer. Cook for about ${range} minutes total, turning carefully to brown the surfaces. ${["aubergine", "cauliflower", "broccoli"].includes(mainId) ? "If the centre is still firm, add a splash of water, cover briefly to soften, then uncover to evaporate the water. " : ""}${plan.endpoint} Serve the regional sauce alongside.`, minutes: plan.minutes });
  }

  if (deferSides) {
    steps.push({
      ...side.steps[0],
      title: `Near the end: ${side.steps[0].title.toLowerCase()}`,
      detail: `Cook sides alongside the main: begin this side during the final ${side.minutes} minutes of the simmer, once slow-cooking meat is nearly tender. ${side.steps[0].detail} Keep it hot and serve promptly with the finished main.`,
    });
  } else if (cleanActive(clean) && !integrated) {
    // Clearer parallel timeline when sides already started earlier.
    const firstSide = steps.findIndex((step) => side.steps[0] && step.title === side.steps[0].title);
    if (firstSide >= 0) {
      steps[firstSide] = {
        ...steps[firstSide],
        detail: `Cook this side alongside the main so both finish together. ${steps[firstSide].detail}`,
      };
    }
  }
  steps.push(...side.steps.slice(1));
  steps.push({ title: "Bring the meal together", detail: `Divide the ${side.side} and ${side.vegetables} between ${servings} ${servings === 1 ? "plate" : "plates"}. Add the ${method.name.toLowerCase()} ${main.name.toLowerCase()}${integrated ? " with its sauce" : ` and ${profile.sauce}`}. ${methodId === "schnitzel" || methodId === "patties" ? "Serve the sauce beside the main to preserve its crisp surface." : "Taste the cooked sauce before adding any extra seasoning."} Serve promptly.`, minutes: 3 });
  const stapled = applyStaples(ingredients, regionId, { glutenFree, dairyFree });
  if (stapled.served.length) steps.push({ title: "Plate the regional staple", detail: stapleStep(stapled.served, `${region.name} plate`) });
  const tidied = cleanActive(clean)
    ? tidySteps(steps, [...equipment], needsThermometer)
    : { steps, equipment: [...equipment] };
  let recipeIngredients = mergeIngredients(stapled.ingredients, servings, input.pantry);
  if (cleanActive(clean)) {
    recipeIngredients = applyCleanRounding(recipeIngredients, clean);
    recipeIngredients = applyPortionBalance(recipeIngredients, clean);
  }
  // Soft ingredient budget: drop lowest-impact duplicate oils after merge when over cap.
  if (cleanActive(clean) && recipeIngredients.length > 12) {
    const oils = recipeIngredients.filter((item) => item.id === "neutral-oil");
    if (oils.length > 1) {
      const keep = oils[0];
      const rest = recipeIngredients.filter((item) => item.id !== "neutral-oil");
      recipeIngredients = [...rest, { ...keep, amount: oils.reduce((sum, item) => sum + item.amount, 0) }];
    }
  }
  const allergens = [...new Set(recipeIngredients.flatMap((entry) => entry.allergens))].sort();
  // Patty prep includes any plant precook/cooling and a separate 15-minute chill.
  const prepMinutes = methodId === "patties" ? main.category === "plant" ? 45 : 35 : methodId === "schnitzel" ? 25 : methodId === "smoked" ? 25 : 15;
  const cookMinutes = Math.max(side.minutes, plan.minutes + (integrated ? 8 : 0)) + (servings > 6 && ["schnitzel", "pan-fried", "air-fried", "grilled", "stir-fried", "patties"].includes(methodId) ? plan.minutes : 0);
  const mainName = `${main.name} ${methodId === "schnitzel" ? "schnitzel" : methodId === "patties" ? "patties" : `· ${method.name.toLowerCase()}`}`;
  const statsDraft = mealCleanStats({ ingredients: recipeIngredients, steps: tidied.steps, equipment: tidied.equipment });
  const score = cleanlinessScore({ ingredients: recipeIngredients, steps: tidied.steps, equipment: tidied.equipment, methodId, sideId }, clean);
  const recipe: MealRecipe = {
    id: `meal-${mainId}-${methodId}-${regionId}-${sideId}-${diet}-${spiceHeat}-${servings}${chosen ? `-${chosen.id}` : ""}${cleanActive(clean) ? "-clean" : ""}`,
    classicId: `meal:${mainId}:${methodId}:${sideId}`,
    kind: "meal", mainId, methodId, sideId, regionId,
    title: `${region.name} ${mainName.toLocaleLowerCase("en")}`,
    description: `${mainName} with ${side.side}, ${side.vegetables} and ${profile.sauce}. A complete meal built around your chosen main and cooking method.`,
    fusionNote: region.id === "home-kitchen"
      ? `Home-kitchen flavour: ${region.description.charAt(0).toLowerCase() + region.description.slice(1)} This keeps the ${method.name.toLowerCase()} method and leaves out a second regional paste. It is an authored template, not a kitchen-tested traditional recipe.`
      : `This original fusion combination pairs the ${method.name.toLowerCase()} technique with ${region.description.charAt(0).toLowerCase() + region.description.slice(1)} It is inspired by regional flavours, not presented as a traditional recipe.${input.seed !== undefined ? " Aromatics, spices and herbs were sampled from this region's pantry for this seed; the signature heat stays put." : ""}${cleanActive(clean) ? " Cleaner-meal soft prefs trimmed bottles and clutter where they could; hard filters stay." : ""}`,
    components: { main: mainName, side: side.side, vegetables: side.vegetables, sauce: profile.sauce },
    prepMinutes, cookMinutes, totalMinutes: prepMinutes + cookMinutes, servings, diet, spiceHeat,
    ingredients: recipeIngredients, steps: tidied.steps, equipment: tidied.equipment,
    tags: [main.name, method.name, region.name, "Complete meal", diet, spiceHeat, ...(cleanActive(clean) ? ["Cleaner plate"] : [])], allergens,
    dietaryNotes: [
      "Ingredient and allergen information is based on the specified products. Check every packet and prevent cross-contact when cooking for an allergy.",
      ...(glutenFree ? ["Use the explicitly gluten-free condiments, stock, crumbs, noodles or flatbread listed. The couscous side uses quinoa and its own cooking method."] : []),
      ...(stapled.served.length ? [`Regional staple on this plate: ${stapled.served.map((item) => item.name).join(", ")}. Template staple, not a kitchen-tested traditional dish. Check the packet.`] : []),
      ...(diet === "vegan" || diet === "vegetarian" ? ["The selected main is retained. Pastes, stock, noodles and bread are specified without animal additions; halloumi, when selected, must use vegetarian rennet."] : []),
      ...(mainId === "paneer" ? ["Paneer is a milk cheese. It is left out of vegan and dairy-free meals."] : []),
      ...(spiceHeat === "mild" ? ["Mild reduces chilli; it does not guarantee a chilli-free meal. Paste and spice-blend strengths vary by brand."] : spiceHeat === "gentle" ? ["Gentle uses less chilli than mild. It does not guarantee a chilli-free meal. Paste and spice-blend strengths vary by brand."] : spiceHeat === "fiery" ? ["Fiery uses more chilli than hot. Paste and spice-blend strengths vary by brand; add it gradually."] : ["Taste the sauce as it cooks; chilli and spice-blend strengths vary by brand."]),
      "Times are estimates for the specified cut and thickness. Cook sides alongside the main where equipment allows; additional batches take longer.",
      "Quantities scale to the requested servings. Water for cooking, soaking and batter is specified in the steps rather than the shopping list.",
      ...(chosen ? [`Shopping name: ${chosen.shoppingName}. Check the packet. This name does not confirm a breed or a marble grade.`] : []),
      ...(cleanActive(clean) ? [cleanSummaryNote(statsDraft, clean), balanceAnnotation(recipeIngredients)] : []),
    ],
    sourceLabel: "Template-generated · not kitchen-tested", generation: "authored",
    ...(plan.safetyNote ? { safetyNote: plan.safetyNote, safetySource: plan.safetySource } : {}),
    ...(cleanActive(clean) ? {
      cleanSummary: cleanSummaryNote(statsDraft, clean),
      cleanStats: { ...statsDraft, score },
    } : {}),
  };
  const vegan = diet === "vegan" || requested.vegan === true;
  const finished = input.seed === undefined ? recipe : applySatFusion(recipe, {
    seed: input.seed,
    regionId,
    diet,
    spiceHeat,
    glutenFree: gf,
    dairyFree,
    vegan,
    vegetarian: vegan || diet === "vegetarian" || requested.vegetarian === true,
    eggFree: vegan || requested.eggFree === true,
    avoid: input.avoidAllergens,
    dislikes: input.dislikes,
    mainId,
    methodId,
    servings,
    pantry: input.pantry,
    clean,
  });
  const withPace = input.cookPace ? applyCookPace(finished, input.cookPace) : finished;
  if (!cleanActive(clean)) return withPace;
  const finalStats = mealCleanStats(withPace);
  const finalScore = cleanlinessScore(withPace, clean);
  return {
    ...withPace,
    cleanSummary: cleanSummaryNote(finalStats, clean),
    cleanStats: { ...finalStats, score: finalScore },
    dietaryNotes: [
      ...withPace.dietaryNotes.filter((note) => !/Clean plate used|Rough plate split/i.test(note)),
      cleanSummaryNote(finalStats, clean),
      balanceAnnotation(withPace.ingredients),
    ],
  };
}
