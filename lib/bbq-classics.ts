import type { IngredientCategory, RecipeOption, RecipeStep } from "./recipe-types.ts";
import type { BaseRecipe, DraftIngredient, RecipeContext } from "./template-types.ts";

/** Authored four-serving templates. No model call, random choice or outside recipe fetch. */
export const BBQ_CLASSICS: RecipeOption[] = [
  { id: "smoked-brisket", name: "Smoked brisket-style plate", origin: "Barbecue", emoji: "🥩", description: "A slow-cooked large cut, or smoky mushrooms and tempeh, with buns and slaw." },
  { id: "hot-smoked-fish", name: "Hot-smoked fish", origin: "Smoke cooking", emoji: "🐟", description: "A gently hot-smoked fillet or tofu, with warm potatoes and greens." },
  { id: "cold-smoked-platter", name: "Cold-smoked service platter", origin: "Cold service", emoji: "🍽️", description: "Purchased ready-to-eat smoked fish, cheese or tofu with a fresh salad." },
  { id: "bbq-pulled-protein", name: "BBQ pulled protein", origin: "Barbecue", emoji: "🥪", description: "Pull-apart shoulder or jackfruit and beans in a bun with crunchy slaw." },
  { id: "grilled-skewers", name: "Grilled skewers & kebabs", origin: "Grill cooking", emoji: "🍢", description: "Evenly cut skewers with rice, salad and a separately cooked regional sauce." },
  { id: "bbq-sausages", name: "Smoked or grilled sausages", origin: "Barbecue", emoji: "🌭", description: "Juicy sausages or plant links, warm flatbread and a chopped salad." },
  { id: "reverse-seared-steak", name: "Reverse-seared steak or chop", origin: "Grill cooking", emoji: "🥩", description: "A thick cut gently heated then seared; a cauliflower version gets its own method." },
  { id: "smoked-vegetable-tray", name: "Smoked vegetable & protein tray", origin: "Smoke cooking", emoji: "🍆", description: "Aubergine, cauliflower and peppers with tofu or halloumi." },
  { id: "bbq-ribs", name: "BBQ ribs & short ribs", origin: "Barbecue", emoji: "🍖", description: "Tender ribs or tempeh and mushroom strips, finished without a burnt glaze." },
  { id: "smoked-cheese-dip", name: "Smoked dip & cheese fondue", origin: "Barbecue", emoji: "🫕", description: "A hot cheddar-provolone dip or smooth white-bean dip with bread and crunchy vegetables." },
  { id: "grill-roasted-whole-fish", name: "Grill-roasted whole fish", origin: "Grill cooking", emoji: "🐟", description: "Whole trout or a cauliflower centrepiece cooked with indirect heat." },
  { id: "smoked-grain-bowl", name: "Smoked grain & bean bowl", origin: "Smoke cooking", emoji: "🥣", description: "Freshly cooked rice and beans with grilled tempeh, peppers and a lively finish." },
  { id: "bbq-wings", name: "BBQ wings & crisp florets", origin: "Barbecue", emoji: "🍗", description: "Indirectly cooked wings or crisp cauliflower and chickpeas, with slaw buns." },
  { id: "smoked-pork-belly", name: "Smoked belly-style bites", origin: "Barbecue", emoji: "🔥", description: "Tender pork belly or thick tofu and aubergine bites with rice and salad." },
  { id: "grill-roasted-whole-chicken", name: "Grill-roasted whole bird", origin: "Grill cooking", emoji: "🍗", description: "An unstuffed whole bird, smaller portions or a mushroom-and-tofu roast." },
  { id: "smoked-turkey-breast", name: "Smoked turkey breast", origin: "Smoke cooking", emoji: "🦃", description: "Boneless turkey breast or tempeh slabs, potatoes and green beans." },
  { id: "grilled-prawns", name: "Charred prawns", origin: "Grill cooking", emoji: "🦐", description: "Quick-cooked prawns or tofu and courgette with rice and fresh salad." },
  { id: "charred-octopus", name: "Charred octopus-style plate", origin: "Grill cooking", emoji: "🐙", description: "Fully cooked octopus or king oyster mushrooms, charred and served with warm potatoes." },
  { id: "grilled-flank-steak", name: "Flank, skirt & sirloin grill", origin: "Grill cooking", emoji: "🥩", description: "Thin steaks sliced across the grain, or a substantial mushroom-and-bean plate." },
  { id: "bbq-lamb-chops", name: "BBQ lamb chops & leg steaks", origin: "Grill cooking", emoji: "🍖", description: "Measured-thickness chops or tofu steaks with potatoes, greens and a regional dressing." },
  { id: "shotgun-shells", name: "Shotgun shells", origin: "Barbecue", emoji: "🍝", description: "Jumbo pasta shells stuffed with sausage or beans, hot-smoked until the filling is cooked through." },
  { id: "ribs-on-the-rack", name: "Ribs on the rack", origin: "Barbecue", emoji: "🍖", description: "Ribs stood upright on a rib rack, or tempeh and mushroom strips stood in a tin, over indirect heat." },
  { id: "foil-boat-ribs", name: "Foil-boat ribs", origin: "Barbecue", emoji: "🍖", description: "Ribs or plant strips in an open foil boat, bark up, with a splash of liquid so they are not submerged." },
  { id: "burnt-ends", name: "Burnt ends", origin: "Barbecue", emoji: "🔥", description: "Cubes of brisket point, or mushroom and tempeh cubes, finished in a pan of sauce off the direct flame." },
  { id: "smoked-meatloaf", name: "Smoked meatloaf", origin: "Barbecue", emoji: "🍞", description: "A mince loaf or a lentil-and-bean loaf, hot-smoked and checked in the centre." },
  { id: "rotisserie-roast", name: "Rotisserie roast", origin: "Grill cooking", emoji: "🍗", description: "A boneless loin turned on a spit, or a cauliflower turned on a rack, over indirect heat." },
];

export const BBQ_SOURCES = {
  foodSafety: "https://www.foodstandards.gov.au/consumer/prevention-of-foodborne-illness/food-safety-basics",
  temperatures: "https://www.foodauthority.nsw.gov.au/consumer/food-safety-home/cooking-temperatures",
  smoking: "https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/smoking-meat-and-poultry",
  coldService: "https://www.foodstandards.gov.au/consumer/prevention-of-foodborne-illness/bacteria-foodborne-illness/listeria",
  vulnerablePeople: "https://www.foodstandards.gov.au/consumer/prevention-of-foodborne-illness/Food-safety-for-vulnerable-populations",
  bulletSmoker: "https://www.weber.com/GB/en/user-guides/weber-48602.html",
  offsetSmoker: "https://www.oklahomajoes.com.au/documents/15202031-63_Oklahoma-Joe_Highland%20Offset%20Smoker_Instructions%20web.pdf",
  kamado: "https://www.kamadojoe.com/blogs/kamado-joe-blog/the-fundamentals-of-distance-and-kamado-grilling",
} as const;

function item(id: string, name: string, amount: number, unit: string, category: IngredientCategory = "grocery", allergens: string[] = [], notes?: string, aliases?: string[]): DraftIngredient {
  return { id, name, amount, unit, category, allergens, ...(notes ? { notes } : {}), ...(aliases ? { aliases } : {}) };
}
const veg = (id: string, name: string, amount: number, notes: string, aliases?: string[]) => item(id, name, amount, "g", "produce", [], notes, aliases);
function meat(id: string, name: string, amount: number, notes: string): DraftIngredient {
  const aliases: Record<string, string[]> = {
    "beef-brisket": ["beef brisket", "brisket flat", "beef brisket flat"],
    "pork-shoulder": ["boneless pork shoulder", "boneless unrolled pork shoulder"],
    "chicken-thigh": ["boneless chicken thighs", "boneless skinless chicken thighs"],
    "bbq-sausages": ["raw pork sausages", "fresh raw pork sausages"],
    "sirloin-steak": ["thick beef sirloin steaks", "thick sirloin steaks"],
    "pork-ribs": ["pork spare ribs", "pork spareribs"],
    "chicken-wings": ["chicken wings", "raw chicken wings"],
    "pork-belly": ["skinless boneless pork belly", "boneless skinless pork belly"],
    "whole-chicken": name === "Bone-in chicken portions" ? ["bone-in chicken portions", "chicken quarters"] : ["whole chicken", "unstuffed whole chicken"],
    "turkey-breast": ["boneless turkey breast", "boneless unstuffed turkey breast"],
    "flank-steak": ["beef flank steak", "flank steak"],
    "lamb-chops": ["lamb loin chops"],
  };
  const protectedProduct = /^(gluten-free|dairy-free)/i.test(name);
  return item(id, name, amount, "g", "butcher", [], notes, protectedProduct ? [name.toLowerCase()] : aliases[id]);
}
function fish(id: string, name: string, amount: number, notes: string, allergen = "fish"): DraftIngredient {
  const aliases: Record<string, string[]> = {
    "salmon-fillet": ["salmon fillet", "salmon fillets", "boneless salmon fillets"],
    "whole-trout": ["whole trout", "gutted whole trout"],
    "raw-prawns": ["raw peeled prawns", "raw peeled deveined prawns"],
    "cooked-octopus": ["fully cooked octopus", "fully cooked octopus tentacles"],
    "cold-smoked-salmon": ["ready-to-eat cold-smoked salmon", "commercial ready-to-eat cold-smoked salmon"],
  };
  return item(id, name, amount, "g", "fishmonger", [allergen], notes, aliases[id]);
}
const tofu = (amount = 600) => item("firm-tofu", "Plain firm tofu", amount, "g", "grocery", ["soy"], "Drain, press in a clean towel, and follow package cooking instructions.", ["plain firm tofu", "firm tofu"]);
const tempeh = (context: RecipeContext, amount = 500) => item("tempeh", context.glutenFree ? "Gluten-free plain soy tempeh" : "Plain soy tempeh", amount, "g", "grocery", ["soy"], "Use plain soy tempeh, not a grain blend; follow its package cooking instructions.", context.glutenFree ? ["gluten-free plain soy tempeh"] : ["plain soy tempeh", "tempeh"]);
const beans = (amount = 500) => item("cannellini-beans", "Canned cannellini beans, drained", amount, "g", "grocery", [], "Already cooked; the quantity is drained weight. Rinse before use.", ["cannellini beans", "canned cannellini beans"]);
const oil = (amount = 3) => item("olive-oil", "Olive oil", amount, "tbsp");
const q = (value: number, context: RecipeContext) => String(Number((value * context.input.servings / 4).toFixed(4)));
const list = (ingredients: DraftIngredient[], context: RecipeContext) => ingredients.map((entry) => `${q(entry.amount, context)}${entry.unit ? ` ${entry.unit}` : ""} ${entry.name.toLowerCase()}`).join(", ");
const step = (title: string, detail: string, minutes?: number): RecipeStep => ({ title, detail, ...(minutes ? { minutes } : {}) });

const POULTRY = "Use a clean food thermometer: the centre must reach at least 75°C. Check several thickest parts, away from bone; cooking time alone does not establish doneness.";
const WHOLE_CUT = "Check the thickest centre reaches at least 71°C for this medium-cooked recipe, then rest for at least 3 minutes. Check with a clean food thermometer, away from bone.";
const FISH = "Check the thickest part reaches at least 63°C on a clean food thermometer; the flesh should be opaque and flake easily.";
const MINCE = "Sausages and other minced meat must reach at least 75°C in the centre; check several links with a clean food thermometer.";
const LONG_CUT = "The meat must pass 71°C for safety; continue until probe-tender, usually around 90–96°C. Tenderness, cut thickness and a thermometer determine the finish, not the clock alone.";
const PLANT = "Cook until hot throughout and the vegetables are tender. Follow any longer cooking requirement on prepared proteins' packets.";

type SideId = "slaw-buns" | "potato-greens" | "rice-salad" | "flatbread-salad" | "bread-crudites" | "bean-salad" | "salad";
interface Side {
  name: string;
  ingredients: DraftIngredient[];
  steps: RecipeStep[];
  equipment: string[];
  minutes: number;
}

function sideFor(id: SideId, context: RecipeContext): Side {
  const gf = context.glutenFree;
  const bread = (bun = false) => item(bun ? "bbq-buns" : "bbq-flatbread", gf ? `Gluten-free vegan ${bun ? "buns" : "flatbread"}` : `Vegan ${bun ? "buns" : "flatbread"}`, 4, "", "grocery", gf ? [] : ["wheat"], "Choose egg-free and dairy-free bread; for gluten-free recipes use a labelled product.");
  const vinegar = item("apple-cider-vinegar", "Apple cider vinegar", 1, "tbsp");
  if (id === "slaw-buns") return {
    name: "warm buns and cabbage-carrot slaw", minutes: 15,
    ingredients: [bread(true), veg("cabbage", "Cabbage", 250, "Finely shred."), veg("carrot", "Carrot", 200, "Coarsely grate."), vinegar],
    equipment: ["Mixing bowl", "Grater"], steps: [
      step("Prepare the slaw", `Shred the cabbage and grate the carrot. Toss with ${q(1, context)} tbsp apple cider vinegar allocated to this side and ${q(1, context)} tbsp of the olive oil allocated to the side. Keep chilled until serving.`, 8),
      step("Warm the buns", "Split and toast the buns cut-side down on a clean grill area or in a dry pan for 1–2 minutes; watch closely. Serve the slaw alongside or tuck it into the buns.", 3),
    ],
  };
  if (id === "potato-greens") return {
    name: "warm potatoes and green beans", minutes: 25,
    ingredients: [veg("potatoes", "Potatoes", 700, "Scrub and cut into even 2 cm pieces."), veg("green-beans", "Green beans", 350, "Trim the ends.")],
    equipment: ["Saucepan", "Colander"], steps: [
      step("Cook potatoes near serving time", "Cover the potato pieces with water and simmer for 15–20 minutes until tender. Add the trimmed green beans for the final 5–6 minutes, then drain well.", 25),
      step("Dress the warm vegetables", `Toss the drained potatoes and green beans with ${q(1, context)} tbsp olive oil allocated to the side. Keep hot and serve promptly.`, 2),
    ],
  };
  if (id === "rice-salad") return {
    name: "rice and cucumber-tomato salad", minutes: 22,
    ingredients: [item("bbq-rice", "Long-grain rice", 280, "g", "grocery", [], "Dry weight."), veg("cucumber", "Cucumber", 250, "Dice."), veg("cherry-tomatoes", "Cherry tomatoes", 250, "Halve."), vinegar],
    equipment: ["Saucepan with lid", "Mixing bowl"], steps: [
      step("Cook fresh rice near serving time", `Rinse the rice. Bring to a boil with ${q(560, context)} ml water, cover and cook on the lowest heat for 12–15 minutes, or follow the packet. Rest covered for 5 minutes and fluff. Keep hot; do not leave cooked rice waiting at room temperature.`, 22),
      step("Toss the fresh salad", `Mix the diced cucumber and halved cherry tomatoes with ${q(1, context)} tbsp apple cider vinegar allocated to this side and ${q(1, context)} tbsp olive oil allocated to the side.`, 5),
    ],
  };
  if (id === "flatbread-salad") return {
    name: "warm flatbread and chopped salad", minutes: 12,
    ingredients: [bread(), veg("cucumber", "Cucumber", 250, "Dice."), veg("tomatoes", "Tomatoes", 300, "Dice."), vinegar],
    equipment: ["Mixing bowl", "Dry frying pan"], steps: [
      step("Make the chopped salad", `Combine the diced cucumber and tomatoes with ${q(1, context)} tbsp apple cider vinegar allocated to this side and ${q(1, context)} tbsp olive oil allocated to the side.`, 8),
      step("Warm the flatbread", "Warm the flatbread in a dry pan for 30–60 seconds per side, or follow the packet. Keep wrapped in a clean tea towel until serving.", 4),
    ],
  };
  if (id === "bread-crudites") return {
    name: "warm bread and crunchy vegetable sticks", minutes: 15,
    ingredients: [bread(), veg("carrot", "Carrot", 200, "Cut into sticks."), veg("cucumber", "Cucumber", 250, "Cut into sticks."), veg("red-pepper", "Red pepper", 250, "Deseed and slice into strips.", ["red capsicum"])],
    equipment: ["Chopping board", "Dry frying pan"], steps: [
      step("Cut the dipping vegetables", "Wash and cut the carrot, cucumber and red pepper into easy-to-dip sticks. Keep chilled until serving.", 10),
      step("Toast the bread", `Brush the flatbread with ${q(1, context)} tbsp olive oil allocated to the side. Toast in a pan or on a clean grill area for 1–2 minutes per side, then cut into wedges.`, 5),
    ],
  };
  const saladIngredients = [veg("tomatoes", "Tomatoes", 300, "Dice."), veg("cucumber", "Cucumber", 250, "Dice."), vinegar];
  if (id === "bean-salad") return {
    name: "warm cannellini and chopped vegetable salad", minutes: 12,
    ingredients: [beans(500), ...saladIngredients], equipment: ["Saucepan", "Mixing bowl"],
    steps: [step("Warm the cooked beans", `Rinse the drained canned cannellini beans. Heat in a saucepan with ${q(60, context)} ml water for 4–5 minutes until steaming hot, then drain any excess. These are already-cooked beans; do not substitute dry beans directly.`, 6), step("Dress the bean salad", `Fold the tomatoes and cucumber into the warm beans. Add ${q(1, context)} tbsp apple cider vinegar allocated to this side and ${q(1, context)} tbsp olive oil allocated to the side.`, 5)],
  };
  return { name: "fresh tomato-cucumber salad", minutes: 10, ingredients: saladIngredients, equipment: ["Mixing bowl"], steps: [step("Prepare the fresh salad", "Dice the tomatoes and cucumber. Keep chilled until the hot components are almost ready.", 7), step("Dress just before serving", `Toss the tomatoes and cucumber with ${q(1, context)} tbsp apple cider vinegar allocated to this side and ${q(1, context)} tbsp olive oil allocated to the side.`, 3)] };
}

function rub(context: RecipeContext, subject: string): string {
  return `Brush ${subject} with ${q(1, context)} tbsp olive oil. Season with the ${q(1, context)} tsp smoked paprika, ${q(0.5, context)} tsp black pepper and ${q(0.5, context)} tsp salt allocated to the main. Reserve the regional seasoning ingredients for the separate sauce, including any additional smoked paprika.`;
}

interface Plan {
  name: string;
  description: string;
  ingredients: DraftIngredient[];
  steps: RecipeStep[];
  side: SideId;
  prep: number;
  cook: number;
  equipment: string[];
  mode: "smoke" | "grill" | "cold";
  oven: string;
  notes?: string[];
  meat?: boolean;
  safety?: string;
  source?: string;
  cold?: boolean;
  /** True when the final main step actually fills bread or plates finished food. */
  finishAfterSides?: boolean;
}

function assemble(context: RecipeContext, plan: Plan): BaseRecipe {
  const side = sideFor(plan.side, context);
  const stock = item("bbq-vegetable-stock", context.glutenFree ? "Gluten-free vegetable stock" : "Vegetable stock", 120, "ml", "grocery", [], "Prepared liquid vegan stock; check allergens and gluten-free labelling where needed.");
  const common = [oil(plan.cold ? 2 : 3), item("bbq-garlic", "Garlic", 3, "cloves", "produce", [], "Finely mince."), item("smoked-paprika", "Smoked paprika", 1, "tsp"), item("black-pepper", "Ground black pepper", 0.5, "tsp"), item("bbq-salt", "Salt", 0.5, "tsp", "grocery", [], "Use less if the selected packaged product is salty."), stock];
  const deferred = plan.cook >= 40;
  const timing = deferred ? `Begin this side during the final ${side.minutes} minutes, once the main is nearly cooked or tender. ` : "";
  const sauce = step("Cook the regional sauce separately", `Heat ${q(1, context)} tbsp olive oil allocated to the sauce in a small saucepan. Soften the minced garlic for 30 seconds over low heat, then add ${list(context.profile.warm, context)} and all ${q(120, context)} ml ${stock.name.toLowerCase()}. ${plan.cold ? `Add the main's ${q(1, context)} tsp smoked paprika, ${q(0.5, context)} tsp black pepper and ${q(0.5, context)} tsp salt here too. ` : ""}Simmer gently for 3–4 minutes, stirring to cook the spices without scorching. Keep sweet pastes and sugary seasoning off direct heat. ${plan.cold ? "Cool the small pan of sauce promptly in a bowl of ice water, then refrigerate at 5°C or colder until assembly." : "Keep the sauce hot while finishing the main."}`, 6);
  const finishSauce = step("Add the fresh sauce finish", `Chop any herbs or spring onions; zest and juice any citrus. Stir ${list(context.profile.finish, context)} into the ${plan.cold ? "chilled" : "cooked"} sauce off the heat, using citrus juice to taste. If tahini is included, loosen it first with a little water. ${plan.cold ? "Keep the finished sauce refrigerated until the cold platter is assembled." : "The complete sauce is now ready for the filling, dip or serving plate; keep sweet sauce off direct heat."}`, 4);
  const serve = step("Serve the complete meal", `Bring the ${plan.name} and ${side.name} to the table together. Offer any remaining prepared regional sauce alongside.${plan.cold ? " Assemble cold foods directly from the fridge and serve immediately." : " Serve promptly while the hot components are hot."}`, 2);
  // Keep the final rest, sear or plating action after the sides and sauce exist.
  // For long cooks the side instructions explicitly overlap the final cooking
  // interval; for fast cooks the side can simmer while the main is grilled.
  const prepare = plan.steps[0];
  const cooking = plan.steps.slice(1, -1);
  const mainFinish = plan.steps[plan.steps.length - 1];
  const finishMainAndSides = plan.finishAfterSides ? [...side.steps.slice(1), mainFinish] : [mainFinish, ...side.steps.slice(1)];
  const steps = plan.cold
    ? [prepare, ...cooking, side.steps[0], sauce, finishSauce, ...side.steps.slice(1), mainFinish, serve]
    : deferred
      ? [prepare, ...cooking, { ...side.steps[0], detail: `${timing}${side.steps[0].detail}` }, sauce, finishSauce, ...finishMainAndSides, serve]
      : [prepare, { ...side.steps[0], detail: `Start the side first; prepare the sauce while it cooks, then cook the main so everything finishes close together. ${side.steps[0].detail}` }, sauce, finishSauce, ...cooking, ...finishMainAndSides, serve];
  const methodNotes = [
    ...(plan.mode === "cold" ? ["Cold-smoked service means assembling commercially prepared ready-to-eat products. This template does not cold-smoke, cure or preserve raw food at home."] : [
      "Use fuel-burning grills and smokers outdoors only, following the appliance manual. Never burn wood, charcoal or a smoking tray in an ordinary indoor oven or enclosed room.",
      plan.mode === "smoke" ? "For low hot-smoking, stabilise the cooking chamber at 120–140°C and monitor at grate level with a separate probe. Keep smoking temperatures within the USDA 107–149°C (225–300°F) range; a food probe measures the centre separately." : context.vegetarian ? "Set up a direct cooking zone and an indirect zone without flames beneath the food. Move food away from flare-ups and follow prepared proteins’ package cooking instructions." : "Set up a direct cooking zone and an indirect zone without flames beneath the food. Move food away from flare-ups; use a clean food probe for animal proteins.",
      "Bullet smoker: use its heat shield/water pan as the manufacturer directs. Offset smoker: cook in the indirect chamber away from the firebox and watch the hotter end. Kamado: fit the approved heat deflectors for indirect cooking. Vent settings and fuel amounts are appliance-specific; follow the manual.",
    ]),
    `Ordinary oven alternative: ${plan.oven} The listed smoked paprika gives smoky seasoning; an ordinary oven does not hot-smoke food.`,
    "Regional pastes and finishing ingredients are used in a separate cooked sauce and dressing. Do not expose a sweet sauce to prolonged direct flames.",
    "Hot-and-fast is a hotter pace, not another dish. Butcher paper, a foil wrap, a water spritz, and a snake or minion fire are equipment choices. Follow the appliance manual. None of them replaces the thermometer. This template does not cold-smoke or cure raw food at home.",
    ...(plan.notes ?? []),
    "Timings are estimates for the specified thickness. Read all steps first and prepare the sides near the end of long cooks. Scale quantities by servings, but check each piece independently; batch size does not scale the cooking time linearly.",
  ];
  return {
    name: plan.name, description: `${plan.description} Served with ${side.name} and your selected regional sauce.`,
    ingredients: [...plan.ingredients, ...side.ingredients, ...common], steps,
    prep: plan.prep, cook: Math.max(plan.cook, side.minutes),
    equipment: [...new Set([...plan.equipment, ...side.equipment, "Small saucepan", "Clean chopping board and knife", "Food thermometer", ...(plan.mode === "smoke" ? ["Grate-level thermometer", "Outdoor smoker or indirect barbecue (oven alternative provided)"] : [])])],
    meat: plan.meat,
    ...(plan.safety ? { safetyNote: `${plan.safety} Keep raw food separate from ready-to-eat ingredients. Keep cold foods at 5°C or colder and hot food above 60°C until serving; refrigerate leftovers promptly in shallow containers.`, safetySource: plan.source ?? BBQ_SOURCES.foodSafety } : { safetyNote: "Use already-cooked canned pulses and follow prepared proteins' package directions. Keep cold ingredients at 5°C or colder and hot food above 60°C until serving. Refrigerate leftovers promptly in shallow containers.", safetySource: BBQ_SOURCES.foodSafety }),
    dietaryNotes: [`This is an authored ${context.input.regionId === "home-style" ? "home-kitchen" : "fusion"} template, not a kitchen-tested barbecue schedule. Doneness and cut thickness take priority over estimated timing.`, ...(context.glutenFree ? ["Use labelled gluten-free bread, stock, sausages and prepared products. Clean shared grills and utensils before cooking."] : []), ...(plan.cold && !context.vegetarian ? ["Commercial cold smoking is not a cooking or sterilising step. Ready-to-eat smoked seafood remains a higher-risk chilled food even inside its use-by date."] : plan.cold ? ["Use the specified commercially prepared ready-to-eat product and follow its label; keep cold ingredients refrigerated until serving."] : [])],
    methodNotes,
  };
}

/** Return undefined so the original classic switch can handle its existing eight IDs. */
export function bbqBaseFor(context: RecipeContext): BaseRecipe | undefined {
  const { vegetarian, vegan, dairyFree, glutenFree } = context;
  const small = context.input.servings < 4;
  switch (context.input.classicId) {
    case "smoked-brisket": return assemble(context, vegetarian ? {
      name: "smoked mushroom & tempeh plate", description: "Meaty mushroom caps and firm tempeh receive a short hot-smoke, then a savoury regional sauce.", prep: 20, cook: 50, side: "slaw-buns", mode: "smoke",
      ingredients: [veg("portobello", "Large portobello mushrooms", 500, "Wipe clean; trim the stems."), tempeh(context, 500)], equipment: ["Shallow heatproof tray", "Tongs"],
      steps: [step("Prepare the plant centrepiece", `Slice the tempeh 1.5 cm thick and leave the mushroom caps whole. ${rub(context, "the tempeh and mushrooms")}`, 15), step("Hot-smoke until tender", "Set the outdoor smoker or indirect barbecue to 130–140°C. Arrange the tempeh and mushrooms on a shallow heatproof tray in a single layer. Cook for 35–50 minutes, turning halfway, until hot throughout and the mushrooms soften. Follow any longer packet cooking requirement for tempeh. Start the side during the last 15 minutes.", 50), step("Finish the texture", "If desired, move the cooked pieces to a medium-hot grill plate for 1–2 minutes per side for browned edges. Add the regional sauce only after this sear.", 4)],
      oven: "Roast on an open tray at 200°C conventional / 180°C fan for 25–35 minutes, turning halfway, until hot and tender; omit the smoking stage.",
    } : {
      name: small ? "smoky braised brisket plate" : "low-smoked brisket plate", description: "A measured piece of brisket cooks gently until it can be sliced across the grain.", prep: 25, cook: small ? 180 : 360, side: "slaw-buns", mode: small ? "grill" : "smoke", meat: true,
      ingredients: [meat("beef-brisket", "Beef brisket flat", 1200, "One unrolled piece; trim the fat layer to about 5 mm. Smaller servings use the covered-oven method.")], equipment: ["Lidded roasting dish", "Tongs", "Foil or butcher paper rated for cooking"], safety: LONG_CUT,
      steps: [step("Prepare the brisket", `Trim the brisket without removing all surface fat. ${rub(context, "the brisket")} Keep refrigerated until the cooker is ready.`, 20), step(small ? "Braise the scaled small cut" : "Start the long smoke", small ? `Place the listed ${q(1200, context)} g brisket in a snug ovenproof dish with ${q(200, context)} ml water. Cover tightly and cook at 160°C conventional / 140°C fan for about 2–3 hours, beginning tenderness checks at 90 minutes. Keep a little liquid in the dish; extend until tender. This small portion uses the oven and smoked-paprika seasoning, not a full smoker schedule.` : "Stabilise the outdoor smoker at 120–140°C. Put the brisket in the indirect zone with a centre probe. Smoke for about 2–3 hours until the surface has developed a dry bark; keep the cooker steadily hot.", small ? 180 : 180), ...(small ? [] : [step("Wrap and cook to tenderness", `Wrap the brisket with ${q(200, context)} ml hot water in a tightly covered roasting dish or secure foil parcel. Continue at 130–140°C for another 2–3 hours, until a probe slides in with little resistance. Total time is roughly 4–6 hours for a 1.2 kg piece and may be longer. ${LONG_CUT} Start the sides in the final 15 minutes.`, 180)]), step("Rest and slice", `${LONG_CUT} Rest, loosely covered, for 20–30 minutes, then slice thinly across the visible grain. Keep hot for service and prepare the sauce during the rest.`, 25)],
      oven: "For a 1.2 kg piece, cover with 200 ml water and braise at 160°C conventional / 140°C fan for 3–4 hours until probe-tender; uncover for the final 15 minutes. Scale the water and use the small-cut method in the steps for 1–3 servings.",
      notes: ["For a full outdoor smoke, select at least 4 servings so the listed cut is at least 1 kg. For larger meals, use several pieces around 1–1.5 kg and check them separately; do not use this timing unchanged for a whole packer brisket.", "Chuck alternative: replace the listed brisket with the same weight of unrolled beef chuck. Hot-smoke at 120–140°C for 2 hours, cover with the scaled water and continue 2–4 hours until 90–96°C and probe-tender. A small chuck piece uses the same covered-oven route, beginning checks at 90 minutes."],
    });

    case "hot-smoked-fish": return assemble(context, {
      name: vegetarian ? "hot-smoked tofu & potatoes" : "hot-smoked salmon & potatoes", description: vegetarian ? "Firm tofu takes on a gentle outdoor smoke and a bright regional sauce." : "A boneless fillet cooks with gentle heat and is served freshly cooked.", prep: 20, cook: vegetarian ? 45 : 50, side: "potato-greens", mode: "smoke", finishAfterSides: true,
      ingredients: [vegetarian ? tofu(650) : fish("salmon-fillet", "Boneless salmon fillet", 700, "Skin-on, pin bones removed, no thicker than 3 cm.")], equipment: ["Ovenproof tray", "Fish slice"],
      steps: [step("Prepare the main", `${vegetarian ? "Drain and press the tofu, then slice into 2 cm slabs." : "Check the fillet carefully for bones and pat it dry; keep its skin on."} ${rub(context, vegetarian ? "the tofu" : "the fillet")}`, 15), step("Hot-smoke with a probe", `Stabilise the outdoor smoker at 120–140°C. Put the ${vegetarian ? "tofu slabs" : "fillet skin-side down"} on a lightly oiled heatproof tray in the indirect zone. Cook for approximately ${vegetarian ? "30–45" : "30–50"} minutes; check early if pieces are thin. ${vegetarian ? PLANT : FISH} Begin the potatoes and green beans in the final 25 minutes.`, 50), step("Lift and serve freshly cooked", `Lift the ${vegetarian ? "slabs" : "fillet"} carefully from its tray and divide between plates. This is a hot cooked meal; the smoking step does not turn it into a shelf-stable product.`)],
      oven: vegetarian ? "Bake the tofu at 200°C conventional / 180°C fan for 25–30 minutes, turning halfway." : "Bake the same fillet at 180°C conventional / 160°C fan for 18–25 minutes, checking the thickest part reaches 63°C; thin portions finish sooner.",
      safety: vegetarian ? undefined : FISH, source: BBQ_SOURCES.temperatures,
      notes: vegetarian ? [] : ["Trout alternative: use the same weight of boneless trout fillets, about 2 cm thick; hot-smoke at 120–140°C for 20–35 minutes to 63°C. Mackerel fillets: use the same weight, check carefully for bones, and start checking at 15 minutes; typical cooking is 20–30 minutes to 63°C. Thickness and temperature, not species alone, set the finish."],
    });

    case "cold-smoked-platter": {
      const plant = vegan;
      const cheese = vegetarian && !vegan;
      const main = plant ? item("ready-smoked-tofu", "Fully cooked ready-to-eat smoked tofu", 500, "g", "grocery", ["soy"], "Buy a sealed refrigerated product explicitly labelled ready-to-eat; follow its use-by date and storage directions.", ["ready-to-eat smoked tofu", "fully cooked ready-to-eat smoked tofu"]) : cheese ? item("smoked-cheddar", "Pasteurised smoked cheddar block", 350, "g", "specialty", ["milk"], "Use a commercially smoked hard-cheese block with vegetarian rennet; buy refrigerated and follow its use-by date.", ["pasteurised smoked cheddar", "pasteurized smoked cheddar block"]) : fish("cold-smoked-salmon", "Commercial ready-to-eat cold-smoked salmon", 400, "Keep refrigerated at 5°C or colder; use within the label's date and after-opening guidance. This is not raw fish for home curing.");
      return assemble(context, {
        name: plant ? "smoked tofu service platter" : cheese ? "smoked cheddar service platter" : "cold-smoked salmon service platter", description: "A fresh service plate assembled from a commercially prepared smoked product, with a cooled regional dressing.", prep: 20, cook: 6, side: "flatbread-salad", mode: "cold", cold: true,
        ingredients: [main, veg("radishes", "Radishes", 150, "Wash and slice thinly.")], equipment: ["Refrigerator at 5°C or colder", "Chilled serving platter", "Bowl of ice water for cooling the dressing"],
        steps: [step("Check the ready-to-eat product", `Keep the ${plant ? "fully cooked ready-to-eat smoked tofu" : cheese ? "pasteurised smoked cheddar block" : "commercial ready-to-eat cold-smoked salmon"} refrigerated at 5°C or colder. Check the sealed pack, use-by date and after-opening instructions. This recipe uses purchased smoked food; do not substitute uncooked food intended for home smoking.`), step("Prepare the cold platter", `Wash and thinly slice the radishes. ${plant ? "Slice the ready-to-eat tofu with clean utensils." : cheese ? "Slice the hard-cheese block with clean utensils." : "Separate the cold-smoked slices with clean utensils; do not rinse them."} Return the prepared ingredients to the fridge while the sauce is cooked and quickly chilled.`, 8), step("Assemble only at service", "Put the chilled main and radishes on a clean platter directly from the fridge. Add the fresh salad and warm bread at service; do not leave the platter out while other cooking is underway.")],
        oven: "No smoking or cooking of the purchased ready-to-eat main is required. Use an oven only to warm the bread if desired, according to its packet.",
        safety: plant || cheese ? "Use commercially prepared refrigerated products within their label instructions; keep the platter at 5°C or colder until serving. This is a cold service plate, not a home cold-smoking preservation process." : "Cold-smoked ready-to-eat seafood can carry Listeria; refrigeration does not eliminate that risk. Pregnant, older or immunocompromised people should avoid this cold seafood plate and choose a freshly cooked alternative instead. Keep the seafood at 5°C or colder until service and obey its use-by and after-opening instructions.",
        source: BBQ_SOURCES.coldService,
        notes: ["This template gives no raw-food curing, cold-smoker temperature or shelf-life claim. A home cold-smoking device is not a substitute for a validated commercial process.", ...(plant ? ["If a smoked tofu packet says it must be cooked, cook it as directed and serve it hot instead; do not use that packet as a ready-to-eat cold ingredient."] : cheese ? ["Use hard pasteurised smoked cheddar for this cold version. Soft or semi-soft cheeses are not equivalent substitutes for vulnerable diners."] : ["Commercial ready-to-eat cold-smoked trout can replace the salmon by the same weight, with the same cold-chain and vulnerable-person restrictions."])],
      });
    }

    case "bbq-pulled-protein": return assemble(context, vegetarian ? {
      name: "pulled jackfruit & bean buns", description: "Young jackfruit and creamy white beans make a substantial, sauce-coated pulled filling.", prep: 20, cook: 45, side: "slaw-buns", mode: "smoke",
      ingredients: [item("young-jackfruit", "Canned young jackfruit in brine, drained", 600, "g", "grocery", [], "Use young green jackfruit, not sweet ripe fruit; rinse and squeeze very dry."), beans(400), veg("brown-onion", "Brown onion", 150, "Slice thinly.")], equipment: ["Lidded ovenproof dish", "Two forks"],
      steps: [step("Prepare the pulled filling", `Squeeze the jackfruit dry and shred it with clean fingers or forks. Crush any firm core pieces; drain the cannellini beans. ${rub(context, "the jackfruit, beans and sliced onion")}`, 15), step("Cook and soften", `Put the mixture in an ovenproof dish with ${q(100, context)} ml water. Cook uncovered on an indirect barbecue or smoker at 140°C for 20 minutes, then cover for 20–25 minutes until the onion and jackfruit are tender and the beans are steaming hot. Follow any longer packet requirement. Start the slaw during the final 15 minutes.`, 45), step("Pull and coat", "Shred the softened jackfruit again and lightly crush some beans to bind the filling. Fold in the prepared regional sauce after its fresh finish has been added.")],
      oven: "Cover the jackfruit, beans and onion with the scaled 100 ml water and bake at 180°C conventional /160°C fan for 25 minutes; uncover for 10–15 minutes, then shred and sauce.",
    } : {
      name: small ? "smoky pulled shoulder buns" : "smoked pulled shoulder buns", description: "Pork shoulder cooks until it pulls apart, then takes a regional sauce before filling warm buns.", prep: 25, cook: small ? 180 : 420, side: "slaw-buns", mode: small ? "grill" : "smoke", meat: true,
      ingredients: [meat("pork-shoulder", "Boneless unrolled pork shoulder", 1200, "Trim thick surface fat. Use the small covered-oven route for 1–3 servings.")], equipment: ["Lidded roasting dish", "Two forks", "Probe thermometer"], safety: LONG_CUT,
      steps: [step("Prepare the shoulder", `${rub(context, "the unrolled shoulder")} Keep it chilled until the cooker is ready.`, 20), step(small ? "Braise the small portion" : "Smoke the shoulder", small ? `Put the listed scaled shoulder in a snug covered dish with ${q(250, context)} ml water. Cook at 160°C conventional /140°C fan for 2–3 hours, checking from 90 minutes. Add a splash of hot water if the dish dries out; continue until the meat pulls apart.` : "Hot-smoke at 120–140°C in the indirect zone for 3–4 hours, until a dark surface crust forms. Maintain the cooking temperature; begin using the probe to track the centre.", small ? 180 : 240), ...(small ? [] : [step("Cover until pull-apart tender", `Move to a tightly covered roasting dish with ${q(250, context)} ml hot water. Continue at 130–140°C for 2–3 hours, until the centre is about 90–96°C and a probe slips in easily. A 1.2 kg piece may take 5–7 hours overall. Start the side near the end.`, 180)]), step("Rest and pull", `${LONG_CUT} Rest for 20 minutes, pull with two forks and discard any large pieces of unrendered fat. Add the regional sauce after pulling, then serve hot.`, 20)],
      oven: "For the 1.2 kg piece, cover with 250 ml water and cook at 160°C conventional /140°C fan for 3–4 hours, extending until pull-apart tender; use the scaled smaller-cut method for 1–3 servings.",
      notes: ["Chicken-thigh alternative: replace the shoulder with the same weight of boneless skinless thighs. In a covered dish with the scaled 250 ml water, cook at 180°C conventional /160°C fan for 60–90 minutes; every thickest piece must reach 75°C, and 85°C or so gives easier pulling. For an outdoor version, hot-smoke at 130–140°C for 60 minutes then cover and continue 30–60 minutes to the same endpoint.", "Lamb-shoulder alternative: use the same weight of boneless unrolled lamb shoulder. Smoke at 120–140°C for 3 hours, cover with the scaled water and continue 2–4 hours to 90–96°C and pull-apart tenderness; rest 20 minutes before shredding.", "Choose 4 or more servings for a full smoker joint of at least 1 kg; smaller portions use the mandatory covered-oven route above. For large batches, use several 1–1.5 kg pieces and check each separately."],
    });

    case "grilled-skewers": return assemble(context, {
      name: vegetarian ? "tofu & vegetable kebabs" : "grilled thigh kebabs", description: "Evenly sized skewers brown over controlled direct heat while a fresh side and sauce finish separately.", prep: 25, cook: 20, side: "rice-salad", mode: "grill", meat: !vegetarian, finishAfterSides: true,
      ingredients: [vegetarian ? tofu(600) : meat("chicken-thigh", "Boneless skinless chicken thighs", 650, "Cut into even 3 cm pieces."), veg("red-pepper", "Red pepper", 250, "Deseed and cut into 3 cm pieces."), veg("red-onion", "Red onion", 150, "Cut into chunky wedges, keeping layers together.")], equipment: ["Metal skewers", "Grill or barbecue", "Tongs"], safety: vegetarian ? undefined : POULTRY,
      steps: [step("Build even skewers", `Cut the ${vegetarian ? "pressed tofu" : "thighs"}, red pepper and onion into similar 3 cm pieces. ${rub(context, "the main and vegetables")} Thread onto metal skewers with a little room between pieces; use separate vegetable skewers if they cook faster.`, 20), step("Grill and turn", `Heat a grill to medium-high with a cooler indirect zone. Grill the skewers for ${vegetarian ? "12–16" : "15–20"} minutes, turning every 3–4 minutes; move off direct heat if they scorch. ${vegetarian ? PLANT : POULTRY}`, 20), step("Finish without burning the sauce", "Transfer to a clean platter. Spoon over the regional sauce only after grilling and serve promptly with the rice and chopped salad.")],
      oven: `Arrange the skewers over a rimmed tray at 220°C conventional /200°C fan for ${vegetarian ? "20–25" : "22–28"} minutes, turning halfway; ${vegetarian ? "cook until hot and browned" : "check every thickest piece reaches 75°C"}.`,
      notes: vegetarian ? ["Tempeh alternative: use the same weight of plain soy tempeh in 2 cm cubes. Grill 12–16 minutes, turning often, and follow any longer packet cooking requirement."] : ["Pork-loin alternative: use the same weight in 2.5 cm cubes, grill 12–16 minutes and check the centre reaches 71°C, then rest 3 minutes. Lamb-leg alternative: use the same weight of trimmed leg in 2.5 cm cubes, grill 10–15 minutes to 71°C, then rest 3 minutes. Keep raw-protein utensils away from the salad."],
    });

    case "bbq-sausages": {
      const sausage = vegetarian
        ? item(
          "plant-sausages",
          glutenFree ? "Gluten-free plant-based sausages" : "Plant-based sausages",
          600,
          "g",
          "grocery",
          glutenFree ? ["soy"] : ["soy", "wheat"],
          glutenFree
            ? "Choose links explicitly labelled gluten-free and vegan. Many plant sausages contain wheat. Check the packet."
            : "Choose vegan-labelled links and follow their packet cooking instructions. Many contain wheat.",
          glutenFree ? ["gluten-free plant-based sausages", "gluten free vegan sausages"] : ["plant-based sausages", "vegan sausages"],
        )
        : meat("bbq-sausages", glutenFree ? "Gluten-free raw pork sausages" : dairyFree ? "Dairy-free raw pork sausages" : "Raw pork sausages", 650, "Fresh raw links, about 3 cm thick. For dairy-free choose explicitly dairy-free links; for gluten-free choose explicitly gluten-free links. Check the full allergen label.");
      if (!vegetarian && !glutenFree) sausage.allergens = ["wheat"];
      return assemble(context, {
        name: vegetarian ? "grilled plant links" : "grilled sausage flatbreads", description: "Sausages cook gently before a brief browning, keeping sweet regional sauce for the plate.", prep: 15, cook: 30, side: "flatbread-salad", mode: "grill", meat: !vegetarian, finishAfterSides: true,
        ingredients: [sausage, veg("brown-onion", "Brown onion", 200, "Slice into thick rings.")], equipment: ["Grill with lid", "Tongs", "Small heatproof tray"], safety: vegetarian ? undefined : MINCE,
        steps: [step("Prepare links and onions", `${rub(context, "the sausage links and onion rings")} Put the onions on a small heatproof tray. Do not prick the links or coat them in sweet paste.`, 10), step("Cook gently, then brown", `Set a barbecue to about 180°C with an indirect zone. Cook the links and onion tray indirectly for ${vegetarian ? "15–20 minutes, or the packet time" : "20–25 minutes"}, turning occasionally. Finish the links over medium direct heat for 1–2 minutes per side. ${vegetarian ? "Follow the packet's full cooking instruction; the centre must be hot throughout." : MINCE}`, 30), step("Fill and finish", "Slice the cooked sausages if desired and put into warm flatbread with the cooked onions and salad. Add the regional sauce at the table.")],
        oven: `Roast links and onions at 190°C conventional /170°C fan for ${vegetarian ? "20–25 minutes or the packet time" : "25–35 minutes"}, turning halfway; ${vegetarian ? "check the packet's doneness instruction" : "check the links reach 75°C"}.`,
        notes: vegetarian ? ["Use a vegan chorizo-style link for a paprika-rich variation; follow its packet time rather than treating all plant links as ready-to-eat."] : ["Hot-smoked option: cook fresh raw links at 130–140°C for about 60–90 minutes to 75°C, then brown briefly. Fresh raw chorizo-style sausages use this same endpoint. Fully cooked ready-to-eat chorizo is a different product: replace by the same weight, slice and heat gently 10–15 minutes to 75°C before serving; do not give it the raw-link schedule."],
      });
    }

    case "reverse-seared-steak": return assemble(context, vegetarian ? {
      name: "roast-then-seared cauliflower steaks", description: "Thick cauliflower slabs cook tender before a fast sear, with beans providing the substantial side.", prep: 20, cook: 45, side: "bean-salad", mode: "grill",
      ingredients: [veg("cauliflower", "Cauliflower", 1000, "Cut through the stem into 2.5 cm slabs; keep loose florets.")], equipment: ["Roasting tray", "Heavy grill pan or barbecue"],
      steps: [step("Prepare the cauliflower", `Cut 2.5 cm slabs through the central stem; keep loose florets for the same tray. ${rub(context, "all the cauliflower")}`, 15), step("Roast gently first", "Put in an indirect barbecue or oven at 180°C conventional /160°C fan. Cover the tray loosely for 20 minutes, then uncover for 10–15 minutes, until a knife enters the core easily. Start the bean salad during the final 12 minutes.", 35), step("Sear the surfaces", "Move the tender slabs to a hot grill plate or heavy pan. Sear 1–2 minutes per side until browned. Serve loose florets alongside; add the regional sauce after the sear.", 5)],
      oven: "Use the 180°C covered-then-uncovered roasting method above, then sear in a hot indoor frying pan. This is a vegetable adaptation, not a raw centre reverse-sear schedule.",
    } : {
      name: "reverse-seared sirloin steaks", description: "Thick steaks warm gently before a short, hot sear, then rest before slicing.", prep: 20, cook: 65, side: "potato-greens", mode: "grill", meat: true,
      ingredients: [meat("sirloin-steak", "Thick beef sirloin steaks", 800, "Use unrolled whole-muscle steaks 3.5–4 cm thick; not tenderised or injected.")], equipment: ["Wire rack over a tray", "Lidded barbecue or oven", "Heavy frying pan", "Probe thermometer"], safety: WHOLE_CUT, source: BBQ_SOURCES.temperatures,
      steps: [step("Prepare thick steaks", `${rub(context, "the 3.5–4 cm steaks")} Place on a rack over a tray, leaving space between them.`, 10), step("Heat gently first", "Cook in an indirect barbecue or oven at 120°C for about 35–55 minutes, checking the centre with a probe. For the final 71°C target, begin the sear once the centre is around 60–63°C; the finishing time depends on thickness. Start the potatoes during the final 25 minutes of this stage.", 50), step("Sear and verify the final temperature", `Heat a heavy pan or direct grill zone until hot. Sear the steaks for 1–2 minutes per side and briefly on their edges. ${WHOLE_CUT} If the centre remains below 71°C, return to indirect heat until it reaches the target rather than scorching the outside.`, 8)],
      oven: "Use the same 120°C gentle stage, followed by a stovetop pan sear and final 71°C check. Smoked paprika supplies the smoky seasoning; no smoke is generated indoors.",
      notes: ["Thick pork-chop alternative: use the same weight of bone-in or boneless chops 3.5–4 cm thick. Heat indirectly at 130°C for 35–60 minutes to about 60–63°C, then sear 1–2 minutes per side and continue gently until 71°C, checking away from bone; rest 3 minutes. Thin chops need the direct-grilling method, not this thick-cut schedule."],
    });

    case "smoked-vegetable-tray": {
      const plant = dairyFree || vegan;
      const protein = plant ? tofu(600) : item("halloumi", "Vegetarian-rennet halloumi", 450, "g", "specialty", ["milk"], "Slice 1.5 cm thick; check vegetarian rennet.", ["vegetarian-rennet halloumi", "vegetarian halloumi"]);
      return assemble(context, {
        name: plant ? "smoked vegetable & tofu tray" : "smoked vegetable & halloumi tray", description: "Soft aubergine, cauliflower and peppers cook indirectly before the protein is finished to suit its texture.", prep: 25, cook: 60, side: "flatbread-salad", mode: "smoke",
        ingredients: [protein, veg("aubergine", "Aubergine", 500, "Cut into 2 cm cubes.", ["eggplant"]), veg("cauliflower", "Cauliflower", 400, "Cut into small 2 cm florets."), veg("red-pepper", "Red pepper", 250, "Deseed and cut into chunks.")], equipment: ["Wide heatproof roasting tray", "Grill plate"],
        steps: [step("Prepare the tray", `Cut the vegetables as listed and ${plant ? "press the tofu and cut into 2 cm cubes" : "slice the halloumi 1.5 cm thick"}. ${rub(context, "the vegetables and protein")}`, 20), step("Smoke the vegetables gently", `Put aubergine, cauliflower and pepper on a roomy heatproof tray with ${q(60, context)} ml water. ${plant ? "Add the tofu." : "Keep the halloumi refrigerated for its quick finish."} Cook indirectly at 140°C for 25 minutes uncovered, then cover for 20–30 minutes until the aubergine is fully soft and the cauliflower core is tender. Add a splash of water if needed.`, 55), step("Finish the protein", plant ? "Uncover the tray and cook 5–10 minutes more until the tofu is hot throughout. Follow any longer packet cooking requirement and serve with the softened vegetables." : "Grill the halloumi over medium-high heat for 2–3 minutes per side until golden. Lay it over the hot vegetables and serve immediately while supple.", 6)],
        oven: plant ? "Roast vegetables and tofu at 210°C conventional /190°C fan for 30–40 minutes, turning halfway, until the aubergine is fully soft." : "Roast vegetables at 210°C conventional /190°C fan for 30–40 minutes; add halloumi for the last 10–12 minutes or pan-fry it separately.",
      });
    }

    case "bbq-ribs": return assemble(context, vegetarian ? {
      name: "smoky tempeh & mushroom rib-style strips", description: "Tempeh and thick mushroom strips soften in a covered tray before a short char.", prep: 20, cook: 50, side: "slaw-buns", mode: "smoke",
      ingredients: [tempeh(context, 600), veg("king-oyster", "King oyster mushrooms", 400, "Slice lengthways 1.5 cm thick.")], equipment: ["Covered heatproof tray", "Grill plate"],
      steps: [step("Cut the plant strips", `Cut the tempeh into 1.5 cm-thick strips and slice the mushrooms lengthways. ${rub(context, "the strips")}`, 15), step("Smoke and tenderise", `Arrange in a heatproof tray with ${q(100, context)} ml water. Hot-smoke uncovered at 130–140°C for 20 minutes, then cover for 20–25 minutes until the tempeh is hot throughout and the mushrooms tender. Follow any longer tempeh packet direction.`, 45), step("Char the surfaces", "Move the cooked strips to a medium-hot grill plate for 1–2 minutes per side, then spoon the regional sauce over after they leave the heat. Start the slaw during the final 15 minutes.", 5)],
      oven: "Bake covered with the scaled 100 ml water at 180°C conventional /160°C fan for 25 minutes, uncover for 10 minutes, then pan-sear briefly if desired.",
    } : {
      name: small ? "smoky oven ribs" : "smoked pork ribs", description: "Pork ribs cook until tender with a clean bite; the regional sauce arrives after the smoky cooking.", prep: 25, cook: small ? 150 : 300, side: "slaw-buns", mode: small ? "grill" : "smoke", meat: true,
      ingredients: [meat("pork-ribs", "Pork spare ribs", 1400, "Trim loose fat; remove the tough membrane if present. Smaller servings may use a portion of a rack.")], equipment: ["Covered roasting dish", "Tongs", "Probe thermometer"], safety: LONG_CUT,
      steps: [step("Prepare the rack", `Remove the tough membrane if present and trim dangling pieces. ${rub(context, "the ribs")}`, 20), step(small ? "Cook the scaled rack portion" : "Start the rib smoke", small ? `Put the scaled rack portion in a snug dish with ${q(150, context)} ml water, cover tightly and cook at 160°C conventional /140°C fan for 1.5–2.5 hours, checking tenderness from 90 minutes. Continue as needed until a probe slides between the bones with little resistance.` : "Stabilise the outdoor smoker at 120–140°C and cook the ribs indirectly for 2–3 hours until the surface is dry and coloured. Keep the meat away from direct flames.", small ? 150 : 180), ...(small ? [] : [step("Cover and soften", `Add ${q(150, context)} ml hot water in a tightly covered tray and cook for another 1–2 hours at 130–140°C. Total time is about 3–5 hours for the listed rack, with longer time needed for thicker racks. Start the slaw during the final 15 minutes.`, 120)]), step("Check, rest and portion", `${LONG_CUT} Check between bones without touching them. Rest 10 minutes, then cut into portions. Spoon on the cooked regional sauce after cooking; do not burn a sweet glaze over direct flames.`, 10)],
      oven: "Cover the listed 1.4 kg rack with 150 ml water and cook at 160°C conventional /140°C fan for 2.5–3.5 hours until tender; uncover at 200°C for 10 minutes if browning is needed. Scale liquid and use the small-portion route for 1–3 servings.",
      notes: ["Beef-short-rib alternative: replace with the same weight of thick bone-in beef short ribs. Smoke at 120–140°C for 3 hours, then cover with the scaled 150 ml water for 2–4 hours until 90–96°C and probe-tender. A small portion can instead be covered-braised at 160°C for 2.5–3.5 hours. Pork-rib timing is not sufficient for all thick beef short ribs."],
    });

    case "smoked-cheese-dip": {
      const plant = dairyFree;
      const ingredients = plant ? [beans(650), item("nutritional-yeast", "Nutritional yeast", 25, "g", "grocery", [], "Unfortified or fortified flakes; check allergens."), item("plain-soy-yogurt", "Plain unsweetened soy yogurt", 120, "g", "grocery", ["soy"])] : [item("cheddar", "Vegetarian-rennet cheddar", 250, "g", "specialty", ["milk"], "Grate finely.", ["vegetarian-rennet cheddar", "vegetarian cheddar"]), item("provolone", "Vegetarian-rennet provolone", 150, "g", "specialty", ["milk"], "Grate finely.", ["vegetarian-rennet provolone", "vegetarian provolone"]), item("milk", "Milk", 180, "ml", "grocery", ["milk"]), item("cornflour", "Cornflour (corn starch)", 12, "g", "grocery", [], "Use pure maize starch, not wheat starch.")];
      return assemble(context, {
        name: plant ? "smoked white-bean dip" : "smoked cheddar-provolone fondue", description: plant ? "A smooth, hot white-bean dip with a short outdoor smoke." : "A gently melted cheese dip, held over indirect heat to keep it smooth.", prep: 20, cook: 30, side: "bread-crudites", mode: "smoke",
        ingredients, equipment: ["Small heavy heatproof pan", plant ? "Blender or potato masher" : "Whisk", "Heatproof serving stand"],
        steps: [step("Make the dip base", plant ? `Blend or thoroughly mash the drained cannellini beans with the nutritional yeast, soy yogurt and ${q(120, context)} ml water until smooth. Stir in ${q(1, context)} tbsp olive oil, ${q(1, context)} tsp smoked paprika, ${q(0.5, context)} tsp pepper and ${q(0.5, context)} tsp salt allocated to the dip.` : `Toss grated cheddar and provolone with the cornflour. Gently warm the milk in a heavy pan; whisk in the cheese a handful at a time over low heat until smooth. Stir in ${q(1, context)} tbsp olive oil, ${q(1, context)} tsp smoked paprika, ${q(0.5, context)} tsp pepper and ${q(0.5, context)} tsp salt allocated to the dip; reduce salt if the cheese is already salty. Do not boil.`, 12), step("Add a short hot-smoke", `Place the pan in an outdoor smoker's indirect zone at 120–130°C for 15–25 minutes, stirring every 5 minutes. Keep ${plant ? "the bean dip" : "the fondue"} hot and smooth; add a little water if it thickens too far. Never place the pan over a direct flame.`, 25), step("Hold for dipping", "Keep the dip above 60°C until serving, stirring occasionally. Swirl in the prepared regional sauce, which already contains its fresh finish. Keep hot while the bread is toasted, then serve promptly.")],
        oven: "Keep the prepared dip in a covered ovenproof pan at 140°C conventional /120°C fan for 15–20 minutes, stirring once; do not let it boil or separate. The paprika supplies smoky flavour without indoor smoke.",
        safety: "Keep the finished hot dip above 60°C until serving. Do not leave a lukewarm communal pan out for an extended service; portion it into clean bowls and refrigerate leftovers promptly.",
      });
    }

    case "grill-roasted-whole-fish": return assemble(context, vegetarian ? {
      name: "grill-roasted cauliflower centrepiece", description: "A steamed-then-roasted cauliflower cooks evenly and is served with a substantial bean salad.", prep: 20, cook: 60, side: "bean-salad", mode: "grill",
      ingredients: [veg("whole-cauliflower", "Cauliflower", 1200, "Use one medium whole head for 4 servings; use wedges for smaller portions.")], equipment: ["Large steamer", "Lidded barbecue or oven", "Heatproof roasting dish"],
      steps: [step("Steam the centre first", `${small ? "Cut the listed cauliflower portion into large wedges." : "Trim the outer leaves and tough stem, keeping the head intact."} Steam for ${small ? "12–15" : "20–25"} minutes until a knife can enter the core with some resistance. Drain and steam-dry.`, small ? 15 : 25), step("Roast indirectly", `${rub(context, "the cauliflower")} Put in a heatproof dish and roast on a lidded barbecue over indirect 180–200°C heat for ${small ? "20–30" : "30–40"} minutes, until browned and a knife enters the centre easily. Turn wedges once. Start the bean salad during the final 12 minutes.`, 35), step("Carve and finish", "Rest 5 minutes, cut into wedges and spoon the regional sauce over at service.", 5)],
      oven: "After the steaming stage, roast at 200°C conventional /180°C fan for 30–40 minutes for a whole head or 20–30 minutes for wedges; verify tenderness at the core.",
    } : {
      name: "grill-roasted whole trout", description: "Cleaned whole trout roast over indirect heat and are carefully deboned before serving.", prep: 25, cook: 40, side: "potato-greens", mode: "grill",
      ingredients: [fish("whole-trout", "Whole trout, gutted and scaled", 1400, "About two 700 g fish for 4 servings. Ask the fishmonger to clean them; for small portions use a cleaned smaller fish or a thick fillet of the listed weight.")], equipment: ["Fish basket or heatproof tray", "Lidded barbecue", "Fish slice"], safety: FISH, source: BBQ_SOURCES.temperatures,
      steps: [step("Prepare the cleaned fish", `Use gutted, scaled fish and pat dry. ${rub(context, "the outside and empty cavity")} Leave the cavity unstuffed so it cooks evenly. Use a clean basket or tray to prevent sticking.`, 15), step("Roast away from flames", "Set a lidded barbecue for indirect 180–200°C heat. Cook a 700 g whole fish for 25–40 minutes, turning carefully once if using a basket. A 350–450 g fish usually needs 20–30 minutes; a fillet portion 2–3 cm thick usually needs 12–20 minutes. Start the potatoes so they finish close to the fish.", 40), step("Check and remove bones", `${FISH} Check the thick shoulder beside the backbone without touching bone. Rest 3 minutes, lift the fillets from the bones and check for pin bones before serving.`, 5)],
      oven: "Roast on a lined tray at 200°C conventional /180°C fan for 25–35 minutes for each 700 g whole fish, or 12–20 minutes for 2–3 cm fillets; verify 63°C. Several fish cook side by side, not stacked.",
      notes: ["Whole-mackerel alternative: use cleaned fish around 350–450 g each to match the listed total weight. Cook indirectly at 180–200°C for 20–30 minutes to 63°C; remove the backbone and check the fillets carefully before serving. This whole-fish method is distinct from hot-smoking thinner boneless fillets."],
    });

    case "smoked-grain-bowl": return assemble(context, {
      name: "smoked rice, bean & grilled tempeh bowls", description: "Freshly cooked grains and beans receive a brief hot-smoke while tempeh and peppers cook on the grill.", prep: 20, cook: 50, side: "salad", mode: "smoke",
      ingredients: [item("bbq-rice", "Long-grain rice", 280, "g", "grocery", [], "Dry weight."), beans(500), tempeh(context, 400), veg("red-pepper", "Red pepper", 300, "Deseed and cut into wide strips.")], equipment: ["Saucepan with lid", "Shallow heatproof tray", "Grill plate"],
      steps: [step("Cook the grain completely first", `Rinse the rice and cook with ${q(560, context)} ml water, covered over low heat for 12–15 minutes or as the packet directs. Rest covered 5 minutes. Warm the drained canned cannellini beans in a little water until steaming, then drain. Do not try to cook dry rice using smoke alone.`, 22), step("Give the hot grain a short smoke", "Immediately combine the hot rice and beans in a shallow heatproof tray. Put in the already-hot smoker at 120–130°C for 15–20 minutes, stirring once; keep the food above 60°C. If smoke cooking is unavailable, keep the freshly cooked mixture covered and hot for immediate service. Do not leave cooked rice on the bench.", 20), step("Grill the substantial toppings", `Slice tempeh 1 cm thick. ${rub(context, "the tempeh and pepper strips")} Grill over medium heat for 10–14 minutes, turning often, until hot through and the pepper is tender. Follow the tempeh packet if it requires longer cooking. Prepare the salad while these toppings cook.`, 14)],
      oven: "Cook rice and beans fully on the stove and keep hot. Roast the seasoned tempeh and pepper at 200°C conventional /180°C fan for 20–25 minutes, turning halfway; serve with the hot grains, fresh salad and sauce.",
      safety: "Cook rice fully before the brief smoking stage, transfer it directly while hot, and keep it above 60°C until service. Refrigerate leftover rice promptly in shallow containers; do not store cooked rice at room temperature.",
    });

    case "bbq-wings": return assemble(context, vegetarian ? {
      name: "BBQ cauliflower & chickpea bites", description: "Substantial cauliflower pieces get crisp edges while chickpeas make the tray a filling meal.", prep: 25, cook: 40, side: "slaw-buns", mode: "grill",
      ingredients: [veg("cauliflower", "Cauliflower", 700, "Cut into 4 cm florets."), item("chickpeas", "Canned chickpeas, drained", 500, "g", "grocery", [], "Already cooked; rinse and pat dry."), item("cornflour", "Cornflour (corn starch)", 30, "g", "grocery", [], "Use pure maize starch.")], equipment: ["Wide roasting tray", "Mixing bowl"],
      steps: [step("Coat the florets", `Wash the cauliflower and drain thoroughly. ${rub(context, "the florets and drained chickpeas")} Sprinkle with all the cornflour and toss until lightly coated.`, 15), step("Roast indirectly until crisp", "Heat a lidded barbecue to indirect 200–220°C. Spread florets and chickpeas on a roomy tray and roast 30–40 minutes, turning halfway, until the cauliflower core is tender and edges are crisp. Keep the tray away from direct flames.", 40), step("Sauce at the last moment", "Serve the hot bites with the separately cooked regional sauce beside them, preserving the crisp surfaces. Prepare the slaw during the final 15 minutes.")],
      oven: "Roast at 220°C conventional /200°C fan for 30–40 minutes, turning halfway. Spread across multiple trays rather than crowding when cooking a larger batch.",
    } : {
      name: "BBQ chicken wings", description: "Wings cook safely over indirect heat before their skin is crisped over a hotter zone.", prep: 20, cook: 60, side: "slaw-buns", mode: "grill", meat: true,
      ingredients: [meat("chicken-wings", "Chicken wings", 1200, "Separate at joints if needed; use thawed wings and pat dry. Do not wash raw poultry.")], equipment: ["Lidded barbecue", "Tongs", "Rimmed tray"], safety: POULTRY,
      steps: [step("Prepare dry wings", `Separate wings at the joints if needed, pat dry and keep chilled. Do not wash raw poultry. ${rub(context, "the wings")}`, 15), step("Cook indirectly first", `Set a lidded barbecue for indirect 180–200°C heat. Cook wings in one layer for 35–50 minutes, turning halfway. ${POULTRY} Start the slaw during the last 15 minutes.`, 50), step("Crisp without a burnt glaze", "Once fully cooked, move the wings over medium-high direct heat for 1–3 minutes per side, watching constantly for flare-ups. Move them back to the indirect zone if fat flares. Serve the regional sauce alongside after crisping.", 6)],
      oven: "Roast wings on a rack over a tray at 200°C conventional /180°C fan for 40–50 minutes, turning halfway and checking 75°C; raise to 220°C for 5–10 minutes to crisp if needed.",
      notes: ["Hot-smoked option: smoke the wings at 130–140°C for 60–90 minutes to 75°C, then crisp briefly over a hotter grill zone. Do not treat a pink smoke ring or coloured juices as proof of doneness."],
    });

    case "smoked-pork-belly": return assemble(context, vegetarian ? {
      name: "smoky tofu & aubergine bites", description: "Thick tofu and soft aubergine form rich, saucy bites with rice and a fresh salad.", prep: 20, cook: 50, side: "rice-salad", mode: "smoke",
      ingredients: [tofu(600), veg("aubergine", "Aubergine", 500, "Cut into 2 cm cubes.", ["eggplant"])], equipment: ["Covered heatproof tray", "Wide frying pan"],
      steps: [step("Prepare thick bites", `Press the tofu and cut into 2 cm cubes. Cut the aubergine to the same size. ${rub(context, "the cubes")}`, 15), step("Smoke, then soften", `Put in a shallow heatproof tray with ${q(80, context)} ml water. Hot-smoke at 130–140°C uncovered for 20 minutes, then cover for 20–25 minutes until the aubergine is soft all the way through and tofu is hot. Start the rice during the final 22 minutes.`, 45), step("Brown the edges", "If desired, transfer the cooked cubes to a hot non-stick pan for 3–5 minutes, turning carefully to brown. Add the regional sauce after the pan finish.", 5)],
      oven: "Roast tofu and aubergine with the scaled 80 ml water in a covered dish at 200°C conventional /180°C fan for 20 minutes, then uncover for 15–20 minutes until tender and browned.",
    } : {
      name: small ? "smoky oven belly bites" : "smoked pork belly bites", description: "Skinless belly cooks until tender before a controlled hot finish, keeping flare-ups away from the food.", prep: 20, cook: small ? 160 : 300, side: "rice-salad", mode: small ? "grill" : "smoke", meat: true,
      ingredients: [meat("pork-belly", "Skinless boneless pork belly", 1000, "Use an even slab about 3–4 cm thick; trim loose fat. This recipe does not make crackling.")], equipment: ["Lidded roasting dish", "Drip tray", "Tongs"], safety: LONG_CUT,
      steps: [step("Prepare the belly slab", `${rub(context, "the belly slab")} Keep it whole for the gentle cooking stage, rather than drying out small cubes.`, 15), step(small ? "Braise the small belly portion" : "Hot-smoke the slab", small ? `Put the scaled belly portion in a snug covered dish with ${q(150, context)} ml water. Cook at 160°C conventional /140°C fan for 1.5–2.5 hours until probe-tender, checking from 90 minutes.` : "Smoke over indirect 120–140°C heat above a drip tray for 2.5–3.5 hours, then move to a covered roasting dish for the next stage.", small ? 150 : 210), ...(small ? [] : [step("Cover until tender", `Add ${q(150, context)} ml hot water to the covered dish and cook at 140°C for 45–90 minutes, until the slab is probe-tender, usually 90–96°C internally. Start the rice during the last 22 minutes.`, 90)]), step("Portion and finish safely", `${LONG_CUT} Rest 10 minutes, cut into thick bites and return to a tray over indirect 200°C heat for 10–15 minutes to brown. Keep rendered fat away from flames. Add the sauce after this finish.`, 20)],
      oven: "Cover the 1 kg slab with 150 ml water at 160°C conventional /140°C fan for 2.5–3 hours until tender, then cut and roast uncovered at 220°C for 10–15 minutes. Use the small portion's shorter starting checks for 1–3 servings.",
    });

    case "grill-roasted-whole-chicken": return assemble(context, vegetarian ? {
      name: "grill-roasted mushroom & tofu centrepiece", description: "Whole mushroom caps and thick tofu slabs roast together over indirect heat.", prep: 20, cook: 45, side: "potato-greens", mode: "grill",
      ingredients: [tofu(650), veg("portobello", "Large portobello mushrooms", 500, "Wipe clean and trim stems.")], equipment: ["Wide roasting tray", "Lidded barbecue"],
      steps: [step("Prepare the plant roast", `Press the tofu and slice into 2 cm slabs; leave the mushroom caps whole. ${rub(context, "the slabs and caps")}`, 15), step("Roast with indirect heat", "Arrange in a single layer on a tray in an indirect barbecue at 190–200°C. Roast 30–40 minutes, turning halfway, until the mushrooms soften and tofu is hot throughout. Start the potatoes and green beans during the final 25 minutes.", 40), step("Rest briefly and sauce", "Rest the tofu and mushrooms for 3 minutes, then portion and add the regional sauce. Follow any longer tofu packet cooking instruction.", 3)],
      oven: "Roast on a roomy tray at 200°C conventional /180°C fan for 30–40 minutes, turning halfway; use additional trays for larger batches.",
    } : {
      name: small ? "grill-roasted poultry portions" : "grill-roasted whole chicken", description: "An unstuffed bird or scaled bone-in portions cook evenly over indirect heat, checked in several thick parts.", prep: 25, cook: small ? 65 : 110, side: "potato-greens", mode: "grill", meat: true,
      ingredients: [meat("whole-chicken", small ? "Bone-in chicken portions" : "Whole chicken, unstuffed", 1600, small ? "Use portions matching the listed scaled weight, rather than a fractional whole bird." : "Use birds around 1.4–1.8 kg; for larger quantities add similarly sized birds or bone-in portions to match the listed total weight.")], equipment: ["Lidded barbecue", "Roasting rack and drip tray", "Probe thermometer"], safety: POULTRY,
      steps: [step("Prepare without stuffing", `Remove any giblet packet. Do not wash raw poultry. ${rub(context, small ? "the bone-in portions" : "the bird")} ${small ? "Arrange the pieces with gaps between them." : "Leave the cavity empty and loosen the leg ties so heat reaches the thigh joints."} Clean hands and utensils before preparing sides.`, 20), step("Roast in the indirect zone", `Set a lidded barbecue to 180–200°C indirect heat with a drip tray below. Cook ${small ? "bone-in portions for 45–65 minutes, turning once" : "a 1.4–1.8 kg whole bird for 80–110 minutes, turning the tray if heat is uneven"}. ${POULTRY} ${small ? "Check each piece separately." : "Check the thickest breast and the inner thighs on both sides; add time if either is below 75°C."} Start the potato side near the end.`, small ? 65 : 110), step("Rest and carve", "Rest loosely covered for 10–15 minutes, then carve with clean utensils. Keep the meat hot for service and add the separately cooked regional sauce.", 15)],
      oven: `Roast at 190°C conventional /170°C fan for ${small ? "45–65 minutes for bone-in portions" : "80–110 minutes for a 1.4–1.8 kg unstuffed bird"}, checking 75°C in all thick parts. Larger birds need longer and should not use the small-bird time unchanged.`,
      notes: ["Hot-smoked whole-bird option: use only an unstuffed, fully thawed 1.4–1.8 kg bird; smoke at 130–140°C for about 2.5–4 hours and verify 75°C in both breast and inner thighs. Finish indirectly at 200°C for 10–15 minutes if crisper skin is wanted. For 1–3 servings use the portion-based grill/oven method instead."],
    });

    case "smoked-turkey-breast": return assemble(context, vegetarian ? {
      name: "smoked tempeh slabs", description: "Thick tempeh slabs receive a gentle hot-smoke and a fresh regional finish.", prep: 20, cook: 45, side: "potato-greens", mode: "smoke",
      ingredients: [tempeh(context, 700)], equipment: ["Heatproof tray", "Tongs"],
      steps: [step("Prepare the slabs", `Cut tempeh into 1.5 cm slabs. ${rub(context, "the slabs")}`, 15), step("Smoke gently", `Put on a heatproof tray in an outdoor smoker at 130–140°C. Cook 30–45 minutes, turning once, until hot throughout and lightly browned; follow any longer packet cooking requirement. Begin the potatoes in the final 25 minutes. ${PLANT}`, 45), step("Slice and sauce", "Slice the hot slabs into strips, then add the regional sauce after cooking.")],
      oven: "Bake the tempeh at 200°C conventional /180°C fan for 25–30 minutes, turning halfway and following any longer packet direction.",
    } : {
      name: "hot-smoked turkey breast", description: "A boneless breast cooks gently with careful temperature checks to keep it moist.", prep: 25, cook: small ? 80 : 160, side: "potato-greens", mode: "smoke", meat: true,
      ingredients: [meat("turkey-breast", "Boneless unstuffed turkey breast", 1000, "One unrolled piece; use a smaller unrolled portion for smaller servings. Thaw fully in the refrigerator.")], equipment: ["Heatproof tray", "Probe thermometer", "Foil for resting"], safety: POULTRY,
      steps: [step("Prepare the breast", `Use an unrolled, unstuffed breast portion and pat dry without washing. ${rub(context, "the breast")}`, 20), step("Smoke with a centre probe", `Stabilise the outdoor smoker at 130–140°C. Cook the breast indirectly on a heatproof tray for about ${small ? "45–80 minutes for the scaled smaller portion" : "1.5–2.5 hours for a 1 kg piece"}. ${POULTRY} Check early for thin portions and extend for a thick joint. Start the potatoes in the final 25 minutes.`, small ? 80 : 150), step("Rest before slicing", "Rest loosely covered for 10–15 minutes, then slice across the grain with clean utensils. Add the regional sauce after slicing and serve promptly.", 15)],
      oven: `Roast at 180°C conventional /160°C fan for ${small ? "30–55 minutes for a small breast portion" : "60–90 minutes for a 1 kg breast"}, checking 75°C in the thickest centre. Use the probe rather than the weight estimate alone.`,
      notes: ["This breast recipe does not supply a whole-turkey schedule. For larger meals use several similarly thick breast pieces and check each independently; never scale a small breast's timing directly to a stuffed whole bird."],
    });

    case "grilled-prawns": return assemble(context, {
      name: vegetarian ? "charred tofu & courgette" : "charred prawn skewers", description: vegetarian ? "Quick-grilled tofu and courgette stay substantial and pick up a fresh sauce." : "Raw peeled prawns cook quickly over controlled heat, with a sauce added after grilling.", prep: 20, cook: 16, side: "rice-salad", mode: "grill", finishAfterSides: true,
      ingredients: [vegetarian ? tofu(600) : fish("raw-prawns", "Raw peeled, deveined prawns", 650, "Use fully thawed prawns; pat dry and keep chilled until cooking.", "crustaceans"), veg("courgette", "Courgette", 300, "Slice into 1.5 cm half-moons.", ["zucchini"])], equipment: ["Metal skewers", "Grill plate", "Tongs"], safety: vegetarian ? undefined : "Cook prawns until opaque throughout and 63°C in the thickest part; use a clean thermometer and do not use colour alone as the doneness check.", source: BBQ_SOURCES.temperatures,
      steps: [step("Prepare separate skewers", `${vegetarian ? "Press the tofu and cut into 2 cm cubes." : "Pat the thawed raw prawns dry."} Slice the courgette 1.5 cm thick. ${rub(context, vegetarian ? "the tofu and courgette" : "the prawns and courgette")} Thread the main and courgette onto separate skewers because they cook at different speeds.`, 15), step("Grill the courgette and main", `Heat the grill plate to medium-high. Cook courgette for 8–12 minutes, turning until tender. Cook ${vegetarian ? "tofu for 10–14 minutes, turning until hot and golden" : "prawns for 2–3 minutes per side, just until opaque and 63°C in the thickest part"}. Work in batches without crowding; keep cooked food on a clean platter.`, 14), step("Serve straight from the grill", "Finish the hot main with the regional sauce and its fresh dressing, then serve promptly with rice and salad.")],
      oven: vegetarian ? "Roast tofu and courgette at 220°C conventional /200°C fan for 20–25 minutes, turning once." : "Roast courgette at 220°C conventional /200°C fan for 15 minutes, add the prawns on a separate tray and cook 6–10 minutes until 63°C; do not give prawns the full vegetable cooking time.",
    });

    case "charred-octopus": return assemble(context, {
      name: vegetarian ? "charred king oyster & bean plate" : "charred cooked octopus plate", description: vegetarian ? "King oyster mushroom slabs char at the edges with cannellini beans for a filling plate." : "Commercially fully cooked octopus is reheated and briefly charred, avoiding a misleading raw-octopus shortcut.", prep: 20, cook: 20, side: "potato-greens", mode: "grill", finishAfterSides: true,
      ingredients: vegetarian ? [veg("king-oyster", "King oyster mushrooms", 650, "Slice lengthways 1.5 cm thick and score lightly."), beans(400)] : [fish("cooked-octopus", "Fully cooked octopus tentacles", 700, "Buy a commercially fully cooked refrigerated or safely thawed product; follow storage and heating directions. Not raw octopus.", "molluscs")], equipment: ["Heavy grill plate", "Saucepan", "Tongs"],
      steps: [step("Prepare the main", vegetarian ? `Slice the mushrooms lengthways and score their flat surfaces. Drain the cooked cannellini beans. ${rub(context, "the mushroom slabs")}` : `Confirm the octopus is labelled fully cooked. Pat dry; if thick, cut the tentacles into 4–5 cm sections for even heating. ${rub(context, "the cooked tentacles")}`, 15), step("Heat through, then char", vegetarian ? `Warm the drained beans with ${q(60, context)} ml water until steaming hot, then drain. Grill mushroom slabs over medium-high heat for 10–14 minutes, turning until browned and tender; if needed cover briefly with a splash of water to soften the centre.` : `Warm the cooked tentacles in a covered pan with ${q(80, context)} ml water for 5–8 minutes, checking the thickest parts reach 75°C. Drain and pat dry, then sear on a hot grill plate for 1–2 minutes per side to char the edges without drying them.`, 16), step("Plate with the warm side", `Serve ${vegetarian ? "the mushrooms over the warmed beans" : "the reheated, charred tentacles"} with potatoes and green beans. Add the regional sauce at service.`)],
      oven: vegetarian ? "Roast mushroom slabs at 220°C conventional /200°C fan for 20–25 minutes, turning halfway; warm the canned beans separately on the stove." : "Warm the fully cooked tentacles in a covered dish with the scaled 80 ml water at 180°C conventional /160°C fan for 15–20 minutes to 75°C; finish in a hot stovetop pan for 1–2 minutes per side if char is desired.",
      safety: vegetarian ? undefined : "Use fully cooked octopus and reheat to 75°C before the brief char. This recipe does not tenderise or safely cook raw octopus; do not replace the specified product with raw tentacles.", source: BBQ_SOURCES.coldService,
    });

    case "grilled-flank-steak": return assemble(context, vegetarian ? {
      name: "grilled portobello & cannellini plate", description: "Whole mushroom caps are grilled tender and sliced over a substantial bean salad.", prep: 20, cook: 20, side: "bean-salad", mode: "grill",
      ingredients: [veg("portobello", "Large portobello mushrooms", 800, "Wipe clean and trim stems flush.")], equipment: ["Grill or griddle", "Tongs"],
      steps: [step("Prepare the caps", `Trim the mushrooms and pat dry. ${rub(context, "the mushroom caps")}`, 10), step("Grill until tender", "Grill over medium-high heat for 6–8 minutes per side, moving to indirect heat if the edges scorch. The caps should soften through the centre; very thick caps may need 5 minutes more with the lid closed.", 20), step("Slice and dress", "Rest 3 minutes, slice thickly and lay over the warm cannellini salad. Add regional sauce after grilling.", 3)],
      oven: "Roast the caps at 210°C conventional /190°C fan for 20–25 minutes, turning halfway, until tender throughout.",
    } : {
      name: "grilled flank steak plate", description: "A thin, even steak is grilled with a short rest, then sliced finely across its strong grain.", prep: 20, cook: 20, side: "potato-greens", mode: "grill", meat: true,
      ingredients: [meat("flank-steak", "Beef flank steak", 800, "An unrolled whole-muscle piece about 2 cm thick. Do not use the thick-cut reverse-sear schedule.")], equipment: ["Grill or heavy griddle", "Tongs", "Probe thermometer"], safety: WHOLE_CUT, source: BBQ_SOURCES.temperatures,
      steps: [step("Prepare an even steak", `Trim tough surface silverskin and note which way the grain runs. ${rub(context, "the 2 cm-thick steak")}`, 15), step("Grill with two heat zones", `Grill over medium-high heat for about 4–6 minutes per side, moving to the indirect zone if the surface browns before the middle is ready. ${WHOLE_CUT} The medium target may require a few more minutes on the cooler side.`, 15), step("Slice across the grain", "Rest at least 3 minutes, then cut into thin slices across the grain at a slight angle. Serve over the potatoes and greens with regional sauce.", 5)],
      oven: "Sear in an ovenproof pan for 2 minutes per side, then finish at 200°C conventional /180°C fan for 5–10 minutes, checking 71°C; rest 3 minutes and slice across the grain.",
      notes: ["Skirt alternative: use the same weight in 1–1.5 cm-thick pieces. Grill 2–4 minutes per side, then check 71°C and rest 3 minutes; slice across the grain. Sirloin alternative: use 2 cm steaks, grill 4–6 minutes per side to 71°C and rest 3 minutes. For 3.5–4 cm sirloin use the separate reverse-seared classic instead."],
    });

    case "bbq-lamb-chops": return assemble(context, {
      name: vegetarian ? "BBQ tofu steaks & greens" : "BBQ lamb chops & greens", description: vegetarian ? "Pressed tofu slabs brown over controlled heat and carry a bright regional sauce." : "Loin chops cook over two heat zones, checked away from bone and rested before serving.", prep: 20, cook: 22, side: "potato-greens", mode: "grill", meat: !vegetarian,
      ingredients: [vegetarian ? tofu(750) : meat("lamb-chops", "Lamb loin chops", 1000, "About 2.5 cm thick; trim loose excess fat and check temperature away from bone.")], equipment: ["Grill or barbecue", "Tongs", "Probe thermometer"], safety: vegetarian ? undefined : WHOLE_CUT, source: BBQ_SOURCES.temperatures,
      steps: [step("Prepare measured-thickness pieces", `${vegetarian ? "Press the tofu and slice 2 cm thick." : "Trim loose fat from the 2.5 cm chops."} ${rub(context, vegetarian ? "the tofu slabs" : "the chops")}`, 15), step("Grill without flare-ups", `Set a medium-high direct zone and a cooler indirect zone. Grill for ${vegetarian ? "5–7" : "4–6"} minutes per side, turning carefully. ${vegetarian ? "Continue until hot through and golden, following any longer packet requirement." : `Move to indirect heat if fat flares or the outside browns early. ${WHOLE_CUT}`}`, 18), step("Rest and plate", `Rest for ${vegetarian ? "2" : "3"} minutes, then add the regional sauce and serve with the hot potatoes and green beans.`, 3)],
      oven: vegetarian ? "Roast tofu at 210°C conventional /190°C fan for 25–30 minutes, turning halfway." : "Sear chops in an ovenproof pan for 2 minutes per side, then roast at 200°C conventional /180°C fan for 8–12 minutes to 71°C; rest 3 minutes.",
      notes: vegetarian ? [] : ["Lamb-leg-steak alternative: use the same weight of 2 cm leg steaks. Grill 4–6 minutes per side, check 71°C and rest 3 minutes. Pork-loin-chop alternative: use 2.5 cm chops of the same total weight, grill 5–7 minutes per side and finish indirectly as needed to 71°C; rest 3 minutes. These quick-cooking cuts are not substitutes for slow-smoking shoulder."],
    });

    case "shotgun-shells": {
      const shells = item(
        "jumbo-shells",
        glutenFree ? "Gluten-free jumbo pasta shells" : "Jumbo pasta shells",
        12,
        "",
        "grocery",
        glutenFree ? [] : ["wheat"],
        glutenFree ? "Large cannelloni or jumbo shells explicitly labelled gluten-free. Many pasta shells contain wheat." : "Large cannelloni or jumbo pasta shells. Check the packet for wheat.",
        glutenFree ? ["gluten-free jumbo pasta shells"] : ["jumbo pasta shells", "cannelloni shells"],
      );
      const filling = vegetarian
        ? beans(500)
        : item(
          "sausage-meat",
          glutenFree ? "Gluten-free raw pork sausage meat" : dairyFree ? "Dairy-free raw pork sausage meat" : "Raw pork sausage meat",
          650,
          "g",
          "butcher",
          glutenFree ? [] : ["wheat"],
          "Sausage meat, or sausages with the casings removed. For gluten-free or dairy-free, the packet must say so.",
          glutenFree ? ["gluten-free raw pork sausage meat"] : dairyFree ? ["dairy-free raw pork sausage meat"] : ["raw pork sausage meat", "pork sausage meat"],
        );
      return assemble(context, {
        name: vegetarian ? "bean-stuffed jumbo pasta shells" : "sausage shotgun shells",
        description: vegetarian ? "Jumbo pasta shells are filled with seasoned beans and hot-smoked until tender." : "Jumbo pasta shells are filled with sausage meat and hot-smoked until the centre is cooked.",
        prep: 25, cook: vegetarian ? 50 : 75, side: "slaw-buns", mode: "smoke", meat: !vegetarian, finishAfterSides: true,
        ingredients: [shells, filling, veg("brown-onion", "Brown onion", 120, "Finely dice.")],
        equipment: ["Saucepan", "Heatproof tray", "Piping bag or teaspoon"],
        safety: vegetarian ? undefined : MINCE, source: BBQ_SOURCES.temperatures,
        steps: [
          step("Soften the shells", `Boil the jumbo pasta shells for 2 minutes, or follow the packet if it asks for a different start. Drain and cool until you can handle them. Do not cook dry pasta with smoke alone.`, 12),
          step("Fill the shells", vegetarian
            ? `Mash the drained cannellini beans with the diced onion. ${rub(context, "the bean filling")} Spoon it into the jumbo pasta shells. Stand the shells upright in a single layer on a heatproof tray.`
            : `Mix the raw pork sausage meat with the diced onion. ${rub(context, "the sausage filling")} Spoon it into the jumbo pasta shells and press the filling in so there are no large gaps. Stand the shells upright in a single layer on a heatproof tray. A strip of streaky bacon around each shell is optional and is pork; leave it off if you are not eating pork.`, 15),
          step("Hot-smoke the shells", vegetarian
            ? `Stabilise the outdoor smoker at 140–149°C, inside the 107–149°C smoking range. Cook the jumbo pasta shells for 35–50 minutes, until the shells are tender and the bean filling is hot throughout. Start the slaw during the final 15 minutes. ${PLANT}`
            : `Stabilise the outdoor smoker at 140–149°C, inside the 107–149°C smoking range. Cook the jumbo pasta shells for 45–70 minutes. The centre of the sausage filling must reach at least 75°C. Check several shells with a clean food thermometer. Start the slaw during the final 15 minutes.`, vegetarian ? 50 : 70),
          step("Sauce after cooking", "Spoon the regional sauce over the shells only after they leave the heat. Do not put a sweet glaze on them for the whole smoke."),
        ],
        oven: vegetarian
          ? "Bake the filled jumbo pasta shells at 180°C conventional / 160°C fan for 25–35 minutes, until the shells are tender and the bean filling is hot throughout."
          : "Bake the filled jumbo pasta shells at 180°C conventional / 160°C fan for 25–40 minutes, until the sausage centre reaches 75°C.",
        notes: vegetarian
          ? ["This is the plant shotgun shell: jumbo pasta shells and beans. It is not a sausage filling."]
          : ["This template leaves cheese out of the filling so the same shells can stay dairy-free. Optional bacon is pork and is not part of the measured shopping list."],
      });
    }

    case "ribs-on-the-rack": return assemble(context, vegetarian ? {
      name: "upright tempeh & mushroom strips", description: "Tempeh and mushroom strips stand upright over indirect heat, rather than lying in a covered tray.", prep: 20, cook: 50, side: "slaw-buns", mode: "smoke",
      ingredients: [tempeh(context, 600), veg("king-oyster", "King oyster mushrooms", 400, "Slice lengthways 1.5 cm thick.")],
      equipment: ["Loaf tin or upright rack", "Heatproof tray"],
      steps: [
        step("Cut upright strips", `Cut the tempeh into 1.5 cm strips and slice the mushrooms lengthways. ${rub(context, "the tempeh and mushroom strips")}`, 15),
        step("Stand them in the rack", `Stand the tempeh and mushroom strips upright in a loaf tin or rack, with space between them, not stacked flat. Hot-smoke at 130–140°C for 35–50 minutes, until the tempeh is hot throughout and the mushrooms are tender. Follow any longer tempeh packet direction. Start the slaw during the final 15 minutes. ${PLANT}`, 50),
        step("Sauce after cooking", "Lift the strips out and spoon the regional sauce over them after they leave the heat.", 4),
      ],
      oven: "Stand the tempeh and mushroom strips upright in a loaf tin and bake at 180°C conventional / 160°C fan for 30–40 minutes, until hot and tender.",
      notes: ["Upright rack: the strips stay vertical. This is not the flat covered-rib method and not the open foil boat."],
    } : {
      name: small ? "covered oven ribs" : "ribs on an upright rack", description: "A rack of ribs stands upright over indirect heat so the surfaces brown without being stacked.", prep: 25, cook: small ? 150 : 300, side: "slaw-buns", mode: small ? "grill" : "smoke", meat: true,
      ingredients: [meat("pork-ribs", "Pork spare ribs", 1400, "Trim loose fat and remove the tough membrane if present. Use a portion of a rack for smaller servings.")],
      equipment: ["Vertical rib rack", "Covered roasting dish", "Tongs", "Probe thermometer"], safety: LONG_CUT,
      steps: [
        step("Prepare the ribs", `Remove the tough membrane if present. ${rub(context, "the ribs")}`, 20),
        step(small ? "Cover the small portion" : "Stand the ribs on the rack", small
          ? `Put the scaled rack portion in a snug dish with ${q(150, context)} ml water, cover tightly and cook at 160°C conventional / 140°C fan for 1.5–2.5 hours. Check from 90 minutes and continue until a probe slides between the bones. An upright rack is for a full rack at 4 or more servings; this smaller piece uses the covered oven.`
          : "Stabilise the outdoor smoker at 120–140°C. Stand the ribs upright in a rib rack in the indirect zone, bone side facing the same way, not stacked flat and not in a foil parcel. Smoke for 4–6 hours. Spritz the surface with a little water if it dries. There is no clock that replaces the probe.", small ? 150 : 300),
        step("Check, rest and sauce", `${LONG_CUT} Rest 10 minutes, then cut into portions. Spoon the cooked regional sauce on after cooking. This upright rack is not the open foil boat and not a flat covered tray.`, 10),
      ],
      oven: "Cover the listed rack with 150 ml water and cook at 160°C conventional / 140°C fan for 2.5–3.5 hours until probe-tender. The upright rack is the outdoor method for 4 or more servings.",
      notes: ["Upright rib rack, indirect heat, unwrapped. Fat can drip away. This is not the flat covered-rib method and not the open foil boat.", "Choose 4 or more servings for the upright rack. Smaller portions use the covered-oven route and still finish probe-tender, usually 90–96°C."],
    });

    case "foil-boat-ribs": return assemble(context, vegetarian ? {
      name: "tempeh & mushroom foil boat", description: "Tempeh and mushroom strips sit in an open foil boat above a splash of liquid, not submerged.", prep: 20, cook: 50, side: "slaw-buns", mode: "smoke",
      ingredients: [tempeh(context, 600), veg("king-oyster", "King oyster mushrooms", 400, "Slice lengthways 1.5 cm thick.")],
      equipment: ["Cooking foil", "Heatproof tray"],
      steps: [
        step("Build an open boat", `Cut the tempeh into strips and slice the mushrooms lengthways. ${rub(context, "the tempeh and mushroom strips")} Shape a double layer of cooking foil into an open boat on a tray.`, 15),
        step("Cook above the liquid", `Lay the tempeh and mushroom strips in the boat in one layer. Add ${q(80, context)} ml hot water so they sit above the liquid, not submerged. Leave the foil open. Hot-smoke at 130–140°C for 35–50 minutes, until the tempeh is hot throughout and the mushrooms are tender. Follow any longer tempeh packet direction. ${PLANT}`, 50),
        step("Sauce after cooking", "Lift the strips out of the liquid and spoon the regional sauce over them after they leave the heat. Do not seal the boat for the whole cook.", 4),
      ],
      oven: "Use the same open foil boat at 180°C conventional / 160°C fan for 30–40 minutes. Keep the strips above the water, not submerged.",
      notes: ["Open foil boat: the strips sit above a splash of water, not submerged. This is not the upright rib rack and not a sealed parcel."],
    } : {
      name: small ? "covered oven ribs" : "foil-boat ribs", description: "Ribs cook bark-up in an open foil boat with a splash of liquid, not swimming in it.", prep: 25, cook: small ? 150 : 300, side: "slaw-buns", mode: small ? "grill" : "smoke", meat: true,
      ingredients: [meat("pork-ribs", "Pork spare ribs", 1400, "Trim loose fat and remove the tough membrane if present. Use a portion of a rack for smaller servings.")],
      equipment: ["Cooking foil", "Covered roasting dish", "Tongs", "Probe thermometer"], safety: LONG_CUT,
      steps: [
        step("Prepare the ribs", `Remove the tough membrane if present. ${rub(context, "the ribs")}`, 20),
        step(small ? "Cover the small portion" : "Float the ribs in an open boat", small
          ? `Put the scaled rack portion in a snug dish with ${q(150, context)} ml water, cover tightly and cook at 160°C conventional / 140°C fan for 1.5–2.5 hours. Check from 90 minutes and continue until a probe slides between the bones. The open foil boat is for a full rack at 4 or more servings.`
          : `Stabilise the outdoor smoker at 120–140°C. Lay the ribs bone-side down in an open foil boat, bark up. Add ${q(100, context)} ml hot water so the meat sits above the liquid, not submerged. Leave the foil open so the surface can form a bark. Cook indirectly for 4–6 hours. Do not seal the foil into a tight parcel for the whole cook.`, small ? 150 : 300),
        step("Check, rest and sauce", `${LONG_CUT} Rest 10 minutes, then cut into portions. Spoon the cooked regional sauce on after cooking. This open foil boat is not the upright rib rack.`, 10),
      ],
      oven: "For the listed rack, use an open foil boat with 100 ml water at 160°C conventional / 140°C fan for 2.5–3.5 hours until probe-tender, bark up and not submerged. Smaller portions use the covered dish in the steps.",
      notes: ["Open foil boat: bark up, a splash of water, meat not submerged. Do not seal the foil for the whole cook, or the bark will steam away. This is not the upright rib rack.", "Choose 4 or more servings for the foil boat. Smaller portions use the covered-oven route and still finish probe-tender, usually 90–96°C."],
    });

    case "burnt-ends": return assemble(context, vegetarian ? {
      name: "sauced mushroom & tempeh cubes", description: "Tempeh and mushroom cubes are smoked, then finished in a pan off the direct flame.", prep: 20, cook: 55, side: "slaw-buns", mode: "smoke",
      ingredients: [tempeh(context, 500), veg("king-oyster", "King oyster mushrooms", 450, "Cut into 3 cm cubes.")],
      equipment: ["Heatproof tray", "Foil pan or small roasting dish"],
      steps: [
        step("Cube the plant pieces", `Cut the tempeh and mushrooms into 3 cm cubes. ${rub(context, "the tempeh and mushroom cubes")}`, 15),
        step("Smoke, then finish in a pan", `Hot-smoke the cubes in one layer at 130–140°C for 25 minutes. Move them into a pan with ${q(60, context)} ml hot water, off any direct flame, for another 15–25 minutes, until the tempeh is hot throughout and the mushrooms are tender. Fold in the regional sauce only after it has been cooked. Follow any longer tempeh packet direction. ${PLANT}`, 50),
        step("Serve the cubes", "Spoon the sauced tempeh and mushroom cubes into the buns. Keep the pan above 60°C until it is served, then refrigerate leftovers promptly.", 5),
      ],
      oven: "Roast the tempeh and mushroom cubes at 200°C conventional / 180°C fan for 25 minutes, then finish in a covered pan with the scaled water for 15 minutes. Add the sauce off the heat.",
      notes: ["These are pan-finished cubes, not a whole roast. Sweet sauce stays off the direct flame."],
    } : {
      name: small ? "oven burnt ends" : "brisket burnt ends", description: "A brisket point is cooked until it can be cubed, then finished in a pan of sauce.", prep: 25, cook: small ? 160 : 300, side: "slaw-buns", mode: small ? "grill" : "smoke", meat: true,
      ingredients: [meat("brisket-point", "Beef brisket point", 1200, "The thicker point, unrolled. This is not a whole packer. Smaller servings use the covered-oven method.")],
      equipment: ["Heatproof tray", "Foil pan", "Probe thermometer"], safety: LONG_CUT,
      steps: [
        step("Prepare the point", `Trim loose fat and leave some surface fat. ${rub(context, "the brisket point")}`, 20),
        step(small ? "Braise the small point" : "Smoke the point", small
          ? `Put the scaled point in a snug dish with ${q(200, context)} ml water, cover tightly and cook at 160°C conventional / 140°C fan for 2–3 hours, checking from 90 minutes, until a probe slides in.`
          : "Stabilise the outdoor smoker at 120–140°C. Smoke the point indirectly for 3–4 hours, until the surface has a bark and the centre has passed 71°C and is approaching tenderness.", small ? 150 : 210),
        step("Cube and finish in the pan", `${LONG_CUT} Rest 15 minutes, cut into 3 cm cubes and put them in a pan with ${q(80, context)} ml hot water. Fold in the cooked regional sauce off the direct flame. Return the pan to indirect heat for 45–90 minutes, until the cubes are probe-tender, usually 90–96°C. Do not burn the sauce over an open flame.`, small ? 40 : 90),
      ],
      oven: "Cover a 1.2 kg point with 200 ml water and braise at 160°C conventional / 140°C fan for 3–4 hours, then cube and finish in the sauce pan until probe-tender. This timing is not a whole packer.",
      notes: ["Burnt ends are the point, cubed and sauced, not sliced brisket. The 1.2 kg piece is not a 16-hour packer cook. Sweet sauce stays off the direct flame.", "Choose 4 or more servings for the outdoor smoke. Smaller portions use the covered oven and still finish probe-tender, usually 90–96°C."],
    });

    case "smoked-meatloaf": {
      const crumbs = glutenFree
        ? item("meatloaf-crumbs", "Gluten-free breadcrumbs", 80, "g", "grocery", [], "Explicitly labelled gluten-free. Check the packet for milk if you also need dairy-free.", ["gluten-free breadcrumbs"])
        : dairyFree
          ? item("meatloaf-crumbs", "Dairy-free breadcrumbs", 80, "g", "grocery", ["wheat"], "Check the label for milk and for wheat.", ["dairy-free breadcrumbs"])
          : item("meatloaf-crumbs", "Breadcrumbs", 80, "g", "grocery", ["wheat"], "Plain breadcrumbs. Check the packet.", ["breadcrumbs"]);
      return assemble(context, vegetarian ? {
        name: "smoked lentil & bean loaf", description: "A lentil and bean loaf takes a short hot-smoke and is sliced hot.", prep: 25, cook: 55, side: "potato-greens", mode: "smoke",
        ingredients: [item("lentils", "Canned lentils, drained", 500, "g", "grocery", [], "Already cooked; the quantity is drained weight.", ["lentils", "canned lentils"]), beans(400), item("cornflour", "Cornflour (corn starch)", 30, "g", "grocery", [], "Use pure maize starch, not wheat starch."), veg("brown-onion", "Brown onion", 150, "Finely dice.")],
        equipment: ["Loaf tin", "Mixing bowl"],
        steps: [
          step("Mix the lentil loaf", `Mash the drained lentils and cannellini beans with the diced onion and cornflour until the mixture holds. ${rub(context, "the lentil and bean mixture")} Press it into a loaf tin.`, 20),
          step("Hot-smoke the loaf", `Hot-smoke at 140–149°C for 40–55 minutes, until the lentil and bean loaf is hot throughout and a skewer comes out hot. Follow a longer time if the centre is still cool. ${PLANT} Start the potatoes during the final 25 minutes.`, 55),
          step("Rest and slice", "Rest the loaf for 10 minutes, then slice and add the regional sauce.", 10),
        ],
        oven: "Bake the lentil and bean loaf at 180°C conventional / 160°C fan for 35–45 minutes, until hot throughout.",
        notes: ["This is a lentil and bean loaf, not a mince loaf."],
      } : {
        name: "smoked mince loaf", description: "A mince loaf cooks with gentle smoke and is checked in several places in the centre.", prep: 25, cook: 90, side: "potato-greens", mode: "smoke", meat: true,
        ingredients: [item("beef-mince", "Beef mince", 800, "g", "butcher", [], "Keep it chilled until mixing.", ["beef mince", "ground beef"]), crumbs, item("egg", "Eggs", 2, "", "grocery", ["egg"], "Used to bind the loaf."), veg("brown-onion", "Brown onion", 150, "Finely dice.")],
        equipment: ["Loaf tin", "Mixing bowl", "Probe thermometer"], safety: MINCE, source: BBQ_SOURCES.temperatures,
        steps: [
          step("Mix the loaf", `Combine the chilled beef mince, diced onion, breadcrumbs and eggs. ${rub(context, "the mixture")} Press it into a loaf tin without packing it into a dense brick. Wash hands and utensils before the sides.`, 20),
          step("Hot-smoke to 75°C", `Hot-smoke at 140–149°C for 60–90 minutes. ${MINCE} Check the centre in several places. Start the potatoes during the final 25 minutes.`, 90),
          step("Rest and slice", "Rest for 10 minutes, slice, and add the regional sauce. Keep the loaf hot for service.", 10),
        ],
        oven: "Bake at 180°C conventional / 160°C fan for 45–70 minutes, until the centre reaches 75°C.",
        notes: ["Mince is done at 75°C in the centre, not at a steak temperature. A pink smoke ring is not a doneness check."],
      });
    }

    case "rotisserie-roast": return assemble(context, vegetarian ? {
      name: "turned cauliflower roast", description: "A whole cauliflower is turned on a rack over indirect heat so it browns evenly.", prep: 20, cook: 60, side: "bean-salad", mode: "grill",
      ingredients: [veg("whole-cauliflower", "Cauliflower", 1200, "One medium head for 4 servings; use wedges for a smaller portion.")],
      equipment: ["Roasting rack", "Lidded barbecue or oven"],
      steps: [
        step("Prepare the cauliflower", `${small ? "Cut the listed cauliflower into large wedges." : "Trim the outer leaves and keep the head intact."} ${rub(context, "the cauliflower")}`, 15),
        step("Turn it as it roasts", `Roast over indirect 180–200°C heat. Turn the cauliflower a quarter turn every 15 minutes, or use a rotisserie spit if the head is secured and the manufacturer allows it. Cook for ${small ? "30–40" : "45–60"} minutes, until a knife enters the centre easily. Start the bean salad during the final 12 minutes. ${PLANT}`, 60),
        step("Rest and sauce", "Rest 5 minutes, cut into wedges and add the regional sauce.", 5),
      ],
      oven: "Roast at 200°C conventional / 180°C fan, turning the tray a quarter turn every 15 minutes, for 40–55 minutes for a whole head or 25–35 minutes for wedges.",
      notes: ["Turned roast: the cauliflower moves so the surfaces brown evenly. This is not a steak reverse-sear."],
    } : {
      name: "rotisserie pork loin", description: "A boneless loin turns over indirect heat, then rests before slicing.", prep: 20, cook: 90, side: "potato-greens", mode: "grill", meat: true,
      ingredients: [item("pork-loin", "Boneless pork loin roast", 1000, "g", "butcher", [], "One unrolled piece about 6–8 cm thick. Not a thin chop.", ["boneless pork loin", "pork loin roast"])],
      equipment: ["Rotisserie spit or roasting rack", "Lidded barbecue", "Probe thermometer"], safety: WHOLE_CUT, source: BBQ_SOURCES.temperatures,
      steps: [
        step("Prepare the loin", `${rub(context, "the boneless pork loin")} Tie it into an even shape if one end is much thinner. Keep it chilled until the cooker is ready.`, 15),
        step("Turn over indirect heat", `Set a lidded barbecue for indirect 160–180°C heat. Secure the loin on a rotisserie spit, or put it on a rack and turn the tray a quarter turn every 15 minutes if you have no spit. Cook for about 60–90 minutes. ${WHOLE_CUT} Start the potatoes during the final 25 minutes.`, 90),
        step("Rest and slice", "Rest for at least 3 minutes, then slice. Add the regional sauce after slicing. This turned roast is not the reverse-seared steak and not a thin chop on a hot grill.", 8),
      ],
      oven: "Roast at 180°C conventional / 160°C fan for 60–90 minutes, turning the tray every 15 minutes, until the centre reaches 71°C. Rest for at least 3 minutes. Smoked paprika supplies the smoky seasoning; an ordinary oven does not turn a spit over a fire.",
      notes: ["Rotisserie or turned roast, indirect heat. The endpoint is 71°C in the centre, then a rest of at least 3 minutes. It is not a low-and-slow shoulder and not a reverse-seared steak."],
    });

    default: return undefined;
  }
}
