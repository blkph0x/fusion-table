import assert from "node:assert/strict";
import { test } from "node:test";
import { SharedPriceCache } from "../lib/price-provider-cache.ts";
import { lookupQuery } from "../lib/catalogue.ts";
import { lookupColesQuery } from "../lib/coles-catalogue.ts";
import { canonicalizeProductText, catalogueSearchPhrases, matchProducts } from "../lib/product-match.ts";

const fixture = (name: string) => Response.json({ Products: [{ Products: [{ Name: name, Price: 4.5, PackageSize: "500g", Stockcode: name, IsInStock: true, IsAvailable: true }] }] });

test("identical concurrent queries share one provider request and future views reuse it", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async input => { calls++; await new Promise(resolve => setImmediate(resolve)); return fixture(new URL(String(input)).searchParams.get("searchTerm")!); };
  const results = await Promise.all(Array.from({ length: 20 }, () => lookupQuery("Price audit unique rice", fetcher)));
  assert.equal(calls, 1); assert.ok(results.every(result => result.matches[0].priceCents === 450));
  assert.equal((await lookupQuery("Price audit unique rice", fetcher)).cached, true); assert.equal(calls, 1);
});

test("cancelling one subscriber leaves the other active and cancelling all aborts shared work", async () => {
  const cache = new SharedPriceCache<number>();
  const a = new AbortController(), b = new AbortController();
  let release: (value: number) => void = () => {}, calls = 0, shared: AbortSignal | undefined;
  const loader = async (signal: AbortSignal) => { calls++; shared = signal; return new Promise<number>(resolve => { release = resolve; }); };
  const first = cache.load("key", fetch, loader, a.signal);
  const second = cache.load("key", fetch, loader, b.signal);
  await new Promise(resolve => setImmediate(resolve));
  a.abort(); await assert.rejects(first, { name: "AbortError" }); assert.equal(shared?.aborted, false);
  release(42); assert.equal((await second).value, 42); assert.equal(calls, 1);
  const last = new AbortController();
  const abandoned = cache.load("abandoned", fetch, loader, last.signal);
  await new Promise(resolve => setImmediate(resolve)); last.abort();
  await assert.rejects(abandoned, { name: "AbortError" }); assert.equal(shared?.aborted, true);
  release(99); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await cache.load("abandoned", fetch, async () => 7)).value, 7, "abandoned result cannot poison the cache");
});

test("LRU capacity, negative cache and fetcher identity are independent bounds", async () => {
  const cache = new SharedPriceCache<number>(2, 60_000, 60_000);
  let calls = 0;
  const load = (key: string) => cache.load(key, fetch, async () => ++calls);
  await load("a"); await load("b"); await load("a"); await load("c");
  assert.equal(calls, 3); await load("b"); assert.equal(calls, 4, "least recently used entry evicted");
  let failures = 0;
  const failing = () => cache.load("failure", fetch, async () => { failures++; throw new Error("blocked"); });
  await assert.rejects(failing(), /blocked/); await assert.rejects(failing(), /blocked/); assert.equal(failures, 1);
  const other: typeof fetch = async () => new Response();
  assert.equal((await cache.load("a", other, async () => 500)).value, 500);
});

test("Woolworths rejects declared and streamed oversized bodies and backs off blocked requests", async () => {
  let cancelled = false;
  const huge: typeof fetch = async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(2_000_001)); }, cancel() { cancelled = true; } }));
  assert.match((await lookupQuery("Huge price audit ingredient", huge)).error!, /too large/); assert.equal(cancelled, true);
  const declared: typeof fetch = async () => new Response("{}", { headers: { "content-length": "2000001" } });
  assert.match((await lookupQuery("Declared huge price audit ingredient", declared)).error!, /too large/);
  let calls = 0;
  const blocked: typeof fetch = async () => { calls++; return new Response("blocked", { status: 429 }); };
  await lookupQuery("First blocked audit ingredient", blocked); await lookupQuery("Different blocked audit ingredient", blocked);
  assert.equal(calls, 1);
});

test("Coles repeated failures are backed off and different fetchers do not inherit failures", async () => {
  let calls = 0;
  const blocked: typeof fetch = async () => { calls++; return new Response("blocked", { status: 403 }); };
  await Promise.all([lookupColesQuery("Audit exact ingredient", blocked), lookupColesQuery("Audit exact ingredient", blocked)]);
  await lookupColesQuery("Audit another ingredient", blocked); assert.equal(calls, 1);
  const other: typeof fetch = async () => new Response('<script id="__NEXT_DATA__">{"props":{"pageProps":{"searchResults":{"results":[]}}}}</script>');
  assert.equal((await lookupColesQuery("Audit exact ingredient", other)).error, null);
});

test("authored serving-role suffixes do not pollute searches or matching while food/diet forms remain", () => {
  assert.equal(catalogueSearchPhrases("Broccoli for the side")[0], "Broccoli");
  assert.equal(catalogueSearchPhrases("Tomato passata for the side sauce")[0], "Tomato passata");
  assert.equal(canonicalizeProductText("Gluten-free tomato passata for the side sauce"), "gluten free tomato passata");
  assert.equal(catalogueSearchPhrases("Cooked chickpeas, drained")[0], "Cooked chickpeas, drained");
  const matches = matchProducts("Broccoli for the side", [{ name: "Fresh Broccoli", stockcode: "broccoli", packageSize: "each", priceCents: 250, inStock: true, available: true }]);
  assert.equal(matches[0].selected, true);
});
