import test from "node:test";
import assert from "node:assert/strict";
import { searchLocations, searchShops } from "../lib/location-providers.ts";

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
