import assert from "node:assert/strict";
import { test } from "node:test";
import { freshHerbPackUnverified } from "../lib/fresh-herb-match.ts";
import { applyShoppingOfferSelection, applyShoppingOfferSelections, buildShoppingOffers, resolveIngredientPricing } from "../lib/shopping-costs.ts";
import { applyShoppingStrategy, DEFAULT_SHOPPING_STRATEGY } from "../lib/shopping-strategy.ts";
import type { PriceQuote } from "../lib/catalogue.ts";

const line = { id: "coriander", name: "Coriander leaves for the side", amount: 18.75, unit: "g", category: "produce" as const };
const now = new Date();
function quote(name = "MasterFoods Coriander Leaves", size = "5 g"): PriceQuote {
  return { query: line.name, source: "woolworths-online-catalogue", label: "Published online guide", fetchedAt: now.toISOString(), cached: false, fulfilmentStoreId: null, searched: [line.name], error: null, matches: [{ name, priceCents: 380, packageSize: size, stock: "IN_STOCK", score: 60, selected: true, reviewable: true, url: "https://example.test/herb", reason: "Name overlap" }] };
}
test("a tiny generically named leaf-herb pack does not prove fresh leaves", () => {
  for (const herb of ["Coriander leaves for the side", "Fresh parsley", "Basil", "Fresh mint", "Dill", "Thyme", "Sage", "Fresh oregano"]) {
    assert.equal(freshHerbPackUnverified(herb, herb.replace(/Fresh /i, "").replace(/for the side/, ""), "5g"), true, herb);
  }
  for (const pack of ["5 g", "0.005 kg", "2 x 5g", "5 g x 2"]) assert.equal(freshHerbPackUnverified(line.name, "Coriander leaves", pack), true);
  assert.equal(freshHerbPackUnverified(line.name, "Coriander leaves", "15 g"), false, "This guard does not classify every ambiguous larger pack");
});
test("explicit fresh herb wording and requested dry forms remain usable", () => {
  for (const name of ["Fresh coriander leaves", "Coriander bunch", "Potted coriander", "Coriander punnet", "Hydroponic coriander"]) assert.equal(freshHerbPackUnverified(line.name, name, "5g"), false, name);
  for (const name of ["Dried coriander leaves", "Coriander seeds", "Ground coriander", "Frozen coriander", "Mint tea", "Basil paste"]) assert.equal(freshHerbPackUnverified(name, name, "5g"), false, name);
  assert.equal(freshHerbPackUnverified("Garlic", "Garlic", "5g"), false);
});
test("catalogue pack prices stay visible but cannot invent a fresh-herb quantity estimate", () => {
  const row = buildShoppingOffers([line], [quote()], [], { area: "Sydney 2000", now })[0];
  assert.equal(row.offers.length, 1);
  assert.equal(row.offers[0].priceCents, 380);
  assert.equal(row.offers[0].eligible, false);
  assert.equal(row.offers[0].reviewable, false);
  assert.equal(row.offers[0].cost.lineCents, null);
  assert.match(row.offers[0].cost.reason!, /does not establish fresh leaves/);
  assert.equal(row.chosenOfferId, null);
  assert.equal(row.estimatedCents, null);
  const fresh = buildShoppingOffers([line], [quote("Fresh coriander leaves")], [], { area: "Sydney 2000", now })[0];
  assert.equal(fresh.estimatedCents, 1520);
});
test("old cached automatic and manually selected catalogue rows cannot bypass herb-form uncertainty", () => {
  const row = buildShoppingOffers([line], [quote("Fresh coriander leaves")], [], { area: "Sydney 2000", now })[0];
  const unsafe = { ...row, offers: row.offers.map(offer => ({ ...offer, productName: "MasterFoods Coriander Leaves" })) };
  assert.equal(resolveIngredientPricing(line, unsafe).offer, null);
  assert.equal(applyShoppingOfferSelection({ ...unsafe, chosenOfferId: null, estimatedCents: null }, unsafe.offers[0].id).chosenOfferId, null);
  assert.equal(applyShoppingOfferSelections([unsafe], { [line.id]: unsafe.offers[0].id })[0].chosenOfferId, null);
  const assigned = applyShoppingStrategy([line], [unsafe], DEFAULT_SHOPPING_STRATEGY, { shops: [], location: null, radiusKm: 5, offerSelections: { [line.id]: unsafe.offers[0].id } });
  assert.equal(assigned.rows[0].selectionState, "unknown");
  assert.equal(assigned.rows[0].estimatedCents, null);
});
