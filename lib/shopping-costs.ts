import type { PriceQuote } from "./catalogue.ts";
import { areaKey, itemKey, type ItemQuote, type PriceMemory } from "./price-memory.ts";
import { canonicalizeProductText, ingredientPreparationConflict, type StockFlag } from "./product-match.ts";
import type { ShoppingLine } from "./shopping.ts";
import { estimateIngredientCost, type IngredientPlanningEstimate } from "./ingredient-estimates.ts";

export interface ShoppingCost {
  lineCents: number | null;
  packs: number | null;
  purchasedAmount: number | null;
  purchasedUnit: string | null;
  reason: string | null;
}

export interface ShoppingOffer {
  id: string;
  productName: string;
  retailerId: string | null;
  shopId: string | null;
  shopName: string;
  source: PriceQuote["source"] | "recorded" | "public-page";
  scope: "chain-online" | "shop-online" | "shop-recorded" | "area-recorded";
  evidenceLabel: string;
  priceCents: number | null;
  packageSize: string | null;
  stock: StockFlag;
  fetchedAt: string | null;
  freshness: "current" | "stale" | "unknown";
  match: "matched" | "review";
  reviewable: boolean;
  reviewReason: string | null;
  eligible: boolean;
  cost: ShoppingCost;
  url: string | null;
}

export interface ShoppingCostLine {
  id: string;
  name: string;
  amount: number;
  unit: string;
  offers: ShoppingOffer[];
  chosenOfferId: string | null;
  estimatedCents: number | null;
  reason: string | null;
  /** Explicit planning assumptions, never promoted to an observed retailer offer. */
  planningEstimate?: IngredientPlanningEstimate | null;
}

interface Quantity { amount: number; unit: string; family: string; factor: number }
interface SellingQuantity { quantity: Quantity; rate: boolean }

const UNITS: Record<string, readonly [string, string, number]> = {
  g: ["g", "mass", 1], gram: ["g", "mass", 1], grams: ["g", "mass", 1],
  kg: ["kg", "mass", 1000], kilogram: ["kg", "mass", 1000], kilograms: ["kg", "mass", 1000],
  ml: ["ml", "volume", 1], millilitre: ["ml", "volume", 1], millilitres: ["ml", "volume", 1],
  l: ["l", "volume", 1000], litre: ["l", "volume", 1000], litres: ["l", "volume", 1000],
  "": ["each", "count", 1], each: ["each", "count", 1], ea: ["each", "count", 1],
  piece: ["each", "count", 1], pieces: ["each", "count", 1], count: ["each", "count", 1],
  pack: ["pack", "pack", 1], packs: ["pack", "pack", 1], pk: ["pack", "pack", 1],
  clove: ["clove", "clove", 1], cloves: ["clove", "clove", 1],
  bunch: ["bunch", "bunch", 1], bunches: ["bunch", "bunch", 1],
};

function quantity(amount: number, rawUnit: string): Quantity | null {
  const unit = rawUnit.trim().toLowerCase().replace(/\.$/, "");
  const definition = UNITS[unit];
  if (!definition || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;
  return { amount, unit: definition[0], family: definition[1], factor: definition[2] };
}

/** Parse the selling quantity, never a unit-price comparison or a food density. */
function sellingQuantity(value: string | null | undefined): SellingQuantity | null {
  if (!value || value.length > 80) return null;
  let text = value.trim().toLowerCase().replace(/×/g, "x").replace(/\s+/g, " ");
  const rate = /^(?:per\s+|\/)/.test(text);
  text = text.replace(/^(?:per\s+|\/)/, "").trim();
  let multiplier = 1;
  const before = text.match(/^(\d{1,3})\s*x\s*(.+)$/);
  const after = text.match(/^(.+?)\s*x\s*(\d{1,3})$/);
  if (before) { multiplier = Number(before[1]); text = before[2]; }
  else if (after) { multiplier = Number(after[2]); text = after[1]; }
  if (multiplier < 1 || (rate && multiplier !== 1)) return null;
  if (text === "dozen") text = "12 each";
  const count = text.match(/^(\d+(?:\.\d+)?)\s*(?:pack|pk|count)$/);
  if (count) text = `${count[1]} each`;
  const simple = text.match(/^(?:(\d+(?:\.\d+)?)\s*)?([a-z]+)$/);
  if (!simple) return null;
  const parsed = quantity(Number(simple[1] ?? "1") * multiplier, simple[2]);
  return parsed ? { quantity: parsed, rate } : null;
}

/** Retailers use "each" for the saleable item, which can itself be a bunch.
 * Preserve that explicit product form; individual stalks per bunch are unknown. */
function productPackageSize(productName:string,packageSize:string|null|undefined):string|null {
  if(!packageSize)return packageSize??null;
  return /\bbunch(?:es)?\b/i.test(productName)&&/^(?:1\s*)?(?:each|ea|piece)\.?$/i.test(packageSize.trim())?"1 bunch":packageSize;
}

function unknownCost(reason: string): ShoppingCost {
  return { lineCents: null, packs: null, purchasedAmount: null, purchasedUnit: null, reason };
}

/** Amounts are shopping shortfalls already; stock at home is not subtracted again. */
export function costShoppingQuantity(amount: number, unit: string, priceCents: number | null, packageSize: string | null | undefined): ShoppingCost {
  if (amount === 0) return { lineCents: 0, packs: 0, purchasedAmount: 0, purchasedUnit: unit || "each", reason: "Nothing to buy for this line." };
  if (priceCents == null || !Number.isSafeInteger(priceCents) || priceCents <= 0 || priceCents > 10_000_000) return unknownCost("No usable price. This line is not counted as $0.");
  const needed = quantity(amount, unit);
  if (!needed) return unknownCost("The needed quantity cannot be converted safely. Check the pack quantity.");
  const selling = sellingQuantity(packageSize);
  if (!selling) return unknownCost("The selling quantity is missing or unclear. The pack price is shown without a line estimate.");
  if (needed.family !== selling.quantity.family) return unknownCost("The recipe and pack use different kinds of units. No weight, volume or count conversion was guessed.");
  const ratio = needed.amount * needed.factor / (selling.quantity.amount * selling.quantity.factor);
  const packs = selling.rate ? null : Math.ceil(ratio - 1e-10);
  const lineCents = selling.rate ? Math.round(priceCents * ratio) : priceCents * (packs as number);
  if (!Number.isSafeInteger(lineCents) || lineCents <= 0 || lineCents > 1_000_000_000) return unknownCost("The quantity is outside the supported costing range.");
  return {
    lineCents,
    packs,
    purchasedAmount: selling.rate ? needed.amount : Math.round((packs as number) * selling.quantity.amount * 1e6) / 1e6,
    purchasedUnit: selling.rate ? needed.unit : selling.quantity.unit,
    reason: selling.rate ? "Estimate at the stated rate; the shop's weighed quantity may differ." : null,
  };
}

/** Cost of food used, distinct from the rounded-up packs bought. No density is inferred. */
export function consumedOfferCost(line: Pick<ShoppingLine, "amount" | "unit">, offer: ShoppingOffer): number | null {
  if (line.amount === 0) return 0;
  const volume = line.unit === "tbsp" ? line.amount * 20 : line.unit === "tsp" ? line.amount * 5 : null;
  const needed = quantity(volume ?? line.amount, volume === null ? line.unit : "ml");
  const selling = sellingQuantity(productPackageSize(offer.productName,offer.packageSize));
  if (!needed || !selling || needed.family !== selling.quantity.family || !Number.isSafeInteger(offer.priceCents) || (offer.priceCents ?? 0) <= 0) return null;
  const cents = Math.max(1, Math.round(needed.amount * needed.factor / (selling.quantity.amount * selling.quantity.factor) * offer.priceCents!));
  return Number.isSafeInteger(cents) && cents <= 1_000_000_000 ? cents : null;
}

/** Use current reviewed/automatic offers when available, otherwise a labelled budget allowance. */
export function resolveIngredientPricing(line: ShoppingLine, row?: ShoppingCostLine | null) {
  // A shopping row may be a pantry shortfall, but it cannot exceed the full
  // recipe quantity. Larger rows belong to a previous quantity/serving choice.
  const matchingRow = row?.id === line.id && row.name === line.name && row.unit === line.unit && Number.isFinite(row.amount) && row.amount >= 0 && row.amount <= line.amount ? row : null;
  const planningEstimate = matchingRow?.amount === line.amount ? matchingRow.planningEstimate ?? estimateIngredientCost(line) : estimateIngredientCost(line);
  const chosen = matchingRow?.offers.find(offer => offer.id === matchingRow.chosenOfferId && isShoppingOfferSelectable(offer) && !ingredientPreparationConflict(line.name, offer.productName));
  const observedRecipeCents = chosen ? consumedOfferCost(line, chosen) : null;
  const observedPurchase = chosen && Number.isSafeInteger(matchingRow?.estimatedCents) && matchingRow!.estimatedCents! >= 0 && matchingRow!.estimatedCents! <= 1_000_000_000 ? matchingRow!.estimatedCents : null;
  const purchaseCents = observedPurchase ?? planningEstimate?.purchaseCents ?? null;
  return {
    currency: "AUD" as const,
    recipeCents: observedRecipeCents ?? planningEstimate?.recipeCents ?? null,
    purchaseCents,
    source: observedRecipeCents !== null ? "observed" as const : "planning-guide" as const,
    purchaseSource: observedPurchase !== null ? "observed" as const : "planning-guide" as const,
    label: observedRecipeCents !== null ? chosen!.evidenceLabel : planningEstimate?.label ?? "No quantity estimate is available.",
    planningEstimate,
    offer: chosen ?? null,
  };
}

function freshness(at: string | null | undefined, now: Date, maxAgeMs: number): ShoppingOffer["freshness"] {
  const timestamp = at ? Date.parse(at) : NaN;
  const age = now.getTime() - timestamp;
  if (!Number.isFinite(age) || age < -5 * 60_000) return "unknown";
  return age <= maxAgeMs ? "current" : "stale";
}

function localDay(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}

function validDay(day: string): boolean {
  const timestamp = Date.parse(`${day}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === day;
}

function retailer(name: string): string | null {
  return /\bwoolworths\b/i.test(name) ? "woolworths" : /\bcoles\b/i.test(name) ? "coles" : /\baldi\b/i.test(name) ? "aldi" : null;
}

function comparableState(line: ShoppingLine, productName: string): boolean {
  // Cooked and drained amounts cannot be inferred from a dry or undrained pack.
  return ["cooked", "drained"].every(word => !new RegExp(`\\b${word}\\b`, "i").test(line.name) || new RegExp(`\\b${word}\\b`, "i").test(productName));
}

const REQUEST_STOP = new Set(["a", "the", "and", "of", "for", "with", "fresh"]);
const PRODUCE = new Set(["tomato", "potato", "onion", "garlic", "ginger", "carrot", "broccoli", "cauliflower", "cabbage", "capsicum", "courgette", "eggplant", "cucumber", "spinach", "lettuce", "lemon", "lime", "orange", "apple", "banana", "pear", "mushroom", "coriander", "parsley", "basil", "mint"]);
const PRESERVED_FORMS = new Set(["powder", "paste", "sauce", "juice", "dried", "dehydrated", "pickled", "preserved", "canned", "tinned", "frozen", "puree", "pureed", "concentrate", "ground", "granule", "flaked", "chip", "cracker", "soup", "seasoning", "roasted", "cooked", "steamed", "grilled", "baked", "fried", "breaded"]);
const RICE_FORMS = new Set(["microwave", "microwavable", "cooked", "ready", "instant", "flavoured", "flavored", "flavour", "flavor", "seasoned", "savoury", "fried", "brown", "black", "red", "wild", "blend", "mixed", "mix", "quinoa", "coconut", "garlic", "lemon", "lime", "chilli", "spicy", "chicken", "beef", "pork", "lamb", "salmon", "prawn", "biryani", "biriyani", "pilaf", "pilau", "risotto", "sushi", "pudding", "dessert", "flour", "noodle", "vermicelli", "cracker", "snack", "cake", "puff", "popped", "cereal", "bran", "drink", "beverage", "syrup", "meal", "sauce", "paste", "powder", "porridge"]);
const TOFU_FORMS = new Set(["marinated", "smoked", "honey", "sauce", "soy", "teriyaki", "chilli", "spicy", "spiced", "seasoned", "flavoured", "flavored", "flavour", "flavor", "sesame", "braised", "fried", "fry", "stir", "puff", "burger", "bite", "crumbed", "breaded", "crumb", "batter", "panko", "nugget", "jerky", "sweet", "sour", "satay", "bbq", "barbecue", "curry", "masala", "soft", "silken", "dessert", "custard", "mousse", "noodle", "salad"]);
const SIMPLE_GROCERY_WORDS = new Set(["rice", "jasmine", "basmati", "white", "brown", "dry", "uncooked", "long", "grain", "tofu", "firm", "extra", "plain", "regular", "organic", "vegan", "vegetarian", "gluten", "free", "dairy"]);

function foodWords(value: string): string[] {
  return canonicalizeProductText(value).split(" ").filter(word => word.length > 1 && !REQUEST_STOP.has(word) && !/^\d/.test(word));
}

function equivalentFoodForm(line: ShoppingLine, productName: string): boolean {
  const wanted = new Set(foodWords(line.name));
  const seen = new Set(foodWords(productName));
  const rice = wanted.has("rice"), tofu = wanted.has("tofu");
  // Original is an explicit plain-tofu wording; preparation/flavour checks below still apply.
  if (tofu && wanted.has("plain") && seen.has("original")) seen.add("plain");
  if ((rice || tofu) && [...wanted].some(word => !seen.has(word))) return false;
  const restricted = rice ? RICE_FORMS : tofu ? TOFU_FORMS
    : line.category === "produce" || [...wanted].some(word => PRODUCE.has(word)) ? PRESERVED_FORMS : null;
  return !restricted || ![...seen].some(word => restricted.has(word) && !wanted.has(word));
}

/** Brand ties can inform a suggested estimate only for narrowly named plain staples. */
function simpleGrocerySuggestion(line: ShoppingLine, productName: string): boolean {
  const wanted = foodWords(line.name);
  const scoped = wanted.includes("tofu") && wanted.includes("firm")
    || wanted.includes("rice") && wanted.some(word => ["jasmine", "basmati", "white", "brown"].includes(word));
  return scoped && wanted.every(word => SIMPLE_GROCERY_WORDS.has(word)) && equivalentFoodForm(line, productName);
}

function catalogueOffers(line: ShoppingLine, quotes: readonly PriceQuote[], now: Date, area: string): ShoppingOffer[] {
  return quotes.filter(row => itemKey(row.query) === itemKey(line.name)
    && (!row.shop || areaKey(row.shop.area) === areaKey(area))
    && (!row.status || row.status === "ready" || row.status === "partial")
    && (row.source !== "local-shop-website" || Boolean(row.shop?.id && row.shop.name && row.shop.area))
    && (row.source !== "iga-online-catalogue" || Boolean(row.scope === "selected-store" && row.shop?.id && row.fulfilmentStoreId === row.shop.id))).flatMap(quote => {
  const retailerId = quote.source === "local-shop-website" ? null : quote.source.replace("-online-catalogue", "");
  const retailerName = quote.retailerName || ({ coles: "Coles", woolworths: "Woolworths", aldi: "ALDI", iga: "IGA" }[retailerId || ""] ?? "Shop");
  const shop = quote.shop;
  const publishedGuide = quote.source === "aldi-online-catalogue" || quote.source === "iga-online-catalogue" || quote.source === "local-shop-website";
  return quote.matches.slice(0, 6).filter(match => !ingredientPreparationConflict(line.name, match.name)).map((match): ShoppingOffer => {
    const current = freshness(quote.fetchedAt, now, 15 * 60_000);
    const preparedMismatch = match.preparedForm === "cooked-rice" && !foodWords(line.name).includes("cooked");
    const comparable = comparableState(line, match.name) && !preparedMismatch;
    const sameForm = equivalentFoodForm(line, match.name) && !preparedMismatch;
    const suggestion = Boolean(match.reviewable || publishedGuide && match.nameReviewable) && simpleGrocerySuggestion(line, match.name);
    const preparedReason = "Retailer metadata identifies cooked rice. No dry-to-cooked weight conversion was guessed; choose a dry-rice pack for this quantity.";
    const reviewReason = preparedMismatch ? preparedReason : suggestion && !match.selected ? "Suggested for this quantity: the requested ingredient and food form match. Review the brand and packet before buying." : !sameForm ? "This product uses a different food form or wording. Review it before choosing; it is excluded from the suggested estimate." : match.reason;
    const packageSize=productPackageSize(match.name,match.packageSize);
    const cost = comparable ? costShoppingQuantity(line.amount, line.unit, match.priceCents, packageSize) : unknownCost(preparedMismatch ? preparedReason : "Cooked or drained quantity is not established by this pack.");
    return {
      id: [quote.source, shop?.id ?? "", shop ? areaKey(shop.area) : "", line.id, match.url ?? "", match.name, match.packageSize ?? ""].map(encodeURIComponent).join(":"),
      productName: match.name,
      retailerId,
      shopId: shop?.id ?? null,
      shopName: shop?.name ?? `${retailerName} online`,
      source: quote.source,
      scope: shop ? "shop-online" : "chain-online",
      evidenceLabel: quote.label || `${retailerName} online price guide; confirm your chosen store.`,
      priceCents: match.priceCents,
      packageSize,
      stock: match.stock,
      fetchedAt: quote.fetchedAt,
      freshness: current,
      match: match.selected && !preparedMismatch ? "matched" : "review",
      reviewable: Boolean(match.reviewable ?? match.selected) && comparable && match.stock === "IN_STOCK" && match.priceCents != null && match.priceCents > 0
        || publishedGuide && Boolean(match.nameReviewable) && comparable && sameForm && match.stock !== "OUT_OF_STOCK" && match.priceCents != null && match.priceCents > 0,
      reviewReason,
      eligible: Boolean(match.selected || suggestion || publishedGuide && match.nameMatched) && sameForm && (match.stock === "IN_STOCK" || publishedGuide && match.stock === "UNKNOWN") && current === "current" && cost.lineCents != null,
      cost,
      url: match.url,
    };
  });
  });
}

function recordedOffers(line: ShoppingLine, quotes: readonly ItemQuote[], options: ShoppingCostOptions, now: Date): ShoppingOffer[] {
  const quote = quotes.find(row => row.itemKey === itemKey(line.name));
  if (!quote) return [];
  const seen = new Set<string>();
  return [...quote.specials, ...quote.records].slice(0, 16).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).filter(row => {
    if (row.area !== areaKey(options.area) || row.itemKey !== itemKey(line.name) || seen.has(row.id)) return false;
    const observationKey = `${row.shopId || itemKey(row.shopName)}:${row.kind}:${(row.packageSize ?? "").toLowerCase()}`;
    if (seen.has(observationKey)) return false;
    seen.add(row.id);
    seen.add(observationKey);
    return true;
  }).map((row: PriceMemory): ShoppingOffer => {
    const knownShop = row.shopId ? options.shops?.find(shop => shop.id === row.shopId) : undefined;
    const page = row.kind === "page" || Boolean(row.url);
    let current = freshness(row.at, now, page ? 24 * 60 * 60_000 : 7 * 24 * 60 * 60_000);
    if (row.kind === "special" && row.until) {
      if (!validDay(row.until)) current = "unknown";
      else if (row.until < localDay(now)) current = "stale";
    }
    const packageSize=productPackageSize(row.itemName,row.packageSize);
    const cost = costShoppingQuantity(line.amount, line.unit, row.cents, packageSize);
    return {
      id: `recorded:${row.id}`,
      productName: row.itemName,
      retailerId: retailer(knownShop?.name ?? row.shopName),
      shopId: knownShop?.id ?? null,
      shopName: knownShop?.name ?? row.shopName,
      source: page ? "public-page" : "recorded",
      scope: knownShop ? "shop-recorded" : "area-recorded",
      evidenceLabel: `${row.label}${row.kind === "special" && row.until ? ` Ends ${row.until}.` : ""} Stock and the current shelf price are unconfirmed.`,
      priceCents: row.cents,
      packageSize,
      stock: "UNKNOWN",
      fetchedAt: row.at,
      freshness: current,
      match: "matched",
      reviewable: true,
      reviewReason: "User-recorded item wording. Verify the pack and current shelf price.",
      eligible: current === "current" && cost.lineCents != null,
      cost,
      url: row.url || null,
    };
  });
}

export interface ShoppingCostOptions {
  area: string;
  shops?: readonly { id: string; name: string }[];
  now?: Date;
}

export function buildShoppingOffers(lines: readonly ShoppingLine[], catalogue: readonly PriceQuote[], recorded: readonly ItemQuote[], options: ShoppingCostOptions): ShoppingCostLine[] {
  const now = options.now ?? new Date();
  return lines.map(line => {
    const offers = [...catalogueOffers(line, catalogue, now, options.area), ...recordedOffers(line, recorded, options, now)];
    const chosen = offers.filter(offer => offer.eligible).sort((a, b) => (a.cost.lineCents as number) - (b.cost.lineCents as number) || a.id.localeCompare(b.id))[0];
    const noNeed = line.amount === 0;
    return {
      id: line.id, name: line.name, amount: line.amount, unit: line.unit,
      offers,
      chosenOfferId: noNeed ? null : chosen?.id ?? null,
      estimatedCents: noNeed ? 0 : chosen?.cost.lineCents ?? null,
      reason: noNeed ? "Nothing to buy for this line." : chosen ? chosen.match === "review" ? "Suggested quantity estimate. Review the product and packet before buying." : null : offers.length ? "Check the match, freshness and selling quantity before estimating this item." : "No price found. This item is not counted as $0.",
    };
  });
}

export function isShoppingOfferSelectable(offer: ShoppingOffer): boolean {
  const online = offer.scope === "chain-online" || offer.scope === "shop-online";
  const publishedGuide = offer.source === "aldi-online-catalogue" || offer.source === "iga-online-catalogue" || offer.source === "local-shop-website";
  const selling=sellingQuantity(productPackageSize(offer.productName,offer.packageSize));
  // Old browser data may still contain a bunch costed as individual stalks.
  if(selling?.quantity.family==="bunch"&&quantity(offer.cost.purchasedAmount??0,offer.cost.purchasedUnit??"")?.family!=="bunch")return false;
  return (offer.eligible || offer.reviewable) && offer.freshness === "current"
    && (!online || offer.stock === "IN_STOCK" || publishedGuide && offer.stock === "UNKNOWN")
    && offer.priceCents != null && Number.isSafeInteger(offer.priceCents) && offer.priceCents > 0
    && offer.cost.lineCents != null && Number.isSafeInteger(offer.cost.lineCents) && offer.cost.lineCents >= 0;
}

/** Explicit review can resolve brand ambiguity, while hard restrictions still apply. */
export function applyShoppingOfferSelection(row: ShoppingCostLine, offerId: string | null): ShoppingCostLine {
  if (row.amount === 0) return row;
  if (offerId === null) return { ...row, chosenOfferId: null, estimatedCents: null, reason: "No offer selected. This line is excluded from the estimate." };
  const chosen = row.offers.find(offer => offer.id === offerId);
  if (!chosen || !isShoppingOfferSelectable(chosen) || ingredientPreparationConflict(row.name, chosen.productName)) return row;
  return { ...row, chosenOfferId: chosen.id, estimatedCents: chosen.cost.lineCents, reason: chosen.match === "review" ? "You selected this product after reviewing the match. Verify the packet." : null };
}

export function applyShoppingOfferSelections(rows: readonly ShoppingCostLine[], selections: Readonly<Record<string, string | null>>): ShoppingCostLine[] {
  return rows.map(row => {
    if (!Object.prototype.hasOwnProperty.call(selections, row.id)) return row;
    const selection = selections[row.id];
    if (selection !== null && !row.offers.some(offer => offer.id === selection && isShoppingOfferSelectable(offer) && !ingredientPreparationConflict(row.name, offer.productName))) return { ...row, chosenOfferId: null, estimatedCents: null, reason: "Your previous product choice is no longer available for this estimate. Review another offer." };
    return applyShoppingOfferSelection(row, selection);
  });
}

/** A mixed-source estimate of known lines, never a confirmed basket at one shop. */
export function summarizeShoppingCosts(rows: readonly ShoppingCostLine[], totalLines = rows.length): { knownSubtotalCents: number | null; pricedLines: number; totalLines: number; unpricedLines: number; complete: boolean; label: string } {
  const priced = rows.filter(row => row.estimatedCents != null && Number.isSafeInteger(row.estimatedCents) && (row.estimatedCents as number) >= 0);
  const count = Math.max(rows.length, Number.isSafeInteger(totalLines) && totalLines >= 0 ? totalLines : rows.length);
  const complete = priced.length === count;
  return {
    knownSubtotalCents: priced.length ? priced.reduce((sum, row) => sum + (row.estimatedCents as number), 0) : null,
    pricedLines: priced.length,
    totalLines: count,
    unpricedLines: count - priced.length,
    complete,
    label: complete ? "Estimate for the listed quantities from the available sources. This is not a confirmed basket at one shop." : "Partial estimate for priced quantities only. Missing prices are excluded; this is not a full basket total.",
  };
}
