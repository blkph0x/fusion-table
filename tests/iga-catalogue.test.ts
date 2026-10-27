import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupIgaQuery, parseIgaSearch, verifyIgaStore, type IgaStoreContext } from "../lib/iga-catalogue.ts";
import type { RetailerPageRenderer } from "../lib/aldi-catalogue.ts";
import { costShoppingQuantity } from "../lib/shopping-costs.ts";

const store: IgaStoreContext = { id: "fixture-newtown", name: "Lloyds IGA Newtown", website: "https://www.igashop.com.au/", area: "Newtown NSW 2042" };
function header(name = store.name): string { return `<header><div data-test-id="header-store-select"><strong>Shopping List</strong> for <strong>${name}</strong><button data-test-id="header-store-select-button">Change</button></div></header>`; }
function card(id: number, name: string, pack: string, price: string, extra = "", link = ""): string {
  return `<div data-product-card="true" data-card=""><a data-variant="link" href="${link || `/product/fixture-${id}`}"><span class="line-clamp-3">${name}</span><span>${pack}</span></a>${extra}<span class="leading-none font-bold">$${price}</span><span class="leading-none">$0.30</span><span class="leading-none">per 100g</span><button data-shop-button="planning">Add To List</button></div>`;
}

test("IGA will not read default-store prices without an explicit matching selected store", async () => {
  let calls = 0; const fetchImpl: typeof fetch = async () => { calls++; return new Response("unused"); };
  const result = await lookupIgaQuery("chicken breast", fetchImpl);
  assert.equal(calls, 0); assert.equal(result.status, "needs-store"); assert.equal(result.matches.length, 0);
  const generic = '<header>No store selected</header><h2>Available in Ashcroft’s IGA Erskine Park</h2>' + card(80080001, "Chicken Breast Fillets", "500g", "6.50");
  assert.equal(verifyIgaStore(generic, store), false);
  assert.throws(() => parseIgaSearch(generic, store), /matching IGA store/);
  assert.equal(verifyIgaStore(header("Ashcroft's IGA Erskine Park"), store), false);
});

test("IGA reads rendered current prices and ignores stale default-store hydration data", () => {
  const stale = '<script id="__NEXT_DATA__">{"props":{"pageProps":{"product":{"price":"$6.50"}}}}</script>';
  const products = parseIgaSearch(header() + card(180000005755, "SunRice Premium Thai Jasmine Rice", "1kg", "8.10") + stale, store);
  assert.equal(products[0].priceCents, 810); assert.equal(products[0].packageSize, "1kg");
  assert.equal(products[0].inStock, null); assert.equal(costShoppingQuantity(1.2, "kg", 810, products[0].packageSize).lineCents, 1620);
});

test("IGA specials use the payable price; average weights stay approximate and count packs work", () => {
  const products = parseIgaSearch(header() + card(683109, "SunRice Jasmine Fragrant Rice", "5kg", "16.95", '<div data-badge>35% Off</div><div data-badge>was $27.00</div>') + card(80080001, "Chicken Breast Fillets", "500g", "7.50", "Final cost based on weight <span>avg</span>") + card(80070161, "Chicken Souvlaki", "12 Pack", "27.00"), store);
  assert.deepEqual(products.map(p => p.priceCents), [1695, 750, 2700]);
  assert.equal(products[1].packageSize, "approx. 500g");
  assert.equal(costShoppingQuantity(1, "kg", 750, products[1].packageSize).lineCents, null);
  assert.equal(costShoppingQuantity(13, "each", 2700, products[2].packageSize).lineCents, 5400);
});

test("conditional prices, foreign links, pet products and duplicate products are refused", () => {
  const rice = card(123456, "Jasmine Rice", "1kg", "3.20");
  const products = parseIgaSearch(header() + rice + rice + card(123457, "Jasmine Rice", "1kg", "1.20", "Members only") + card(123458, "Chicken dog food", "1kg", "2.00") + card(123459, "Jasmine Rice", "1kg", "3.20", "", "https://evil.example/product/fixture-123459"), store);
  assert.deepEqual(products.map(p => p.stockcode), ["123456"]);
});

test("selected branch must still match the actual browser page before any prices return", async () => {
  const renderer: RetailerPageRenderer = async url => ({ html: header("IGA Stanmore") + card(123456, "Jasmine Rice", "1kg", "3.20"), url });
  const quote = await lookupIgaQuery("jasmine rice", fetch, undefined, renderer, store);
  assert.equal(quote.status, "needs-store"); assert.equal(quote.matches.length, 0); assert.equal(quote.fulfilmentStoreId, null);
});

test("IGA renderer is used for every check and branch caches stay separate", async () => {
  let calls = 0, selectedName = store.name;
  const fetchImpl: typeof fetch = async () => { throw new Error("unused HTTP"); };
  const renderer: RetailerPageRenderer = async url => { calls++; return { html: header(selectedName) + card(123456, "Jasmine Rice", "1kg", selectedName === store.name ? "3.20" : "4.20"), url }; };
  const first = await lookupIgaQuery("jasmine rice", fetchImpl, undefined, renderer, store);
  selectedName = "IGA Stanmore";
  const other = { ...store, id: "fixture-stanmore", name: selectedName, area: "Stanmore NSW 2048" };
  const second = await lookupIgaQuery("jasmine rice", fetchImpl, undefined, renderer, other);
  assert.equal(calls, 2); assert.equal(first.collectionMethod, "browser"); assert.equal(first.fulfilmentStoreId, store.id);
  assert.equal(first.matches[0].priceCents, 320); assert.equal(second.matches[0].priceCents, 420); assert.equal(first.matches[0].stock, "UNKNOWN");
});

test("IGA rejects oversized results and escaping browser redirects", async () => {
  assert.throws(() => parseIgaSearch(" ".repeat(3_000_001), store), /too large/);
  const renderer: RetailerPageRenderer = async () => ({ html: header() + card(123456, "Jasmine Rice", "1kg", "3.20"), url: "https://evil.example/" });
  const quote = await lookupIgaQuery("jasmine rice", fetch, undefined, renderer, store);
  assert.equal(quote.matches.length, 0); assert.match(quote.error || "", /outside/);
});

test("IGA preserves the browser gateway challenge or configuration state", async () => {
  const renderer: RetailerPageRenderer = async () => { throw Object.assign(new Error("Open the store to finish browser verification"), { providerStatus: "needs-browser" }); };
  const first = await lookupIgaQuery("first state rice", fetch, undefined, renderer, store);
  const next = await lookupIgaQuery("next state rice", fetch, undefined, renderer, store);
  assert.equal(first.status, "needs-browser"); assert.equal(next.status, "needs-browser");
});

test("local browser deadlines or an unselected branch do not globally suppress IGA", async () => {
  for (const cause of [new DOMException("Deadline", "TimeoutError"), Object.assign(new Error("Choose a matching branch"), { providerStatus: "needs-store" })]) {
    let calls = 0;
    const renderer: RetailerPageRenderer = async url => { if (++calls === 1) throw cause; return { url, html: header() + card(123456, "Jasmine Rice", "1kg", "3.20") }; };
    await lookupIgaQuery("first fixture rice", fetch, undefined, renderer, store);
    assert.equal((await lookupIgaQuery("jasmine rice", fetch, undefined, renderer, store)).matches[0].priceCents, 320);
    assert.equal(calls, 2);
  }
});

test("IGA gives ordinary browser selection and rendering 28 seconds", async t => {
  const budgets: number[] = [], originalTimeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, "timeout", (milliseconds: number) => { budgets.push(milliseconds); return originalTimeout(milliseconds); });
  const renderer: RetailerPageRenderer = async url => ({ url, html: header() + card(123456, "Jasmine Rice", "1kg", "3.20") });
  await lookupIgaQuery("jasmine rice", fetch, undefined, renderer, store);
  assert.deepEqual(budgets, [28_000]);
});

test("verified chooser metadata binds a canonical retailer name to the requested OSM shop", async () => {
  const requested = { ...store, id: "node/305516372", name: "IGA", address: "259 King Street Newtown Sydney NSW 2042" };
  const selectedStore = { id: requested.id, name: "Lloyds IGA Newtown", address: "259 King St Newtown NSW 2042", retailerStoreId: "8863" };
  const renderer: RetailerPageRenderer = async url => ({ url, html: header(selectedStore.name) + card(123456, "Jasmine Rice", "1kg", "3.20"), selectedStore });
  const quote = await lookupIgaQuery("jasmine rice", fetch, undefined, renderer, requested);
  assert.equal(quote.status, "ready"); assert.equal(quote.fulfilmentStoreId, requested.id);
  assert.equal(quote.shop?.id, requested.id); assert.equal(quote.shop?.name, selectedStore.name); assert.equal(quote.storeLabel, selectedStore.name);
  assert.equal(quote.matches[0].stock, "UNKNOWN"); assert.equal(quote.matches[0].priceCents, 320);
});

test("a short map label is never expanded without matching shop-ID metadata and exact selected header", async () => {
  const requested = { ...store, id: "node/305516372", name: "Lloyd's IGA", address: "259 King Street Newtown NSW 2042" };
  const actual = "Lloyds IGA Newtown";
  for (const selectedStore of [undefined, { id: "another-shop", name: actual, address: "259 King St Newtown NSW 2042" }, { id: requested.id, name: actual, address: "" }]) {
    const renderer: RetailerPageRenderer = async url => ({ url, html: header(actual) + card(123456, "Jasmine Rice", "1kg", "3.20"), selectedStore });
    const quote = await lookupIgaQuery("jasmine rice", fetch, undefined, renderer, requested);
    assert.equal(quote.status, "needs-store"); assert.equal(quote.matches.length, 0);
  }
  const wrongHeader: RetailerPageRenderer = async url => ({ url, html: header("IGA Stanmore") + card(123456, "Jasmine Rice", "1kg", "3.20"), selectedStore: { id: requested.id, name: actual, address: "259 King St Newtown NSW 2042" } });
  assert.equal((await lookupIgaQuery("jasmine rice", fetch, undefined, wrongHeader, requested)).status, "needs-store");
});
