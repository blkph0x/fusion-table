import assert from "node:assert/strict";
import { test } from "node:test";
import type { PriceQuote } from "../lib/catalogue.ts";
import { readReportJson, ReportBodyError } from "../lib/ledger.ts";
import { itemKey, type ItemQuote, type PriceMemory } from "../lib/price-memory.ts";
import { compareShopping } from "../lib/shopping-compare.ts";
import { australianPriceGuide, parseShoppingPriceRequest } from "../lib/shopping-request.ts";
import { lookupLocalShopPrices } from "../lib/local-shop-prices.ts";
import type { Shop } from "../lib/locations.ts";

const now = new Date("2026-10-26T13:01:00Z");
const rice = { id: "rice", name: "Jasmine rice", amount: 1200, unit: "g" };
const body = { lines: [rice], area: "Sydney NSW 2000", country: "Australia", device: "audit-pricing", shops: [{ id: "osm/123", name: "Corner grocer" }], online: true };
const request = () => parseShoppingPriceRequest(body);
const deps = (): Parameters<typeof compareShopping>[1] => ({ woolworths: async () => [], coles: async () => [], recorded: async () => [], now: () => now });
function quote(source: PriceQuote["source"], priceCents: number | null = 450): PriceQuote {
  return { query: rice.name, source, label: "Online guide, not a local shelf check.", fetchedAt: now.toISOString(), cached: false, fulfilmentStoreId: "default", searched: [rice.name], error: null, matches: [{ name: "Jasmine Rice", priceCents, packageSize: "1 kg", stock: "IN_STOCK", url: null, score: 50, selected: priceCents != null, reason: "Check packet." }] };
}
function localRecord(overrides: Partial<PriceMemory> = {}): ItemQuote[] {
  return [{ itemKey: itemKey(rice.name), itemName: rice.name, averageCents: 1, averageCount: 2, averageLabel: "Historical average", records: [{ id: "record", at: now.toISOString(), shopName: "Corner grocer", shopId: "osm/123", area: "2000", itemKey: itemKey(rice.name), itemName: rice.name, cents: 350, packageSize: "1 kg", kind: "recorded", until: "", url: "", label: "User recorded.", ...overrides }], specials: [] }];
}

test("shopping requests normalize the area and bound six distinct ingredient lines", () => {
  const parsed = request();
  assert.equal(parsed.area, "2000");
  assert.equal(parsed.lines[0].amount, 1200);
  assert.equal(parsed.shops[0].id, "osm/123");
  assert.equal(parseShoppingPriceRequest({ ...body, lines: Array.from({ length: 6 }, (_, i) => ({ ...rice, id: `rice-${i}` })) }).lines.length, 6);
  for (const lines of [[], Array.from({ length: 7 }, (_, i) => ({ ...rice, id: String(i) })), [rice, rice]]) {
    assert.throws(() => parseShoppingPriceRequest({ ...body, lines }), /1 and 6|own name/);
  }
});

test("invalid names, identifiers, amounts, units and shapes are rejected before provider work", () => {
  for (const value of [null, [], "not a request", { ...body, area: "" }, { ...body, lines: [null] }]) assert.throws(() => parseShoppingPriceRequest(value));
  for (const changed of [{ id: "" }, { id: "x".repeat(121) }, { name: "x" }, { name: "x".repeat(161) }, { amount: 0 }, { amount: -1 }, { amount: NaN }, { amount: Infinity }, { amount: "2" }, { amount: 1_000_001 }, { unit: null }, { unit: "x".repeat(31) }]) {
    assert.throws(() => parseShoppingPriceRequest({ ...body, lines: [{ ...rice, ...changed }] }));
  }
  for (const changed of [{ device: "x".repeat(129) }, { device: "unsafe/id" }, { device: {} }, { country: {} }, { country: "x".repeat(81) }, { online: "false" }, { shops: {} }, { shops: Array(121).fill(body.shops[0]) }]) {
    assert.throws(() => parseShoppingPriceRequest({ ...body, ...changed }));
  }
});

test("oversized or malformed shop metadata cannot become an association by prefix truncation", () => {
  const result = parseShoppingPriceRequest({ ...body, shops: [null, { id: "x".repeat(121), name: "Bad" }, { id: "osm/ok", name: "Valid grocer" }] });
  assert.deepEqual(result.shops, [{ id: "osm/ok", name: "Valid grocer" }]);
  const hostile = parseShoppingPriceRequest({ ...body, lines: [{ ...rice, category: "anything", allergens: [null, "milk", "x".repeat(41)], aliases: Array(1000).fill("ignored") }] });
  assert.equal(hostile.lines[0].category, undefined);
  assert.deepEqual(hostile.lines[0].allergens, ["milk"]);
  assert.equal(hostile.lines[0].aliases, undefined);
});

test("the streamed request size cap rejects large JSON without reading the entire body", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65_537)); }, cancel() { cancelled = true; } });
  const input = new Request("http://localhost/fusion/api/shopping-prices", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(readReportJson(input), (error: unknown) => error instanceof ReportBodyError && error.status === 413);
  assert.equal(cancelled, true);
});

test("Woolworths failure leaves Coles and exact local recorded prices available", async () => {
  const providers = deps();
  providers.woolworths = async () => { throw new Error("Fixture outage"); };
  providers.coles = async () => [quote("coles-online-catalogue")];
  providers.recorded = async () => localRecord();
  const result = await compareShopping(request(), providers);
  assert.equal(result.lines[0].offers.length, 2);
  assert.equal(result.lines[0].offers[0].scope, "chain-online");
  assert.equal(result.lines[0].offers[0].shopId, null);
  assert.equal(result.lines[0].offers[1].scope, "shop-recorded");
  assert.equal(result.lines[0].offers[1].shopId, "osm/123");
  assert.equal(result.summary.knownSubtotalCents, 700);
  assert.match(result.warnings.join(" "), /Woolworths prices could not/);
});

test("synchronous provider failures are isolated like rejected asynchronous calls", async () => {
  const providers = deps();
  providers.coles = () => { throw new Error("Synchronous fixture error"); };
  providers.woolworths = async () => [quote("woolworths-online-catalogue")];
  const result = await compareShopping(request(), providers);
  assert.equal(result.summary.knownSubtotalCents, 900);
  assert.match(result.warnings.join(" "), /Coles prices could not/);
});

test("local ledger failure and per-item catalogue errors leave honest partial results", async () => {
  const providers = deps();
  providers.recorded = async () => { throw new Error("Fixture ledger unavailable"); };
  providers.woolworths = async () => [quote("woolworths-online-catalogue"), { ...quote("woolworths-online-catalogue"), query: "Cumin", matches: [], error: "Unavailable" }];
  const input = parseShoppingPriceRequest({ ...body, lines: [rice, { id: "cumin", name: "Cumin", amount: 1, unit: "tsp" }] });
  const result = await compareShopping(input, providers);
  assert.equal(result.summary.knownSubtotalCents, 900);
  assert.equal(result.summary.complete, false);
  assert.equal(result.summary.unpricedLines, 1);
  assert.equal(result.lines[1].estimatedCents, null);
  assert.match(result.warnings.join(" "), /Saved local prices could not.*Cumin.*Unavailable/);
});

test("no successful provider yields a missing estimate rather than a zero basket", async () => {
  const result = await compareShopping(request(), deps());
  assert.equal(result.lines[0].estimatedCents, null);
  assert.equal(result.summary.knownSubtotalCents, null);
  assert.equal(result.summary.pricedLines, 0);
  assert.equal(result.summary.complete, false);
  assert.match(result.summary.label, /Partial/);
});

test("non-Australian areas do not borrow Australian catalogue prices or collide with Australian postcodes", async () => {
  let onlineCalls = 0;
  const providers = deps();
  providers.woolworths = providers.coles = async () => { onlineCalls++; throw new Error("Should not be called"); };
  providers.recorded = async () => { throw new Error("Australian area records must not be requested"); };
  const result = await compareShopping(parseShoppingPriceRequest({ ...body, country: "New Zealand" }), providers);
  assert.equal(onlineCalls, 0);
  assert.equal(result.lines[0].offers.length, 0);
  assert.match(result.warnings.join(" "), /Australian stores/);
  assert.equal(australianPriceGuide("AU"), true);
  assert.equal(australianPriceGuide("Australia"), true);
  assert.equal(australianPriceGuide("NZ"), false);
});

test("generic GPS locations can use online guides without borrowing a shared generic area's records", async () => {
  const providers = deps();
  providers.recorded = async () => { throw new Error("Generic area records must not be requested"); };
  const result = await compareShopping(parseShoppingPriceRequest({ ...body, localRecords: false }), providers);
  assert.ok(result.lines[0].offers.every((offer) => offer.scope === "chain-online"));
  assert.match(result.warnings.join(" "), /Choose a suburb or postcode/);
  assert.throws(() => parseShoppingPriceRequest({ ...body, localRecords: "false" }));
});

test("explicitly disabling online checks prevents retailer requests", async () => {
  let calls = 0;
  const providers = deps();
  providers.woolworths = providers.coles = async () => { calls++; return []; };
  await compareShopping({ ...request(), online: false }, providers);
  assert.equal(calls, 0);
});

test("duplicate ingredient names are looked up once and long names stay as unpriced local-only lines", async () => {
  const name = "Long ingredient wording ".repeat(5).trim();
  const input = parseShoppingPriceRequest({ ...body, lines: [rice, { ...rice, id: "second-rice" }, { id: "long", name, amount: 1, unit: "" }] });
  let asked: readonly string[] = [];
  const providers = deps();
  providers.woolworths = async queries => { asked = queries; return [quote("woolworths-online-catalogue")]; };
  const result = await compareShopping(input, providers);
  assert.deepEqual(asked, [rice.name]);
  assert.equal(result.lines.length, 3);
  assert.equal(result.lines[2].estimatedCents, null);
  assert.match(result.warnings.join(" "), /too long/);
});

test("special filtering receives Sydney's date rather than the previous UTC day", async () => {
  let today = "";
  const providers = deps();
  providers.recorded = async (_area, _items, day) => { today = day; return []; };
  await compareShopping(request(), providers);
  assert.equal(today, "2026-10-27");
});

test("aborting catalogue checks retains finished local evidence and gives a partial-source notice", async () => {
  const controller = new AbortController();
  const providers = deps();
  providers.woolworths = providers.coles = async (_queries, signal) => new Promise<PriceQuote[]>((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason), { once: true }));
  providers.recorded = async () => localRecord();
  const work = compareShopping(request(), providers, controller.signal);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  const result = await work;
  assert.equal(result.summary.knownSubtotalCents, 700);
  assert.match(result.warnings.join(" "), /took too long/);
  assert.equal(result.lines[0].offers[0].source, "recorded");
});

for (const retailer of ["woolworths", "coles", "aldi", "iga"] as const) test(`${retailer} keeps a completed ingredient when another lookup ignores cancellation`, { timeout: 2000 }, async () => {
  const controller = new AbortController();
  const input = parseShoppingPriceRequest({ ...body, lines: [rice, { id: "ginger", name: "Fresh ginger", amount: 50, unit: "g" }], localRecords: false });
  const providers = deps(); let calls = 0;
  let publish: ((quote: PriceQuote) => void) | undefined;
  const completed = quote(`${retailer}-online-catalogue`);
  if (retailer === "iga") Object.assign(completed, { scope: "selected-store", fulfilmentStoreId: "iga-branch", shop: { id: "iga-branch", name: "Verified IGA", website: "https://www.igashop.com.au", area: "2000" } });
  providers[retailer] = async (queries, signal, onQuote) => {
    calls++; assert.deepEqual(queries, [rice.name, "Fresh ginger"]); assert.equal(signal, controller.signal);
    publish = onQuote; onQuote!(completed);
    return new Promise<PriceQuote[]>(() => {}); // The second ingredient never cooperates.
  };
  const work = compareShopping(input, providers, controller.signal);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort(new DOMException("Fixture request deadline", "TimeoutError"));
  publish!({ ...quote(`${retailer}-online-catalogue`), query: "Fresh ginger", matches: [{ ...completed.matches[0], name: "Fresh Ginger", packageSize: "100g", priceCents: 1 }] });
  completed.matches[0].priceCents = 1; // An old provider object cannot mutate the saved evidence.
  const result = await work;
  assert.equal(calls, 1, "the existing batch function is invoked once, preserving its cache/renderer identity");
  assert.equal(result.lines[0].estimatedCents, 900); assert.equal(result.lines[0].offers[0].priceCents, 450);
  assert.equal(result.lines[1].estimatedCents, null); assert.equal(result.lines[1].offers.length, 0);
  assert.equal(result.summary.complete, false); assert.equal(result.summary.knownSubtotalCents, 900);
  assert.equal(result.providerStatuses.find(status => status.id === retailer)?.status, "partial");
  assert.match(result.warnings.join(" "), /Fresh ginger.*did not finish before/);
});

test("provider rejection retains completed quotes and refuses later callbacks before the overall deadline", async () => {
  const providers = deps();
  let publish: ((quote: PriceQuote) => void) | undefined, finishOther: (() => void) | undefined;
  providers.woolworths = () => new Promise(resolve => { finishOther = () => resolve([]); });
  providers.coles = async (_queries, _signal, onQuote) => { publish = onQuote; onQuote!(quote("coles-online-catalogue")); throw new Error("Second item failed"); };
  const input = parseShoppingPriceRequest({ ...body, lines: [rice, { id: "ginger", name: "Fresh ginger", amount: 50, unit: "g" }] });
  const work = compareShopping(input, providers);
  await new Promise(resolve => setImmediate(resolve));
  publish!({ ...quote("coles-online-catalogue"), query: "Fresh ginger", matches: [{ ...quote("coles-online-catalogue").matches[0], name: "Fresh Ginger", packageSize: "100g" }] });
  finishOther!();
  const result = await work;
  assert.equal(result.lines[0].estimatedCents, 900); assert.equal(result.lines[1].estimatedCents, null);
  assert.equal(result.providerStatuses.find(status => status.id === "coles")?.status, "partial");
});

test("unrequested or cross-retailer progress cannot turn an omitted query into a ready batch", async () => {
  const providers = deps();
  providers.coles = async (_queries, _signal, onQuote) => {
    onQuote!({ ...quote("woolworths-online-catalogue"), query: "Fresh ginger" });
    onQuote!({ ...quote("coles-online-catalogue"), query: "Unrequested ingredient" });
    return [quote("coles-online-catalogue")];
  };
  const input = parseShoppingPriceRequest({ ...body, lines: [rice, { id: "ginger", name: "Fresh ginger", amount: 50, unit: "g" }] });
  const result = await compareShopping(input, providers);
  assert.equal(result.lines[0].estimatedCents, 900); assert.equal(result.lines[1].offers.length, 0);
  assert.equal(result.providerStatuses.find(status => status.id === "coles")?.status, "partial");
});

test("a real completed butcher quote survives an uncooperative produce page at the overall deadline", { timeout: 2000 }, async () => {
  const controller = new AbortController();
  const input = parseShoppingPriceRequest({ ...body, area: "2042", location: { lat: -33.9, lon: 151.18 }, localRecords: false, lines: [
    { id: "tomato", name: "Tomatoes", amount: 500, unit: "g", category: "produce" },
    { id: "chicken", name: "Chicken breast", amount: 600, unit: "g", category: "butcher" },
  ] });
  const base: Shop = { id: "verified-butcher", name: "Verified local butcher", kind: "butcher", shopType: "butcher", website: "https://butcher.example.com/", lat: -33.9, lon: 151.18, distanceKm: 0, address: "Newtown NSW 2042", phone: null, openingHours: null, osmUrl: "https://www.openstreetmap.org/node/1", inventoryStatus: "unverified" };
  const market: Shop = { ...base, id: "verified-market", name: "Verified fruit market", kind: "produce", shopType: "greengrocer", website: "https://market.example.com/" };
  let calls = 0, fastReady!: () => void;
  const fast = new Promise<void>(resolve => { fastReady = resolve; });
  const providers = deps();
  providers.now = () => new Date();
  providers.local = async (context, signal, onProgress) => {
    calls++;
    return lookupLocalShopPrices(context.lines, [market, base], { area: context.area, location: context.location!, radiusKm: 5 }, {
      read: async url => {
        if (new URL(url).hostname === "market.example.com") return new Promise(() => {});
        return { url, html: `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Chicken breast fillets 1kg", url: "https://butcher.example.com/products/chicken", offers: { "@type": "Offer", price: 13.88, priceCurrency: "AUD", availability: "https://schema.org/InStock" } })}</script>` };
      },
    }, signal, snapshot => {
      onProgress!(snapshot);
      if (snapshot.quotes.some(quote => quote.shop.id === base.id && quote.matches.length)) fastReady();
    });
  };
  const work = compareShopping(input, providers, controller.signal);
  await fast; controller.abort(new DOMException("Fixture request deadline", "TimeoutError"));
  const result = await work;
  assert.equal(calls, 1);
  assert.equal(result.lines[1].estimatedCents, 1388); assert.equal(result.lines[1].offers[0].shopId, base.id);
  assert.equal(result.lines[0].estimatedCents, null); assert.equal(result.lines[0].offers.length, 0);
  assert.equal(result.providerStatuses.find(status => status.id === `local:${base.id}`)?.status, "ready");
  assert.equal(result.providerStatuses.find(status => status.id === `local:${market.id}`)?.status, "unavailable");
  assert.equal(result.providerStatuses.find(status => status.id === "nearby")?.status, "partial");
  assert.match(result.warnings.join(" "), /Completed shop prices are kept/);
});

test("late local progress and source objects cannot change completed specialist evidence", async () => {
  const controller = new AbortController(), providers = deps();
  const shop = { id: "trusted-shop", name: "Trusted local shop", website: "https://grocer.example.com/" };
  const local = quote("local-shop-website"); local.scope = "shop-website"; local.shop = { ...shop, area: "2000" };
  let publish: Parameters<NonNullable<typeof providers.local>>[2];
  providers.local = async (_request, _signal, onProgress) => { publish = onProgress; onProgress!({ quotes: [local], checkedShops: [shop], warnings: [] }); return new Promise(() => {}); };
  const work = compareShopping(parseShoppingPriceRequest({ ...body, location: { lat: -33.9, lon: 151.18 } }), providers, controller.signal);
  await new Promise(resolve => setImmediate(resolve)); controller.abort();
  local.matches[0].priceCents = 1;
  publish!({ quotes: [{ ...local, matches: [{ ...local.matches[0], priceCents: 1 }] }], checkedShops: [shop], warnings: [] });
  const result = await work;
  assert.equal(result.lines[0].estimatedCents, 900); assert.equal(result.lines[0].offers[0].priceCents, 450);
});

test("completed legacy local providers retain prices without adopting the optional progress callback", async () => {
  const providers = deps(), shop = { id: "existing-shop", name: "Existing verified grocer", website: "https://grocer.example.com/", area: "2000" };
  providers.local = async () => ({ quotes: [{ ...quote("local-shop-website"), scope: "shop-website", shop }], checkedShops: [{ id: shop.id, name: shop.name }], warnings: [] });
  const result = await compareShopping(parseShoppingPriceRequest({ ...body, location: { lat: -33.9, lon: 151.18 } }), providers);
  assert.equal(result.lines[0].estimatedCents, 900); assert.equal(result.lines[0].offers[0].shopId, shop.id);
});
