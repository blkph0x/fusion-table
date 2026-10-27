import assert from "node:assert/strict";
import { test } from "node:test";
import { ingredientPreparationConflict, matchProducts, type CatalogueProduct } from "../lib/product-match.ts";
import { buildShoppingOffers, costShoppingQuantity, isShoppingOfferSelectable, resolveIngredientPricing, type ShoppingCostLine, type ShoppingOffer } from "../lib/shopping-costs.ts";
import { plainProductFits, suggestAutomaticPrices, withAutomaticPrices } from "../app/api/shopping-prices/automatic-offers.ts";
import type { PriceQuote } from "../lib/catalogue.ts";
const now = new Date("2026-10-28T00:00:00Z");
const item = (name: string, priceCents = 249, packageSize = "200g"): CatalogueProduct => ({ name, priceCents, packageSize, stockcode: name, inStock: null, available: null });
const ginger = { id: "ginger", name: "Fresh ginger", amount: 10, unit: "g", category: "produce" as const };
const cookies = "BELMONT BISCUIT CO. Stem Ginger Cookies 200g";
const raw = "Macro Organic Ginger Punnet";
const actualPrepared = [cookies, "Buderim Ginger Australian Ready Cut", "Jensens Crushed Ginger", "MasterFoods Finely Chopped Ginger"];

test("actual live ginger cookies and prepared jars cannot price fresh ginger", () => {
  for (const name of actualPrepared) {
    assert.equal(ingredientPreparationConflict(ginger.name, name), true, name);
    assert.deepEqual(matchProducts(ginger.name, [item(name)]), [], name);
    assert.equal(plainProductFits(ginger.name, name), false, name);
  }
  const quote: PriceQuote = { query: ginger.name, source: "aldi-online-catalogue", label: "Published guide; stock unknown", fetchedAt: now.toISOString(), cached: false, fulfilmentStoreId: null, searched: [ginger.name], error: null, matches: matchProducts(ginger.name, [...actualPrepared.map(name => item(name)), item(raw, 499, "150g")]) };
  const result = withAutomaticPrices({ lines: buildShoppingOffers([ginger], [quote], [], { area: "2042", now }) }).lines[0];
  assert.deepEqual(result.offers.map(offer => offer.productName), [raw]);
  assert.equal(result.offers.find(offer => offer.id === result.chosenOfferId)?.productName, raw);
});

test("retained v0.3.2 cookie choices are invalidated before automatic or recipe costs are used", () => {
  const offer: ShoppingOffer = { id: "old-cookie", productName: cookies, retailerId: "aldi", shopId: null, shopName: "ALDI online", source: "aldi-online-catalogue", scope: "chain-online", evidenceLabel: "Published guide", priceCents: 249, packageSize: "200g", stock: "UNKNOWN", fetchedAt: now.toISOString(), freshness: "current", match: "review", reviewable: true, reviewReason: "Old name proof", eligible: true, cost: costShoppingQuantity(10, "g", 249, "200g"), url: null };
  const row: ShoppingCostLine = { ...ginger, offers: [offer], chosenOfferId: offer.id, estimatedCents: 249, reason: null };
  const result = suggestAutomaticPrices([row])[0];
  assert.equal(result.chosenOfferId, null); assert.equal(result.estimatedCents, null);
  assert.equal(result.offers[0].reviewable, false); assert.equal(isShoppingOfferSelectable(result.offers[0]), false);
  assert.equal(resolveIngredientPricing(ginger, row).source, "planning-guide");
  const staleProof: PriceQuote = { query: ginger.name, source: "aldi-online-catalogue", label: "Old guide", fetchedAt: now.toISOString(), cached: true, fulfilmentStoreId: null, searched: [ginger.name], error: null, matches: [{ name: cookies, priceCents: 249, packageSize: "200g", stock: "UNKNOWN", url: null, score: 50, selected: false, reviewable: true, nameMatched: true, nameReviewable: true, reason: "Old proof" }] };
  assert.equal(buildShoppingOffers([ginger], [staleProof], [], { area: "2042", now })[0].offers.length, 0);
});

test("raw produce and aromatics cannot be replaced by finished meals, condiments or sweets", () => {
  for (const [query, name] of [
    ["Garlic", "Garlic Bread"], ["Fresh coriander", "Coriander Naan Bread"], ["Red onion", "Red Onion Chutney"],
    ["Fresh red chilli", "Red Chilli Crisps"], ["Chilli flakes", "Chilli Flakes Rice Crackers"], ["Tomatoes", "Tomato Relish"],
    ["Tomatoes", "Tomato Ketchup"], ["Fresh basil", "Basil Pesto"], ["Fresh coriander", "Coriander Pesto"], ["Mint", "Mint Jelly"],
    ["Fresh dill", "Dill Dressing"], ["Fresh rosemary", "Rosemary Salt"], ["Garlic", "Garlic Mayonnaise"],
    ["Cucumber", "Cucumber Yoghurt Dip"], ["Mushrooms", "Mushroom Risotto"], ["Red capsicum", "Red Capsicum Hummus"],
    ["Lemon", "Lemon Curd"], ["Fresh mint", "Mint Chocolate"], ["Parsley", "Parsley Butter"],
    ["Fresh spinach", "Spinach Feta Gozleme"], ["Broccoli", "Broccoli Cheese Bake"], ["Lime juice", "Lime Juice Cordial"],
    ["Fresh ginger", "Pickled Ginger"], ["Fresh ginger", "Ginger In Syrup"], ["Fresh garlic", "Roasted Garlic"],
  ]) assert.deepEqual(matchProducts(query, [item(name)]), [], `${query} -> ${name}`);
});

test("physical raw produce and explicitly requested food forms remain usable", () => {
  for (const [query, name] of [
    ["Fresh ginger", "Ginger Fresh"], ["Fresh ginger", raw], ["Fresh ginger", "Fresh Chopped Ginger"],
    ["Garlic", "Fresh Garlic Cloves"], ["Fresh ginger", "Fresh Ginger Root"], ["Spring onions", "Sliced Spring Onions"],
    ["Chopped ginger", "MasterFoods Finely Chopped Ginger"], ["Crushed ginger", "Jensens Crushed Ginger"],
    ["Sesame seeds", "Sesame Seeds"], ["Coriander seeds", "Coriander Seeds"], ["Vegan garlic bread", "Vegan Garlic Bread"],
    ["Ready hummus", "Ready Hummus"], ["Tomato paste", "Tomato Paste"], ["Vegan tomato ketchup", "Vegan Tomato Ketchup"],
    ["Tomato passata for the side sauce", "Tomato Passata"], ["Arborio risotto rice", "Arborio Risotto Rice"],
    ["Lime juice", "Lime Juice"], ["Ginger cookies", cookies], ["Garlic sauce", "Garlic Sauce"],
    ["Firm tofu", "Firm Tofu Bean Curd"], ["Chickpeas", "Chickpeas No Added Salt"], ["Plain flour", "Home Bake Plain Flour"],
  ]) {
    assert.equal(ingredientPreparationConflict(query, name), false, `${query} -> ${name}`);
    const matches = matchProducts(query, [{ ...item(name), inStock: true, available: true }]);
    assert.equal(matches.length, 1, `${query} -> ${name}`);
  }
});
