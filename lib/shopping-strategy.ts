import { distanceKm, MAX_RADIUS_KM, type Shop } from "./locations.ts";
import { ingredientIdentityConflict, ingredientPreparationConflict, isNonFoodCatalogueProduct, matchProducts } from "./product-match.ts";
import { costShoppingQuantity, isShoppingOfferSelectable, ricePackPreparationUnverified, shoppingHerbPackUnverified, summarizeShoppingCosts, type ShoppingCostLine, type ShoppingOffer } from "./shopping-costs.ts";
import { normalizeShoppingLine, type ShoppingLine } from "./shopping.ts";

export type ShoppingStrategyMode = "cheapest" | "woolworths" | "coles" | "aldi" | "iga";
export interface ShoppingStrategy {
  mode: ShoppingStrategyMode;
  specialists: boolean;
  butcherShopId: string;
  produceShopId: string;
}
export const DEFAULT_SHOPPING_STRATEGY: ShoppingStrategy = { mode: "cheapest", specialists: false, butcherShopId: "", produceShopId: "" };
export const SHOPPING_STRATEGY_LABELS: Record<ShoppingStrategyMode, string> = {
  cheapest: "Cheapest per item", woolworths: "Woolworths only", coles: "Coles only", aldi: "ALDI only", iga: "IGA only",
};
const RETAILER_NAMES = { woolworths: "Woolworths", coles: "Coles", aldi: "ALDI", iga: "IGA" };
const MODES = new Set<ShoppingStrategyMode>(["cheapest", "woolworths", "coles", "aldi", "iga"]);
const cleanId = (value: unknown) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 160) : "";

/** Persist a choice per shopping area; a stored shop id is revalidated on every application. */
export function normalizeShoppingStrategy(value: unknown): ShoppingStrategy {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    mode: MODES.has(row.mode as ShoppingStrategyMode) ? row.mode as ShoppingStrategyMode : "cheapest",
    specialists: row.specialists === true,
    butcherShopId: cleanId(row.butcherShopId),
    produceShopId: cleanId(row.produceShopId),
  };
}

export interface ShoppingStrategyArea {
  location: { lat: number; lon: number } | null;
  radiusKm: number;
}
export interface ShoppingStrategyOptions extends ShoppingStrategyArea {
  shops: readonly Shop[];
  /** Only explicit user reviews belong here; automatic/default chosen ids are not overrides. */
  offerSelections?: Readonly<Record<string, string | null>>;
}
export interface ShoppingStrategyShop {
  id: string;
  name: string;
  kind: "retailer" | "butcher" | "produce" | "offer";
  shopId: string | null;
  retailerId: string | null;
  scope: ShoppingOffer["scope"] | "shop-unpriced";
}
export interface ShoppingStrategyLine extends ShoppingCostLine {
  assignedShop: ShoppingStrategyShop | null;
  selectionState: "priced" | "unknown" | "pantry";
  strategyReason: string;
  /** Safe manual-review candidates within this strategy. Other offers are comparisons only. */
  allowedOfferIds: string[];
}
export interface ShoppingStrategyResult {
  rows: ShoppingStrategyLine[];
  summary: ReturnType<typeof summarizeShoppingCosts>;
}

function validPoint(value: { lat: number; lon: number } | null): value is { lat: number; lon: number } {
  return !!value && Number.isFinite(value.lat) && value.lat >= -90 && value.lat <= 90 && Number.isFinite(value.lon) && value.lon >= -180 && value.lon <= 180;
}
function specialistKind(shop: Shop): "butcher" | "produce" | null {
  const type = shop.shopType?.trim().toLowerCase();
  if (type) return type === "butcher" ? "butcher" : type === "greengrocer" || type === "farm" ? "produce" : null;
  return shop.kind === "butcher" || shop.kind === "produce" ? shop.kind : null;
}

/** Recompute distance from the current area, rather than trusting a previous area's saved distance. */
function nearbyShops(shops: readonly Shop[], options: ShoppingStrategyArea): Shop[] {
  if (!validPoint(options.location) || !Number.isFinite(options.radiusKm) || options.radiusKm <= 0 || options.radiusKm > MAX_RADIUS_KM) return [];
  const origin = options.location, seen = new Set<string>();
  const nearby = shops.flatMap(shop => {
    if (!shop.id || !shop.name.trim() || seen.has(shop.id) || !validPoint(shop)) return [];
    const km = distanceKm(origin.lat, origin.lon, shop.lat, shop.lon);
    const uncertaintyKm = shop.locationAccuracy === "shopping-centre" ? 0.5 : 0;
    if (!Number.isFinite(km) || km + uncertaintyKm > options.radiusKm + 1e-9) return [];
    seen.add(shop.id);
    return [{ ...shop, distanceKm: km }];
  }).sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return nearby;
}
export function availableSpecialistShops(shops: readonly Shop[], options: ShoppingStrategyArea): { butchers: Shop[]; produce: Shop[] } {
  const nearby = nearbyShops(shops, options);
  return { butchers: nearby.filter(shop => specialistKind(shop) === "butcher"), produce: nearby.filter(shop => specialistKind(shop) === "produce") };
}

/** Fresh ingredients only: a category inherited from old data cannot route a sauce or substitute to a butcher. */
export function shoppingSpecialistKind(line: ShoppingLine): "butcher" | "produce" | null {
  const normalized = normalizeShoppingLine(line);
  const name = normalized.name.toLowerCase().replace(/[’']/g, "");
  if (/\b(vegan|vegetarian|plant[ -]?based|meat[ -]?free|tofu|tempeh|quorn|jackfruit)\b/.test(name)) return null;
  if (/\b(stock|broth|sauce|paste|powder|dried|dehydrated|flakes?|flour|crumbs?|breadcrumbs|canned|tinned|frozen|oil|vinegar|milk|cream|yogh?urt|cheese|butter|seasoning|rub|marinade|flavouring|cooked|pickled|preserved|concentrate|puree|purée|juice)\b/.test(name)) return null;
  if (/\b(ready[ -]?to[ -]?eat|deli|carved|shredded|smoked|cured|ham|salami|prosciutto|pancetta|chorizo|bacon)\b/.test(name)) return null;
  if (/\b(rotisserie|hot[ -]+roast|roasted|braised|stewed|grilled|chargrilled|baked|poached|steamed|boiled|fried|pulled|confit|peking[ -]+duck|char[ -]+siu|tandoori[ -]+chicken|heat[ -]+(?:and|&)[ -]+serve|recipe[ -]+base|pesto|relish|chutney|biscuits?|cookies?|bread|cakes?|beer|cordial)\b/.test(name)) return null;
  return normalized.category === "butcher" || normalized.category === "produce" ? normalized.category : null;
}

function offerShop(offer: ShoppingOffer): ShoppingStrategyShop {
  return { id: offer.shopId || `retailer:${offer.retailerId || offer.shopName}`, name: offer.shopName, kind: offer.shopId ? "offer" : offer.scope === "chain-online" ? "retailer" : "offer", shopId: offer.shopId, retailerId: offer.retailerId, scope: offer.scope };
}
function localAssignment(shop: Shop, kind: "butcher" | "produce"): ShoppingStrategyShop {
  return { id: shop.id, name: shop.name, kind, shopId: shop.id, retailerId: null, scope: "shop-unpriced" };
}
function safeOffer(line: ShoppingLine, offer: ShoppingOffer): boolean {
  if (!isShoppingOfferSelectable(offer) || isNonFoodCatalogueProduct({ name: offer.productName })) return false;
  if (ingredientIdentityConflict(line.name, offer.productName) || ingredientPreparationConflict(line.name, offer.productName) || ricePackPreparationUnverified(line.name, offer.productName) || shoppingHerbPackUnverified(line.name, offer)) return false;
  const identity = matchProducts(line.name, [{ stockcode: null, name: offer.productName, priceCents: offer.priceCents, packageSize: offer.packageSize, inStock: offer.stock === "IN_STOCK", available: offer.stock === "IN_STOCK" }])[0];
  if (!identity || !(identity.selected || identity.reviewable || identity.nameReviewable)) return false;
  // Cached totals for an old amount must not masquerade as this line's cost.
  const recomputed = costShoppingQuantity(line.amount, line.unit, offer.priceCents, offer.packageSize);
  return recomputed.lineCents !== null && recomputed.lineCents === offer.cost.lineCents;
}

/**
 * Choose only observed offers that satisfy the user's seller policy. Planning allowances
 * deliberately do not enter this total: an unpriced butcher assignment stays unknown.
 */
export function applyShoppingStrategy(lines: readonly ShoppingLine[], priceRows: readonly ShoppingCostLine[], value: ShoppingStrategy, options: ShoppingStrategyOptions): ShoppingStrategyResult {
  const strategy = normalizeShoppingStrategy(value);
  const specialists = availableSpecialistShops(options.shops, options);
  const nearbyIds = new Set(nearbyShops(options.shops, options).map(shop => shop.id));
  const currentAreaOffer = (offer: ShoppingOffer) => offer.scope === "chain-online" || offer.scope === "area-recorded"
    ? !offer.shopId
    : !!offer.shopId && nearbyIds.has(offer.shopId);
  const priceById = new Map(priceRows.map(row => [row.id, row]));
  const rows = lines.map((line): ShoppingStrategyLine => {
    const cached = priceById.get(line.id);
    const current = cached?.name === line.name && cached.amount === line.amount && cached.unit === line.unit ? cached : null;
    const base: ShoppingCostLine = current || { id: line.id, name: line.name, amount: line.amount, unit: line.unit, offers: [], chosenOfferId: null, estimatedCents: null, reason: null };
    if (line.amount === 0) return { ...base, chosenOfferId: null, estimatedCents: 0, reason: "Nothing to buy for this line.", assignedShop: null, selectionState: "pantry", strategyReason: "Nothing to buy for this line.", allowedOfferIds: [] };
    let assignedShop: ShoppingStrategyShop | null = null;
    let reason = "No eligible price is available for this item. Price unknown; it is not counted as $0.";
    let allows: (offer: ShoppingOffer) => boolean = () => true;
    const kind = strategy.specialists ? shoppingSpecialistKind(line) : null;
    if (kind) {
      const choices = kind === "butcher" ? specialists.butchers : specialists.produce;
      const id = kind === "butcher" ? strategy.butcherShopId : strategy.produceShopId;
      const shop = id ? choices.find(candidate => candidate.id === id) : choices[0];
      if (shop) {
        assignedShop = localAssignment(shop, kind);
        allows = offer => offer.shopId === shop.id && (offer.scope === "shop-online" || offer.scope === "shop-recorded");
        reason = `Assigned to ${shop.name}. No usable price is published or recorded for this quantity; price unknown. Check availability with the shop.`;
      } else {
        allows = () => false;
        reason = id ? `The selected ${kind === "butcher" ? "butcher" : "fruit and vegetable shop"} is no longer within this shopping area and radius. Choose another local shop; price unknown.` : `No local ${kind === "butcher" ? "butcher" : "fruit and vegetable shop"} is listed within this radius. Choose a shop or widen the search; price unknown.`;
      }
    } else if (strategy.mode !== "cheapest") {
      const retailer = strategy.mode;
      assignedShop = { id: `retailer:${retailer}`, name: RETAILER_NAMES[retailer], kind: "retailer", shopId: null, retailerId: retailer, scope: "chain-online" };
      // An unassociated area record is not evidence that this chain sold that item.
      allows = offer => offer.retailerId === retailer && offer.scope !== "area-recorded";
      reason = `No eligible ${RETAILER_NAMES[retailer]} price for this quantity. Price unknown; prices from other shops are excluded.`;
    }
    const candidates = base.offers.filter(offer => currentAreaOffer(offer) && allows(offer) && safeOffer(line, offer));
    const explicit = options.offerSelections && Object.prototype.hasOwnProperty.call(options.offerSelections, line.id);
    const selectedId = explicit ? options.offerSelections![line.id] : undefined;
    const chosen = explicit ? candidates.find(offer => offer.id === selectedId) : candidates.filter(offer => offer.eligible).sort((a, b) => a.cost.lineCents! - b.cost.lineCents! || a.id.localeCompare(b.id))[0];
    if (explicit && !chosen) reason = selectedId === null ? "No product selected. Price unknown; this item is excluded from the known subtotal." : "The selected product is no longer available within your shop choice. Review another product; price unknown.";
    if (chosen) {
      assignedShop = kind && assignedShop ? { ...assignedShop, scope: chosen.scope } : offerShop(chosen);
      reason = explicit ? "You chose this product within your selected shops. Confirm the packet, stock and final price." : strategy.mode === "cheapest" && !kind ? "Lowest available eligible quantity price across the checked shops. Stock and final shelf price need confirmation." : "Lowest available eligible quantity price at the selected shop. Confirm stock and the final price.";
    }
    return { ...base, chosenOfferId: chosen?.id ?? null, estimatedCents: chosen?.cost.lineCents ?? null, reason, assignedShop, selectionState: chosen ? "priced" : "unknown", strategyReason: reason, allowedOfferIds: candidates.map(offer => offer.id) };
  });
  return { rows, summary: summarizeShoppingCosts(rows, lines.length) };
}
