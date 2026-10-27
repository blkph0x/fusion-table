import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupColesQuery, parseColesSearch } from "../lib/coles-catalogue.ts";

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
  assert.equal(url.pathname, "/search");
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
