import type { DietId, IngredientCategory, RecipeIngredient, RecipeStep, SpiceHeat } from "./recipe-types.ts";
import type { MainIngredientOption, MealInput, MealRecipe, NormalizedMealInput } from "./meal-types.ts";
import { COOKING_METHODS, MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SAFETY_SOURCES, MEAL_SIDES, getMainsForDiet } from "./meal-catalog.ts";
import { applyStaples, canonAllergen, stapleStep } from "./staples.ts";

export { COOKING_METHODS, MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SAFETY_SOURCES, MEAL_SIDES, getMethodsForMain, getMainsForDiet, getMealCombinationCount } from "./meal-catalog.ts";
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
const HEAT_IDS: readonly SpiceHeat[] = ["mild", "medium", "hot"];
const SLOW_METHODS = new Set(["braised", "curry"]);
const LEGUMES = new Set(["chickpeas", "lentils", "butter-beans"]);
const ROOTS = new Set(["pumpkin", "sweet-potato"]);

function ingredient(id: string, name: string, amount: number, unit: string, category: IngredientCategory = "grocery", allergens: string[] = [], notes?: string, aliases?: readonly string[]): DraftIngredient {
  return { id, name, amount, unit, category, allergens, ...(notes ? { notes } : {}), ...(aliases ? { aliases } : {}) };
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
  if (dairyFree && main.id === "halloumi") throw new Error(`${main.name} does not fit the dairy-free preference. Select a compatible main ingredient.`);
  if (eggFree && main.id === "eggs") throw new Error("Eggs do not fit an egg-free preference. Select a compatible main ingredient.");
  const spiceHeat = input.spiceHeat ?? "medium";
  if (!HEAT_IDS.includes(spiceHeat)) throw new Error("Choose mild, medium or hot.");
  if (!Number.isInteger(input.servings) || input.servings < 1 || input.servings > 12) throw new Error("Servings must be a whole number between 1 and 12.");
  if (input.pantry !== undefined) {
    if (typeof input.pantry === "string") {
      if (input.pantry.length > 8000) throw new Error("Keep the pantry list under 8,000 characters.");
    } else if (!Array.isArray(input.pantry) || input.pantry.length > 100 || !input.pantry.every((entry) => typeof entry === "string" && entry.length <= 200)) {
      throw new Error("The pantry must be text or a list of up to 100 ingredient names.");
    }
  }
  return { mainId: main.id, methodId: input.methodId, regionId: input.regionId, sideId, servings: input.servings, diet, spiceHeat, ...(input.pantry !== undefined ? { pantry: input.pantry } : {}) };
}

function amount(value: number, servings: number): string {
  return String(Number((value * servings / 4).toFixed(4)));
}

function describe(items: readonly DraftIngredient[], servings: number): string {
  return items.map((item) => `${amount(item.amount, servings)}${item.unit ? ` ${item.unit}` : ""} ${item.name.toLocaleLowerCase("en")}`).join(", ");
}

function regionalProfile(regionId: string, glutenFree: boolean, heat: SpiceHeat): RegionProfile {
  const gf = glutenFree;
  const hot = { mild: 0.25, medium: 1, hot: 1.75 }[heat];
  const garlic = ingredient("garlic", "Garlic", 15, "g", "produce", [], "Peeled and finely minced.", ["garlic cloves"]);
  const ginger = ingredient("ginger", "Fresh ginger", 15, "g", "produce", [], "Peeled and finely grated.", ["ginger"]);
  const lemon = ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.");
  const lime = ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.");
  const herbs = (id: string, name: string) => ingredient(id, name, 15, "g", "produce", [], "Washed and finely chopped.", [id]);
  const spice = (id: string, name: string, quantity = 1) => ingredient(id, name, quantity, "tsp");
  const soy = ingredient("soy-sauce", gf ? "Gluten-free tamari" : "Soy sauce", 2, "tbsp", "grocery", gf ? ["soy"] : ["soy", "wheat"], gf ? "Choose a product explicitly labelled gluten-free." : undefined, gf ? ["gluten free tamari", "gluten-free soy sauce"] : ["soy sauce"]);
  const vinegar = ingredient("rice-vinegar", "Rice vinegar", 1, "tbsp");
  const sesame = ingredient("sesame-seeds", "Toasted sesame seeds", 1, "tbsp", "grocery", ["sesame"], "Use ready-toasted seeds.", ["toasted sesame seeds"]);
  const profiles: Record<string, RegionProfile> = {
    japanese: { sauce: "miso, ginger & spring onion sauce", aromatics: [garlic, ginger], seasonings: [ingredient("miso", gf ? "Gluten-free white miso" : "White miso", 1.5, "tbsp", "specialty", ["soy"], "Use a rice-based miso; check the label for other allergens.", gf ? ["gluten free white miso", "gluten-free miso"] : ["white miso", "rice miso"]), soy], finish: [vinegar, herbs("spring-onion", "Spring onion"), sesame], body: "stock" },
    korean: { sauce: "gochujang & sesame sauce", aromatics: [garlic, ginger], seasonings: [ingredient("gochujang", gf ? "Gluten-free vegan gochujang" : "Vegan gochujang", 2 * hot, "tbsp", "specialty", gf ? ["soy"] : ["soy", "wheat"], "Choose a vegan product; heat varies by brand.", gf ? ["gluten free vegan gochujang", "gluten-free gochujang"] : ["vegan gochujang"]), soy], finish: [vinegar, herbs("spring-onion", "Spring onion"), sesame], body: "stock" },
    thai: { sauce: "coconut, red curry & lime sauce", aromatics: [garlic, ginger], seasonings: [ingredient("red-curry-paste", gf ? "Gluten-free vegan red curry paste" : "Vegan red curry paste", 2 * hot, "tbsp", "specialty", [], "Choose a paste without fish sauce or shrimp; check allergens and heat.", gf ? ["gluten free vegan red curry paste"] : ["vegan red curry paste"])], finish: [lime, herbs("coriander", "Fresh coriander")], body: "coconut" },
    mexican: { sauce: "smoky cumin, tomato & lime sauce", aromatics: [garlic], seasonings: [spice("cumin", "Ground cumin", 1.5), spice("smoked-paprika", "Smoked paprika", 1.5)], finish: [lime, herbs("coriander", "Fresh coriander")], body: "tomato" },
    indian: { sauce: "ginger, garam masala & coconut sauce", aromatics: [garlic, ginger], seasonings: [spice("garam-masala", "Garam masala", 2), spice("turmeric", "Ground turmeric", 0.5)], finish: [lemon, herbs("coriander", "Fresh coriander")], body: "coconut" },
    levantine: { sauce: "cumin, sumac & lemon sauce", aromatics: [garlic], seasonings: [spice("cumin", "Ground cumin", 1.5), spice("sumac", "Ground sumac", 1.5)], finish: [lemon, herbs("parsley", "Flat-leaf parsley")], body: "stock" },
    italian: { sauce: "tomato, oregano & basil sauce", aromatics: [garlic], seasonings: [spice("oregano", "Dried oregano", 1.5)], finish: [lemon, herbs("basil", "Fresh basil")], body: "tomato" },
    moroccan: { sauce: "harissa, cumin & lemon sauce", aromatics: [garlic], seasonings: [ingredient("harissa", "Harissa paste", 1.5 * hot, "tbsp", "specialty", [], "Check the label; chilli strength varies.", ["harissa"]), spice("cumin", "Ground cumin", 1.5), spice("cinnamon", "Ground cinnamon", 0.25)], finish: [lemon, herbs("parsley", "Flat-leaf parsley")], body: "tomato" },
    greek: { sauce: "lemon, oregano & dill sauce", aromatics: [garlic], seasonings: [spice("oregano", "Dried oregano", 1.5)], finish: [lemon, herbs("dill", "Fresh dill")], body: "stock" },
    spanish: { sauce: "smoked paprika & tomato sauce", aromatics: [garlic], seasonings: [spice("smoked-paprika", "Smoked paprika", 2)], finish: [ingredient("sherry-vinegar", "Sherry vinegar", 1, "tbsp", "grocery", ["sulphites"], "Check the product label for sulphites."), herbs("parsley", "Flat-leaf parsley")], body: "tomato" },
    french: { sauce: "Dijon, thyme & lemon sauce", aromatics: [garlic], seasonings: [ingredient("dijon-mustard", "Dijon mustard", 1.5, "tbsp", "grocery", ["mustard"]), spice("thyme", "Dried thyme", 1)], finish: [lemon, herbs("parsley", "Flat-leaf parsley")], body: "stock" },
    vietnamese: { sauce: "lemongrass, lime & mint sauce", aromatics: [garlic, ginger, ingredient("lemongrass", "Lemongrass", 20, "g", "produce", [], "Tender inner part only, very finely minced.")], seasonings: [soy], finish: [lime, herbs("mint", "Fresh mint")], body: "stock" },
    chinese: { sauce: "ginger, five-spice & spring onion sauce", aromatics: [garlic, ginger], seasonings: [soy, spice("five-spice", "Chinese five-spice", 0.5)], finish: [vinegar, herbs("spring-onion", "Spring onion"), sesame], body: "stock" },
    indonesian: { sauce: "ginger, turmeric & coconut sauce", aromatics: [garlic, ginger], seasonings: [soy, spice("turmeric", "Ground turmeric", 0.5), spice("ground-coriander", "Ground coriander", 1.5)], finish: [lime, herbs("coriander", "Fresh coriander")], body: "coconut" },
    malaysian: { sauce: "lemongrass, coriander & coconut sauce", aromatics: [garlic, ginger, ingredient("lemongrass", "Lemongrass", 20, "g", "produce", [], "Tender inner part only, very finely minced.")], seasonings: [spice("ground-coriander", "Ground coriander", 2), spice("turmeric", "Ground turmeric", 0.5)], finish: [lime, herbs("coriander", "Fresh coriander")], body: "coconut" },
    caribbean: { sauce: "allspice, thyme & lime sauce", aromatics: [garlic, ginger], seasonings: [spice("allspice", "Ground allspice", 1), spice("thyme", "Dried thyme", 1.5)], finish: [lime, herbs("spring-onion", "Spring onion")], body: "stock" },
    peruvian: { sauce: "ají amarillo, cumin & lime sauce", aromatics: [garlic], seasonings: [ingredient("aji-amarillo", "Ají amarillo paste", 1.5 * hot, "tbsp", "specialty", [], "Choose a plain chilli paste and check allergens; strength varies."), spice("cumin", "Ground cumin", 1)], finish: [lime, herbs("coriander", "Fresh coriander")], body: "stock" },
    ethiopian: { sauce: "berbere, ginger & tomato sauce", aromatics: [garlic, ginger], seasonings: [spice("berbere", "Berbere spice blend", 2 * hot)], finish: [lemon, herbs("parsley", "Flat-leaf parsley")], body: "tomato" },
    turkish: { sauce: "paprika, sumac & tomato sauce", aromatics: [garlic], seasonings: [spice("paprika", "Sweet paprika", 1.5), spice("cumin", "Ground cumin", 1), spice("sumac", "Ground sumac", 1)], finish: [lemon, herbs("parsley", "Flat-leaf parsley")], body: "tomato" },
    brazilian: { sauce: "garlic, paprika & coconut-lime sauce", aromatics: [garlic], seasonings: [spice("paprika", "Sweet paprika", 1.5)], finish: [lime, herbs("coriander", "Fresh coriander")], body: "coconut" },
  };
  const profile = profiles[regionId];
  if (!["korean", "thai", "moroccan", "peruvian", "ethiopian"].includes(regionId)) profile.seasonings.push(spice("chilli-flakes", "Chilli flakes", { mild: 0.125, medium: 0.5, hot: 1 }[heat]));
  return profile;
}

const COOK_TIMES: Record<string, Record<string, number>> = {
  chicken: { schnitzel: 12, baked: 25, "pan-fried": 15, "air-fried": 18, poached: 20, grilled: 16, "stir-fried": 9, braised: 40, curry: 25, patties: 15, roasted: 30, steamed: 20 },
  turkey: { schnitzel: 12, baked: 25, "pan-fried": 15, "air-fried": 18, poached: 22, grilled: 16, "stir-fried": 9, braised: 50, curry: 30, patties: 15, roasted: 30, steamed: 22 },
  beef: { schnitzel: 10, "pan-fried": 12, "air-fried": 14, grilled: 12, "stir-fried": 7, braised: 120, curry: 110, patties: 14, roasted: 22 },
  lamb: { "pan-fried": 12, "air-fried": 14, grilled: 12, "stir-fried": 7, braised: 110, curry: 100, patties: 14, roasted: 24 },
  pork: { schnitzel: 12, baked: 25, "pan-fried": 14, "air-fried": 16, grilled: 14, "stir-fried": 8, braised: 110, curry: 100, patties: 15, roasted: 25 },
  salmon: { baked: 16, "pan-fried": 10, "air-fried": 12, poached: 12, grilled: 12, "stir-fried": 8, curry: 12, patties: 14, roasted: 16, steamed: 12 },
  "white-fish": { schnitzel: 10, baked: 18, "pan-fried": 10, "air-fried": 12, poached: 12, grilled: 12, curry: 12, patties: 14, roasted: 18, steamed: 12 },
  prawns: { "pan-fried": 6, "air-fried": 8, poached: 6, grilled: 6, "stir-fried": 6, curry: 7, steamed: 7 },
  tofu: { schnitzel: 12, baked: 25, "pan-fried": 12, "air-fried": 18, grilled: 12, "stir-fried": 10, braised: 20, curry: 18, patties: 14, roasted: 25, steamed: 12 },
  tempeh: { schnitzel: 12, baked: 25, "pan-fried": 12, "air-fried": 18, grilled: 12, "stir-fried": 10, braised: 20, curry: 20, patties: 14, roasted: 25, steamed: 18 },
  halloumi: { schnitzel: 8, baked: 15, "pan-fried": 6, "air-fried": 10, grilled: 6, roasted: 15 },
  eggs: { baked: 18, "pan-fried": 8, poached: 8, curry: 20, steamed: 18 },
  chickpeas: { baked: 25, "pan-fried": 12, "air-fried": 16, braised: 20, curry: 20, patties: 16, roasted: 30 },
  lentils: { braised: 15, curry: 15, patties: 16 },
  "butter-beans": { baked: 25, "pan-fried": 12, braised: 20, curry: 20, patties: 16, roasted: 25 },
  mushrooms: { schnitzel: 12, baked: 22, "pan-fried": 12, "air-fried": 15, grilled: 12, "stir-fried": 9, braised: 25, curry: 20, patties: 16, roasted: 25, steamed: 12 },
  aubergine: { schnitzel: 14, baked: 30, "pan-fried": 18, "air-fried": 20, grilled: 16, "stir-fried": 15, braised: 30, curry: 25, roasted: 30, steamed: 18 },
  cauliflower: { schnitzel: 14, baked: 30, "pan-fried": 15, "air-fried": 20, grilled: 16, "stir-fried": 12, braised: 25, curry: 25, patties: 16, roasted: 30, steamed: 12 },
  pumpkin: { baked: 35, "pan-fried": 18, "air-fried": 22, braised: 25, curry: 25, patties: 16, roasted: 35, steamed: 18 },
  "sweet-potato": { baked: 35, "pan-fried": 18, "air-fried": 22, braised: 25, curry: 25, patties: 16, roasted: 35, steamed: 18 },
  courgette: { schnitzel: 10, baked: 22, "pan-fried": 10, "air-fried": 14, grilled: 10, "stir-fried": 8, braised: 18, curry: 18, patties: 16, roasted: 22, steamed: 8 },
  broccoli: { baked: 22, "pan-fried": 12, "air-fried": 15, "stir-fried": 10, braised: 18, curry: 18, patties: 16, roasted: 22, steamed: 9 },
};

function mainPlan(main: MainIngredientOption, method: string): MainPlan {
  const id = main.id;
  const slow = SLOW_METHODS.has(method);
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
  if (["chicken", "turkey"].includes(id)) {
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
  } else if (main.category === "seafood") {
    allergens = id === "prawns" ? ["crustaceans"] : ["fish"];
    name = id === "prawns" ? "Raw peeled, deveined prawns" : id === "salmon" ? "Boneless skinless salmon fillets" : "Firm boneless skinless white fish fillets";
    preparation = id === "prawns" ? "Use thawed raw prawns, remove any remaining shells and veins, and pat dry." : patty ? "Check carefully for bones, then finely chop the raw fish with a knife. Keep chilled until shaping." : slow || quickPieces ? "Check carefully for bones and cut into chunky 3 cm pieces." : "Check carefully for bones and portion into fillets no thicker than 2.5 cm.";
    endpoint = patty ? "The centre of each patty must reach 75°C on a clean food thermometer; cook longer if needed." : id === "prawns" ? "Cook until the prawns are opaque throughout and the thickest part reaches 63°C. Avoid overcooking once this endpoint is reached." : "Cook until the thickest part reaches 63°C on a clean food thermometer and the flesh is opaque and flakes easily.";
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
  } else if (id === "eggs") {
    name = "Eggs"; quantity = 8; unit = ""; allergens = ["egg"];
    preparation = method === "curry" ? "Use clean, intact eggs and keep them whole in their shells for boiling. Discard any cracked or damaged egg." : "Use intact, clean eggs. Crack each into a separate cup before adding it to the pan or ramekin; discard any damaged egg.";
    endpoint = "Cook until both the whites and yolks are firm; extend the cooking time if the centre is still runny.";
    safetySource = MEAL_SAFETY_SOURCES.eggs;
  } else if (LEGUMES.has(id)) {
    name = id === "chickpeas" ? "Canned chickpeas, drained" : id === "lentils" ? "Canned green or brown lentils, drained" : "Canned butter beans, drained";
    preparation = "Use already-cooked canned pulses: the ingredient quantity is the drained weight. Drain, rinse and pat very dry." + (patty ? " Mash coarsely, leaving a little texture." : "");
    endpoint = "Heat until steaming hot throughout; the pulses are already cooked. Do not substitute uncooked dried beans or lentils directly.";
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

function sidePlan(sideId: string, glutenFree: boolean, servings: number): SidePlan {
  const gf = glutenFree;
  const s = (title: string, detail: string, minutes: number): RecipeStep => ({ title, detail, minutes });
  const oil = (quantity: number) => ingredient("olive-oil", "Olive oil", quantity, "tbsp", "grocery", [], undefined, ["olive oil"]);
  const lemon = ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.");
  if (sideId === "rice-greens") return {
    side: "fluffy long-grain rice", vegetables: "steamed green beans",
    ingredients: [ingredient("rice", "Long-grain rice", 300, "g", "grocery", [], "Dry weight.", ["rice", "long grain rice"]), ingredient("green-beans", "Green beans", 400, "g", "produce", [], "Trimmed.", ["green beans"])],
    steps: [s("Start the rice", `Rinse ${amount(300, servings)} g long-grain rice. Add to a saucepan with ${amount(600, servings)} ml water, bring to a boil, then cover and cook on the lowest heat for about 12–15 minutes or as the packet directs. Rest covered for 5 minutes, then fluff.`, 20), s("Steam the green beans", `Trim ${amount(400, servings)} g green beans. Steam for 5–7 minutes until tender with a little bite; keep warm briefly while finishing the main.`, 7)],
    equipment: ["Saucepan with lid", "Steamer or colander over a saucepan"], minutes: 22,
  };
  if (sideId === "potato-slaw") return {
    side: "golden pan-roasted potatoes", vegetables: "lemon-dressed cabbage & carrot slaw",
    ingredients: [ingredient("potatoes", "Potatoes", 800, "g", "produce", [], "Cut into 1.5 cm cubes."), ingredient("cabbage", "Cabbage", 250, "g", "produce", [], "Finely shredded."), ingredient("carrot", "Carrot", 200, "g", "produce", [], "Coarsely grated."), oil(3), lemon],
    steps: [s("Cook the potatoes", `Cut ${amount(800, servings)} g potatoes into 1.5 cm cubes. Simmer in water for 8–10 minutes until just tender, then drain and steam-dry. Heat ${amount(2, servings)} tbsp olive oil in a wide pan and turn the potatoes over medium-high heat for 10–12 minutes until golden. Cook in batches if crowded.`, 25), s("Dress the slaw", `Combine ${amount(250, servings)} g finely shredded cabbage and ${amount(200, servings)} g grated carrot. Toss with ${amount(30, servings)} ml lemon juice and the remaining ${amount(1, servings)} tbsp olive oil allocated to this side.`, 5)], equipment: ["Saucepan", "Wide frying pan", "Mixing bowl", "Grater"], minutes: 25,
  };
  if (sideId === "couscous-veg") return {
    side: gf ? "fluffy quinoa" : "fluffy couscous", vegetables: "pan-roasted pepper & courgette",
    ingredients: [gf ? ingredient("quinoa", "Quinoa", 280, "g", "grocery", [], "Dry weight; replaces couscous for gluten-free meals.") : ingredient("couscous", "Couscous", 280, "g", "grocery", ["wheat"], "Dry weight."), ingredient("pepper", "Red pepper", 300, "g", "produce", [], "Deseeded and cut into 2 cm pieces.", ["capsicum", "red capsicum"]), ingredient("courgette", "Courgette (zucchini)", 300, "g", "produce", [], "Cut into 2 cm pieces.", ["courgette", "zucchini"]), oil(1.5)],
    steps: [s(gf ? "Cook the quinoa" : "Fluff the couscous", gf ? `Rinse ${amount(280, servings)} g quinoa. Add ${amount(560, servings)} ml water, bring to a boil and simmer covered for about 15 minutes until the liquid is absorbed. Rest covered for 5 minutes, then fluff. Check the packet if it specifies a different ratio.` : `Put ${amount(280, servings)} g couscous in a heatproof bowl. Pour over ${amount(350, servings)} ml boiling water, cover for 5 minutes and fluff with a fork. Follow the packet if it requires a different water ratio.`, gf ? 22 : 7), s("Pan-roast the vegetables", `Heat ${amount(1.5, servings)} tbsp olive oil in a wide frying pan. Add ${amount(300, servings)} g chopped red pepper and ${amount(300, servings)} g chopped courgette. Cook over medium-high heat for 10–12 minutes, turning occasionally, until browned at the edges and tender. Use batches if needed.`, 12)], equipment: gf ? ["Saucepan with lid", "Wide frying pan"] : ["Heatproof bowl", "Wide frying pan"], minutes: gf ? 22 : 15,
  };
  if (sideId === "noodles-crunch") return {
    side: gf ? "rice noodles" : "wheat noodles", vegetables: "crunchy cucumber & carrot",
    ingredients: [gf ? ingredient("noodles", "Gluten-free rice noodles", 280, "g", "grocery", [], "Dry weight; choose a labelled gluten-free product.", ["gluten free rice noodles"]) : ingredient("noodles", "Egg-free wheat noodles", 280, "g", "grocery", ["wheat"], "Dry weight; check the label for egg and dairy.", ["egg free wheat noodles"]), ingredient("cucumber", "Cucumber", 300, "g", "produce", [], "Cut into thin batons."), ingredient("carrot", "Carrot", 200, "g", "produce", [], "Cut into thin matchsticks."), oil(1), lemon],
    steps: [s("Cook the noodles", `Cook ${amount(280, servings)} g ${gf ? "gluten-free rice noodles" : "egg-free wheat noodles"} according to the packet; thickness and soaking requirements vary. Drain well, rinse only if the packet advises it, and toss with ${amount(1, servings)} tbsp olive oil to prevent sticking.`, 10), s("Add the crunch", `Cut ${amount(300, servings)} g cucumber into thin batons and ${amount(200, servings)} g carrot into matchsticks. Toss with ${amount(30, servings)} ml lemon juice. Keep this crunchy mixture separate until serving.`, 5)], equipment: ["Saucepan", "Colander", "Mixing bowl"], minutes: 15,
  };
  if (sideId === "flatbread-salad") return {
    side: gf ? "warm gluten-free flatbread" : "warm flatbread", vegetables: "tomato & cucumber salad",
    ingredients: [ingredient("flatbread", gf ? "Gluten-free vegan flatbread" : "Vegan wheat flatbread", 4, "", "grocery", gf ? [] : ["wheat"], "Choose a ready-cooked flatbread without milk or egg.", gf ? ["gluten free vegan flatbread"] : ["vegan wheat flatbread"]), ingredient("tomato", "Tomatoes", 350, "g", "produce", [], "Chopped.", ["tomatoes", "tomato"]), ingredient("cucumber", "Cucumber", 300, "g", "produce", [], "Chopped."), oil(1), lemon],
    steps: [s("Make the chopped salad", `Combine ${amount(350, servings)} g chopped tomatoes and ${amount(300, servings)} g chopped cucumber. Dress with ${amount(30, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil just before serving.`, 6), s("Warm the flatbread", `Warm ${amount(4, servings)} ${gf ? "gluten-free vegan" : "vegan wheat"} flatbreads in a dry frying pan for about 30–60 seconds per side, or as the packet directs. Keep wrapped in a clean tea towel.`, 5)], equipment: ["Mixing bowl", "Frying pan"], minutes: 10,
  };
  return {
    side: "warm lentils", vegetables: "spinach, tomato & cucumber salad",
    ingredients: [ingredient("lentils", "Canned green or brown lentils, drained", 600, "g", "grocery", [], "Already cooked; use drained weight.", ["lentils", "green lentils", "brown lentils"]), ingredient("spinach", "Baby spinach", 100, "g", "produce", [], "Washed."), ingredient("tomato", "Tomatoes", 250, "g", "produce", [], "Chopped.", ["tomatoes", "tomato"]), ingredient("cucumber", "Cucumber", 250, "g", "produce", [], "Chopped."), oil(1), lemon],
    steps: [s("Warm the lentils", `Drain and rinse ${amount(600, servings)} g already-cooked canned lentils (drained weight). Warm in a saucepan with ${amount(60, servings)} ml water for 4–5 minutes until steaming hot, then drain any excess. Do not use uncooked dried lentils here.`, 6), s("Toss the lentil salad", `Fold ${amount(100, servings)} g washed baby spinach into the warm lentils to wilt lightly. Add ${amount(250, servings)} g chopped tomatoes and ${amount(250, servings)} g chopped cucumber, then dress with ${amount(30, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil.`, 5)], equipment: ["Saucepan", "Mixing bowl"], minutes: 12,
  };
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
  return [...merged.values()].map(({ aliases, ...entry }) => ({ ...entry, amount: Number((entry.amount * servings / 4).toFixed(4)), inPantry: [entry.name, ...(aliases ?? [])].some((term) => available.has(normalizeTerm(term))) }));
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
  const plan = mainPlan(main, methodId);
  const profile = regionalProfile(regionId, glutenFree, spiceHeat);
  const side = sidePlan(sideId, glutenFree, servings);
  const gf = glutenFree;
  const integrated = SLOW_METHODS.has(methodId);
  const slowMeat = main.category === "meat" && !["chicken", "turkey"].includes(mainId) && integrated;
  const deferSides = integrated && plan.minutes > side.minutes + 5;
  const ingredients: DraftIngredient[] = [plan.ingredient, ...side.ingredients, ...profile.aromatics, ...profile.seasonings, ...profile.finish];
  const steps: RecipeStep[] = [];
  const equipment = new Set<string>(["Chopping board and knife", ...side.equipment]);
  if (main.category === "meat" || main.category === "seafood") equipment.add("Food thermometer");
  const oil = (quantity: number) => ingredient("neutral-oil", "Neutral cooking oil", quantity, "tbsp", "grocery", [], "For example, rapeseed or sunflower oil.", ["neutral cooking oil", "rapeseed oil", "sunflower oil"]);
  const stock = (quantity: number) => ingredient("vegetable-stock", gf ? "Gluten-free vegetable stock" : "Vegetable stock", quantity, "ml", "grocery", ["celery"], "Prepared liquid stock; use a vegan product and check its label for allergens.", gf ? ["gluten free vegetable stock"] : ["vegetable stock"]);
  const crumbs = (quantity: number) => ingredient("breadcrumbs", gf ? "Gluten-free vegan breadcrumbs" : "Vegan breadcrumbs", quantity, "g", "grocery", gf ? [] : ["wheat"], "Choose crumbs without milk or egg.", gf ? ["gluten free vegan breadcrumbs"] : ["vegan breadcrumbs"]);
  const mainOil = ["poached", "steamed"].includes(methodId) || mainId === "eggs" && methodId === "curry" ? 0 : ["schnitzel", "patties"].includes(methodId) ? 4 : 2;
  if (mainOil) ingredients.push(oil(mainOil));
  const range = `${Math.max(3, plan.minutes - 3)}–${plan.minutes + 3}`;
  steps.push({ title: "Prepare your main", detail: `For ${servings} ${servings === 1 ? "person" : "people"}, prepare ${describe([plan.ingredient], servings)}. ${plan.preparation} Wash and prepare the side vegetables; measure the separate portions listed in the steps. ${servings > 6 ? "Use several trays or cook in batches for this larger meal; allow extra time and never crowd the pan or basket." : "Keep raw animal ingredients and their utensils separate from the salad and cooked food."}`, minutes: methodId === "patties" && main.category === "plant" ? 25 : 15 });
  // Long simmers begin before fast starches. Rice/noodles should finish near service,
  // rather than being cooked and left waiting through a two-hour meat braise.
  if (!deferSides) steps.push(side.steps[0]);

  let body: DraftIngredient | undefined;
  if (profile.body === "coconut") body = ingredient("coconut-milk", "Coconut milk", integrated ? 400 : 150, "ml", "grocery", [], "Unsweetened canned coconut milk.", ["coconut milk"]);
  if (profile.body === "tomato") body = ingredient("passata", "Tomato passata", integrated ? 400 : 200, "ml", "grocery", [], "Plain sieved tomatoes.", ["passata", "tomato passata"]);
  if (body) ingredients.push(body);
  const sauceOil = 1;
  ingredients.push(oil(sauceOil));
  const sauceLiquid = integrated ? (slowMeat ? 700 : profile.body === "stock" ? 400 : 250) : profile.body === "stock" ? 120 : 60;
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
    steps.push({ title: "Grill the main", detail: `Heat a grill pan or barbecue to medium-high. Brush the prepared ${main.name.toLowerCase()} with ${amount(mainOil, servings)} tbsp neutral cooking oil. ${mainId === "prawns" ? "Thread prawns onto metal skewers to make them easier to turn. " : main.category === "seafood" ? "Use a fish basket or a well-oiled grill plate so the fillets stay intact. " : ""}Cook for about ${range} minutes total, turning carefully halfway and adjusting the heat if it scorches. ${plan.endpoint} Add the regional sauce after grilling so the seasoning does not burn.`, minutes: plan.minutes });
    if (mainId === "prawns") equipment.add("Metal skewers");
  } else if (methodId === "stir-fried") {
    equipment.add("Wok or large frying pan");
    steps.push({ title: "Stir-fry the main", detail: `Heat a wok or large frying pan over medium-high heat. Add ${amount(mainOil, servings)} tbsp neutral cooking oil and the prepared ${main.name.toLowerCase()} in small batches. Stir-fry for about ${range} minutes per batch, turning frequently${mainId === "aubergine" || mainId === "cauliflower" || mainId === "broccoli" ? "; add a splash of water and cover briefly if the centre needs to soften" : ""}. ${plan.endpoint} Return cooked batches to the pan and toss gently with the warm regional sauce for 30 seconds.`, minutes: plan.minutes });
  } else {
    equipment.add("Wide frying pan");
    steps.push({ title: "Pan-fry the main", detail: mainId === "eggs" ? `Heat ${amount(mainOil, servings)} tbsp neutral cooking oil in a non-stick frying pan over medium-low heat. Slide in the eggs, cover and cook gently for about 6–8 minutes. Turn carefully if necessary; cook until both whites and yolks are firm. Work in batches so the eggs have space.` : `Heat ${amount(mainOil, servings)} tbsp neutral cooking oil in a wide frying pan over medium heat. Add the prepared ${main.name.toLowerCase()} in one uncrowded layer. Cook for about ${range} minutes total, turning carefully to brown the surfaces. ${["aubergine", "cauliflower", "broccoli"].includes(mainId) ? "If the centre is still firm, add a splash of water, cover briefly to soften, then uncover to evaporate the water. " : ""}${plan.endpoint} Serve the regional sauce alongside.`, minutes: plan.minutes });
  }

  if (deferSides) steps.push({ ...side.steps[0], title: `Near the end: ${side.steps[0].title.toLowerCase()}`, detail: `Begin this side during the final ${side.minutes} minutes of the main's simmer, once slow-cooking meat is nearly tender. ${side.steps[0].detail} Keep it hot and serve promptly with the finished main.` });
  steps.push(...side.steps.slice(1));
  steps.push({ title: "Bring the meal together", detail: `Divide the ${side.side} and ${side.vegetables} between ${servings} ${servings === 1 ? "plate" : "plates"}. Add the ${method.name.toLowerCase()} ${main.name.toLowerCase()}${integrated ? " with its sauce" : ` and ${profile.sauce}`}. ${methodId === "schnitzel" || methodId === "patties" ? "Serve the sauce beside the main to preserve its crisp surface." : "Taste the cooked sauce before adding any extra seasoning."} Serve promptly.`, minutes: 3 });
  const stapled = applyStaples(ingredients, regionId, { glutenFree, dairyFree });
  if (stapled.served.length) steps.push({ title: "Plate the regional staple", detail: stapleStep(stapled.served, `${region.name} plate`) });
  const recipeIngredients = mergeIngredients(stapled.ingredients, servings, input.pantry);
  const allergens = [...new Set(recipeIngredients.flatMap((entry) => entry.allergens))].sort();
  // Patty prep includes any plant precook/cooling and a separate 15-minute chill.
  const prepMinutes = methodId === "patties" ? main.category === "plant" ? 45 : 35 : methodId === "schnitzel" ? 25 : 15;
  const cookMinutes = Math.max(side.minutes, plan.minutes + (integrated ? 8 : 0)) + (servings > 6 && ["schnitzel", "pan-fried", "air-fried", "grilled", "stir-fried", "patties"].includes(methodId) ? plan.minutes : 0);
  const mainName = `${main.name} ${methodId === "schnitzel" ? "schnitzel" : methodId === "patties" ? "patties" : `· ${method.name.toLowerCase()}`}`;
  return {
    id: `meal-${mainId}-${methodId}-${regionId}-${sideId}-${diet}-${spiceHeat}-${servings}`,
    classicId: `meal:${mainId}:${methodId}:${sideId}`,
    kind: "meal", mainId, methodId, sideId, regionId,
    title: `${region.name} ${mainName.toLocaleLowerCase("en")}`,
    description: `${mainName} with ${side.side}, ${side.vegetables} and ${profile.sauce}. A complete meal built around your chosen main and cooking method.`,
    fusionNote: `This original fusion combination pairs the ${method.name.toLowerCase()} technique with ${region.description.charAt(0).toLowerCase() + region.description.slice(1)} It is inspired by regional flavours, not presented as a traditional recipe.`,
    components: { main: mainName, side: side.side, vegetables: side.vegetables, sauce: profile.sauce },
    prepMinutes, cookMinutes, totalMinutes: prepMinutes + cookMinutes, servings, diet, spiceHeat,
    ingredients: recipeIngredients, steps, equipment: [...equipment],
    tags: [main.name, method.name, region.name, "Complete meal", diet, spiceHeat], allergens,
    dietaryNotes: [
      "Ingredient and allergen information is based on the specified products. Check every packet and prevent cross-contact when cooking for an allergy.",
      ...(glutenFree ? ["Use the explicitly gluten-free condiments, stock, crumbs, noodles or flatbread listed. The couscous side uses quinoa and its own cooking method."] : []),
      ...(stapled.served.length ? [`Regional staple on this plate: ${stapled.served.map((item) => item.name).join(", ")}. Template staple, not a kitchen-tested traditional dish. Check the packet.`] : []),
      ...(diet === "vegan" || diet === "vegetarian" ? ["The selected main is retained. Pastes, stock, noodles and bread are specified without animal additions; halloumi, when selected, must use vegetarian rennet."] : []),
      ...(spiceHeat === "mild" ? ["Mild reduces chilli; it does not guarantee a chilli-free meal. Paste and spice-blend strengths vary by brand."] : ["Taste the sauce as it cooks; chilli and spice-blend strengths vary by brand."]),
      "Times are estimates for the specified cut and thickness. Cook sides alongside the main where equipment allows; additional batches take longer.",
      "Quantities scale to the requested servings. Water for cooking, soaking and batter is specified in the steps rather than the shopping list.",
    ],
    sourceLabel: "Template-generated · not kitchen-tested", generation: "authored",
    ...(plan.safetyNote ? { safetyNote: plan.safetyNote, safetySource: plan.safetySource } : {}),
  };
}
