import type {
  DietId, IngredientCategory, Recipe, RecipeIngredient, RecipeInput, RecipeOption, SpiceHeat,
} from "./recipe-types.ts";

export type { DietId, IngredientCategory, Recipe, RecipeIngredient, RecipeInput, RecipeStep, SpiceHeat } from "./recipe-types.ts";

import type { BaseRecipe, DraftIngredient, Profile, RecipeContext } from "./template-types.ts";
import { BBQ_CLASSICS, bbqBaseFor } from "./bbq-classics.ts";
import { BBQ_REGIONS, bbqProfileFor } from "./bbq-regions.ts";

export const CLASSICS: RecipeOption[] = [
  { id: "pasta", name: "Creamy pasta", origin: "Italy", emoji: "🍝", description: "Silky sauce, golden mushrooms and a familiar bowl of comfort." },
  { id: "tacos", name: "Street-style tacos", origin: "Mexico", emoji: "🌮", description: "Warm tortillas, a savoury filling and a fresh, crunchy finish." },
  { id: "risotto", name: "Mushroom risotto", origin: "Italy", emoji: "🍚", description: "Slow-stirred rice that carries a whole new flavour story." },
  { id: "burgers", name: "Classic burgers", origin: "United States", emoji: "🍔", description: "A juicy patty, toasted bun and your own signature sauce." },
  { id: "roast", name: "Sunday traybake", origin: "Britain", emoji: "🥔", description: "A generous tray of roast potatoes, vegetables and a seasoned centrepiece." },
  { id: "fried-rice", name: "Fried rice", origin: "China", emoji: "🥢", description: "A colourful, quick-cooking pan of rice and vegetables." },
  { id: "flatbread", name: "Loaded flatbread", origin: "Mediterranean", emoji: "🫓", description: "Crisp bread with roasted vegetables, chickpeas and a creamy finish." },
  { id: "cottage-pie", name: "Cottage pie", origin: "Britain", emoji: "🥧", description: "A hearty savoury filling beneath a golden mashed-potato lid." },
  ...BBQ_CLASSICS,
];

export const REGIONS: RecipeOption[] = [
  { id: "japanese", name: "Japanese", emoji: "🇯🇵", description: "Miso, fresh ginger, sesame and spring onion." },
  { id: "korean", name: "Korean", emoji: "🇰🇷", description: "Gochujang, sesame, rice vinegar and spring onion." },
  { id: "thai", name: "Thai", emoji: "🇹🇭", description: "Red curry, ginger, lime and fresh coriander." },
  { id: "mexican", name: "Mexican", emoji: "🇲🇽", description: "Smoked paprika, cumin, lime and coriander." },
  { id: "indian", name: "Indian", emoji: "🇮🇳", description: "Garam masala, ginger, turmeric and lemon." },
  { id: "levantine", name: "Levantine", emoji: "🌿", description: "Sumac, cumin, tahini, lemon and parsley." },
  { id: "italian", name: "Italian", emoji: "🇮🇹", description: "Tomato, oregano, basil and bright lemon." },
  { id: "moroccan", name: "Moroccan", emoji: "🇲🇦", description: "Ras el hanout, harissa, lemon and mint." },
  ...BBQ_REGIONS,
];

export const DIETS: RecipeOption[] = [
  { id: "balanced", name: "No restriction", description: "Use the original ingredients for this adaptation." },
  { id: "vegetarian", name: "Vegetarian", description: "Vegetable proteins; dairy and eggs may be included." },
  { id: "vegan", name: "Vegan", description: "Plant-based proteins, sauces and dairy alternatives." },
  { id: "gluten-free", name: "Gluten-free", description: "Use labelled gluten-free grains, breads and condiments." },
  { id: "dairy-free", name: "Dairy-free", description: "Use plant-based alternatives to milk, butter and yogurt." },
];

const FOOD_SAFETY_SOURCE = "https://www.foodstandards.gov.au/consumer/prevention-of-foodborne-illness/food-safety-basics";

function ingredient(id: string, name: string, amount: number, unit: string, category: IngredientCategory = "grocery", allergens: string[] = [], notes?: string, aliases?: string[]): DraftIngredient {
  return { id, name, amount, unit, category, allergens, ...(notes ? { notes } : {}), ...(aliases ? { aliases } : {}) };
}

const produce = (id: string, name: string, amount: number, unit: string, notes?: string, aliases?: string[]) => ingredient(id, name, amount, unit, "produce", [], notes, aliases);
const oliveOil = (amount: number) => ingredient("olive-oil", "Olive oil", amount, "tbsp");
const garlic = (amount: number) => produce("garlic", "Garlic", amount, "cloves", "Finely chop or grate.");
const onion = (amount = 1) => produce("brown-onion", "Brown onion", amount, "", "Finely dice.", ["onion", "brown onions"]);
const salt = () => ingredient("salt", "Salt", 0.5, "tsp", "grocery", [], "Use less with salty condiments; adjust at the table.");
const stock = (amount: number, gf: boolean) => ingredient("vegetable-stock", gf ? "Gluten-free vegetable stock" : "Vegetable stock", amount, "ml", "grocery", [], "Use a vegan stock. Check the label for your dietary needs.");

function profileFor(regionId: string, diet: DietId, heat: SpiceHeat): Profile {
  const gf = diet === "gluten-free";
  const chilliAmount = { mild: 0, medium: 0.25, hot: 0.75 }[heat];
  const chilli = chilliAmount ? [ingredient("chilli-flakes", "Chilli flakes", chilliAmount, "tsp", "grocery", [], "Add gradually to your taste.", ["chili flakes", "red pepper flakes"])] : [];
  const ginger = () => produce("fresh-ginger", "Fresh ginger", 20, "g", "Finely grate.", ["ginger"]);
  const springOnion = () => produce("spring-onion", "Spring onions", 3, "", "Thinly slice.", ["scallions", "green onions", "spring onion"]);
  const lemon = () => produce("lemon", "Lemon", 1, "", "Zest first, then juice; use to taste.");
  const lime = () => produce("lime", "Lime", 1, "", "Zest first, then juice; use to taste.");
  const coriander = () => produce("coriander", "Fresh coriander", 15, "g", "Roughly chop.", ["cilantro", "coriander"]);
  const profiles: Record<string, Profile> = {
    japanese: {
      title: "Miso-ginger", tags: ["Savoury", "Ginger", "Sesame"],
      warm: [ingredient("miso", gf ? "Gluten-free rice miso" : "White miso", 2, "tbsp", "specialty", ["soy"], "Choose a plant-based miso; for gluten-free, use a specifically labelled product.", gf ? ["gluten-free rice miso"] : ["white miso", "miso"]), ginger(), ...chilli],
      finish: [ingredient("rice-vinegar", "Rice vinegar", 1, "tbsp"), ingredient("sesame-oil", "Toasted sesame oil", 1, "tsp", "grocery", ["sesame"]), ingredient("sesame-seeds", "Sesame seeds", 1, "tbsp", "grocery", ["sesame"]), springOnion()],
      note: "The classic technique stays familiar while miso and ginger deepen the savoury base. Sesame and spring onion bring a bright finish.",
    },
    korean: {
      title: "Gochujang-sesame", tags: ["Sweet heat", "Sesame", "Tangy"],
      warm: [ingredient("gochujang", gf ? "Gluten-free gochujang" : "Gochujang", { mild: 0.5, medium: 1.5, hot: 2.5 }[heat], "tbsp", "specialty", gf ? ["soy"] : ["soy", "wheat"], "Choose a vegan product. Mild still has some chilli heat; check the label.", [gf ? "gluten-free gochujang" : "gochujang"]), ingredient("soy-sauce", gf ? "Gluten-free tamari" : "Soy sauce", 1, "tbsp", "grocery", gf ? ["soy"] : ["soy", "wheat"]), ginger()],
      finish: [ingredient("rice-vinegar", "Rice vinegar", 1, "tbsp"), ingredient("sesame-oil", "Toasted sesame oil", 1, "tsp", "grocery", ["sesame"]), ingredient("sesame-seeds", "Sesame seeds", 1, "tbsp", "grocery", ["sesame"]), springOnion()],
      note: "Gochujang brings gentle sweetness and chilli warmth to the classic's savoury base. A rice-vinegar and sesame finish keeps it lively.",
    },
    thai: {
      title: "Red-curry & lime", tags: ["Aromatic", "Lime", "Fresh herbs"],
      warm: [ingredient("red-curry-paste", gf ? "Gluten-free vegan red curry paste" : "Vegan red curry paste", { mild: 0.5, medium: 1, hot: 2 }[heat], "tbsp", "specialty", [], "Check for shrimp paste or fish sauce; choose a vegan-labelled paste. Mild still has chilli.", [gf ? "gluten-free vegan red curry paste" : "vegan red curry paste"]), ginger()],
      finish: [lime(), coriander()],
      note: "Red-curry aromatics season the familiar base; lime zest and coriander are added at the end for freshness. This is a Thai-inspired adaptation.",
    },
    mexican: {
      title: "Smoky cumin & lime", tags: ["Smoky", "Citrus", "Cumin"],
      warm: [ingredient("cumin", "Ground cumin", 1.5, "tsp", "grocery", [], undefined, ["cumin"]), ingredient("smoked-paprika", "Smoked paprika", 2, "tsp"), ...chilli],
      finish: [lime(), coriander()],
      note: "Cumin and smoked paprika give the classic a warm, smoky centre. Fresh lime and coriander balance the richness.",
    },
    indian: {
      title: "Ginger-masala", tags: ["Warming spice", "Ginger", "Citrus"],
      warm: [ingredient("garam-masala", "Garam masala", 2, "tsp", "grocery", [], "Use an unsalted blend and check the label."), ingredient("turmeric", "Ground turmeric", 0.5, "tsp", "grocery", [], undefined, ["turmeric"]), ginger(), ...chilli],
      finish: [lemon(), coriander()],
      note: "Ginger, turmeric and a measured amount of garam masala add warmth while preserving the classic's texture. Lemon lifts the finished dish.",
    },
    levantine: {
      title: "Lemon-sumac & tahini", tags: ["Lemony", "Nutty", "Herbaceous"],
      warm: [ingredient("cumin", "Ground cumin", 1, "tsp", "grocery", [], undefined, ["cumin"]), ingredient("sumac", "Sumac", 2, "tsp", "specialty", [], "Use pure sumac and check the label."), ...chilli],
      finish: [ingredient("tahini", "Tahini", 2, "tbsp", "grocery", ["sesame"]), lemon(), produce("parsley", "Flat-leaf parsley", 15, "g", "Roughly chop.", ["parsley"])],
      note: "Lemon and sumac bring tartness to the classic, while a loose tahini dressing adds richness without dairy.",
    },
    italian: {
      title: "Tomato-basil", tags: ["Tomato", "Basil", "Comforting"],
      warm: [ingredient("tomato-paste", "Tomato paste", 2, "tbsp"), ingredient("oregano", "Dried oregano", 1, "tsp", "grocery", [], undefined, ["oregano"]), ...chilli],
      finish: [produce("basil", "Fresh basil", 15, "g", "Tear the leaves.", ["basil"]), lemon()],
      note: "Concentrated tomato and oregano build a savoury base. Basil and a little lemon give the classic a fresh Italian-inspired finish.",
    },
    moroccan: {
      title: "Harissa & warm spice", tags: ["Warm spice", "Mint", "Lemon"],
      warm: [ingredient("ras-el-hanout", "Ras el hanout", 2, "tsp", "specialty", [], "Choose an unsalted spice blend and check the label."), ingredient("harissa", "Harissa paste", { mild: 0.5, medium: 1, hot: 2 }[heat], "tsp", "specialty", [], "Choose a vegan paste; chilli strength varies by brand.")],
      finish: [lemon(), produce("mint", "Fresh mint", 10, "g", "Finely slice.", ["mint"])],
      note: "Ras el hanout and a little harissa give the base rounded warmth. Fresh mint and lemon keep the result balanced.",
    },
  };
  const profile = profiles[regionId] ?? bbqProfileFor(regionId, diet, heat);
  if (!profile) throw new Error("Choose a supported region.");
  return profile;
}

function names(items: DraftIngredient[]): string {
  return items.map((item) => item.name.toLowerCase()).join(", ");
}

function finishText(context: RecipeContext, style: "dressing" | "sauce" | "stir" = "stir"): string {
  const ingredients = names(context.profile.finish);
  if (style === "sauce") return `Mix the ${ingredients} into the yogurt. If using tahini, first loosen it with a little water. Use citrus or vinegar gradually to taste.`;
  if (style === "dressing") return `Combine the ${ingredients} in a small bowl. Loosen tahini, if included, with a little water. Add citrus or vinegar gradually to taste, then spoon over the finished dish.`;
  return `Take off the heat and fold in the ${ingredients}. If tahini is included, loosen it with a little warm water first. Add citrus or vinegar gradually to taste.`;
}

function yogurt(context: RecipeContext, amount: number): DraftIngredient {
  return context.dairyFree
    ? ingredient("plain-soy-yogurt", "Plain unsweetened soy yogurt", amount, "g", "grocery", ["soy"], "Choose a dairy-free, unflavoured yogurt.", ["plain soy yogurt", "unsweetened soy yogurt"])
    : ingredient("plain-yogurt", "Plain Greek yogurt", amount, "g", "grocery", ["milk"], undefined, ["greek yogurt", "plain yogurt"]);
}

function baseFor(context: RecipeContext): BaseRecipe {
  const barbecue = bbqBaseFor(context);
  if (barbecue) return barbecue;
  const { input, profile, vegan, vegetarian, dairyFree, glutenFree } = context;
  const warm = names(profile.warm);
  const herbs = "Prepare the fresh herbs and citrus from your finishing ingredients.";
  switch (input.classicId) {
    case "pasta": {
      const cream = dairyFree || input.regionId === "thai"
        ? ingredient("coconut-milk", "Coconut milk", 180, "ml", "grocery", [], "Use unsweetened coconut milk.")
        : ingredient("cream", "Cooking cream", 180, "ml", "grocery", ["milk"]);
      return {
        name: "creamy mushroom pasta", description: "Golden mushrooms, a silky sauce and a fresh regional finish, wrapped around your favourite pasta.", prep: 10, cook: 20,
        equipment: ["Large saucepan", "Wide frying pan", "Colander"],
        ingredients: [ingredient("pasta", glutenFree ? "Gluten-free pasta" : "Dried egg-free pasta", 320, "g", "grocery", glutenFree ? [] : ["wheat"], "Choose a plant-based pasta; follow the packet cooking time."), produce("mushrooms", "Mushrooms", 400, "g", "Slice."), onion(), garlic(3), oliveOil(2), cream, salt()],
        steps: [
          { title: "Get everything ready", detail: `Slice the mushrooms, dice the onion and chop the garlic. ${herbs} Bring a large pan of water to the boil.`, minutes: 10 },
          { title: "Cook the pasta", detail: "Cook the pasta according to its packet instructions. Before draining, reserve a mug of the cooking water.", minutes: 10 },
          { title: "Build the mushroom base", detail: "While the pasta cooks, warm the olive oil in a wide pan. Soften the onion for 3 minutes, add mushrooms and cook for 6–8 minutes until golden, then add garlic for 30 seconds." },
          { title: "Bring the flavours together", detail: `Lower the heat and stir in the ${warm}. Add the ${cream.name.toLowerCase()} and a splash of pasta water; gently warm for 2–3 minutes without boiling hard. Toss in the pasta, adding water until the sauce coats it.` },
          { title: "Finish and serve", detail: `${finishText(context)} Taste, add salt only as needed, and serve straightaway.` },
        ],
      };
    }
    case "tacos": {
      const filling = vegetarian
        ? ingredient("firm-tofu", "Firm tofu", 500, "g", "grocery", ["soy"], "Drain, pat dry and cut into small cubes.", ["firm tofu"])
        : ingredient("chicken-thigh", "Boneless chicken thighs", 500, "g", "butcher", [], "Cut into small, even pieces.", ["chicken thighs", "boneless chicken thighs"]);
      return {
        name: vegetarian ? "crispy tofu tacos" : "chicken tacos", description: "A sizzling filling, warm tortillas and plenty of crunch, with a new flavour direction.", prep: 15, cook: 15,
        equipment: ["Large frying pan", "Chopping board", "Food thermometer for chicken"], meat: !vegetarian,
        ingredients: [filling, ingredient("corn-tortillas", glutenFree ? "Gluten-free corn tortillas" : vegan ? "Vegan corn tortillas" : "Corn tortillas", 8, "", "grocery", [], "Choose tortillas without dairy; for vegan recipes, check for any animal-derived ingredients."), produce("cabbage", "Cabbage", 200, "g", "Finely shred."), produce("tomatoes", "Tomatoes", 200, "g", "Dice."), produce("avocado", "Avocado", 1, "", "Slice."), garlic(2), oliveOil(2), salt()],
        steps: [
          { title: "Prepare the filling and crunch", detail: `${vegetarian ? "Pat the tofu dry and cut into small cubes." : "Cut chicken into small, even pieces, then wash your hands and clean the board."} Shred the cabbage, dice the tomatoes and slice the avocado. ${herbs}` },
          { title: "Sear the filling", detail: `Heat the olive oil in a wide pan and add the ${vegetarian ? "tofu" : "chicken"}. Cook for ${vegetarian ? "8–10" : "6–8"} minutes, turning until golden.` },
          { title: "Add the regional flavour", detail: `Lower the heat. Add the garlic and ${warm}, plus a splash of water to prevent sticking. Cook for another 2–3 minutes.${vegetarian ? "" : " Check the centre of the largest chicken pieces reaches at least 75°C; continue cooking if needed."} Taste the cooked filling and adjust salt.` },
          { title: "Warm and fill", detail: "Warm the tortillas according to their packet instructions. Divide the filling, cabbage, tomatoes and avocado between them." },
          { title: "Finish at the table", detail: finishText(context, "dressing") },
        ],
      };
    }
    case "risotto": return {
      name: "mushroom risotto", description: "Tender rice and golden mushrooms slowly stirred into a rich, aromatic bowl.", prep: 10, cook: 35,
      equipment: ["Wide, heavy saucepan", "Small saucepan", "Ladle"],
      ingredients: [ingredient("risotto-rice", "Arborio risotto rice", 320, "g", "grocery", [], undefined, ["arborio rice", "risotto rice"]), produce("mushrooms", "Mushrooms", 400, "g", "Slice."), onion(), garlic(3), oliveOil(3), stock(1200, glutenFree), salt()],
      steps: [
        { title: "Prepare the stock and vegetables", detail: `Warm the stock in a small saucepan. Slice the mushrooms, dice the onion and chop the garlic. ${herbs}` },
        { title: "Build the base", detail: "Heat the olive oil in a heavy saucepan. Soften the onion for 4 minutes, then add the mushrooms and cook until lightly golden. Add garlic and rice, stirring for 1 minute." },
        { title: "Stir and simmer", detail: "Add a ladle of warm stock and stir. Add more a ladle at a time as it is absorbed, keeping the rice gently simmering. Continue for 18–25 minutes until tender with a little bite; add extra water if needed." },
        { title: "Layer in the seasoning", detail: `Mix the ${warm} with a little warm stock and stir into the rice for its final 3 minutes of cooking. Keep the texture loose and spoonable.` },
        { title: "Rest, then finish", detail: `${finishText(context)} Cover for 2 minutes, taste and add salt if needed. Loosen with a splash of hot water before serving.` },
      ],
    };
    case "burgers": {
      const protein = vegetarian
        ? [ingredient("chickpeas", "Canned chickpeas, drained", 600, "g", "grocery", [], "Drain and pat very dry; amount is drained weight.", ["canned chickpeas", "chickpeas"]), ingredient("rolled-oats", "Rolled oats", 60, "g", "grocery", ["oats"]), ingredient("cornflour", "Cornflour", 2, "tbsp", "grocery", [], undefined, ["cornstarch"])]
        : [ingredient("beef-mince", "Beef mince", 600, "g", "butcher", [], undefined, ["ground beef"] )];
      return {
        name: vegetarian ? "chickpea burgers" : "beef burgers", description: "A well-seasoned patty, crisp salad and a bright yogurt sauce in a toasted bun.", prep: vegetarian ? 25 : 15, cook: 15,
        equipment: ["Mixing bowl", "Frying pan", "Food thermometer for meat"], meat: !vegetarian,
        ingredients: [...protein, ingredient("burger-buns", glutenFree ? "Gluten-free burger buns" : vegan ? "Vegan burger buns" : "Dairy-free burger buns", 4, "", "grocery", glutenFree ? [] : ["wheat"], "Check the label; choose egg-free buns for vegan recipes."), onion(), garlic(2), oliveOil(2), produce("lettuce", "Lettuce", 80, "g"), produce("tomatoes", "Tomatoes", 2, "", "Slice."), yogurt(context, 120), salt()],
        steps: [
          { title: "Make the patties", detail: `Finely dice the onion and garlic. ${vegetarian ? "Mash the very dry chickpeas until mostly smooth. Mix in the oats, cornflour, onion and garlic." : "Gently combine the beef mince with the onion and garlic."} Add the ${warm} and a little salt. Shape into ${input.servings} evenly sized patties.${vegetarian ? " If the mixture is dry, add water a teaspoon at a time; chill for 10 minutes." : " Wash your hands and clean surfaces after handling raw meat."}` },
          { title: "Prepare the sauce and salad", detail: `${herbs} ${finishText(context, "sauce")} Wash the lettuce and slice the tomatoes.` },
          { title: "Cook the burgers", detail: `Heat olive oil in a frying pan over medium heat. Cook patties for around 5–7 minutes per side, turning carefully.${vegetarian ? " Let a firm crust form before turning; cook until hot throughout." : " Use a food thermometer to check the centre of every patty reaches at least 75°C; time alone is not a doneness check."}` },
          { title: "Toast and assemble", detail: "Toast the buns. Add lettuce, tomato, a cooked patty and the prepared sauce. Serve immediately." },
        ],
      };
    }
    case "roast": {
      const protein = vegetarian
        ? ingredient("chickpeas", "Canned chickpeas, drained", 600, "g", "grocery", [], "Drain well; amount is drained weight.", ["chickpeas", "canned chickpeas"])
        : ingredient("chicken-thigh", "Bone-in chicken thighs", 1000, "g", "butcher", [], "About 4 large thighs for 4 servings.", ["bone-in chicken thighs"]);
      return {
        name: vegetarian ? "chickpea & vegetable traybake" : "roast chicken traybake", description: "Golden potatoes, sweet carrots and a generous centrepiece, finished with bright herbs and citrus.", prep: 15, cook: vegetarian ? 40 : 50,
        equipment: ["Large roasting tray", "Mixing bowl", "Food thermometer for chicken"], meat: !vegetarian,
        ingredients: [protein, produce("potatoes", "Potatoes", 700, "g", "Cut into 2 cm pieces."), produce("carrots", "Carrots", 400, "g", "Cut into thick batons."), produce("red-onion", "Red onions", 2, "", "Cut into wedges."), garlic(4), oliveOil(3), salt()],
        steps: [
          { title: "Heat the oven and prepare", detail: `Heat the oven to 200°C conventional / 180°C fan. Cut potatoes into 2 cm pieces, carrots into batons and onions into wedges. ${herbs}` },
          { title: "Season the tray", detail: `Mix olive oil, garlic and the ${warm} with a splash of water. ${vegetarian ? "Toss the vegetables with two-thirds of the mixture and a little salt. Reserve the rest for the chickpeas." : "Coat chicken and vegetables with the mixture and a little salt. Wash your hands and clean utensils after handling raw chicken."} Arrange in a spacious roasting tray.` },
          { title: "Roast until ready", detail: vegetarian ? "Roast the vegetables for 25 minutes. Toss chickpeas with the reserved seasoning, add to the tray and roast for another 15 minutes, until potatoes are tender and chickpeas are hot." : "Roast for 40–50 minutes, turning the vegetables halfway. If the seasoning browns too quickly, loosely cover the tray. Check chicken reaches at least 75°C in its thickest part, away from bone; continue roasting if needed. Potatoes should be tender." },
          { title: "Finish and share", detail: `${finishText(context, "dressing")} Serve the traybake hot.` },
        ],
      };
    }
    case "fried-rice": {
      const protein = vegan ? ingredient("firm-tofu", "Firm tofu", 300, "g", "grocery", ["soy"], "Drain and crumble.", ["firm tofu"]) : ingredient("eggs", "Eggs", 4, "", "grocery", ["egg"]);
      return {
        name: vegan ? "vegetable & tofu fried rice" : "vegetable & egg fried rice", description: "A colourful pan of tender rice, crisp vegetables and a bold regional seasoning.", prep: 10, cook: 30,
        equipment: ["Saucepan", "Large frying pan or wok", "Spatula"],
        ingredients: [ingredient("jasmine-rice", "Jasmine rice, uncooked", 300, "g", "grocery", [], undefined, ["jasmine rice"]), protein, produce("carrots", "Carrots", 2, "", "Finely dice."), ingredient("peas", "Frozen peas", 150, "g"), garlic(3), oliveOil(2), salt()],
        steps: [
          { title: "Cook the rice", detail: "Cook rice following its packet instructions. Spread it on a clean tray while you finish preparing the vegetables, then use it straightaway in this recipe. Do not store the cooked rice on the bench." },
          { title: "Prepare the vegetables", detail: `Finely dice the carrots and chop the garlic. ${herbs} ${vegan ? "Drain and crumble the tofu." : "Beat the eggs in a bowl."}` },
          { title: "Cook the vegetables and protein", detail: `Heat olive oil in a wide pan or wok. Stir-fry carrots for 4 minutes, then peas for 2 minutes. Add garlic. ${vegan ? "Add crumbled tofu and cook for 3–4 minutes until hot and lightly golden." : "Push vegetables aside, add the eggs and scramble until fully set."}` },
          { title: "Fry the rice", detail: `Add the ${warm} and a splash of water; stir for 30 seconds. Add the cooked rice and stir-fry for 3–4 minutes, breaking up clumps until everything is steaming hot. Work in batches if the pan is crowded.` },
          { title: "Finish and eat", detail: `${finishText(context)} Taste before adding any salt. Serve immediately.` },
        ],
      };
    }
    case "flatbread": return {
      name: "roasted chickpea flatbreads", description: "Crisp flatbreads loaded with roasted vegetables, seasoned chickpeas and a fresh sauce.", prep: 10, cook: 30,
      equipment: ["Baking tray", "Mixing bowl", "Oven"],
      ingredients: [ingredient("flatbreads", glutenFree ? "Gluten-free flatbreads" : "Vegan flatbreads", 4, "", "grocery", glutenFree ? [] : ["wheat"], "Choose dairy-free, egg-free flatbreads for vegan recipes."), ingredient("chickpeas", "Canned chickpeas, drained", 500, "g", "grocery", [], "Drain well; amount is drained weight.", ["chickpeas", "canned chickpeas"]), produce("zucchini", "Zucchini", 2, "", "Cut into half-moons.", ["courgette", "courgettes"]), produce("red-onion", "Red onion", 1, "", "Slice."), produce("cherry-tomatoes", "Cherry tomatoes", 200, "g", "Halve."), garlic(2), oliveOil(2), yogurt(context, 150), salt()],
      steps: [
        { title: "Prepare the topping", detail: "Heat the oven to 200°C conventional / 180°C fan. Drain the chickpeas, cut zucchini into half-moons, slice onion and halve the tomatoes." },
        { title: "Roast the vegetables", detail: `Toss chickpeas, zucchini, onion and tomatoes with olive oil, garlic, the ${warm} and a little salt. Spread on a large tray and roast for 20–25 minutes, stirring halfway, until tender and golden.` },
        { title: "Make the finishing sauce", detail: `${herbs} ${finishText(context, "sauce")}` },
        { title: "Crisp the flatbreads", detail: "Warm flatbreads according to their packet instructions, or until their edges are crisp. Spoon over the hot roasted vegetables and chickpeas." },
        { title: "Finish and slice", detail: "Spoon over the prepared yogurt sauce. Cut into pieces and serve straightaway." },
      ],
    };
    case "cottage-pie": {
      const protein = vegetarian ? ingredient("lentils", "Canned lentils, drained", 600, "g", "grocery", [], "Drain well; amount is drained weight.", ["lentils", "canned lentils"]) : ingredient("beef-mince", "Beef mince", 600, "g", "butcher", [], undefined, ["ground beef"]);
      const milk = dairyFree ? ingredient("soy-milk", "Unsweetened soy milk", 150, "ml", "grocery", ["soy"], "Use an unflavoured dairy-free milk.", ["unsweetened soy milk"]) : ingredient("milk", "Milk", 150, "ml", "grocery", ["milk"]);
      return {
        name: vegetarian ? "lentil cottage pie" : "cottage pie", description: "A deeply savoury filling with a golden mashed-potato top and an unexpected regional finish.", prep: 15, cook: 45,
        equipment: ["Saucepan", "Large frying pan", "Ovenproof baking dish", "Potato masher"], meat: !vegetarian,
        ingredients: [protein, produce("potatoes", "Potatoes", 900, "g", "Peel if preferred, then cut into chunks."), onion(), produce("carrots", "Carrots", 2, "", "Finely dice."), ingredient("peas", "Frozen peas", 150, "g"), garlic(3), oliveOil(3), ingredient("passata", "Tomato passata", 250, "ml", "grocery", [], undefined, ["passata"]), stock(150, glutenFree), milk, salt()],
        steps: [
          { title: "Prepare the mash", detail: `Heat oven to 200°C conventional / 180°C fan. Cut potatoes into even chunks and boil for 15–20 minutes until tender. Drain, then mash with the ${milk.name.toLowerCase()}, one-third of the olive oil and a little salt.` },
          { title: "Cook the filling", detail: `While the potatoes cook, warm the remaining oil in a large pan. Soften the diced onion and carrots for 6 minutes. Add garlic and ${vegetarian ? "drained lentils" : "beef mince, breaking it into small pieces and cooking until browned"}. Stir in the ${warm}.` },
          { title: "Simmer until thick", detail: `Add passata, stock and peas. Simmer for 10–12 minutes until the filling is thick enough to hold its shape.${vegetarian ? "" : " Check the filling reaches at least 75°C throughout before assembly."} Taste and adjust salt.` },
          { title: "Top and bake", detail: "Transfer filling to a baking dish. Spread mash over it and roughen the surface with a fork. Bake for 20–25 minutes until the filling bubbles and the top is golden." },
          { title: "Rest and finish", detail: `Let stand for 5 minutes. ${finishText(context, "dressing")} Spoon the finish over individual servings.` },
        ],
      };
    }
    default: throw new Error("Choose a supported classic dish.");
  }
}

function normalizePantryTerm(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/[’']/g, "").replace(/[–—-]/g, " ").replace(/\s+/g, " ");
}

export function parsePantry(pantry?: string | string[]): Set<string> {
  const parts = Array.isArray(pantry) ? pantry : (pantry ?? "").split(/[,;\n]/);
  return new Set(parts.slice(0, 100).map(normalizePantryTerm).filter(Boolean));
}

function pantryHas(item: DraftIngredient, pantry: Set<string>): boolean {
  // Deliberately exact: "butter" does not match peanut butter, and dairy milk
  // must never count as a suitable replacement for an explicitly plant-based milk.
  return [item.name, ...(item.aliases ?? [])].some((term) => pantry.has(normalizePantryTerm(term)));
}

function titleCaseFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function generateRecipe(input: RecipeInput): Recipe {
  if (!input || typeof input !== "object") throw new Error("A recipe brief is required.");
  if (!CLASSICS.some((option) => option.id === input.classicId)) throw new Error("Choose a supported classic dish.");
  if (!REGIONS.some((option) => option.id === input.regionId)) throw new Error("Choose a supported region.");
  if (!Number.isInteger(input.servings) || input.servings < 1 || input.servings > 12) throw new Error("Choose between 1 and 12 whole servings.");
  const diet = input.diet ?? "balanced";
  if (!DIETS.some((option) => option.id === diet)) throw new Error("Choose a supported dietary preference.");
  const spiceHeat = input.spiceHeat ?? "medium";
  if (!["mild", "medium", "hot"].includes(spiceHeat)) throw new Error("Choose mild, medium or hot spice.");
  if (input.pantry !== undefined && typeof input.pantry !== "string" && (!Array.isArray(input.pantry) || input.pantry.some((term) => typeof term !== "string"))) throw new Error("List pantry ingredients as text.");
  const vegan = diet === "vegan";
  const context: RecipeContext = {
    input: { ...input, diet, spiceHeat }, vegan, vegetarian: vegan || diet === "vegetarian",
    dairyFree: vegan || diet === "dairy-free", glutenFree: diet === "gluten-free", profile: profileFor(input.regionId, diet, spiceHeat),
  };
  const base = baseFor(context);
  const pantry = parsePantry(input.pantry);
  const factor = input.servings / 4;
  const merged = new Map<string, DraftIngredient>();
  for (const item of [...base.ingredients, ...context.profile.warm, ...context.profile.finish]) {
    const existing = merged.get(item.id);
    if (existing) {
      if (existing.unit !== item.unit) throw new Error(`The authored ingredient ${item.id} has inconsistent units.`);
      existing.amount += item.amount;
      existing.allergens = [...new Set([...existing.allergens, ...item.allergens])];
      existing.aliases = [...new Set([...(existing.aliases ?? []), ...(item.aliases ?? [])])];
      const notes = [...new Set([existing.notes, item.notes].filter((note): note is string => Boolean(note)))];
      if (notes.length) existing.notes = notes.join(" ");
    } else merged.set(item.id, { ...item, allergens: [...item.allergens], ...(item.aliases ? { aliases: [...item.aliases] } : {}) });
  }
  const ingredients: RecipeIngredient[] = [...merged.values()].map((item) => ({
    id: item.id, name: item.name, amount: Math.round(item.amount * factor * 10000) / 10000,
    unit: item.unit, category: item.category, allergens: item.allergens,
    ...(item.notes ? { notes: item.notes } : {}), inPantry: pantryHas(item, pantry),
  }));
  const dietaryNotes = [
    "Dietary preferences guide ingredient choices. Check packaged-food labels and substitutions for your needs.",
    "Preparation and cooking times are estimates; use the doneness checks in the method, not the timer alone.",
  ];
  if (base.dietaryNotes) dietaryNotes.push(...base.dietaryNotes);
  if (context.glutenFree) dietaryNotes.push("Choose certified or clearly labelled gluten-free bread, pasta, stock and sauces; shared equipment can introduce gluten.");
  if (vegan) dietaryNotes.push("Use vegan-labelled curry paste, miso, breads and other prepared sauces; some versions contain animal ingredients.");
  if (input.servings > 6) dietaryNotes.push("For this larger batch, use extra pans or roasting trays and leave space between food. Cook in batches if needed; total time will be longer. Check each batch for doneness.");
  if (spiceHeat === "mild" && ["korean", "thai", "moroccan"].includes(input.regionId)) dietaryNotes.push("Mild uses less chilli paste, but pastes still vary in heat; add gradually.");
  return {
    id: `${input.classicId}-${input.regionId}-${diet}-${spiceHeat}-${input.servings}`,
    classicId: input.classicId, regionId: input.regionId,
    title: `${context.profile.title} ${base.name}`,
    description: base.description,
    fusionNote: context.profile.note,
    prepMinutes: base.prep, cookMinutes: base.cook, totalMinutes: base.prep + base.cook,
    servings: input.servings, diet, spiceHeat, ingredients, steps: base.steps,
    equipment: base.equipment,
    tags: [...context.profile.tags, ...(diet === "balanced" ? [] : [titleCaseFirst(diet)])],
    allergens: [...new Set(ingredients.flatMap((item) => item.allergens))].sort(),
    dietaryNotes,
    sourceLabel: "Template-generated · not kitchen-tested",
    ...(base.methodNotes ? { methodNotes: base.methodNotes } : {}),
    ...(base.safetyNote ? { safetyNote: base.safetyNote, safetySource: base.safetySource || FOOD_SAFETY_SOURCE } : base.meat ? { safetyNote: "Use a clean food thermometer: chicken and minced meat should reach at least 75°C in the centre. Cooking times are estimates.", safetySource: FOOD_SAFETY_SOURCE } : {}),
  };
}

export function formatIngredientAmount(ingredientOrAmount: Pick<RecipeIngredient, "amount" | "unit"> | number, unit = ""): string {
  const amount = typeof ingredientOrAmount === "number" ? ingredientOrAmount : ingredientOrAmount.amount;
  const measure = typeof ingredientOrAmount === "number" ? unit : ingredientOrAmount.unit;
  if (!Number.isFinite(amount) || amount < 0) return "";
  const rounded = Math.round(amount * 100) / 100;
  const readable = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(rounded);
  return measure ? `${readable} ${measure}` : readable;
}

export function getRecipeSuggestions(input: Omit<RecipeInput, "regionId">, limit = 3): Recipe[] {
  return REGIONS.slice(0, Math.max(0, Math.min(REGIONS.length, Math.floor(limit)))).map((region) => generateRecipe({ ...input, regionId: region.id }));
}
