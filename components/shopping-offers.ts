import { isShoppingOfferSelectable, type ShoppingCostLine, type ShoppingOffer } from "../lib/shopping-costs.ts";

function sourceKey(offer: ShoppingOffer): string {
  return `${offer.scope}|${offer.shopId || offer.retailerId || offer.shopName.trim().toLowerCase()}`;
}

/** Show different sellers before alternate brands and packs from one seller. */
export function shoppingOfferPreview(offers: readonly ShoppingOffer[], chosenOfferId: string | null): ShoppingOffer[] {
  const sellers = new Map<string, ShoppingOffer[]>();
  for (const offer of offers) {
    const key = sourceKey(offer);
    const products = sellers.get(key) || [];
    products.push(offer);
    sellers.set(key, products);
  }
  const representatives = [...sellers.values()].map((products) => {
    const chosen = products.find((offer) => offer.id === chosenOfferId);
    if (chosen) return chosen;
    const eligible = products.filter((offer) => offer.eligible && isShoppingOfferSelectable(offer));
    if (eligible.length) return eligible.reduce((best, offer) => (offer.cost.lineCents ?? Infinity) < (best.cost.lineCents ?? Infinity) ? offer : best);
    // Review candidates retain provider order: a lower price alone cannot establish a food match.
    return products.find(isShoppingOfferSelectable) || products[0];
  });
  const preview = representatives.slice(0, 4);
  const localPublished = representatives.find(offer => String(offer.source) === "local-shop-website" && isShoppingOfferSelectable(offer));
  if (localPublished && !preview.some(offer => offer.id === localPublished.id)) preview[preview.length - 1] = localPublished;
  const chosen = representatives.find((offer) => offer.id === chosenOfferId);
  if (chosen && !preview.some((offer) => offer.id === chosen.id)) preview[preview.length - 1] = chosen;
  return preview;
}

export interface ShoppingVendorCard {
  id: string;
  name: string;
  scope: ShoppingOffer["scope"];
  cents: number | null;
  pricedLines: number;
  status: string;
  url: string | null;
  linkLabel: string | null;
  message?: string;
  needsAction?: boolean;
}

export interface ShoppingProviderStatus {
  id: string;
  name: string;
  status: "ready" | "partial" | "needs-browser" | "needs-store" | "unavailable" | "not-configured";
  message: string;
  url?: string;
  shopId?: string;
  shopName?: string;
}
const PROVIDER_STATES = new Set(["ready", "partial", "needs-browser", "needs-store", "unavailable", "not-configured"]);
const plain = (value: unknown, max: number) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
function publicLink(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 800) return;
  try { const url = new URL(value); if (url.protocol === "https:" && !url.username && !url.password && !url.port) return url.href; } catch { /* Invalid links are not offered. */ }
}
/** API metadata is display data, never an instruction to execute a retailer challenge. */
export function readProviderStatuses(value: unknown): ShoppingProviderStatus[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 32).flatMap(raw => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const row = raw as Record<string, unknown>, id = plain(row.id, 120), name = plain(row.name, 160), message = plain(row.message, 500);
    if (!/^[a-z0-9][a-z0-9_:/.-]{0,119}$/i.test(id) || !name || !PROVIDER_STATES.has(String(row.status))) return [];
    const url = publicLink(row.url), shopId = plain(row.shopId, 120), shopName = plain(row.shopName, 160);
    return [{ id, name, status: row.status as ShoppingProviderStatus["status"], message, ...(url ? { url } : {}), ...(shopId ? { shopId } : {}), ...(shopName ? { shopName } : {}) }];
  });
}
/** A blocked sub-batch remains visible even when another batch found a price. */
export function mergeProviderStatuses(...groups: readonly (readonly ShoppingProviderStatus[])[]): ShoppingProviderStatus[] {
  const severity = { ready: 0, partial: 1, "not-configured": 2, unavailable: 3, "needs-store": 4, "needs-browser": 5 };
  const merged = new Map<string, ShoppingProviderStatus>();
  for (const rows of groups) for (const row of rows) {
    const previous = merged.get(row.id);
    if (!previous || severity[row.status] >= severity[previous.status]) merged.set(row.id, row);
  }
  return [...merged.values()];
}
export function shoppingScopeLabel(scope: ShoppingOffer["scope"], source?: ShoppingOffer["source"]): string {
  if (scope === "chain-online") return "Online price guide";
  if (source === "public-page" || String(source) === "local-shop-website" || String(scope) === "shop-online") return "Published shop price";
  return "Recorded local price";
}

/** Keep failed chain lookups visible while preserving independent local evidence. */
export function shoppingVendorCards(rows: readonly ShoppingCostLine[], warnings: readonly string[], statuses: readonly ShoppingProviderStatus[] = [], options: { includeEmpty?: boolean; checking?: boolean } = {}): ShoppingVendorCard[] {
  if (!rows.length && !statuses.length && !options.includeEmpty) return [];
  const guides = [
    { retailer: "woolworths", name: "Woolworths online", url: "https://www.woolworths.com.au/", linkLabel: "Check Woolworths" },
    { retailer: "coles", name: "Coles online", url: "https://www.coles.com.au/", linkLabel: "Check Coles" },
    { retailer: "iga", name: "IGA", url: "https://www.igashop.com.au/", linkLabel: "Choose an IGA store" },
    { retailer: "aldi", name: "ALDI", url: "https://www.aldi.com.au/results", linkLabel: "Check ALDI products" },
  ];
  const vendors = new Map<string, ShoppingVendorCard & { lineIds: Set<string> }>();
  for (const guide of guides) {
    const hasOffers = rows.some((row) => row.offers.some((offer) => offer.scope === "chain-online" && offer.retailerId === guide.retailer));
    const provider = statuses.find(status => status.id === guide.retailer);
    const relevantWarnings = warnings.filter(warning => new RegExp(`\\b${guide.retailer}\\b`, "i").test(warning));
    const unavailable = relevantWarnings.length > 0;
    const needsBrowser = provider?.status === "needs-browser" || relevantWarnings.some(warning => /captcha|challenge|cookies|javascript|human|browser check/i.test(warning));
    const needsStore = provider?.status === "needs-store";
    const needsAction = needsBrowser || needsStore;
    const status = needsBrowser ? "Open retailer to complete its check" : needsStore ? "Choose a store on the retailer" : provider?.status === "not-configured" ? "Browser checking is not configured" : unavailable || provider?.status === "unavailable" ? "Lookup unavailable" : options.checking && !provider && !hasOffers ? "Checking prices" : hasOffers ? "Review products below" : "No matched prices";
    const id = `chain-online|${guide.retailer}`;
    vendors.set(id, { id, name: guide.name, scope: "chain-online", cents: null, pricedLines: 0, status, url: publicLink(provider?.url) || guide.url, linkLabel: needsBrowser ? `Open ${guide.name.replace(" online", "")}` : guide.linkLabel, message: provider?.message || (needsBrowser ? "The retailer needs a normal browser visit. Choose your store and complete any check yourself; its cookies stay on that retailer." : guide.retailer === "iga" ? "IGA prices and available products vary by store." : guide.retailer === "aldi" ? "Product guides do not confirm stock at a nearby ALDI." : "Choose your store on the retailer to confirm its price and availability."), needsAction, lineIds: new Set() });
  }
  for (const row of rows) {
    const best = new Map<string, ShoppingOffer>();
    for (const offer of row.offers) {
      if ((!offer.eligible && row.chosenOfferId !== offer.id) || !isShoppingOfferSelectable(offer) || offer.cost.lineCents == null) continue;
      const key = sourceKey(offer);
      if (!best.has(key) || (best.get(key)?.cost.lineCents ?? Infinity) > offer.cost.lineCents) best.set(key, offer);
    }
    for (const [id, offer] of best) {
      const vendor: ShoppingVendorCard & { lineIds: Set<string> } = vendors.get(id) || { id, name: offer.shopName, scope: offer.scope, cents: null, pricedLines: 0, status: "", url: publicLink(offer.url) || null, linkLabel: offer.url ? "Open shop product" : null, lineIds: new Set<string>() };
      if (!vendor.lineIds.has(row.id)) { vendor.cents = (vendor.cents || 0) + offer.cost.lineCents!; vendor.lineIds.add(row.id); }
      vendor.pricedLines = vendor.lineIds.size;
      if (!vendor.needsAction) vendor.status = "";
      vendors.set(id, vendor);
    }
  }
  for (const status of statuses.filter(status => !guides.some(guide => guide.retailer === status.id))) {
    const existing = [...vendors.values()].find(vendor => vendor.id.endsWith(`|${status.shopId || status.id}`));
    if (existing) { existing.message = status.message; continue; }
    const id = `local-status|${status.shopId || status.id}`;
    vendors.set(id, { id, name: status.shopName || status.name, scope: "shop-recorded", cents: null, pricedLines: 0, status: status.status === "needs-browser" ? "Open shop to complete its check" : status.status === "needs-store" ? "Choose a shop first" : status.status === "not-configured" ? "Shop checking is not configured" : status.status === "ready" ? "No compatible quantity price" : "No published prices found", url: publicLink(status.url) || null, linkLabel: status.url ? "Open shop website" : null, message: status.message, needsAction: status.status === "needs-browser" || status.status === "needs-store", lineIds: new Set() });
  }
  return [...vendors.values()].map((vendor) => ({ id: vendor.id, name: vendor.name, scope: vendor.scope, cents: vendor.cents, pricedLines: vendor.pricedLines, status: vendor.status, url: vendor.url, linkLabel: vendor.linkLabel, message: vendor.message, needsAction: vendor.needsAction }));
}
