/** Broad discovery choices, using valid techniques and authored regional sides.
 * Side changes never inflate the number of distinct main dishes. */
import { MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SIDES } from "./meal-catalog.ts";
import { PLATES, type PlateSpec } from "./plates.ts";
import { preferredSidesForRegion, sideRegionHints } from "./side-plans.ts";
import { mainAllowsSmoke } from "./smoke-method.ts";

export const DISCOVER_HISTORY_LIMIT = 120;
export const DISCOVER_HISTORY_KEY = "fusion-table-discover-cores-v1";

/** The identity a visitor recognises as a new main dish; a side is not one. */
export function discoverCoreKey(plate: Pick<PlateSpec, "mainId" | "methodId" | "regionId">): string {
  return `${plate.mainId}|${plate.methodId}|${plate.regionId}`;
}

function hash(value: string): number {
  let out = 2166136261;
  for (const char of value) out = Math.imul(out ^ char.charCodeAt(0), 16777619);
  return out >>> 0;
}

const SIDE_DUPLICATES: Readonly<Record<string, RegExp>> = {
  chickpeas: /hummus|chickpea|falafel/, lentils: /lentil/,
  "butter-beans": /bean/, "black-beans": /bean/, "kidney-beans": /bean/,
  mushrooms: /mushroom/, aubergine: /aubergine|eggplant|baba/,
  cauliflower: /cauli/, pumpkin: /pumpkin/, "sweet-potato": /sweet-potato/,
  broccoli: /broccoli/,
};

function sideFor(plate: Omit<PlateSpec, "sideId">): string {
  const preferred = preferredSidesForRegion(plate.regionId);
  const alternatives = preferred.filter(id => !SIDE_DUPLICATES[plate.mainId]?.test(id));
  const sides = alternatives.length ? alternatives : preferred;
  return sides[hash(discoverCoreKey(plate)) % sides.length];
}

function buildDiscoverPool(): readonly PlateSpec[] {
  const entries = new Map<string, PlateSpec>();
  const add = (plate: PlateSpec) => {
    const key = discoverCoreKey(plate);
    if (!entries.has(key)) entries.set(key, Object.freeze({ ...plate }));
  };
  for (const plate of PLATES) add(SIDE_DUPLICATES[plate.mainId]?.test(plate.sideId) ? { ...plate, sideId: sideFor(plate) } : plate);
  const pairs = MAIN_INGREDIENTS.flatMap(main => main.methodIds
    .filter(methodId => methodId !== "smoked" || mainAllowsSmoke(main.id))
    .map(methodId => ({ mainId: main.id, methodId })));
  // Six different regional profiles for each compatible main/technique pair.
  // Coprime strides spread the choices across the whole regional catalogue.
  for (const [index, pair] of pairs.entries()) {
    for (let variant = 0; variant < 6; variant++) {
      const regionId = MEAL_REGIONS[(index * 17 + variant * 13) % MEAL_REGIONS.length].id;
      const core = { ...pair, regionId };
      add({ ...core, sideId: sideFor(core) });
    }
  }
  // Include every authored accompaniment, without adding a side-only duplicate.
  const represented = new Set([...entries.values()].map(plate => plate.sideId));
  for (const [index, side] of MEAL_SIDES.entries()) {
    if (represented.has(side.id)) continue;
    const regions = sideRegionHints(side.id).filter(id => MEAL_REGIONS.some(region => region.id === id));
    const regionId = regions[hash(side.id) % regions.length] ?? MEAL_REGIONS[index % MEAL_REGIONS.length].id;
    for (let offset = 0; offset < pairs.length; offset++) {
      const pair = pairs[(index * 19 + offset) % pairs.length];
      const core = { ...pair, regionId };
      if (entries.has(discoverCoreKey(core)) || SIDE_DUPLICATES[pair.mainId]?.test(side.id)) continue;
      add({ ...core, sideId: side.id });
      represented.add(side.id);
      break;
    }
  }
  return Object.freeze([...entries.values()]);
}

export const DISCOVER_PLATES = buildDiscoverPool();
const CORE_KEYS = new Set(DISCOVER_PLATES.map(discoverCoreKey));
export const DISCOVER_POOL_STATS = Object.freeze({
  previousCores: new Set(PLATES.map(discoverCoreKey)).size,
  cores: DISCOVER_PLATES.length,
  mains: new Set(DISCOVER_PLATES.map(plate => plate.mainId)).size,
  methods: new Set(DISCOVER_PLATES.map(plate => plate.methodId)).size,
  regions: new Set(DISCOVER_PLATES.map(plate => plate.regionId)).size,
  sides: new Set(DISCOVER_PLATES.map(plate => plate.sideId)).size,
});

export function readDiscoverHistory(raw: string | null): string[] {
  if (!raw || raw.length > 20_000) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((key): key is string => typeof key === "string" && CORE_KEYS.has(key)))].slice(-DISCOVER_HISTORY_LIMIT);
  } catch { return []; }
}

export function rememberDiscoverCores(previous: readonly string[], plates: readonly PlateSpec[]): string[] {
  const fresh = plates.map(discoverCoreKey);
  const freshSet = new Set(fresh);
  return [...previous.filter(key => CORE_KEYS.has(key) && !freshSet.has(key)), ...fresh].slice(-DISCOVER_HISTORY_LIMIT);
}
