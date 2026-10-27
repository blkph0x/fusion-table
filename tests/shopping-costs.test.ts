import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWoolworthsSearch, type PriceQuote } from "../lib/catalogue.ts";
import { itemKey, quoteItems, rememberPrice, type ItemQuote, type PriceLedger, type PriceMemory } from "../lib/price-memory.ts";
import { matchProducts } from "../lib/product-match.ts";
import { applyShoppingOfferSelection, applyShoppingOfferSelections, buildShoppingOffers, costShoppingQuantity, isShoppingOfferSelectable, summarizeShoppingCosts } from "../lib/shopping-costs.ts";

const now = new Date("2026-10-26T10:00:00Z");
const line = { id: "rice", name: "Jasmine rice", amount: 1200, unit: "g" };
const options = { area: "Sydney 2000", now, shops: [{ id: "osm/1", name: "Woolworths Town Hall" }] };

function catalogue(overrides: Partial<PriceQuote> = {}): PriceQuote {
  return {
    query: line.name, source: "woolworths-online-catalogue", label: "Online guide; local shelf price unconfirmed.",
    fetchedAt: now.toISOString(), cached: false, fulfilmentStoreId: "default-not-local", searched: [line.name], error: null,
    matches: [{ name: "Jasmine Rice", priceCents: 350, packageSize: "1 kg", stock: "IN_STOCK", url: "https://example.test/rice", score: 40, selected: true, reason: "Name matches; check packet." }],
    ...overrides,
  };
}

function record(overrides: Partial<PriceMemory> = {}): PriceMemory {
  return { id: "r1", at: now.toISOString(), shopName: "Corner grocer", shopId: "", area: "2000", itemKey: itemKey(line.name), itemName: line.name, cents: 400, packageSize: "1 kg", kind: "recorded", until: "", url: "", label: "You recorded this.", ...overrides };
}

function quoted(records: PriceMemory[], specials: PriceMemory[] = []): ItemQuote[] {
  return [{ itemKey: itemKey(line.name), itemName: line.name, averageCents: 1, averageCount: 99, averageLabel: "Not a usable pack price", records, specials }];
}

test("metric packs round up whole purchases and preserve purchased quantity", () => {
  assert.deepEqual(costShoppingQuantity(750, "g", 300, "500 g"), { lineCents: 600, packs: 2, purchasedAmount: 1000, purchasedUnit: "g", reason: null });
  assert.equal(costShoppingQuantity(1.2, "kg", 400, "500g").lineCents, 1200);
  assert.equal(costShoppingQuantity(0.3, "kg", 400, "100 g").packs, 3);
  assert.equal(costShoppingQuantity(1500, "ml", 600, "1 L").lineCents, 1200);
  assert.equal(costShoppingQuantity(1.5, "l", 600, "750ml").packs, 2);
});

test("multipacks and explicit count units are costed without discarding their contents", () => {
  assert.equal(costShoppingQuantity(900, "g", 450, "2 x 400g").lineCents, 900);
  assert.equal(costShoppingQuantity(900, "g", 450, "400g x 2").purchasedAmount, 1600);
  assert.equal(costShoppingQuantity(7, "", 550, "6 pack").lineCents, 1100);
  assert.equal(costShoppingQuantity(7, "each", 550, "12pk").packs, 1);
  assert.equal(costShoppingQuantity(13, "pieces", 550, "dozen").packs, 2);
  assert.equal(costShoppingQuantity(3, "", 100, "each").lineCents, 300);
});

test("explicit rates use the needed quantity with money rounded once", () => {
  const cost = costShoppingQuantity(750, "g", 1499, "per kg");
  assert.equal(cost.lineCents, 1124);
  assert.equal(cost.packs, null);
  assert.equal(cost.purchasedAmount, 750);
  assert.match(cost.reason!, /weighed quantity/);
  assert.equal(costShoppingQuantity(250, "g", 199, "per 100g").lineCents, 498);
});

test("unknown units, densities and approximate pack sizes never become free or guessed food", () => {
  for (const [amount, unit, size] of [[2, "tsp", "50 g"], [2, "tbsp", "500 ml"], [200, "g", "500 ml"], [3, "cloves", "each"], [2, "pack", "6 pack"], [500, "g", "Approx. 500g"], [500, "g", "400-600g"], [500, "g", null], [500, "g", "6 pack of 500g"]] as const) {
    const result = costShoppingQuantity(amount, unit, 450, size);
    assert.equal(result.lineCents, null, `${amount} ${unit} vs ${size}`);
    assert.equal(result.packs, null);
    assert.ok(result.reason);
  }
  assert.equal(costShoppingQuantity(500, "g", null, "500 g").lineCents, null);
  assert.equal(costShoppingQuantity(500, "g", 0, "500 g").lineCents, null);
  assert.equal(costShoppingQuantity(-1, "g", 500, "500 g").lineCents, null);
  assert.equal(costShoppingQuantity(Infinity, "g", 500, "500 g").lineCents, null);
  assert.equal(costShoppingQuantity(0, "g", null, null).lineCents, 0);
});

test("Woolworths and Coles are separate online evidence, never the default local fulfilment store", () => {
  const woolies = catalogue();
  const coles = catalogue({ source: "coles-online-catalogue", matches: [{ ...woolies.matches[0], priceCents: 300 }] });
  const result = buildShoppingOffers([line], [woolies, coles], [], options)[0];
  assert.equal(result.offers.length, 2);
  assert.deepEqual(result.offers.map(offer => [offer.retailerId, offer.scope, offer.shopId]), [["woolworths", "chain-online", null], ["coles", "chain-online", null]]);
  assert.equal(result.offers[1].shopName, "Coles online");
  assert.equal(result.estimatedCents, 600);
  assert.equal(result.chosenOfferId, result.offers[1].id);
});

test("only explicitly associated local records belong to a nearby shop", () => {
  const result = buildShoppingOffers([line], [], quoted([record({ id: "known", shopId: "osm/1" }), record({ id: "other", shopId: "osm/2", shopName: "Woolworths Town Hall" })]), options)[0];
  assert.equal(result.offers[0].scope, "shop-recorded");
  assert.equal(result.offers[0].shopId, "osm/1");
  assert.equal(result.offers[0].retailerId, "woolworths");
  assert.equal(result.offers[1].scope, "area-recorded");
  assert.equal(result.offers[1].shopId, null);
  assert.equal(result.offers[0].stock, "UNKNOWN");
  assert.match(result.offers[0].evidenceLabel, /unconfirmed/);
});

test("different areas and different item keys cannot contaminate local costs", () => {
  const result = buildShoppingOffers([line], [], quoted([record({ id: "elsewhere", area: "3000" }), record({ id: "other-food", itemKey: "basmati rice" })]), options)[0];
  assert.equal(result.offers.length, 0);
  assert.equal(result.estimatedCents, null);
});

test("old manual observations remain readable without treating their unknown pack as the whole recipe", () => {
  const old = record({ packageSize: undefined });
  const result = buildShoppingOffers([line], [], quoted([old]), options)[0];
  assert.equal(result.offers[0].priceCents, 400);
  assert.equal(result.offers[0].packageSize, null);
  assert.equal(result.offers[0].cost.lineCents, null);
  assert.equal(result.estimatedCents, null);
  assert.equal(summarizeShoppingCosts([result]).knownSubtotalCents, null);
});

test("manual selling quantities survive normalizing and legacy observations remain compatible", () => {
  let ledger: PriceLedger = { prices: [], shopPages: [] };
  const input = { shopName: "Corner grocer", area: "2000", itemName: line.name, cents: 400 };
  ledger = rememberPrice(ledger, { ...input, packageSize: "  2 x 500 g  " }, now.toISOString(), "new").ledger;
  ledger = rememberPrice(ledger, input, now.toISOString(), "legacy").ledger;
  const quotes = quoteItems(ledger, "2000", [line.name], "2026-10-26");
  assert.equal(quotes[0].records[1].packageSize, "2 x 500 g");
  assert.equal(quotes[0].records[0].packageSize, null);
  const result = buildShoppingOffers([line], [], quotes, options)[0];
  assert.equal(result.estimatedCents, 800);
  assert.notEqual(result.estimatedCents, quotes[0].averageCents);
});

test("latest observation for the same shop, item and pack supersedes its earlier cheaper price", () => {
  const result = buildShoppingOffers([line], [], quoted([
    record({ id: "old", at: "2026-10-25T09:00:00Z", cents: 200 }),
    record({ id: "new", at: "2026-10-26T09:00:00Z", cents: 500 }),
  ]), options)[0];
  assert.equal(result.offers.length, 1);
  assert.equal(result.estimatedCents, 1000);
  assert.match(result.offers[0].id, /new/);
});

test("stale, future and missing timestamps remain visible but cannot silently enter an estimate", () => {
  const rows = [
    buildShoppingOffers([line], [catalogue({ fetchedAt: "2026-10-26T09:44:00Z" })], [], options)[0],
    buildShoppingOffers([line], [catalogue({ fetchedAt: null })], [], options)[0],
    buildShoppingOffers([line], [], quoted([record({ at: "2026-10-18T10:00:00Z" })]), options)[0],
    buildShoppingOffers([line], [], quoted([record({ at: "2026-10-27T10:00:00Z" })]), options)[0],
    buildShoppingOffers([line], [], quoted([record({ kind: "page", at: "2026-10-25T09:00:00Z" })]), options)[0],
  ];
  for (const row of rows) {
    assert.equal(row.offers.length, 1);
    assert.equal(row.offers[0].eligible, false);
    assert.equal(row.estimatedCents, null);
  }
  assert.equal(rows[0].offers[0].freshness, "stale");
  assert.equal(rows[1].offers[0].freshness, "unknown");
  assert.equal(rows[4].offers[0].source, "public-page");
});

test("special end dates are interpreted as Australian local days and malformed dates fail closed", () => {
  const special = record({ kind: "special", until: "2026-10-26" });
  const beforeMidnight = buildShoppingOffers([line], [], quoted([], [special]), { ...options, now: new Date("2026-10-26T12:59:00Z") })[0];
  const afterMidnight = buildShoppingOffers([line], [], quoted([], [special]), { ...options, now: new Date("2026-10-26T13:01:00Z") })[0];
  assert.equal(beforeMidnight.offers[0].eligible, true);
  assert.equal(afterMidnight.offers[0].freshness, "stale");
  const invalid = buildShoppingOffers([line], [], quoted([], [{ ...special, until: "2026-99-99" }]), options)[0];
  assert.equal(invalid.estimatedCents, null);
  assert.equal(invalid.offers[0].freshness, "unknown");
});

test("dietary wording still requires explicit matching product evidence before automatic cost choice", () => {
  for (const [name, productName] of [["Vegan red curry paste", "Thai Red Curry Paste"], ["Gluten-free bread", "White Bread"]]) {
    const dietLine = { ...line, name, amount: 300 };
    const matches = matchProducts(name, [{ name: productName, packageSize: "500g", priceCents: 500, stockcode: "test", inStock: true, available: true }]);
    assert.equal(matches.length, 1);
    const result = buildShoppingOffers([dietLine], [catalogue({ query: name, matches })], [], options)[0];
    assert.equal(result.offers[0].match, "review");
    assert.equal(result.offers[0].reviewable, false);
    assert.match(result.offers[0].reviewReason!, /does not establish/);
    assert.equal(result.estimatedCents, null);
  }
  const name = "Gluten-free bread";
  const matches = matchProducts(name, [{ name: "Gluten Free White Bread", packageSize: "500g", priceCents: 500, stockcode: "gf", inStock: true, available: true }]);
  assert.equal(buildShoppingOffers([{ ...line, name, amount: 300 }], [catalogue({ query: name, matches })], [], options)[0].estimatedCents, 500);
});

test("plain staple brand ties produce a suggested estimate while preserving explicit choice", () => {
  const products = ["Brand One Jasmine Rice", "Brand Two Jasmine Rice"].map((name, index) => ({ name, priceCents: 300 + index * 50, packageSize: "1 kg", stockcode: String(index), inStock: true, available: true }));
  const matches = matchProducts(line.name, products);
  const result = buildShoppingOffers([line], [catalogue({ matches })], [], options)[0];
  assert.equal(result.estimatedCents, 600);
  assert.ok(result.offers.every(offer => offer.eligible && offer.reviewable && offer.cost.lineCents != null));
  assert.match(result.offers[0].reviewReason!, /Suggested for this quantity/);
  assert.equal(isShoppingOfferSelectable(result.offers[1]), true);
  const selected = applyShoppingOfferSelection(result, result.offers[1].id);
  assert.equal(selected.estimatedCents, 700);
  assert.equal(selected.chosenOfferId, result.offers[1].id);
  assert.equal(result.estimatedCents, 600);
  assert.equal(applyShoppingOfferSelections([result], { [line.id]: result.offers[1].id })[0].estimatedCents, 700);
  assert.equal(applyShoppingOfferSelection(selected, null).estimatedCents, null);
  assert.equal(applyShoppingOfferSelection(result, "missing"), result);
  const refreshedWithoutChoice = applyShoppingOfferSelections([result], { [line.id]: "previous-product-no-longer-returned" })[0];
  assert.equal(refreshedWithoutChoice.estimatedCents, null);
  assert.match(refreshedWithoutChoice.reason || "", /previous product choice/);
  const reordered = buildShoppingOffers([line], [catalogue({ matches: [...matches].reverse() })], [], options)[0];
  assert.equal(applyShoppingOfferSelection(reordered, result.offers[1].id).offers.find(offer => offer.id === result.offers[1].id)?.productName, result.offers[1].productName);
  assert.equal(matchProducts(line.name, [{ ...products[0], inStock: false, available: false }])[0].reviewable, false);
});

test("actual firm tofu and jasmine rice brand alternatives produce the cheapest quantity-aware suggestion", () => {
  const tofuLine = { id: "tofu", name: "Firm tofu", amount: 750, unit: "g" };
  const riceLine = { id: "rice", name: "Jasmine rice", amount: 450, unit: "g" };
  const products = (rows: [string, number, string][]) => rows.map(([name, priceCents, packageSize], i) => ({ name, priceCents, packageSize, stockcode: String(i), inStock: true, available: true }));
  const tofu = products([["Evergreen Original Tofu Regular Firm", 500, "900g"], ["Macro Firm Tofu", 280, "450g"], ["Macro Honey Soy Tofu", 100, "900g"], ["Macro Classic Tofu Regular Firmness", 100, "900g"]]);
  const rice = products([["Macro Organic Jasmine Rice", 480, "750g"], ["Sunrice Jasmine Rice", 680, "2kg"], ["Sunrice Rice Jasmine", 315, "1kg"], ["Sunrice Microwave Jasmine Rice Pouch", 100, "450g"]]);
  const quotes = [catalogue({ query: tofuLine.name, matches: matchProducts(tofuLine.name, tofu) }), catalogue({ query: riceLine.name, matches: matchProducts(riceLine.name, rice) })];
  const result = buildShoppingOffers([tofuLine, riceLine], quotes, [], options);
  assert.equal(result[0].estimatedCents, 500);
  assert.equal(result[1].estimatedCents, 315);
  assert.equal(summarizeShoppingCosts(result).knownSubtotalCents, 815);
  assert.equal(summarizeShoppingCosts(result).complete, true);
  assert.ok(result[0].offers.filter(offer => /Honey|Firmness/.test(offer.productName)).every(offer => !offer.eligible));
  assert.equal(result[1].offers.find(offer => /Microwave/.test(offer.productName))?.eligible, false);
  assert.ok(result.every(row => row.offers.find(offer => offer.id === row.chosenOfferId)?.match === "review"));
});

test("generated Plain firm tofu wording accepts explicitly Original firm tofu without widening other wording", () => {
  const name = "Plain firm tofu";
  const products = [
    { name: "Evergreen Original Tofu Regular Firm", priceCents: 500, packageSize: "900g", stockcode: "original", inStock: true, available: true },
    { name: "Brand Original Firm Tofu", priceCents: 400, packageSize: "300g", stockcode: "original-small", inStock: true, available: true },
    { name: "Macro Firm Tofu", priceCents: 100, packageSize: "900g", stockcode: "no-plain-claim", inStock: true, available: true },
    { name: "Original Tofu Regular Firmness", priceCents: 100, packageSize: "900g", stockcode: "wrong-firm-word", inStock: true, available: true },
  ];
  const matches = matchProducts(name, products);
  const row = buildShoppingOffers([{ ...line, name, amount: 750 }], [catalogue({ query: name, matches })], [], options)[0];
  assert.equal(row.estimatedCents, 500);
  assert.equal(row.offers.find(offer => offer.id === row.chosenOfferId)?.productName, products[0].name);
  assert.equal(row.offers.find(offer => offer.productName === "Macro Firm Tofu")?.eligible, false);
  assert.equal(row.offers.find(offer => /Firmness/.test(offer.productName))?.eligible, false);
});

test("Original tofu equivalence preserves flavour, preparation, dietary and stock restrictions", () => {
  for (const extra of ["Honey Soy", "Marinated", "Smoked", "Teriyaki", "Satay", "Silken"]) {
    const name = "Plain firm tofu";
    const matches = matchProducts(name, [{ name: `Original ${extra} Firm Tofu`, priceCents: 100, packageSize: "900g", stockcode: extra, inStock: true, available: true }]);
    const row = buildShoppingOffers([{ ...line, name }], [catalogue({ query: name, matches })], [], options)[0];
    assert.equal(row.estimatedCents, null, extra);
    assert.equal(row.offers[0]?.eligible, false, extra);
  }
  for (const [name, stocked] of [["Vegan plain firm tofu", true], ["Gluten-free plain firm tofu", true], ["Plain firm tofu", false]] as const) {
    const matches = matchProducts(name, [{ name: "Evergreen Original Tofu Regular Firm", priceCents: 500, packageSize: "900g", stockcode: "restricted", inStock: stocked, available: stocked }]);
    const row = buildShoppingOffers([{ ...line, name }], [catalogue({ query: name, matches })], [], options)[0];
    assert.equal(row.estimatedCents, null, name);
    assert.equal(row.offers[0]?.eligible, false, name);
  }
});

test("unrequested rice and tofu food forms stay out of automatic estimates even for one catalogue hit", () => {
  const wrongForms: [string, string[]][] = [
    ["Jasmine rice", ["Microwave Jasmine Rice", "Ready Cooked Jasmine Rice", "Brown Jasmine Rice", "Jasmine Rice Blend", "Jasmine Rice With Quinoa", "Coconut Flavoured Jasmine Rice", "Chicken Flavour Jasmine Rice", "Jasmine Rice Flour"]],
    ["Firm tofu", ["Honey Soy Firm Tofu", "Marinated Firm Tofu", "Smoked Firm Tofu", "Teriyaki Firm Tofu", "Satay Firm Tofu", "Firm Tofu Stir Fry", "Firm Silken Tofu"]],
  ];
  for (const [name, products] of wrongForms) for (const productName of products) {
    const matches = matchProducts(name, [{ name: productName, priceCents: 100, packageSize: "1kg", stockcode: productName, inStock: true, available: true }]);
    const row = buildShoppingOffers([{ ...line, name }], [catalogue({ query: name, matches })], [], options)[0];
    assert.equal(row.estimatedCents, null, `${name}: ${productName}`);
    assert.equal(row.offers[0]?.eligible, false, productName);
    assert.match(row.offers[0]?.reviewReason ?? "", /different food form/, productName);
  }
});

test("official cooked-rice metadata blocks a blandly named ready pack from dry-rice costs or manual cost selection", () => {
  const name = "Jasmine rice";
  const products = parseWoolworthsSearch({ Products: [{ Products: [
    { Name: "Woolworths Family Size Jasmine Rice", PackageSize: "450g", Price: 2.75, Stockcode: 528193, IsInStock: true, IsAvailable: true, AdditionalAttributes: { sapsegmentname: "RICE - MICROWAVEABLE - PLAIN", ingredients: "Cooked Rice (98%) (Water, Jasmine Rice), Vegetable Oil, Stabiliser (471)" } },
    { Name: "Sunrice Rice Jasmine", PackageSize: "1kg", Price: 3.15, Stockcode: 2, IsInStock: true, IsAvailable: true, AdditionalAttributes: { ingredients: "Jasmine Rice" } },
  ] }] }).products;
  const row = buildShoppingOffers([{ ...line, name, amount: 450 }], [catalogue({ query: name, matches: matchProducts(name, products) })], [], options)[0];
  assert.equal(row.estimatedCents, 315);
  const cooked = row.offers.find(offer => /Family Size/.test(offer.productName))!;
  assert.equal(cooked.priceCents, 275);
  assert.equal(cooked.eligible, false);
  assert.equal(cooked.cost.lineCents, null);
  assert.equal(isShoppingOfferSelectable(cooked), false);
  assert.equal(applyShoppingOfferSelection(row, cooked.id), row);
  assert.match(cooked.reviewReason!, /Retailer metadata identifies cooked rice/);
  // A sole cooked candidate must also remain unknown, even if the name matcher selected it.
  const onlyCooked = buildShoppingOffers([{ ...line, name, amount: 450 }], [catalogue({ query: name, matches: matchProducts(name, [products[0]]) })], [], options)[0];
  assert.equal(onlyCooked.estimatedCents, null);
});

test("a genuine dry 450g rice pack remains costable and explicitly cooked weights can match cooked packs", () => {
  const dry = { name: "Brand Jasmine Rice", priceCents: 275, packageSize: "450g", stockcode: "dry", inStock: true, available: true };
  const dryRow = buildShoppingOffers([{ ...line, amount: 450 }], [catalogue({ matches: matchProducts(line.name, [dry]) })], [], options)[0];
  assert.equal(dryRow.estimatedCents, 275);
  const name = "Cooked Jasmine rice";
  const matches = matchProducts(name, [{ ...dry, name: "Brand Cooked Jasmine Rice", preparedForm: "cooked-rice" }]);
  const cooked = buildShoppingOffers([{ ...line, name, amount: 450 }], [catalogue({ query: name, matches })], [], options)[0];
  assert.equal(cooked.estimatedCents, 275);
});

test("fresh produce cannot be automatically replaced by powder, paste or preserved products", () => {
  for (const productName of ["Garlic Powder", "Garlic Paste", "Pickled Garlic", "Frozen Garlic", "Roasted Garlic"]) {
    const name = "Garlic";
    const matches = matchProducts(name, [{ name: productName, priceCents: 100, packageSize: "100g", stockcode: productName, inStock: true, available: true }]);
    const row = buildShoppingOffers([{ ...line, name, category: "produce" }], [catalogue({ query: name, matches })], [], options)[0];
    assert.equal(row.estimatedCents, null, productName);
  }
});

test("brand-tie suggestions never broaden meat or fish cuts or bypass dietary evidence", () => {
  for (const name of ["Chicken", "Chicken thigh fillet", "Beef rump steak", "Fish fillet", "Vegan firm tofu", "Gluten-free jasmine rice"]) {
    const plain = name.replace(/^Vegan |^Gluten-free /i, "");
    const products = ["Brand One", "Brand Two"].map((brand, i) => ({ name: `${brand} ${plain}`, priceCents: 100 + i, packageSize: "1kg", stockcode: String(i), inStock: true, available: true }));
    const matches = matchProducts(name, products);
    const row = buildShoppingOffers([{ ...line, name }], [catalogue({ query: name, matches })], [], options)[0];
    assert.equal(row.estimatedCents, null, name);
    assert.ok(row.offers.every(offer => !offer.eligible), name);
  }
});

test("unknown stock, ambiguous products and cooked/drained conversions cannot create automatic totals", () => {
  for (const override of [{ selected: false }, { stock: "UNKNOWN" as const }, { stock: "OUT_OF_STOCK" as const }]) {
    const quote = catalogue();
    quote.matches = [{ ...quote.matches[0], ...override }];
    assert.equal(buildShoppingOffers([line], [quote], [], options)[0].estimatedCents, null);
    const row = buildShoppingOffers([line], [quote], [], options)[0];
    if (override.stock) {
      assert.equal(isShoppingOfferSelectable(row.offers[0]), false);
      assert.equal(applyShoppingOfferSelection(row, row.offers[0].id), row);
    }
  }
  const cooked = { ...line, name: "Cooked jasmine rice" };
  const result = buildShoppingOffers([cooked], [catalogue({ query: cooked.name })], [], options)[0];
  assert.equal(result.estimatedCents, null);
  assert.match(result.offers[0].cost.reason!, /Cooked or drained/);
});

test("all meaningful requested staple words must occur even if the catalogue matcher chose one row", () => {
  for (const [name, productName] of [["Organic jasmine rice", "Brand Jasmine Rice"], ["Firm tofu", "Brand Regular Tofu Firmness"], ["Jasmine rice", "Brand Basmati Rice"]]) {
    const match = { ...catalogue().matches[0], name: productName, selected: true, reviewable: true };
    const result = buildShoppingOffers([{ ...line, name }], [catalogue({ query: name, matches: [match] })], [], options)[0];
    assert.equal(result.estimatedCents, null, `${name}: ${productName}`);
  }
});

test("partial list totals expose missing lines during progressive batches and never call them zero", () => {
  const rows = buildShoppingOffers([line, { id: "cumin", name: "Cumin", amount: 1, unit: "tsp" }], [catalogue()], [], options);
  const result = summarizeShoppingCosts(rows, 5);
  assert.equal(result.knownSubtotalCents, 700);
  assert.equal(result.pricedLines, 1);
  assert.equal(result.unpricedLines, 4);
  assert.equal(result.complete, false);
  assert.match(result.label, /Partial/);
  assert.equal(summarizeShoppingCosts([rows[1]]).knownSubtotalCents, null);
  assert.equal(summarizeShoppingCosts([rows[0]]).complete, true);
  assert.match(summarizeShoppingCosts([rows[0]]).label, /not a confirmed basket at one shop/);
});
