import type { DietId, IngredientCategory, RecipeOption, SpiceHeat } from "./recipe-types.ts";
import type { DraftIngredient, Profile } from "./template-types.ts";

/**
 * Original fusion profiles, measured for FOUR servings before the recipe engine scales them.
 * These adapt regional flavour ideas to the selected cooking technique; they are not
 * representations of a traditional complete dish and have not been kitchen-tested.
 * Sauce-style context and packaged-sauce checks:
 * https://www.visitnc.com/list/taste-north-carolina-barbecue-styles-history-new-twists
 * https://www.visitkc.com/kansas-city-style/
 * https://www.visitjamaica.com/discover-jamaica/cuisine/jamaican-food/
 * https://usa.lkk.com/en/foodservices/homecooks/products/char-siu-sauce
 */
export const BBQ_REGIONS: RecipeOption[] = [
  { id: "texas-bbq", name: "Texas BBQ", origin: "Texas, United States", emoji: "🇺🇸", description: "Black pepper, smoked paprika and a bright tomato finish." },
  { id: "carolina-bbq", name: "Carolina BBQ", origin: "North Carolina, United States", emoji: "🇺🇸", description: "Vinegar, pepper, a little maple and fresh spring onion." },
  { id: "kansas-city-bbq", name: "Kansas City BBQ", origin: "Kansas City, United States", emoji: "🇺🇸", description: "Smoked paprika with tomato, molasses and cider vinegar." },
  { id: "argentine-asado", name: "Argentine asado", origin: "Argentina", emoji: "🇦🇷", description: "Oregano, parsley and a chimichurri-inspired vinegar finish." },
  { id: "korean-bbq", name: "Korean BBQ", origin: "South Korea", emoji: "🇰🇷", description: "Ginger, pear, soy and toasted sesame, with adjustable chilli." },
  { id: "japanese-yakitori", name: "Japanese yakitori", origin: "Japan", emoji: "🇯🇵", description: "A light soy-maple finish with ginger and spring onion." },
  { id: "cantonese-char-siu", name: "Cantonese char siu", origin: "Guangdong, China", emoji: "🇨🇳", description: "Five-spice and ginger with a light tomato-soy finish." },
  { id: "vietnamese-grill", name: "Vietnamese grill", origin: "Vietnam", emoji: "🇻🇳", description: "Lemongrass, ginger, lime and fresh coriander." },
  { id: "turkish-mangal", name: "Turkish mangal", origin: "Türkiye", emoji: "🇹🇷", description: "Cumin, paprika and mint, lifted with lemon and sumac." },
  { id: "greek-souvlaki", name: "Greek souvlaki", origin: "Greece", emoji: "🇬🇷", description: "Oregano, thyme, lemon and fresh dill." },
  { id: "spanish-plancha", name: "Spanish plancha", origin: "Spain", emoji: "🇪🇸", description: "Smoked paprika with roasted peppers, almonds and parsley." },
  { id: "jamaican-jerk", name: "Jamaican jerk", origin: "Jamaica", emoji: "🇯🇲", description: "Allspice, thyme, ginger and lime, with chilli to your taste." },
  { id: "indian-tandoor", name: "Indian tandoor", origin: "India", emoji: "🇮🇳", description: "Ginger, cumin, coriander and paprika with lemon and mint." },
  { id: "mexican-al-pastor", name: "Mexican al pastor", origin: "Mexico", emoji: "🇲🇽", description: "Smoky cumin and oregano with pineapple, lime and coriander." },
  { id: "moroccan-mechoui", name: "Moroccan mechoui", origin: "Morocco", emoji: "🇲🇦", description: "Cumin, coriander, ginger and paprika with lemon and parsley." },
  { id: "south-african-braai", name: "South African braai", origin: "South Africa", emoji: "🇿🇦", description: "Coriander and paprika with a light apricot-mustard finish." },
];

function ingredient(id: string, name: string, amount: number, unit: string, category: IngredientCategory = "grocery", allergens: string[] = [], notes?: string, aliases?: string[]): DraftIngredient {
  return { id, name, amount, unit, category, allergens, ...(notes ? { notes } : {}), ...(aliases ? { aliases } : {}) };
}

const spice = (id: string, name: string, amount: number, aliases?: string[]) => ingredient(id, name, amount, "tsp", "grocery", [], "Use a pure spice or herb; check packaged-food labels for your dietary needs.", aliases);
const smokedPaprika = (amount = 1) => spice("smoked-paprika", "Smoked paprika", amount);
const pepper = (amount = 0.5) => spice("black-pepper", "Ground black pepper", amount, ["black pepper"]);
const garlicPowder = (amount = 0.5) => spice("garlic-powder", "Garlic powder", amount);
const cumin = (amount = 1) => spice("cumin", "Ground cumin", amount, ["cumin"]);
const oregano = (amount = 1) => spice("oregano", "Dried oregano", amount, ["oregano"]);
const thyme = (amount = 0.5) => spice("dried-thyme", "Dried thyme", amount, ["thyme"]);
const ginger = (amount = 15) => ingredient("fresh-ginger", "Fresh ginger", amount, "g", "produce", [], "Finely grate.", ["ginger"]);
const herb = (id: string, name: string, amount: number, aliases: string[]) => ingredient(id, name, amount, "g", "produce", [], "Finely chop and reserve for finishing.", aliases);
const parsley = (amount = 15) => herb("parsley", "Flat-leaf parsley", amount, ["parsley", "fresh parsley"]);
const coriander = (amount = 15) => herb("coriander", "Fresh coriander", amount, ["coriander", "cilantro"]);
const mint = (amount = 10) => herb("mint", "Fresh mint", amount, ["mint"]);
const lemon = () => ingredient("lemon", "Lemon", 1, "", "produce", [], "Zest first, then juice; add gradually to taste.");
const lime = () => ingredient("lime", "Lime", 1, "", "produce", [], "Zest first, then juice; add gradually to taste.");
const springOnion = (amount = 2) => ingredient("spring-onion", "Spring onions", amount, "", "produce", [], "Thinly slice and reserve for finishing.", ["spring onion", "scallions", "green onions"]);
const maple = (amount = 1) => ingredient("maple-syrup", "Pure maple syrup", amount, "tsp", "grocery", [], "Keep this small amount for the finishing sauce.", ["maple syrup"]);
const sesameOil = () => ingredient("sesame-oil", "Toasted sesame oil", 1, "tsp", "grocery", ["sesame"], "Add at the end for aroma.");
const sesameSeeds = () => ingredient("sesame-seeds", "Sesame seeds", 1, "tsp", "grocery", ["sesame"], "Reserve for finishing.");
const finishOil = () => ingredient("bbq-finishing-olive-oil", "Extra virgin olive oil", 1, "tbsp", "grocery", [], "Reserve this separate amount for the finishing dressing.", ["olive oil"]);

/** Restricted products never inherit a generic pantry alias that could match an unsuitable version. */
function condiment(id: string, name: string, amount: number, unit: string, gf: boolean, allergens: string[] = [], notes = ""): DraftIngredient {
  const label = `${gf ? "Gluten-free vegan" : "Vegan"} ${name.toLowerCase()}`;
  return ingredient(`${gf ? "gf-" : ""}${id}`, label, amount, unit, "grocery", allergens,
    `Choose a vegan-labelled, dairy-free product${gf ? " that is explicitly labelled gluten-free" : ""}. ${notes}`.trim(),
    [label]);
}

function soy(gf: boolean): DraftIngredient {
  return ingredient(gf ? "gf-bbq-tamari" : "bbq-soy-sauce", gf ? "Gluten-free tamari" : "Vegan soy sauce", 1, "tbsp", "grocery", gf ? ["soy"] : ["soy", "wheat"],
    "Choose a vegan, dairy-free product; gluten-free meals require explicitly labelled gluten-free tamari. Add gradually before deciding whether more salt is needed.",
    gf ? ["gluten-free tamari"] : ["vegan soy sauce"]);
}

function vinegar(kind: "cider" | "rice" | "red-wine" | "sherry", amount: number, gf: boolean): DraftIngredient {
  const names = { cider: "Apple cider vinegar", rice: "Rice vinegar", "red-wine": "Red wine vinegar", sherry: "Sherry vinegar" };
  const name = `${gf ? "Gluten-free " : ""}${names[kind].toLowerCase()}`;
  return ingredient(`${gf ? "gf-" : ""}${kind}-vinegar`, name.charAt(0).toUpperCase() + name.slice(1), amount, "tsp", "grocery",
    ["red-wine", "sherry"].includes(kind) ? ["sulphites"] : [],
    `Use a plain vegan vinegar${gf ? " explicitly labelled gluten-free" : ""}; add gradually to taste. Check the label for sulphites.`,
    gf ? [name] : [names[kind], ...(kind === "cider" ? ["cider vinegar"] : [])]);
}

export function bbqProfileFor(regionId: string, diet: DietId, heat: SpiceHeat): Profile | undefined {
  const gf = diet === "gluten-free";
  const heatAmount = { mild: 0, medium: 0.25, hot: 0.75 }[heat];
  const chilli = () => heatAmount ? [spice("chilli-flakes", "Chilli flakes", heatAmount, ["chili flakes", "red pepper flakes", "chilli", "chili"])] : [];
  const ketchup = (amount = 2) => condiment("bbq-tomato-ketchup", "Tomato ketchup", amount, "tbsp", gf, [], "Reserve for finishing; use plain tomato ketchup rather than a prepared barbecue sauce.");

  switch (regionId) {
    case "texas-bbq": return {
      title: "Texas-style pepper & smoke", tags: ["Peppery", "Smoky", "Tomato"],
      warm: [pepper(1), smokedPaprika(1.5), garlicPowder(1), spice("onion-powder", "Onion powder", 0.5), ...chilli()],
      finish: [ketchup(1.5), vinegar("cider", 1, gf), parsley(10)],
      note: "Black pepper and a restrained smoky rub bring Texas barbecue inspiration to the selected main or classic. Smoked paprika supplies smoky depth, while a small tomato-vinegar finish balances the richness.",
    };
    case "carolina-bbq": return {
      title: "Carolina-style vinegar & pepper", tags: ["Tangy", "Peppery", "Light smoke"],
      warm: [pepper(0.75), smokedPaprika(0.75), garlicPowder(0.5), ...chilli()],
      finish: [vinegar("cider", 2, gf), maple(1), springOnion(2)],
      note: "This light finish takes its cue from North Carolina's vinegar-and-pepper tradition. A little maple rounds the sharpness and smoked paprika brings gentle smoke; add the vinegar gradually when remixing a creamy classic.",
    };
    case "kansas-city-bbq": return {
      title: "Kansas City tomato & molasses", tags: ["Tomato", "Smoky", "Gentle sweetness"],
      warm: [smokedPaprika(1.5), garlicPowder(0.75), pepper(0.5), ...chilli()],
      finish: [ketchup(2), ingredient("molasses", "Molasses", 1, "tsp", "grocery", [], "Stir into the finishing sauce; a little goes a long way.", ["black treacle"]), vinegar("cider", 1, gf), parsley(10)],
      note: "Tomato and a small measure of molasses echo Kansas City's sweet, rounded barbecue sauces. Smoked paprika adds depth. The sweet ingredients are reserved for finishing so the warm seasoning stays useful for every classic and cooking method.",
    };
    case "argentine-asado": return {
      title: "Asado-style parsley & oregano", tags: ["Herbaceous", "Tangy", "Light smoke"],
      warm: [oregano(1), smokedPaprika(0.5), garlicPowder(0.5), pepper(0.25), ...chilli()],
      finish: [parsley(20), vinegar("red-wine", 2, gf), finishOil()],
      note: "Parsley, oregano and red-wine vinegar create a loose chimichurri-inspired finish. A light smoked-paprika note carries that barbecue character into classic remixes, while the selected cooking method determines the final char and texture.",
    };
    case "korean-bbq": return {
      title: "Korean BBQ pear & sesame", tags: ["Pear", "Sesame", "Savoury"],
      warm: [ginger(15), garlicPowder(0.75), pepper(0.25), ...chilli()],
      finish: [soy(gf), ingredient("bbq-pear", "Pear", 80, "g", "produce", [], "Core and finely grate immediately before mixing the finish."), sesameOil(), sesameSeeds(), springOnion(2)],
      note: "Pear, ginger and soy give this Korean barbecue adaptation a mellow sweetness, distinct from the gochujang profile. Toasted sesame supplies roasted aroma; choose a grill or smoker method when you want actual char or smoke.",
    };
    case "japanese-yakitori": return {
      title: "Yakitori-style soy & spring onion", tags: ["Savoury", "Ginger", "Spring onion"],
      warm: [ginger(15), garlicPowder(0.5), pepper(0.25), ...chilli()],
      finish: [soy(gf), maple(2), vinegar("rice", 1, gf), springOnion(3), sesameSeeds()],
      note: "A light soy-maple finish and spring onion echo yakitori-style sweet-savoury seasoning. Sesame contributes toasted aroma. The selected grill or smoker method supplies the char; for classic remixes, fold in this finish at the end.",
    };
    case "cantonese-char-siu": return {
      title: "Char-siu-style five-spice", tags: ["Five-spice", "Savoury", "Light sweetness"],
      warm: [ingredient(gf ? "gf-five-spice" : "five-spice", gf ? "Gluten-free Chinese five-spice" : "Chinese five-spice", 0.75, "tsp", "grocery", [], "Choose an unsalted, vegan spice blend; gluten-free meals require a labelled gluten-free blend.", gf ? ["gluten-free chinese five-spice"] : ["chinese five-spice", "five-spice"]), ginger(15), smokedPaprika(0.5), ...chilli()],
      finish: [soy(gf), ketchup(1), maple(2), vinegar("rice", 1, gf), springOnion(2)],
      note: "Five-spice, ginger and a small sweet soy finish provide a char-siu-inspired flavour, with smoked paprika adding a gentle barbecue note. This maple-based adaptation keeps the finishing ingredients plant-based and lets gluten-free cooks choose labelled tamari and ketchup.",
    };
    case "vietnamese-grill": return {
      title: "Lemongrass, ginger & lime", tags: ["Lemongrass", "Citrus", "Fresh herbs"],
      warm: [ingredient("lemongrass", "Fresh lemongrass", 1, "stalk", "produce", [], "Discard the tough outer leaves; mince only the tender pale centre very finely.", ["lemongrass"]), ginger(15), pepper(0.25), ...chilli()],
      finish: [soy(gf), lime(), coriander(15), maple(1)],
      note: "Lemongrass and ginger season the warm base, with lime and coriander added for a fresh Vietnamese-grill-inspired finish. Soy gives the sauce a plant-based savoury note. Grilling or smoking supplies toasted edges when that cooking method is selected.",
    };
    case "turkish-mangal": return {
      title: "Mangal-style cumin & sumac", tags: ["Cumin", "Lemony", "Herbaceous"],
      warm: [cumin(1), spice("sweet-paprika", "Sweet paprika", 1), smokedPaprika(0.5), spice("dried-mint", "Dried mint", 0.5), ...chilli()],
      finish: [lemon(), parsley(15), spice("sumac", "Sumac", 1, ["pure sumac"])],
      note: "Cumin, paprika and mint bring a Turkish-mangal-inspired warmth to the main or classic. A little smoked paprika adds depth; lemon, parsley and sumac keep the finish lively. Use pure sumac and check the blend's label.",
    };
    case "greek-souvlaki": return {
      title: "Souvlaki-style lemon & oregano", tags: ["Lemony", "Oregano", "Fresh herbs"],
      warm: [oregano(1.5), thyme(0.5), garlicPowder(0.5), smokedPaprika(0.5), ...chilli()],
      finish: [lemon(), herb("dill", "Fresh dill", 10, ["dill"]), parsley(10)],
      note: "Oregano, thyme and lemon bring a souvlaki-inspired flavour to the chosen base. Smoked paprika adds a small smoky note, while fresh dill and parsley lighten the finish. The classic's sauce or chosen cooking method supplies the final texture.",
    };
    case "spanish-plancha": return {
      title: "Plancha-style paprika & peppers", tags: ["Smoky", "Roasted pepper", "Almond"],
      warm: [smokedPaprika(1.5), garlicPowder(0.75), pepper(0.25), ...chilli()],
      finish: [condiment("roasted-red-peppers", "Roasted red peppers", 80, "g", gf, [], "Use plain jarred peppers; drain and chop very finely."), ingredient("almonds", "Almonds", 15, "g", "grocery", ["tree nuts"], "Chop very finely for the finishing sauce.", ["whole almonds"]), vinegar("sherry", 1, gf), parsley(15)],
      note: "Smoked paprika and roasted red peppers bring a Spanish-plancha-inspired flavour. Finely chopped almonds and a little sherry vinegar make a loose, romesco-inspired finish that also works folded into a classic sauce. Almonds remain a declared allergen.",
    };
    case "jamaican-jerk": return {
      title: "Jerk-style allspice & thyme", tags: ["Allspice", "Thyme", "Lime"],
      warm: [spice("allspice", "Ground allspice", 1.5, ["allspice", "ground pimento"]), thyme(1), ginger(15), spice("cinnamon", "Ground cinnamon", 0.25, ["cinnamon"]), smokedPaprika(0.5), ...chilli()],
      finish: [lime(), springOnion(3), maple(1)],
      note: "Allspice, thyme and ginger give this approachable jerk-inspired adaptation its warm aroma. Chilli scales with your heat preference; smoked paprika brings a light smoky note without requiring specialist wood. Lime and spring onion freshen the finish.",
    };
    case "indian-tandoor": return {
      title: "Tandoor-style ginger & spice", tags: ["Warming spice", "Ginger", "Mint"],
      warm: [cumin(1), spice("ground-coriander", "Ground coriander", 1), spice("sweet-paprika", "Sweet paprika", 1), smokedPaprika(0.5), spice("turmeric", "Ground turmeric", 0.25, ["turmeric"]), ginger(15), ...chilli()],
      finish: [lemon(), mint(10), coriander(10)],
      note: "Ginger, cumin, coriander and paprika create a tandoor-inspired spice base. A little smoked paprika supplies a toasted-smoke note; lemon and mint balance the richness. The profile itself is dairy-free, so it fits both plant-based finishes and a classic's yogurt sauce.",
    };
    case "mexican-al-pastor": return {
      title: "Al-pastor-style pineapple & spice", tags: ["Pineapple", "Smoky", "Citrus"],
      warm: [cumin(1), smokedPaprika(1), oregano(0.5), garlicPowder(0.5), ...chilli()],
      finish: [ingredient("pineapple", "Pineapple", 80, "g", "produce", [], "Use fresh pineapple, or canned in juice and drained; chop finely for finishing.", ["fresh pineapple"]), lime(), coriander(15)],
      note: "Pineapple, oregano and chilli take inspiration from al pastor, adapted here with familiar pantry spices. Smoked paprika brings a smoky base. Keep the small pineapple portion for the finish so it adds freshness to the selected meal or classic.",
    };
    case "moroccan-mechoui": return {
      title: "Mechoui-style cumin & lemon", tags: ["Cumin", "Smoky", "Parsley"],
      warm: [cumin(1.5), spice("ground-coriander", "Ground coriander", 1), spice("sweet-paprika", "Sweet paprika", 1), smokedPaprika(0.5), spice("ground-ginger", "Ground ginger", 0.5), ...chilli()],
      finish: [lemon(), parsley(15), finishOil()],
      note: "Cumin, coriander and ginger form a mechoui-inspired seasoning that suits the selected meat, plant main or classic. A touch of smoked paprika adds depth. Lemon, parsley and the reserved olive oil make a bright finishing dressing.",
    };
    case "south-african-braai": return {
      title: "Braai-style coriander & apricot", tags: ["Coriander", "Smoky", "Sweet-tangy"],
      warm: [spice("ground-coriander", "Ground coriander", 1.5), cumin(0.5), smokedPaprika(1), pepper(0.25), ...chilli()],
      finish: [condiment("apricot-jam", "Apricot jam", 2, "tsp", gf, [], "Choose a smooth fruit jam; keep this small amount for finishing."), condiment("prepared-mustard", "Prepared mustard", 1, "tsp", gf, ["mustard"], "Use plain mustard without honey."), vinegar("cider", 1, gf), parsley(15)],
      note: "Coriander and smoked paprika bring a braai-inspired savoury base. A small apricot-and-mustard finish supplies fruit and tang, inspired by South African barbecue pairings. Add that sweet finish after cooking; let the selected method determine the char or smoke.",
    };
    default: return undefined;
  }
}
