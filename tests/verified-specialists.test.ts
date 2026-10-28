import assert from "node:assert/strict";
import test from "node:test";
import { distanceKm, type ShopResponse } from "../lib/locations.ts";
import { supplementVerifiedSpecialists, verifiedSpecialistsForSearch } from "../lib/verified-specialists.ts";

const now = new Date("2026-10-28T12:00:00Z");
const area = { lat: -34.5724579, lon: 150.7744259, radiusKm: 10 };
function response(input = area): ShopResponse {
  return { shops: [], count: 0, matchedCount: 0, sourceCount: 0, matchedCountIsLowerBound: true, truncated: false, radiusKm: input.radiusKm, location: { lat: input.lat, lon: input.lon }, distanceType: "straight-line", coverage: "limited-nearby", source: "Photon / OpenStreetMap", attribution: "© OpenStreetMap contributors", attributionUrl: "https://www.openstreetmap.org/copyright", fetchedAt: now.toISOString(), osmTimestamp: null, cached: false, notice: "Partial map results. Stock is unconfirmed." };
}

test("2527 receives its three independently verified butcher branches and a nearby fruit shop without seeded prices", () => {
  const shops = verifiedSpecialistsForSearch(area, now);
  assert.equal(shops.length, 4);
  assert.deepEqual(shops.filter(shop => shop.kind === "butcher").map(shop => shop.name).sort(), ["Albion Park Village Meats", "Bush's Meats Shellharbour", "Bush's Meats Warilla"].sort());
  assert.ok(shops.some(shop => shop.name === "Mitchell's Market Warilla" && shop.kind === "produce"));
  for (const shop of shops) {
    assert.ok(shop.distanceKm <= area.radiusKm);
    assert.ok(shop.listingSourceUrl?.startsWith("https://"));
    assert.equal(shop.inventoryStatus, "unverified");
    assert.equal(shop.openingHours, null);
    assert.equal("price" in shop || "priceCents" in shop || "stock" in shop, false);
  }
});

test("a one-kilometre Albion Park area does not receive Shellharbour or Warilla branches", () => {
  assert.deepEqual(verifiedSpecialistsForSearch({ ...area, radiusKm: 1 }, now).map(shop => shop.name), ["Albion Park Village Meats"]);
});

test("an approximate centre point requires the whole uncertainty margin to fit in the visitor radius", () => {
  const shell = verifiedSpecialistsForSearch(area, now).find(shop => shop.id === "verified/bushs-shellharbour")!;
  assert.equal(shell.locationAccuracy, "shopping-centre");
  assert.match(shell.address!, /shopping-centre location; approximate/);
  const centreDistance = distanceKm(area.lat, area.lon, shell.lat, shell.lon);
  assert.equal(verifiedSpecialistsForSearch({ ...area, radiusKm: centreDistance + 0.49 }, now).some(shop => shop.id === shell.id), false);
  assert.equal(verifiedSpecialistsForSearch({ ...area, radiusKm: centreDistance + 0.51 }, now).some(shop => shop.id === shell.id), true);
});

test("unrelated areas and expired or not-yet-reviewed records never receive recovery listings", () => {
  assert.deepEqual(verifiedSpecialistsForSearch({ lat: -33.897, lon: 151.18, radiusKm: 25 }, now), []);
  assert.deepEqual(verifiedSpecialistsForSearch(area, new Date("2027-01-26T00:00:00Z")), []);
  assert.deepEqual(verifiedSpecialistsForSearch(area, new Date("2026-10-27T23:59:59Z")), []);
  assert.deepEqual(verifiedSpecialistsForSearch(area, new Date("invalid")), []);
});

test("actual map identities remain stable and receive only missing reviewed contact details", () => {
  const known = verifiedSpecialistsForSearch(area, now).find(shop => shop.id === "node/14322459906")!;
  const existing = { ...known, name: "Albion Park Village Meats`", website: null, address: null, phone: null, listingSourceUrl: undefined, listingReviewedAt: undefined, locationAccuracy: undefined };
  const before = { ...response(), shops: [existing], count: 1, matchedCount: 1, sourceCount: 1 };
  const result = supplementVerifiedSpecialists(before, now);
  assert.equal(result.count, 4);
  assert.equal(result.shops.filter(shop => shop.id === existing.id).length, 1);
  assert.equal(result.shops.find(shop => shop.id === existing.id)?.website, "https://apvm.com.au/");
  assert.equal(result.shops.find(shop => shop.id === existing.id)?.name, existing.name);
  assert.equal(before.shops[0].website, null);
  assert.strictEqual(supplementVerifiedSpecialists(result, now), result);
});

test("a new exact map pin for the same Shellharbour branch is preferred to its directory centre", () => {
  const shell = verifiedSpecialistsForSearch(area, now).find(shop => shop.id === "verified/bushs-shellharbour")!;
  const existing = { ...shell, id: "node/999001", name: "Bush's Fresh Meats", lon: shell.lon + 0.0001, locationAccuracy: undefined, listingSourceUrl: undefined, listingReviewedAt: undefined };
  const result = supplementVerifiedSpecialists({ ...response(), shops: [existing], count: 1, matchedCount: 1, sourceCount: 1 }, now);
  assert.equal(result.count, 4);
  assert.equal(result.shops.some(shop => shop.id === shell.id), false);
  assert.equal(result.shops.find(shop => shop.id === existing.id)?.locationAccuracy, "mapped-shop");
});

test("changed kind, changed name or moved OSM identity cannot inherit reviewed details", () => {
  const known = verifiedSpecialistsForSearch(area, now).find(shop => shop.id === "node/14322459906")!;
  for (const change of [{ kind: "specialty" as const }, { name: "Replacement shop" }, { lon: known.lon + 0.01 }]) {
    const existing = { ...known, ...change, website: null, address: null, phone: null, listingSourceUrl: undefined, listingReviewedAt: undefined };
    const result = supplementVerifiedSpecialists({ ...response(), shops: [existing], count: 1, matchedCount: 1, sourceCount: 1 }, now);
    assert.equal(result.shops.filter(shop => shop.id === known.id).length, 1);
    assert.equal(result.shops.find(shop => shop.id === known.id)?.website, null);
  }
});

test("supplement keeps map failures/partial coverage honest and no-website map shops selectable", () => {
  const base = response();
  const local = { ...verifiedSpecialistsForSearch(area, now)[0], id: "node/888", name: "Another local butcher", website: null, listingSourceUrl: undefined, listingReviewedAt: undefined };
  const result = supplementVerifiedSpecialists({ ...base, shops: [local], count: 1, matchedCount: 1, sourceCount: 1 }, now);
  assert.equal(result.count, 5);
  assert.ok(result.shops.some(shop => shop.id === local.id && shop.website === null));
  assert.equal(result.matchedCountIsLowerBound, true);
  assert.equal(result.coverage, "limited-nearby");
  assert.match(result.notice, /No price or stock is implied/);
});
