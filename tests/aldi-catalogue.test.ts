import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupAldiQuery, lookupAldiQueries, parseAldiSearch, shouldBackOffRetailer, type RetailerPageRenderer } from "../lib/aldi-catalogue.ts";
import { costShoppingQuantity } from "../lib/shopping-costs.ts";

// Minimal copies of the public Australian site's observed data-test structure.
function card(id: number, name: string, pack: string, price: string, extra = "", link = ""): string {
  return `<div id="product-tile-${id}" is-disabled="false"><div data-test="product-tile"><a href="${link || `/product/fixture-${id}`}"><div data-test="product-tile__brandname"><p>Fixture</p></div><div data-test="product-tile__name"><p>${name}</p></div><div data-test="product-tile__unit-of-measurement"><p>${pack}</p></div><div data-test="product-tile__comparison-price"><p>($0.30 per 100g)</p></div><div data-test="product-tile__price"><div class="base-price__discount-tag__wrapper"></div><span class="base-price__regular"><span>$${price}</span></span></div>${extra}</a></div></div>`;
}
const rice = () => card(262101, "Jasmine Rice 1kg", "1 kg", "2.99");

test("ALDI uses selling packs and prices, preserving uncertain weighted packs", () => {
  const products = parseAldiSearch(rice() + card(399727, "Chicken Breast Fillets Bulk per kg", "approx. 1.38 kg per package", "15.17") + card(262102, "Free Range Eggs", "6 pack", "3.49"));
  assert.deepEqual(products.map(p => p.priceCents), [299, 1517, 349]);
  assert.deepEqual(products.map(p => p.packageSize), ["1 kg", "approx. 1.38 kg per package", "6 pack"]);
  assert.ok(products.every(p => p.inStock === null && p.available === null));
  assert.equal(costShoppingQuantity(1.2, "kg", 299, products[0].packageSize).lineCents, 598);
  assert.equal(costShoppingQuantity(8, "each", 349, products[2].packageSize).lineCents, 698);
  assert.equal(costShoppingQuantity(0.6, "kg", 1517, products[1].packageSize).lineCents, null);
});

test("future, member-only, nonfood and unrecognized discount layouts cannot become current offers", () => {
  const future = '<div data-test="product-tile__on-sale-label"><p>On Sale Wed 04 Nov</p></div>';
  const html = rice() + card(262102, "Jasmine Rice", "1kg", "1.50", future) + card(262103, "Jasmine Rice", "1kg", "1.50", "Members only") + card(262104, "Fresh Jasmine Fabric Softener", "1l", "1.99") + card(262105, "Jasmine Rice", "1kg", "2.99", '<span class="base-price__old">$4.99</span>');
  assert.deepEqual(parseAldiSearch(html).map(p => p.stockcode), ["262101"]);
});

test("ALDI product URLs cannot escape the secure official Australian host", () => {
  const html = rice() + card(262102, "Jasmine Rice", "1kg", "2.99", "", "https://evil.example/product/fixture-262102") + card(262103, "Jasmine Rice", "1kg", "2.99", "", "https://www.aldi.com.au:8443/product/fixture-262103");
  assert.equal(parseAldiSearch(html).length, 1);
  assert.throws(() => parseAldiSearch("Challenge"), /readable/);
  assert.throws(() => parseAldiSearch(" ".repeat(3_000_001)), /too large/);
});

test("normal browser rendering is preferred when configured; unknown stock stays unselected", async () => {
  let browsers = 0, http = 0;
  const fetchImpl: typeof fetch = async () => { http++; throw new Error("HTTP must not run"); };
  const renderer: RetailerPageRenderer = async url => { browsers++; assert.match(url, /^https:\/\/www.aldi.com.au\/results\?q=/); return { html: rice(), url, status: 200 }; };
  const quote = await lookupAldiQuery("jasmine rice", fetchImpl, undefined, renderer);
  assert.equal(http, 0); assert.ok(browsers >= 1);
  assert.equal(quote.collectionMethod, "browser"); assert.equal(quote.scope, "chain-online");
  assert.equal(quote.matches[0].priceCents, 299); assert.equal(quote.matches[0].stock, "UNKNOWN"); assert.equal(quote.matches[0].selected, false);
  assert.equal(quote.fulfilmentStoreId, null);
});

test("deduplicated browser reads are isolated between browser contexts", async () => {
  let firstCalls = 0, secondCalls = 0;
  const fetchImpl: typeof fetch = async () => { throw new Error("unused"); };
  const first: RetailerPageRenderer = async url => { firstCalls++; return { html: rice(), url }; };
  const second: RetailerPageRenderer = async url => { secondCalls++; return { html: rice().replace("$2.99", "$3.99"), url }; };
  const [a, b] = await Promise.all([lookupAldiQuery("jasmine rice", fetchImpl, undefined, first), lookupAldiQuery("jasmine rice", fetchImpl, undefined, first)]);
  const c = await lookupAldiQuery("jasmine rice", fetchImpl, undefined, second);
  assert.equal(firstCalls, 1); assert.equal(secondCalls, 1);
  assert.equal(a.matches[0].priceCents, b.matches[0].priceCents); assert.equal(c.matches[0].priceCents, 399);
});

test("refusals back off without attempts to evade the challenge", async () => {
  let calls = 0;
  const renderer: RetailerPageRenderer = async url => { calls++; return { html: "<title>Challenge</title>", url, status: 403 }; };
  const first = await lookupAldiQuery("first audit rice", fetch, undefined, renderer);
  const next = await lookupAldiQuery("second audit rice", fetch, undefined, renderer);
  assert.equal(calls, 1); assert.equal(first.matches.length, 0); assert.match(next.error || "", /temporarily/);
});

test("response bounds, redirects, and batch limits fail without invented offers", async () => {
  let cancelled = false;
  const oversized: typeof fetch = async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(3_000_001)); }, cancel() { cancelled = true; } }));
  assert.match((await lookupAldiQuery("oversized rice", oversized)).error || "", /too large/); assert.equal(cancelled, true);
  const redirected: typeof fetch = async () => new Response(null, { status: 302, headers: { location: "http://www.aldi.com.au/results" } });
  assert.equal((await lookupAldiQuery("redirected rice", redirected)).matches.length, 0);
  await assert.rejects(lookupAldiQueries([]), /between 1 and 16/);
});

test("browser gateway failure states survive provider errors and the backoff", async () => {
  for (const providerStatus of ["needs-browser", "not-configured", "unavailable"] as const) {
    const renderer: RetailerPageRenderer = async () => { throw Object.assign(new Error("Browser guide unavailable"), { providerStatus }); };
    const first = await lookupAldiQuery("first state rice", fetch, undefined, renderer);
    const next = await lookupAldiQuery("next state rice", fetch, undefined, renderer);
    assert.equal(first.status, providerStatus); assert.equal(next.status, providerStatus);
  }
});

test("host queues and deadlines do not pause unrelated ALDI ingredients", async () => {
  for (const cause of [new Error("The browser queue is busy"), new DOMException("Browser deadline", "TimeoutError"), Object.assign(new Error("The browser price check timed out"), { providerStatus: "unavailable" })]) {
    let calls = 0;
    const renderer: RetailerPageRenderer = async url => { if (++calls === 1) throw cause; return { url, html: rice() }; };
    assert.equal((await lookupAldiQuery("first fixture rice", fetch, undefined, renderer)).matches.length, 0);
    assert.equal((await lookupAldiQuery("jasmine rice", fetch, undefined, renderer)).matches[0].priceCents, 299);
    assert.equal(calls, 2);
  }
});

test("global backoff is reserved for real retailer refusal, unreadable pages and missing configuration", () => {
  assert.equal(shouldBackOffRetailer(new Error("fetch failed")), false);
  assert.equal(shouldBackOffRetailer(Object.assign(new Error("Choose a store"), { providerStatus: "needs-store" })), false);
  assert.equal(shouldBackOffRetailer(Object.assign(new Error("Open retailer challenge"), { providerStatus: "needs-browser" })), true);
  assert.equal(shouldBackOffRetailer(Object.assign(new Error("Browser missing"), { providerStatus: "not-configured" })), true);
  assert.equal(shouldBackOffRetailer(new Error("ALDI did not publish readable product results.")), true);
});

test("an UNKNOWN-stock strong name proof stops ALDI fallback phrases without claiming stock", async () => {
  let calls = 0;
  const renderer: RetailerPageRenderer = async url => { calls++; return { url, html: card(262101, "Wagyu Beef Eye Fillet", "500g", "19.99") }; };
  const result = await lookupAldiQuery("Wagyu beef eye fillet", fetch, undefined, renderer);
  assert.equal(result.matches[0].stock, "UNKNOWN"); assert.equal(result.matches[0].selected, false);
  assert.equal(calls, 1); assert.equal(result.searched.length, 1);
});

test("browser rendering has a 32-second budget while direct HTTP retains its shorter budget", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let browserSignal: AbortSignal | undefined, httpSignal: AbortSignal | undefined;
  const renderer: RetailerPageRenderer = async (_url, signal) => { browserSignal = signal; return new Promise<never>(() => {}); };
  const browserWork = lookupAldiQuery("jasmine rice", fetch, undefined, renderer);
  await new Promise(resolve => setImmediate(resolve)); assert.ok(browserSignal);
  t.mock.timers.tick(31_999); assert.equal(browserSignal.aborted, false);
  t.mock.timers.tick(1); assert.equal((await browserWork).matches.length, 0); assert.equal(browserSignal.aborted, true);
  const fetchImpl: typeof fetch = async (_url, init) => { httpSignal = init?.signal as AbortSignal; return new Promise<never>(() => {}); };
  const httpWork = lookupAldiQuery("jasmine rice", fetchImpl);
  await new Promise(resolve => setImmediate(resolve)); assert.ok(httpSignal);
  t.mock.timers.tick(14_999); assert.equal(httpSignal.aborted, false);
  t.mock.timers.tick(1); assert.equal((await httpWork).matches.length, 0); assert.equal(httpSignal.aborted, true);
});

test("finished ALDI reads dispose their retained deadline", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let completedSignal: AbortSignal | undefined;
  const renderer: RetailerPageRenderer = async (url, signal) => { completedSignal = signal; return { url, html: rice() }; };
  await lookupAldiQuery("jasmine rice", fetch, undefined, renderer);
  assert.ok(completedSignal); t.mock.timers.tick(32_001); assert.equal(completedSignal.aborted, false);
});
