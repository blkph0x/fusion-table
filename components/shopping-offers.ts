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
}

/** Keep failed chain lookups visible while preserving independent local evidence. */
export function shoppingVendorCards(rows: readonly ShoppingCostLine[], warnings: readonly string[]): ShoppingVendorCard[] {
  if (!rows.length) return [];
  const guides = [
    { retailer: "woolworths", name: "Woolworths online", url: "https://www.woolworths.com.au/", linkLabel: "Check Woolworths" },
    { retailer: "coles", name: "Coles online", url: "https://www.coles.com.au/", linkLabel: "Check Coles" },
  ];
  const vendors = new Map<string, ShoppingVendorCard & { lineIds: Set<string> }>();
  for (const guide of guides) {
    const hasOffers = rows.some((row) => row.offers.some((offer) => offer.scope === "chain-online" && offer.retailerId === guide.retailer));
    const unavailable = warnings.some((warning) => warning.toLowerCase().includes(guide.retailer));
    const id = `chain-online|${guide.retailer}`;
    vendors.set(id, { id, name: guide.name, scope: "chain-online", cents: null, pricedLines: 0, status: unavailable ? "Lookup unavailable" : hasOffers ? "Review products below" : "No matched prices", url: guide.url, linkLabel: guide.linkLabel, lineIds: new Set() });
  }
  for (const row of rows) {
    const best = new Map<string, ShoppingOffer>();
    for (const offer of row.offers) {
      if ((!offer.eligible && row.chosenOfferId !== offer.id) || !isShoppingOfferSelectable(offer) || offer.cost.lineCents == null) continue;
      const key = sourceKey(offer);
      if (!best.has(key) || (best.get(key)?.cost.lineCents ?? Infinity) > offer.cost.lineCents) best.set(key, offer);
    }
    for (const [id, offer] of best) {
      const vendor = vendors.get(id) || { id, name: offer.shopName, scope: offer.scope, cents: null, pricedLines: 0, status: "", url: null, linkLabel: null, lineIds: new Set<string>() };
      if (!vendor.lineIds.has(row.id)) { vendor.cents = (vendor.cents || 0) + offer.cost.lineCents!; vendor.lineIds.add(row.id); }
      vendor.pricedLines = vendor.lineIds.size;
      vendor.status = "";
      vendors.set(id, vendor);
    }
  }
  return [...vendors.values()].map((vendor) => ({ id: vendor.id, name: vendor.name, scope: vendor.scope, cents: vendor.cents, pricedLines: vendor.pricedLines, status: vendor.status, url: vendor.url, linkLabel: vendor.linkLabel }));
}
