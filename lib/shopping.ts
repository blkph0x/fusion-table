import type { Shop } from "./locations";
import type { RecipeIngredient } from "./recipe-types";

export interface ShoppingLine {
  id: string;
  name: string;
  amount: number;
  unit: string;
  category?: RecipeIngredient["category"];
  allergens?: string[];
  aliases?: string[];
  inPantry?: boolean;
}

export interface ShopListRankOptions {
  radiusKm?: number;
  shopName?: string;
  includePantry?: boolean;
  limit?: number;
}

export interface ShopListMatch {
  shop: Shop;
  matchedIngredientIds: string[];
  matchedIngredients: { id: string; name: string; reason: string }[];
  matchedCount: number;
  totalNeeded: number;
  coveragePercent: number;
  reasons: string[];
  inventoryStatus: "unverified";
  coverageLabel: string;
  distanceKnown: boolean;
  withinRadius: boolean | null;
}

export interface ProductSearchLink {
  url: string;
  label: string;
  kind: "retailer-search" | "retailer-website" | "web-search";
  note: string;
  /** A specific shop/area/ingredient search when the shop has no known search URL. */
  fallbackUrl?: string;
}

/**
 * These rules identify plausible places to ask, never confirmed stock or dietary
 * suitability. The original OSM subtype is more useful than a broad UI category:
 * a bakery and a spice merchant must not both match every specialty ingredient.
 */

const BREAD_IDS = new Set([
  "bread", "burger-buns", "buns", "bread-rolls", "flatbreads", "pita", "pitta",
  "naan", "sourdough", "baguette", "focaccia", "ciabatta", "brioche",
]);

const DRY_SPICE_IDS = new Set([
  "cumin", "ground-cumin", "smoked-paprika", "paprika", "garam-masala",
  "turmeric", "ground-turmeric", "sumac", "ras-el-hanout", "oregano",
  "chilli-flakes", "chili-flakes", "black-pepper", "white-pepper", "cinnamon",
  "ground-coriander", "coriander-seeds", "cumin-seeds", "fennel-seeds",
  "cardamom", "cloves", "nutmeg", "ground-ginger", "curry-powder", "zaatar",
  "sweet-paprika", "garlic-powder", "onion-powder", "five-spice", "gf-five-spice", "dried-mint",
  "za-atar", "allspice", "star-anise", "dried-thyme", "dried-rosemary",
  "berbere", "gochugaru", "shichimi", "kashmiri-chilli", "ceylon-chilli", "cayenne",
  "hot-paprika", "pimenton-picante", "boukovo", "espelette-pepper", "pul-biber",
  "aji-molido", "merken", "pepperberry", "lemon-myrtle", "sichuan-pepper", "sansho",
  "timur", "grains-of-paradise", "advieh", "khmeli-suneli", "hawaij", "xawaash",
  "tabil", "ras-el-hanout", "garam-masala", "panch-phoron", "mustard-seeds",
  "fenugreek", "caraway", "dried-ginger", "ceylon-cinnamon", "celery-seed",
  "mexican-oregano", "kasuri-methi", "annatto",
]);

const DELI_IDS = new Set([
  "olive-oil", "olives", "green-olives", "black-olives", "kalamata-olives",
  "capers", "sun-dried-tomatoes", "sundried-tomatoes", "pickles", "gherkins",
  "salami", "prosciutto", "pancetta", "chorizo", "ham",
]);

const CONVENIENCE_IDS = new Set([
  "milk", "eggs", "salt", "sugar", "olive-oil", "vegetable-oil", "cooking-oil",
  "jasmine-rice", "rice", "pasta", "black-pepper", "bread", "burger-buns",
]);

function identifier(ingredient: RecipeIngredient): string {
  return ingredient.id.trim().toLowerCase();
}

function ingredientName(ingredient: RecipeIngredient): string {
  return ingredient.name.toLowerCase().replace(/[’']/g, "");
}

function isBread(ingredient: RecipeIngredient): boolean {
  if (ingredient.category !== "grocery" && ingredient.category !== "specialty") return false;
  const name = ingredientName(ingredient);
  // Flour, bread crumbs and bread flavourings are not bakery bread products.
  if (/\b(flour|crumbs?|breadcrumbs?|stuffing|seasoning|sauce|paste)\b/.test(name)) return false;
  return BREAD_IDS.has(identifier(ingredient)) || /\b(bread|buns?|bread rolls?|flatbreads?|pita|pitta|naan|sourdough|baguette|focaccia|ciabatta|brioche)\b/.test(name);
}

function isDairyCheese(ingredient: RecipeIngredient): boolean {
  const name = ingredientName(ingredient);
  if (/\b(vegan|plant.?based|dairy.?free|non.?dairy|soy|coconut|almond|cashew)\b/.test(name)) return false;
  if (!ingredient.allergens.some(allergen => allergen.toLowerCase() === "milk")) return false;
  return /\b(cheese|cheddar|feta|parmesan|pecorino|ricotta|mozzarella|halloumi|provolone|paneer|gouda|brie|camembert|mascarpone)\b/.test(name);
}

function isDrySpice(ingredient: RecipeIngredient): boolean {
  if (ingredient.category === "produce" || ingredient.category === "butcher" || ingredient.category === "fishmonger") return false;
  const name = ingredientName(ingredient);
  if (/\b(fresh|paste|sauce|oil|vinegar|milk|yogurt|yoghurt|juice)\b/.test(name)) return false;
  if (DRY_SPICE_IDS.has(identifier(ingredient)) || DRY_SPICE_IDS.has(name.trim().replace(/\s+/g, "-"))) return true;
  return /\b(ground (cumin|turmeric|coriander|ginger|cinnamon)|smoked paprika|garam masala|ras el hanout|sumac|chill?i flakes|curry powder|dried (oregano|thyme|rosemary|basil|mint|dill|parsley)|black pepper|white pepper|cumin seeds|coriander seeds|fennel seeds|cardamom|cloves|nutmeg|allspice|star anise)\b/.test(name);
}

function isDeliProduct(ingredient: RecipeIngredient): boolean {
  if (isDairyCheese(ingredient)) return true;
  const name = ingredientName(ingredient);
  // A delicatessen is not evidence of a fresh-meat, produce or Asian-pantry range.
  if (ingredient.category === "produce" || ingredient.category === "fishmonger") return false;
  if (/\b(vegan|plant.?based|dairy.?free|non.?dairy)\b/.test(name)) return false;
  return DELI_IDS.has(identifier(ingredient)) || /\b(olives|capers|sun.?dried tomatoes|gherkins|salami|prosciutto|pancetta|chorizo)\b/.test(name);
}

function subtype(shop: Shop): string | undefined {
  return shop.shopType?.trim().toLowerCase() || undefined;
}

export function ingredientMatchesShop(line: ShoppingLine, shop: Shop): boolean {
  const ingredient = normalizeShoppingLine(line);
  const type = subtype(shop);
  if (type) {
    switch (type) {
      case "supermarket": return true;
      case "greengrocer": case "farm": return ingredient.category === "produce";
      case "butcher": return ingredient.category === "butcher";
      case "seafood": return ingredient.category === "fishmonger";
      case "bakery": return isBread(ingredient);
      case "cheese": return isDairyCheese(ingredient);
      case "spices": return isDrySpice(ingredient);
      case "deli": return isDeliProduct(ingredient);
      case "grocery": return ingredient.category === "grocery" || ingredient.category === "specialty";
      case "convenience": return ingredient.category === "grocery" && (CONVENIENCE_IDS.has(identifier(ingredient)) || isBread(ingredient));
      default: return false;
    }
  }

  // Older saved listings may lack a subtype. Only specific known categories
  // remain matchable. Neither generic markets nor "specialty" imply a range.
  switch (shop.kind) {
    case "supermarket": return true;
    case "produce": return ingredient.category === "produce";
    case "butcher": return ingredient.category === "butcher";
    case "fishmonger": return ingredient.category === "fishmonger";
    case "grocery": return ingredient.category === "grocery" || ingredient.category === "specialty";
    case "market": case "specialty": return false;
  }
}

function sourceRank(shop: Shop): number {
  const type = subtype(shop);
  if (type === "supermarket" || (!type && shop.kind === "supermarket")) return 20;
  if (type === "grocery" || (!type && shop.kind === "grocery")) return 30;
  if (type === "convenience") return 40;
  if (type === "deli") return 5;
  return 0;
}

export function suggestedShops(ingredient: ShoppingLine, shops: readonly Shop[]): Shop[] {
  const seen = new Set<string>();
  return shops.filter(shop => {
    if (seen.has(shop.id) || !ingredientMatchesShop(ingredient, shop)) return false;
    seen.add(shop.id);
    return true;
  }).sort((a, b) => {
    const rank = sourceRank(a) - sourceRank(b);
    if (rank) return rank;
    const distanceA = Number.isFinite(a.distanceKm) ? a.distanceKm : Number.POSITIVE_INFINITY;
    const distanceB = Number.isFinite(b.distanceKm) ? b.distanceKm : Number.POSITIVE_INFINITY;
    return distanceA - distanceB || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

/** Conservative fallback for old/custom lists that did not retain recipe categories. */
export function inferShoppingCategory(name: string): RecipeIngredient["category"] {
  const text = name.toLowerCase().replace(/[’']/g, "");
  // Sauces, tins and substitutes are pantry products, not fresh animal ingredients.
  if (/\b(vegan|vegetarian|plant.?based|meat.?free|tofu|tempeh|quorn|jackfruit)\b/.test(text)
    || /\b(sauce|paste|stock|broth|powder|dried|flakes|flour|crumbs|breadcrumbs|canned|tinned|tin|frozen|oil|vinegar|milk|cream|yogh?urt|cheese|butter|honey|seasoning|rub|marinade|flavouring)\b/.test(text)) return "grocery";
  if (/\b(prawns?|shrimp|salmon|tuna|trout|sardines?|mackerel|snapper|barramundi|fish|seafood|mussels?|oysters?|octopus|squid|scallops?)\b/.test(text)) return "fishmonger";
  if (/\b(chicken|turkey|duck|beef|lamb|pork|veal|venison|kangaroo|brisket|rump|sirloin|sausages?|bacon|mince|ribs?)\b/.test(text)) return "butcher";
  if (/\bground\b/.test(text)) return "grocery";
  if (/\b(carrots?|potatoes?|tomatoes?|capsicums?|bell peppers?|(?:red|green|yellow|orange) peppers?|cucumber|courgettes?|zucchini|aubergine|eggplant|mushrooms?|broccoli|cauliflower|pumpkin|butternut|cabbage|wombok|lettuce|spinach|kale|silverbeet|bok choy|gai lan|spring onions?|shallots?|onions?|garlic|ginger|lemongrass|galangal|lemons?|limes?|avocado|snow peas|green beans|bean sprouts|coriander|cilantro|parsley|basil|mint|dill|chill?i(?:es)?|fresh herbs?|apples?|bananas?|oranges?|pears?|mango(?:es)?|pineapple|berries|grapes?|plums?)\b/.test(text)) return "produce";
  return "grocery";
}

/** Missing metadata never crashes matching or turns a named substitute into meat. */
export function normalizeShoppingLine(line: ShoppingLine): RecipeIngredient {
  const name = typeof line.name === "string" ? line.name.trim() : "";
  const categories: readonly string[] = ["produce", "butcher", "fishmonger", "grocery", "specialty"];
  const category = line.category && categories.includes(line.category) ? line.category : inferShoppingCategory(name);
  return {
    id: typeof line.id === "string" ? line.id.trim() : "",
    name,
    amount: Number.isFinite(line.amount) ? line.amount : 0,
    unit: typeof line.unit === "string" ? line.unit.trim() : "",
    category,
    allergens: Array.isArray(line.allergens) ? line.allergens.filter((value) => typeof value === "string") : [],
    aliases: Array.isArray(line.aliases) ? line.aliases.filter((value) => typeof value === "string") : [],
    inPantry: line.inPantry === true,
  };
}

function searchText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function knownDistance(shop: Shop): boolean {
  return Number.isFinite(shop.distanceKm) && shop.distanceKm >= 0;
}

function matchReason(ingredient: RecipeIngredient, shop: Shop): string {
  const type = subtype(shop);
  if (type === "supermarket" || (!type && shop.kind === "supermarket")) return "Supermarket listing suggests a broad grocery range; check this ingredient's stock.";
  if (type === "greengrocer" || type === "farm" || (!type && shop.kind === "produce")) return "Fresh produce matches this fruit-and-vegetable shop type.";
  if (type === "butcher" || (!type && shop.kind === "butcher")) return "The meat ingredient matches this butcher listing.";
  if (type === "seafood" || (!type && shop.kind === "fishmonger")) return "The seafood ingredient matches this fishmonger listing.";
  if (type === "bakery") return "The bread product matches this bakery listing; dietary variants need checking.";
  if (type === "spices") return "The dried spice matches this spice-shop listing.";
  if (type === "cheese") return "The dairy cheese matches this cheese-shop listing.";
  if (type === "deli") return "The deli ingredient matches this delicatessen listing.";
  if (type === "convenience") return "This everyday pantry item may be carried by the convenience shop.";
  return `${ingredient.category === "specialty" ? "The specialty pantry ingredient" : "The pantry ingredient"} may be carried by this grocer; check its range.`;
}

/** Likely category coverage only. No price, product availability or cheapest-store claim. */
export function rankShopsForList(lines: readonly ShoppingLine[], shops: readonly Shop[], options: ShopListRankOptions = {}): ShopListMatch[] {
  if (options.radiusKm !== undefined && (!Number.isFinite(options.radiusKm) || options.radiusKm <= 0 || options.radiusKm > 25)) throw new Error("Choose a shopping radius above zero and no greater than 25 km.");
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 0 || options.limit > 120)) throw new Error("Choose a shop limit from 0 to 120.");
  const needed = [...new Map(lines.map(normalizeShoppingLine)
    .filter((line) => line.id && line.name && line.amount > 0 && (options.includePantry || !line.inPantry))
    .map((line) => [line.id, line])).values()];
  if (!needed.length || options.limit === 0) return [];
  const query = searchText(options.shopName ?? "").split(" ").filter(Boolean);
  const seen = new Set<string>();
  const output: ShopListMatch[] = [];
  for (const shop of shops) {
    if (seen.has(shop.id) || !query.every((token) => searchText(shop.name).includes(token))) continue;
    const distanceKnown = knownDistance(shop);
    if (distanceKnown && options.radiusKm !== undefined && shop.distanceKm > options.radiusKm) continue;
    const matched = needed.filter((line) => ingredientMatchesShop(line, shop));
    if (!matched.length) continue;
    seen.add(shop.id);
    const matchedIngredients = matched.map((line) => ({ id: line.id, name: line.name, reason: matchReason(line, shop) }));
    const coverageLabel = `${matched.length} of ${needed.length} ingredients suggested by shop type — stock unconfirmed`;
    output.push({
      shop,
      matchedIngredientIds: matched.map((line) => line.id),
      matchedIngredients,
      matchedCount: matched.length,
      totalNeeded: needed.length,
      coveragePercent: Math.round(matched.length / needed.length * 100),
      reasons: [...new Set(matchedIngredients.map((line) => line.reason)), ...(!distanceKnown ? ["Distance unavailable — confirm this shop is within your selected area."] : [])],
      inventoryStatus: "unverified",
      coverageLabel,
      distanceKnown,
      withinRadius: distanceKnown && options.radiusKm !== undefined ? shop.distanceKm <= options.radiusKm : null,
    });
  }
  return output.sort((a, b) => Number(b.distanceKnown) - Number(a.distanceKnown)
    || b.matchedCount - a.matchedCount
    || (a.distanceKnown && b.distanceKnown ? a.shop.distanceKm - b.shop.distanceKm : 0)
    || a.shop.name.localeCompare(b.shop.name) || a.shop.id.localeCompare(b.shop.id))
    .slice(0, options.limit ?? 120);
}

function publicStoreWebsite(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("www.") ? `https://${value}` : value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !host.includes(".")
      || /^\d+(?:\.\d+){3}$/.test(host) || host.includes(":")
      || /(?:^|\.)(?:localhost|local|internal)$/.test(host)) return null;
    return url.href;
  } catch { return null; }
}

/** Official public shopping destinations, checked 26 October 2026. */
export function productSearchLink(shop: Shop, ingredient: ShoppingLine | string, area = ""): ProductSearchLink {
  const term = (typeof ingredient === "string" ? ingredient : ingredient.name).trim().slice(0, 200) || "groceries";
  const place = area.trim().slice(0, 160);
  const website = publicStoreWebsite(shop.website);
  const hostname = website ? new URL(website).hostname : "";
  const namedSupermarket = shop.kind === "supermarket" || subtype(shop) === "supermarket";
  const brand = (name: string, host: string) => hostname === host || hostname.endsWith(`.${host}`) || (namedSupermarket && new RegExp(`\\b${name}\\b`, "i").test(shop.name));
  const note = `Search for ${term}${place ? ` near ${place}` : ""}. Select the retailer's store or delivery area and check the exact product; this link does not confirm local stock or price.`;
  if (brand("woolworths", "woolworths.com.au")) return { url: `https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(term)}`, label: `Search Woolworths for ${term}`, kind: "retailer-search", note };
  if (brand("coles", "coles.com.au")) return { url: `https://www.coles.com.au/search?q=${encodeURIComponent(term)}`, label: `Search Coles for ${term}`, kind: "retailer-search", note };
  if (brand("aldi", "aldi.com.au")) return { url: "https://www.aldi.com.au/Products", label: `Find ${term} in ALDI's product finder`, kind: "retailer-website", note };
  if (brand("iga", "iga.com.au") || hostname === "igashop.com.au" || hostname.endsWith(".igashop.com.au")) return { url: "https://www.igashop.com.au/", label: `Find ${term} at IGA`, kind: "retailer-website", note };
  const query = [shop.name, place, term].filter(Boolean).join(" ");
  const webSearch = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  return website
    ? { url: website, label: `Open ${shop.name}'s website`, kind: "retailer-website", note, fallbackUrl: webSearch }
    : { url: webSearch, label: `Search ${shop.name} for ${term}`, kind: "web-search", note };
}
