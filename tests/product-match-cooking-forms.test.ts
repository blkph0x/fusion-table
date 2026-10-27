import assert from "node:assert/strict";
import { test } from "node:test";
import { matchProducts, type CatalogueProduct } from "../lib/product-match.ts";
import { buildShoppingOffers } from "../lib/shopping-costs.ts";
import type { PriceQuote } from "../lib/catalogue.ts";

const item = (name: string, extra: Partial<CatalogueProduct> = {}): CatalogueProduct => ({ name, priceCents: 900, packageSize: "500g", stockcode: name, inStock: true, available: true, ...extra });

test("stock, broth and bouillon cannot select or review raw meat prices", () => {
  for (const [query, product] of [["Chicken stock", "Coles Chicken Breast Fillets"], ["Beef stock", "Beef Chuck Steak"], ["Chicken broth", "Chicken Breast"], ["Beef bouillon", "Beef Rump Steak"], ["Chicken stock", "Chicken Frames For Stock"], ["Beef stock", "Beef Stock Bones"]]) {
    assert.deepEqual(matchProducts(query, [item(product)]), [], `${query} -> ${product}`);
  }
});

test("matched stocks can use cooked/roasted flavours and the broth/bouillon naming family", () => {
  for (const [query, product] of [["Chicken stock", "Roasted Chicken Stock"], ["Chicken stock", "Chicken Broth"], ["Beef broth", "Beef Stock"], ["Beef stock", "Beef Bone Broth"], ["Chicken stock", "Chicken Bone Broth"], ["Chicken bouillon powder", "Chicken Stock Powder"], ["Beef gravy", "Roasted Beef Gravy"]]) {
    const result = matchProducts(query, [item(product)]);
    assert.equal(result.length, 1, `${query} -> ${product}`); assert.equal(result[0].selected, true, `${query} -> ${product}`);
  }
});

test("paste, juice, sauce, powder and gravy require their own cooking form", () => {
  for (const [query, product] of [["Tomato paste", "Fresh Tomatoes"], ["Lime juice", "Fresh Limes"], ["Fish sauce", "Fresh Fish Fillets"], ["Chicken gravy", "Chicken Breast"], ["Curry powder", "Curry Seasoning"], ["Garlic powder", "Fresh Garlic"], ["Chicken stock", "Chicken Stock Powder"]]) {
    assert.deepEqual(matchProducts(query, [item(product)]), [], `${query} -> ${product}`);
  }
  for (const name of ["Tomato paste", "Lime juice", "Fish sauce", "Curry powder", "Garlic powder"]) assert.equal(matchProducts(name, [item(name)])[0].selected, true, name);
});

test("fresh ingredients cannot be silently replaced by a cooking concentrate", () => {
  for (const [query, product] of [["Chicken breast", "Chicken Stock"], ["Garlic", "Garlic Paste"], ["Fresh ginger", "Ginger Powder"], ["Lime", "Lime Juice"], ["Tomatoes", "Tomato Paste"]]) assert.deepEqual(matchProducts(query, [item(product)]), []);
  assert.equal(matchProducts("Gravy beef", [item("Gravy Beef")])[0].selected, true);
  assert.equal(matchProducts("Gravy beef", [item("Beef Shin")])[0].selected, true);
});

test("cooking-form matches still require explicit dietary evidence and retain unknown stock", () => {
  assert.equal(matchProducts("Gluten-free chicken stock", [item("Chicken Stock")])[0].selected, false);
  const unknown = matchProducts("Chicken stock", [item("Roasted Chicken Stock", { inStock: null, available: null })])[0];
  assert.equal(unknown.stock, "UNKNOWN"); assert.equal(unknown.selected, false); assert.equal(unknown.nameMatched, true);
});

test("the complete pricing pipeline cannot turn raw meat or produce into stock/paste costs", () => {
  const now = new Date("2026-10-27T00:00:00Z");
  for (const [name, product] of [["Chicken stock", "Coles Chicken Breast Fillets"], ["Beef stock", "Beef Chuck Steak"], ["Tomato paste", "Fresh Tomatoes"]]) {
    const line = { id: name, name, amount: 200, unit: "g" };
    const quote: PriceQuote = { query: name, source: "coles-online-catalogue", label: "Published guide", fetchedAt: now.toISOString(), cached: false, fulfilmentStoreId: null, searched: [name], error: null, matches: matchProducts(name, [item(product)]) };
    const priced = buildShoppingOffers([line], [quote], [], { area: "2042", now })[0];
    assert.equal(priced.offers.length, 0); assert.equal(priced.chosenOfferId, null); assert.equal(priced.estimatedCents, null);
  }
});
