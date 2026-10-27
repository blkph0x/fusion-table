import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Shop, ShopKind } from "../lib/locations.ts";
import { ingredientMatchesShop, inferShoppingCategory, normalizeShoppingLine, productSearchLink, rankShopsForList, type ShoppingLine } from "../lib/shopping.ts";

function shop(id: string, kind: ShopKind, type: string | undefined, distanceKm: number, name = id): Shop {
  return { id, name, kind, shopType: type, distanceKm, lat: -33.8, lon: 151.2, address: null, website: null, phone: null, openingHours: null, osmUrl: `https://www.openstreetmap.org/node/${id}`, inventoryStatus: "unverified" };
}
const lines: ShoppingLine[] = [
  { id: "carrot", name: "Fresh carrots", amount: 300, unit: "g", category: "produce" },
  { id: "chicken", name: "Boneless chicken thighs", amount: 600, unit: "g", category: "butcher" },
  { id: "salmon", name: "Salmon fillets", amount: 400, unit: "g", category: "fishmonger" },
  { id: "bread", name: "Vegan flatbread", amount: 4, unit: "", category: "grocery" },
  { id: "cumin", name: "Ground cumin", amount: 1, unit: "tsp", category: "specialty" },
];

describe("nearby shopping-list relevance", () => {
  it("explains likely list coverage separately from stock, prices or cheapest claims", () => {
    const shops = [shop("far", "supermarket", "supermarket", 10), shop("near", "supermarket", "supermarket", 0.5), shop("butcher", "butcher", "butcher", 0.1)];
    const ranked = rankShopsForList(lines, shops, { radiusKm: 5 });
    assert.deepEqual(ranked.map((row) => row.shop.id), ["near", "butcher"]);
    assert.equal(ranked[0].matchedCount, 5);
    assert.equal(ranked[0].totalNeeded, 5);
    assert.equal(ranked[0].coveragePercent, 100);
    assert.equal(ranked[0].inventoryStatus, "unverified");
    assert.match(ranked[0].coverageLabel, /suggested by shop type.*stock unconfirmed/);
    assert.equal("price" in ranked[0], false);
    assert.equal("available" in ranked[0], false);
    assert.deepEqual(ranked[1].matchedIngredientIds, ["chicken"]);
    assert.match(ranked[1].matchedIngredients[0].reason, /butcher listing/);
  });

  it("matches only the relevant fresh, bakery and spice categories", () => {
    const shops = [shop("veg", "produce", "greengrocer", 1), shop("meat", "butcher", "butcher", 1), shop("fish", "fishmonger", "seafood", 1), shop("bread", "specialty", "bakery", 1), shop("spice", "specialty", "spices", 1)];
    for (const row of rankShopsForList(lines, shops)) {
      const expected: Record<string, string> = { veg: "carrot", meat: "chicken", fish: "salmon", bread: "bread", spice: "cumin" };
      assert.deepEqual(row.matchedIngredientIds, [expected[row.shop.id]]);
      assert.equal(row.matchedCount, 1);
    }
    assert.equal(rankShopsForList(lines, [shop("market", "market", undefined, 0.1), shop("gift", "specialty", "gift", 0.1)]).length, 0);
  });

  it("infers old/custom ingredient categories without mistaking substitutes or condiments for meat", () => {
    for (const [name, category] of [
      ["Chicken breast fillets", "butcher"], ["Ground beef", "butcher"], ["Raw peeled prawns", "fishmonger"], ["Fresh coriander", "produce"], ["Bird's eye chillies", "produce"],
      ["Fish sauce", "grocery"], ["Chicken stock", "grocery"], ["Chicken seasoning", "grocery"], ["Vegan chicken pieces", "grocery"], ["Jackfruit pulled pork", "grocery"], ["Canned tomatoes", "grocery"], ["Ground coriander", "grocery"],
    ] as const) assert.equal(inferShoppingCategory(name), category, name);
    const custom = { id: "custom", name: "Fresh carrots", amount: 2, unit: "" };
    assert.deepEqual(normalizeShoppingLine(custom).allergens, []);
    assert.equal(ingredientMatchesShop(custom, shop("veg", "produce", "greengrocer", 1)), true);
    assert.equal(ingredientMatchesShop({ ...custom, name: "Fish sauce" }, shop("fish", "fishmonger", "seafood", 1)), false);
    assert.equal(ingredientMatchesShop({ ...custom, name: "Ground cumin" }, shop("spice", "specialty", "spices", 1)), true);
    assert.equal(ingredientMatchesShop({ ...custom, name: "Sweet paprika" }, shop("spice", "specialty", "spices", 1)), true);
    assert.equal(ingredientMatchesShop({ ...custom, name: "Dried basil" }, shop("spice", "specialty", "spices", 1)), true);
    assert.equal(ingredientMatchesShop({ ...custom, name: "Fresh basil" }, shop("spice", "specialty", "spices", 1)), false);
  });

  it("uses pantry needs, de-duplicates ids, applies name filters and leaves inputs unchanged", () => {
    const pantry = { ...lines[0], inPantry: true };
    const input = [pantry, lines[1], lines[1], { ...lines[2], amount: 0 }];
    const shops = [shop("1", "supermarket", "supermarket", 1, "IGA Newtown"), shop("2", "supermarket", "supermarket", 1, "Woolworths")];
    const before = JSON.stringify({ input, shops });
    const ranked = rankShopsForList(input, shops, { shopName: "newtown iga" });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].totalNeeded, 1);
    assert.deepEqual(ranked[0].matchedIngredientIds, ["chicken"]);
    assert.equal(rankShopsForList(input, shops, { includePantry: true })[0].totalNeeded, 2);
    assert.equal(JSON.stringify({ input, shops }), before);
  });

  it("orders equal coverage by real distance, then stable name/id, and preserves unknown distances honestly", () => {
    const shops = [shop("unknown", "supermarket", "supermarket", Number.NaN), shop("far", "supermarket", "supermarket", 2), shop("near", "supermarket", "supermarket", 0.2), shop("negative", "supermarket", "supermarket", -1)];
    const ranked = rankShopsForList(lines, shops, { radiusKm: 2 });
    assert.deepEqual(ranked.slice(0, 2).map((row) => row.shop.id), ["near", "far"]);
    const unknown = ranked.find((row) => row.shop.id === "unknown")!;
    assert.equal(unknown.distanceKnown, false);
    assert.equal(unknown.withinRadius, null);
    assert.ok(unknown.reasons.some((reason) => /Distance unavailable/.test(reason)));
    const tied = [shop("b", "supermarket", "supermarket", 1, "Same"), shop("a", "supermarket", "supermarket", 1, "Same")];
    assert.deepEqual(rankShopsForList(lines, tied).map((row) => row.shop.id), ["a", "b"]);
    assert.equal(rankShopsForList(lines, tied, { limit: 1 }).length, 1);
    assert.equal(rankShopsForList(lines, tied, { limit: 0 }).length, 0);
    assert.throws(() => rankShopsForList(lines, shops, { radiusKm: Number.NaN }), /radius/);
    assert.throws(() => rankShopsForList(lines, shops, { radiusKm: 0 }), /radius/);
  });

  it("respects the exact selected radius and source subtype", () => {
    const outside = shop("outside", "supermarket", "supermarket", 1.000001);
    const inside = shop("inside", "supermarket", "supermarket", 1);
    const mislabeled = shop("bakery", "supermarket", "bakery", 0.1);
    const ranked = rankShopsForList([lines[1]], [outside, inside, mislabeled, inside], { radiusKm: 1 });
    assert.deepEqual(ranked.map((row) => row.shop.id), ["inside"]);
    assert.equal(rankShopsForList([], [inside]).length, 0);
  });
});

describe("public retailer ingredient links", () => {
  it("encodes full dietary/product terms in verified Woolworths and Coles searches", () => {
    const term = "Gluten-free bread & vegan rolls";
    const woolies = productSearchLink(shop("1", "supermarket", "supermarket", 1, "Woolworths Metro"), term, "Newtown 2042");
    const coles = productSearchLink(shop("2", "supermarket", "supermarket", 1, "Coles Local"), term, "Newtown 2042");
    assert.equal(new URL(woolies.url).searchParams.get("searchTerm"), term);
    assert.equal(new URL(coles.url).searchParams.get("q"), term);
    assert.equal(woolies.kind, "retailer-search");
    assert.match(woolies.note, /Newtown 2042.*does not confirm local stock or price/);
  });

  it("uses official ALDI/IGA destinations without inventing stock or unsupported search parameters", () => {
    const aldi = productSearchLink(shop("1", "supermarket", "supermarket", 1, "ALDI"), lines[0]);
    const iga = productSearchLink(shop("2", "supermarket", "supermarket", 1, "IGA Newtown"), lines[0]);
    assert.equal(aldi.url, "https://www.aldi.com.au/Products");
    assert.equal(iga.url, "https://www.igashop.com.au/");
    assert.equal(aldi.kind, "retailer-website");
    assert.equal(iga.kind, "retailer-website");
  });

  it("offers a public shop website and area-specific web fallback, rejecting unsafe destinations", () => {
    const butcher = { ...shop("meat", "butcher", "butcher", 1, "Local Butcher"), website: "https://butcher.example/products" };
    const link = productSearchLink(butcher, lines[1], "Newtown 2042");
    assert.equal(link.url, butcher.website);
    assert.equal(new URL(link.fallbackUrl!).searchParams.get("q"), "Local Butcher Newtown 2042 Boneless chicken thighs");
    for (const website of ["javascript:alert(1)", "https://user:password@example.com", "http://127.0.0.1/", "http://shop.local/"]) {
      const fallback = productSearchLink({ ...butcher, website }, "chicken", "Newtown 2042");
      assert.equal(fallback.kind, "web-search");
      assert.equal(new URL(fallback.url).hostname, "www.google.com");
    }
    const independent = productSearchLink({ ...butcher, name: "Coles Family Butchers" }, "chicken");
    assert.equal(independent.url, butcher.website, "independent butcher names must not imply the Coles chain");
  });
});
