/**
 * Strong cultural markers and SAT fusion options stay inside their cuisine families.
 * Diversity sampling and side preferences must not cross-pollinate these.
 */

/** Ingredient / side ids that are culturally loud. */
export const STRONG_MARKERS = [
  "kimchi",
  "gochujang",
  "gochugaru",
  "miso",
  "white-miso",
  "sriracha",
  "fish-sauce",
  "kecap-manis",
  "doubanjiang",
  "duo-jiao",
  "yuzu-kosho",
  "sansho",
  "shichimi",
  "red-curry-paste",
  "green-curry-paste",
  "massaman-curry-paste",
  "panang-curry-paste",
  "yellow-curry-paste",
  "sambal-oelek",
  "harissa",
  "berbere",
  "aji-amarillo",
] as const;

export type StrongMarker = (typeof STRONG_MARKERS)[number];

/** Regions (and close variants) allowed to carry each marker. */
export const MARKER_REGIONS: Readonly<Record<StrongMarker, readonly string[]>> = {
  kimchi: ["korean"],
  gochujang: ["korean"],
  gochugaru: ["korean"],
  miso: ["japanese", "japanese-curry"],
  "white-miso": ["japanese", "japanese-curry"],
  sriracha: [
    "thai", "thai-green", "thai-massaman", "thai-panang", "thai-yellow", "isaan",
    "vietnamese", "lao", "cambodian", "malaysian", "indonesian", "peranakan", "filipino", "burmese", "balinese", "maluku",
  ],
  "fish-sauce": [
    "thai", "thai-green", "thai-massaman", "thai-panang", "thai-yellow", "isaan",
    "vietnamese", "lao", "cambodian", "filipino",
  ],
  "kecap-manis": ["indonesian", "malaysian", "balinese", "maluku", "peranakan"],
  doubanjiang: ["sichuan", "chinese", "hunan"],
  "duo-jiao": ["hunan", "chinese"],
  "yuzu-kosho": ["japanese", "japanese-curry"],
  sansho: ["japanese", "japanese-curry"],
  shichimi: ["japanese", "japanese-curry"],
  "red-curry-paste": ["thai", "thai-green", "thai-massaman", "thai-panang", "thai-yellow", "isaan", "cambodian", "lao"],
  "green-curry-paste": ["thai", "thai-green", "thai-massaman", "thai-panang", "thai-yellow", "isaan"],
  "massaman-curry-paste": ["thai", "thai-massaman"],
  "panang-curry-paste": ["thai", "thai-panang"],
  "yellow-curry-paste": ["thai", "thai-yellow"],
  "sambal-oelek": ["indonesian", "malaysian", "balinese", "maluku", "peranakan"],
  harissa: ["moroccan", "tunisian"],
  berbere: ["ethiopian"],
  "aji-amarillo": ["peruvian"],
};

/** SAT option ids that are culturally loud. */
export type FusionOptionId =
  | "heat_sriracha"
  | "heat_birds"
  | "heat_both"
  | "umami_oyster"
  | "umami_soy"
  | "umami_fish"
  | "umami_miso"
  | "aroma_lemongrass"
  | "aroma_cumin";

const EAST_ASIAN = [
  "japanese", "japanese-curry", "korean", "chinese", "cantonese", "sichuan", "hunan",
  "taiwanese", "xinjiang", "shanghainese", "yunnan",
] as const;

const SE_ASIAN = [
  "thai", "thai-green", "thai-massaman", "thai-panang", "thai-yellow", "isaan",
  "vietnamese", "lao", "cambodian", "malaysian", "indonesian", "peranakan",
  "filipino", "burmese", "balinese", "maluku",
] as const;

const CHINESE_FAMILY = [
  "chinese", "cantonese", "sichuan", "hunan", "taiwanese", "xinjiang", "shanghainese", "yunnan",
] as const;

const JAPANESE_FAMILY = ["japanese", "japanese-curry"] as const;

const INDIAN_FAMILY = [
  "indian", "indian-madras", "indian-vindaloo", "indian-korma", "south-indian", "goan",
  "bengali", "chettinad", "hyderabadi", "kashmiri", "sri-lankan", "pakistani", "gujarati", "nepali",
] as const;

const CUMIN_OK = [
  ...INDIAN_FAMILY,
  "mexican", "oaxacan", "yucatecan", "cuban", "puerto-rican",
  "levantine", "syrian", "turkish", "persian", "moroccan", "tunisian", "afghan",
  "yemeni", "somali", "ethiopian", "chilean", "peruvian", "cajun", "creole",
] as const;

/** Which regions may select each SAT fusion option. */
export const FUSION_OPTION_REGIONS: Readonly<Record<FusionOptionId, readonly string[]>> = {
  heat_sriracha: SE_ASIAN,
  heat_birds: SE_ASIAN,
  heat_both: SE_ASIAN,
  umami_oyster: CHINESE_FAMILY,
  umami_soy: EAST_ASIAN,
  umami_fish: ["thai", "thai-green", "thai-massaman", "thai-panang", "thai-yellow", "isaan", "vietnamese", "lao", "cambodian", "filipino"],
  umami_miso: JAPANESE_FAMILY,
  aroma_lemongrass: SE_ASIAN,
  aroma_cumin: CUMIN_OK,
};

/** Sides whose regionHints must stay on these regions only. */
export const SIDE_MARKER_REGIONS: Readonly<Record<string, readonly string[]>> = {
  "kimchi-rice": ["korean"],
  "miso-aubergine-rice": ["japanese", "japanese-curry"],
  "soba-greens": ["japanese", "japanese-curry"],
};

export function regionAllowsMarker(regionId: string, markerId: string): boolean {
  const allowed = MARKER_REGIONS[markerId as StrongMarker];
  if (!allowed) return true;
  return allowed.includes(regionId);
}

export function regionAllowsFusionOption(regionId: string, optionId: string): boolean {
  const allowed = FUSION_OPTION_REGIONS[optionId as FusionOptionId];
  if (!allowed) return true;
  return allowed.includes(regionId);
}

export function isStrongMarkerId(id: string): boolean {
  const bare = id.startsWith("sat-") ? id.slice(4) : id;
  return (STRONG_MARKERS as readonly string[]).includes(bare) || bare === "kimchi";
}

/** True when an ingredient id/name pair is a strong marker for a different region. */
export function markerLeak(regionId: string, ingredientId: string, ingredientName = ""): string | null {
  const bare = ingredientId.startsWith("sat-") ? ingredientId.slice(4) : ingredientId;
  const candidates = new Set<string>([bare]);
  const lower = ingredientName.toLocaleLowerCase("en");
  if (lower.includes("kimchi")) candidates.add("kimchi");
  if (lower.includes("sriracha")) candidates.add("sriracha");
  if (lower.includes("fish sauce")) candidates.add("fish-sauce");
  if (lower.includes("gochujang")) candidates.add("gochujang");
  if (lower.includes("gochugaru")) candidates.add("gochugaru");
  if (/\bmiso\b/.test(lower)) candidates.add("miso");
  if (lower.includes("kecap")) candidates.add("kecap-manis");
  for (const marker of candidates) {
    if (!regionAllowsMarker(regionId, marker) && (STRONG_MARKERS as readonly string[]).includes(marker)) {
      return marker;
    }
    if (marker === "kimchi" && !regionAllowsMarker(regionId, "kimchi")) return "kimchi";
  }
  return null;
}
