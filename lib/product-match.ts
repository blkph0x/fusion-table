/**
 * Match a shopping name to catalogue titles that use different words.
 * A conflicting cut or breed is not selected. Unknown and out-of-stock rows are not selected.
 * A missing price stays null and is never treated as zero.
 */

import { MEAT_CUTS } from "./cuts.ts";
import { foldFoodWord } from "./food-words.ts";

export type StockFlag = "IN_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";

export interface CatalogueProduct {
  name: string;
  priceCents: number | null;
  packageSize: string | null;
  stockcode: string | null;
  inStock: boolean | null;
  available: boolean | null;
  url?: string | null;
  /** Optional retailer department/category labels; never dietary certification. */
  categories?: readonly string[];
  /** Explicit product label claims if supplied; not an allergy-safety guarantee. */
  dietaryClaims?: readonly string[];
  /** Explicit retailer preparation evidence, independent of pack weight or title. */
  preparedForm?: "cooked-rice";
}

export interface ProductMatch {
  name: string;
  priceCents: number | null;
  packageSize: string | null;
  stock: StockFlag;
  url: string | null;
  score: number;
  /** Matching catalogue candidate with the requested wording, known stock and price; verify the packet. */
  selected: boolean;
  /** May be chosen after review; requested explicit dietary claims must still be established. */
  reviewable?: boolean;
  preparedForm?: "cooked-rice";
  reason: string;
}

const STOP = new Set([
  "woolworths", "coles", "aldi", "rspca", "approved", "fresh", "australian", "the", "and", "with",
  "per", "kg", "each", "approx", "selected", "product", "free", "range", "macro",
]);

const PROTEINS = ["chicken", "turkey", "beef", "lamb", "pork", "prawn", "salmon", "tofu"] as const;

/** Drop obvious non-food listings without treating a matching title as dietary evidence. */
export function isNonFoodCatalogueProduct(product: Pick<CatalogueProduct, "name" | "categories">): boolean {
  const name = product.name.slice(0, 500).toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const petAccessory = /\b(?:dogs?|pupp(?:y|ies)|cats?|kittens?|pets?)\b.{0,64}\b(?:leads?|leashes?|collars?|harness(?:es)?|toys?|beds?|bowls?|treats?|food|kibble|litter|shampoo|grooming)\b/;
  const kitchenTool = /\b(?:juicers?|squeezers?|citrus press|lemon press|garlic press|garlic crusher|tofu press|vegetable peeler|potato peeler|cheese grater|zester|knife sharpener|knife block|chopping board|cutting board|kitchen utensil|measuring cups?|measuring spoons?|baking trays?|baking tins?|muffin trays?|muffin tins?|food processor)\b/;
  const hardware = /\b(?:cordless drill|power drill|hammer drill|drill bits?|screwdrivers?|socket sets?|garden hoses?|garden stakes?|power tools?|wall plugs?|paint brushes?|spray paint|sandpaper|wood screws?|allen keys?|hex keys?|chicken wire|wire mesh)\b/;
  const household = /\b(?:dishwashing liquid|dishwasher (?:tablets?|capsules?|detergent)|laundry detergent|cleaning spray|surface cleaner|hand wash|body wash|scented candles?)\b/;
  if (petAccessory.test(name) || kitchenTool.test(name) || hardware.test(name) || household.test(name)) return true;
  return (product.categories || []).slice(0, 12).some((value) => {
    const category = value.slice(0, 160).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return /\b(?:pets|pet care|pet food|pet supplies|pet accessories|dog food|cat food|kitchenware|kitchen tools|kitchen dining|homeware|household cleaning|hardware|power tools|health beauty)\b/.test(category);
  });
}

type DietaryClaim = "vegan" | "vegetarian" | "gluten-free" | "dairy-free";

function dietaryClaimsOf(values: readonly string[]): Set<DietaryClaim> {
  const text = values.slice(0, 16).map((value) => value.slice(0, 500)).join(" ").toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const claims = new Set<DietaryClaim>();
  if (/\bvegans?\b/.test(text) && !/\b(?:non vegan|not vegan|not suitable for vegans?)\b/.test(text)) claims.add("vegan");
  if (/\bvegetarians?\b/.test(text) && !/\b(?:non vegetarian|not vegetarian|not suitable for vegetarians?)\b/.test(text)) claims.add("vegetarian");
  if (/\bgluten free\b/.test(text) && !/\b(?:not gluten free|non gluten free)\b/.test(text)) claims.add("gluten-free");
  if (/\bdairy free\b/.test(text) && !/\b(?:not dairy free|non dairy free)\b/.test(text)) claims.add("dairy-free");
  return claims;
}

const PHRASES: readonly { family: string; phrase: string }[] = [
  { family: "eye-fillet", phrase: "eye fillet" },
  { family: "poultry-tender", phrase: "poultry tender" },
  { family: "oyster-blade", phrase: "oyster blade" },
  { family: "short-rib", phrase: "short rib" },
  { family: "spare-rib", phrase: "spare rib" },
  { family: "osso-buco", phrase: "osso buco" },
  { family: "gravy-beef", phrase: "gravy beef" },
  { family: "gravy-beef", phrase: "beef shin" },
  { family: "scotch", phrase: "scotch fillet" },
  { family: "scotch", phrase: "scotch" },
  { family: "sirloin", phrase: "sirloin" },
  { family: "maryland", phrase: "maryland" },
  { family: "drumstick", phrase: "drumstick" },
  { family: "spatchcock", phrase: "spatchcock" },
  { family: "oxtail", phrase: "oxtail" },
  { family: "brisket", phrase: "brisket" },
  { family: "mince", phrase: "mince" },
  { family: "breast", phrase: "breast" },
  { family: "thigh", phrase: "thigh" },
  { family: "wing", phrase: "wing" },
  { family: "rump", phrase: "rump" },
  { family: "chuck", phrase: "chuck" },
  { family: "cheek", phrase: "cheek" },
  { family: "liver", phrase: "liver" },
  { family: "cutlet", phrase: "cutlet" },
  { family: "shank", phrase: "shank" },
  { family: "hock", phrase: "hock" },
  { family: "belly", phrase: "belly" },
  { family: "neck", phrase: "neck" },
  { family: "loin", phrase: "loin" },
  { family: "shoulder", phrase: "shoulder" },
  { family: "leg", phrase: "leg" },
  { family: "skirt", phrase: "skirt" },
  { family: "whole", phrase: "whole chicken" },
  { family: "whole", phrase: "whole turkey" },
  { family: "whole", phrase: "whole bird" },
  { family: "bolar", phrase: "bolar blade" },
  { family: "bolar", phrase: "bolar" },
  { family: "silverside", phrase: "silverside" },
  { family: "topside", phrase: "topside" },
  { family: "t-bone", phrase: "t bone" },
  { family: "flank", phrase: "flank" },
  { family: "hanger", phrase: "hanger" },
  { family: "tri-tip", phrase: "tri tip" },
  { family: "backstrap", phrase: "backstrap" },
  { family: "rack", phrase: "lamb rack" },
  { family: "diced", phrase: "diced" },
  { family: "sausage", phrase: "sausage" },
  { family: "tongue", phrase: "tongue" },
  { family: "trotter", phrase: "trotter" },
  { family: "frame", phrase: "chicken frame" },
  { family: "frame", phrase: "chicken carcass" },
  { family: "heart", phrase: "chicken heart" },
  { family: "gizzard", phrase: "gizzard" },
  { family: "strips", phrase: "stir fry" },
  { family: "pork-fillet", phrase: "pork fillet" },
  { family: "wingette", phrase: "wingette" },
  { family: "wingette", phrase: "drumette" },
  { family: "wingette", phrase: "wing nibble" },
];

export function audToCents(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return centsFromDecimal(value.toFixed(3));
  }
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/^a\$/i, "").replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [dollars, fraction = ""] = cleaned.split(".");
  if (Number(cleaned) <= 0) return null;
  return centsFromDecimal(`${dollars}.${(fraction + "000").slice(0, 3)}`);
}

function centsFromDecimal(fixed3: string): number | null {
  const [dollarsText, fraction] = fixed3.split(".");
  if (!/^\d+$/.test(dollarsText) || !/^\d{3}$/.test(fraction)) return null;
  const dollars = Number(dollarsText);
  if (!Number.isSafeInteger(dollars) || dollars > 100_000) return null;
  let cents = dollars * 100 + Number(fraction.slice(0, 2));
  if (Number(fraction[2]) >= 5) cents += 1;
  return cents > 0 ? cents : null;
}

export function formatAudCents(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isSafeInteger(cents) || cents <= 0) return null;
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  return `A$${dollars}.${String(rem).padStart(2, "0")}`;
}

function stem(token: string): string {
  return foldFoodWord(token);
}

/** Fold shop wording onto the words our list uses, without treating bare "fillet" as its own cut. */
export function canonicalizeProductText(value: string): string {
  let text = value.toLowerCase()
    .replace(/\s+for the (?:side sauce|side|rice|corn)\s*$/g, "")
    .replace(/\bwagu\b/g, "wagyu")
    .replace(/\byoghurt\b/g, "yogurt")
    .replace(/\bcilantro\b/g, "coriander")
    .replace(/\bshrimps?\b/g, "prawn")
    .replace(/\bgarbanzo(?: beans?)?\b/g, "chickpea")
    .replace(/\baubergine\b/g, "eggplant")
    .replace(/\bzucchini\b/g, "courgette")
    .replace(/\bribeye\b/g, "rib eye")
    .replace(/\bground (beef|chicken|lamb|pork|turkey)\b/g, "$1 mince")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  text = text.split(" ").map(stem).join(" ");
  if (!/\b(black pepper|white pepper|peppercorn)\b/.test(text)) {
    text = text.replace(/\bbell pepper\b/g, "capsicum");
    text = text.replace(/\b(red|green|yellow|orange) pepper\b/g, "$1 capsicum");
  }
  text = text
    .replace(/\bporterhouse\b/g, "sirloin")
    .replace(/\brib eye\b/g, "scotch fillet")
    .replace(/\bflat iron\b/g, "oyster blade")
    .replace(/\bdrum stick\b/g, "drumstick")
    .replace(/\box tail\b/g, "oxtail")
    .replace(/\bossobuco\b/g, "osso buco")
    .replace(/\bcube roll\b/g, "scotch fillet")
    .replace(/\bnew york steak\b/g, "sirloin")
    .replace(/\bhanging tender\b/g, "hanger")
    .replace(/\brack of lamb\b/g, "lamb rack")
    .replace(/\btbone\b/g, "t bone")
    .replace(/\btritip\b/g, "tri tip");
  if (/\b(chicken|turkey)\b/.test(text)) text = text.replace(/\btenderloin\b/g, "poultry tender");
  else if (/\bpork\b/.test(text)) text = text.replace(/\btenderloin\b/g, "pork fillet").replace(/\bmedallion\b/g, "pork fillet");
  else if (/\bbeef\b/.test(text) && /\b(tenderloin|fillet steak)\b/.test(text)) {
    text = text.replace(/\btenderloin\b/g, "eye fillet").replace(/\bfillet steak\b/g, "eye fillet");
  }
  return text.replace(/\s+/g, " ").trim();
}

function tokensOf(canonical: string): string[] {
  return canonical.split(" ").filter((token) => token.length > 1 && !STOP.has(token));
}

function familiesOf(canonical: string): Set<string> {
  const found = new Set<string>();
  const padded = ` ${canonical} `;
  for (const entry of PHRASES) {
    if (padded.includes(` ${entry.phrase} `)) found.add(entry.family);
  }
  return found;
}

function proteinsOf(canonical: string): Set<string> {
  const found = new Set<string>();
  for (const protein of PROTEINS) {
    if (new RegExp(`\\b${protein}\\b`).test(canonical)) found.add(protein);
  }
  return found;
}

function breedOf(canonical: string): "ordinary" | "angus" | "wagyu" {
  if (/\bwagyu\b/.test(canonical)) return "wagyu";
  if (/\bangus\b/.test(canonical)) return "angus";
  return "ordinary";
}

function boneStyle(canonical: string): "bone-in" | "boneless" | null {
  const boneIn = /\b(bone in|on the bone|cutlet)\b/.test(canonical);
  const boneless = /\b(boneless|skinless|fillet)\b/.test(canonical);
  if (boneIn && !boneless) return "bone-in";
  if (boneless && !boneIn) return "boneless";
  return null;
}

export function stockFlag(inStock: boolean | null | undefined, available: boolean | null | undefined): StockFlag {
  if (inStock === true && available === true) return "IN_STOCK";
  if (inStock === false && available === false) return "OUT_OF_STOCK";
  return "UNKNOWN";
}

function cutsConflict(left: Set<string>, right: Set<string>): boolean {
  if (left.size === 0 || right.size === 0) return false;
  const shared = [...left].some((family) => right.has(family));
  if (!shared) return true;
  if (left.has("mince") !== right.has("mince")) return true;
  if (left.has("liver") !== right.has("liver")) return true;
  if (left.has("whole") !== right.has("whole")) return true;
  return false;
}

export function matchProducts(query: string, products: readonly CatalogueProduct[], limit = 6): ProductMatch[] {
  const wanted = canonicalizeProductText(query);
  if (wanted.length < 2) return [];
  const wantedTokens = tokensOf(wanted);
  const wantedCuts = familiesOf(wanted);
  const wantedProteins = proteinsOf(wanted);
  const wantedBreed = breedOf(wanted);
  const wantedBone = boneStyle(wanted);
  const requiredClaims = dietaryClaimsOf([query]);
  const ranked: ProductMatch[] = [];

  for (const product of products) {
    if (!product.name.trim() || product.name.length > 500 || isNonFoodCatalogueProduct(product)) continue;
    const seen = canonicalizeProductText(product.name);
    if (/\bsausage roll\b/.test(seen) && !/\bsausage roll\b/.test(wanted)) continue;
    if (/\bsauce\b/.test(seen) && !/\bsauce\b/.test(wanted)) continue;
    const seenTokens = tokensOf(seen);
    const seenTokenSet = new Set(seenTokens);
    const seenCuts = familiesOf(seen);
    const seenProteins = proteinsOf(seen);
    const seenBreed = breedOf(seen);
    const seenBone = boneStyle(seen);
    if (wantedProteins.size && seenProteins.size && [...wantedProteins].some((protein) => !seenProteins.has(protein))) continue;
    if (wantedProteins.size && !seenProteins.size && ![...wantedCuts].some((family) => seenCuts.has(family))) continue;
    if (cutsConflict(wantedCuts, seenCuts)) continue;
    if (wantedBreed !== "ordinary" && wantedBreed !== seenBreed) continue;

    const overlap = wantedTokens.filter((token) => seenTokenSet.has(token)).length;
    const sharedCut = [...wantedCuts].some((family) => seenCuts.has(family));
    if (!overlap && !sharedCut) continue;

    let score = overlap * 10;
    if (wantedTokens.length > 0 && overlap === wantedTokens.length) score += 15;
    if (wantedProteins.size && [...wantedProteins].every((protein) => seenProteins.has(protein))) score += 25;
    if (sharedCut) score += 30;
    if (wantedBreed !== "ordinary" && wantedBreed === seenBreed) score += 15;
    if (wantedBreed === "ordinary" && seenBreed === "ordinary") score += 5;

    const stock = stockFlag(product.inStock, product.available);
    const premium = wantedBreed === "ordinary" && seenBreed !== "ordinary";
    const boneMismatch = wantedBone !== null && seenBone !== null && wantedBone !== seenBone;
    if (premium) score -= 40;
    if (boneMismatch) score -= 15;

    const priced = product.priceCents != null && product.priceCents > 0;
    const claims = dietaryClaimsOf([product.name, ...(product.dietaryClaims || [])]);
    const missingClaims = [...requiredClaims].filter((claim) => !claims.has(claim) && !(claim === "vegetarian" && claims.has("vegan")));
    let selected = !premium && !boneMismatch && stock === "IN_STOCK" && priced && overlap > 0;
    if (missingClaims.length) selected = false;
    if (wantedCuts.size > 0 && !sharedCut) selected = false;
    if (wantedProteins.size > 0 && seenProteins.size > 0 && ![...wantedProteins].every((protein) => seenProteins.has(protein))) selected = false;
    if (!(overlap === wantedTokens.length || sharedCut || score >= 40)) selected = false;

    const reason = premium
      ? `${seenBreed === "wagyu" ? "Wagyu" : "Angus"} is another option. It was not selected for an ordinary cut.`
      : boneMismatch
        ? "The bone-in and boneless names do not agree, so this was not selected."
        : stock === "OUT_OF_STOCK"
          ? "Out of stock in the online catalogue. Not selected."
          : stock === "UNKNOWN"
            ? "The catalogue did not say whether this is in stock. Not selected."
            : !priced
              ? "No catalogue price. Not selected, and not counted as $0."
              : missingClaims.length
                ? `The product label does not establish ${missingClaims.join(" and ")}. Verify the packet; not selected automatically.`
              : selected
                ? "Catalogue name matches the request. In stock online; verify the packet and dietary/allergen labels."
                : "Shown as another catalogue wording. Not the automatic pick.";

    ranked.push({
      name: product.name.trim(),
      priceCents: priced ? product.priceCents : null,
      packageSize: product.packageSize,
      stock,
      url: product.url ?? null,
      score,
      selected,
      reviewable: stock === "IN_STOCK" && priced && missingClaims.length === 0 && !boneMismatch && overlap > 0,
      ...(product.preparedForm ? { preparedForm: product.preparedForm } : {}),
      reason,
    });
  }

  ranked.sort((a, b) => Number(b.selected) - Number(a.selected) || b.score - a.score || a.name.localeCompare(b.name));
  const selectable = ranked.filter((match) => match.selected);
  const top = selectable[0];
  const tied = top != null && selectable.some((match) => match !== top && match.score === top.score);
  const queryHadNoCut = wantedCuts.size === 0;
  const selectedCuts = new Set(selectable.map((match) => [...familiesOf(canonicalizeProductText(match.name))][0] ?? ""));
  const splitCuts = queryHadNoCut && selectedCuts.size > 1;
  if (!top || tied || splitCuts) {
    for (const match of ranked) {
      if (!match.selected) continue;
      match.selected = false;
      if (tied || splitCuts) match.reason = "More than one catalogue row fits. Nothing was selected automatically.";
    }
  } else {
    for (const match of ranked) {
      if (match !== top) {
        match.selected = false;
        if (match.reason.startsWith("Cut and name agree")) match.reason = "Another catalogue wording. Not the automatic pick.";
      }
    }
  }
  return ranked.slice(0, Math.max(1, limit));
}

const SEARCH_SWAPS: readonly (readonly [RegExp, string])[] = [
  [/\bcilantro\b/gi, "coriander"],
  [/\bcourgettes?\b/gi, "zucchini"],
  [/\bzucchinis?\b/gi, "courgette"],
  [/\baubergines?\b/gi, "eggplant"],
  [/\beggplants?\b/gi, "aubergine"],
  [/\bshrimps?\b/gi, "prawns"],
  [/\bprawns?\b/gi, "shrimp"],
  [/\bgarbanzo(?: beans?)?\b/gi, "chickpea"],
  [/\bchickpeas?\b/gi, "garbanzo"],
  [/\byoghurt\b/gi, "yogurt"],
  [/\byogurt\b/gi, "yoghurt"],
  [/\bbell peppers?\b/gi, "capsicum"],
  [/\bcapsicums?\b/gi, "bell pepper"],
  [/\bwagu\b/gi, "wagyu"],
];

/** Names to send to a catalogue. Omit authored serving-role suffixes, retaining food form and dietary words. */
export function catalogueSearchPhrases(query: string): string[] {
  const primary = query.replace(/\s+/g, " ").trim().replace(/\s+for the (?:side sauce|side|rice|corn)$/i, "");
  if (primary.length < 2) return [];
  const folded = primary.toLocaleLowerCase("en-AU");
  const phrases = [primary.slice(0, 80)];
  let best: (typeof MEAT_CUTS)[number] | undefined;
  let bestLen = 0;
  let ties = 0;
  for (const entry of MEAT_CUTS) {
    for (const name of [entry.shoppingName, ...entry.aliases]) {
      const needle = name.toLocaleLowerCase("en-AU");
      if (needle.length < 4) continue;
      if (folded !== needle && !folded.includes(needle)) continue;
      if (needle.length > bestLen) {
        best = entry;
        bestLen = needle.length;
        ties = 1;
      } else if (needle.length === bestLen && entry.id !== best?.id) {
        ties += 1;
      }
    }
  }
  if (best && ties === 1) {
    const extras = [...best.aliases].sort((a, b) => a.length - b.length);
    for (const alias of extras) {
      if (phrases.length >= 3) break;
      const clean = alias.replace(/\s+/g, " ").trim();
      if (clean.length < 6 || clean.length > 80) continue;
      if (folded.includes(clean.toLocaleLowerCase("en-AU"))) continue;
      if (phrases.some((phrase) => phrase.toLocaleLowerCase("en-AU") === clean.toLocaleLowerCase("en-AU"))) continue;
      phrases.push(clean);
    }
  }
  if (phrases.length < 3) {
    for (const [pattern, replacement] of SEARCH_SWAPS) {
      if (phrases.length >= 3) break;
      const swapped = primary.replace(pattern, replacement).replace(/\s+/g, " ").trim();
      if (swapped.length < 2 || swapped.toLocaleLowerCase("en-AU") === folded) continue;
      if (phrases.some((phrase) => phrase.toLocaleLowerCase("en-AU") === swapped.toLocaleLowerCase("en-AU"))) continue;
      phrases.push(swapped.slice(0, 80));
    }
  }
  return phrases;
}
