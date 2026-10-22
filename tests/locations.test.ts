import test from "node:test";
import assert from "node:assert/strict";

// Node's native TypeScript loader requires a .ts URL; keeping it dynamic also
// lets the app's bundler type-check this file without changing compiler options.
const source = new URL("../lib/locations.ts", import.meta.url).href;
const { distanceKm, validateShopSearch, validateLocationQuery, normalizePhoton, normalizeOverpass, normalizePhotonShops, safeWebsite, buildOverpassQuery, isUsefulFoodShop } = await import(source);

test("radius and coordinates cannot escape the bounded numeric query", () => {
  assert.deepEqual(validateShopSearch({ lat: "-33.9", lon: "151.18", radiusKm: "5" }), { lat: -33.9, lon: 151.18, radiusKm: 5 });
  for (const invalid of ["", null, NaN, Infinity, "1);out;", "0x10"]) {
    assert.throws(() => validateShopSearch({ lat: invalid, lon: 0, radiusKm: 5 }));
  }
  for (const radius of [0, 0.99, 25.01, 100, -1]) {
    assert.throws(() => validateShopSearch({ lat: 0, lon: 0, radiusKm: radius }));
  }
  assert.throws(() => validateShopSearch({ lat: 91, lon: 0, radiusKm: 5 }));
  assert.throws(() => validateShopSearch({ lat: 0, lon: 181, radiusKm: 5 }));
  assert.match(buildOverpassQuery({ lat: -33.9, lon: 151.18, radiusKm: 5 }), /around:5000,-33\.9,151\.18/);
});

test("service stations and unnamed convenience shops are not offered as grocery stops", () => {
  assert.equal(isUsefulFoodShop("BP", { shop: "convenience", fuel: "yes" }, "grocery"), false);
  assert.equal(isUsefulFoodShop("Reddy Express", { shop: "convenience" }, "grocery"), false);
  assert.equal(isUsefulFoodShop("Coles Express", { shop: "convenience" }, "grocery"), false);
  assert.equal(isUsefulFoodShop("EG Australia", { amenity: "fuel" }, "grocery"), false);
  assert.equal(isUsefulFoodShop("Woolworths", { shop: "supermarket" }, "supermarket"), true);
  assert.equal(isUsefulFoodShop("IGA", { shop: "convenience" }, "grocery"), true);
  const result = normalizeOverpass({ elements: [
    { type: "node", id: 1, lat: 0, lon: 0, tags: { shop: "convenience", name: "BP Shop", fuel: "yes" } },
    { type: "node", id: 2, lat: 0, lon: 0, tags: { shop: "supermarket", name: "Woolworths" } },
    { type: "node", id: 3, lat: 0, lon: 0, tags: { shop: "convenience", name: "NightOwl" } },
  ] }, { lat: 0, lon: 0, radiusKm: 5 });
  assert.deepEqual(result.shops.map((shop) => shop.name), ["Woolworths"]);
  assert.doesNotMatch(buildOverpassQuery({ lat: 0, lon: 0, radiusKm: 5 }), /convenience/);
});

test("geodesic distance handles identical points, dateline and antipodes", () => {
  assert.equal(distanceKm(0, 0, 0, 0), 0);
  const dateline = distanceKm(0, 179.9, 0, -179.9);
  assert.ok(dateline > 22 && dateline < 23);
  const antipodes = distanceKm(0, 0, 0, 180);
  assert.ok(Number.isFinite(antipodes) && antipodes > 20_000 && antipodes < 20_020);
  const sydneyMelbourne = distanceKm(-33.8688, 151.2093, -37.8136, 144.9631);
  assert.ok(sydneyMelbourne > 710 && sydneyMelbourne < 720);
});

test("exact radius filter excludes a just-outside shop before display rounding", () => {
  const root = { elements: [
    { type: "node", id: 1, lat: 0, lon: 0.00899, tags: { shop: "butcher", name: "Inside" } },
    { type: "node", id: 2, lat: 0, lon: 0.009, tags: { shop: "butcher", name: "Outside" } },
    { type: "count", tags: { total: "2" } },
  ] };
  const result = normalizeOverpass(root, { lat: 0, lon: 0, radiusKm: 1 });
  assert.equal(result.shops.length, 1);
  assert.equal(result.shops[0].name, "Inside");
  assert.equal(result.shops[0].inventoryStatus, "unverified");
  assert.equal(result.sourceCount, 2);
});

test("map geometry centres, missing data and marketplace category are handled honestly", () => {
  const result = normalizeOverpass({ elements: [
    { type: "way", id: 3, center: { lat: 0, lon: 0 }, tags: { amenity: "marketplace", website: "javascript:alert(1)" } },
    { type: "node", id: 4, lat: 0, lon: 0, tags: { shop: "butcher", disused: "yes" } },
    { type: "node", id: 5, lat: 0, lon: 0, tags: { shop: "supermarket", access: "private" } },
    { type: "node", id: 6, lat: "not a number", lon: 0, tags: { shop: "supermarket" } },
  ] }, { lat: 0, lon: 0, radiusKm: 1 });
  assert.equal(result.count, 1);
  assert.equal(result.shops[0].kind, "market");
  assert.equal(result.shops[0].name, "Unnamed market");
  assert.equal(result.shops[0].website, null);
  assert.equal(result.shops[0].openingHours, null);
});

test("partial Overpass failure is not presented as an empty successful search", () => {
  assert.throws(() => normalizeOverpass({ remark: "runtime error: Query timed out", elements: [] }, { lat: 0, lon: 0, radiusKm: 5 }));
  assert.throws(() => normalizeOverpass({ message: "bad gateway" }, { lat: 0, lon: 0, radiusKm: 5 }));
});

test("presentation cap preserves actual counts and discloses upstream truncation", () => {
  const elements = Array.from({ length: 130 }, (_, i) => ({ type: "node", id: i + 1, lat: 0, lon: i / 100_000, tags: { shop: "supermarket", name: `Shop ${i}` } }));
  const result = normalizeOverpass({ elements }, { lat: 0, lon: 0, radiusKm: 5 });
  assert.equal(result.count, 120);
  assert.equal(result.matchedCount, 130);
  assert.equal(result.truncated, true);
  assert.equal(result.matchedCountIsLowerBound, false);
  const upstream = normalizeOverpass({ elements: [...elements, { type: "count", tags: { total: "900" } }] }, { lat: 0, lon: 0, radiusKm: 5 });
  assert.equal(upstream.sourceCount, 900);
  assert.equal(upstream.matchedCountIsLowerBound, true);
});

test("geocoder keeps country/state distinctions and rejects malformed provider data", () => {
  const locations = normalizePhoton({ features: [
    { geometry: { type: "Point", coordinates: [151.177, -33.898] }, properties: { name: "Newtown", city: "Sydney", state: "New South Wales", country: "Australia", osm_type: "R", osm_id: 123 } },
    { geometry: { type: "Point", coordinates: [151, 200] }, properties: { name: "Bad latitude" } },
  ] });
  assert.equal(locations.length, 1);
  assert.equal(locations[0].label, "Newtown, Sydney, New South Wales, Australia");
  assert.equal(locations[0].lat, -33.898);
  assert.throws(() => normalizePhoton({ error: "unavailable" }));
  assert.throws(() => validateLocationQuery("a"));
  assert.equal(validateLocationQuery("  Sydney  NSW  "), "Sydney NSW");
});

test("external shop links only accept ordinary web URLs", () => {
  assert.equal(safeWebsite("javascript:alert(1)"), null);
  assert.equal(safeWebsite("data:text/html,foo"), null);
  assert.equal(safeWebsite("https://user:password@example.org"), null);
  assert.equal(safeWebsite("www.example.org/shop"), "https://www.example.org/shop");
});

test("Photon nearby results retain source ids and distinguish a returned count from total coverage", () => {
  const result = normalizePhotonShops({ features: [
    { geometry: { type: "Point", coordinates: [0, 0] }, properties: { osm_type: "N", osm_id: 123, osm_key: "shop", osm_value: "butcher", name: "Mapped Butcher", street: "Market Street", housenumber: "10" } },
    { geometry: { type: "Point", coordinates: [2, 0] }, properties: { osm_type: "N", osm_id: 456, osm_key: "shop", osm_value: "supermarket", name: "Outside radius" } },
    { geometry: { type: "Point", coordinates: [0, 0] }, properties: { osm_type: "N", osm_id: 789, osm_key: "amenity", osm_value: "restaurant", name: "Not a food shop" } },
  ] }, { lat: 0, lon: 0, radiusKm: 1 });
  assert.equal(result.count, 1);
  assert.equal(result.shops[0].osmUrl, "https://www.openstreetmap.org/node/123");
  assert.equal(result.shops[0].shopType, "butcher");
  assert.equal(result.shops[0].address, "10 Market Street");
  assert.equal(result.shops[0].inventoryStatus, "unverified");
  assert.equal(result.sourceCount, 3);
  assert.equal(result.matchedCountIsLowerBound, true);
});
