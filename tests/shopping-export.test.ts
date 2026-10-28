import assert from "node:assert/strict";
import { test } from "node:test";
import type { Shop } from "../lib/locations.ts";
import type { PriceQuote } from "../lib/catalogue.ts";
import { buildShoppingOffers } from "../lib/shopping-costs.ts";
import { shoppingListCsv } from "../lib/shopping-export.ts";
import { applyShoppingStrategy, DEFAULT_SHOPPING_STRATEGY } from "../lib/shopping-strategy.ts";

const meat = { id: "chicken", name: "Chicken breast", amount: 600, unit: "g" };
const butcher: Shop = { id: "fixture/butcher", name: "Fixture local butcher", kind: "butcher", shopType: "butcher", lat: -34.57, lon: 150.77, distanceKm: 0, address: null, website: null, phone: null, openingHours: null, osmUrl: "https://www.openstreetmap.org", inventoryStatus: "unverified" };
const context = { shops: [butcher], location: { lat: butcher.lat, lon: butcher.lon }, radiusKm: 5 };

test("an assigned unpriced butcher is retained in the exported shopping route without a zero cost", () => {
  const selection = applyShoppingStrategy([meat], [], { ...DEFAULT_SHOPPING_STRATEGY, specialists: true, butcherShopId: butcher.id }, context);
  const csv = shoppingListCsv([meat], { ...context, area: "Fixture area", selection });
  const row = csv.split("\r\n")[1];
  assert.ok(row.includes('"Fixture local butcher"'));
  assert.ok(row.includes('"Price unknown","Price unknown / not listed"'));
  assert.ok(!row.includes('"0.00"'));
});

test("export uses the selected chain's actual pack basket and identifies its product evidence", () => {
  const now = new Date();
  const quote: PriceQuote = { query: meat.name, source: "woolworths-online-catalogue", label: "Online guide", fetchedAt: now.toISOString(), cached: false, fulfilmentStoreId: null, searched: [meat.name], error: null, matches: [{ name: "Chicken breast", priceCents: 550, packageSize: "500 g", stock: "IN_STOCK", selected: true, score: 50, reason: "Exact name", url: "https://example.test/chicken" }] };
  const costs = buildShoppingOffers([meat], [quote], [], { area: "Fixture area", now });
  const selection = applyShoppingStrategy([meat], costs, { ...DEFAULT_SHOPPING_STRATEGY, mode: "woolworths" }, context);
  const csv = shoppingListCsv([meat], { selection });
  assert.ok(csv.includes('"11.00"'));
  assert.match(csv, /Woolworths/);
  assert.ok(csv.includes('"Chicken breast"'));
});

test("a stale quantity assignment cannot export an old shop or price for an edited list", () => {
  const selection = applyShoppingStrategy([meat], [], { ...DEFAULT_SHOPPING_STRATEGY, specialists: true, butcherShopId: butcher.id }, context);
  const csv = shoppingListCsv([{ ...meat, amount: 1200 }], { selection });
  assert.ok(csv.includes('"1200 g","Not selected","Price unknown"'));
  assert.ok(!csv.includes(butcher.name));
});

test("CSV quotes names and prevents user-entered spreadsheet formula cells", () => {
  const csv = shoppingListCsv([{ id: "custom", name: '=HYPERLINK("https://example.test")', amount: 1, unit: "each" }], { area: " +SUM(1,2)" });
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.test"")"'));
  assert.ok(csv.includes('"\' +SUM(1,2)"'));
  assert.ok(csv.includes('"Price unknown"'));
});
