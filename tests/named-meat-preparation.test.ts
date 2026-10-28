import assert from "node:assert/strict";
import test from "node:test";
import { ingredientPreparationConflict, matchProducts, type CatalogueProduct } from "../lib/product-match.ts";
import { applyShoppingOfferSelections, buildShoppingOffers, type ShoppingCostLine, type ShoppingOffer } from "../lib/shopping-costs.ts";
import { withAutomaticPrices } from "../app/api/shopping-prices/automatic-offers.ts";
import { applyShoppingStrategy, DEFAULT_SHOPPING_STRATEGY } from "../lib/shopping-strategy.ts";
import type { PriceQuote } from "../lib/catalogue.ts";

const item = (name: string, priceCents = 1299): CatalogueProduct => ({ name, stockcode: name, priceCents, packageSize: "380g", inStock: true, available: true });
const now = new Date("2026-10-28T08:40:00Z");
const line = { id: "duck", name: "Duck breast fillets", amount: 1800, unit: "g", category: "butcher" as const };
const fresh = "Luv-A-Duck Fresh Duck Breast Fillets";
const peking = "LUV-A-DUCK Peking Duck Breast 380g";
function capturedOffer(): ShoppingOffer {
  return { id: "captured-peking", productName: peking, retailerId: "aldi", shopId: null, shopName: "ALDI online", source: "aldi-online-catalogue", scope: "chain-online", evidenceLabel: "ALDI published online guide; stock unconfirmed.", priceCents: 1299, packageSize: "380 g", stock: "UNKNOWN", fetchedAt: now.toISOString(), freshness: "current", match: "review", reviewable: true, reviewReason: null, eligible: true, cost: { lineCents: 6495, packs: 5, purchasedAmount: 1900, purchasedUnit: "g", reason: null }, url: null };
}
const capturedRow = (): ShoppingCostLine => ({ ...line, offers: [capturedOffer()], chosenOfferId: "captured-peking", estimatedCents: 6495, reason: null });

test("the captured Peking duck product cannot price plain raw duck breast while the actual fresh pack remains valid", () => {
  const matches = matchProducts(line.name, [item(peking), item(fresh, 1550)]);
  assert.deepEqual(matches.map(row => row.name), [fresh]);
  assert.equal(matches[0].selected, true);
  assert.equal(ingredientPreparationConflict(line.name, peking), true);
  assert.equal(ingredientPreparationConflict(line.name, fresh), false);
});

test("named prepared styles do not silently replace raw meat or another named style", () => {
  for (const [requested, product] of [
    ["Duck breast fillets", "Confit Duck Breast"], ["Pork loin steaks", "Char Siu Pork Loin Steaks"],
    ["Pork loin steaks", "Chinese BBQ Pork Loin Steaks"], ["Chicken breast", "Tandoori Chicken Breast"],
    ["Salmon fillet", "Teriyaki Salmon Fillet"], ["Chicken breast", "Satay Chicken Breast"],
    ["Turkey breast", "Peri Peri Turkey Breast"], ["Beef rump steak", "Korean BBQ Beef Rump Steak"],
    ["Teriyaki chicken breast", "Satay Chicken Breast"], ["Peking duck breast", "Confit Duck Breast"],
  ]) {
    assert.equal(ingredientPreparationConflict(requested, product), true, `${requested} -> ${product}`);
    assert.deepEqual(matchProducts(requested, [item(product)]), [], product);
  }
  for (const name of ["Peking Duck Breast", "Confit Duck Breast", "Char Siu Pork Loin", "Tandoori Chicken Breast", "Teriyaki Salmon Fillet", "Satay Chicken Breast"]) {
    assert.equal(ingredientPreparationConflict(name, name), false, name);
    assert.equal(matchProducts(name, [item(name)])[0].selected, true, name);
  }
});

test("heat-and-serve meat, duck deli and other authored fish species cannot establish raw meat", () => {
  for (const [requested, product] of [
    ["Duck breast fillets", "Heat And Eat Duck Breast Fillets"], ["Duck breast fillets", "Heat And Serve Duck Breast Fillets"],
    ["Duck breast fillets", "Ready To Heat Duck Breast Fillets"], ["Duck breast fillets", "Thinly Sliced Duck Breast"],
    ["Duck breast fillets", "Roast Duck Breast"], ["Fresh sardines", "Smoked Sardines"],
    ["Hoki fillets", "Cooked Hoki Fillets"], ["Quail breast", "Cooked Quail Breast"],
  ]) assert.equal(ingredientPreparationConflict(requested, product), true, `${requested} -> ${product}`);
});

test("ordinary raw brands, Pekin breed, BBQ cuts and roasting directions remain usable", () => {
  for (const [requested, product] of [
    [line.name, fresh], ["Duck breast", "Pekin Duck Breast"], ["Duck breast", "Cherry Valley Fresh Duck Breast"],
    ["Duck breast", "Raw Thinly Sliced Duck Breast"], ["Duck legs", "Duck Legs For Roasting"],
    ["Beef blade steak", "BBQ Beef Blade Steak"], ["Beef topside roast", "Beef Topside Roast"],
    ["Whole quail", "Fresh Whole Quail For Roasting"],
  ]) {
    assert.equal(ingredientPreparationConflict(requested, product), false, `${requested} -> ${product}`);
    assert.ok(matchProducts(requested, [item(product)]).some(row => row.selected), product);
  }
});

test("fresh catalogue construction and cached automatic/manual/shop-strategy paths reject the actual prepared offer", () => {
  const products = [item(peking), item(fresh, 1550)];
  const quote: PriceQuote = { query: line.name, source: "aldi-online-catalogue", label: "Published online guide", fetchedAt: now.toISOString(), cached: false, fulfilmentStoreId: null, searched: [line.name], matches: matchProducts(line.name, products), error: null };
  const built = withAutomaticPrices({ lines: buildShoppingOffers([line], [quote], [], { area: "2042", now }) }).lines[0];
  assert.equal(built.offers.find(offer => offer.id === built.chosenOfferId)?.productName, fresh);
  assert.equal(built.estimatedCents, 7750);
  const cached = capturedRow();
  const automatic = withAutomaticPrices({ lines: [cached] }).lines[0];
  assert.equal(automatic.chosenOfferId, null); assert.equal(automatic.estimatedCents, null);
  assert.equal(automatic.offers[0].eligible, false); assert.equal(automatic.offers[0].reviewable, false);
  const reviewed = applyShoppingOfferSelections([cached], { duck: "captured-peking" })[0];
  assert.equal(reviewed.chosenOfferId, null); assert.equal(reviewed.estimatedCents, null);
  const chosen = applyShoppingStrategy([line], [cached], DEFAULT_SHOPPING_STRATEGY, { shops: [], location: null, radiusKm: 10 }).rows[0];
  assert.equal(chosen.chosenOfferId, null); assert.equal(chosen.selectionState, "unknown");
});

test("captured braised shanks and recipe-base packets cannot be manually reviewed into raw lamb costs", () => {
  const lamb = { id: "lamb", name: "Lamb shanks", amount: 1050, unit: "g", category: "butcher" as const };
  for (const [name, priceCents, pack, total] of [
    ["Fast Fuel Air Fry Braised Lamb Shanks", 1700, "470g", 5100],
    ["MasterFoods Garlic & Herb Lamb Shanks Slow Cook Recipe Base", 300, "175g", 1800],
    ["McCormick Slow Cooker Garlic & Herb Lamb Shanks Recipe Base", 180, "40g", 4860],
  ] as const) {
    assert.equal(ingredientPreparationConflict(lamb.name, name), true, name);
    assert.deepEqual(matchProducts(lamb.name, [item(name)]), []);
    const offer = { ...capturedOffer(), id: "captured-lamb", productName: name, priceCents, packageSize: pack, stock: "IN_STOCK" as const, retailerId: "woolworths", source: "woolworths-online-catalogue" as const, eligible: false, reviewable: true, cost: { lineCents: total, packs: null, purchasedAmount: null, purchasedUnit: null, reason: null } };
    const row = { ...lamb, offers: [offer], chosenOfferId: null, estimatedCents: null, reason: null };
    const reviewed = applyShoppingOfferSelections([row], { lamb: offer.id })[0];
    assert.equal(reviewed.chosenOfferId, null); assert.equal(reviewed.estimatedCents, null);
    const strategy = applyShoppingStrategy([lamb], [row], DEFAULT_SHOPPING_STRATEGY, { shops: [], location: null, radiusKm: 10, offerSelections: { lamb: offer.id } }).rows[0];
    assert.equal(strategy.chosenOfferId, null); assert.deepEqual(strategy.allowedOfferIds, []);
  }
  for (const name of ["Lamb Shanks Spice Mix", "Lamb Shanks Seasoning", "Beef Brisket Dry Rub", "Lamb Shanks Simmer Sauce"]) assert.deepEqual(matchProducts(name.startsWith("Beef") ? "Beef brisket" : lamb.name, [item(name)]), [], name);
});

test("raw braising cuts and expressly requested braised meat or recipe-base products remain valid", () => {
  for (const [requested, product] of [
    ["Lamb shanks", "Lamb Shanks For Braising"], ["Beef steak", "Beef Braising Steak"],
    ["Beef steak", "Beef Stewing Steak"], ["Braised lamb shanks", "Fast Fuel Air Fry Braised Lamb Shanks"],
    ["Lamb shanks recipe base", "MasterFoods Garlic & Herb Lamb Shanks Slow Cook Recipe Base"],
    ["Beef brisket dry rub", "Beef Brisket Dry Rub"], ["Xawaash", "Xawaash Spice Blend"], ["Ras el hanout", "Ras El Hanout Spice Mix"],
  ]) {
    assert.equal(ingredientPreparationConflict(requested, product), false, product);
    assert.ok(matchProducts(requested, [item(product)]).some(row => row.selected), product);
  }
});
