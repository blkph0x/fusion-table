/**
 * Turns one meal into a CNF and keeps the first model the seeded solver finds.
 * Hard clauses are diet, allergen and dislike filters. Food-safety wording is
 * attached after the model is chosen. The search does not prove the plate is
 * pleasant, traditional, allergy-safe, or kitchen-tested.
 */

import type { DietId, IngredientCategory, Recipe, RecipeIngredient, SpiceHeat } from "./recipe-types.ts";
import { foodWordHit } from "./food-words.ts";
import { mix32, modelSatisfies, seededDecider, solveCnf, type Clause } from "./sat.ts";
import { regionAllowsFusionOption } from "./region-affinity.ts";

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

function buildOptions(spec: FusionSpec, dislikes: readonly string[]): Option[] {
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

  const oysterAllergens = gf ? ["fish"] : ["fish", "wheat"];
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
    if (!regionAllowsFusionOption(spec.regionId, item.id)) return { ...item, forbidden: true };
    if (item.id === "heat_sriracha" || item.id === "heat_birds" || item.id === "heat_both") {
      if (mild || heatBlocked) return { ...item, forbidden: true };
    }
    if (item.id === "heat_none" && hot && !heatBlocked) {
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

function openLane(options: readonly Option[], lane: string): Option[] {
  const group = options.filter((item) => item.lane === lane);
  const available = group.filter((item) => !item.forbidden);
  return available.length > 0 ? available : group.filter((item) => item.plain && !item.forbidden);
}

interface Encoded {
  names: string[];
  clauses: Clause[];
  byId: Map<string, number>;
  chosen: Option[];
}

function encode(spec: FusionSpec, dislikes: readonly string[]): Encoded {
  const lanes = ["form", "acid", "heat", "umami", "fresh", "crunch", "extra", "aroma"];
  const chosen = lanes.flatMap((lane) => openLane(buildOptions(spec, dislikes), lane));
  const byId = new Map(chosen.map((item, index) => [item.id, index + 1]));
  const clauses: Clause[] = [];
  for (const lane of lanes) {
    const group = chosen.filter((item) => item.lane === lane).map((item) => byId.get(item.id) as number);
    clauses.push(group);
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) clauses.push([-group[i], -group[j]]);
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
  orOf("form_cold", bright);
  orOf("form_cold", toss);
  orOf("form_cold_stir", bright);
  orOf("form_cold_stir", sauce);
  orOf("form_cold_stir", toss);
  orOf("form_chop", bright);
  orOf("form_chop", ["fresh_cucumber", "fresh_herbs", "fresh_capsicum", "fresh_onion", "crunch_cabbage", "crunch_carrot", "crunch_sprouts", "crunch_peas"]);
  orOf("form_hot_stir", ["umami_oyster", "umami_soy", "umami_fish", "umami_miso", "aroma_ginger", "aroma_garlic", "aroma_lemongrass", "aroma_cumin"]);
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

const TITLE_LANES = ["extra", "umami", "heat", "acid", "aroma", "crunch", "fresh"];

function joinAnd(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function signatureNames(selected: readonly Option[]): string[] {
  const names: string[] = [];
  for (const lane of TITLE_LANES) {
    for (const item of selected.find((option) => option.lane === lane)?.picks ?? []) {
      if (!names.includes(item.name)) names.push(item.name);
      if (names.length === 3) return names;
    }
  }
  return names;
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
    return "Cook the main to the endpoint already in this recipe. Rest it, then slice the cooked pieces into strips. Heat a wide pan and toss the strips with the aromatics and sauce for about a minute, until the sauce coats them. Do not serve raw poultry, raw mince, raw prawns, or raw fish. ";
  }
  if (formId === "form_hot") {
    return "Cook the main to the endpoint already in this recipe, then toss it hot with the added ingredients for about a minute. ";
  }
  if (formId === "form_wrap") {
    return "Cook the main to the endpoint already in this recipe, then slice it into the lettuce. ";
  }
  if (formId === "form_broth") {
    return "Cook the main to the endpoint already in this recipe. Ladle a little of its warm cooking liquid or the regional sauce into the bowl. Do not use raw meat juices. ";
  }
  return "Cook the main to the endpoint already in this recipe, then add the extras at the table. ";
}

function trueOptions(encoded: Encoded, assignment: readonly boolean[]): Option[] {
  return encoded.chosen.filter((item) => assignment[encoded.byId.get(item.id) as number] === true);
}

function prepared(spec: FusionSpec): { dislikes: string[]; encoded: Encoded } | null {
  if (!Number.isInteger(spec.seed) || spec.seed < 0 || spec.seed > 0xffffffff) return null;
  const dislikes = [...new Set((spec.dislikes ?? []).map(norm).filter(Boolean))].slice(0, 40);
  return { dislikes, encoded: encode(spec, dislikes) };
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
  const names = new Set(recipe.ingredients.flatMap((ingredient) => [norm(ingredient.name), norm(ingredient.id), ...(ingredient.aliases ?? []).map(norm)]));
  return [item.name, item.id, ...(item.aliases ?? [])].some((label) => names.has(norm(label)));
}

export function applySatFusion<T extends Recipe>(recipe: T, spec: FusionSpec): T {
  const ready = prepared(spec);
  if (!ready) return recipe;
  const { encoded } = ready;
  const solved = solveCnf(encoded.names.length, encoded.clauses, seededDecider(encoded.names, spec.seed >>> 0, spec.regionId || "plate"));
  if (!solved.sat || !solved.assignment || !modelSatisfies(encoded.clauses, solved.assignment)) return recipe;
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
  const listed = additions.map((item) => item.name);
  const fish = additions.some((item) => item.allergens.includes("fish") || norm(item.name).includes("fish"));
  const prawn = additions.some((item) => item.allergens.includes("crustacean") || /prawn|shrimp/i.test(item.name));
  const animal = fish || prawn || /chicken|turkey|beef|lamb|pork|mince|fish|prawn/i.test(`${spec.mainId ?? ""} ${recipe.title}`);
  const safety = assembly(form.id);
  const seafood = [
    fish ? "Cook the added fish until the flesh is opaque and a thermometer in the centre reads at least 63°C before it is tossed or chilled. " : "",
    prawn ? "Cook the added prawns until they turn pink and opaque all the way through. " : "",
    animal ? "Keep raw animal ingredients separate from the finished plate, and wash hands, boards and utensils after handling them. " : "",
  ].join("");
  const detail = `${safety}${seafood}${listed.length ? `Fold in ${listed.join(", ")}. ` : "No extra ingredient was added on this search. "}Check the packet on every bottled sauce. A sauce can contain fish, soy, or wheat even when this plate does not list them. This plate is one satisfying assignment from a seeded SAT search on this device. The same seed repeats it. It is template-generated and not kitchen-tested. It is not a proof of taste, safety, or P versus NP.`;
  const signature = signatureNames(selected);
  const formLabel = FORM_LABEL[form.id] ?? "as plated";
  const titleTail = signature.length ? `${formLabel} with ${joinAnd(signature)}` : formLabel;
  const allergens = [...new Set([...recipe.allergens, ...additions.flatMap((item) => item.allergens)])].sort();
  const equipment = new Set(recipe.equipment);
  if (fish || prawn || animal) equipment.add("Food thermometer");
  if (form.id === "form_hot_stir" || form.id === "form_hot") equipment.add("Wide frying pan");
  if (form.id === "form_cold" || form.id === "form_cold_stir" || form.id === "form_chop") equipment.add("Shallow fridge container");
  return {
    ...recipe,
    id: `${recipe.id}-sat-${spec.seed}`,
    title: `${recipe.title} · ${titleTail}`,
    description: `${recipe.description} Seeded plate: ${titleTail}.`,
    fusionNote: `${recipe.fusionNote} The extras on this plate were chosen by a seeded SAT search (seed ${spec.seed}, ${encoded.names.length} variables, ${encoded.clauses.length} clauses, ${solved.decisions} decisions, ${solved.conflicts} conflicts). Hard diet, allergen and dislike filters are clauses. The same seed repeats this plate. Another click uses a new seed. This is not a live model, not kitchen-tested, and not guaranteed allergy-safe. It is not a proof about P versus NP. Check the packet.`,
    ingredients: [...recipe.ingredients, ...additions],
    steps: [...recipe.steps, { title: STEP_TITLE[form.id] ?? "Finish the plate", detail, minutes: 8 }],
    equipment: [...equipment],
    allergens,
    cookMinutes: recipe.cookMinutes + 8,
    totalMinutes: recipe.totalMinutes + 8,
    tags: [...recipe.tags, "Seeded plate", formLabel],
    dietaryNotes: [
      ...recipe.dietaryNotes,
      "The extra ingredients were added by a seeded search. They do not make the template kitchen-tested or allergy-safe. Check every packet.",
    ],
    sourceLabel: "Template-generated · not kitchen-tested",
  } as T;
}
