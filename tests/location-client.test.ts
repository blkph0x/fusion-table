import test from "node:test";
import assert from "node:assert/strict";
import { fetchLocationResults, fetchNearbyShops } from "../lib/location-client.ts";
import type { LocationsResponse, ShopResponse } from "../lib/locations.ts";

const centre = { lat: -33.896, lon: 151.18 };
const metadata = {
  source: "Photon / OpenStreetMap", attribution: "© OpenStreetMap contributors",
  attributionUrl: "https://www.openstreetmap.org/copyright", fetchedAt: "2026-10-22T10:00:00.000Z", cached: false,
};
const locations: LocationsResponse = {
  ...metadata,
  locations: [{ id: "R/1", name: "Newtown", label: "Newtown, Sydney, Australia", ...centre }],
};
const shops: ShopResponse = {
  ...metadata,
  shops: [{ id: "node/1", name: "Local Grocer", kind: "grocery", shopType: "grocery", ...centre,
    distanceKm: 0.2, address: null, website: null, phone: null, openingHours: null,
    osmUrl: "https://www.openstreetmap.org/node/1", inventoryStatus: "unverified" }],
  count: 1, matchedCount: 1, sourceCount: 1, matchedCountIsLowerBound: false, truncated: false,
  radiusKm: 5, location: centre, distanceType: "straight-line", coverage: "limited-nearby",
  osmTimestamp: null, notice: "Stock and prices are unverified.",
};

test("location and shop clients use encoded same-origin API paths and accept valid results", async (t) => {
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    paths.push(path);
    assert.ok(path.startsWith("/api/"));
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.cache, "no-store");
    assert.equal(new Headers(init?.headers).get("Accept"), "application/json");
    assert.ok(init?.signal instanceof AbortSignal);
    return Response.json(path.startsWith("/api/locations?") ? locations : shops);
  });
  assert.deepEqual(await fetchLocationResults("  Newtown & Sydney  "), locations);
  assert.deepEqual(await fetchNearbyShops(centre, 5), shops);
  assert.equal(new URL(paths[0], "https://app.example").searchParams.get("q"), "Newtown & Sydney");
  assert.equal(new URL(paths[1], "https://app.example").searchParams.get("radiusKm"), "5");
});

test("HTML HTTP errors become a friendly directory error without exposing markup or parser details", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<!doctype html><h1>Gateway failure</h1>", { status: 502, headers: { "Content-Type": "text/html" } }));
  await assert.rejects(fetchNearbyShops(centre, 5), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /shop directory is temporarily unavailable/i);
    assert.doesNotMatch(error.message, /doctype|Gateway|Unexpected|JSON/);
    return true;
  });
});

test("JSON service errors preserve actionable instructions, while invalid messages use a safe fallback", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: calls++ ? "<h1>busy</h1>" : "Please retry in a minute." }, { status: 429 }));
  await assert.rejects(fetchLocationResults("Newtown"), { message: "Please retry in a minute." });
  await assert.rejects(fetchLocationResults("Newtown"), { message: "The map service is busy. Please wait a moment and try again." });
});

test("malformed successful responses and responses for a different search are rejected", async (t) => {
  const results: unknown[] = [
    { ...locations, locations: [{ ...locations.locations[0], lat: "-33.896" }] },
    { ...shops, shops: [{ ...shops.shops[0], distanceKm: 9 }] },
    { ...shops, location: { ...centre, lon: 0 } },
    { ...shops, shops: [{ ...shops.shops[0], kind: "unknown" }] },
  ];
  t.mock.method(globalThis, "fetch", async () => Response.json(results.shift()));
  await assert.rejects(fetchLocationResults("Newtown"), /location service returned an unreadable response/);
  for (let i = 0; i < 3; i++) await assert.rejects(fetchNearbyShops(centre, 5), /shop directory returned an unreadable response/);
});

test("a successful HTML response is reported as unreadable, and an empty valid search remains valid", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => calls++
    ? Response.json({ ...locations, locations: [] })
    : new Response("<html>Sign-in page</html>", { headers: { "Content-Type": "text/html" } }));
  await assert.rejects(fetchLocationResults("Newtown"), /location service returned an unreadable response/);
  assert.deepEqual((await fetchLocationResults("Remote locality")).locations, []);
});

test("network failures have a useful message instead of a raw fetch exception", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(fetchLocationResults("Newtown"), { message: "We couldn't reach location search. Check your connection and try again." });
});

test("the client aborts a stalled request at 45 seconds and reports timeout as a retriable error", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const caller = new AbortController();
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    requestSignal = init?.signal ?? undefined;
    requestSignal?.addEventListener("abort", () => reject(requestSignal?.reason), { once: true });
  }));
  const pending = fetchNearbyShops(centre, 5, caller.signal);
  const rejected = assert.rejects(pending, error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /shop search took too long/);
    assert.notEqual(error.name, "AbortError");
    return true;
  });
  t.mock.timers.tick(44_999);
  assert.equal(requestSignal?.aborted, false);
  t.mock.timers.tick(1);
  assert.equal(requestSignal?.aborted, true);
  await rejected;
  assert.equal(caller.signal.aborted, false);
});

test("caller cancellation remains AbortError, including pre-aborted and custom-reason signals", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    calls++;
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  }));
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  await assert.rejects(fetchLocationResults("Newtown", alreadyAborted.signal), { name: "AbortError" });
  assert.equal(calls, 0);
  const controller = new AbortController();
  const pending = fetchLocationResults("Newtown", controller.signal);
  controller.abort("Location changed");
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(calls, 1);
});
