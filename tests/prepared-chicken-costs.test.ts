import assert from "node:assert/strict";
import { test } from "node:test";
import { matchProducts, type CatalogueProduct } from "../lib/product-match.ts";
import { buildShoppingOffers } from "../lib/shopping-costs.ts";
import { plainProductFits, withAutomaticPrices } from "../app/api/shopping-prices/automatic-offers.ts";
import type { PriceQuote } from "../lib/catalogue.ts";

const now = new Date("2026-10-27T00:00:00Z");
const line = { id: "chicken", name: "Chicken breast", amount: 600, unit: "g", category: "butcher" as const };
const product = (name: string, priceCents: number, packageSize: string): CatalogueProduct => ({ name, priceCents, packageSize, stockcode: name, inStock: null, available: null });
// Actual IGA regression: the name omits 'crumbed'/'frozen', but this is a formed
// finger-food product, not raw breast: https://www.igashop.com.au/product/141165
const chipees = product("INGHAM'S Chicken Breast Chipees", 550, "400g");
const approximateRaw = product("Chicken Breast Fillets", 750, "approx. 500g");
const fixedRaw = product("INGHAM'S Fresh Chicken Breast Fillets", 800, "500g");
function quote(products: CatalogueProduct[]): PriceQuote {
  return { query: line.name, source: "iga-online-catalogue", scope: "selected-store", shop: { id: "node/newtown", name: "Lloyds IGA Newtown", website: "https://www.igashop.com.au", area: "2042" }, label: "Selected IGA published guide; shelf stock unconfirmed.", fetchedAt: now.toISOString(), cached: false, fulfilmentStoreId: "node/newtown", searched: [line.name], error: null, matches: matchProducts(line.name, products) };
}
const price = (products: CatalogueProduct[]) => withAutomaticPrices({ lines: buildShoppingOffers([line], [quote(products)], [], { area: "2042", now }) }).lines[0];

test("Chipees and related prepared formats cannot stand in for plain chicken breast", () => {
  for (const name of [chipees.name, "INGHAM'S Chicken Breast Munchies Original", "INGHAM'S Chicken Breast Nuggets Original", "INGHAM'S Frozen Crumbed Chicken Breast", "INGHAM'S Chicken Breast Kyivs"]) {
    assert.deepEqual(matchProducts(line.name, [product(name, 550, "400g")]), [], name);
    assert.equal(plainProductFits(line.name, name), false, name);
  }
});

test("the actual 550c Chipees offer cannot create the former false 1100c raw-chicken total", () => {
  const result = price([chipees, approximateRaw]);
  assert.equal(result.offers.length, 1); assert.equal(result.offers[0].productName, approximateRaw.name);
  assert.equal(result.offers[0].priceCents, 750); assert.equal(result.offers[0].cost.lineCents, null);
  assert.equal(result.chosenOfferId, null); assert.equal(result.estimatedCents, null);
});

test("a genuine raw fixed pack is chosen without blocking the INGHAM'S brand", () => {
  const result = price([chipees, approximateRaw, fixedRaw]);
  const chosen = result.offers.find(offer => offer.id === result.chosenOfferId);
  assert.equal(chosen?.productName, fixedRaw.name); assert.equal(chosen?.priceCents, 800);
  assert.equal(result.estimatedCents, 1600); assert.ok(result.offers.every(offer => !/chipees/i.test(offer.productName)));
  assert.equal(plainProductFits(line.name, fixedRaw.name), true);
});

test("an explicit Chipees request can still choose that same prepared product", () => {
  const result = matchProducts("Chicken chipees", [{ ...chipees, inStock: true, available: true }]);
  assert.equal(result.length, 1); assert.equal(result[0].selected, true); assert.equal(result[0].priceCents, 550);
  assert.deepEqual(matchProducts("Chicken chipees", [{ ...fixedRaw, inStock: true, available: true }]), []);
});
