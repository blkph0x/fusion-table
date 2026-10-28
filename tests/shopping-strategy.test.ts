import assert from "node:assert/strict";
import { test } from "node:test";
import type { Shop } from "../lib/locations.ts";
import { applyShoppingStrategy, availableSpecialistShops, DEFAULT_SHOPPING_STRATEGY, normalizeShoppingStrategy, shoppingSpecialistKind, type ShoppingStrategy } from "../lib/shopping-strategy.ts";
import { costShoppingQuantity, type ShoppingCostLine, type ShoppingOffer } from "../lib/shopping-costs.ts";
import type { ShoppingLine } from "../lib/shopping.ts";

const origin = { lat: -34.57, lon: 150.77 };
const chicken: ShoppingLine = { id: "chicken", name: "Chicken breast fillets", amount: 600, unit: "g", category: "butcher" };
const carrots: ShoppingLine = { id: "carrots", name: "Fresh carrots", amount: 500, unit: "g", category: "produce" };
const rice: ShoppingLine = { id: "rice", name: "Jasmine rice", amount: 500, unit: "g", category: "grocery" };
const butcher = shop("butcher-a", "Village Butcher", "butcher", 0.004);
const produce = shop("produce-a", "Local Fruit Market", "produce", 0.005);
const area = { shops: [butcher, produce], location: origin, radiusKm: 10 };

function shop(id: string, name: string, kind: Shop["kind"], offset = 0): Shop {
  return { id, name, kind, lat: origin.lat + offset, lon: origin.lon, distanceKm: 999, address: "Public shop address", website: null, phone: null, openingHours: null, osmUrl: "https://www.openstreetmap.org/", inventoryStatus: "unverified" };
}
function strategy(overrides: Partial<ShoppingStrategy> = {}): ShoppingStrategy {
  return { ...DEFAULT_SHOPPING_STRATEGY, ...overrides };
}
function offer(line: ShoppingLine, id: string, retailerId: string | null, priceCents: number, packageSize: string, overrides: Partial<ShoppingOffer> = {}): ShoppingOffer {
  return { id, productName: line.name, retailerId, shopId: null, shopName: `${retailerId || "Local"} online`, source: "woolworths-online-catalogue", scope: "chain-online", evidenceLabel: "Published guide; check stock.", priceCents, packageSize, stock: "IN_STOCK", fetchedAt: "2026-10-28T07:30:00Z", freshness: "current", match: "matched", reviewable: true, reviewReason: null, eligible: true, cost: costShoppingQuantity(line.amount, line.unit, priceCents, packageSize), url: null, ...overrides };
}
function row(line: ShoppingLine, offers: ShoppingOffer[], overrides: Partial<ShoppingCostLine> = {}): ShoppingCostLine {
  return { id: line.id, name: line.name, amount: line.amount, unit: line.unit, offers, chosenOfferId: offers[0]?.id || null, estimatedCents: offers[0]?.cost.lineCents ?? null, reason: null, ...overrides };
}
function local(line: ShoppingLine, target: Shop, priceCents = 1200): ShoppingOffer {
  return offer(line, `${target.id}-${line.id}`, null, priceCents, "per kg", { shopId: target.id, shopName: target.name, source: "local-shop-website", scope: "shop-online", stock: "UNKNOWN" });
}

test("cheapest mixes shops per ingredient and compares required whole-pack costs", () => {
  const prices = [row(chicken, [offer(chicken, "small", "woolworths", 500, "500 g"), offer(chicken, "large", "coles", 700, "1 kg")]), row(carrots, [offer(carrots, "aldi", "aldi", 199, "1 kg"), offer(carrots, "ww", "woolworths", 300, "500 g")])];
  const result = applyShoppingStrategy([chicken, carrots], prices, strategy(), area);
  assert.deepEqual(result.rows.map(line => [line.chosenOfferId, line.estimatedCents, line.assignedShop?.retailerId]), [["large", 700, "coles"], ["aldi", 199, "aldi"]]);
  assert.equal(result.summary.knownSubtotalCents, 899);
  assert.equal(result.summary.complete, true);
  assert.equal(prices[0].chosenOfferId, "small", "selection must not mutate cached offers");
});

for (const retailer of ["woolworths", "coles", "aldi", "iga"] as const) {
  test(`${retailer}-only never fills a missing item with another retailer or planning value`, () => {
    const own = offer(chicken, "own", retailer, 800, "1 kg");
    const other = offer(chicken, "cheaper", retailer === "coles" ? "aldi" : "coles", 100, "1 kg");
    const result = applyShoppingStrategy([chicken, carrots], [row(chicken, [other, own]), row(carrots, [offer(carrots, "other-carrots", retailer === "coles" ? "aldi" : "coles", 100, "1 kg")])], strategy({ mode: retailer }), area);
    assert.equal(result.rows[0].chosenOfferId, "own");
    assert.equal(result.rows[1].chosenOfferId, null);
    assert.equal(result.rows[1].estimatedCents, null);
    assert.equal(result.rows[1].assignedShop?.retailerId, retailer);
    assert.equal(result.summary.knownSubtotalCents, 800);
    assert.equal(result.summary.unpricedLines, 1);
    assert.equal(result.summary.complete, false);
  });
}

test("specialists override supermarket choice for fresh meat and produce only", () => {
  const result = applyShoppingStrategy([chicken, carrots, rice], [row(chicken, [offer(chicken, "cheap", "woolworths", 200, "1 kg"), local(chicken, butcher)]), row(carrots, [local(carrots, produce, 400)]), row(rice, [offer(rice, "rice", "woolworths", 350, "1 kg")])], strategy({ mode: "woolworths", specialists: true }), area);
  assert.deepEqual(result.rows.map(line => [line.assignedShop?.name, line.estimatedCents]), [[butcher.name, 720], [produce.name, 200], ["woolworths online", 350]]);
  assert.equal(result.rows[0].assignedShop?.kind, "butcher");
  assert.equal(result.rows[0].assignedShop?.scope, "shop-online");
  assert.equal(result.summary.knownSubtotalCents, 1270);
});

test("an unpriced chosen specialist stays assigned with unknown cost despite chain and planning prices", () => {
  const result = applyShoppingStrategy([chicken], [row(chicken, [offer(chicken, "ww", "woolworths", 500, "1 kg")], { planningEstimate: { purchaseCents: 900 } as ShoppingCostLine["planningEstimate"] })], strategy({ specialists: true, butcherShopId: butcher.id }), area);
  const item = result.rows[0];
  assert.equal(item.assignedShop?.shopId, butcher.id);
  assert.equal(item.assignedShop?.scope, "shop-unpriced");
  assert.equal(item.selectionState, "unknown");
  assert.equal(item.estimatedCents, null);
  assert.equal(item.chosenOfferId, null);
  assert.equal(result.summary.knownSubtotalCents, null);
  assert.equal(result.summary.unpricedLines, 1);
  assert.match(item.reason!, /price unknown/i);
});

test("specialist matching requires the exact branch id and local scope", () => {
  const another = shop("butcher-b", butcher.name, "butcher", 0.006);
  const wrong = local(chicken, another, 100);
  const deceptive = offer(chicken, "deceptive", "woolworths", 100, "1 kg", { shopId: butcher.id, shopName: butcher.name, scope: "chain-online" });
  const right = local(chicken, butcher);
  const result = applyShoppingStrategy([chicken], [row(chicken, [wrong, deceptive, right])], strategy({ specialists: true, butcherShopId: butcher.id }), { ...area, shops: [butcher, another] });
  assert.equal(result.rows[0].chosenOfferId, right.id);
  assert.deepEqual(result.rows[0].allowedOfferIds, [right.id]);
});

test("no local shop never silently falls back to supermarkets or a stale selected shop", () => {
  const input = [row(chicken, [offer(chicken, "ww", "woolworths", 500, "1 kg")])];
  for (const selectedId of ["", "removed-shop"]) {
    const result = applyShoppingStrategy([chicken], input, strategy({ specialists: true, butcherShopId: selectedId }), { ...area, shops: [] });
    assert.equal(result.rows[0].assignedShop, null);
    assert.equal(result.rows[0].estimatedCents, null);
    assert.match(result.rows[0].reason!, /radius|area/);
  }
  const stale = applyShoppingStrategy([chicken], input, strategy({ specialists: true, butcherShopId: "removed-shop" }), area);
  assert.equal(stale.rows[0].assignedShop, null, "do not silently replace a removed explicit shop with a different one");
});

test("available specialists use current coordinates and type, not stale distance or generic market names", () => {
  const far = { ...butcher, id: "far", lat: origin.lat + 1, distanceKm: 0.1 };
  const untypedMarket = shop("market", "Fresh Fruit Market", "market", 0.001);
  const bakery = { ...butcher, id: "bakery", shopType: "bakery" };
  const badPoint = { ...butcher, id: "bad", lat: NaN };
  const result = availableSpecialistShops([far, butcher, produce, untypedMarket, bakery, badPoint, butcher], area);
  assert.deepEqual(result.butchers.map(shop => shop.id), [butcher.id]);
  assert.deepEqual(result.produce.map(shop => shop.id), [produce.id]);
  assert.ok(result.butchers[0].distanceKm < 1, "distance is recomputed from current area");
  assert.deepEqual(availableSpecialistShops([butcher], { location: null, radiusKm: 10 }), { butchers: [], produce: [] });
  assert.deepEqual(availableSpecialistShops([butcher], { location: origin, radiusKm: 1000 }), { butchers: [], produce: [] });
});

test("moving area or reducing radius removes old specialist assignments", () => {
  for (const changed of [{ ...area, location: { lat: -33.8, lon: 151.2 } }, { ...area, radiusKm: 0.1 }]) {
    const result = applyShoppingStrategy([chicken], [row(chicken, [local(chicken, butcher)])], strategy({ specialists: true, butcherShopId: butcher.id }), changed);
    assert.equal(result.rows[0].assignedShop, null);
    assert.equal(result.rows[0].estimatedCents, null);
  }
});

test("shopping-centre-only coordinates preserve their uncertainty margin when the radius shrinks", () => {
  const approximate = { ...butcher, id: "centre-butcher", lat: origin.lat, locationAccuracy: "shopping-centre" as const };
  assert.deepEqual(availableSpecialistShops([approximate], { location: origin, radiusKm: 0.4 }).butchers, []);
  assert.equal(availableSpecialistShops([approximate], { location: origin, radiusKm: 0.6 }).butchers[0]?.id, approximate.id);
  const prices = [row(chicken, [local(chicken, approximate, 100), offer(chicken, "online", "woolworths", 1000, "1 kg")])];
  const result = applyShoppingStrategy([chicken], prices, strategy(), { shops: [approximate], location: origin, radiusKm: 0.4 });
  assert.equal(result.rows[0].chosenOfferId, "online");
});

test("explicit manual review is allowed only inside the selected shop policy", () => {
  const own = offer(chicken, "reviewed", "woolworths", 800, "1 kg", { eligible: false, match: "review" });
  const other = offer(chicken, "other", "coles", 100, "1 kg");
  const input = [row(chicken, [own, other])];
  const automatic = applyShoppingStrategy([chicken], input, strategy({ mode: "woolworths" }), area);
  assert.equal(automatic.rows[0].estimatedCents, null);
  assert.deepEqual(automatic.rows[0].allowedOfferIds, [own.id]);
  const reviewed = applyShoppingStrategy([chicken], input, strategy({ mode: "woolworths" }), { ...area, offerSelections: { chicken: own.id } });
  assert.equal(reviewed.rows[0].estimatedCents, 800);
  const crossStore = applyShoppingStrategy([chicken], input, strategy({ mode: "woolworths" }), { ...area, offerSelections: { chicken: other.id } });
  assert.equal(crossStore.rows[0].estimatedCents, null);
  assert.equal(crossStore.rows[0].assignedShop?.retailerId, "woolworths");
});

test("an explicit no-offer selection remains unknown instead of automatically resetting to cheapest", () => {
  const result = applyShoppingStrategy([rice], [row(rice, [offer(rice, "rice", "aldi", 200, "1 kg")])], strategy(), { ...area, offerSelections: { rice: null } });
  assert.equal(result.rows[0].chosenOfferId, null);
  assert.equal(result.rows[0].estimatedCents, null);
  assert.equal(result.rows[0].assignedShop, null);
});

test("old quantity, name and unit snapshots cannot supply current selected prices", () => {
  const input = row(chicken, [offer(chicken, "ww", "woolworths", 500, "1 kg")]);
  for (const changed of [{ ...chicken, amount: 1200 }, { ...chicken, name: "Turkey breast fillets" }, { ...chicken, unit: "kg" }]) {
    const result = applyShoppingStrategy([changed], [input], strategy(), area);
    assert.equal(result.rows[0].offers.length, 0);
    assert.equal(result.rows[0].estimatedCents, null);
  }
});

test("pantry-covered zero quantities stay zero and need no assigned shop or price", () => {
  const pantry = { ...chicken, amount: 0, inPantry: true };
  const result = applyShoppingStrategy([pantry], [], strategy({ specialists: true, butcherShopId: "missing" }), { ...area, shops: [] });
  assert.equal(result.rows[0].estimatedCents, 0);
  assert.equal(result.rows[0].selectionState, "pantry");
  assert.equal(result.rows[0].assignedShop, null);
  assert.equal(result.summary.knownSubtotalCents, 0);
  assert.equal(result.summary.complete, true);
  const positive = applyShoppingStrategy([{ ...chicken, inPantry: true }], [], strategy(), area);
  assert.equal(positive.rows[0].selectionState, "unknown", "a pantry flag alone is not a zero shortfall");
});

test("safe seller strategies reject stale stock, forged zero totals and hard food identity conflicts", () => {
  const good = offer(chicken, "good", "woolworths", 1000, "1 kg");
  const unsafe = [
    { ...good, id: "old", freshness: "stale" as const },
    { ...good, id: "no-stock", stock: "OUT_OF_STOCK" as const },
    { ...good, id: "cooked", productName: "Cooked shredded chicken breast fillets" },
    { ...good, id: "plant", productName: "Plant based chicken breast fillets" },
    { ...good, id: "wrong-protein", productName: "Turkey breast fillets" },
    { ...good, id: "zero", cost: { ...good.cost, lineCents: 0 } },
  ];
  const result = applyShoppingStrategy([chicken], [row(chicken, [...unsafe, good])], strategy(), area);
  assert.equal(result.rows[0].chosenOfferId, "good");
  assert.deepEqual(result.rows[0].allowedOfferIds, ["good"]);
});

test("raw rice cannot select ambiguous cooked pouches through a manual override", () => {
  const pouch = offer(rice, "pouch", "aldi", 200, "500 g", { productName: "Jasmine rice pouch" });
  const result = applyShoppingStrategy([rice], [row(rice, [pouch])], strategy(), { ...area, offerSelections: { rice: pouch.id } });
  assert.equal(result.rows[0].estimatedCents, null);
  assert.deepEqual(result.rows[0].allowedOfferIds, []);
});

test("only fresh meat and produce are specialist ingredients across inherited and custom categories", () => {
  for (const name of ["Pork loin", "Chicken thighs", "Turkey breast", "Duck breasts", "Beef rump", "Lamb shoulder", "Kangaroo steaks"]) assert.equal(shoppingSpecialistKind({ id: name, name, amount: 1, unit: "kg" }), "butcher", name);
  for (const name of ["Chicken stock", "Beef sauce", "Plant-based chicken", "Cooked chicken breast", "Tinned tomatoes", "Dried oregano", "Frozen peas", "Tomato paste", "Lime juice", "Smoked ham"]) {
    for (const category of ["butcher", "produce"] as const) assert.equal(shoppingSpecialistKind({ id: name, name, amount: 1, unit: "g", category }), null, name);
  }
  assert.equal(shoppingSpecialistKind(carrots), "produce");
  assert.equal(shoppingSpecialistKind({ ...carrots, name: "Fresh sorrel" }), "produce");
  assert.equal(shoppingSpecialistKind({ ...chicken, name: "Fresh salmon", category: "fishmonger" }), null);
});

test("branch-only IGA and recorded chain associations retain their concrete seller identity", () => {
  const branch = offer(rice, "iga-branch", "iga", 300, "1 kg", { shopId: "iga-branch-a", shopName: "IGA Selected Branch", scope: "shop-online", source: "iga-online-catalogue", stock: "UNKNOWN" });
  const unassociated = offer(rice, "unassociated", "iga", 100, "1 kg", { shopId: null, scope: "area-recorded", source: "recorded" });
  const iga = shop("iga-branch-a", "IGA Selected Branch", "supermarket", 0.002);
  const result = applyShoppingStrategy([rice], [row(rice, [branch, unassociated])], strategy({ mode: "iga" }), { ...area, shops: [...area.shops, iga] });
  assert.equal(result.rows[0].chosenOfferId, branch.id);
  assert.equal(result.rows[0].assignedShop?.shopId, "iga-branch-a");
  assert.equal(result.rows[0].assignedShop?.scope, "shop-online");
  assert.deepEqual(result.rows[0].allowedOfferIds, [branch.id]);
});

test("cheapest excludes stale local branches and outside-radius prices while retaining genuine online guides", () => {
  const far = { ...butcher, id: "far-butcher", lat: origin.lat + 1, distanceKm: 0.01 };
  const missing = { ...butcher, id: "old-area-butcher" };
  const ww = offer(chicken, "ww-guide", "woolworths", 1000, "1 kg");
  const result = applyShoppingStrategy([chicken], [row(chicken, [local(chicken, far, 100), local(chicken, missing, 100), ww])], strategy(), { ...area, shops: [butcher, far] });
  assert.equal(result.rows[0].chosenOfferId, ww.id);
  assert.deepEqual(result.rows[0].allowedOfferIds, [ww.id]);
  assert.equal(result.rows[0].assignedShop?.shopId, null);
  assert.equal(result.rows[0].assignedShop?.scope, "chain-online");
  const noLocation = applyShoppingStrategy([chicken], [row(chicken, [local(chicken, butcher, 100), ww])], strategy(), { ...area, location: null });
  assert.equal(noLocation.rows[0].chosenOfferId, ww.id);
});

test("recorded supermarket branch prices must still belong to a located current-area shop", () => {
  const branch = shop("ww-branch", "Woolworths Local", "supermarket", 0.002);
  const recorded = offer(chicken, "recorded-ww", "woolworths", 700, "1 kg", { shopId: branch.id, shopName: branch.name, source: "recorded", scope: "shop-recorded", stock: "UNKNOWN" });
  const online = offer(chicken, "online-ww", "woolworths", 1000, "1 kg");
  const prices = [row(chicken, [recorded, online])];
  assert.equal(applyShoppingStrategy([chicken], prices, strategy({ mode: "woolworths" }), area).rows[0].chosenOfferId, online.id);
  const current = applyShoppingStrategy([chicken], prices, strategy({ mode: "woolworths" }), { ...area, shops: [branch] });
  assert.equal(current.rows[0].chosenOfferId, recorded.id);
  assert.equal(current.rows[0].assignedShop?.shopId, branch.id);
  assert.equal(current.rows[0].assignedShop?.scope, "shop-recorded");
});

test("stored strategy normalization uses safe defaults and does not treat string booleans as consent", () => {
  assert.deepEqual(normalizeShoppingStrategy(null), DEFAULT_SHOPPING_STRATEGY);
  assert.deepEqual(normalizeShoppingStrategy({ mode: "amazon", specialists: "true", butcherShopId: 123, produceShopId: "  produce-a\u0000 " }), { mode: "cheapest", specialists: false, butcherShopId: "", produceShopId: "produce-a" });
});
