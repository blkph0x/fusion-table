import assert from "node:assert/strict";
import { test } from "node:test";
import { shoppingOfferPreview, shoppingVendorCards } from "../components/shopping-offers.ts";
import type { ShoppingCostLine, ShoppingOffer } from "../lib/shopping-costs.ts";

function offer(id: string, retailerId = "woolworths", changes: Partial<ShoppingOffer> = {}): ShoppingOffer {
  return {
    id, retailerId, shopId: null, shopName: `${retailerId} online`, productName: "Jasmine rice",
    scope: "chain-online", source: retailerId === "coles" ? "coles-online-catalogue" : "woolworths-online-catalogue",
    evidenceLabel: "Online catalogue; branch stock unconfirmed.", priceCents: 400, packageSize: "1 kg",
    stock: "IN_STOCK", fetchedAt: "2026-10-26T10:00:00Z", freshness: "current", match: "matched",
    eligible: true, reviewable: true, reviewReason: null, url: null,
    cost: { lineCents: 400, packs: 1, purchasedAmount: 1, purchasedUnit: "kg", reason: null }, ...changes,
  };
}
const priced = (cents: number) => ({ lineCents: cents, packs: 1, purchasedAmount: 1, purchasedUnit: "kg", reason: null });
const row = (offers: ShoppingOffer[], chosenOfferId: string | null = null): ShoppingCostLine => ({ id: "rice", name: "Jasmine rice", amount: 1, unit: "kg", offers, chosenOfferId, estimatedCents: null, reason: null });

test("six products from one retailer cannot hide the second retailer", () => {
  const products = [...Array.from({ length: 6 }, (_, index) => offer(`w${index}`, "woolworths", { cost: priced(600 - index * 10) })), ...Array.from({ length: 6 }, (_, index) => offer(`c${index}`, "coles", { cost: priced(500 - index * 10) }))];
  assert.deepEqual(shoppingOfferPreview(products, null).map((product) => product.id), ["w5", "c5"]);
  assert.equal(products[0].id, "w0", "preview must not reorder the provider response");
});

test("only safe eligible choices are ranked by quantity cost", () => {
  const products = [offer("cheap-review", "coles", { eligible: false, match: "review", cost: priced(50) }), offer("safe", "coles", { cost: priced(500) }), offer("safe-cheaper", "coles", { cost: priced(450) }), offer("stale", "coles", { freshness: "stale", cost: priced(20) })];
  assert.deepEqual(shoppingOfferPreview(products, null).map((product) => product.id), ["safe-cheaper"]);
});

test("unresolved brand choices show the first reviewable candidate without inferring cheapest food", () => {
  const products = [offer("microwave", "coles", { eligible: false, reviewable: false, match: "review", cost: priced(10) }), offer("first-review", "coles", { eligible: false, match: "review", cost: priced(500) }), offer("cheaper-review", "coles", { eligible: false, match: "review", cost: priced(200) })];
  assert.deepEqual(shoppingOfferPreview(products, null).map((product) => product.id), ["first-review"]);
});

test("an explicit pack choice remains visible, including a seller outside the four-source preview", () => {
  const products = [offer("woolies"), offer("coles", "coles"), offer("aldi", "aldi"), offer("iga", "iga"), offer("local-1", "local"), offer("chosen-local-pack", "local", { cost: priced(700) })];
  assert.deepEqual(shoppingOfferPreview(products, "chosen-local-pack").map((product) => product.id), ["woolies", "coles", "aldi", "chosen-local-pack"]);
  assert.deepEqual(shoppingOfferPreview([offer("cheap"), offer("chosen", "woolworths", { cost: priced(800) })], "chosen").map((product) => product.id), ["chosen"]);
});

test("separate local shops and online catalogue scope remain distinct", () => {
  const products = [offer("online"), offer("branch-1", "woolworths", { scope: "shop-recorded", shopId: "osm/1", source: "recorded" }), offer("branch-2", "woolworths", { scope: "shop-recorded", shopId: "osm/2", source: "recorded" })];
  assert.deepEqual(shoppingOfferPreview(products, null).map((product) => product.id), ["online", "branch-1", "branch-2"]);
  assert.deepEqual(shoppingOfferPreview([], null), []);
});

test("a failed retailer remains visible with unknown cost beside available prices", () => {
  const cards = shoppingVendorCards([row([offer("available")])], ["Coles: Jasmine rice — public lookup unavailable"]);
  assert.deepEqual(cards.map((card) => [card.name, card.cents, card.pricedLines, card.status]), [["Woolworths online", 400, 1, ""], ["Coles online", null, 0, "Lookup unavailable"]]);
  assert.equal(cards[1].url, "https://www.coles.com.au/");
  assert.equal(cards[0].linkLabel, "Check Woolworths");
});

test("review-only and unmatched retailer results stay unknown, never zero", () => {
  const cards = shoppingVendorCards([row([offer("needs-review", "coles", { eligible: false, match: "review" })])], []);
  assert.deepEqual(cards.map((card) => [card.cents, card.pricedLines, card.status]), [[null, 0, "No matched prices"], [null, 0, "Review products below"]]);
  assert.deepEqual(shoppingVendorCards([], []), []);
});

test("local recorded evidence stays separate from a failed chain guide", () => {
  const local = offer("local", "woolworths", { scope: "shop-recorded", shopId: "osm/1", shopName: "Woolworths Town Hall", source: "recorded", cost: priced(350) });
  const cards = shoppingVendorCards([row([local])], ["Woolworths prices could not be checked for this batch."]);
  assert.deepEqual(cards.map((card) => [card.name, card.cents, card.pricedLines, card.status]), [["Woolworths online", null, 0, "Lookup unavailable"], ["Coles online", null, 0, "No matched prices"], ["Woolworths Town Hall", 350, 1, ""]]);
});
