import assert from "node:assert/strict";
import { test } from "node:test";
import { ingredientIdentityConflict, ingredientPreparationConflict, matchProducts, type CatalogueProduct } from "../lib/product-match.ts";
import { applyShoppingOfferSelections, buildShoppingOffers, costShoppingQuantity, resolveIngredientPricing, type ShoppingCostLine, type ShoppingOffer } from "../lib/shopping-costs.ts";
import { suggestAutomaticPrices, withAutomaticPrices } from "../app/api/shopping-prices/automatic-offers.ts";
import type { PriceQuote } from "../lib/catalogue.ts";

const now = new Date("2026-10-28T00:00:00Z");
const product = (name: string): CatalogueProduct => ({ name, priceCents: 500, packageSize: "500g", stockcode: name, inStock: true, available: true });
const line = (name: string) => ({ id: "ingredient", name, amount: 180, unit: "g", category: "produce" as const });
function quote(name: string, productName: string): PriceQuote {
  return { query: name, source: "coles-online-catalogue", label: "Published guide", fetchedAt: now.toISOString(), cached: false, fulfilmentStoreId: null, searched: [name], error: null, matches: matchProducts(name, [product(productName)]) };
}
const identityConflicts = [
  ["Beef mince", "Plant Based Beef Style Mince"], ["Beef mince", "Vegan Beef Mince"], ["Beef mince", "Meat Free Beef Mince"],
  ["Chicken breast", "Plant Based Chicken Breast"], ["Unsalted butter", "Unsalted Peanut Butter"], ["Butter", "Peanut Butter"],
  ["Butter", "Almond Butter"], ["Milk", "Coconut Milk"], ["Full cream milk", "Full Cream Coconut Milk"],
  ["Cream", "Coconut Cream"], ["Mozzarella", "Vegan Mozzarella"], ["Greek yogurt", "Coconut Greek Yogurt"],
  ["Vegan beef mince", "Australian Beef Mince"], ["Coconut milk", "Full Cream Milk"], ["Peanut butter", "Unsalted Butter"],
  ["Coconut milk", "Soy Milk"], ["Almond butter", "Peanut Butter"], ["Dairy free butter", "Almond Butter"],
  ["Brown onion", "IMPERIAL GRAIN Brown Rice 1kg"], ["Brown onion", "IMPERIAL GRAIN Brown Rice Microwave Pouch 250g"],
  ["Potato", "Sweet Potato"], ["Potatoes", "Gold Sweet Potatoes"], ["Sweet potato", "Washed Potatoes"],
  ["Butter", "Garlic Butter"], ["Unsalted butter", "Unsalted Garlic Butter"], ["Butter", "Herb Butter"],
] as const;

test("food identity conflicts cannot enter automatic or reviewable catalogue prices", () => {
  for (const [name, productName] of identityConflicts) {
    assert.equal(ingredientIdentityConflict(name, productName), true, `${name} -> ${productName}`);
    const result = withAutomaticPrices({ lines: buildShoppingOffers([line(name)], [quote(name, productName)], [], { area: "2042", now }) }).lines[0];
    assert.equal(result.offers.length, 0, `${name} -> ${productName}`);
    assert.equal(result.chosenOfferId, null);
    assert.equal(result.estimatedCents, null);
  }
});

function retained(name: string, productName: string): ShoppingCostLine {
  const offer: ShoppingOffer = { id: "old-choice", productName, retailerId: "coles", shopId: null, shopName: "Coles online", source: "coles-online-catalogue", scope: "chain-online", evidenceLabel: "Old name proof", priceCents: 500, packageSize: "500g", stock: "IN_STOCK", fetchedAt: now.toISOString(), freshness: "current", match: "review", reviewable: true, reviewReason: "Old proof", eligible: true, cost: costShoppingQuantity(180, "g", 500, "500g"), url: null };
  return { ...line(name), offers: [offer], chosenOfferId: offer.id, estimatedCents: 500, reason: null };
}
test("retained prices and explicit review choices cannot revive a different food identity", () => {
  for (const [name, productName] of identityConflicts) {
    const row = retained(name, productName), result = suggestAutomaticPrices([row])[0];
    assert.equal(result.chosenOfferId, null, `${name} -> ${productName}`);
    assert.equal(result.offers[0].eligible, false);
    assert.equal(result.offers[0].reviewable, false);
    assert.equal(applyShoppingOfferSelections([row], { ingredient: "old-choice" })[0].chosenOfferId, null);
    assert.equal(resolveIngredientPricing(line(name), row).source, "planning-guide");
  }
});

test("ordinary foods, explicit substitutes and reversed produce labels remain usable", () => {
  for (const [name, productName] of [
    ["Beef mince", "Coles Australian Beef Mince"], ["Unsalted butter", "Coles Unsalted Butter"],
    ["Full cream milk", "Full Cream Milk"], ["Greek yogurt", "Plain Greek Yogurt"],
    ["Cheddar cheese", "Cheddar Cheese Vegetarian Rennet"], ["Vegan beef mince", "Vegan Beef Mince"],
    ["Plant based chicken breast", "Plant Based Chicken Breast"], ["Coconut milk", "Organic Coconut Milk"],
    ["Coconut cream", "Coconut Cream"], ["Peanut butter", "Unsalted Peanut Butter"], ["Almond butter", "Organic Almond Butter"],
    ["Soy yogurt", "Plain Soy Yogurt"], ["Dairy free butter", "Dairy Free Butter Spread"],
    ["Brown onion", "Onion Brown"], ["Zucchini", "Courgette"], ["Fresh coriander", "Fresh Cilantro"],
    ["Chicken stock", "Roasted Chicken Broth"], ["Whole chicken", "Whole Chicken For Roasting"], ["Beef chuck roast", "Beef Chuck Roast"],
    ["Potato", "Washed Potatoes"], ["Potatoes", "Coles White Potatoes"], ["Sweet potato", "Gold Sweet Potatoes"],
    ["Butter", "Coles Butter"], ["Unsalted butter", "Coles Unsalted Butter"],
    ["Garlic butter", "Coles Garlic Butter"], ["Herb butter", "Herb Butter"], ["Garlic herb butter", "Garlic And Herb Butter"],
  ]) {
    assert.equal(ingredientPreparationConflict(name, productName), false, `${name} -> ${productName}`);
    const matches = matchProducts(name, [product(productName)]);
    assert.equal(matches.length, 1, `${name} -> ${productName}`);
    assert.equal(matches[0].selected, true, `${name} -> ${productName}`);
  }
});

const cookedPoultry = ["COLES CHICKEN BREAST CARVED ROAST FREE RANGE 200G", "BERG Portuguese Style Chicken Breast Slices 150g", "BERG Shredded Chicken Breast 500g"];
test("actual cooked chicken offers cannot price raw chicken through fresh or retained paths", () => {
  for (const productName of cookedPoultry) {
    const name = "Chicken breast";
    assert.equal(ingredientPreparationConflict(name, productName), true, productName);
    assert.deepEqual(matchProducts(name, [product(productName)]), [], productName);
    const row = retained(name, productName), result = suggestAutomaticPrices([row])[0];
    assert.equal(result.chosenOfferId, null, productName);
    assert.equal(result.offers[0].reviewable, false);
    assert.equal(applyShoppingOfferSelections([row], { ingredient: "old-choice" })[0].chosenOfferId, null);
    assert.equal(resolveIngredientPricing(line(name), row).source, "planning-guide");
  }
  for (const productName of ["Hot Roast Whole Chicken", "Roast Whole Chicken", "Whole Turkey Roast"]) {
    const name = /turkey/i.test(productName) ? "Whole turkey" : "Whole chicken";
    assert.equal(ingredientPreparationConflict(name, productName), true, productName);
    assert.deepEqual(matchProducts(name, [product(productName)]), [], productName);
    assert.equal(suggestAutomaticPrices([retained(name, productName)])[0].chosenOfferId, null, productName);
  }
});

test("explicit cooked chicken and unambiguously raw sliced cuts retain matching products", () => {
  for (const [name, productName] of [
    ["Cooked chicken breast", cookedPoultry[0]], ["Cooked sliced chicken breast", cookedPoultry[1]],
    ["Shredded chicken breast", cookedPoultry[2]], ["Raw sliced chicken breast", "Fresh Raw Chicken Breast Slices"],
    ["Chicken breast for roasting", "Raw Chicken Breast Roast Cut"],
    ["Whole chicken", "Fresh Whole Chicken"], ["Whole chicken", "Fresh Roasting Whole Chicken"],
    ["Whole turkey", "Whole Turkey For Roasting"],
  ]) {
    assert.equal(ingredientPreparationConflict(name, productName), false, `${name} -> ${productName}`);
    assert.equal(matchProducts(name, [product(productName)])[0]?.selected, true, `${name} -> ${productName}`);
  }
});

// This exact ALDI product appeared as the chosen fresh-ginger quote in a real meal audit.
test("compound bread titles cannot price raw ginger while requested finished foods remain valid", () => {
  for (const name of ["CURATED COLLECTION Gluten Free Fig and Ginger Crispbread 150g", "Gingerbread Biscuits", "Ginger Shortbread"]) {
    assert.equal(ingredientPreparationConflict("Fresh ginger", name), true, name);
    const result = withAutomaticPrices({ lines: buildShoppingOffers([line("Fresh ginger")], [quote("Fresh ginger", name)], [], { area: "2042", now }) }).lines[0];
    assert.equal(result.chosenOfferId, null);
    assert.equal(result.offers.length, 0);
  }
  assert.equal(matchProducts("Gingerbread biscuits", [product("Brand Gingerbread Biscuits")])[0]?.selected, true);
  assert.equal(matchProducts("Fresh ginger", [product("Fresh Ginger Root")])[0]?.selected, true);
});

// A frozen self-basting buffe was automatically selected for fillets in the live audit.
test("whole-breast buffe cuts and self-basting preparations cannot price plain poultry fillets", () => {
  for (const name of ["Ingham's Frozen Buffe Turkey Breast Self Basting", "Turkey Breast Crown", "Self Basting Turkey Breast Fillets"]) {
    assert.equal(ingredientPreparationConflict("Turkey breast fillets", name), true, name);
    assert.equal(matchProducts("Turkey breast fillets", [product(name)]).length, 0, name);
    assert.equal(suggestAutomaticPrices([retained("Turkey breast fillets", name)])[0].chosenOfferId, null);
  }
  assert.equal(matchProducts("Turkey breast fillets", [product("Fresh Turkey Breast Fillets")])[0]?.selected, true);
  assert.equal(ingredientPreparationConflict("Self basting turkey breast", "Brand Self Basting Turkey Breast"), false);
});
