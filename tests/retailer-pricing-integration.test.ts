import assert from "node:assert/strict";
import { test } from "node:test";
import { browserPriceRenderer, localShopPageRenderer } from "../lib/browser-price-client.ts";
import { type PriceQuote } from "../lib/catalogue.ts";
import { matchProducts, type CatalogueProduct } from "../lib/product-match.ts";
import { buildShoppingOffers, isShoppingOfferSelectable } from "../lib/shopping-costs.ts";
import { parseShoppingPriceRequest } from "../lib/shopping-request.ts";
import { compareShopping } from "../lib/shopping-compare.ts";
import { withAutomaticPrices } from "../app/api/shopping-prices/automatic-offers.ts";

const now = new Date("2026-10-27T04:00:00Z");
const rice = { id: "rice", name: "Jasmine rice", amount: 600, unit: "g", category: "grocery" as const };
const product: CatalogueProduct = { name: "Jasmine Rice", packageSize: "1 kg", priceCents: 299, stockcode: "1", inStock: null, available: null };
const quote = (source: PriceQuote["source"], override: Partial<PriceQuote> = {}): PriceQuote => ({ query: rice.name, source, label: "Published website price guide; branch stock is unconfirmed.", fetchedAt: now.toISOString(), cached: false, fulfilmentStoreId: null, matches: matchProducts(rice.name, [product]), searched: [rice.name], error: null, ...override });

test("published ALDI guides can price a fixed pack without inventing stock; existing catalogue stock rules remain", () => {
  const rows = withAutomaticPrices({ lines: buildShoppingOffers([rice], [quote("aldi-online-catalogue"), quote("woolworths-online-catalogue")], [], { area: "2042", now }) }).lines;
  const aldi = rows[0].offers.find(offer => offer.retailerId === "aldi")!;
  const woolworths = rows[0].offers.find(offer => offer.retailerId === "woolworths")!;
  assert.equal(aldi.stock, "UNKNOWN"); assert.equal(aldi.eligible, true); assert.equal(isShoppingOfferSelectable(aldi), true);
  assert.match(aldi.evidenceLabel, /unconfirmed/); assert.equal(rows[0].estimatedCents, 299);
  assert.equal(woolworths.eligible, false); assert.equal(isShoppingOfferSelectable(woolworths), false);
});

test("out of stock, approximate packs, missing dietary proof and ambiguous meat cannot become published guide totals", () => {
  for (const changed of [
    { ...product, available: false, inStock: false },
    { ...product, packageSize: "approx. 1kg" },
    { ...product, name: "Microwave Jasmine Rice", preparedForm: "cooked-rice" as const },
  ]) {
    const rows = buildShoppingOffers([rice], [quote("aldi-online-catalogue", { matches: matchProducts(rice.name, [changed]) })], [], { area: "2042", now });
    assert.equal(rows[0].estimatedCents, null);
  }
  const dietary = { ...rice, name: "Gluten free jasmine rice" };
  assert.equal(buildShoppingOffers([dietary], [quote("aldi-online-catalogue", { query: dietary.name, matches: matchProducts(dietary.name, [product]) })], [], { area: "2042", now })[0].estimatedCents, null);
});

test("published nearby prices retain shop provenance and cannot leak across shopping areas", () => {
  const local = quote("local-shop-website", { scope: "shop-website", shop: { id: "node/1", name: "Neighbourhood fruit market", website: "https://fruit.example.org", area: "2042" } });
  const rows = buildShoppingOffers([rice], [local], [], { area: "2042", now });
  assert.equal(rows[0].offers[0].scope, "shop-online"); assert.equal(rows[0].offers[0].shopId, "node/1");
  assert.equal(rows[0].offers[0].retailerId, null);
  assert.equal(buildShoppingOffers([rice], [local], [], { area: "3000", now })[0].offers.length, 0);
});

test("all four retailer states and nearby failures survive independent provider errors", async () => {
  const input = parseShoppingPriceRequest({ lines: [rice], area: "2042", location: { lat: -33.9, lon: 151.18 }, radiusKm: 5 });
  const result = await compareShopping(input, {
    woolworths: async () => { throw new Error("fixture outage"); }, coles: async () => [quote("coles-online-catalogue", { fetchedAt: null, matches: [], status: "needs-browser", error: "Complete the retailer's browser check." })],
    aldi: async () => [quote("aldi-online-catalogue")], iga: async () => [quote("iga-online-catalogue", { fetchedAt: null, matches: [], status: "needs-store", error: "Choose the matching branch." })],
    local: async () => { throw new Error("fixture map outage"); }, recorded: async () => [], now: () => now,
  });
  assert.equal(result.providerStatuses.find(row => row.id === "coles")?.status, "needs-browser");
  assert.equal(result.providerStatuses.find(row => row.id === "iga")?.status, "needs-store");
  assert.equal(result.providerStatuses.find(row => row.id === "aldi")?.status, "ready");
  assert.equal(result.providerStatuses.find(row => row.id === "nearby")?.status, "unavailable");
  assert.equal(result.lines[0].offers.length, 1);
});

test("nearby coordinates and radius are validated without accepting a caller's shop URL", () => {
  const body = { lines: [rice], area: "2042" };
  for (const location of [null, {}, { lat: "-33.9", lon: 151 }, { lat: Infinity, lon: 1 }, { lat: 91, lon: 1 }, { lat: 1, lon: 181 }]) assert.throws(() => parseShoppingPriceRequest({ ...body, location }));
  for (const radiusKm of [0, 26, NaN, "5"]) assert.throws(() => parseShoppingPriceRequest({ ...body, radiusKm }));
  const input = parseShoppingPriceRequest({ ...body, location: { lat: -33.9, lon: 151 }, shops: [{ id: "node/1", name: "Shop", website: "https://127.0.0.1" }] });
  assert.equal(input.radiusKm, 5); assert.equal("website" in input.shops[0], false);
});

test("an uncooperative nearby lookup cannot hold completed prices beyond the request deadline", async () => {
  const controller = new AbortController();
  const input = parseShoppingPriceRequest({ lines: [rice], area: "2042", location: { lat: -33.9, lon: 151 } });
  const result = compareShopping(input, { woolworths: async () => [], coles: async () => [], aldi: async () => [quote("aldi-online-catalogue")], local: () => new Promise(() => {}), recorded: async () => [], now: () => now }, controller.signal);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  const completed = await result;
  assert.equal(completed.lines[0].offers.length, 1);
  assert.match(completed.warnings.join(" "), /took too long/);
});

test("a failed verified IGA lookup is unavailable rather than asking for a store again", async () => {
  const input = parseShoppingPriceRequest({ lines: [rice], area: "2042" });
  const result = await compareShopping(input, { woolworths: async () => [], coles: async () => [], iga: async () => [quote("iga-online-catalogue", { fetchedAt: null, matches: [], status: "unavailable", error: "The price check timed out." })], recorded: async () => [], now: () => now });
  assert.equal(result.providerStatuses.find(provider => provider.id === "iga")?.status, "unavailable");
});

test("browser client confines private service and retailer destinations, passes no visitor cookies", async () => {
  for (const endpoint of ["https://remote.example.org/render", "http://0.0.0.0:8794", "http://user:pass@127.0.0.1:8794"]) assert.throws(() => browserPriceRenderer(endpoint));
  let calls = 0;
  const renderer = browserPriceRenderer("http://127.0.0.1:8794/render", async (_url, init) => { calls++; assert.equal(new Headers(init?.headers).has("cookie"), false); assert.equal(init?.redirect, "error"); return Response.json({ html: "<p>Prices</p>", url: "https://www.aldi.com.au/results?q=rice", status: 200, providerStatus: "ready" }); })!;
  for (const url of ["https://127.0.0.1/", "http://www.aldi.com.au", "https://www.aldi.com.au:8888/", "https://fake.aldi.com.au/", "https://www.aldi.com.au.evil.org/"]) await assert.rejects(renderer(url));
  assert.equal(calls, 0); assert.match((await renderer("https://www.aldi.com.au/results?q=rice")).html, /Prices/);
  const blocked = browserPriceRenderer("http://127.0.0.1:8794", async () => Response.json({ providerStatus: "needs-browser", message: "Complete a human check at the retailer." }, { status: 429 }))!;
  await assert.rejects(blocked("https://www.coles.com.au/search?q=rice"), error => error instanceof Error && "providerStatus" in error && error.providerStatus === "needs-browser");
});

test("canonical IGA branch proof is bound to the requested verified shop", async () => {
  const store = { id: "node/305516372", name: "IGA", area: "2042", address: "259 King Street, Newtown, 2042" };
  const proof = { id: store.id, name: "Lloyds IGA Newtown", address: "259 King Street Newtown NSW 2042", retailerStoreId: "8863" };
  for (const selectedStore of [proof, { ...proof, id: "another-shop" }, { ...proof, address: "" }, { ...proof, name: "<bad>" }]) {
    const renderer = browserPriceRenderer("http://127.0.0.1:8794/render", async (_url, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)).store, store);
      return Response.json({ html: "<header>Verified branch</header>", url: "https://www.igashop.com.au/search?q=rice", providerStatus: "ready", selectedStore });
    }, store)!;
    if (selectedStore === proof) assert.deepEqual((await renderer("https://www.igashop.com.au/search?q=rice")).selectedStore, proof);
    else await assert.rejects(renderer("https://www.igashop.com.au/search?q=rice"), /unverified store/);
  }
});

test("local browser pages stay on the verified shop host and accept only its www alias", async () => {
  for (const final of ["https://www.produce.example.org/product/tomatoes", "https://unrelated.example.org/product/tomatoes", "https://127.0.0.1/product/tomatoes"]) {
    const renderer = localShopPageRenderer("http://127.0.0.1:8794/render", async (_url, init) => {
      assert.equal(JSON.parse(String(init?.body)).source, "local-shop");
      return Response.json({ html: "<p>Tomatoes $5.99 / 1kg bag</p>", url: final, providerStatus: "ready" });
    })!;
    if (final.includes("www.produce")) assert.match((await renderer("https://produce.example.org/product/tomatoes")).html, /5.99/);
    else await assert.rejects(renderer("https://produce.example.org/product/tomatoes"), /unexpected page/);
  }
});
