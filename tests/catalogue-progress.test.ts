import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupQueries, type PriceQuote } from "../lib/catalogue.ts";
import { lookupColesQueries } from "../lib/coles-catalogue.ts";
import { lookupAldiQueries } from "../lib/aldi-catalogue.ts";
import { lookupIgaQueries, type IgaStoreContext } from "../lib/iga-catalogue.ts";

const store: IgaStoreContext = { id: "fixture-progress", name: "Fixture IGA Newtown", website: "https://www.igashop.com.au/", area: "2042" };
type Batch = (queries: readonly string[], fetchImpl: typeof fetch, signal: AbortSignal, onQuote: (quote: PriceQuote) => void) => Promise<PriceQuote[]>;
const adapters: { name: string; run: Batch; body: (name: string) => Response }[] = [
  { name: "Woolworths", run: (queries, fetchImpl, signal, onQuote) => lookupQueries(queries, fetchImpl, signal, onQuote), body: name => Response.json({ Products: [{ Products: [{ Name: name, Price: 5, PackageSize: "500g", Stockcode: name, IsInStock: true, IsAvailable: true }] }] }) },
  { name: "Coles", run: (queries, fetchImpl, signal, onQuote) => lookupColesQueries(queries, fetchImpl, signal, undefined, undefined, onQuote), body: name => new Response(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { searchResults: { results: [{ _type: "PRODUCT", id: 1001, name, description: name, size: "500g", availability: true, availableQuantity: 10, pricing: { now: 5 } }] } } } })}</script>`) },
  { name: "ALDI", run: (queries, fetchImpl, signal, onQuote) => lookupAldiQueries(queries, fetchImpl, signal, undefined, onQuote), body: name => new Response(`<div id="product-tile-1001"><a href="/product/fixture-1001"><div data-test="product-tile__name">${name}</div><div data-test="product-tile__unit-of-measurement">500g</div><span class="base-price__regular"><span>$5.00</span></span></a></div>`) },
  { name: "IGA", run: (queries, fetchImpl, signal, onQuote) => lookupIgaQueries(queries, fetchImpl, signal, undefined, store, onQuote), body: name => new Response(`<header><div data-test-id="header-store-select"><strong>Shopping List</strong> for <strong>${store.name}</strong><button data-test-id="header-store-select-button">Change</button></div></header><div data-product-card="true"><a data-variant="link" href="/product/fixture-1001"><span>${name}</span><span>500g</span></a><span class="leading-none font-bold">$5.00</span></div>`) },
];

for (const adapter of adapters) test(`${adapter.name} publishes finished ingredients before a slow batch and ignores late aborted quotes`, async () => {
  const controller = new AbortController(), emitted: PriceQuote[] = [], calls: string[] = [];
  let releaseSlow!: () => void, notifyFast!: () => void;
  const slow = new Promise<void>(resolve => { releaseSlow = resolve; });
  const fast = new Promise<void>(resolve => { notifyFast = resolve; });
  const fetchImpl: typeof fetch = async input => {
    const url = new URL(String(input)), query = url.searchParams.get("q") || url.searchParams.get("searchTerm")!;
    calls.push(query);
    // Deliberately ignore cancellation in this fixture. The adapter must not
    // publish a fabricated completion after its caller's budget has expired.
    if (query === "Slow rice") await slow;
    return adapter.body(query);
  };
  let settled = false;
  const batch = adapter.run(["Fast rice", "Slow rice"], fetchImpl, controller.signal, quote => {
    emitted.push(quote); if (quote.query === "Fast rice") notifyFast();
  }).then(quotes => { settled = true; return quotes; });
  try {
    await fast;
    assert.equal(settled, false); assert.deepEqual(emitted.map(quote => quote.query), ["Fast rice"]);
    assert.equal(emitted[0].matches[0]?.priceCents, 500);
    controller.abort(new DOMException("Fixture batch deadline", "TimeoutError"));
    releaseSlow(); await batch; await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(emitted.map(quote => quote.query), ["Fast rice"]);
    // The cancelled transport's late response must not become a cached quote.
    const before = calls.filter(query => query === "Slow rice").length;
    const fresh: PriceQuote[] = [];
    const retried = await adapter.run(["Slow rice"], fetchImpl, new AbortController().signal, quote => fresh.push(quote));
    assert.equal(calls.filter(query => query === "Slow rice").length, before + 1);
    assert.equal(fresh.length, 1); assert.equal(retried[0].matches[0]?.priceCents, 500);
  } finally { releaseSlow(); controller.abort(); await batch; }
});
