/**
 * Seeded exploration of a region's culinary pantry.
 *
 * Unseeded plates stay on the authored RegionTaste lists (byte-stable).
 * With a seed, aromatics, simmer spices, herbs, acids and finishes are sampled
 * from the staple-family pool plus a small authored extra list. Signature heat
 * (and side/hot heat) stay fixed so the plate remains region-true.
 *
 * Soften ids (already heavy in the week) get a lower pick weight; they are not
 * banned, so intentional pantry reuse can still land.
 */

import { mix32 } from "./sat.ts";
import {
  PANTRY_ITEMS,
  REGION_TASTES,
  buildRegionProfile,
  type RegionTaste,
} from "./region-pantry.ts";
import { regionAllowsMarker, isStrongMarkerId } from "./region-affinity.ts";
import type { SpiceHeat } from "./recipe-types.ts";
import type { DraftIngredient } from "./template-types.ts";

export interface RegionProfileOptions {
  seed?: number;
  /** Ingredient ids already common this week; lower pick weight only. */
  soften?: readonly string[];
}

type Profile = ReturnType<typeof buildRegionProfile>;

type SlotPools = {
  aromatics: string[];
  simmer: string[];
  herbs: string[];
  finish: string[];
  acids: string[];
};

/** Culinary-true extras beyond sibling plates, keyed by staple family. */
const FAMILY_EXTRA: Readonly<Record<string, Partial<SlotPools>>> = {
  japanese: {
    aromatics: ["ginger", "shallot"],
    simmer: ["miso", "soy-sauce", "sansho", "shichimi"],
    herbs: ["spring-onion", "perilla"],
    finish: ["sesame-seeds", "sesame-oil"],
    acids: ["rice-vinegar"],
  },
  korean: {
    aromatics: ["ginger", "shallot"],
    simmer: ["soy-sauce", "gochugaru"],
    herbs: ["spring-onion", "perilla"],
    finish: ["sesame-seeds", "sesame-oil"],
    acids: ["rice-vinegar"],
  },
  thai: {
    aromatics: ["ginger", "galangal", "lemongrass", "kaffir-lime-leaves", "shallot"],
    simmer: ["turmeric", "ground-coriander", "palm-sugar", "cumin"],
    herbs: ["coriander", "thai-basil", "mint", "laksa-leaf"],
    finish: ["palm-sugar"],
    acids: ["lime-juice", "tamarind"],
  },
  sticky: {
    aromatics: ["lemongrass", "galangal"],
    simmer: ["palm-sugar", "ground-coriander"],
    herbs: ["coriander", "mint", "thai-basil"],
    acids: ["lime-juice", "tamarind"],
  },
  vietnamese: {
    aromatics: ["ginger", "lemongrass", "shallot"],
    simmer: ["soy-sauce", "five-spice"],
    herbs: ["mint", "coriander", "perilla", "thai-basil"],
    finish: ["sesame-oil"],
    acids: ["lime-juice", "rice-vinegar"],
  },
  chinese: {
    aromatics: ["ginger", "star-anise", "shallot"],
    simmer: ["soy-sauce", "five-spice", "sichuan-pepper", "fermented-black-beans", "palm-sugar"],
    herbs: ["spring-onion", "coriander", "thai-basil"],
    finish: ["sesame-oil", "sesame-seeds"],
    acids: ["rice-vinegar"],
  },
  indonesian: {
    aromatics: ["galangal", "lemongrass", "ginger"],
    simmer: ["kecap-manis", "turmeric", "ground-coriander"],
    herbs: ["coriander", "laksa-leaf"],
    acids: ["lime-juice", "tamarind"],
  },
  malaysian: {
    aromatics: ["galangal", "lemongrass", "ginger"],
    simmer: ["turmeric", "ground-coriander", "tamarind", "cumin"],
    herbs: ["coriander", "laksa-leaf"],
    acids: ["lime-juice", "tamarind"],
  },
  mexican: {
    aromatics: ["epazote"],
    simmer: ["cumin", "smoked-paprika", "mexican-oregano", "cinnamon", "cocoa", "annatto"],
    herbs: ["coriander", "epazote"],
    finish: ["sesame-seeds"],
    acids: ["lime-juice", "orange-juice"],
  },
  indian: {
    aromatics: ["ginger", "mustard-seeds", "curry-leaves"],
    simmer: ["cumin", "turmeric", "ground-coriander", "garam-masala", "cardamom", "cinnamon", "fenugreek", "fennel-seeds", "star-anise", "panch-phoron", "kasuri-methi"],
    herbs: ["coriander", "mint"],
    finish: ["kasuri-methi", "dried-mint"],
    acids: ["lemon-juice", "lime-juice", "tamarind", "vinegar"],
  },
  levantine: {
    aromatics: ["sumac"],
    simmer: ["cumin", "sumac", "allspice", "cinnamon", "dried-mint"],
    herbs: ["parsley", "mint", "coriander"],
    finish: ["zaatar", "dried-mint"],
    acids: ["lemon-juice"],
  },
  italian: {
    aromatics: ["bay-leaves", "fennel-seeds"],
    simmer: ["oregano", "fennel-seeds", "thyme", "bay-leaves"],
    herbs: ["basil", "parsley", "tarragon"],
    acids: ["lemon-juice", "red-wine-vinegar"],
  },
  moroccan: {
    aromatics: ["cinnamon"],
    simmer: ["cumin", "cinnamon", "ras-el-hanout", "ground-coriander", "paprika"],
    herbs: ["parsley", "coriander", "mint"],
    acids: ["lemon-juice"],
  },
  greek: {
    aromatics: ["oregano"],
    simmer: ["oregano", "thyme", "cumin"],
    herbs: ["dill", "parsley", "mint"],
    acids: ["lemon-juice"],
  },
  spanish: {
    aromatics: ["saffron", "bay-leaves"],
    simmer: ["smoked-paprika", "saffron", "paprika", "oregano"],
    herbs: ["parsley"],
    acids: ["sherry-vinegar", "lemon-juice"],
  },
  french: {
    aromatics: ["bay-leaves", "thyme"],
    simmer: ["dijon-mustard", "thyme", "tarragon"],
    herbs: ["parsley", "tarragon"],
    acids: ["lemon-juice", "red-wine-vinegar"],
  },
  caribbean: {
    aromatics: ["ginger", "allspice"],
    simmer: ["allspice", "thyme", "paprika", "nutmeg"],
    herbs: ["culantro", "coriander", "spring-onion"],
    acids: ["lime-juice", "orange-juice"],
  },
  "jamaican-jerk": {
    aromatics: ["ginger", "spring-onion", "allspice"],
    simmer: ["allspice", "thyme", "nutmeg", "cinnamon"],
    herbs: ["spring-onion", "coriander"],
    acids: ["lime-juice"],
  },
  peruvian: {
    aromatics: ["cumin"],
    simmer: ["cumin", "paprika", "oregano"],
    herbs: ["coriander", "huacatay"],
    acids: ["lime-juice"],
  },
  ethiopian: {
    aromatics: ["ginger", "fenugreek"],
    simmer: ["fenugreek", "cardamom", "cumin", "paprika"],
    herbs: ["parsley", "coriander"],
    acids: ["lemon-juice"],
  },
  brazilian: {
    aromatics: ["annatto"],
    simmer: ["paprika", "annatto", "cumin"],
    herbs: ["coriander", "parsley"],
    acids: ["lime-juice", "orange-juice"],
  },
  turkish: {
    aromatics: ["sumac"],
    simmer: ["paprika", "cumin", "sumac", "allspice"],
    herbs: ["parsley", "mint"],
    finish: ["dried-mint"],
    acids: ["lemon-juice"],
  },
  basmati: {
    aromatics: ["ginger", "cardamom"],
    simmer: ["cumin", "cardamom", "cinnamon", "advieh", "saffron", "hawaij", "xawaash"],
    herbs: ["mint", "coriander", "parsley"],
    finish: ["dried-mint"],
    acids: ["lemon-juice", "lime-juice"],
  },
  "long-grain": {
    aromatics: ["ginger", "bay-leaves"],
    simmer: ["paprika", "thyme", "oregano", "grains-of-paradise", "celery-seed", "onion-powder"],
    herbs: ["parsley", "coriander", "spring-onion"],
    acids: ["lemon-juice", "lime-juice"],
  },
  "rice-beans": {
    aromatics: ["bay-leaves", "annatto"],
    simmer: ["cumin", "oregano", "annatto", "paprika"],
    herbs: ["coriander", "parsley"],
    acids: ["lime-juice", "orange-juice"],
  },
  samba: {
    aromatics: ["ginger", "curry-leaves", "pandan", "lemongrass"],
    simmer: ["ceylon-cinnamon", "turmeric", "ground-coriander"],
    herbs: ["coriander"],
    acids: ["lime-juice", "tamarind"],
  },
  "argentine-asado": {
    aromatics: ["oregano"],
    simmer: ["oregano", "cumin", "paprika"],
    herbs: ["parsley"],
    acids: ["red-wine-vinegar", "lemon-juice"],
  },
};

const PANTRY_BY_ID = new Map(PANTRY_ITEMS.map((item) => [item.id, item]));
const REGION_BY_ID = new Map(REGION_TASTES.map((region) => [region.id, region]));

/** Appear on almost every authored plate — sample them, do not force them when alternatives exist. */
const UBIQUITOUS = new Set(["garlic"]);

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => PANTRY_BY_ID.has(id)))];
}

function allowForRegion(regionId: string, id: string): boolean {
  if (!isStrongMarkerId(id)) return true;
  return regionAllowsMarker(regionId, id);
}

function familyPools(region: RegionTaste): SlotPools {
  const siblings = REGION_TASTES.filter((entry) => entry.staple === region.staple);
  const aromatics: string[] = [];
  const simmer: string[] = [];
  const herbs: string[] = [];
  const finish: string[] = [];
  const acids: string[] = [];
  for (const sibling of siblings) {
    aromatics.push(...sibling.aromatics);
    simmer.push(...(sibling.simmer ?? []));
    herbs.push(...(sibling.herbs ?? []));
    finish.push(...(sibling.finish ?? []));
    acids.push(sibling.acid);
  }
  const extra = FAMILY_EXTRA[region.staple] ?? {};
  const keep = (ids: readonly string[]) => unique(ids).filter((id) => allowForRegion(region.id, id));
  return {
    aromatics: keep([...aromatics, ...(extra.aromatics ?? [])]),
    simmer: keep([...simmer, ...(extra.simmer ?? [])]),
    herbs: keep([...herbs, ...(extra.herbs ?? [])]),
    finish: keep([...finish, ...(extra.finish ?? [])]),
    acids: keep([...acids, ...(extra.acids ?? [])]),
  };
}

function scoreId(seed: number, salt: string, id: string, soften: ReadonlySet<string>): number {
  const base = mix32(seed, `${salt}\0${id}`) / 0xffffffff;
  return base - (soften.has(id) ? 0.42 : 0);
}

function pickN(
  ids: readonly string[],
  n: number,
  seed: number,
  salt: string,
  soften: ReadonlySet<string>,
): string[] {
  if (n <= 0 || ids.length === 0) return [];
  const ranked = ids
    .map((id) => ({ id, score: scoreId(seed, salt, id, soften) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return ranked.slice(0, Math.min(n, ranked.length)).map((entry) => entry.id);
}

function pickCount(seed: number, salt: string, min: number, max: number): number {
  if (max <= min) return min;
  const span = max - min + 1;
  return min + (mix32(seed, salt) % span);
}

function heatIds(region: RegionTaste, heatLevel: SpiceHeat): string[] {
  const ids = [region.heat];
  if (region.sideHeat) ids.push(region.sideHeat);
  if ((heatLevel === "hot" || heatLevel === "fiery") && region.hotOnly) ids.push(region.hotOnly);
  return ids;
}

function heatFactor(heatLevel: SpiceHeat): number {
  if (heatLevel === "gentle") return 0.1;
  if (heatLevel === "fiery") return 2.5;
  return { mild: 0.25, medium: 1, hot: 1.75 }[heatLevel];
}

function toDraft(id: string, glutenFree: boolean, heatLevel: SpiceHeat, region: RegionTaste): DraftIngredient {
  const item = PANTRY_BY_ID.get(id);
  if (!item) throw new Error(`Unknown pantry item: ${id}.`);
  const chosen = glutenFree && item.glutenFree ? item.glutenFree : item;
  const base = region.amounts?.[id] ?? item.amount;
  const factor = item.scalesWithHeat ? heatFactor(heatLevel) : 1;
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

/** Dominant flavour ids on a plate (for week anti-repetition). */
export function dominantFlavourIds(profile: Profile): string[] {
  return unique([
    ...profile.aromatics.map((item) => item.id),
    ...profile.seasonings.map((item) => item.id),
    ...profile.finish.map((item) => item.id),
  ]);
}

export function exploreRegionProfile(
  regionId: string,
  glutenFree: boolean,
  heatLevel: SpiceHeat,
  options?: RegionProfileOptions,
): Profile {
  const canonical = buildRegionProfile(regionId, glutenFree, heatLevel);
  if (options?.seed == null) return canonical;

  const region = REGION_BY_ID.get(regionId);
  if (!region) return canonical;

  const seed = options.seed;
  const soften = new Set(options.soften ?? []);
  const pools = familyPools(region);
  const heats = heatIds(region, heatLevel);
  const heatSet = new Set(heats);

  const aromaticPool = unique([...region.aromatics, ...pools.aromatics]);
  const aromaticTarget = pickCount(
    seed,
    "n-aro",
    1,
    Math.min(3, Math.max(1, aromaticPool.length)),
  );
  // Soften ubiquitous garlic when the family has other aromatics; do not ban it.
  const softAromatics = new Set(soften);
  if (aromaticPool.some((id) => !UBIQUITOUS.has(id))) {
    for (const id of UBIQUITOUS) softAromatics.add(id);
  }
  // Prefer a distinctive authored aromatic when the region lists one beyond garlic.
  const authoredDistinct = region.aromatics.filter((id) => !UBIQUITOUS.has(id));
  const keepAuthored = authoredDistinct.length > 0 && (mix32(seed, "keep-aro") % 100) < 55;
  const authoredPick = keepAuthored
    ? pickN(authoredDistinct, 1, seed, "core-aro", softAromatics)
    : [];
  const aromatics = unique([
    ...authoredPick,
    ...pickN(
      aromaticPool.filter((id) => !authoredPick.includes(id)),
      Math.max(0, aromaticTarget - authoredPick.length),
      seed,
      "aro",
      softAromatics,
    ),
  ]);
  if (aromatics.length === 0 && aromaticPool[0]) aromatics.push(aromaticPool[0]);

  const simmerPool = pools.simmer.filter((id) => !heatSet.has(id));
  const simmerCore = (region.simmer ?? []).filter((id) => !heatSet.has(id));
  const simmerMin = simmerCore.length === 0 ? 0 : 1;
  const simmerMax = Math.min(4, Math.max(simmerMin, simmerPool.length));
  const simmerTarget = pickCount(seed, "n-sim", simmerMin, simmerMax);
  const mustSimmer = simmerCore.length ? pickN(simmerCore, 1, seed, "core-sim", soften) : [];
  const simmer = unique([
    ...mustSimmer,
    ...pickN(
      simmerPool.filter((id) => !mustSimmer.includes(id)),
      Math.max(0, simmerTarget - mustSimmer.length),
      seed,
      "sim",
      soften,
    ),
  ]);

  const acid = pickN(unique([region.acid, ...pools.acids]), 1, seed, "acid", soften)[0] ?? region.acid;

  const herbTarget = pools.herbs.length === 0
    ? 0
    : pickCount(seed, "n-herb", 1, Math.min(2, pools.herbs.length));
  const herbs = pickN(pools.herbs, herbTarget, seed, "herb", soften);

  const finishTarget = pools.finish.length === 0
    ? 0
    : pickCount(seed, "n-fin", 0, Math.min(2, pools.finish.length));
  const finishExtras = pickN(pools.finish, finishTarget, seed, "fin", soften);

  try {
    return {
      sauce: region.sauce,
      aromatics: aromatics.map((id) => toDraft(id, glutenFree, heatLevel, region)),
      seasonings: [...simmer, ...heats].map((id) => toDraft(id, glutenFree, heatLevel, region)),
      finish: [acid, ...herbs, ...finishExtras].map((id) => toDraft(id, glutenFree, heatLevel, region)),
      body: region.body,
    };
  } catch {
    return canonical;
  }
}

/** Staple-family pantry size available for exploration (tests / reports). */
export function explorePoolSize(regionId: string): number {
  const region = REGION_BY_ID.get(regionId);
  if (!region) return 0;
  const pools = familyPools(region);
  return unique([
    ...pools.aromatics,
    ...pools.simmer,
    ...pools.herbs,
    ...pools.finish,
    ...pools.acids,
    region.heat,
    ...(region.sideHeat ? [region.sideHeat] : []),
  ]).length;
}

/** Ids that are region-true for this plate (pool ∪ signature heats). */
export function regionTrueIds(regionId: string): Set<string> {
  const region = REGION_BY_ID.get(regionId);
  if (!region) return new Set();
  const pools = familyPools(region);
  return new Set(unique([
    ...pools.aromatics,
    ...pools.simmer,
    ...pools.herbs,
    ...pools.finish,
    ...pools.acids,
    region.heat,
    ...(region.sideHeat ? [region.sideHeat] : []),
    ...(region.hotOnly ? [region.hotOnly] : []),
  ]));
}
