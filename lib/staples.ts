import type { IngredientCategory } from "./recipe-types.ts";
import type { DraftIngredient } from "./template-types.ts";
import { MEAL_STAPLE_FAMILY } from "./region-pantry.ts";

/**
 * Authored staple foods for every Fusion Table region.
 * A staple already on the plate is not added again. Generic rice is renamed to the
 * regional rice instead of a second rice. These are template ingredients, not a
 * kitchen-tested traditional dish and not a packet check.
 */

export interface StapleOptions {
  glutenFree: boolean;
  dairyFree: boolean;
}

const RICE_IDS = new Set(["rice", "bbq-rice", "jasmine-rice", "basmati-rice", "short-grain-rice", "medium-grain-rice", "long-grain-rice", "mexican-rice", "brazilian-rice", "risotto-rice", "sticky-rice", "samba-rice"]);
const GENERIC_RICE_IDS = new Set(["rice", "bbq-rice"]);
const BREAD_IDS = new Set(["bread", "flatbread", "flatbreads", "burger-bun", "burger-buns", "bbq-buns", "bbq-flatbread", "chapati", "staple-bread", "staple-flatbread"]);
const NOODLE_IDS = new Set(["noodles", "staple-noodles", "rice-vermicelli"]);
const GRAIN_SWAP_IDS = new Set(["couscous", "quinoa"]);

export function canonAllergen(name: string): string {
  const value = name.trim().toLowerCase();
  if (value === "tree nuts" || value === "tree nut" || value === "tree-nuts") return "tree-nut";
  if (value === "crustaceans") return "crustacean";
  if (value === "peanuts") return "peanut";
  if (value === "sulphite") return "sulphites";
  return value;
}

function item(id: string, name: string, amount: number, unit: string, category: IngredientCategory, allergens: string[] = [], notes?: string, aliases?: string[]): DraftIngredient {
  return { id, name, amount, unit, category, allergens, ...(notes ? { notes } : {}), ...(aliases ? { aliases } : {}) };
}

const rice = (id: string, name: string, aliases: string[]) => item(id, name, 200, "g", "grocery", [], "Dry weight. Rinse, then simmer as the packet directs.", aliases);
const beans = (id: string, name: string, aliases: string[]) => item(id, name, 400, "g", "grocery", [], "Already cooked, drained weight. Canned is fine. Do not start from dry beans in this step.", aliases);
const potatoes = () => item("potatoes", "Potatoes", 600, "g", "produce", [], "Peel if you prefer, cut into even chunks, and simmer until tender.", ["potato"]);
const chickpeas = () => beans("chickpeas", "Cooked chickpeas", ["chickpeas", "garbanzo beans"]);

function bread(options: StapleOptions, wheatName: string): DraftIngredient {
  if (options.glutenFree) {
    return item("staple-bread", "Gluten-free plain bread", 4, "", "grocery", [], "A loaf or rolls explicitly labelled gluten-free. Not a branded sauce. Check the packet.", ["gluten-free plain bread", "gluten free bread"]);
  }
  const name = options.dairyFree ? `Dairy-free ${wheatName.charAt(0).toLowerCase()}${wheatName.slice(1)}` : wheatName;
  return item("staple-bread", name, 4, "", "grocery", ["wheat"], "A plain loaf or rolls, not a branded sauce. Check the packet for wheat and for milk.", ["plain bread", "white bread"]);
}

function flatbread(options: StapleOptions, wheatName: string): DraftIngredient {
  if (options.glutenFree) {
    return item("staple-flatbread", "Gluten-free plain flatbread", 4, "", "grocery", [], "Explicitly labelled gluten-free. This replaces wheat chapati, pita, or pide. Check the packet.", ["gluten-free flatbread", "gluten free flatbread"]);
  }
  return item("staple-flatbread", wheatName, 4, "", "grocery", ["wheat"], "Wheat flatbread. The gluten-free template uses a labelled gluten-free flatbread instead. Check the packet.", [wheatName.toLowerCase()]);
}

function noodles(options: StapleOptions, wheatName: string): DraftIngredient {
  if (options.glutenFree) {
    return item("staple-noodles", "Gluten-free rice noodles", 150, "g", "grocery", [], "Dry weight. Explicitly labelled gluten-free. Soak or boil as the packet directs.", ["rice noodles", "gluten-free rice noodles"]);
  }
  return item("staple-noodles", wheatName, 150, "g", "grocery", ["wheat"], "Dry weight. Plain wheat noodles with no egg in this template. Check the packet for egg and for milk.", ["wheat noodles", "plain wheat noodles"]);
}

/** 100% teff is the named product. Mixed injera is not silently called gluten-free. */
function injera(): DraftIngredient {
  return item(
    "injera",
    "100% teff injera",
    4,
    "",
    "specialty",
    [],
    "Many injera mixes include wheat or barley. This template means a packet labelled 100% teff. It does not add a wheat tag, and that is not a packet test.",
    ["teff injera", "100% teff injera", "injera"],
  );
}

const REGIONAL: Record<string, (options: StapleOptions) => DraftIngredient[]> = {
  japanese: () => [rice("short-grain-rice", "Japanese short-grain rice", ["short-grain rice", "sushi rice", "koshihikari"])],
  "japanese-yakitori": () => REGIONAL.japanese({ glutenFree: false, dairyFree: false }),
  korean: () => [rice("short-grain-rice", "Korean short-grain rice", ["short-grain rice"])],
  "korean-bbq": () => REGIONAL.korean({ glutenFree: false, dairyFree: false }),
  thai: () => [rice("jasmine-rice", "Jasmine rice", ["jasmine rice", "thai fragrant rice"])],
  vietnamese: () => [
    rice("jasmine-rice", "Jasmine rice", ["jasmine rice"]),
    item("rice-vermicelli", "Rice vermicelli", 150, "g", "grocery", [], "Dry weight. Rice noodles, not wheat noodles. Check the packet if you need a labelled gluten-free product.", ["rice vermicelli", "rice noodles"]),
  ],
  "vietnamese-grill": () => REGIONAL.vietnamese({ glutenFree: false, dairyFree: false }),
  chinese: (options) => [rice("jasmine-rice", "Jasmine rice", ["jasmine rice"]), noodles(options, "Plain wheat noodles")],
  "cantonese-char-siu": (options) => REGIONAL.chinese(options),
  indonesian: () => [rice("jasmine-rice", "Jasmine rice", ["jasmine rice"])],
  malaysian: () => [rice("jasmine-rice", "Jasmine rice", ["jasmine rice"])],
  mexican: () => [
    item("corn-tortillas", "Corn tortillas", 8, "", "grocery", [], "Maize tortillas. Warm in a dry pan. Check the packet if you need a labelled gluten-free product.", ["corn tortilla", "maize tortillas"]),
    rice("mexican-rice", "Mexican-style long-grain rice", ["long-grain rice", "white rice"]),
    beans("pinto-beans", "Cooked pinto beans", ["pinto beans", "frijoles"]),
  ],
  "mexican-al-pastor": (options) => REGIONAL.mexican(options),
  indian: (options) => [
    rice("basmati-rice", "Basmati rice", ["basmati", "basmati rice"]),
    flatbread(options, "Chapati"),
  ],
  "indian-tandoor": (options) => REGIONAL.indian(options),
  levantine: (options) => [
    flatbread(options, "Pita"),
    chickpeas(),
    ...(options.glutenFree ? [] : [item("burghul", "Fine burghul (bulgur)", 160, "g", "grocery", ["wheat"], "Wheat burghul. The gluten-free template leaves it out rather than renaming another grain. Check the packet.", ["bulgur", "burghul", "bulghur"])]),
  ],
  greek: (options) => [flatbread(options, "Pita"), potatoes()],
  "greek-souvlaki": (options) => REGIONAL.greek(options),
  turkish: (options) => [flatbread(options, "Turkish flatbread"), rice("medium-grain-rice", "Medium-grain rice", ["baldo rice", "medium grain rice"]), chickpeas()],
  "turkish-mangal": (options) => REGIONAL.turkish(options),
  moroccan: (options) => [
    options.glutenFree
      ? item("quinoa", "Quinoa", 200, "g", "grocery", [], "Dry weight. Replaces couscous on the gluten-free template. Simmer as the packet directs.", ["quinoa"])
      : item("couscous", "Couscous", 200, "g", "grocery", ["wheat"], "Dry weight. Wheat couscous. The gluten-free template uses quinoa and its own method. Check the packet.", ["couscous"]),
    chickpeas(),
  ],
  "moroccan-mechoui": (options) => REGIONAL.moroccan(options),
  italian: (options) => [
    bread(options, "Crusty white bread"),
    item("polenta", "Plain polenta", 160, "g", "grocery", [], "Plain maize polenta, not a wheat mix. Whisk into simmering water as the packet directs. Check the packet.", ["polenta", "maize polenta"]),
  ],
  spanish: (options) => [potatoes(), bread(options, "Crusty white bread")],
  "spanish-plancha": (options) => REGIONAL.spanish(options),
  french: (options) => [bread(options, "Plain wheat bread"), potatoes()],
  caribbean: () => [rice("long-grain-rice", "Long-grain rice", ["long grain rice", "white rice"]), beans("kidney-beans", "Cooked red kidney beans", ["kidney beans", "red beans"])],
  "jamaican-jerk": () => [
    rice("long-grain-rice", "Long-grain rice", ["long grain rice", "white rice"]),
    beans("kidney-beans", "Cooked red kidney beans", ["kidney beans", "red beans", "rice and peas"]),
  ],
  peruvian: () => [potatoes(), rice("long-grain-rice", "Long-grain white rice", ["white rice", "long grain rice"])],
  ethiopian: () => [injera(), beans("brown-lentils", "Cooked brown lentils", ["brown lentils", "lentils", "misir"])],
  brazilian: () => [
    rice("brazilian-rice", "Brazilian long-grain white rice", ["white rice", "arroz"]),
    beans("black-beans", "Cooked black beans", ["black beans", "feijao"]),
    item("farofa", "Cassava flour (farofa)", 80, "g", "grocery", [], "Plain cassava flour, not wheat flour. Toast in a dry pan until lightly golden. Check the packet.", ["farofa", "cassava flour", "manioc flour"]),
  ],
  "texas-bbq": (options) => [potatoes(), bread(options, "Plain wheat bread")],
  "carolina-bbq": (options) => [potatoes(), bread(options, "Plain wheat bread")],
  "kansas-city-bbq": (options) => [potatoes(), bread(options, "Plain wheat bread")],
  "argentine-asado": (options) => [bread(options, "Crusty white bread"), potatoes()],
  "south-african-braai": (options) => [
    item("maize-meal", "Maize meal (pap)", 200, "g", "grocery", [], "Plain maize meal for soft pap, not a wheat bread mix. Whisk into simmering water until thick, as the packet directs. Check the packet.", ["pap", "maize meal", "mealie meal"]),
    bread(options, "Plain wheat bread"),
  ],
  sticky: () => [rice("sticky-rice", "Thai sticky rice", ["sticky rice", "glutinous rice", "sweet rice"])],
  samba: () => [rice("samba-rice", "Sri Lankan samba rice", ["samba rice"])],
  basmati: () => [rice("basmati-rice", "Basmati rice", ["basmati", "basmati rice"])],
  "long-grain": () => [rice("long-grain-rice", "Long-grain rice", ["long grain rice", "white rice"])],
  "rice-beans": () => [
    rice("long-grain-rice", "Long-grain white rice", ["white rice", "long grain rice"]),
    beans("black-beans", "Cooked black beans", ["black beans"]),
  ],
};

for (const [regionId, family] of Object.entries(MEAL_STAPLE_FAMILY)) {
  if (REGIONAL[regionId]) continue;
  const build = REGIONAL[family];
  if (!build) throw new Error(`Missing staple family for ${regionId}: ${family}`);
  REGIONAL[regionId] = build;
}

export function staplesFor(regionId: string, options: StapleOptions): DraftIngredient[] {
  const build = REGIONAL[regionId];
  if (!build) return [];
  return build(options).map((staple) => ({ ...staple, allergens: [...staple.allergens] }));
}

export function coveredStapleRegions(): string[] {
  return Object.keys(REGIONAL);
}

export interface StapleApplication<T extends DraftIngredient> {
  ingredients: T[];
  /** Staples that were added, or a generic rice that was renamed. Already-present foods are not repeated. */
  served: DraftIngredient[];
}

function familySkip(stapleId: string, ids: Set<string>): boolean {
  if (RICE_IDS.has(stapleId) && [...ids].some((id) => RICE_IDS.has(id))) return true;
  if (BREAD_IDS.has(stapleId) && [...ids].some((id) => BREAD_IDS.has(id))) return true;
  if (NOODLE_IDS.has(stapleId) && [...ids].some((id) => NOODLE_IDS.has(id))) return true;
  if (GRAIN_SWAP_IDS.has(stapleId) && [...ids].some((id) => GRAIN_SWAP_IDS.has(id))) return true;
  if (stapleId === "potatoes" && ids.has("potatoes")) return true;
  if ((stapleId === "chickpeas" || stapleId === "brown-lentils") && ids.has(stapleId === "brown-lentils" ? "lentils" : stapleId)) return true;
  if (stapleId === "brown-lentils" && ids.has("brown-lentils")) return true;
  return false;
}

export function applyStaples<T extends DraftIngredient>(ingredients: readonly T[], regionId: string, options: StapleOptions): StapleApplication<T> {
  const staples = staplesFor(regionId, options);
  let next = ingredients.map((entry) => ({ ...entry, allergens: [...entry.allergens] })) as T[];
  const served: DraftIngredient[] = [];
  for (const staple of staples) {
    if (next.some((entry) => entry.id === staple.id)) continue;
    if (RICE_IDS.has(staple.id)) {
      const existingRice = next.filter((entry) => RICE_IDS.has(entry.id));
      const generic = existingRice.find((entry) => GENERIC_RICE_IDS.has(entry.id));
      const specific = existingRice.some((entry) => !GENERIC_RICE_IDS.has(entry.id));
      if (!specific && generic) {
        const aliases = [...new Set([...(staple.aliases ?? []), ...(generic.aliases ?? []), generic.name.toLowerCase(), "rice"])];
        const replaced = { ...staple, amount: generic.amount, unit: generic.unit, aliases } as T;
        next = next.map((entry) => (entry.id === generic.id ? replaced : entry));
        served.push(replaced);
        continue;
      }
    }
    if (options.glutenFree && staple.id === "quinoa") {
      const wheat = next.find((entry) => entry.id === "couscous");
      if (wheat) {
        const replaced = { ...staple, amount: wheat.amount, unit: wheat.unit } as T;
        next = next.map((entry) => (entry.id === "couscous" ? replaced : entry));
        served.push(replaced);
        continue;
      }
    }
    const ids = new Set(next.map((entry) => entry.id));
    if (familySkip(staple.id, ids)) continue;
    next = [...next, staple as T];
    served.push(staple);
  }
  return { ingredients: next, served };
}

export function stapleStep(served: readonly DraftIngredient[], dish: string): string {
  const names = served.map((entry) => entry.name).join(", ");
  const injera = served.some((entry) => entry.id === "injera")
    ? " Many injera mixes include wheat or barley. This template means a packet labelled 100% teff injera. It does not add a wheat tag, and that is not a packet test."
    : "";
  return `Serve ${names} with the ${dish}.${injera} Template staple, not a kitchen-tested traditional dish. Check the packet.`;
}
