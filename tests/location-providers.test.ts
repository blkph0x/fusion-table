import test from "node:test";
import assert from "node:assert/strict";
import { searchLocations, searchShops } from "../lib/location-providers.ts";

// Fresh module instances keep the per-isolate queue/cache state independent.
const freshProviders = async (name: string): Promise<typeof import("../lib/location-providers.ts")> =>
  import(new URL(`../lib/location-providers.ts?test=${name}`, import.meta.url).href);
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const nearbyShop = {
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: { name: "Test Butcher", osm_type: "N", osm_id: 456, osm_key: "shop", osm_value: "butcher" },
};

test("provider fetch uses a Workers-supported redirect mode and successful results are cached", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    requests += 1;
    // Workers throws for redirect:"error", even if the endpoint never redirects.
    assert.equal(init?.redirect, "manual");
    const url = new URL(String(input));
    assert.equal(url.origin, "https://geocoder.example.test");
    assert.equal(url.searchParams.get("q"), "Newtown, Sydney");
    return Response.json({ features: [{
      geometry: { type: "Point", coordinates: [151.18, -33.9] },
      properties: { name: "Newtown", city: "Sydney", country: "Australia", osm_type: "R", osm_id: 123 },
    }] });
  });
  const config = { photonUrl: "https://geocoder.example.test/api/" };
  const first = await searchLocations("Newtown, Sydney", config);
  const again = await searchLocations("Newtown, Sydney", config);
  assert.equal(first.locations[0].name, "Newtown");
  assert.equal(first.cached, false);
  assert.equal(again.cached, true);
  assert.equal(again.fetchedAt, first.fetchedAt);
  assert.equal(requests, 1);
});

test("an upstream redirect is rejected without forwarding the request to another destination", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests += 1;
    assert.equal(init?.redirect, "manual");
    return new Response(null, { status: 302, headers: { Location: "https://other.example.test/" } });
  });
  await assert.rejects(
    searchShops({ lat: 0, lon: 0, radiusKm: 1 }, {
      shopProvider: "overpass", overpassUrl: "https://overpass.example.test/api/interpreter",
    }),
    { status: 503, code: "provider_redirect" },
  );
  assert.equal(requests, 1);
});

test("a transient shop-provider 503 is retried once and real results retain radius and inventory semantics", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const provider = await freshProviders("temporary-unavailable");
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    if (requests === 1) return new Response("Temporary upstream failure", { status: 503 });
    return Response.json({ features: [nearbyShop, {
      ...nearbyShop,
      geometry: { type: "Point", coordinates: [1, 1] },
      properties: { ...nearbyShop.properties, osm_id: 789, name: "Outside the radius" },
    }] });
  });
  const pending = provider.searchShops({ lat: 0, lon: 0, radiusKm: 5 });
  await flush();
  assert.equal(requests, 1);
  t.mock.timers.tick(1200);
  const result = await pending;
  assert.equal(requests, 2);
  assert.equal(result.count, 1);
  assert.equal(result.shops[0].name, "Test Butcher");
  assert.equal(result.shops[0].shopType, "butcher");
  assert.equal(result.shops[0].inventoryStatus, "unverified");
  assert.equal(result.coverage, "limited-nearby");
  assert.equal(result.cached, false);
});

test("a transient fetch failure can recover but persistent failure stays an error after two attempts", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const provider = await freshProviders("network-failure");
  let requests = 0;
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    requests++;
    if (requests === 1) throw new TypeError("Network connection reset");
    return Response.json({ features: [] });
  });
  const recovered = provider.searchLocations("Test town");
  await flush();
  t.mock.timers.tick(1200);
  assert.deepEqual((await recovered).locations, []);
  assert.equal(requests, 2);

  fetchMock.mock.mockImplementation(async () => {
    requests++;
    return new Response("Unavailable", { status: 502 });
  });
  const failed = assert.rejects(provider.searchLocations("Another town"), { status: 503, code: "provider_unavailable" });
  await flush();
  t.mock.timers.tick(1200);
  await flush();
  t.mock.timers.tick(1200);
  await failed;
  assert.equal(requests, 4);
});

test("overlapping location and shop searches queue instead of rejecting another visitor immediately", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const provider = await freshProviders("concurrent-searches");
  let requests = 0;
  let finishFirst!: () => void;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    if (requests === 1) return new Promise<Response>(resolve => { finishFirst = () => resolve(Response.json({ features: [] })); });
    return Response.json({ features: [nearbyShop] });
  });
  const locations = provider.searchLocations("Test town");
  await flush();
  const shops = provider.searchShops({ lat: 0, lon: 0, radiusKm: 5 });
  await flush();
  assert.equal(requests, 1);
  finishFirst();
  await locations;
  await flush();
  assert.equal(requests, 1, "the second request still observes the provider cooldown");
  t.mock.timers.tick(1200);
  assert.equal((await shops).count, 1);
  assert.equal(requests, 2);
});

test("the queue has a fixed capacity and expires waiting searches without making extra provider calls", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const provider = await freshProviders("queue-bounds");
  let requests = 0;
  let finish!: () => void;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Promise<Response>(resolve => { finish = () => resolve(Response.json({ features: [] })); });
  });
  const active = provider.searchLocations("Active town");
  await flush();
  const waiting = [1, 2, 3].map(i => assert.rejects(provider.searchLocations(`Waiting town ${i}`), { status: 429, code: "search_rate_limited" }));
  await assert.rejects(provider.searchLocations("Queue full town"), { status: 429, code: "search_rate_limited" });
  t.mock.timers.tick(8000);
  await Promise.all(waiting);
  assert.equal(requests, 1);
  finish();
  await active;
});

test("upstream Retry-After is preserved for queued and subsequent callers without retrying the provider", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const provider = await freshProviders("upstream-rate-limit");
  let requests = 0;
  let finish!: () => void;
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Promise<Response>(resolve => { finish = () => resolve(new Response("Busy", { status: 429, headers: { "Retry-After": "7" } })); });
  });
  const expected = { status: 429, code: "provider_rate_limited", retryAfter: 7 };
  const active = assert.rejects(provider.searchLocations("Rate limited town"), expected);
  await flush();
  const queued = assert.rejects(provider.searchShops({ lat: 0, lon: 0, radiusKm: 5 }), expected);
  finish();
  await Promise.all([active, queued]);
  await assert.rejects(provider.searchLocations("Another rate limited town"), expected);
  assert.equal(requests, 1);
  t.mock.timers.tick(7000);
  fetchMock.mock.mockImplementation(async () => { requests++; return Response.json({ features: [] }); });
  assert.deepEqual((await provider.searchLocations("Recovered town")).locations, []);
  assert.equal(requests, 2);
});

test("two slow attempts share a bounded total timeout instead of doubling the wait", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const provider = await freshProviders("timeout-budget");
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests++;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
  });
  const failed = assert.rejects(provider.searchLocations("Slow town"), { status: 504, code: "provider_timeout" });
  await flush();
  t.mock.timers.tick(12_000);
  await flush();
  t.mock.timers.tick(1200);
  await flush();
  t.mock.timers.tick(6800);
  await failed;
  assert.equal(Date.now(), 20_000);
  assert.equal(requests, 2);
});
