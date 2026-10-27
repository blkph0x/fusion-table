/**
 * Turns one meal into a CNF and ranks a bounded set of verified models.
 * Hard clauses are diet, allergen and dislike filters. Food-safety wording is
 * attached after the model is chosen. Applying a finish to a complete recipe
 * keeps its main, method and side, and allows at most two finishing ingredients.
 * The search does not prove the plate is
 * pleasant, traditional, allergy-safe, or kitchen-tested.
 */

import type { DietId, IngredientCategory, Recipe, RecipeIngredient, SpiceHeat } from "./recipe-types.ts";
import { foodWordHit } from "./food-words.ts";
import { modelSatisfies, seededDecider, solveCnf, selectBestCnfModel, enumerateCnfModels, type EnumerationOptions, type Clause } from "./sat.ts";
import { regionAllowsFusionOption } from "./region-affinity.ts";
import { regionTrueIds } from "./region-diversity.ts";
import { cleanSatForbidden, cleanSatPreferNone, type CleanPrefs } from "./clean-prefs.ts";

export interface FusionSpec {
  seed: number;
  regionId: string;
  diet: DietId;
  spiceHeat: SpiceHeat;
  glutenFree: boolean;
  dairyFree: boolean;
  vegan: boolean;
  vegetarian: boolean;
  eggFree: boolean;
  avoid?: readonly string[];
  dislikes?: readonly string[];
  mainId?: string;
  methodId?: string;
  servings: number;
  pantry?: string | string[];
  /** True when the base recipe already lists fish or crustacea. */
  seafoodAlready?: boolean;
  /** Soft cleaner-meal knobs. Never relax hard exclusions. */
  clean?: CleanPrefs;
  /** Derived from measured, retained liquid in a suitable base recipe. */
  brothReady?: boolean;
}

export interface FusionWitness {
  sat: boolean;
  formId: string;
  pickIds: string[];
  names: string[];
  variables: number;
  clauses: number;
  decisions: number;
  conflicts: number;
  satisfied: boolean;
}

interface Pick {
  id: string;
  name: string;
  amount: number;
  unit: string;
  category: IngredientCategory;
  allergens: string[];
  aliases?: string[];
  notes: string;
  /** Words a hard dislike can match, including plurals. */
  blocks: string[];
}

interface Option {
  id: string;
  lane: string;
  plain?: boolean;
  picks: Pick[];
  blocks: string[];
  allergens: string[];
  /** Removed by a hard filter before the variable is created. */
  forbidden: boolean;
}

const SEAFOOD_MAINS = new Set(["salmon", "white-fish", "prawns"]);
const SOY_MAINS = new Set(["tofu", "tempeh"]);

function norm(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/[’']/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/[–—-]/g, " ").replace(/\s+/g, " ").trim();
}

function wordHit(name: string, token: string): boolean {
  return foodWordHit(name, token);
}

function disliked(labels: readonly string[], dislikes: readonly string[]): boolean {
  return dislikes.some((token) => labels.some((label) => wordHit(label, token)));
}

function scale(amount: number, servings: number): number {
  return Math.round((amount * servings) / 4 * 10000) / 10000;
}

function pantrySet(pantry: FusionSpec["pantry"]): Set<string> {
  const parts = Array.isArray(pantry) ? pantry : (pantry ?? "").split(/[,;\n]/);
  return new Set(parts.slice(0, 100).map(norm).filter(Boolean));
}

function pick(
  id: string,
  name: string,
  amount: number,
  unit: string,
  category: IngredientCategory,
  allergens: string[],
  notes: string,
  blocks: string[],
  aliases?: string[],
): Pick {
  return { id: `sat-${id}`, name, amount, unit, category, allergens, notes, blocks, ...(aliases ? { aliases } : {}) };
}

function flags(spec: FusionSpec) {
  const avoid = new Set((spec.avoid ?? []).map(norm));
  const vegan = spec.vegan || spec.diet === "vegan";
  const vegetarian = vegan || spec.vegetarian || spec.diet === "vegetarian";
  const glutenFree = spec.glutenFree || spec.diet === "gluten-free" || ["wheat", "gluten", "oats", "barley", "rye"].some((name) => avoid.has(name));
  const fishFree = vegan || vegetarian || avoid.has("fish");
  const crustFree = vegan || vegetarian || avoid.has("crustacean");
  const soyFree = avoid.has("soy");
  const seafoodAlready = spec.seafoodAlready === true || SEAFOOD_MAINS.has(spec.mainId ?? "");
  const dairyFree = spec.dairyFree || vegan || spec.diet === "dairy-free";
  const eggFree = spec.eggFree || vegan;
  return { avoid, vegan, vegetarian, glutenFree, fishFree, crustFree, soyFree, seafoodAlready, dairyFree, eggFree };
}

const FINISH_REGION_ALIAS: Readonly<Record<string, string>> = {
  "home-style": "home-kitchen", "korean-bbq": "korean", "japanese-yakitori": "japanese",
  "cantonese-char-siu": "cantonese", "vietnamese-grill": "vietnamese", "turkish-mangal": "turkish",
  "greek-souvlaki": "greek", "spanish-plancha": "spanish", "jamaican-jerk": "jamaican",
  "indian-tandoor": "indian", "mexican-al-pastor": "mexican", "moroccan-mechoui": "moroccan",
};

const ASIAN_CRUNCH_REGIONS = new Set([
  "japanese", "japanese-curry", "korean", "chinese", "cantonese", "sichuan", "hunan", "taiwanese",
  "xinjiang", "shanghainese", "yunnan", "thai", "thai-green", "thai-massaman", "thai-panang",
  "thai-yellow", "isaan", "vietnamese", "lao", "cambodian", "malaysian", "indonesian", "peranakan",
  "filipino", "burmese", "balinese", "maluku",
]);

/** A complete recipe already supplies its main, cooked aromatics and regional sauce. */
function completePlateAllows(option: Option, recipe: Recipe, spec: FusionSpec): boolean {
  if (recipe.classicId === "cold-smoked-platter") {
    if (option.lane === "form" && option.id !== "form_plate") return false;
    // These require cooking and chilling; a cold platter gets a fresh finish.
    if (option.id === "crunch_sprouts") return false;
  }
  if (option.plain) return true;
  if (["extra", "aroma", "umami", "heat"].includes(option.lane)) return false;
  if (option.lane === "form") {
    if (option.id === "form_hot") return true;
    if (option.id === "form_broth") return hasBrothForBowl(recipe);
    return option.id === "form_hot_stir" && (recipe.methodId === "stir-fried" || recipe.classicId === "fried-rice");
  }
  // Do not add a second acid to a dish whose authored dressing/sauce already has one.
  if (option.lane === "acid" && recipe.ingredients.some((item) => /\b(lemon|lime|vinegar|tamarind|sumac)\b/i.test(`${item.id} ${item.name}`))) return false;
  if (option.picks.some((item) => alreadyPresent(recipe, item))) return false;
  const region = FINISH_REGION_ALIAS[spec.regionId] ?? spec.regionId;
  const authored = regionTrueIds(region);
  if (["crunch_cabbage", "crunch_sprouts", "crunch_peas", "fresh_onion"].includes(option.id)) return ASIAN_CRUNCH_REGIONS.has(region);
  if (option.id === "fresh_herbs") return authored.has("coriander");
  if (option.id === "acid_vinegar") return authored.has("rice-vinegar");
  if (option.id === "acid_tamarind") return authored.has("tamarind");
  if (option.id === "acid_lime") return authored.has("lime");
  if (option.id === "acid_lemon") return authored.has("lemon") || authored.size === 0;
  return true;
}

function buildOptions(spec: FusionSpec, dislikes: readonly string[], recipe?: Recipe): Option[] {
  const { avoid, glutenFree, fishFree, crustFree, soyFree, seafoodAlready, dairyFree, eggFree } = flags(spec);
  // Gentle follows mild and fiery follows hot. No new SAT variable, so old seeds stay put.
  const mild = spec.spiceHeat === "mild" || spec.spiceHeat === "gentle";
  const hot = spec.spiceHeat === "hot" || spec.spiceHeat === "fiery";
  const gf = glutenFree;
  const heatBlocked = disliked(["chilli", "chili", "sriracha"], dislikes);
  const option = (id: string, lane: string, picks: Pick[], extraBlocks: string[] = [], plain = false): Option => {
    const blocks = [...extraBlocks, ...picks.flatMap((item) => [item.name, ...item.blocks])];
    const allergens = [...new Set(picks.flatMap((item) => item.allergens))];
    const forbidden = plain ? false : (
      disliked(blocks, dislikes)
      || allergens.some((allergen) => avoid.has(allergen) || (allergen === "wheat" && avoid.has("gluten")))
    );
    return { id, lane, picks, blocks, allergens, forbidden, ...(plain ? { plain: true } : {}) };
  };

  const oysterAllergens = gf ? ["mollusc", "fish"] : ["mollusc", "fish", "wheat"];
  const soyAllergens = gf ? ["soy"] : ["soy", "wheat"];
  const misoAllergens = gf ? ["soy"] : ["soy", "wheat"];

  return [
    option("form_plate", "form", [], [], true),
    option("form_cold", "form", []),
    option("form_cold_stir", "form", []),
    option("form_hot", "form", []),
    option("form_hot_stir", "form", []),
    option("form_wrap", "form", [pick("lettuce", "Butter lettuce", 200, "g", "produce", [], "Leaves for wrapping. Wash before use.", ["lettuce"])]),
    option("form_broth", "form", []),
    option("form_chop", "form", []),

    option("acid_lime", "acid", [pick("lime", "Lime", 2, "", "produce", [], "Cut into wedges.", ["lime", "limes"])]),
    option("acid_lemon", "acid", [pick("lemon", "Lemon", 2, "", "produce", [], "Cut into wedges.", ["lemon", "lemons"])]),
    option("acid_vinegar", "acid", [pick("vinegar", "Rice vinegar", 30, "ml", "grocery", [], "Unseasoned rice vinegar. Check the packet.", ["rice vinegar", "vinegar"])]),
    option("acid_tamarind", "acid", [pick("tamarind", "Tamarind paste", 20, "g", "grocery", [], "Seedless paste. Check the packet.", ["tamarind"])]),
    option("acid_none", "acid", [], [], true),

    option("heat_sriracha", "heat", [pick(
      "sriracha",
      gf ? "Gluten-free sriracha" : "Sriracha",
      25,
      "ml",
      "grocery",
      [],
      gf ? "Use a bottle labelled gluten-free. Check the packet." : "Some brands contain wheat or garlic. Check the packet.",
      ["sriracha", "chilli", "chili"],
    )], ["chilli", "chili", "sriracha"]),
    option("heat_birds", "heat", [pick("birds", "Bird's eye chillies", 4, "", "produce", [], "Slice. Seeds carry most of the heat. Wash hands after cutting.", ["bird's eye chillies", "birds eye chillies", "chilli", "chili"])], ["chilli", "chili"]),
    option("heat_both", "heat", [
      pick("sriracha", gf ? "Gluten-free sriracha" : "Sriracha", 15, "ml", "grocery", [], gf ? "Use a bottle labelled gluten-free. Check the packet." : "Some brands contain wheat or garlic. Check the packet.", ["sriracha", "chilli", "chili"]),
      pick("birds", "Bird's eye chillies", 3, "", "produce", [], "Slice. Wash hands after cutting.", ["bird's eye chillies", "chilli", "chili"]),
    ], ["chilli", "chili", "sriracha"]),
    option("heat_none", "heat", [], [], true),

    option("umami_oyster", "umami", [pick(
      "oyster",
      gf ? "Gluten-free oyster sauce" : "Oyster sauce",
      30,
      "ml",
      "grocery",
      oysterAllergens,
      "Contains oyster extract and often fish. Not suitable for a vegan or vegetarian plate. Check the packet.",
      ["oyster sauce", "oyster", "fish"],
    )]),
    option("umami_soy", "umami", [pick(
      "soy",
      gf ? "Gluten-free tamari" : "Soy sauce",
      20,
      "ml",
      "grocery",
      soyAllergens,
      gf ? "Use a bottle labelled gluten-free. It is still soy. Check the packet." : "Usually contains wheat and soy. Check the packet.",
      ["soy sauce", "tamari", "soy"],
    )]),
    option("umami_fish", "umami", [pick(
      "fish-sauce",
      gf ? "Gluten-free fish sauce" : "Fish sauce",
      15,
      "ml",
      "grocery",
      ["fish"],
      "A fish product. Not suitable for a vegan or vegetarian plate. Check the packet.",
      ["fish sauce", "fish"],
    )]),
    option("umami_miso", "umami", [pick(
      "miso",
      gf ? "Gluten-free white miso" : "White miso",
      20,
      "g",
      "grocery",
      misoAllergens,
      gf ? "Use miso labelled gluten-free. It is still soy. Check the packet." : "Usually contains soy and wheat. Check the packet.",
      ["miso", "soy"],
    )]),
    option("umami_none", "umami", [], [], true),

    option("fresh_cucumber", "fresh", [pick("cucumber", "Cucumber", 200, "g", "produce", [], "Cut into batons.", ["cucumber"])]),
    option("fresh_herbs", "fresh", [pick("coriander", "Fresh coriander", 15, "g", "produce", [], "Leaves and tender stems. Also called cilantro.", ["coriander", "cilantro"])]),
    option("fresh_capsicum", "fresh", [pick("capsicum", "Red capsicum", 200, "g", "produce", [], "Sliced. Also called bell pepper.", ["capsicum", "bell pepper"])]),
    option("fresh_onion", "fresh", [pick("spring-onion", "Spring onions", 4, "", "produce", [], "Sliced. Also called green onion or scallion.", ["spring onion", "spring onions", "scallion", "green onion"])]),
    option("fresh_none", "fresh", [], [], true),

    option("crunch_cabbage", "crunch", [pick("wombok", "Wombok", 200, "g", "produce", [], "Shred. Also called Chinese cabbage.", ["wombok", "chinese cabbage", "cabbage"])]),
    option("crunch_carrot", "crunch", [pick("carrot", "Carrot", 150, "g", "produce", [], "Cut into thin sticks.", ["carrot", "carrots"])]),
    option("crunch_sprouts", "crunch", [pick("sprouts", "Bean sprouts", 150, "g", "produce", [], "Rinse. Use fresh sprouts.", ["bean sprouts", "beansprouts", "sprouts"])]),
    option("crunch_peas", "crunch", [pick("snow-peas", "Snow peas", 150, "g", "produce", [], "Trim the ends. Also called mange tout.", ["snow peas", "snow pea", "mange tout"])]),
    option("crunch_none", "crunch", [], [], true),

    option("extra_fish", "extra", [pick("fish", "Firm white fish", 250, "g", "fishmonger", ["fish"], "Boneless. Cook to at least 63°C in the centre, then use it in the plate. Do not serve it raw.", ["firm white fish", "white fish", "fish"])]),
    option("extra_prawn", "extra", [pick("prawns", "Raw peeled prawns", 250, "g", "fishmonger", ["crustacean"], "Cook until pink and opaque. Also called shrimp. Do not serve raw.", ["prawns", "prawn", "shrimp"])]),
    option("extra_tofu", "extra", [pick("tofu", "Firm tofu", 250, "g", "grocery", ["soy"], "Press, then cut into cubes. Check the packet.", ["tofu", "firm tofu"])]),
    option("extra_none", "extra", [], [], true),

    option("aroma_ginger", "aroma", [pick("ginger", "Fresh ginger", 20, "g", "produce", [], "Peeled and finely chopped.", ["ginger"])]),
    option("aroma_garlic", "aroma", [pick("garlic", "Garlic", 3, "", "produce", [], "Peeled and chopped.", ["garlic"])]),
    option("aroma_lemongrass", "aroma", [pick("lemongrass", "Lemongrass", 2, "", "produce", [], "Bruise and slice the tender core. Remove the woody pieces before serving.", ["lemongrass"])]),
    option("aroma_cumin", "aroma", [pick("cumin", "Ground cumin", 5, "g", "grocery", [], "Check the packet.", ["cumin"])]),
    option("aroma_none", "aroma", [], [], true),
  ].map((item) => {
    if (item.forbidden) return item;
    if (recipe && !completePlateAllows(item, recipe, spec)) return { ...item, forbidden: true };
    if (item.id === "form_broth" && spec.brothReady !== true) return { ...item, forbidden: true };
    if (!regionAllowsFusionOption(spec.regionId, item.id)) return { ...item, forbidden: true };
    if (cleanSatForbidden(item.id, spec.clean, spec.spiceHeat)) return { ...item, forbidden: true };
    if (item.id === "heat_sriracha" || item.id === "heat_birds" || item.id === "heat_both") {
      if (mild || heatBlocked) return { ...item, forbidden: true };
    }
    if (item.id === "heat_none" && hot && !heatBlocked && !recipe) {
      // Only force a chilli pick when this region is allowed one in the SAT catalogue.
      const regionalHeat = ["heat_sriracha", "heat_birds", "heat_both"].some((id) => regionAllowsFusionOption(spec.regionId, id));
      if (regionalHeat) return { ...item, forbidden: true };
    }
    if ((item.id === "umami_oyster" || item.id === "umami_fish" || item.id === "extra_fish") && fishFree) return { ...item, forbidden: true };
    if (item.id === "extra_prawn" && crustFree) return { ...item, forbidden: true };
    if ((item.id === "umami_soy" || item.id === "umami_miso" || item.id === "extra_tofu") && soyFree) return { ...item, forbidden: true };
    if ((item.id === "extra_fish" || item.id === "extra_prawn") && seafoodAlready) return { ...item, forbidden: true };
    if (item.id === "extra_tofu" && SOY_MAINS.has(spec.mainId ?? "")) return { ...item, forbidden: true };
    if (item.id === "umami_oyster" && (spec.vegan || spec.vegetarian || spec.diet === "vegan" || spec.diet === "vegetarian")) return { ...item, forbidden: true };
    if (!item.forbidden && item.picks.length > 0 && (dairyFree || eggFree)) {
      const label = item.picks.flatMap((pick) => [pick.name, ...pick.blocks, ...pick.allergens, ...(pick.aliases ?? [])]).join(" ");
      const dairy = /\b(milk|cheese|cheddar|butter|cream|yoghurt|yogurt|ghee|whey|buttermilk)\b/i.test(label)
        && !/\b(coconut|soy|oat|almond|rice)\s+milk\b/i.test(label);
      const egg = /\beggs?\b/i.test(label) && !/\b(eggplant|aubergine)\b/i.test(label);
      if ((dairyFree && dairy) || (eggFree && egg)) return { ...item, forbidden: true };
    }
    return item;
  });
}

function openLane(options: readonly Option[], lane: string, clean?: CleanPrefs, spiceHeat?: SpiceHeat): Option[] {
  const group = options.filter((item) => item.lane === lane);
  let available = group.filter((item) => !item.forbidden);
  if (available.length === 0) available = group.filter((item) => item.plain && !item.forbidden);
  if (cleanSatPreferNone(lane, clean, spiceHeat)) {
    const none = available.filter((item) => item.plain || item.id.endsWith("_none"));
    if (none.length > 0) return none;
  }
  if ((clean?.moreVegetables || clean?.cleanMode) && lane === "fresh") {
    const fresh = available.filter((item) => item.id.startsWith("fresh_") && item.id !== "fresh_none");
    if (fresh.length > 0) return fresh;
  }
  return available;
}

interface Encoded {
  names: string[];
  clauses: Clause[];
  byId: Map<string, number>;
  chosen: Option[];
}

function encode(spec: FusionSpec, dislikes: readonly string[], recipe?: Recipe): Encoded {
  const lanes = ["form", "acid", "heat", "umami", "fresh", "crunch", "extra", "aroma"];
  const built = buildOptions(spec, dislikes, recipe);
  const chosen = lanes.flatMap((lane) => openLane(built, lane, spec.clean, spec.spiceHeat));
  const byId = new Map(chosen.map((item, index) => [item.id, index + 1]));
  const clauses: Clause[] = [];
  for (const lane of lanes) {
    const group = chosen.filter((item) => item.lane === lane).map((item) => byId.get(item.id) as number);
    clauses.push(group);
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) clauses.push([-group[i], -group[j]]);
    }
  }
  if (recipe) {
    // At most two new ingredients, rather than independently filling seven lanes.
    const additions = chosen.filter((item) => item.picks.length > 0).map((item) => byId.get(item.id) as number);
    for (let i = 0; i < additions.length; i++) for (let j = i + 1; j < additions.length; j++) for (let k = j + 1; k < additions.length; k++) {
      clauses.push([-additions[i], -additions[j], -additions[k]]);
    }
  }
  const lit = (id: string) => byId.get(id);
  const orOf = (id: string, others: string[]) => {
    const head = lit(id);
    if (head == null) return;
    const rest = others.map(lit).filter((value): value is number => value != null);
    if (rest.length === 0) clauses.push([-head]);
    else clauses.push([-head, ...rest]);
  };
  const toss = ["extra_fish", "extra_prawn", "extra_tofu", "fresh_cucumber", "fresh_herbs", "fresh_capsicum", "fresh_onion", "crunch_cabbage", "crunch_carrot", "crunch_sprouts", "crunch_peas"];
  const bright = ["acid_lime", "acid_lemon", "acid_vinegar"];
  const sauce = ["umami_oyster", "umami_soy", "umami_fish", "umami_miso", "heat_sriracha", "heat_birds", "heat_both"];
  if (recipe) {
    const warmVegetables = ["fresh_capsicum", "crunch_cabbage", "crunch_carrot", "crunch_sprouts", "crunch_peas"];
    orOf("form_hot", warmVegetables);
    orOf("form_hot_stir", warmVegetables);
  }
  orOf("form_cold", bright);
  orOf("form_cold", toss);
  orOf("form_cold_stir", bright);
  orOf("form_cold_stir", sauce);
  orOf("form_cold_stir", toss);
  orOf("form_chop", bright);
  orOf("form_chop", ["fresh_cucumber", "fresh_herbs", "fresh_capsicum", "fresh_onion", "crunch_cabbage", "crunch_carrot", "crunch_sprouts", "crunch_peas"]);
  if (!recipe) orOf("form_hot_stir", ["umami_oyster", "umami_soy", "umami_fish", "umami_miso", "aroma_ginger", "aroma_garlic", "aroma_lemongrass", "aroma_cumin"]);
  orOf("umami_oyster", bright);
  orOf("umami_fish", ["acid_lime", "acid_lemon"]);
  orOf("extra_fish", ["umami_oyster", "umami_soy", "umami_fish", "umami_miso", "acid_lime"]);
  orOf("extra_prawn", ["acid_lime", "acid_lemon", "acid_vinegar", "umami_fish"]);
  return { names: chosen.map((item) => item.id), clauses, byId, chosen };
}

const FORM_LABEL: Record<string, string> = {
  form_plate: "as plated",
  form_cold: "cold toss",
  form_cold_stir: "cold stir-fry",
  form_hot: "hot toss",
  form_hot_stir: "hot stir-fry",
  form_wrap: "lettuce wrap",
  form_broth: "broth bowl",
  form_chop: "chopped salad",
};

const STEP_TITLE: Record<string, string> = {
  form_plate: "Finish the plate",
  form_cold: "Toss it cold",
  form_cold_stir: "Build the cold stir-fry",
  form_hot: "Toss it hot",
  form_hot_stir: "Stir-fry the cooked pieces",
  form_wrap: "Fill the lettuce wraps",
  form_broth: "Build the broth bowl",
  form_chop: "Chop it into a salad",
};

function joinAnd(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function assembly(formId: string): string {
  if (formId === "form_cold_stir") {
    return "Cook the main to the endpoint already in this recipe. If the method is a crumb, cook that crumb through as written, then rest the pieces. Slice the cooked food into strips. Cool those strips quickly in a shallow container in the fridge until cold. Toss the cold strips with the sauce and the added ingredients and serve them cold, in the shape of a stir-fry. This is a cooked cold plate, not a raw dish. Do not serve raw poultry, raw mince, raw prawns, or raw fish. ";
  }
  if (formId === "form_chop") {
    return "Cook the main to the endpoint already in this recipe. Cool it quickly in a shallow container in the fridge until cold, then chop it and fold it through the added vegetables. This is a cooked cold plate, not a raw dish. Do not serve raw poultry, raw mince, raw prawns, or raw fish. ";
  }
  if (formId === "form_cold") {
    return "Cook the main to the endpoint already in this recipe. Cool the cooked food quickly in a shallow container in the fridge until cold, then toss. This is a cooked cold plate, not a raw dish. Do not serve raw poultry, raw mince, raw prawns, or raw fish. ";
  }
  if (formId === "form_hot_stir") {
    return "Complete the main's stir-fry and its cooking endpoint as written. Keep the selected side separate. Fold any cooked finishing vegetables through the finished stir-fry and add fresh garnishes at the table. ";
  }
  if (formId === "form_hot") {
    return "Cook the main and selected side as written, keeping their shape and cooking endpoint. Warm the finishing vegetables separately, then serve them alongside the meal; do not chop or stir-fry the finished main. ";
  }
  if (formId === "form_wrap") {
    return "Cook the main to the endpoint already in this recipe, then slice it into the lettuce. ";
  }
  if (formId === "form_broth") {
    return "Cook the main to the endpoint already in this recipe. Divide the finished curry or braising liquid between the bowls, then add the cooked main. Serve the selected side alongside, keeping its preparation as written. Use only the retained cooking liquid specified in the recipe, never raw meat juices or discarded poaching liquid. ";
  }
  return "Cook the main and selected side as written, keeping their shape and cooking endpoint. Prepare the finishing vegetables below and serve them alongside the meal. ";
}

function finishPreparation(additions: readonly RecipeIngredient[], warm: boolean): string {
  return additions.map((item) => {
    if (item.id === "sat-lime" || item.id === "sat-lemon") return `Cut the ${item.name} into wedges and offer it at the table, adding juice to taste.`;
    if (item.id === "sat-vinegar" || item.id === "sat-tamarind") return `Mix the ${item.name} into the existing cooked sauce a little at a time, tasting before adding more.`;
    if (item.id === "sat-coriander") return `Wash and roughly chop the ${item.name}, then scatter it over the finished dish.`;
    if (item.id === "sat-cucumber") return `Wash and cut the ${item.name} into batons; keep it fresh and serve alongside.`;
    if (item.id === "sat-spring-onion") return `Wash and finely slice the ${item.name}, then scatter it over the finished dish.`;
    if (item.id === "sat-sprouts") return `Cook the ${item.name} in boiling water until steaming hot, drain well, then serve with the finished vegetables; do not serve these sprouts raw.`;
    if (warm) return `Wash and thinly slice the ${item.name}. Cook in a separate pan with a splash of water for 3–5 minutes, until tender, then drain and serve alongside or fold into an existing stir-fry.`;
    return `Wash and finely shred or slice the ${item.name}, then serve alongside as a fresh vegetable finish.`;
  }).join(" ");
}

/** Prepare only the new portions; leave delicate sauce seasoning until afterwards. */
type PreparationTiming = "before-main" | "near-end" | "before-finish";

function stagedFinishPreparation(additions: readonly RecipeIngredient[], warm: boolean, crisp: boolean, recipe: Recipe, timing: PreparationTiming): string {
  const instructions = additions.map((item) => {
    const portion = `${item.amount}${item.unit ? ` ${item.unit}` : ""} ${item.name}`;
    if (item.id === "sat-lime" || item.id === "sat-lemon") return `Wash and cut ${portion} into wedges; reserve for the table.`;
    if (item.id === "sat-vinegar" || item.id === "sat-tamarind") return `Measure ${portion} and reserve it for the final assembly; do not season the sauce yet.`;
    if (item.id === "sat-coriander") return `Wash and roughly chop ${portion}; reserve the fresh garnish for plating.`;
    if (item.id === "sat-cucumber") return `Wash and cut ${portion} into batons; keep it fresh in a clean bowl for plating.`;
    if (item.id === "sat-spring-onion") return `Wash and finely slice ${portion}; reserve the fresh garnish for plating.`;
    if (item.id === "sat-sprouts") return `Cook ${portion} in boiling water until steaming hot${timing === "before-main" ? " during the final minutes of the main's cooking" : ""}, drain well and keep warm briefly; do not serve these sprouts raw.`;
    if (warm) return `Wash and thinly slice ${portion}. Cook in a separate pan with a splash of water for 3–5 minutes${timing === "before-main" ? " during the final minutes of the main's cooking" : ""}, until tender, then drain and keep warm briefly.`;
    return `Wash and finely shred or slice ${portion}; keep it fresh in a clean bowl for plating.`;
  });
  const mainReadiness = recipe.classicId === "cold-smoked-platter"
    ? "Keep the purchased ready-to-eat main refrigerated at 5°C or colder. Prepare these fresh finishing ingredients with clean utensils and keep them chilled until service."
    : recipe.kind === "meal"
      ? timing === "before-main"
        ? "Prepare and measure these finishing ingredients before starting the main's final cooking step. Use clean utensils separate from the raw main, and keep uncooked animal ingredients chilled. Keep fresh garnishes chilled until plating; time any warm vegetables to finish with the main."
        : "During the final 8 minutes of the main's cooking or its stated rest, prepare these finishing ingredients with clean utensils, separate from any raw food. Keep fresh garnishes chilled until plating. Do not wait until the hot main is ready before starting this preparation."
      : "Prepare these finishing ingredients with clean utensils, separate from any raw main. Keep any uncooked main chilled and complete its cooking steps as written.";
  return `${mainReadiness} ${crisp ? "Have a clean rack ready; drain the crisp main uncovered on a rack briefly after frying, then move straight to finishing and service. " : ""}${instructions.join(" ")} Complete this preparation before the regional sauce's delicate final seasoning.`;
}

function preparationSchedule(recipe: Recipe, finishBoundary: number): { index: number; timing: PreparationTiming } {
  if (recipe.kind !== "meal") return { index: finishBoundary, timing: "before-finish" };
  const cookingTitles = new Set(["Shallow-fry until crisp", "Cook the patties", "Pan-fry the main", "Stir-fry the main", "Grill the main", "Air-fry in batches", "Bake the main", "Roast the main", "Poach gently", "Poach the eggs", "Steam the main", "Steam the eggs"]);
  const cooking = recipe.steps.findIndex((step) => cookingTitles.has(step.title));
  if (cooking >= 0 && (recipe.steps[cooking].minutes ?? Infinity) <= 30) return { index: Math.min(cooking, finishBoundary), timing: "before-main" };
  return { index: finishBoundary, timing: "near-end" };
}

function stagedAssembly(recipe: Recipe, formId: string, additions: readonly RecipeIngredient[]): string {
  const portions = additions.filter((item) => !["sat-vinegar", "sat-tamarind", "sat-coriander", "sat-spring-onion", "sat-lime", "sat-lemon"].includes(item.id));
  const seasonings = additions.filter((item) => ["sat-vinegar", "sat-tamarind"].includes(item.id));
  const garnishes = additions.filter((item) => ["sat-coriander", "sat-spring-onion", "sat-lime", "sat-lemon"].includes(item.id));
  const cold = recipe.classicId === "cold-smoked-platter";
  const lines = [cold
    ? "Arrange the chilled purchased ready-to-eat main and its fresh side directly from the fridge on a clean platter. Keep any warm bread separate from the chilled foods."
    : formId === "form_broth"
    ? "Divide the finished curry or braising liquid and its fully cooked main between bowls. Serve the selected side alongside."
    : "Plate the fully cooked main and its selected side, keeping their preparation as written."];
  if (portions.length) lines.push(`Serve the already prepared ${joinAnd(portions.map((item) => item.name))} alongside${formId === "form_hot_stir" ? ", or fold the cooked vegetables gently through the finished stir-fry" : ""}.`);
  if (seasonings.length) lines.push(`Off the heat, stir the already measured ${joinAnd(seasonings.map((item) => item.name))} into the cooked sauce a little at a time, tasting before adding more.`);
  if (garnishes.length) lines.push(`Add the already prepared ${joinAnd(garnishes.map((item) => item.name))} at the table.`);
  if (!additions.length) lines.push("No extra ingredient is needed for this finish.");
  if (["schnitzel", "patties"].includes(recipe.methodId ?? "")) lines.push("Keep the sauce beside the crisp coating.");
  if (formId === "form_hot") lines.push("Do not chop or stir-fry the finished main.");
  lines.push(cold ? "Serve the platter chilled immediately after assembly; keep cold ingredients at 5°C or colder until service." : "Serve promptly after this final assembly; the finishing ingredients are already prepared.");
  return lines.join(" ");
}

function trueOptions(encoded: Encoded, assignment: readonly boolean[]): Option[] {
  return encoded.chosen.filter((item) => assignment[encoded.byId.get(item.id) as number] === true);
}

function prepared(spec: FusionSpec, recipe?: Recipe): { dislikes: string[]; encoded: Encoded } | null {
  if (!Number.isInteger(spec.seed) || spec.seed < 0 || spec.seed > 0xffffffff) return null;
  const dislikes = [...new Set((spec.dislikes ?? []).map(norm).filter(Boolean))].slice(0, 40);
  return { dislikes, encoded: encode(spec, dislikes, recipe) };
}

export function fusionSearch(spec: FusionSpec): FusionWitness {
  const ready = prepared(spec);
  if (!ready) {
    return { sat: false, formId: "form_plate", pickIds: [], names: [], variables: 0, clauses: 0, decisions: 0, conflicts: 0, satisfied: false };
  }
  const { encoded } = ready;
  const solved = solveCnf(encoded.names.length, encoded.clauses, seededDecider(encoded.names, spec.seed >>> 0, spec.regionId || "plate"));
  const assignment = solved.assignment;
  const satisfied = solved.sat && assignment != null && modelSatisfies(encoded.clauses, assignment);
  const selected = satisfied && assignment ? trueOptions(encoded, assignment) : [];
  const form = selected.find((item) => item.lane === "form");
  const picks = selected.flatMap((item) => item.picks);
  return {
    sat: satisfied,
    formId: form?.id ?? "form_plate",
    pickIds: picks.map((item) => item.id),
    names: picks.map((item) => item.name),
    variables: encoded.names.length,
    clauses: encoded.clauses.length,
    decisions: solved.decisions,
    conflicts: solved.conflicts,
    satisfied,
  };
}

/** True when the clauses still have a model after these options are forced on. */
export function fusionAdmits(spec: FusionSpec, required: readonly string[]): boolean {
  const ready = prepared(spec);
  if (!ready) return false;
  const { encoded } = ready;
  const clauses = encoded.clauses.map((clause) => [...clause]);
  for (const id of required) {
    const lit = encoded.byId.get(id);
    if (lit == null) return false;
    clauses.push([lit]);
  }
  const solved = solveCnf(encoded.names.length, clauses, seededDecider(encoded.names, spec.seed >>> 0, spec.regionId || "plate"));
  if (!solved.sat || !solved.assignment || !modelSatisfies(clauses, solved.assignment)) return false;
  return required.every((id) => solved.assignment?.[encoded.byId.get(id) as number] === true);
}

function alreadyPresent(recipe: Recipe, item: Pick): boolean {
  // Australian capsicum and plain sweet/bell pepper are the same vegetable.
  // Pepper flakes/powder, chilli sauces and ground black pepper are other forms.
  if (/^(?:sat-)?capsicum$/.test(item.id) && recipe.ingredients.some(ingredient =>
    /\b(?:(?:red|green|yellow|orange|bell|sweet) )?(?:bell )?peppers?\b/.test(norm(ingredient.name))
    && !/\b(?:flakes?|powder|ground|black|white|chilli|chili|hot|sauce|paste|paprika|dried)\b/.test(norm(ingredient.name)))) return true;
  const names = new Set(recipe.ingredients.flatMap((ingredient) => [norm(ingredient.name), norm(ingredient.id), ...(ingredient.aliases ?? []).map(norm)]));
  return [item.name, item.id, ...(item.aliases ?? [])].some((label) => names.has(norm(label)))
    || item.blocks.some((label) => recipe.ingredients.some((ingredient) => wordHit(ingredient.name, label) || (ingredient.aliases ?? []).some((alias) => wordHit(alias, label))));
}

/** Dry cooking methods and absorbed/discarded liquids cannot supply a broth bowl. */
function hasBrothForBowl(recipe: Recipe): boolean {
  if (recipe.kind !== "meal" || !["curry", "braised"].includes(recipe.methodId ?? "")) return false;
  const liquid = recipe.ingredients
    .filter((item) => item.unit === "ml" && ["vegetable-stock", "coconut-milk", "passata"].includes(item.id))
    .reduce((sum, item) => sum + item.amount, 0);
  return Number.isFinite(recipe.servings) && recipe.servings > 0 && liquid >= recipe.servings * 100;
}

export function applySatFusion<T extends Recipe>(recipe: T, spec: FusionSpec): T {
  const ready = prepared({ ...spec, brothReady: hasBrothForBowl(recipe) }, recipe);
  if (!ready) return recipe;
  const { encoded } = ready;
  const pantryNames = pantrySet(spec.pantry);
  const solved = selectBestCnfModel(encoded.names.length, encoded.clauses,
    seededDecider(encoded.names, spec.seed >>> 0, spec.regionId || "plate"),
    assignment => {
      const options = trueOptions(encoded, assignment);
      const extras = options.flatMap(option => option.picks).filter(item => !alreadyPresent(recipe, item));
      // Transparent soft objectives, not a learned claim that a dish tastes good.
      const simplicity = extras.length === 1 ? 3 : extras.length === 2 ? 2 : 0;
      const produce = extras.filter(item => item.category === "produce").length;
      const owned = extras.filter(item => [item.name, ...(item.aliases ?? [])].some(label => pantryNames.has(norm(label)))).length;
      const extraPan = options.some(option => ["form_hot", "form_hot_stir"].includes(option.id)) ? 1 : 0;
      return simplicity + produce + owned * 0.5 - extraPan;
    }, { maxModels: 8, maxSolves: 9, maxTotalSteps: 8000, maxTotalWork: 2_000_000, maxProofWork: 200_000 });
  if (!solved.assignment || !modelSatisfies(encoded.clauses, solved.assignment)) return recipe;
  const selected = trueOptions(encoded, solved.assignment);
  const form = selected.find((item) => item.lane === "form") ?? encoded.chosen.find((item) => item.id === "form_plate");
  if (!form) return recipe;
  const pantry = pantrySet(spec.pantry);
  const additions: RecipeIngredient[] = [];
  for (const item of selected.flatMap((option) => option.picks)) {
    if (alreadyPresent(recipe, item)) continue;
    additions.push({
      id: item.id,
      name: item.name,
      amount: scale(item.amount, spec.servings),
      unit: item.unit,
      category: item.category,
      allergens: [...item.allergens],
      inPantry: [item.name, ...(item.aliases ?? [])].some((label) => pantry.has(norm(label))),
      notes: item.notes,
      ...(item.aliases ? { aliases: [...item.aliases] } : {}),
    });
  }
  const fish = additions.some((item) => item.category === "fishmonger" && item.allergens.includes("fish"));
  const prawn = additions.some((item) => item.category === "fishmonger" && (item.allergens.includes("crustacean") || /prawn|shrimp/i.test(item.name)));
  const animal = fish || prawn || /chicken|turkey|beef|lamb|pork|mince|fish|prawn/i.test(`${spec.mainId ?? ""} ${recipe.title}`);
  const safety = assembly(form.id);
  const chillingNote = ["form_cold", "form_cold_stir", "form_chop"].includes(form.id)
    ? "Allow additional chilling time before serving; the displayed cooking estimate does not include that wait. "
    : "";
  const seafood = [
    fish ? "Cook the added fish (listed as Firm white fish) until the flesh is opaque and a thermometer in the centre reads at least 63°C before it is tossed or chilled. " : "",
    prawn ? "Cook the added prawns (listed as Raw peeled prawns) until they turn pink and opaque all the way through. " : "",
    (fish || prawn) && chillingNote ? "Cool the cooked seafood additions quickly in a shallow container in the fridge until cold before mixing them with the chilled main. " : "",
    animal ? "Keep raw animal ingredients separate from the finished plate, and wash hands, boards and utensils after handling them. " : "",
  ].join("");
  const coldPlatter = recipe.classicId === "cold-smoked-platter";
  const finishBoundaryIndex = recipe.steps.findIndex((step) => step.finishBoundary === true || step.title === "Finish the regional sauce");
  const stagedFinish = coldPlatter || finishBoundaryIndex >= 0;
  const detail = stagedFinish
    ? stagedAssembly(recipe, form.id, additions)
    : `${safety}${seafood}${chillingNote}${additions.length ? `${finishPreparation(additions, form.id === "form_hot" || form.id === "form_hot_stir")} ` : "No extra ingredient is needed for this finish. "}Finish assembling the fully cooked ingredients as directed before serving. This variation is template-generated and not kitchen-tested.`;
  const formLabel = ({ form_plate: "regional finish", form_hot: "warm vegetable finish", form_hot_stir: "stir-fry finish" } as Record<string, string>)[form.id] ?? FORM_LABEL[form.id] ?? "regional finish";
  const titleTail = additions.length ? `${joinAnd(additions.map((item) => item.name.toLocaleLowerCase("en")))} finish` : "";
  const finishMinutes = additions.length ? 8 : form.id === "form_broth" ? 2 : 0;
  const preparationMinutes = stagedFinish && additions.length ? finishMinutes : 0;
  const assemblyMinutes = finishMinutes - preparationMinutes;
  const allergens = [...new Set([...recipe.allergens, ...additions.flatMap((item) => item.allergens)])].sort();
  const equipment = new Set(recipe.equipment);
  if (fish || prawn || animal) equipment.add("Food thermometer");
  if (form.id === "form_hot_stir" || form.id === "form_hot") equipment.add("Wide frying pan");
  if (form.id === "form_cold" || form.id === "form_cold_stir" || form.id === "form_chop") equipment.add("Shallow fridge container");
  if (preparationMinutes && ["schnitzel", "patties"].includes(recipe.methodId ?? "")) equipment.add("Wire cooling rack");
  const baseSteps = recipe.steps.map((step) => {
    if (/^Serve the complete meal$/i.test(step.title)) {
      if (coldPlatter) return { ...step, title: "Keep the chilled components ready", detail: "Keep the purchased ready-to-eat main and fresh accompaniments refrigerated at 5°C or colder until the final chilled assembly below." };
      return { ...step, title: "Keep the cooked components ready", detail: `Keep the fully cooked main and its accompaniments ready. Complete the final ${formLabel} assembly below before serving.` };
    }
    if (step.title === "Bring the meal together" && recipe.components) {
      return {
        ...step,
        detail: `Keep the fully cooked main with any integrated sauce, plus the ${recipe.components.side} and ${recipe.components.vegetables}, ready for the final ${formLabel} assembly. The sauce for this meal is ${recipe.components.sauce}. Follow the final step below before serving.`,
      };
    }
    // Preserve cooking/endpoint guidance in classic methods while deferring an
    // immediate-service instruction until their transformed finish is complete.
    return { ...step, detail: step.detail.replace(/\bserve (?:promptly|immediately|straightaway|the traybake hot|hot|warm)\b/gi, "complete the final assembly below before serving") };
  });
  if (preparationMinutes) {
    const schedule = preparationSchedule(recipe, finishBoundaryIndex >= 0 ? finishBoundaryIndex : baseSteps.length);
    baseSteps.splice(schedule.index, 0, {
      title: "Prepare the finishing ingredients",
      detail: stagedFinishPreparation(additions, form.id === "form_hot" || form.id === "form_hot_stir", ["schnitzel", "patties"].includes(recipe.methodId ?? ""), recipe, schedule.timing),
      minutes: preparationMinutes,
    });
  }
  return {
    ...recipe,
    id: `${recipe.id}-sat-${spec.seed}`,
    title: titleTail ? `${recipe.title} — ${titleTail}` : recipe.title,
    description: titleTail ? `${recipe.description} Finish with ${joinAnd(additions.map((item) => item.name))}.` : recipe.description,
    fusionNote: `${recipe.fusionNote} The extras on this plate were selected from ${solved.models.length} verified compatible SAT finishes using ingredient simplicity, produce and pantry preferences (${solved.optimal ? "all feasible finishes checked" : "bounded best-known search; not a global optimum"}; seed ${spec.seed}, ${encoded.names.length} variables, ${encoded.clauses.length} clauses, ${solved.decisions} decisions, ${solved.conflicts} conflicts). Hard diet, allergen and dislike filters are clauses. The same seed repeats this plate. Another click uses a new seed. This is not a live model, not kitchen-tested, and not guaranteed allergy-safe. It is not a proof about P versus NP. Check the packet.`,
    ingredients: [...recipe.ingredients, ...additions],
    steps: [...baseSteps, { title: stagedFinish ? "Assemble the finished meal" : form.id === "form_hot" ? "Warm the finishing vegetables" : form.id === "form_hot_stir" ? "Finish the stir-fry" : STEP_TITLE[form.id] ?? "Finish the plate", detail, ...(assemblyMinutes ? { minutes: assemblyMinutes } : {}) }],
    equipment: [...equipment],
    allergens,
    cookMinutes: recipe.cookMinutes + finishMinutes,
    totalMinutes: recipe.totalMinutes + finishMinutes,
    tags: [...recipe.tags, "Seeded plate", formLabel],
    dietaryNotes: [
      ...recipe.dietaryNotes,
      ...(chillingNote ? [chillingNote.trim()] : []),
      "The extra ingredients were added by a seeded search. They do not make the template kitchen-tested or allergy-safe. Check every packet.",
    ],
    sourceLabel: "Template-generated · not kitchen-tested",
  } as T;
}


/** Offline inspection of the complete finite finish graph for one exact recipe context. */
export function enumerateRecipeFinishes(recipe: Recipe, spec: FusionSpec, options: EnumerationOptions = {}) {
  const ready = prepared({ ...spec, brothReady: hasBrothForBowl(recipe) }, recipe);
  if (!ready) return { complete: false, termination: "invalid-input", models: [], modelCount: 0, variables: 0, clauses: [], names: [] };
  const { encoded } = ready;
  const result = enumerateCnfModels(encoded.names.length, encoded.clauses,
    seededDecider(encoded.names, spec.seed >>> 0, spec.regionId || "plate"), options);
  const models = result.models.map(assignment => {
    const selected = trueOptions(encoded, assignment);
    return { formId: selected.find(option => option.lane === "form")?.id ?? "form_plate", picks: selected.flatMap(option => option.picks).map(item => ({ id: item.id, name: item.name, amount: scale(item.amount, spec.servings), unit: item.unit, category: item.category, allergens: [...item.allergens] })), assignment };
  });
  return { ...result, models, modelCount: models.length, variables: encoded.names.length, clauses: encoded.clauses, names: encoded.names };
}
