import type { DietId } from "./recipe-types.ts";
import type { MainIngredientOption, MealOption } from "./meal-types.ts";

export const COOKING_METHODS: readonly MealOption[] = [
  { id: "schnitzel", name: "Schnitzel", description: "Thin, crumbed pieces with a crisp shallow-fried crust.", emoji: "🍽️" },
  { id: "baked", name: "Baked", description: "An even oven bake, with the cut and timing matched to your main.", emoji: "🥘" },
  { id: "pan-fried", name: "Pan-fried", description: "Golden edges from a hot frying pan.", emoji: "🍳" },
  { id: "air-fried", name: "Air-fried", description: "A lightly oiled finish, cooked in uncrowded batches.", emoji: "✨" },
  { id: "poached", name: "Poached", description: "Gentle heat in liquid for tender poultry, fish or eggs.", emoji: "💧" },
  { id: "grilled", name: "Grilled", description: "A hot grill or barbecue, with measured thickness and doneness checks.", emoji: "🔥" },
  { id: "stir-fried", name: "Stir-fried", description: "Small, even pieces cooked quickly in a wok or large pan.", emoji: "🥢" },
  { id: "braised", name: "Braised", description: "A covered, gentle simmer for tender cuts, beans and vegetables.", emoji: "🫕" },
  { id: "curry", name: "Curry-style simmer", description: "A regional spice base and a rich sauce around your chosen main.", emoji: "🍛" },
  { id: "patties", name: "Patties", description: "Shaped patties, with a binder suited to meat, fish or plants.", emoji: "🧆" },
  { id: "roasted", name: "Roasted", description: "Open-tray cooking for browned edges and a concentrated flavour.", emoji: "🥔" },
  { id: "steamed", name: "Steamed", description: "Gentle steam with a regional sauce added after cooking.", emoji: "♨️" },
];

export const MAIN_INGREDIENTS: readonly MainIngredientOption[] = [
  { id: "chicken", name: "Chicken", description: "Breast, thigh or mince chosen to suit the technique.", emoji: "🍗", category: "meat", methodIds: ["schnitzel", "baked", "pan-fried", "air-fried", "poached", "grilled", "stir-fried", "braised", "curry", "patties", "roasted", "steamed"], ingredientAliases: ["chicken"] },
  { id: "turkey", name: "Turkey", description: "Lean breast for quick cooking; thigh for a gentle braise.", emoji: "🦃", category: "meat", methodIds: ["schnitzel", "baked", "pan-fried", "air-fried", "poached", "grilled", "stir-fried", "braised", "curry", "patties", "roasted", "steamed"], ingredientAliases: ["turkey"] },
  { id: "beef", name: "Beef", description: "Tender steak, slow-cooking chuck or mince, matched to the meal.", emoji: "🥩", category: "meat", methodIds: ["schnitzel", "pan-fried", "air-fried", "grilled", "stir-fried", "braised", "curry", "patties", "roasted"], ingredientAliases: ["beef"] },
  { id: "lamb", name: "Lamb", description: "Leg steaks, shoulder or mince with bold regional flavours.", emoji: "🥩", category: "meat", methodIds: ["pan-fried", "air-fried", "grilled", "stir-fried", "braised", "curry", "patties", "roasted"], ingredientAliases: ["lamb"] },
  { id: "pork", name: "Pork", description: "Loin for quick cooking, shoulder for slow cooking, mince for patties.", emoji: "🥩", category: "meat", methodIds: ["schnitzel", "baked", "pan-fried", "air-fried", "grilled", "stir-fried", "braised", "curry", "patties", "roasted"], ingredientAliases: ["pork"] },
  { id: "salmon", name: "Salmon", description: "Boneless fillets, or chopped fresh fish for patties.", emoji: "🐟", category: "seafood", methodIds: ["baked", "pan-fried", "air-fried", "poached", "grilled", "stir-fried", "curry", "patties", "roasted", "steamed"], ingredientAliases: ["salmon"] },
  { id: "white-fish", name: "White fish", description: "Firm boneless fillets, such as cod, hoki or barramundi.", emoji: "🐟", category: "seafood", methodIds: ["schnitzel", "baked", "pan-fried", "air-fried", "poached", "grilled", "curry", "patties", "roasted", "steamed"], ingredientAliases: ["white fish", "cod", "hoki", "barramundi", "haddock", "pollock", "hake", "basa"] },
  { id: "prawns", name: "Prawns", description: "Raw peeled prawns for a fast-cooking seafood meal.", emoji: "🦐", category: "seafood", methodIds: ["pan-fried", "air-fried", "poached", "grilled", "stir-fried", "curry", "steamed"], ingredientAliases: ["prawns", "prawn", "shrimp"] },
  { id: "tofu", name: "Firm tofu", description: "Pressed, firm tofu for crisp edges or a sauce-rich simmer.", emoji: "🧊", category: "plant", methodIds: ["schnitzel", "baked", "pan-fried", "air-fried", "grilled", "stir-fried", "braised", "curry", "patties", "roasted", "steamed"], ingredientAliases: ["tofu", "firm tofu", "extra firm tofu"] },
  { id: "tempeh", name: "Tempeh", description: "Plain soy tempeh, sliced or crumbled to suit the method.", emoji: "🌱", category: "plant", methodIds: ["schnitzel", "baked", "pan-fried", "air-fried", "grilled", "stir-fried", "braised", "curry", "patties", "roasted", "steamed"], ingredientAliases: ["tempeh", "soy tempeh"] },
  { id: "halloumi", name: "Halloumi", description: "Vegetarian-rennet cheese that holds its shape as it browns.", emoji: "🧀", category: "vegetarian", methodIds: ["schnitzel", "baked", "pan-fried", "air-fried", "grilled", "roasted"], ingredientAliases: ["halloumi", "haloumi"] },
  { id: "eggs", name: "Eggs", description: "Two eggs per person, paired with a full side and vegetables.", emoji: "🥚", category: "vegetarian", methodIds: ["baked", "pan-fried", "poached", "curry", "steamed"], ingredientAliases: ["egg", "eggs"] },
  { id: "chickpeas", name: "Chickpeas", description: "Cooked, drained chickpeas for patties, curries and crisp tray meals.", emoji: "🫘", category: "plant", methodIds: ["baked", "pan-fried", "air-fried", "braised", "curry", "patties", "roasted"], ingredientAliases: ["chickpeas", "garbanzo beans"] },
  { id: "lentils", name: "Lentils", description: "Cooked green or brown lentils for a warm braise, curry or patties.", emoji: "🫘", category: "plant", methodIds: ["braised", "curry", "patties"], ingredientAliases: ["lentils", "green lentils", "brown lentils"] },
  { id: "butter-beans", name: "Butter beans", description: "Cooked butter beans with creamy centres and a mild flavour.", emoji: "🫘", category: "plant", methodIds: ["baked", "pan-fried", "braised", "curry", "patties", "roasted"], ingredientAliases: ["butter beans", "lima beans"] },
  { id: "mushrooms", name: "Mushrooms", description: "Portobello caps or chunky mushrooms for a savoury plant main.", emoji: "🍄", category: "plant", methodIds: ["schnitzel", "baked", "pan-fried", "air-fried", "grilled", "stir-fried", "braised", "curry", "patties", "roasted", "steamed"], ingredientAliases: ["mushrooms", "mushroom", "portobello", "portobello mushrooms"] },
  { id: "aubergine", name: "Aubergine / eggplant", description: "Thick slices or cubes cooked until soft through the centre.", emoji: "🍆", category: "plant", methodIds: ["schnitzel", "baked", "pan-fried", "air-fried", "grilled", "stir-fried", "braised", "curry", "roasted", "steamed"], ingredientAliases: ["aubergine", "eggplant"] },
  { id: "cauliflower", name: "Cauliflower", description: "Florets or thick slices, with blanching where a crisp crust needs it.", emoji: "🥦", category: "plant", methodIds: ["schnitzel", "baked", "pan-fried", "air-fried", "grilled", "stir-fried", "braised", "curry", "patties", "roasted", "steamed"], ingredientAliases: ["cauliflower"] },
  { id: "pumpkin", name: "Pumpkin", description: "Peeled pumpkin or squash, sliced evenly for tender results.", emoji: "🎃", category: "plant", methodIds: ["baked", "pan-fried", "air-fried", "braised", "curry", "patties", "roasted", "steamed"], ingredientAliases: ["pumpkin", "butternut", "butternut squash"] },
  { id: "sweet-potato", name: "Sweet potato", description: "Peeled cubes, wedges or cooked mash for plant patties.", emoji: "🍠", category: "plant", methodIds: ["baked", "pan-fried", "air-fried", "braised", "curry", "patties", "roasted", "steamed"], ingredientAliases: ["sweet potato", "sweet potatoes"] },
  { id: "courgette", name: "Courgette / zucchini", description: "Tender slices, batons or grated courgette for quick meals.", emoji: "🥒", category: "plant", methodIds: ["schnitzel", "baked", "pan-fried", "air-fried", "grilled", "stir-fried", "braised", "curry", "patties", "roasted", "steamed"], ingredientAliases: ["courgette", "courgettes", "zucchini"] },
  { id: "broccoli", name: "Broccoli", description: "Florets and peeled stems, cooked with a little bite.", emoji: "🥦", category: "plant", methodIds: ["baked", "pan-fried", "air-fried", "stir-fried", "braised", "curry", "patties", "roasted", "steamed"], ingredientAliases: ["broccoli"] },
];

export const MEAL_REGIONS: readonly MealOption[] = [
  { id: "japanese", name: "Japanese-inspired", description: "Miso, ginger, rice vinegar and spring onion.", emoji: "🇯🇵" },
  { id: "korean", name: "Korean-inspired", description: "Gochujang, ginger, toasted sesame and rice vinegar.", emoji: "🇰🇷" },
  { id: "thai", name: "Thai-inspired", description: "Red curry paste, coconut, lime and coriander.", emoji: "🇹🇭" },
  { id: "mexican", name: "Mexican-inspired", description: "Smoked paprika, cumin, tomato, lime and coriander.", emoji: "🇲🇽" },
  { id: "indian", name: "Indian-inspired", description: "Ginger, garam masala, turmeric and lemon.", emoji: "🇮🇳" },
  { id: "levantine", name: "Levantine-inspired", description: "Cumin, sumac, lemon and parsley.", emoji: "🌿" },
  { id: "italian", name: "Italian-inspired", description: "Tomato, oregano, basil and lemon.", emoji: "🇮🇹" },
  { id: "moroccan", name: "Moroccan-inspired", description: "Harissa, cumin, cinnamon, lemon and parsley.", emoji: "🇲🇦" },
  { id: "greek", name: "Greek-inspired", description: "Oregano, garlic, lemon and dill.", emoji: "🇬🇷" },
  { id: "spanish", name: "Spanish-inspired", description: "Smoked paprika, tomato, sherry vinegar and parsley.", emoji: "🇪🇸" },
  { id: "french", name: "French-inspired", description: "Dijon mustard, thyme, lemon and parsley.", emoji: "🇫🇷" },
  { id: "vietnamese", name: "Vietnamese-inspired", description: "Lemongrass, ginger, lime and mint.", emoji: "🇻🇳" },
  { id: "chinese", name: "Chinese-inspired", description: "Ginger, five-spice, soy and spring onion.", emoji: "🇨🇳" },
  { id: "indonesian", name: "Indonesian-inspired", description: "Ginger, turmeric, soy, coconut and lime.", emoji: "🇮🇩" },
  { id: "malaysian", name: "Malaysian-inspired", description: "Lemongrass, coriander, coconut and lime.", emoji: "🇲🇾" },
  { id: "caribbean", name: "Caribbean-inspired", description: "Allspice, thyme, ginger and lime.", emoji: "🏝️" },
  { id: "peruvian", name: "Peruvian-inspired", description: "Ají amarillo, cumin, lime and coriander.", emoji: "🇵🇪" },
  { id: "ethiopian", name: "Ethiopian-inspired", description: "Berbere, ginger, tomato and lemon.", emoji: "🇪🇹" },
  { id: "turkish", name: "Turkish-inspired", description: "Paprika, cumin, tomato, sumac and parsley.", emoji: "🇹🇷" },
  { id: "brazilian", name: "Brazilian-inspired", description: "Garlic, paprika, coconut, lime and coriander.", emoji: "🇧🇷" },
];

export const MEAL_SIDES: readonly MealOption[] = [
  { id: "rice-greens", name: "Rice & greens", description: "Fluffy long-grain rice with steamed green beans.", emoji: "🍚" },
  { id: "potato-slaw", name: "Potatoes & slaw", description: "Golden potato cubes with a lemon-dressed cabbage and carrot slaw.", emoji: "🥔" },
  { id: "couscous-veg", name: "Couscous & roast veg", description: "Couscous with peppers and courgette; quinoa for gluten-free meals.", emoji: "🥗" },
  { id: "noodles-crunch", name: "Noodles & crunch", description: "Noodles with crunchy cucumber and carrot; rice noodles when gluten-free.", emoji: "🍜" },
  { id: "flatbread-salad", name: "Flatbread & salad", description: "Warm flatbread with tomato and cucumber salad.", emoji: "🫓" },
  { id: "lentil-salad", name: "Warm lentil salad", description: "Cooked lentils, baby spinach, tomato and cucumber.", emoji: "🌿" },
];

export function getMethodsForMain(mainId: string): readonly MealOption[] {
  const main = MAIN_INGREDIENTS.find((item) => item.id === mainId);
  return main ? COOKING_METHODS.filter((method) => main.methodIds.includes(method.id)) : [];
}

export function getMainsForDiet(diet: DietId = "balanced"): readonly MainIngredientOption[] {
  if (diet === "vegan") return MAIN_INGREDIENTS.filter((main) => main.category === "plant");
  if (diet === "vegetarian") return MAIN_INGREDIENTS.filter((main) => main.category === "plant" || main.category === "vegetarian");
  if (diet === "dairy-free") return MAIN_INGREDIENTS.filter((main) => main.id !== "halloumi");
  return MAIN_INGREDIENTS;
}

/** Valid main + method + region + side combinations; dietary/serving variants do not inflate the count. */
export function getMealCombinationCount(): number {
  return MAIN_INGREDIENTS.reduce((sum, main) => sum + main.methodIds.length, 0) * MEAL_REGIONS.length * MEAL_SIDES.length;
}

export const MEAL_SAFETY_SOURCES = {
  poultryAndMince: "https://www.foodstandards.gov.au/consumer/prevention-of-foodborne-illness/food-safety-basics",
  cookingTemperatures: "https://www.foodauthority.nsw.gov.au/consumer/food-safety-home/cooking-temperatures",
  eggs: "https://www.foodauthority.nsw.gov.au/consumer/food-extra-care/eggs-enjoy-safely",
} as const;
