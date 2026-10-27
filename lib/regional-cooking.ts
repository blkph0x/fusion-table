/**
 * Cooking stages for an already chosen regional profile, not a new recipe.
 * Four-serving draft amounts are scaled once. Each supplied ingredient is
 * allocated to one adding stage; later removal only references its identifier.
 *
 * Technique context (checked 27 October 2026):
 * https://www.mccormick.com/blogs/thai-kitchen-recipes/thai-red-curry
 * https://www.pataks.co.uk/inspirations/ways-to-make-great-curry
 * https://hikarimiso.com/what-is-miso/how-to-use-miso-paste/
 * https://www.kikkoman.co.uk/products/detail/kikkoman-toasted-sesame-oil
 * https://sandovalextension.nmsu.edu/documents/drychile.pdf
 * https://www.canada.ca/en/health-canada/services/food-guide/eating-support/kitchen/cooking-skills/best-uses-fresh-dried-herbs.html
 * https://www.mccormick.com/products/mccormick-r-sesame-seed-1-oz
 * https://hot-thai-kitchen.com/galangal-101/
 * https://hot-thai-kitchen.com/kaffir-lime-leaves-101/
 * https://www.burlapandbarrel.com/products/black-limes-ground
 * These defaults retain paste frying and delicate sauce finishes. They are not
 * a claim that every traditional use of an ingredient follows the same method.
 */
import { PANTRY_ITEMS } from "./region-pantry.ts";
import type { DraftIngredient } from "./template-types.ts";

export type RegionalCookingPhase = "prepare" | "heat" | "temper" | "soften" | "bloom" | "liquid" | "simmer" | "remove" | "finish";
export type RegionalCookingRole = "frying-oil" | "whole-seeds" | "annatto-infusion" | "onion" | "aromatic" | "curry-leaf" | "fry-paste" | "ground-spice" | "crush-spice" | "rehydrate-chilli" | "simmer-herb" | "woody-infusion" | "saffron" | "wet-condiment" | "delicate-paste" | "tahini" | "dairy" | "fresh-finish" | "acid-finish" | "dry-finish" | "liquid" | "gentle-default";
type InputSlot = "aromatics" | "seasonings" | "finish" | "oil" | "liquid" | "body";
export type RegionalCookingIngredient = Omit<DraftIngredient, "aliases" | "allergens"> & { aliases?: readonly string[]; allergens: readonly string[] };

export interface RegionalCookingInput {
  aromatics?: readonly RegionalCookingIngredient[];
  seasonings?: readonly RegionalCookingIngredient[];
  finish?: readonly RegionalCookingIngredient[];
  liquid?: RegionalCookingIngredient;
  body?: RegionalCookingIngredient;
  /** Only the oil portion reserved for this sauce, not all oil on the plate. */
  oil?: RegionalCookingIngredient;
  servings: number;
  quantityBasis?: "four-servings" | "already-scaled";
  /** A sauce cooked apart from the raw main can be finished before that main. */
  separateSauce?: boolean;
}

export interface RegionalCookingAllocation {
  id: string;
  name: string;
  amount: number;
  unit: string;
  role: RegionalCookingRole;
  stageId: string;
  phase: RegionalCookingPhase;
  /** All original occurrences accounted for when equal id/unit entries merge. */
  sourceKeys: string[];
}

export interface RegionalCookingStage {
  id: string;
  phase: RegionalCookingPhase;
  detail: string;
  ingredients: RegionalCookingAllocation[];
  /** References only; a removal does not use a second portion. */
  removeIngredientIds?: string[];
  /** Later handling of an already allocated portion, not a new ingredient use. */
  ingredientReferences?: string[];
  /** A sauce-stage estimate only, excluding the main's cooking time. */
  minutes?: number;
}

export interface RegionalCookingPlan {
  stages: RegionalCookingStage[];
  allocations: RegionalCookingAllocation[];
  prepare: string;
  heatOil: string;
  temper: string;
  soften: string;
  bloom: string;
  addLiquid: string;
  simmer: string;
  remove: string;
  finish: string;
  /** Any preparation, then oil/tempering/aromatics/blooming; no sauce liquid or finish. */
  start: string;
  beforeLiquidMinutes: number;
  simmerMinutes: number;
  finishMinutes: number;
  totalMinutes: number;
  equipment: string[];
}

const PANTRY = new Map(PANTRY_ITEMS.map((item) => [item.id, item]));
const WHOLE_SEEDS = new Set(["fennel-seeds", "caraway", "fenugreek", "celery-seed", "mustard-seeds", "panch-phoron"]);
const WOODY = new Set(["kaffir-lime-leaves", "pandan", "bay-leaves", "bay-leaf", "dried-lime", "star-anise"]);
const FRY_PASTES = new Set(["red-curry-paste", "green-curry-paste", "yellow-curry-paste", "massaman-curry-paste", "panang-curry-paste", "madras-curry-paste", "vindaloo-paste", "korma-paste", "laksa-paste", "kroeung", "base-genep", "harissa", "aji-amarillo", "aji-limo", "chipotle-paste", "calabrian-chilli-paste", "sambal-oelek", "doubanjiang", "biber-salcasi", "tomato-paste", "fermented-black-beans"]);
const DELICATE_PASTES = new Set(["miso", "white-miso", "yuzu-kosho", "dijon-mustard", "shatta", "ajika", "zhug"]);
const DRY_FINISHES = new Set(["garam-masala", "sumac", "zaatar", "kasuri-methi", "dried-mint", "lemon-myrtle", "sansho", "shichimi", "mitmita", "sesame-seeds", "peanuts"]);
const SIMMER_HERBS = new Set(["oregano", "dried-oregano", "mexican-oregano", "thyme", "dried-thyme", "cocoa", "epazote"]);
const WET_CONDIMENTS = new Set(["soy-sauce", "tamari", "bbq-soy-sauce", "bbq-tamari", "kecap-manis", "gochujang", "palm-sugar", "maple-syrup", "molasses", "bbq-tomato-ketchup", "tamarind", "duo-jiao"]);
const FRESH_AROMATICS = new Set(["garlic", "ginger", "fresh-ginger", "birds-eye-chilli", "scotch-bonnet", "piri-piri", "malagueta-chilli", "green-chilli"]);

function bareId(id: string): string { return id.toLowerCase().replace(/^gf-/, ""); }
function powderedName(name: string): boolean { return /\b(ground|powder|powdered|milled|pulverised|pulverized)\b/.test(name.toLowerCase()); }
function wholeDriedChilli(item: RegionalCookingIngredient): boolean {
  return ["dried-red-chilli", "facing-heaven-chilli"].includes(bareId(item.id))
    && !powderedName(item.name) && !/\b(flakes?|crushed|chopped)\b/i.test(item.name);
}

/** Explicit catalogue exceptions take precedence over a profile's original lane. */
export function regionalCookingRole(item: RegionalCookingIngredient, slot?: InputSlot): RegionalCookingRole {
  const id = bareId(item.id), name = item.name.toLowerCase(), notes = item.notes?.toLowerCase() ?? "";
  const known = PANTRY.get(id);
  const powdered = powderedName(name);
  if (/\btoasted sesame oil\b/.test(name) || id === "sesame-oil") return "fresh-finish";
  if (slot === "oil") return "frying-oil";
  if (slot === "finish" && /\boil\b/.test(name)) return "fresh-finish";
  if (/\b(cream|yogurt|yoghurt)\b/.test(name) && !/\bcoconut\b/.test(name)) return "dairy";
  if (slot === "liquid" || slot === "body") return "liquid";
  // A catalogue ID can be retained when the supplied ingredient changes form.
  // Powdered garlic/ginger/onion must not receive fresh mincing and long frying.
  if (powdered && (FRESH_AROMATICS.has(id) || ["onion", "brown-onion", "red-onion", "shallot", "shallots"].includes(id))) return "ground-spice";
  if (DELICATE_PASTES.has(id) || /\b(miso|yuzu kosho|dijon mustard)\b/.test(name)) return "delicate-paste";
  if (id === "tahini" || /\btahini\b/.test(name)) return "tahini";
  if (id === "saffron") return "saffron";
  if (id === "ancho-chilli") return powdered ? "ground-spice" : "rehydrate-chilli";
  if (id === "annatto") return powdered ? "ground-spice" : "annatto-infusion";
  if (id === "star-anise") {
    if (powdered) return "ground-spice";
    if (/\b(whole|pods?)\b/.test(`${name} ${notes}`)) return "woody-infusion";
    // The catalogue's unlabeled 0.5 tsp is a ground-spice measure. A counted
    // star (or an explicitly whole product) remains a removable infusion.
    return ["tsp", "tbsp", "teaspoon", "teaspoons", "tablespoon", "tablespoons"].includes(item.unit.trim().toLowerCase()) ? "ground-spice" : "woody-infusion";
  }
  // Form is evidence from the supplied name, not an optional substitution in
  // notes (the default annatto notes mention ground annatto as an alternative).
  if (id === "dried-lime" && powdered) return "wet-condiment";
  if (id === "kaffir-lime-leaves" && !powdered && /\b(?:very\s+)?finely\s+(?:julienned|shredded|chopped|sliced)\b|\b(?:julienned|shredded)\b/.test(`${name} ${notes}`)) return "fresh-finish";
  if (WOODY.has(id)) return powdered ? "simmer-herb" : "woody-infusion";
  if (id === "galangal") return powdered ? "ground-spice" : /minced|grated|paste|finely chopped/.test(`${name} ${notes}`) ? "aromatic" : "woody-infusion";
  if (id === "lemongrass") return powdered ? "ground-spice" : /minced|grated|paste|tender inner|finely chopped/.test(`${name} ${notes}`) ? "aromatic" : "woody-infusion";
  if (known?.kind === "herb" && (powdered || /\bdried\b/.test(name)) && !DRY_FINISHES.has(id) && id !== "curry-leaves") return "simmer-herb";
  if (id === "curry-leaves" && powdered) return "simmer-herb";
  if (id === "curry-leaves") return "curry-leaf";
  if (["shallot", "shallots", "onion", "brown-onion", "red-onion"].includes(id)) return "onion";
  if (WHOLE_SEEDS.has(id)) return powdered ? "ground-spice" : "whole-seeds";
  if (["cumin", "ground-coriander"].includes(id) && !powdered && /\b(whole|seeds?)\b/.test(name)) return "whole-seeds";
  if (id === "cardamom" && !powdered && /\bseeds?\b/.test(name) && !/\bpods?\b/.test(name)) return "crush-spice";
  if (["cardamom", "cloves", "cinnamon", "ceylon-cinnamon"].includes(id) && !powdered
    && (/\b(whole|pods?|sticks?|quills?|bark)\b/.test(name) || ["", "each", "pods", "sticks", "quills"].includes(item.unit.trim().toLowerCase()))) return "woody-infusion";
  if (["sichuan-pepper", "timur", "grains-of-paradise"].includes(id)) return powdered ? "ground-spice" : "crush-spice";
  if (DRY_FINISHES.has(id)) return "dry-finish";
  if (SIMMER_HERBS.has(id)) return "simmer-herb";
  if (WET_CONDIMENTS.has(id) || /\b(sugar|molasses|maple syrup|kecap|gochujang|soy sauce|tamari|tomato ketchup)\b/.test(name)) return "wet-condiment";
  if (FRY_PASTES.has(id)) return "fry-paste";
  if (FRESH_AROMATICS.has(id) || known?.kind === "aromatic"
    || (/\b(garlic|ginger)\b/.test(name) && !/\b(powder|dried|ground|oil|sauce|paste|pickled)\b/.test(name))) return "aromatic";
  if (known?.kind === "acid" || /\b(lemon|lime|calamansi|orange|vinegar)\b/.test(`${id} ${name}`)) return "acid-finish";
  if (known?.kind === "herb" || (slot === "finish" && item.category === "produce")) return "fresh-finish";
  if (known?.kind === "spice" || known?.kind === "heat" || /\b(ground|powder|flakes|paprika|cumin|pepper|spice blend)\b/.test(name)) return "ground-spice";
  // Unknown pastes are not blindly fried; unknown produce is kept fresh only
  // when explicitly supplied as a finish. No invented milk, stock or oil.
  return "gentle-default";
}

type Entry = { item: RegionalCookingIngredient; role: RegionalCookingRole; sourceKeys: string[] };
const quantity = (item: RegionalCookingIngredient) => `${item.amount}${item.unit ? ` ${item.unit}` : ""} ${item.name.toLocaleLowerCase("en")}`;
const list = (entries: readonly Entry[]) => entries.map((entry) => quantity(entry.item)).join(", ");

export function buildRegionalCooking(input: RegionalCookingInput): RegionalCookingPlan {
  if (!Number.isFinite(input.servings) || input.servings <= 0) throw new Error("Regional cooking needs a positive serving count.");
  if (input.quantityBasis && !["four-servings", "already-scaled"].includes(input.quantityBasis)) throw new Error("Choose a recognised regional quantity basis.");
  const ratio = input.quantityBasis === "already-scaled" ? 1 : input.servings / 4;
  const entries = new Map<string, Entry>();
  const slots: [InputSlot, readonly RegionalCookingIngredient[]][] = [
    ["oil", input.oil ? [input.oil] : []], ["aromatics", input.aromatics ?? []],
    ["seasonings", input.seasonings ?? []], ["liquid", input.liquid ? [input.liquid] : []],
    ["body", input.body ? [input.body] : []], ["finish", input.finish ?? []],
  ];
  for (const [slot, items] of slots) for (const [index, item] of items.entries()) {
    if (!item.id || !item.name || !Number.isFinite(item.amount) || item.amount < 0) throw new Error("Regional ingredients need an identifier, name and valid quantity.");
    if (item.amount === 0) continue;
    const role = regionalCookingRole(item, slot);
    const key = `${item.id}|${item.unit}|${role}`;
    const existing = entries.get(key);
    if (existing) {
      existing.item.amount += item.amount;
      existing.sourceKeys.push(`${slot}:${index}`);
    } else entries.set(key, { item: { ...item }, role, sourceKeys: [`${slot}:${index}`] });
  }
  const all = [...entries.values()].map((entry) => ({ ...entry, item: { ...entry.item, amount: Number((entry.item.amount * ratio).toFixed(4)) } }));
  const oil = all.filter((entry) => entry.role === "frying-oil");
  const hasOil = oil.length > 0;
  const group = (...roles: RegionalCookingRole[]) => all.filter((entry) => roles.includes(entry.role));
  const stages: RegionalCookingStage[] = [];
  function add(id: string, phase: RegionalCookingPhase, items: Entry[], detail: string, minutes?: number, removeIngredientIds?: string[]) {
    if (!detail) return;
    stages.push({ id, phase, detail, ingredients: items.map((entry) => ({ id: entry.item.id, name: entry.item.name, amount: entry.item.amount, unit: entry.item.unit, role: entry.role, stageId: id, phase, sourceKeys: [...entry.sourceKeys] })), ...(minutes ? { minutes } : {}), ...(removeIngredientIds?.length ? { removeIngredientIds } : {}) });
  }
  const rawSesame = group("dry-finish").filter((entry) => bareId(entry.item.id) === "sesame-seeds"
    && (/\b(raw|untoasted|unroasted)\b/.test(entry.item.name.toLowerCase()) || !/\b(toasted|roasted)\b/.test(entry.item.name.toLowerCase())));
  if (rawSesame.length) add("toast-sesame", "prepare", rawSesame, `Put ${list(rawSesame)} in a dry pan over medium-low heat. Stir for 1–2 minutes, until lightly golden and nutty; do not let them darken. Tip into a clean bowl to cool and reserve this same measured portion for the final garnish.`, 2);
  const ancho = group("rehydrate-chilli");
  if (ancho.length) add("prepare-ancho", "prepare", ancho, `Wipe clean, stem and deseed ${list(ancho)}. Cover with just-boiled water in a heatproof bowl and soak for 15–30 minutes, until fully soft and pliable. Drain and discard the soaking water, then blend the softened chillies to a paste with a little fresh water. This soaking water is separate from the sauce liquid listed below.`, 30);
  if (hasOil) add("heat-oil", "heat", oil, `Heat ${list(oil)} in the pan over medium-low heat; do not let it smoke.`, 0.5);
  const annatto = group("annatto-infusion");
  if (annatto.length && hasOil) add("infuse-annatto", "temper", annatto, `Add ${list(annatto)} to the warm oil and stir gently for 1–2 minutes, until the oil is coloured. Strain out and discard the annatto seeds, returning all the coloured oil to the pan before adding the next ingredients.`, 2, annatto.map((entry) => entry.item.id));
  const seeds = group("whole-seeds");
  if (seeds.length && hasOil) add("temper-seeds", "temper", seeds, `Add ${list(seeds)}. Stir in the warm oil for 30–60 seconds until fragrant${seeds.some((entry) => /mustard|panch-phoron/.test(entry.item.id)) ? " and the mustard seeds begin to pop" : ""}; lower the heat immediately if they darken.`, 1);
  const curryLeaves = group("curry-leaf");
  if (curryLeaves.length && hasOil) add("temper-curry-leaves", "temper", curryLeaves, `${curryLeaves.some((entry) => !/\bdried\b/i.test(entry.item.name)) ? `Wash and dry ${list(curryLeaves)} thoroughly` : `Measure ${list(curryLeaves)}`}, strip off any stalks and carefully add the leaves to the warm oil. Stir for 15–20 seconds; they may spit.`, 0.5);
  const onions = group("onion"), aromatics = group("aromatic");
  if (hasOil) {
    if (onions.length) add("soften-onions", "soften", onions, `Add ${list(onions)}, finely sliced or diced. Soften for 4–5 minutes over medium-low heat, stirring, without browning hard.`, 5);
    if (aromatics.length) add("soften-aromatics", "soften", aromatics, `Add ${list(aromatics)}, finely minced, grated or sliced as appropriate. Stir for 1–2 minutes until fragrant, without burning.`, 2);
  }
  const pastes = group("fry-paste"), ground = group("ground-spice"), crush = group("crush-spice");
  if (hasOil) {
    if (ancho.length) {
      add("fry-prepared-ancho", "bloom", [], "Stir the prepared ancho paste into the warm base. Fry gently for 1–2 minutes, stirring, until aromatic, before adding the sauce liquid.", 2);
      stages[stages.length - 1].ingredientReferences = ancho.map((entry) => entry.item.id);
    }
    if (pastes.length) add("fry-pastes", "bloom", pastes, `Stir in ${list(pastes)}${pastes.some((entry) => bareId(entry.item.id) === "fermented-black-beans") ? "; rinse and finely chop the fermented black beans first" : ""}. Fry gently in the existing oil for 1–2 minutes, stirring constantly, until aromatic; lower the heat if it catches. Cook the paste before adding the liquid.`, 2);
    if (crush.length) add("bloom-crushed-spices", "bloom", crush, `Crush or grind ${list(crush)} finely, then stir into the warm base for 15–20 seconds just until fragrant; do not scorch.`, 0.5);
    if (ground.length) {
      const wholeDriedChillies = ground.some((entry) => wholeDriedChilli(entry.item));
      const implicitPowders = ground.filter((entry) => ["star-anise", "ceylon-cinnamon", "dried-ginger"].includes(bareId(entry.item.id)) && !powderedName(entry.item.name));
      add("bloom-ground-spices", "bloom", ground, `${wholeDriedChillies ? "Stem and break the whole dried chillies into small pieces first. " : ""}${implicitPowders.map((entry) => `Use the measured ${entry.item.name.toLowerCase()} in ground form. `).join("")}Lower the heat. Stir in ${list(ground)} for 15–20 seconds just until fragrant, then add the liquid promptly so the ${wholeDriedChillies ? "spices and dried chillies" : "ground spices"} do not scorch.`, 0.5);
    }
  }
  const saffron = group("saffron");
  const liquid = group("liquid");
  const noOilWet = hasOil ? [] : group("whole-seeds", "curry-leaf", "onion", "aromatic", "fry-paste", "ground-spice", "crush-spice");
  const woody = group("woody-infusion"), simmerHerbs = group("simmer-herb"), wet = group("wet-condiment", "gentle-default");
  const needsMoisture = [...noOilWet, ...woody, ...simmerHerbs, ...wet, ...saffron, ...pastes, ...ground, ...crush, ...ancho, ...group("delicate-paste", "tahini", "dairy"), ...(!hasOil ? annatto : [])].length > 0;
  if (liquid.length) add("add-liquid", "liquid", liquid, `Pour in ${list(liquid)} and stir, scraping the base of the pan. Bring to a gentle simmer.`);
  else if (needsMoisture) add("add-water", "liquid", [], `Add ${Number((30 * input.servings / 4).toFixed(4))} ml water to keep this small sauce moist; do not dry-fry the condiments. Bring to a gentle simmer, adding a little more hot water if the base starts to dry out.`);
  if (saffron.length) add("soak-saffron", "liquid", saffron, `Spoon a little of the hot cooking liquid into a cup and soak ${list(saffron)} in it for 5 minutes. Return all the saffron and borrowed liquid to the pan; this uses the liquid already listed, not a second portion.`, 5);
  if (!hasOil && annatto.length) add("infuse-annatto-water", "simmer", annatto, `Simmer ${list(annatto)} in the liquid for 4–5 minutes, until coloured, then strain out and discard the annatto seeds. Return all the coloured liquid to the pan.`, 5, annatto.map((entry) => entry.item.id));
  if (!hasOil && ancho.length) {
    add("simmer-prepared-ancho", "simmer", [], "Stir the prepared ancho paste into the sauce liquid. Simmer gently for 2–3 minutes until evenly combined.", 3);
    stages[stages.length - 1].ingredientReferences = ancho.map((entry) => entry.item.id);
  }
  if (noOilWet.length) add("gentle-no-oil", "simmer", noOilWet, `${noOilWet.some((entry) => wholeDriedChilli(entry.item)) ? "Stem and break the whole dried chillies into small pieces first. " : ""}Add ${list(noOilWet)} to the liquid; finely chop firm fresh aromatics, crush any whole seeds and finely grind any whole pepper husks or berries${noOilWet.some((entry) => bareId(entry.item.id) === "fermented-black-beans") ? "; rinse the fermented black beans first" : ""}. Simmer gently for 4–5 minutes, stirring, until softened and cooked through. Add hot water as needed to keep the base moist. This is a wet method because no frying oil was allocated.`, 5);
  const woodyPrep = woody.map((entry) => {
    switch (bareId(entry.item.id)) {
      case "lemongrass": return "Bruise the whole lemongrass";
      case "kaffir-lime-leaves": return "Tear and bruise the makrut lime leaves";
      case "pandan": return "Knot the pandan leaf";
      case "dried-lime": return "Pierce the dried limes";
      case "galangal": return "Keep the galangal slices intact enough to retrieve";
      default: return "Leave the whole aromatic pieces intact so they can be lifted out";
    }
  });
  if (woody.length) add("infuse-woody", "simmer", woody, `Add ${list(woody)}. ${[...new Set(woodyPrep)].join(". ")}. Infuse at a gentle simmer for at least 5 minutes, leaving them in during the main's simmer when applicable.`, 5);
  if (simmerHerbs.length) add("simmer-herbs", "simmer", simmerHerbs, `Stir in ${list(simmerHerbs)}. Simmer gently in the liquid for 2–3 minutes, stirring until evenly dispersed.`, 3);
  if (wet.length) add("dissolve-condiments", "simmer", wet, `Stir in ${list(wet)} only after liquid is present. Dissolve over low heat for 1–2 minutes, stirring; keep sweet or salty condiments away from a dry, very hot pan.`, 2);
  const beforeFinish = input.separateSauce ? "Once the sauce base is ready" : "Once the main has reached its cooking endpoint";
  if (woody.length) add("remove-infusions", "remove", [], `${input.separateSauce ? "After the sauce has simmered" : "After the main has reached its cooking endpoint"}, lift out and discard the woody pieces of ${woody.map((entry) => entry.item.name.toLowerCase()).join(", ")} before the final garnishes; do not eat these whole aromatic pieces.`, undefined, woody.map((entry) => entry.item.id));
  const dairy = group("dairy");
  if (dairy.length) add("warm-dairy", "finish", dairy, `${beforeFinish}, lower the heat. Whisk ${list(dairy)} with a spoonful of the warm cooked sauce, then stir it all back in. Warm gently without a hard boil, then take off the heat before any citrus or vinegar.`, 1);
  const delicate = group("delicate-paste");
  if (delicate.length) add("delicate-pastes", "finish", delicate, `${beforeFinish}, take the pan off the heat. Loosen ${list(delicate)} with a spoonful of the warm cooked sauce, then stir it all back in. Keep this sauce gentle rather than bringing it back to a hard boil, to retain the delicate aroma.`, 1);
  const tahini = group("tahini");
  if (tahini.length) add("loosen-tahini", "finish", tahini, `Off the heat, whisk ${list(tahini)} with a little warm water until smooth and pourable, then stir the whole mixture into the cooked sauce.`, 1);
  const acid = group("acid-finish");
  if (acid.length) add("finish-acids", "finish", acid, `Off the heat, add ${list(acid)} gradually.${acid.some((entry) => /\b(lemon|lime|orange)\b/i.test(entry.item.name) && !/juice|vinegar/i.test(entry.item.name) && ["", "each"].includes(entry.item.unit)) ? " Wash, zest and juice the listed whole citrus; use the juice and zest to finish, keeping seeds out." : ""} Fold through the cooked sauce and taste before adding extra seasoning.`, 0.5);
  const dry = group("dry-finish").filter((entry) => !rawSesame.includes(entry));
  if (dry.length) add("finish-dry", "finish", dry, `Off the heat, stir in or scatter over ${list(dry)}.${dry.some((entry) => /leaves|mint|methi/i.test(entry.item.name)) ? " Crush dried leaves between your fingers." : ""}${dry.some((entry) => bareId(entry.item.id) === "peanuts") ? " Chop the roasted nuts." : ""}`, 0.5);
  if (rawSesame.length) {
    add("finish-toasted-sesame", "finish", [], "Off the heat, scatter over the already toasted, reserved sesame seeds. Use the same measured portion prepared earlier; do not toast a second batch.", 0.5);
    stages[stages.length - 1].ingredientReferences = rawSesame.map((entry) => entry.item.id);
  }
  const fresh = group("fresh-finish");
  if (fresh.length) add("finish-fresh", "finish", fresh, `Off the heat, fold in ${list(fresh)}.${fresh.some((entry) => entry.item.category === "produce") ? " Wash and finely chop the fresh produce first." : ""}${fresh.some((entry) => bareId(entry.item.id) === "kaffir-lime-leaves") ? " For edible makrut lime leaf threads, remove the tough centre ribs and slice the leaves extremely finely." : ""}${fresh.some((entry) => bareId(entry.item.id) === "sesame-oil" || /toasted sesame oil/i.test(entry.item.name)) ? " Add the toasted sesame oil only as a finishing seasoning, not as frying oil." : ""}`, 0.5);
  const text = (phase: RegionalCookingPhase) => stages.filter((stage) => stage.phase === phase).map((stage) => stage.detail).join(" ");
  const minutes = (phases: RegionalCookingPhase[]) => stages.filter((stage) => phases.includes(stage.phase)).reduce((sum, stage) => sum + (stage.minutes ?? 0), 0);
  const heatOil = text("heat"), temper = text("temper"), soften = text("soften"), bloom = text("bloom");
  return {
    stages, allocations: stages.flatMap((stage) => stage.ingredients), prepare: text("prepare"), heatOil, temper, soften, bloom,
    addLiquid: text("liquid"), simmer: text("simmer"), remove: text("remove"), finish: text("finish"),
    start: [text("prepare"), heatOil, temper, soften, bloom].filter(Boolean).join(" "),
    beforeLiquidMinutes: minutes(["prepare", "heat", "temper", "soften", "bloom"]), simmerMinutes: minutes(["liquid", "simmer"]),
    finishMinutes: minutes(["remove", "finish"]), totalMinutes: minutes(["prepare", "heat", "temper", "soften", "bloom", "liquid", "simmer", "remove", "finish"]),
    equipment: [
      ...(annatto.length ? ["Fine sieve"] : []),
      ...(woody.length ? ["Slotted spoon"] : []),
      ...(saffron.length ? ["Small heatproof cup"] : []),
      ...(crush.length ? ["Mortar and pestle or spice grinder"] : []),
      ...(delicate.length || dairy.length || tahini.length ? ["Small mixing bowl"] : []),
      ...(ancho.length ? ["Heatproof bowl", "Blender or mini food processor"] : []),
      ...(rawSesame.length ? ["Dry frying pan", "Small bowl"] : []),
    ],
  };
}
