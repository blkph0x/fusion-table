import assert from "node:assert/strict";
import { test } from "node:test";
import { COLES_SEARCH_URL, colesNavigationUrl, lookupColesQuery, parseColesBuildId, parseColesNavigationData, parseColesSearch } from "../lib/coles-catalogue.ts";
import type { RetailerPageRenderer } from "../lib/aldi-catalogue.ts";
import { costShoppingQuantity } from "../lib/shopping-costs.ts";

test("a retailer refusal triggers a short backoff instead of repeated search attempts", async () => {
  let calls = 0;
  const refusing: typeof fetch = async () => { calls++; return new Response("<html><title>Pardon Our Interruption</title></html>", { status: 200 }); };
  const first = await lookupColesQuery("backoff fixture first", refusing);
  const second = await lookupColesQuery("backoff fixture second", refusing);
  assert.equal(calls, 1);
  assert.equal(first.matches.length, 0); assert.equal(second.matches.length, 0);
  assert.match(second.error || "", /temporarily/);
});

const product = (overrides: Record<string, unknown> = {}) => ({
  _type: "PRODUCT", id: 101, name: "Firm Tofu", brand: "Fixture", description: "Fixture Firm Tofu",
  size: "450g", availability: true, availableQuantity: 10,
  pricing: { now: 4.5, was: 9, rawPriceNow: 99, unit: { price: 1, quantity: 100, ofMeasureUnits: "g" } },
  ...overrides,
});
function page(rows: unknown[], links = ""): string {
  return `${links}<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { searchResults: { results: rows } } } })}</script>`;
}
function fixture(name: string): string { return page([product({ name, description: name })]); }

test("Coles anonymous search uses its current canonical route", async () => {
  let checked: URL | undefined;
  const fetchImpl: typeof fetch = async input => { checked = new URL(String(input)); return new Response(fixture("Canonical fixture lentils")); };
  await lookupColesQuery("Canonical fixture lentils", fetchImpl);
  assert.equal(COLES_SEARCH_URL, "https://www.coles.com.au/search/products");
  assert.equal(checked?.pathname, "/search/products");
  assert.equal(checked?.searchParams.get("q"), "Canonical fixture lentils");
});

test("public Next.js navigation data uses the same current selling-price and availability parser", () => {
  const data = { pageProps: { searchResults: { results: [
    product({ id: 8703004, name: "Jasmine Rice", brand: "Coles", description: "COLES JASMINE RICE 1KG", size: "1kg", pricing: { now: 3.2, was: 9, unit: { isWeighted: false, price: .32 } } }),
    product({ id: 9540299, name: "Jasmine Rice", brand: "Coles", description: "COLES JASMINE RICE 2KG", size: "2kg", pricing: { now: 5.5, was: 15, unit: { isWeighted: false } }, availability: false }),
  ] } }, __N_SSP: true };
  const rows = parseColesNavigationData(data);
  assert.deepEqual(rows.map(row => [row.stockcode, row.priceCents, row.packageSize, row.inStock]), [["8703004", 320, "1kg", true], ["9540299", 550, "2kg", false]]);
  assert.ok(rows.every(row => row.url?.startsWith(COLES_SEARCH_URL + "?q=")));
  for (const value of [null, {}, { pageProps: { searchResults: { results: {} } } }, { notFound: true }]) assert.throws(() => parseColesNavigationData(value), /readable/);
});

test("weighted navigation products remain approximate when the size label omits that warning", () => {
  const rows = parseColesNavigationData({ pageProps: { searchResults: { results: [product({ size: "500g", pricing: { now: 7.5, unit: { isWeighted: true } } })] } } });
  assert.equal(rows[0].packageSize, "approx. 500g");
  assert.equal(costShoppingQuantity(600, "g", rows[0].priceCents, rows[0].packageSize).lineCents, null);
});

test("build discovery reads only a validated public deployment ID and navigation URLs stay pinned to Coles", () => {
  const build = "fixture.20261028-deployment";
  assert.equal(parseColesBuildId(`<script id="__NEXT_DATA__">${JSON.stringify({ buildId: build })}</script>`), build);
  assert.equal(parseColesBuildId(`<script src="/_next/static/${build}/_buildManifest.js"></script>`), build);
  assert.equal(parseColesBuildId(`<script src="https://evil.example/_next/static/${build}/_buildManifest.js"></script>`), null);
  assert.equal(parseColesBuildId('<script id="__NEXT_DATA__">{"buildId":"../../secret"}</script>'), null);
  assert.equal(parseColesBuildId('<meta name="robots" content="noindex"><iframe></iframe>'), null);
  const url = new URL(colesNavigationUrl(build, "jasmine rice & soy"));
  assert.equal(url.origin, "https://www.coles.com.au");
  assert.equal(url.pathname, `/_next/data/${build}/search/products.json`);
  assert.equal(url.searchParams.get("q"), "jasmine rice & soy");
  for (const bad of ["../bad", "https://evil.example", "id?token=secret", "id#fragment", ""]) assert.throws(() => colesNavigationUrl(bad, "rice"));
});

test("Coles reads public product fields and selling price, never comparison or crossed-out prices", () => {
  const rows = parseColesSearch(page([
    product(),
    product({ id: 102, name: "Unknown price", description: "Unknown price", pricing: { now: null, was: 9, unit: { price: 1 } } }),
    product({ id: 103, name: "Zero price", description: "Zero price", pricing: { now: 0 } }),
  ], '<a href="/product/fixture-firm-tofu-101">Tofu</a>'));
  assert.equal(rows.length, 3);
  assert.equal(rows[0].priceCents, 450);
  assert.equal(rows[0].packageSize, "450g");
  assert.equal(rows[0].url, "https://www.coles.com.au/product/fixture-firm-tofu-101");
  assert.equal(rows[0].inStock, true);
  assert.equal(rows[1].priceCents, null);
  assert.equal(rows[2].priceCents, null);
});

test("Coles preserves unavailable or unknown stock instead of advertising it as ready to buy", async () => {
  const name = "Audit availability firm tofu";
  const fetchImpl: typeof fetch = async () => new Response(page([
    product({ description: name, availability: false, availableQuantity: 10 }),
    product({ id: 102, description: `${name} other`, availability: true, availableQuantity: 0 }),
    product({ id: 103, description: `${name} unknown`, availability: null, availableQuantity: null }),
  ]));
  const result = await lookupColesQuery(name, fetchImpl);
  assert.equal(result.source, "coles-online-catalogue");
  assert.equal(result.fulfilmentStoreId, null);
  assert.equal(result.matches[0].selected, false);
  assert.ok(result.matches.every(row => !row.selected));
  assert.ok(result.matches.some(row => row.stock === "OUT_OF_STOCK"));
  assert.ok(result.matches.some(row => row.stock === "UNKNOWN"));
});

test("Coles skips advertisements, duplicate IDs, missing IDs and obvious non-food listings", () => {
  const rows = parseColesSearch(page([
    { _type: "ADVERTISEMENT", id: 1, name: "Sponsored", pricing: { now: 1 } },
    product({ id: 102, description: "Aluminum Manual Lemon Lime Juicer" }),
    product({ id: 103, description: "Rogz Lime Juice Dog Lead" }),
    product(), product({ description: "Duplicate product" }), product({ id: "104" }), product({ id: 105, name: "" }),
  ]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stockcode, "101");
});

test("malformed and oversized public payloads fail clearly without fabricated rows", () => {
  for (const html of ["<html>Challenge</html>", '<script id="__NEXT_DATA__">{bad</script>', '<script id="__NEXT_DATA__">null</script>', page([]).replace('"results":[]', '"results":{}')]) {
    assert.throws(() => parseColesSearch(html), /readable|could not be read/);
  }
  assert.throws(() => parseColesSearch(" ".repeat(3_000_001)), /too large/);
});

test("public product links stay on Coles even when a matching href points elsewhere", () => {
  const rows = parseColesSearch(page([product()], '<a href="https://evil.example/product/tofu-101">bad</a><a href="https://www.coles.com.au:8443/product/tofu-101">bad port</a>'));
  const url = new URL(rows[0].url!);
  assert.equal(url.origin, "https://www.coles.com.au");
  assert.equal(url.pathname, "/search/products");
});

test("Coles redirects cannot escape the official secure origin", async () => {
  for (const [index, location] of ["https://evil.example/search", "http://www.coles.com.au/search", "https://www.coles.com.au:8443/search", "https://user:password@www.coles.com.au/search"].entries()) {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => { calls++; return new Response(null, { status: 302, headers: { Location: location } }); };
    const result = await lookupColesQuery(`Audit redirect lentils ${index}`, fetchImpl);
    assert.equal(calls, 1);
    assert.equal(result.matches.length, 0);
    assert.match(result.error!, /redirected/);
  }
});

test("response streaming stops at the byte cap rather than reading an arbitrarily large page", async () => {
  let cancelled = false;
  const fetchImpl: typeof fetch = async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(3_000_001)); },
    cancel() { cancelled = true; },
  }));
  const result = await lookupColesQuery("Audit oversized lentils", fetchImpl);
  assert.match(result.error!, /too large/);
  assert.equal(cancelled, true);
  assert.equal(result.matches.length, 0);
});

test("identical in-flight searches coalesce and subsequent lookups use the bounded cache", async () => {
  const name = "Audit coalesced lentils";
  let finish!: (response: Response) => void;
  let calls = 0;
  const fetchImpl: typeof fetch = async () => { calls++; return new Promise<Response>(resolve => { finish = resolve; }); };
  const first = lookupColesQuery(name, fetchImpl);
  const second = lookupColesQuery(name, fetchImpl);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  finish(new Response(fixture(name)));
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.matches[0].priceCents, 450);
  assert.equal(b.matches[0].priceCents, 450);
  assert.equal(a.cached, false);
  assert.equal(b.cached, true);
  assert.equal((await lookupColesQuery(name, fetchImpl)).cached, true);
  assert.equal(calls, 1);
});

test("failed searches release their pending entry so a retry can recover", async () => {
  const name = "Audit recovery lentils";
  const failed = await lookupColesQuery(name, async () => new Response("blocked", { status: 403 }));
  assert.equal(failed.matches.length, 0);
  assert.ok(failed.error);
  const recovered = await lookupColesQuery(name, async () => new Response(fixture(name)));
  assert.equal(recovered.matches[0].selected, true);
  assert.equal(recovered.error, null);
});

test("an aborted coalesced consumer stops waiting without cancelling the original request", async () => {
  const name = "Audit coalesced abort lentils";
  let finish!: (response: Response) => void;
  const fetchImpl: typeof fetch = async () => new Promise<Response>(resolve => { finish = resolve; });
  const first = lookupColesQuery(name, fetchImpl);
  const controller = new AbortController();
  const second = lookupColesQuery(name, fetchImpl, controller.signal);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  const cancelled = await second;
  assert.equal(cancelled.matches.length, 0);
  finish(new Response(fixture(name)));
  assert.equal((await first).matches[0].selected, true);
});

test("queued Coles requests observe cancellation before a busy request releases its slot", async () => {
  const finishes: (() => void)[] = [];
  let calls = 0;
  const fetchImpl: typeof fetch = async input => {
    calls++;
    const name = new URL(String(input)).searchParams.get("q")!;
    return new Promise<Response>(resolve => finishes.push(() => resolve(new Response(fixture(name)))));
  };
  const active = Array.from({ length: 4 }, (_, i) => lookupColesQuery(`Audit active lentils ${i}`, fetchImpl));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 4);
  const controller = new AbortController();
  const waiting = lookupColesQuery("Audit queued lentils", fetchImpl, controller.signal);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  try {
    const result = await Promise.race([waiting, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Cancelled lookup stayed queued")), 150))]);
    assert.equal(result.matches.length, 0);
    assert.equal(calls, 4);
  } finally {
    finishes.forEach(finish => finish());
    await Promise.all(active);
  }
});

// Observed current normal-browser structure, including a standard price next
// to independent previous, comparison and conditional multi-buy prices.
function renderedCard(id: number, title: string, price: string, options: { extra?: string; button?: string; href?: string; labelled?: string } = {}): string {
  return `<section data-testid="product-tile"><header><a tabindex="-1" aria-label="${title}" href="${options.href || `/product/fixture-${id}`}"><span></span></a></header><a href="/product/fixture-${id}"><h2>${title}</h2></a><div data-testid="pricing"><section data-testid="product_price"><span data-testid="product-pricing" aria-label="${options.labelled || `Price $${price}`}">$${price}</span><div>$0.30/ 100g <span> | Was $9.50</span></div></section>${options.extra || ""}</div>${options.button === undefined ? '<button data-testid="add-to-cart-button">Add</button>' : options.button}</section>`;
}

test("current rendered Coles cards take precedence over stale hydration prices", () => {
  const html = renderedCard(2263179, "Coles RSPCA Approved Chicken Breast Fillets Large Pack | approx. 1.4kg", "15.40", { extra: '<span data-testid="price-calculation-method-description">Final price is based on weight</span>' })
    + renderedCard(2736805, "Coles RSPCA Approved Chicken Breast Diced | 500g", "9.00", { extra: '<div data-testid="multibuy-unit-pricing" aria-label="Buy 2 for $13.50. Unit price $13.50 dollars per 1kg"><span>Add 2 | $13.50</span></div>' })
    + page([product({ id: 2736805, pricing: { now: 1 } })]);
  const rows = parseColesSearch(html);
  assert.deepEqual(rows.map(p => p.priceCents), [1540, 900]);
  assert.deepEqual(rows.map(p => p.packageSize), ["approx. 1.4kg", "500g"]);
  assert.equal(costShoppingQuantity(1, "kg", 1540, rows[0].packageSize).lineCents, null);
  assert.equal(costShoppingQuantity(1.2, "kg", 900, rows[1].packageSize).lineCents, 2700);
});

test("rendered Coles availability requires an enabled buy button or explicit unavailable state", () => {
  const rows = parseColesSearch(renderedCard(1001, "Firm Tofu | 450g", "4.50", { button: '<button data-testid="add-to-cart-button" aria-disabled="false">Add</button>' })
    + renderedCard(1002, "Firm Tofu | 450g", "4.50", { button: "", extra: "Currently unavailable" })
    + renderedCard(1003, "Firm Tofu | 450g", "4.50", { button: "" })
    + renderedCard(1004, "Firm Tofu | 450g", "4.50", { button: '<button data-testid="add-to-cart-button" disabled="">Add</button>' }));
  assert.deepEqual(rows.map(p => p.inStock), [true, false, null, null]);
});

test("Coles preserves apostrophes and entities while refusing foreign links or member-only prices", () => {
  const rows = parseColesSearch(renderedCard(7690767, "Moira Mac's Smoked Chicken Breast | 300g", "8.00", { href: "https://www.coles.com.au/product/moira-mac's-smoked-chicken-breast-300g-7690767" })
    + renderedCard(1050387, "Cheese &amp; Herb Crumb | 500g", "12.00")
    + renderedCard(1001, "Jasmine Rice | 1kg", "3.00", { href: "https://evil.example/product/rice-1001" })
    + renderedCard(1002, "Jasmine Rice | 1kg", "3.00", { labelled: "Member price $3.00" }));
  assert.equal(rows.length, 2); assert.match(rows[0].url || "", /mac's/); assert.match(rows[1].name, /Cheese & Herb/);
});

test("Coles uses the configured normal renderer, identifies its default context, and isolates caches", async () => {
  let firstCalls = 0, secondCalls = 0;
  const fetchImpl: typeof fetch = async () => { throw new Error("HTTP must not be called"); };
  const renderer: RetailerPageRenderer = async url => { firstCalls++; return { url, html: '<header>You’re seeing items for delivery to Melbourne 3000.</header>' + renderedCard(1001, "Firm Tofu | 450g", "4.50") }; };
  const other: RetailerPageRenderer = async url => { secondCalls++; return { url, html: renderedCard(1001, "Firm Tofu | 450g", "5.50") }; };
  const [a, b] = await Promise.all([lookupColesQuery("firm tofu", fetchImpl, undefined, renderer), lookupColesQuery("firm tofu", fetchImpl, undefined, renderer)]);
  const c = await lookupColesQuery("firm tofu", fetchImpl, undefined, other);
  assert.equal(firstCalls, 1); assert.equal(secondCalls, 1); assert.equal(a.collectionMethod, "browser");
  assert.equal(a.matches[0].priceCents, b.matches[0].priceCents); assert.equal(c.matches[0].priceCents, 550);
  assert.equal(a.storeLabel, "Melbourne 3000"); assert.equal(a.scope, "chain-online"); assert.equal(a.fulfilmentStoreId, null);
});

test("Coles browser refusals back off and do not fall back to challenge-evasion requests", async () => {
  let calls = 0;
  const renderer: RetailerPageRenderer = async url => { calls++; return { url, html: "<title>Pardon Our Interruption</title>", status: 403 }; };
  const failed = await lookupColesQuery("first browser rice", fetch, undefined, renderer);
  const second = await lookupColesQuery("second browser rice", fetch, undefined, renderer);
  assert.equal(calls, 1); assert.equal(failed.status, "needs-browser"); assert.equal(second.matches.length, 0);
  const escaping: RetailerPageRenderer = async () => ({ html: renderedCard(1001, "Firm Tofu | 450g", "4.50"), url: "https://evil.example/search" });
  assert.equal((await lookupColesQuery("firm tofu", fetch, undefined, escaping)).matches.length, 0);
});

test("Coles preserves browser gateway provider states across its backoff", async () => {
  const renderer: RetailerPageRenderer = async () => { throw Object.assign(new Error("Browser guide not configured"), { providerStatus: "not-configured" }); };
  const first = await lookupColesQuery("first state rice", fetch, undefined, renderer);
  const next = await lookupColesQuery("next state rice", fetch, undefined, renderer);
  assert.equal(first.status, "not-configured"); assert.equal(next.status, "not-configured");
});

test("a local browser queue error cannot suppress unrelated Coles prices or retry alternate phrases", async () => {
  let calls = 0;
  const renderer: RetailerPageRenderer = async url => { if (++calls === 1) throw Object.assign(new Error("Browser queue busy; retry shortly"), { providerStatus: "unavailable" }); return { url, html: renderedCard(1001, "Firm Tofu | 450g", "4.50") }; };
  assert.equal((await lookupColesQuery("beef eye fillet", fetch, undefined, renderer)).matches.length, 0);
  assert.equal(calls, 1);
  assert.equal((await lookupColesQuery("firm tofu", fetch, undefined, renderer)).matches[0].priceCents, 450);
  assert.equal(calls, 2);
});

test("Coles waits for the browser worker's queue budget without extending direct HTTP", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let browserSignal: AbortSignal | undefined, httpSignal: AbortSignal | undefined;
  const renderer: RetailerPageRenderer = async (_url, signal) => { browserSignal = signal; return new Promise<never>(() => {}); };
  const browserWork = lookupColesQuery("firm tofu", fetch, undefined, renderer);
  await new Promise(resolve => setImmediate(resolve)); assert.ok(browserSignal);
  t.mock.timers.tick(31_999); assert.equal(browserSignal.aborted, false);
  t.mock.timers.tick(1); assert.equal((await browserWork).matches.length, 0); assert.equal(browserSignal.aborted, true);
  const fetchImpl: typeof fetch = async (_url, init) => { httpSignal = init?.signal as AbortSignal; return new Promise<never>(() => {}); };
  const httpWork = lookupColesQuery("firm tofu", fetchImpl);
  await new Promise(resolve => setImmediate(resolve)); assert.ok(httpSignal);
  t.mock.timers.tick(11_999); assert.equal(httpSignal.aborted, false);
  t.mock.timers.tick(1); assert.equal((await httpWork).matches.length, 0); assert.equal(httpSignal.aborted, true);
});
