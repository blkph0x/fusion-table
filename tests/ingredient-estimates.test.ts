import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { estimateIngredientCost, estimateRecipeCost } from "../lib/ingredient-estimates.ts";
import { consumedOfferCost, resolveIngredientPricing, type ShoppingOffer, type ShoppingCostLine } from "../lib/shopping-costs.ts";
import { withAutomaticPrices } from "../app/api/shopping-prices/automatic-offers.ts";
import type { ShoppingLine } from "../lib/shopping.ts";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/pricing-ingredients.json", import.meta.url), "utf8")) as { ingredients: ShoppingLine[] };
const line = (name: string, amount: number, unit: string, category?: ShoppingLine["category"]): ShoppingLine => ({ id: name, name, amount, unit, category });

test("all568 canonical authored ingredient/unit pairs have finite explicit planning allowances", () => {
  assert.equal(fixture.ingredients.length, 568);
  for (const ingredient of fixture.ingredients) for (const amount of [0.1, 1, 12, 1000]) {
    const estimate = estimateIngredientCost({ ...ingredient, amount });
    assert.ok(estimate, `${ingredient.name} / ${ingredient.unit}`);
    assert.equal(estimate.observed, false);
    assert.equal(estimate.currency, "AUD");
    assert.equal(estimate.source, "planning-guide");
    assert.notEqual(estimate.profileId, "general-ingredient-allowance", ingredient.name);
    assert.ok(Number.isSafeInteger(estimate.recipeCents) && estimate.recipeCents > 0, ingredient.name);
    assert.ok(estimate.purchaseCents >= estimate.recipeCents, ingredient.name);
    assert.match(estimate.label, /not an observed retailer price/);
  }
});

test("food used and packs to buy stay distinct, including fractional packs and exact spoon volume", () => {
  const rice = estimateIngredientCost(line("Jasmine rice", 200, "g"))!;
  assert.equal(rice.recipeCents, 100); assert.equal(rice.purchaseCents, 250); assert.equal(rice.packs, 1);
  assert.equal(estimateIngredientCost(line("Jasmine rice", 0.2, "kg"))!.recipeCents, 100);
  const oil = estimateIngredientCost(line("Neutral cooking oil", 1, "tbsp"))!;
  assert.equal(oil.neededAmount, 20); assert.equal(oil.neededUnit, "ml"); assert.equal(oil.recipeCents, 18); assert.equal(oil.purchaseCents, 450);
  const chilli = estimateIngredientCost(line("Chilli flakes", 1, "tbsp"))!;
  assert.equal(chilli.neededAmount, 10); assert.ok(chilli.assumptions.some(note => /Density allowance/.test(note)));
  assert.deepEqual([estimateIngredientCost(line("Salt", 0, "tsp"))!.recipeCents, estimateIngredientCost(line("Salt", 0, "tsp"))!.purchaseCents], [0, 0]);
});

test("special foods, counted produce and prepared foods get their own planning forms", () => {
  assert.equal(estimateIngredientCost(line("Saffron threads", 0.5, "g"))!.purchaseCents, 650);
  assert.equal(estimateIngredientCost(line("Whole turkey", 1, "", "butcher"))!.purchaseCents, 6500);
  assert.equal(estimateIngredientCost(line("Spring onions", 2, "", "produce"))!.neededUnit, "each");
  assert.equal(estimateIngredientCost(line("Spring onions", 2, "", "produce"))!.pack.amount, 6);
  assert.equal(estimateIngredientCost(line("Garlic", 2, "cloves", "produce"))!.pack.unit, "clove");
  assert.equal(estimateIngredientCost(line("Canned chickpeas, drained", 400, "g"))!.packs, 2);
  assert.equal(estimateIngredientCost(line("Cooked long-grain rice", 200, "g"))!.profileId, "ready-cooked-rice");
  assert.notEqual(estimateIngredientCost(line("Cooked long-grain rice", 200, "g"))!.recipeCents, estimateIngredientCost(line("Long-grain rice", 200, "g"))!.recipeCents);
  assert.ok(estimateIngredientCost(line("Wagyu beef eye fillet", 500, "g", "butcher"))!.recipeCents > estimateIngredientCost(line("Beef eye fillet", 500, "g", "butcher"))!.recipeCents);
});

test("saved seeded fresh finishes are recognized by exact food form despite specialty category", () => {
  const cucumber = estimateIngredientCost(line("Cucumber", 100, "g", "specialty"))!;
  const peas = estimateIngredientCost(line("Snow peas", 75, "g", "specialty"))!;
  assert.equal(cucumber.profileId, "cucumber"); assert.equal(cucumber.recipeCents, 60);
  assert.equal(peas.profileId, "snow-peas"); assert.equal(peas.recipeCents, 131);
  for (const name of ["Carrot", "Wombok", "Bean sprouts", "Fresh coriander", "Baby spinach", "Red capsicum"]) {
    assert.notEqual(estimateIngredientCost(line(name, 100, "g", "specialty"))!.profileId, "general-ingredient-allowance", name);
  }
  for (const name of ["Cucumber powder", "Pickled cucumber", "Cucumber pickles", "Cucumber relish", "Dried carrot powder", "Ginger powder"]) {
    const estimate = estimateIngredientCost(line(name, 100, "g", "produce"))!;
    assert.ok(!["vegetables", "cucumber", "fresh-aromatics", "fresh-herbs"].includes(estimate.profileId), name);
  }
});

test("invalid/free-text quantities cannot produce NaN, invented dimensional conversions or nonfood costs", () => {
  for (const bad of [NaN, Infinity, -1, 1_000_001]) assert.equal(estimateIngredientCost(line("Rice", bad, "g")), null);
  assert.equal(estimateIngredientCost(line("Rice", 3, "handfuls")), null);
  assert.equal(estimateIngredientCost(line("Chilli flakes", 2, "ml")), null);
  assert.equal(estimateIngredientCost(line("Mushroom compost", 10, "g")), null);
  const unknown = estimateIngredientCost(line("Custom rare ingredient", 100, "g"))!;
  assert.equal(unknown.confidence, "low"); assert.match(unknown.assumptions.join(" "), /Broad ingredient allowance/);
});

function offer(): ShoppingOffer { return { id: "observed-rice", productName: "Jasmine Rice", retailerId: "woolworths", shopId: null, shopName: "Woolworths online", source: "woolworths-online-catalogue", scope: "chain-online", evidenceLabel: "Observed online guide; confirm chosen store.", priceCents: 400, packageSize: "1 kg", stock: "IN_STOCK", fetchedAt: new Date().toISOString(), freshness: "current", match: "matched", reviewable: true, reviewReason: null, eligible: true, cost: { lineCents: 400, packs: 1, purchasedAmount: 1, purchasedUnit: "kg", reason: null }, url: null }; }
test("observed compatible unit costs replace assumptions without making the pack price the food-used price", () => {
  const rice = line("Jasmine rice", 200, "g");
  const candidate = offer();
  const row: ShoppingCostLine = { ...rice, offers: [candidate], chosenOfferId: candidate.id, estimatedCents: 400, reason: null };
  assert.equal(consumedOfferCost(rice, candidate), 80);
  const result = resolveIngredientPricing(rice, row);
  assert.equal(result.recipeCents, 80); assert.equal(result.purchaseCents, 400); assert.equal(result.source, "observed");
  const mismatched = { ...candidate, packageSize: "1 l" };
  assert.equal(consumedOfferCost(rice, mismatched), null);
  const oil = { ...candidate, packageSize: "500ml", priceCents: 500 };
  assert.equal(consumedOfferCost(line("Oil", 1, "tbsp"), oil), 20);
  assert.equal(consumedOfferCost(line("Dry spice", 1, "tsp"), candidate), null);
  const unavailable = resolveIngredientPricing(rice, { ...row, chosenOfferId: null });
  assert.equal(unavailable.source, "planning-guide"); assert.equal(unavailable.recipeCents, 100);
  const shortfallGuide = estimateIngredientCost({ ...rice, amount: 50 });
  assert.equal(resolveIngredientPricing(rice, { ...row, amount: 50, offers: [], chosenOfferId: null, estimatedCents: null, planningEstimate: shortfallGuide }).recipeCents, 100, "a pantry shortfall estimate cannot replace the cost of the full recipe amount");
  assert.equal(resolveIngredientPricing(rice, { ...row, name: "Unrelated ingredient" }).source, "planning-guide");
  assert.equal(resolveIngredientPricing(rice, { ...row, amount: 400 }).source, "planning-guide", "a larger previous serving quantity cannot be treated as this recipe's shopping shortfall");
  assert.equal(resolveIngredientPricing(rice, { ...row, amount: 50 }).recipeCents, 80, "a genuine pantry shortfall still provides observed food-unit pricing for the full recipe");
  for (const invalid of [-1, Infinity, NaN, 1_000_000_001]) {
    const invalidCost = resolveIngredientPricing(rice, { ...row, estimatedCents: invalid });
    assert.equal(invalidCost.purchaseSource, "planning-guide"); assert.equal(invalidCost.purchaseCents, 250);
  }
});

test("API exposes fallback allowances separately and never counts invented live prices", () => {
  const rice = line("Jasmine rice", 200, "g");
  const row: ShoppingCostLine = { ...rice, offers: [], chosenOfferId: null, estimatedCents: null, reason: "Unavailable" };
  const response = withAutomaticPrices({ lines: [row] });
  assert.equal(response.lines[0].estimatedCents, null); assert.equal(response.summary.knownSubtotalCents, null);
  assert.equal(response.lines[0].planningEstimate?.recipeCents, 100);
  const summary = estimateRecipeCost([rice, line("Neutral cooking oil", 1, "tbsp")], 2);
  assert.equal(summary.complete, true); assert.equal(summary.recipeCents, 118); assert.equal(summary.perServingCents, 59); assert.equal(summary.purchaseCents, 700);
});
