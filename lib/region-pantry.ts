import type { IngredientCategory, SpiceHeat } from "./recipe-types.ts";
import type { DraftIngredient } from "./template-types.ts";
import type { MealOption } from "./meal-types.ts";

/**
 * Regional spices, herbs, heats and pastes for the meal builder.
 *
 * Names follow the public lists "List of culinary herbs and spices" and
 * "Chili sauce and paste" (Wikipedia). Those pages, and food databases such as
 * FooDB and USDA FoodData Central, name the food. They do not assign a cuisine.
 * The region link on each item is authored from the cooking tradition that uses
 * it, then checked by putting that item on the plate. A listed ingredient that
 * never reaches a plate is the bug this file exists to avoid.
 *
 * A plate gets one signature heat, at most one second heat, and a short set of
 * spices and herbs. The catalogue is larger than any one shopping list.
 * Fish sauce, oyster sauce, belacan, dried shrimp and prahok are not on the
 * shared plate. Sriracha stays a seeded finish in the SAT search, not a second
 * sauce on every Thai meal. Templates, not kitchen-tested dishes.
 */
export const PANTRY_SOURCES = {
  herbsAndSpices: "https://en.wikipedia.org/wiki/List_of_culinary_herbs_and_spices",
  chilliPastes: "https://en.wikipedia.org/wiki/Chili_sauce",
} as const;

export type PantryKind = "spice" | "herb" | "heat" | "paste" | "aromatic" | "acid" | "finish";

export interface PantryItem {
  id: string;
  name: string;
  kind: PantryKind;
  amount: number;
  unit: string;
  category: IngredientCategory;
  allergens: readonly string[];
  aliases: readonly string[];
  notes?: string;
  /** Mild 0.25, medium 1, hot 1.75. Mild stays above zero so the heat is still listed. */
  scalesWithHeat?: boolean;
  glutenFree?: {
    name: string;
    allergens: readonly string[];
    aliases: readonly string[];
    notes?: string;
  };
}

export interface RegionTaste {
  id: string;
  name: string;
  emoji: string;
  description: string;
  sauce: string;
  body: "coconut" | "tomato" | "stock";
  /** Key in the staple table. Existing regions use their own id. */
  staple: string;
  aromatics: readonly string[];
  simmer?: readonly string[];
  /** The heat the mild/hot comparison tracks. Always scaled. */
  heat: string;
  sideHeat?: string;
  /** Added only at hot, still a real pantry item. */
  hotOnly?: string;
  acid: string;
  herbs?: readonly string[];
  finish?: readonly string[];
  /** Replaces the catalogue amount before heat scaling. */
  amounts?: Readonly<Record<string, number>>;
}

const CHILLI = ["chilli", "chili"] as const;

function spice(
  id: string,
  name: string,
  amount: number,
  aliases: readonly string[] = [],
  notes?: string,
  allergens: readonly string[] = [],
  unit = "tsp",
  category: IngredientCategory = "grocery",
): PantryItem {
  return { id, name, kind: "spice", amount, unit, category, allergens: [...allergens], aliases: [...aliases], ...(notes ? { notes } : {}) };
}

function heat(
  id: string,
  name: string,
  amount: number,
  unit: string,
  aliases: readonly string[],
  notes: string,
  category: IngredientCategory = "grocery",
  allergens: readonly string[] = [],
): PantryItem {
  return { id, name, kind: "heat", amount, unit, category, allergens: [...allergens], aliases: [...aliases], notes, scalesWithHeat: true };
}

function paste(
  id: string,
  name: string,
  amount: number,
  note: string,
  allergens: readonly string[] = [],
  aliases?: readonly string[],
  glutenFree?: PantryItem["glutenFree"],
): PantryItem {
  const rest = `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  return {
    id,
    name,
    kind: "paste",
    amount,
    unit: "tbsp",
    category: "specialty",
    allergens: [...allergens],
    aliases: [...(aliases ?? [rest])],
    notes: note,
    scalesWithHeat: true,
    glutenFree: glutenFree ?? {
      name: `Gluten-free ${rest}`,
      allergens: allergens.filter((item) => item !== "wheat"),
      aliases: [`gluten free ${rest}`],
      notes: `${note} Choose a product explicitly labelled gluten-free.`,
    },
  };
}

function herb(id: string, name: string, amount: number, aliases: readonly string[], notes = "Washed and finely chopped."): PantryItem {
  return { id, name, kind: "herb", amount, unit: "g", category: "produce", allergens: [], aliases: [...aliases], notes };
}

const garlic: PantryItem = { id: "garlic", name: "Garlic", kind: "aromatic", amount: 15, unit: "g", category: "produce", allergens: [], aliases: ["garlic cloves"], notes: "Peeled and finely minced." };
const ginger: PantryItem = { id: "ginger", name: "Fresh ginger", kind: "aromatic", amount: 15, unit: "g", category: "produce", allergens: [], aliases: ["ginger"], notes: "Peeled and finely grated." };
const lemon: PantryItem = { id: "lemon-juice", name: "Lemon juice", kind: "acid", amount: 30, unit: "ml", category: "produce", allergens: [], aliases: ["lemon juice"], notes: "Freshly squeezed; measure the juice." };
const lime: PantryItem = { id: "lime-juice", name: "Lime juice", kind: "acid", amount: 30, unit: "ml", category: "produce", allergens: [], aliases: ["lime juice"], notes: "Freshly squeezed; measure the juice." };

const soy: PantryItem = {
  id: "soy-sauce",
  name: "Soy sauce",
  kind: "finish",
  amount: 2,
  unit: "tbsp",
  category: "grocery",
  allergens: ["soy", "wheat"],
  aliases: ["soy sauce"],
  glutenFree: {
    name: "Gluten-free tamari",
    allergens: ["soy"],
    aliases: ["gluten free tamari", "gluten-free soy sauce"],
    notes: "Choose a product explicitly labelled gluten-free.",
  },
};

const miso: PantryItem = {
  id: "miso",
  name: "White miso",
  kind: "paste",
  amount: 1.5,
  unit: "tbsp",
  category: "specialty",
  allergens: ["soy"],
  aliases: ["white miso", "rice miso"],
  notes: "Use a rice-based miso; check the label for other allergens.",
  glutenFree: {
    name: "Gluten-free white miso",
    allergens: ["soy"],
    aliases: ["gluten free white miso", "gluten-free miso"],
    notes: "Use a rice-based miso; check the label for other allergens.",
  },
};

const kecap: PantryItem = {
  id: "kecap-manis",
  name: "Kecap manis",
  kind: "finish",
  amount: 2,
  unit: "tbsp",
  category: "grocery",
  allergens: ["soy", "wheat"],
  aliases: ["kecap manis", "sweet soy sauce"],
  notes: "Sweet soy sauce. Check the label for wheat.",
  glutenFree: {
    name: "Gluten-free kecap manis",
    allergens: ["soy"],
    aliases: ["gluten free kecap manis", "gluten-free kecap manis"],
    notes: "Sweet soy sauce explicitly labelled gluten-free.",
  },
};

const gochujang = paste(
  "gochujang",
  "Vegan gochujang",
  2,
  "Choose a vegan product; heat varies by brand.",
  ["soy", "wheat"],
  ["vegan gochujang"],
  {
    name: "Gluten-free vegan gochujang",
    allergens: ["soy"],
    aliases: ["gluten free vegan gochujang", "gluten-free gochujang"],
    notes: "Choose a vegan product; heat varies by brand.",
  },
);

const redCurry = paste(
  "red-curry-paste",
  "Vegan red curry paste",
  2,
  "Choose a paste without fish sauce or shrimp; check allergens and heat.",
  [],
  ["vegan red curry paste"],
  {
    name: "Gluten-free vegan red curry paste",
    allergens: [],
    aliases: ["gluten free vegan red curry paste"],
    notes: "Choose a paste without fish sauce or shrimp; check allergens and heat.",
  },
);

const checkPaste = "Choose a paste without fish sauce or shrimp paste; check the label and the heat.";

export const PANTRY_ITEMS: readonly PantryItem[] = [
  garlic,
  ginger,
  herb("shallot", "Shallots", 40, ["shallot", "shallots"], "Finely sliced."),
  { id: "lemongrass", name: "Lemongrass", kind: "aromatic", amount: 20, unit: "g", category: "produce", allergens: [], aliases: ["lemongrass"], notes: "Tender inner part only, very finely minced." },
  { id: "galangal", name: "Galangal", kind: "aromatic", amount: 15, unit: "g", category: "produce", allergens: [], aliases: ["galangal"], notes: "Peeled and finely sliced. Ginger is the usual substitute at the same weight, and it is not the same flavour." },
  { id: "curry-leaves", name: "Fresh curry leaves", kind: "herb", amount: 8, unit: "g", category: "produce", allergens: [], aliases: ["curry leaves", "fresh curry leaves"], notes: "Strip the leaves off the stalk." },
  { id: "kaffir-lime-leaves", name: "Kaffir lime leaves", kind: "herb", amount: 6, unit: "g", category: "produce", allergens: [], aliases: ["kaffir lime leaves", "makrut lime leaves"], notes: "Tear and bruise them. Also sold as makrut lime leaves." },
  { id: "pandan", name: "Pandan leaf", kind: "herb", amount: 1, unit: "", category: "produce", allergens: [], aliases: ["pandan", "pandan leaf"], notes: "Tie in a knot and simmer, then lift it out before serving." },
  { id: "bay-leaves", name: "Bay leaves", kind: "spice", amount: 2, unit: "", category: "grocery", allergens: [], aliases: ["bay leaf", "bay leaves"], notes: "Dried bay. Lift the leaves out before serving." },
  { id: "dried-lime", name: "Dried limes", kind: "aromatic", amount: 2, unit: "", category: "specialty", allergens: [], aliases: ["dried lime", "dried limes", "limu amani"], notes: "Pierce and simmer in the sauce. Persian limu amani." },
  lemon,
  lime,
  { id: "calamansi", name: "Calamansi juice", kind: "acid", amount: 30, unit: "ml", category: "produce", allergens: [], aliases: ["calamansi", "calamansi juice"], notes: "Fresh or bottled calamansi juice. Use the same volume of lime juice only if calamansi is not in the shop." },
  { id: "orange-juice", name: "Orange juice", kind: "acid", amount: 60, unit: "ml", category: "produce", allergens: [], aliases: ["orange juice"], notes: "Freshly squeezed." },
  { id: "rice-vinegar", name: "Rice vinegar", kind: "acid", amount: 1, unit: "tbsp", category: "grocery", allergens: [], aliases: ["rice vinegar"] },
  { id: "sherry-vinegar", name: "Sherry vinegar", kind: "acid", amount: 1, unit: "tbsp", category: "grocery", allergens: ["sulphites"], aliases: ["sherry vinegar"], notes: "Check the product label for sulphites." },
  { id: "red-wine-vinegar", name: "Red wine vinegar", kind: "acid", amount: 1, unit: "tbsp", category: "grocery", allergens: ["sulphites"], aliases: ["red wine vinegar"], notes: "Check the product label for sulphites." },
  { id: "vinegar", name: "White vinegar", kind: "acid", amount: 1, unit: "tbsp", category: "grocery", allergens: [], aliases: ["white vinegar", "vinegar"] },
  { id: "tamarind", name: "Tamarind paste", kind: "acid", amount: 1, unit: "tbsp", category: "grocery", allergens: [], aliases: ["tamarind", "tamarind paste"], notes: "Seedless tamarind paste, not a sweet drink." },
  soy,
  miso,
  kecap,
  { id: "sesame-seeds", name: "Toasted sesame seeds", kind: "finish", amount: 1, unit: "tbsp", category: "grocery", allergens: ["sesame"], aliases: ["toasted sesame seeds"], notes: "Use ready-toasted seeds." },
  { id: "sesame-oil", name: "Toasted sesame oil", kind: "finish", amount: 1, unit: "tbsp", category: "grocery", allergens: ["sesame"], aliases: ["sesame oil", "toasted sesame oil"], notes: "For the sauce. Do not use it as the frying oil." },
  { id: "palm-sugar", name: "Palm sugar", kind: "finish", amount: 1, unit: "tbsp", category: "grocery", allergens: [], aliases: ["palm sugar"], notes: "Or an equal weight of light brown sugar." },
  { id: "peanuts", name: "Unsalted roasted peanuts", kind: "finish", amount: 40, unit: "g", category: "grocery", allergens: ["peanut"], aliases: ["peanuts", "roasted peanuts", "groundnuts"], notes: "Unsalted. Chop or crush them into the sauce." },
  { id: "cocoa", name: "Unsweetened cocoa powder", kind: "spice", amount: 1, unit: "tbsp", category: "grocery", allergens: [], aliases: ["cocoa", "cocoa powder", "unsweetened cocoa"], notes: "Plain cocoa, not a sweetened drinking powder." },
  { id: "saffron", name: "Saffron threads", kind: "spice", amount: 0.1, unit: "g", category: "specialty", allergens: [], aliases: ["saffron", "saffron threads"], notes: "A few threads. Soak them in a spoon of warm water, then add the liquid." },
  { id: "annatto", name: "Annatto seeds", kind: "spice", amount: 0.5, unit: "tsp", category: "specialty", allergens: [], aliases: ["annatto", "achiote", "achuete"], notes: "Also called achiote or achuete. Colour, not heat. Ground annatto at the same measure is fine." },
  spice("cumin", "Ground cumin", 1.5, ["cumin", "ground cumin"]),
  spice("smoked-paprika", "Smoked paprika", 1.5, ["smoked paprika"]),
  spice("paprika", "Sweet paprika", 1.5, ["paprika", "sweet paprika"]),
  spice("garam-masala", "Garam masala", 2, ["garam masala"], "Use an unsalted blend and check the label."),
  spice("turmeric", "Ground turmeric", 0.5, ["turmeric", "ground turmeric"]),
  spice("ground-coriander", "Ground coriander", 1.5, ["ground coriander", "coriander seeds"]),
  spice("sumac", "Ground sumac", 1.5, ["sumac"]),
  spice("oregano", "Dried oregano", 1.5, ["dried oregano", "oregano"]),
  spice("mexican-oregano", "Mexican oregano", 1, ["mexican oregano"], "Different from Mediterranean oregano. Check the jar."),
  spice("thyme", "Dried thyme", 1, ["dried thyme", "thyme"]),
  spice("cinnamon", "Ground cinnamon", 0.5, ["cinnamon", "ground cinnamon"]),
  spice("ceylon-cinnamon", "Ceylon cinnamon", 0.5, ["ceylon cinnamon", "true cinnamon"], "True cinnamon, not cassia. Ground is fine.", [], "tsp", "specialty"),
  spice("cardamom", "Ground cardamom", 0.5, ["cardamom", "ground cardamom"]),
  spice("cloves", "Ground cloves", 0.25, ["cloves", "ground cloves"]),
  spice("nutmeg", "Ground nutmeg", 0.25, ["nutmeg", "ground nutmeg"]),
  spice("star-anise", "Star anise", 0.5, ["star anise"]),
  spice("fennel-seeds", "Fennel seeds", 1, ["fennel seeds", "fennel seed"]),
  spice("caraway", "Caraway seeds", 1, ["caraway", "caraway seeds"]),
  spice("fenugreek", "Fenugreek seeds", 0.5, ["fenugreek", "methi seeds"]),
  spice("dried-ginger", "Dried ginger", 0.5, ["dried ginger", "ground ginger", "sonth"]),
  spice("allspice", "Ground allspice", 1, ["allspice", "pimento"]),
  spice("five-spice", "Chinese five-spice", 0.5, ["five spice", "chinese five spice", "five-spice"]),
  spice("curry-powder", "Mild curry powder", 1, ["curry powder", "mild curry powder"], "A mild yellow blend. Check the label for wheat and for mustard."),
  spice("onion-powder", "Onion powder", 1, ["onion powder"]),
  spice("celery-seed", "Celery seeds", 0.5, ["celery seeds", "celery seed"], undefined, ["celery"]),
  spice("mustard-seeds", "Brown mustard seeds", 1, ["mustard seeds", "brown mustard seeds"], "Warm them in the oil until they pop, then continue.", ["mustard"]),
  spice("panch-phoron", "Panch phoron", 1, ["panch phoron", "panch phoran"], "Bengali five-spice: fenugreek, nigella, cumin, fennel and brown mustard seed.", ["mustard"], "tsp", "specialty"),
  spice("ras-el-hanout", "Ras el hanout", 1, ["ras el hanout"], "Moroccan blend. Jars vary. Check for nuts and for wheat.", [], "tsp", "specialty"),
  spice("advieh", "Advieh", 1.5, ["advieh"], "Persian blend. Cinnamon, cardamom and cumin are typical. Check the label.", [], "tsp", "specialty"),
  spice("khmeli-suneli", "Khmeli suneli", 2, ["khmeli suneli", "khmeli-suneli"], "Georgian blend. Blue fenugreek, coriander and marigold are typical. Check the label.", [], "tsp", "specialty"),
  spice("hawaij", "Hawaij", 1.5, ["hawaij", "hawaij spice"], "Yemeni stew blend: cumin, turmeric, cardamom and black pepper. Not the coffee blend.", [], "tsp", "specialty"),
  spice("xawaash", "Xawaash", 1.5, ["xawaash", "hawaash"], "Somali blend. Cumin, coriander, cardamom and a little cinnamon are typical. Check the label.", [], "tsp", "specialty"),
  spice("tabil", "Tabil", 1.5, ["tabil", ...CHILLI], "Tunisian blend of coriander, caraway, garlic and chilli. Check the label.", [], "tsp", "specialty"),
  spice("zaatar", "Za'atar", 1, ["za'atar", "zaatar"], "Thyme, sesame and sumac. Check the label.", ["sesame"], "tbsp", "specialty"),
  spice("kasuri-methi", "Dried fenugreek leaves", 1, ["kasuri methi", "dried fenugreek leaves"], "Crush them between your fingers as you add them.", [], "tbsp"),
  spice("dried-mint", "Dried mint", 1, ["dried mint"], undefined),
  spice("lemon-myrtle", "Ground lemon myrtle", 0.5, ["lemon myrtle", "ground lemon myrtle"], "Australian lemon myrtle. A little is enough.", [], "tsp", "specialty"),
  spice("sichuan-pepper", "Sichuan pepper", 1, ["sichuan pepper", "szechuan pepper", "hua jiao"], "Toast and grind if the packet is whole. It should tingle. It is not a chilli.", [], "tsp", "specialty"),
  spice("sansho", "Sansho pepper", 0.25, ["sansho", "sansho pepper"], "Japanese pepper. It tingles. It is not a chilli.", [], "tsp", "specialty"),
  spice("timur", "Timur", 0.5, ["timur", "nepali pepper"], "Nepali prickly ash. It numbs, like Sichuan pepper. It is not a chilli.", [], "tsp", "specialty"),
  spice("grains-of-paradise", "Grains of paradise", 0.5, ["grains of paradise", "melegueta pepper"], "Also called melegueta pepper. A pepper, not a chilli.", [], "tsp", "specialty"),
  spice("shichimi", "Shichimi togarashi", 1, ["shichimi", "shichimi togarashi", ...CHILLI], "Japanese seven-spice. It contains chilli and usually sesame. Check the label.", ["sesame"], "tsp", "specialty"),
  heat("black-pepper", "Freshly ground black pepper", 0.5, "tsp", ["black pepper", "ground black pepper"], "Grind it as you add it. This is pepper, not a chilli."),
  heat("white-pepper", "Ground white pepper", 0.5, "tsp", ["white pepper"], "Cantonese heat is white pepper, not a handful of bird's eye."),
  heat("pepperberry", "Ground Tasmanian pepperberry", 0.5, "tsp", ["pepperberry", "tasmanian pepper", "mountain pepper"], "Australian mountain pepper. Sharp heat, not a chilli.", "specialty"),
  heat("cayenne", "Cayenne pepper", 0.5, "tsp", ["cayenne", "cayenne pepper", ...CHILLI], "Add gradually."),
  heat("hot-paprika", "Hot paprika", 1, "tsp", ["hot paprika", ...CHILLI], "Hungarian hot paprika. Strength varies by tin."),
  heat("pimenton-picante", "Hot smoked paprika (pimentón picante)", 1, "tsp", ["pimenton picante", "pimentón picante", ...CHILLI], "Spanish hot smoked paprika. Not bird's eye.", "specialty"),
  heat("kashmiri-chilli", "Kashmiri chilli powder", 1, "tsp", ["kashmiri chilli", "kashmiri mirch", ...CHILLI], "For colour and a mild heat. Not bird's eye."),
  heat("ceylon-chilli", "Ceylon chilli flakes", 1, "tsp", ["ceylon chilli", "nai miris", ...CHILLI], "Sri Lankan nai miris. Add gradually."),
  heat("boukovo", "Boukovo", 0.5, "tsp", ["boukovo", "greek chilli flakes", ...CHILLI], "Mild Greek chilli flakes. A small amount; this is not a chilli-paste cuisine."),
  heat("espelette-pepper", "Piment d'Espelette", 0.5, "tsp", ["piment d'espelette", "espelette", ...CHILLI], "Basque chilli powder. Add gradually.", "specialty"),
  heat("pul-biber", "Pul biber", 1, "tsp", ["pul biber", "aleppo pepper", "aleppo chilli", ...CHILLI], "Aleppo-style chilli flakes. Milder than bird's eye."),
  heat("aji-molido", "Ají molido", 0.5, "tsp", ["aji molido", "ají molido", ...CHILLI], "Mild Argentine chilli flakes."),
  heat("merken", "Merkén", 1, "tsp", ["merken", "merkén", ...CHILLI], "Chilean smoked chilli and coriander. Strength varies.", "specialty"),
  heat("gochugaru", "Gochugaru", 1, "tsp", ["gochugaru", "korean chilli flakes", ...CHILLI], "Korean chilli flakes. Add gradually."),
  heat("birds-eye-chilli", "Bird's eye chillies", 4, "", ["bird's eye chillies", "birds eye chillies", "bird's eye chilli", "birds eye chilli", "prik kee noo", "cili padi", "cabai rawit", "siling labuyo", ...CHILLI], "Slice. Seeds carry most of the heat. Wash hands after cutting.", "produce"),
  heat("scotch-bonnet", "Scotch bonnet chillies", 2, "", ["scotch bonnet", "scotch bonnet chilli", ...CHILLI], "Leave them whole for less heat, or slice and wash your hands. Very hot.", "produce"),
  heat("piri-piri", "Piri-piri chillies", 4, "", ["piri piri", "piri-piri", "peri peri", "peri-peri", ...CHILLI], "A small chilli used in Portuguese and Mozambican cooking. Not a Thai bird's eye.", "produce"),
  heat("malagueta-chilli", "Malagueta chillies", 3, "", ["malagueta", ...CHILLI], "Brazilian chilli. Not a Thai bird's eye.", "produce"),
  heat("dried-red-chilli", "Dried red chillies", 3, "", ["dried red chilli", "dried red chillies", ...CHILLI], "Snap them and shake out most of the seeds if you want less heat.", "grocery"),
  heat("facing-heaven-chilli", "Facing-heaven chillies", 4, "", ["facing-heaven chillies", "chao tian jiao", ...CHILLI], "Small dried Sichuan chillies. Not bird's eye.", "specialty"),
  heat("green-chilli", "Fresh green chillies", 2, "", ["green chilli", "green chillies", ...CHILLI], "Slice and wash your hands. Seeds carry most of the heat.", "produce"),
  heat("ancho-chilli", "Dried ancho chillies", 2, "", ["ancho", "ancho chilli", "dried ancho", ...CHILLI], "Stem and shake out the seeds, then simmer in the sauce.", "specialty"),
  heat("berbere", "Berbere spice blend", 2, "tsp", ["berbere"], "Ethiopian blend. Chilli strength varies by tin. Check the label."),
  heat("mitmita", "Mitmita", 1, "tsp", ["mitmita"], "Ethiopian chilli and spice finish, hotter than berbere. Stir in at the end.", "specialty"),
  gochujang,
  redCurry,
  paste("green-curry-paste", "Vegan green curry paste", 2, checkPaste),
  paste("yellow-curry-paste", "Vegan yellow curry paste", 2, checkPaste),
  paste("massaman-curry-paste", "Vegan massaman curry paste", 2, "Choose a paste without shrimp paste. Massaman pastes often contain peanut; this template counts peanut.", ["peanut"]),
  paste("panang-curry-paste", "Vegan panang curry paste", 2, "Choose a paste without shrimp paste. Panang pastes contain peanut; this template counts peanut.", ["peanut"]),
  paste("madras-curry-paste", "Vegan Madras curry paste", 2, checkPaste),
  paste("vindaloo-paste", "Vegan vindaloo paste", 2, "Garlic, vinegar and Kashmiri chilli. Choose a paste without shrimp paste."),
  paste("korma-paste", "Vegan korma paste", 2, "Many korma pastes contain dairy. This template means a paste labelled vegan, with no dairy."),
  paste("laksa-paste", "Vegan laksa paste", 2, "Many laksa pastes contain shrimp or belacan. Choose one labelled without them, and check the heat."),
  paste("kroeung", "Vegan kroeung paste", 2, "Choose a paste without prahok or fish. Lemongrass, galangal, turmeric and garlic are the usual base."),
  paste("base-genep", "Vegan base genep", 2, "Balinese spice paste. Choose one without shrimp paste."),
  paste("harissa", "Harissa paste", 1.5, "Check the label; chilli strength varies.", [], ["harissa"]),
  paste("aji-amarillo", "Ají amarillo paste", 1.5, "Choose a plain chilli paste and check allergens; strength varies.", [], ["aji amarillo", "ají amarillo"]),
  paste("aji-limo", "Ají limo paste", 0.5, "Peruvian chilli paste. Hotter than ají amarillo. Check the label.", [], ["aji limo", "ají limo"]),
  paste("chipotle-paste", "Chipotle chilli paste", 1.5, "Plain chipotle paste. Some adobo sauces contain wheat; check the label.", [], ["chipotle paste", "chipotle chilli paste", ...CHILLI]),
  paste("calabrian-chilli-paste", "Calabrian chilli paste", 1, "Southern Italian chilli paste. Heat varies by jar.", [], ["calabrian chilli paste", ...CHILLI]),
  paste("sambal-oelek", "Sambal oelek", 1.5, "Chilli, salt and vinegar. This template means a paste without shrimp. Bird's eye is the usual chilli in it.", [], ["sambal oelek", ...CHILLI]),
  paste("doubanjiang", "Vegan doubanjiang", 1.5, "Sichuan chilli bean paste. Choose one without meat or shrimp. Many brands contain wheat.", ["soy", "wheat"], ["doubanjiang", "toban jiang", ...CHILLI]),
  paste("duo-jiao", "Pickled chopped red chillies", 1.5, "Hunan duo jiao. Salty and sour. Choose a jar without fish or shrimp.", [], ["duo jiao", "pickled chopped red chillies", ...CHILLI]),
  paste("yuzu-kosho", "Yuzu kosho", 1, "Chilli and yuzu peel. A little is enough. Check the label.", [], ["yuzu kosho", ...CHILLI]),
  paste("biber-salcasi", "Biber salçası", 1.5, "Turkish red pepper paste. Check the heat. Choose one without added dairy.", [], ["biber salcasi", "biber salçası", "turkish pepper paste", ...CHILLI]),
  paste("shatta", "Shatta", 1.5, "Chilli and garlic paste used across the Levant. This template has no walnuts.", [], ["shatta", ...CHILLI]),
  paste("ajika", "Ajika paste", 1.5, "Georgian chilli paste. Check the label for heat and for nuts.", [], ["ajika", "adjika", ...CHILLI]),
  paste("zhug", "Zhug (sahawiq)", 1.5, "Yemeni chilli and herb paste, also called sahawiq. Choose one without fish.", [], ["zhug", "sahawiq", "skhug", ...CHILLI]),
  { id: "fermented-black-beans", name: "Fermented black beans", kind: "paste", amount: 1, unit: "tbsp", category: "specialty", allergens: ["soy"], aliases: ["fermented black beans", "douchi"], notes: "Salted black soy beans. Rinse them. Check the label for wheat.", glutenFree: { name: "Gluten-free fermented black beans", allergens: ["soy"], aliases: ["gluten free fermented black beans", "gluten-free douchi"], notes: "Salted black soy beans explicitly labelled gluten-free. Rinse them." } },
  { id: "dijon-mustard", name: "Dijon mustard", kind: "paste", amount: 1.5, unit: "tbsp", category: "grocery", allergens: ["mustard"], aliases: ["dijon mustard", "dijon"] },
  herb("spring-onion", "Spring onion", 15, ["spring-onion", "spring onion", "scallion", "green onion"]),
  herb("coriander", "Fresh coriander", 15, ["coriander", "cilantro", "fresh coriander"]),
  herb("parsley", "Flat-leaf parsley", 15, ["parsley", "flat-leaf parsley"]),
  herb("basil", "Fresh basil", 15, ["basil", "fresh basil"]),
  herb("thai-basil", "Thai basil", 15, ["thai basil", "horapa"], "Not sweet basil. Ordinary basil is a different flavour."),
  herb("dill", "Fresh dill", 15, ["dill", "fresh dill"]),
  herb("mint", "Fresh mint", 15, ["mint", "fresh mint"]),
  herb("perilla", "Perilla leaves", 10, ["perilla", "shiso", "tia to"], "Also sold as shiso or tía tô."),
  herb("culantro", "Culantro", 15, ["culantro", "recao", "sawtooth coriander"], "Also called recao. Stronger than ordinary coriander."),
  herb("laksa-leaf", "Laksa leaf", 10, ["laksa leaf", "daun kesum", "vietnamese coriander", "rau ram"], "Not ordinary coriander. Also called daun kesum or Vietnamese coriander."),
  herb("huacatay", "Huacatay", 10, ["huacatay", "black mint"], "Peruvian black mint. Do not swap in a larger handful of ordinary mint."),
  herb("epazote", "Epazote", 8, ["epazote"], "A small handful. Strong. It is not oregano."),
  herb("tarragon", "Fresh tarragon", 8, ["tarragon"], "Leaves only. A little is enough."),
];

export const REGION_TASTES: readonly RegionTaste[] = [
  { id: "japanese", name: "Japanese-inspired", emoji: "🇯🇵", description: "Miso, yuzu kosho, shichimi, ginger and spring onion.", sauce: "miso, yuzu kosho & spring onion sauce", body: "stock", staple: "japanese", aromatics: ["garlic", "ginger"], simmer: ["miso", "soy-sauce", "shichimi", "sansho"], heat: "yuzu-kosho", acid: "rice-vinegar", herbs: ["spring-onion"], finish: ["sesame-seeds", "sesame-oil"] },
  { id: "korean", name: "Korean-inspired", emoji: "🇰🇷", description: "Gochujang, gochugaru, ginger, toasted sesame and rice vinegar.", sauce: "gochujang, gochugaru & sesame sauce", body: "stock", staple: "korean", aromatics: ["garlic", "ginger"], simmer: ["soy-sauce"], heat: "gochujang", sideHeat: "gochugaru", acid: "rice-vinegar", herbs: ["spring-onion"], finish: ["sesame-seeds", "sesame-oil"] },
  { id: "thai", name: "Thai-inspired", emoji: "🇹🇭", description: "Red curry paste, bird's eye chilli, coconut, lime and coriander.", sauce: "coconut, red curry & lime sauce", body: "coconut", staple: "thai", aromatics: ["garlic", "galangal", "lemongrass", "kaffir-lime-leaves"], heat: "red-curry-paste", sideHeat: "birds-eye-chilli", acid: "lime-juice", herbs: ["coriander"] },
  { id: "mexican", name: "Mexican-inspired", emoji: "🇲🇽", description: "Chipotle, cumin, smoked paprika, lime and coriander.", sauce: "chipotle, cumin & lime sauce", body: "tomato", staple: "mexican", aromatics: ["garlic"], simmer: ["cumin", "smoked-paprika", "mexican-oregano"], heat: "chipotle-paste", acid: "lime-juice", herbs: ["coriander", "epazote"] },
  { id: "indian", name: "Indian-inspired", emoji: "🇮🇳", description: "Garam masala, turmeric, Kashmiri chilli, ginger and lemon.", sauce: "ginger, garam masala & coconut sauce", body: "coconut", staple: "indian", aromatics: ["garlic", "ginger"], simmer: ["garam-masala", "turmeric", "cumin", "ground-coriander"], heat: "kashmiri-chilli", acid: "lemon-juice", herbs: ["coriander"] },
  { id: "levantine", name: "Levantine-inspired", emoji: "🌿", description: "Cumin, sumac, shatta, za'atar, lemon and parsley.", sauce: "cumin, shatta & lemon sauce", body: "stock", staple: "levantine", aromatics: ["garlic"], simmer: ["cumin", "sumac", "allspice"], heat: "shatta", acid: "lemon-juice", herbs: ["parsley"], finish: ["zaatar"] },
  { id: "italian", name: "Italian-inspired", emoji: "🇮🇹", description: "Tomato, oregano, Calabrian chilli, basil and lemon.", sauce: "tomato, oregano & basil sauce", body: "tomato", staple: "italian", aromatics: ["garlic"], simmer: ["oregano", "fennel-seeds"], heat: "calabrian-chilli-paste", acid: "lemon-juice", herbs: ["basil"] },
  { id: "moroccan", name: "Moroccan-inspired", emoji: "🇲🇦", description: "Harissa, ras el hanout, cumin, cinnamon, lemon and parsley.", sauce: "harissa, cumin & lemon sauce", body: "tomato", staple: "moroccan", aromatics: ["garlic"], simmer: ["cumin", "cinnamon", "ras-el-hanout"], heat: "harissa", acid: "lemon-juice", herbs: ["parsley"] },
  { id: "greek", name: "Greek-inspired", emoji: "🇬🇷", description: "Oregano, garlic, lemon, dill and a little boukovo.", sauce: "lemon, oregano & dill sauce", body: "stock", staple: "greek", aromatics: ["garlic"], simmer: ["oregano"], heat: "boukovo", acid: "lemon-juice", herbs: ["dill", "parsley"] },
  { id: "spanish", name: "Spanish-inspired", emoji: "🇪🇸", description: "Smoked paprika, pimentón picante, saffron, sherry vinegar and parsley.", sauce: "smoked paprika & tomato sauce", body: "tomato", staple: "spanish", aromatics: ["garlic"], simmer: ["smoked-paprika", "saffron"], heat: "pimenton-picante", acid: "sherry-vinegar", herbs: ["parsley"] },
  { id: "french", name: "French-inspired", emoji: "🇫🇷", description: "Dijon mustard, thyme, tarragon, lemon and piment d'Espelette.", sauce: "Dijon, thyme & lemon sauce", body: "stock", staple: "french", aromatics: ["garlic"], simmer: ["dijon-mustard", "thyme"], heat: "espelette-pepper", acid: "lemon-juice", herbs: ["parsley", "tarragon"] },
  { id: "vietnamese", name: "Vietnamese-inspired", emoji: "🇻🇳", description: "Lemongrass, bird's eye chilli, lime, mint and perilla.", sauce: "lemongrass, lime & mint sauce", body: "stock", staple: "vietnamese", aromatics: ["garlic", "ginger", "lemongrass"], simmer: ["soy-sauce"], heat: "birds-eye-chilli", acid: "lime-juice", herbs: ["mint", "coriander", "perilla"] },
  { id: "chinese", name: "Chinese-inspired", emoji: "🇨🇳", description: "Ginger, five-spice, dried red chilli, soy and spring onion.", sauce: "ginger, five-spice & spring onion sauce", body: "stock", staple: "chinese", aromatics: ["garlic", "ginger"], simmer: ["soy-sauce", "five-spice"], heat: "dried-red-chilli", acid: "rice-vinegar", herbs: ["spring-onion"], finish: ["sesame-seeds", "sesame-oil"] },
  { id: "indonesian", name: "Indonesian-inspired", emoji: "🇮🇩", description: "Sambal oelek, bird's eye chilli, kecap manis, turmeric and coconut.", sauce: "sambal, turmeric & coconut sauce", body: "coconut", staple: "indonesian", aromatics: ["garlic", "ginger", "galangal", "lemongrass"], simmer: ["kecap-manis", "turmeric", "ground-coriander"], heat: "sambal-oelek", sideHeat: "birds-eye-chilli", amounts: { "birds-eye-chilli": 2 }, acid: "lime-juice", herbs: ["coriander"] },
  { id: "malaysian", name: "Malaysian-inspired", emoji: "🇲🇾", description: "Bird's eye chilli, lemongrass, tamarind, coconut and lime.", sauce: "lemongrass, tamarind & coconut sauce", body: "coconut", staple: "malaysian", aromatics: ["garlic", "ginger", "lemongrass", "galangal"], simmer: ["ground-coriander", "turmeric", "tamarind"], heat: "birds-eye-chilli", acid: "lime-juice", herbs: ["coriander"] },
  { id: "caribbean", name: "Caribbean-inspired", emoji: "🏝️", description: "Scotch bonnet, allspice, thyme, culantro and lime.", sauce: "allspice, thyme & lime sauce", body: "stock", staple: "caribbean", aromatics: ["garlic", "ginger"], simmer: ["allspice", "thyme"], heat: "scotch-bonnet", acid: "lime-juice", herbs: ["culantro"] },
  { id: "peruvian", name: "Peruvian-inspired", emoji: "🇵🇪", description: "Ají amarillo, ají limo, cumin, lime and huacatay.", sauce: "ají amarillo, cumin & lime sauce", body: "stock", staple: "peruvian", aromatics: ["garlic"], simmer: ["cumin"], heat: "aji-amarillo", sideHeat: "aji-limo", acid: "lime-juice", herbs: ["coriander", "huacatay"] },
  { id: "ethiopian", name: "Ethiopian-inspired", emoji: "🇪🇹", description: "Berbere, ginger, tomato and lemon, with mitmita when you ask for hot.", sauce: "berbere, ginger & tomato sauce", body: "tomato", staple: "ethiopian", aromatics: ["garlic", "ginger"], simmer: ["fenugreek", "cardamom"], heat: "berbere", hotOnly: "mitmita", acid: "lemon-juice", herbs: ["parsley"] },
  { id: "turkish", name: "Turkish-inspired", emoji: "🇹🇷", description: "Biber salçası, pul biber, cumin, sumac and parsley.", sauce: "biber salçası, sumac & tomato sauce", body: "tomato", staple: "turkish", aromatics: ["garlic"], simmer: ["paprika", "cumin", "sumac"], heat: "biber-salcasi", sideHeat: "pul-biber", acid: "lemon-juice", herbs: ["parsley"], finish: ["dried-mint"] },
  { id: "brazilian", name: "Brazilian-inspired", emoji: "🇧🇷", description: "Malagueta chilli, annatto, paprika, coconut, lime and coriander.", sauce: "garlic, paprika & coconut-lime sauce", body: "coconut", staple: "brazilian", aromatics: ["garlic"], simmer: ["paprika", "annatto"], heat: "malagueta-chilli", acid: "lime-juice", herbs: ["coriander"] },
  { id: "thai-green", name: "Thai green-inspired", emoji: "🇹🇭", description: "Green curry paste, bird's eye chilli, Thai basil, kaffir lime and coconut.", sauce: "green curry, Thai basil & coconut sauce", body: "coconut", staple: "thai", aromatics: ["garlic", "galangal", "lemongrass", "kaffir-lime-leaves"], heat: "green-curry-paste", sideHeat: "birds-eye-chilli", acid: "lime-juice", herbs: ["thai-basil", "coriander"] },
  { id: "thai-massaman", name: "Thai massaman-inspired", emoji: "🇹🇭", description: "Massaman paste, cinnamon, cardamom, tamarind and coconut.", sauce: "massaman, cinnamon & coconut sauce", body: "coconut", staple: "thai", aromatics: ["garlic", "ginger", "bay-leaves"], simmer: ["cinnamon", "cardamom", "tamarind"], heat: "massaman-curry-paste", acid: "lime-juice", herbs: ["coriander"] },
  { id: "thai-panang", name: "Thai panang-inspired", emoji: "🇹🇭", description: "Panang paste, peanut, bird's eye chilli, kaffir lime and coconut.", sauce: "panang, kaffir lime & coconut sauce", body: "coconut", staple: "thai", aromatics: ["garlic", "galangal", "kaffir-lime-leaves"], heat: "panang-curry-paste", sideHeat: "birds-eye-chilli", acid: "lime-juice", herbs: ["thai-basil"] },
  { id: "thai-yellow", name: "Thai yellow-inspired", emoji: "🇹🇭", description: "Yellow curry paste, turmeric, curry powder and a little bird's eye chilli.", sauce: "yellow curry, turmeric & coconut sauce", body: "coconut", staple: "thai", aromatics: ["garlic", "ginger", "lemongrass"], simmer: ["turmeric", "curry-powder"], heat: "yellow-curry-paste", sideHeat: "birds-eye-chilli", amounts: { "birds-eye-chilli": 2 }, acid: "lime-juice", herbs: ["coriander"] },
  { id: "isaan", name: "Isaan-inspired", emoji: "🇹🇭", description: "Bird's eye chilli, lime, garlic, palm sugar and coriander.", sauce: "lime, bird's eye & garlic sauce", body: "stock", staple: "sticky", aromatics: ["garlic"], simmer: ["palm-sugar"], heat: "birds-eye-chilli", acid: "lime-juice", herbs: ["coriander"] },
  { id: "indian-madras", name: "Madras-inspired", emoji: "🇮🇳", description: "Madras curry paste, dried red chilli, cumin and tomato.", sauce: "Madras curry & tomato sauce", body: "tomato", staple: "indian", aromatics: ["garlic", "ginger"], simmer: ["cumin", "turmeric", "ground-coriander"], heat: "madras-curry-paste", sideHeat: "dried-red-chilli", acid: "lemon-juice", herbs: ["coriander"] },
  { id: "indian-vindaloo", name: "Vindaloo-inspired", emoji: "🇮🇳", description: "Vindaloo paste, Kashmiri chilli, vinegar, garlic and ginger.", sauce: "vindaloo, vinegar & tomato sauce", body: "tomato", staple: "indian", aromatics: ["garlic", "ginger"], simmer: ["cumin", "turmeric"], heat: "vindaloo-paste", sideHeat: "kashmiri-chilli", acid: "vinegar", herbs: ["coriander"] },
  { id: "indian-korma", name: "Korma-inspired", emoji: "🇮🇳", description: "A vegan korma paste, cardamom, cinnamon and a little Kashmiri chilli.", sauce: "vegan korma, cardamom & coconut sauce", body: "coconut", staple: "indian", aromatics: ["garlic", "ginger"], simmer: ["cardamom", "cinnamon"], heat: "korma-paste", sideHeat: "kashmiri-chilli", amounts: { "kashmiri-chilli": 0.5 }, acid: "lemon-juice", herbs: ["coriander"] },
  { id: "south-indian", name: "South Indian-inspired", emoji: "🇮🇳", description: "Mustard seeds, curry leaves, dried red chilli, turmeric and coconut.", sauce: "curry leaf, mustard seed & coconut sauce", body: "coconut", staple: "indian", aromatics: ["garlic", "ginger", "mustard-seeds", "curry-leaves"], simmer: ["turmeric", "cumin"], heat: "dried-red-chilli", acid: "lime-juice", herbs: ["coriander"] },
  { id: "goan", name: "Goan-inspired", emoji: "🇮🇳", description: "Kashmiri chilli, vinegar, tamarind, curry leaves and coconut.", sauce: "Kashmiri chilli, tamarind & coconut sauce", body: "coconut", staple: "indian", aromatics: ["garlic", "ginger", "curry-leaves"], simmer: ["cumin", "turmeric", "ground-coriander", "tamarind"], heat: "kashmiri-chilli", acid: "vinegar", herbs: ["coriander"] },
  { id: "bengali", name: "Bengali-inspired", emoji: "🇮🇳", description: "Panch phoron, dried red chilli, turmeric and coriander.", sauce: "panch phoron & turmeric sauce", body: "stock", staple: "indian", aromatics: ["garlic", "ginger", "panch-phoron"], simmer: ["turmeric"], heat: "dried-red-chilli", acid: "lemon-juice", herbs: ["coriander"] },
  { id: "chettinad", name: "Chettinad-inspired", emoji: "🇮🇳", description: "Black pepper, fennel, star anise, dried red chilli and coconut.", sauce: "black pepper, fennel & coconut sauce", body: "coconut", staple: "indian", aromatics: ["garlic", "ginger", "curry-leaves"], simmer: ["black-pepper", "fennel-seeds", "star-anise"], heat: "dried-red-chilli", acid: "lime-juice", herbs: ["coriander"] },
  { id: "hyderabadi", name: "Hyderabadi-inspired", emoji: "🇮🇳", description: "Saffron, mint, garam masala, Kashmiri chilli and dried fenugreek.", sauce: "saffron, mint & garam masala sauce", body: "stock", staple: "indian", aromatics: ["garlic", "ginger"], simmer: ["garam-masala", "saffron"], heat: "kashmiri-chilli", acid: "lemon-juice", herbs: ["mint", "coriander"], finish: ["kasuri-methi"] },
  { id: "kashmiri", name: "Kashmiri-inspired", emoji: "🇮🇳", description: "Fennel, dried ginger, Kashmiri chilli, cardamom and cinnamon.", sauce: "fennel, dried ginger & Kashmiri chilli sauce", body: "stock", staple: "indian", aromatics: ["garlic", "ginger"], simmer: ["fennel-seeds", "dried-ginger", "cardamom", "cinnamon"], heat: "kashmiri-chilli", acid: "lemon-juice", finish: ["dried-mint"] },
  { id: "sri-lankan", name: "Sri Lankan-inspired", emoji: "🇱🇰", description: "Ceylon cinnamon, curry leaves, pandan, Ceylon chilli and coconut.", sauce: "Ceylon chilli, curry leaf & coconut sauce", body: "coconut", staple: "samba", aromatics: ["garlic", "ginger", "curry-leaves", "pandan", "lemongrass"], simmer: ["ceylon-cinnamon", "turmeric"], heat: "ceylon-chilli", acid: "lime-juice", herbs: ["coriander"] },
  { id: "sichuan", name: "Sichuan-inspired", emoji: "🇨🇳", description: "Doubanjiang, Sichuan pepper, facing-heaven chilli, garlic and ginger.", sauce: "doubanjiang, Sichuan pepper & chilli sauce", body: "stock", staple: "chinese", aromatics: ["garlic", "ginger"], simmer: ["soy-sauce", "sichuan-pepper"], heat: "doubanjiang", sideHeat: "facing-heaven-chilli", acid: "rice-vinegar", herbs: ["spring-onion"], finish: ["sesame-oil"] },
  { id: "hunan", name: "Hunan-inspired", emoji: "🇨🇳", description: "Pickled chopped red chillies, fermented black beans, garlic and shallot.", sauce: "pickled chilli & black bean sauce", body: "stock", staple: "chinese", aromatics: ["garlic", "ginger", "shallot"], simmer: ["fermented-black-beans"], heat: "duo-jiao", acid: "rice-vinegar", herbs: ["spring-onion"] },
  { id: "cantonese", name: "Cantonese-inspired", emoji: "🇨🇳", description: "Ginger, soy, spring onion and white pepper.", sauce: "ginger, soy & white pepper sauce", body: "stock", staple: "chinese", aromatics: ["garlic", "ginger"], simmer: ["soy-sauce"], heat: "white-pepper", acid: "rice-vinegar", herbs: ["spring-onion"], finish: ["sesame-oil"] },
  { id: "taiwanese", name: "Taiwanese-inspired", emoji: "🇹🇼", description: "Thai basil, soy, garlic, dried red chilli and white pepper.", sauce: "Thai basil, soy & chilli sauce", body: "stock", staple: "chinese", aromatics: ["garlic", "ginger"], simmer: ["soy-sauce"], heat: "dried-red-chilli", sideHeat: "white-pepper", acid: "rice-vinegar", herbs: ["thai-basil", "spring-onion"], finish: ["sesame-oil"] },
  { id: "xinjiang", name: "Xinjiang-inspired", emoji: "🇨🇳", description: "Cumin, dried red chilli, garlic and coriander.", sauce: "cumin & dried chilli sauce", body: "stock", staple: "chinese", aromatics: ["garlic"], simmer: ["cumin", "ground-coriander"], heat: "dried-red-chilli", acid: "lemon-juice", herbs: ["coriander"] },
  { id: "lao", name: "Lao-inspired", emoji: "🇱🇦", description: "Bird's eye chilli, dill, galangal, lemongrass and lime.", sauce: "lemongrass, dill & lime sauce", body: "stock", staple: "thai", aromatics: ["garlic", "galangal", "lemongrass"], heat: "birds-eye-chilli", acid: "lime-juice", herbs: ["dill", "coriander"] },
  { id: "cambodian", name: "Cambodian-inspired", emoji: "🇰🇭", description: "Vegan kroeung, bird's eye chilli, kaffir lime and lime.", sauce: "kroeung, lime & coconut sauce", body: "coconut", staple: "thai", aromatics: ["garlic", "lemongrass", "kaffir-lime-leaves"], heat: "kroeung", sideHeat: "birds-eye-chilli", acid: "lime-juice", herbs: ["coriander"] },
  { id: "filipino", name: "Filipino-inspired", emoji: "🇵🇭", description: "Siling labuyo, calamansi, annatto, bay and vinegar.", sauce: "calamansi, annatto & vinegar sauce", body: "stock", staple: "thai", aromatics: ["garlic", "bay-leaves"], simmer: ["annatto", "vinegar"], heat: "birds-eye-chilli", acid: "calamansi", herbs: ["spring-onion"] },
  { id: "peranakan", name: "Peranakan-inspired", emoji: "🇸🇬", description: "Vegan laksa paste, laksa leaf, bird's eye chilli, tamarind and coconut.", sauce: "laksa, tamarind & coconut sauce", body: "coconut", staple: "thai", aromatics: ["garlic", "lemongrass", "galangal"], simmer: ["tamarind"], heat: "laksa-paste", sideHeat: "birds-eye-chilli", acid: "lime-juice", herbs: ["laksa-leaf"] },
  { id: "burmese", name: "Burmese-inspired", emoji: "🇲🇲", description: "Dried red chilli, turmeric, paprika, lemongrass and ginger.", sauce: "turmeric, chilli & lemongrass sauce", body: "stock", staple: "thai", aromatics: ["garlic", "ginger", "lemongrass"], simmer: ["turmeric", "paprika"], heat: "dried-red-chilli", acid: "lime-juice", herbs: ["coriander"] },
  { id: "balinese", name: "Balinese-inspired", emoji: "🇮🇩", description: "Vegan base genep, bird's eye chilli, lemongrass and lime.", sauce: "base genep & coconut sauce", body: "coconut", staple: "thai", aromatics: ["garlic", "lemongrass", "galangal"], heat: "base-genep", sideHeat: "birds-eye-chilli", acid: "lime-juice", herbs: ["coriander"] },
  { id: "maluku", name: "Maluku-inspired", emoji: "🇮🇩", description: "Nutmeg, cloves, cinnamon, ginger and bird's eye chilli.", sauce: "nutmeg, clove & lime sauce", body: "coconut", staple: "thai", aromatics: ["garlic", "ginger"], simmer: ["nutmeg", "cloves", "cinnamon"], heat: "birds-eye-chilli", acid: "lime-juice", herbs: ["spring-onion"] },
  { id: "persian", name: "Persian-inspired", emoji: "🇮🇷", description: "Advieh, dried lime, saffron, mint and black pepper.", sauce: "advieh, dried lime & mint sauce", body: "stock", staple: "basmati", aromatics: ["garlic", "dried-lime"], simmer: ["advieh", "saffron"], heat: "black-pepper", acid: "lemon-juice", amounts: { "lemon-juice": 15 }, herbs: ["mint"] },
  { id: "georgian", name: "Georgian-inspired", emoji: "🇬🇪", description: "Khmeli suneli, ajika, garlic, coriander and lemon.", sauce: "ajika & khmeli suneli sauce", body: "stock", staple: "french", aromatics: ["garlic"], simmer: ["khmeli-suneli"], heat: "ajika", acid: "lemon-juice", herbs: ["coriander"] },
  { id: "yemeni", name: "Yemeni-inspired", emoji: "🇾🇪", description: "Zhug, hawaij, garlic, coriander and lemon.", sauce: "zhug & hawaij sauce", body: "stock", staple: "basmati", aromatics: ["garlic"], simmer: ["hawaij"], heat: "zhug", acid: "lemon-juice", herbs: ["coriander"] },
  { id: "nepali", name: "Nepali-inspired", emoji: "🇳🇵", description: "Timur, cumin, dried red chilli, ginger and coriander.", sauce: "timur, cumin & chilli sauce", body: "stock", staple: "indian", aromatics: ["garlic", "ginger"], simmer: ["timur", "cumin", "turmeric", "ground-coriander"], heat: "dried-red-chilli", acid: "lemon-juice", herbs: ["coriander"] },
  { id: "tunisian", name: "Tunisian-inspired", emoji: "🇹🇳", description: "Harissa, tabil, caraway, lemon and parsley.", sauce: "harissa, tabil & tomato sauce", body: "tomato", staple: "moroccan", aromatics: ["garlic"], simmer: ["tabil", "caraway", "ground-coriander"], heat: "harissa", acid: "lemon-juice", herbs: ["parsley"] },
  { id: "west-african", name: "West African-inspired", emoji: "🌍", description: "Scotch bonnet, grains of paradise, ginger, paprika and peanut.", sauce: "ginger, paprika & groundnut sauce", body: "tomato", staple: "long-grain", aromatics: ["garlic", "ginger"], simmer: ["grains-of-paradise", "paprika", "peanuts"], heat: "scotch-bonnet", acid: "lemon-juice", herbs: ["coriander"] },
  { id: "jamaican", name: "Jamaican-inspired", emoji: "🇯🇲", description: "Scotch bonnet, allspice, thyme, nutmeg and lime.", sauce: "allspice, scotch bonnet & lime sauce", body: "stock", staple: "jamaican-jerk", aromatics: ["garlic", "ginger"], simmer: ["allspice", "thyme", "nutmeg"], amounts: { allspice: 2 }, heat: "scotch-bonnet", acid: "lime-juice", herbs: ["spring-onion"] },
  { id: "somali", name: "Somali-inspired", emoji: "🇸🇴", description: "Xawaash, fresh green chilli, lime and coriander.", sauce: "xawaash & green chilli sauce", body: "tomato", staple: "basmati", aromatics: ["garlic"], simmer: ["xawaash"], heat: "green-chilli", acid: "lime-juice", herbs: ["coriander"] },
  { id: "cajun", name: "Cajun-inspired", emoji: "🇺🇸", description: "Cayenne, paprika, thyme, oregano, celery seed and black pepper.", sauce: "cayenne, paprika & thyme sauce", body: "stock", staple: "long-grain", aromatics: ["garlic"], simmer: ["paprika", "thyme", "oregano", "onion-powder", "celery-seed", "black-pepper"], heat: "cayenne", amounts: { cayenne: 1 }, acid: "lemon-juice", herbs: ["parsley"] },
  { id: "argentine", name: "Argentine-inspired", emoji: "🇦🇷", description: "Ají molido, oregano, garlic, parsley and red wine vinegar.", sauce: "chimichurri-style parsley & ají molido sauce", body: "stock", staple: "argentine-asado", aromatics: ["garlic"], simmer: ["oregano"], heat: "aji-molido", acid: "red-wine-vinegar", herbs: ["parsley"] },
  { id: "chilean", name: "Chilean-inspired", emoji: "🇨🇱", description: "Merkén, cumin, oregano, lime and coriander.", sauce: "merkén, cumin & lime sauce", body: "stock", staple: "peruvian", aromatics: ["garlic"], simmer: ["cumin", "oregano"], heat: "merken", acid: "lime-juice", herbs: ["coriander"] },
  { id: "portuguese", name: "Portuguese-inspired", emoji: "🇵🇹", description: "Piri-piri, paprika, bay, garlic and lemon.", sauce: "piri-piri, paprika & lemon sauce", body: "stock", staple: "french", aromatics: ["garlic", "bay-leaves"], simmer: ["paprika"], heat: "piri-piri", acid: "lemon-juice", herbs: ["parsley"] },
  { id: "hungarian", name: "Hungarian-inspired", emoji: "🇭🇺", description: "Hot paprika, sweet paprika, caraway, garlic and tomato.", sauce: "hot paprika, caraway & tomato sauce", body: "tomato", staple: "french", aromatics: ["garlic"], simmer: ["paprika", "caraway"], heat: "hot-paprika", acid: "lemon-juice", herbs: ["parsley"] },
  { id: "australian", name: "Australian-inspired", emoji: "🇦🇺", description: "Lemon myrtle, Tasmanian pepperberry, thyme and lemon.", sauce: "lemon myrtle & pepperberry sauce", body: "stock", staple: "french", aromatics: ["garlic"], simmer: ["lemon-myrtle", "thyme"], heat: "pepperberry", acid: "lemon-juice", herbs: ["parsley"] },
  { id: "oaxacan", name: "Oaxacan-inspired", emoji: "🇲🇽", description: "Ancho chilli, cinnamon, cocoa, sesame, cumin and Mexican oregano.", sauce: "ancho, cocoa & sesame sauce", body: "tomato", staple: "mexican", aromatics: ["garlic"], simmer: ["cinnamon", "cumin", "cocoa", "mexican-oregano"], heat: "ancho-chilli", acid: "lime-juice", herbs: ["coriander"], finish: ["sesame-seeds"] },
  { id: "cuban", name: "Cuban-inspired", emoji: "🇨🇺", description: "Cumin, oregano, bay, orange, lime and a little cayenne.", sauce: "cumin, orange & lime sauce", body: "stock", staple: "rice-beans", aromatics: ["garlic", "bay-leaves"], simmer: ["cumin", "oregano", "orange-juice"], heat: "cayenne", amounts: { cayenne: 0.25 }, acid: "lime-juice", herbs: ["coriander"] },
];

const PANTRY_BY_ID = new Map(PANTRY_ITEMS.map((item) => [item.id, item]));
const REGION_BY_ID = new Map(REGION_TASTES.map((region) => [region.id, region]));

export function plateIds(region: RegionTaste): string[] {
  return [
    ...region.aromatics,
    ...(region.simmer ?? []),
    region.heat,
    ...(region.sideHeat ? [region.sideHeat] : []),
    ...(region.hotOnly ? [region.hotOnly] : []),
    region.acid,
    ...(region.herbs ?? []),
    ...(region.finish ?? []),
  ];
}

function assertCatalogue(): void {
  const ids = PANTRY_ITEMS.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate pantry id.");
  const regionIds = REGION_TASTES.map((region) => region.id);
  if (new Set(regionIds).size !== regionIds.length) throw new Error("Duplicate meal region.");
  const used = new Set<string>();
  for (const region of REGION_TASTES) {
    const listed = plateIds(region);
    if (new Set(listed).size !== listed.length) throw new Error(`Repeated ingredient on the ${region.id} plate.`);
    for (const id of listed) {
      if (!PANTRY_BY_ID.has(id)) throw new Error(`${region.id} uses unknown ingredient ${id}.`);
      used.add(id);
    }
    const heatItem = PANTRY_BY_ID.get(region.heat);
    if (!heatItem?.scalesWithHeat) throw new Error(`${region.id} heat must scale from mild to hot.`);
  }
  for (const item of PANTRY_ITEMS) {
    if (!used.has(item.id)) throw new Error(`Pantry item ${item.id} is not used on a plate.`);
  }
}

assertCatalogue();

export function regionsUsing(id: string): string[] {
  return REGION_TASTES.filter((region) => plateIds(region).includes(id)).map((region) => region.id);
}

export function signatureHeatId(regionId: string): string {
  const region = REGION_BY_ID.get(regionId);
  if (!region) throw new Error("Choose a recognised flavour region.");
  return region.heat;
}

export const MEAL_REGION_OPTIONS: readonly MealOption[] = REGION_TASTES.map((region) => ({
  id: region.id,
  name: region.name,
  description: region.description,
  emoji: region.emoji,
}));

export const MEAL_STAPLE_FAMILY: Readonly<Record<string, string>> = Object.fromEntries(
  REGION_TASTES.map((region) => [region.id, region.staple]),
);

function toDraft(id: string, glutenFree: boolean, heatLevel: SpiceHeat, region: RegionTaste): DraftIngredient {
  const item = PANTRY_BY_ID.get(id);
  if (!item) throw new Error(`Unknown pantry item: ${id}.`);
  const chosen = glutenFree && item.glutenFree ? item.glutenFree : item;
  const base = region.amounts?.[id] ?? item.amount;
  const factor = item.scalesWithHeat ? { mild: 0.25, medium: 1, hot: 1.75 }[heatLevel] : 1;
  const amount = Number((base * factor).toFixed(4));
  if (!(amount > 0)) throw new Error(`Amount for ${id} must be above zero.`);
  return {
    id: item.id,
    name: chosen.name,
    amount,
    unit: item.unit,
    category: item.category,
    allergens: [...chosen.allergens],
    ...(chosen.notes ? { notes: chosen.notes } : {}),
    ...(chosen.aliases.length ? { aliases: [...chosen.aliases] } : {}),
  };
}

export function buildRegionProfile(regionId: string, glutenFree: boolean, heatLevel: SpiceHeat): {
  sauce: string;
  aromatics: DraftIngredient[];
  seasonings: DraftIngredient[];
  finish: DraftIngredient[];
  body: "coconut" | "tomato" | "stock";
} {
  const region = REGION_BY_ID.get(regionId);
  if (!region) throw new Error("Choose a recognised flavour region.");
  const draft = (id: string) => toDraft(id, glutenFree, heatLevel, region);
  const seasonings = [
    ...(region.simmer ?? []),
    region.heat,
    ...(region.sideHeat ? [region.sideHeat] : []),
    ...(heatLevel === "hot" && region.hotOnly ? [region.hotOnly] : []),
  ];
  return {
    sauce: region.sauce,
    aromatics: region.aromatics.map(draft),
    seasonings: seasonings.map(draft),
    finish: [region.acid, ...(region.herbs ?? []), ...(region.finish ?? [])].map(draft),
    body: region.body,
  };
}
