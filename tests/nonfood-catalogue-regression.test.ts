import assert from "node:assert/strict";
import { test } from "node:test";
import { isNonFoodCatalogueProduct, matchProducts, type CatalogueProduct } from "../lib/product-match.ts";
import { parseWoolworthsSearch, type PriceQuote } from "../lib/catalogue.ts";
import { buildShoppingOffers, isShoppingOfferSelectable } from "../lib/shopping-costs.ts";
import { withAutomaticPrices } from "../app/api/shopping-prices/automatic-offers.ts";

const now = new Date("2026-10-27T11:47:25.602Z");
const product = (name: string, priceCents: number, packageSize: string, categories?: string[]): CatalogueProduct => ({ name, priceCents, packageSize, categories, stockcode: name, inStock: true, available: true });
// Captured live product wording/prices, not invented food substitutions.
const slicer = product("Stainless Steel Cutter Gadget Scallion Vegetable Spring Onion Slicer", 2096, "1EA");
const plantingSeeds = product("Yates Spring Onions Seeds", 430, "each");
const onions = product("Spring Onion Bunch", 300, "each");

function quote(query: string, products: CatalogueProduct[]): PriceQuote {
  return { query, source: "woolworths-online-catalogue", label: "Published online guide; local stock unconfirmed.", fetchedAt: now.toISOString(), cached: false, fulfilmentStoreId: null, searched: [query], error: null, matches: matchProducts(query, products) };
}

test("the live spring-onion slicer and planting-seed listings are never food candidates", () => {
  assert.equal(isNonFoodCatalogueProduct(slicer), true);
  assert.equal(isNonFoodCatalogueProduct(plantingSeeds), true);
  assert.deepEqual(matchProducts("Spring onions", [slicer, plantingSeeds]), []);
  assert.deepEqual(matchProducts("Spring onions", [slicer, plantingSeeds, onions]).map(match => match.name), [onions.name]);
});

test("Woolworths ingestion drops nonfood rows before food matching and pricing", () => {
  const rows = [slicer, plantingSeeds, onions].map((item, index) => ({ Name: item.name, Stockcode: index + 1, Price: item.priceCents! / 100, PackageSize: item.packageSize, IsInStock: true, IsAvailable: true }));
  const parsed = parseWoolworthsSearch({ Products: [{ Products: rows }] });
  assert.deepEqual(parsed.products.map(item => item.name), [onions.name]);
});

test("the complete pricing pipeline cannot expose nonfood as selectable review offers", () => {
  const line = { id: "spring", name: "Spring onions", amount: 1.5, unit: "", category: "produce" as const };
  const result = withAutomaticPrices({ lines: buildShoppingOffers([line], [quote(line.name, [slicer, plantingSeeds, onions])], [], { area: "2042", now }) }).lines[0];
  assert.deepEqual(result.offers.map(offer => offer.productName), [onions.name]);
  assert.ok(result.offers.filter(isShoppingOfferSelectable).every(offer => offer.productName === onions.name));
  const onlyNonfood = withAutomaticPrices({ lines: buildShoppingOffers([line], [quote(line.name, [slicer, plantingSeeds])], [], { area: "2042", now }) }).lines[0];
  assert.equal(onlyNonfood.offers.length, 0); assert.equal(onlyNonfood.chosenOfferId, null); assert.equal(onlyNonfood.estimatedCents, null);
});

test("planting evidence excludes garden seeds without excluding culinary seed ingredients", () => {
  for (const item of [
    product("Coriander Seeds", 430, "each", ["Garden"]),
    product("Sesame Seeds", 430, "each", ["Lawn & Garden", "Seeds and Bulbs"]),
    product("Yates Coriander Seeds", 430, "each"),
    product("Spring Onion Seeds For Sowing", 430, "each"),
    product("Spring Onion Seedlings", 430, "each"),
  ]) assert.equal(isNonFoodCatalogueProduct(item), true, item.name);
  for (const [query, item] of [
    ["Sesame seeds", product("Woolworths Sesame Seeds", 250, "60g", ["Grocery", "Herbs & Spices"])],
    ["Coriander seeds", product("Hoyts Coriander Seeds", 200, "30g", ["Grocery", "Spices"])],
    ["Pumpkin seeds", product("Pumpkin Seeds", 400, "200g", ["Nuts & Seeds"])],
  ] as const) {
    assert.equal(isNonFoodCatalogueProduct(item), false, item.name);
    assert.equal(matchProducts(query, [item])[0].selected, true, item.name);
  }
});

test("food slicing words remain edible while slicer and cutter-gadget nouns are excluded", () => {
  for (const name of ["Vegetable Spiral Slicer", "Onion Dicer", "Cutter Gadget for Spring Onions"]) assert.equal(isNonFoodCatalogueProduct({ name }), true, name);
  for (const name of ["Sliced Spring Onions", "Spring Onion Slices", "Garden Salad With Sesame Seeds"]) assert.equal(isNonFoodCatalogueProduct({ name }), false, name);
});
