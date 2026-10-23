import type { DietId } from "./recipe-types.ts";
import type { MainIngredientOption, MealOption } from "./meal-types.ts";
import { MEAL_REGION_OPTIONS } from "./region-pantry.ts";

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
  { id: "duck", name: "Duck", description: "Breast, thigh or mince. Poultry, so the centre reaches 75°C and it is not served pink.", emoji: "🦆", category: "meat", methodIds: ["schnitzel", "baked", "pan-fried", "air-fried", "poached", "grilled", "stir-fried", "braised", "curry", "patties", "roasted", "steamed"], ingredientAliases: ["duck"] },
  { id: "kangaroo", name: "Kangaroo", description: "Very lean steak or mince. Whole cuts rest after 71°C; mince and schnitzel reach 75°C.", emoji: "🦘", category: "meat", methodIds: ["schnitzel", "pan-fried", "air-fried", "grilled", "stir-fried", "braised", "curry", "patties", "roasted"], ingredientAliases: ["kangaroo"] },
  { id: "tuna", name: "Tuna", description: "Boneless steaks. The thickest part reaches 63°C and is not served rare.", emoji: "🐟", category: "seafood", methodIds: ["baked", "pan-fried", "air-fried", "grilled", "stir-fried", "curry", "roasted"], ingredientAliases: ["tuna", "tuna steak", "tuna steaks"] },
  { id: "sardines", name: "Sardines", description: "Fresh gutted sardines for a quick fish meal. Not a cured or smoked pack.", emoji: "🐟", category: "seafood", methodIds: ["baked", "pan-fried", "air-fried", "grilled", "roasted"], ingredientAliases: ["sardines", "sardine", "fresh sardines"] },
  { id: "black-beans", name: "Black beans", description: "Already-cooked canned black beans, drained. Not dried beans cooked from scratch.", emoji: "🫘", category: "plant", methodIds: ["baked", "pan-fried", "air-fried", "braised", "curry", "patties", "roasted"], ingredientAliases: ["black beans", "black bean"] },
  { id: "kidney-beans", name: "Kidney beans", description: "Already-cooked canned red kidney beans. Never dried kidney beans in a short cook.", emoji: "🫘", category: "plant", methodIds: ["baked", "pan-fried", "braised", "curry", "patties", "roasted"], ingredientAliases: ["kidney beans", "red kidney beans", "kidney bean"] },
  { id: "jackfruit", name: "Young jackfruit", description: "Young jackfruit in brine, drained. Not ripe fruit and not syrup.", emoji: "🌿", category: "plant", methodIds: ["baked", "pan-fried", "stir-fried", "braised", "curry", "roasted"], ingredientAliases: ["jackfruit", "young jackfruit", "green jackfruit"] },
  { id: "paneer", name: "Paneer", description: "A milk cheese that holds its shape. Not for dairy-free or vegan meals.", emoji: "🧀", category: "vegetarian", methodIds: ["schnitzel", "baked", "pan-fried", "air-fried", "grilled", "stir-fried", "curry", "roasted"], ingredientAliases: ["paneer"] },
];

export const MEAL_REGIONS: readonly MealOption[] = MEAL_REGION_OPTIONS;

export const MEAL_SIDES: readonly MealOption[] = [
  { id: "rice-greens", name: "Rice & greens", description: "Fluffy long-grain rice with steamed green beans.", emoji: "🍚" },
  { id: "potato-slaw", name: "Potatoes & slaw", description: "Golden potato cubes with a lemon-dressed cabbage and carrot slaw.", emoji: "🥔" },
  { id: "couscous-veg", name: "Couscous & roast veg", description: "Couscous with peppers and courgette; quinoa for gluten-free meals.", emoji: "🥗" },
  { id: "noodles-crunch", name: "Noodles & crunch", description: "Noodles with crunchy cucumber and carrot; rice noodles when gluten-free.", emoji: "🍜" },
  { id: "flatbread-salad", name: "Flatbread & salad", description: "Warm flatbread with tomato and cucumber salad.", emoji: "🫓" },
  { id: "lentil-salad", name: "Warm lentil salad", description: "Cooked lentils, baby spinach, tomato and cucumber.", emoji: "🌿" },
  { id: "garden-salad", name: "Garden salad", description: "Lettuce, tomato and cucumber with a lemon olive-oil dressing.", emoji: "🥬" },
  { id: "mashed-potato", name: "Mashed potato", description: "Creamy mash; olive-oil mash when dairy-free. Steamed peas on the side.", emoji: "🥔" },
  { id: "roast-pumpkin", name: "Roast pumpkin", description: "Tray-roasted pumpkin with wilted spinach.", emoji: "🎃" },
  { id: "steamed-broccoli", name: "Steamed broccoli", description: "Broccoli florets with lemon and a small pot of jasmine rice.", emoji: "🥦" },
  { id: "garlic-bread", name: "Garlic bread & salad", description: "Garlic bread (wheat) with tomato salad; labelled gluten-free bread when filtered.", emoji: "🥖" },
];

export function getMethodsForMain(mainId: string): readonly MealOption[] {
  const main = MAIN_INGREDIENTS.find((item) => item.id === mainId);
  return main ? COOKING_METHODS.filter((method) => main.methodIds.includes(method.id)) : [];
}

export function getMainsForDiet(diet: DietId = "balanced"): readonly MainIngredientOption[] {
  if (diet === "vegan") return MAIN_INGREDIENTS.filter((main) => main.category === "plant");
  if (diet === "vegetarian") return MAIN_INGREDIENTS.filter((main) => main.category === "plant" || main.category === "vegetarian");
  if (diet === "dairy-free") return MAIN_INGREDIENTS.filter((main) => main.id !== "halloumi" && main.id !== "paneer");
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
