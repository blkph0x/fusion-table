import { distanceKm, MAX_SHOPS, validateShopSearch, type Shop, type ShopResponse, type ShopSearch } from "./locations.ts";

/** Reviewed recovery entries, not an inventory or price catalogue. Photon can
 * lag behind newly added OSM shops. These identities were checked against the
 * retailer/centre's own directory AND OSM on the date below. Entries expire
 * after ninety days unless reviewed; normal map discovery remains independent. */
const REVIEWED_AT = "2026-10-28";
const EXPIRES_AT = "2027-01-26T00:00:00Z";
type Listing = {
  id: string; name: string; aliases: string[]; kind: "butcher" | "produce";
  lat: number; lon: number; address: string; website: string; phone: string;
  sourceUrl: string; osmUrl: string; uncertaintyKm?: number;
};
const LISTINGS: readonly Listing[] = [
  {
    id: "node/14322459906", name: "Albion Park Village Meats", aliases: ["Albion Park Village Meats"], kind: "butcher",
    lat: -34.5724579, lon: 150.7744259,
    address: "Shop 7, Albion Park Village Shopping Centre, Albion Park NSW 2527",
    website: "https://apvm.com.au/", phone: "02 4257 8584", sourceUrl: "https://apvm.com.au/contact",
    osmUrl: "https://www.openstreetmap.org/node/14322459906",
  },
  {
    id: "verified/bushs-shellharbour", name: "Bush's Meats Shellharbour", aliases: ["Bush's Meats", "Bush's Fresh Meats", "Bush's Meats Shellharbour", "Bush's Fresh Meats Shellharbour"], kind: "butcher",
    lat: -34.5645015, lon: 150.8389757,
    address: "Shop 17, Stockland Shellharbour, 211 Lake Entrance Road, Shellharbour NSW 2529 (shopping-centre location; approximate)",
    website: "https://bushsmeats.com.au/", phone: "02 4296 9955", sourceUrl: "https://bushsmeats.com.au/pages/location",
    osmUrl: "https://www.openstreetmap.org/way/317353997", uncertaintyKm: 0.5,
  },
  {
    id: "node/11245027814", name: "Bush's Meats Warilla", aliases: ["Bush's Meats", "Bush's Fresh Meats", "Bush's Meats Warilla", "Bush's Meats Warilla Grove", "Bush's Fresh Meats Warilla"], kind: "butcher",
    lat: -34.546865, lon: 150.8633833,
    address: "Shop 12, HomeCo. Warilla Grove, 43–57 Shellharbour Road, Warilla NSW 2528",
    website: "https://bushsmeats.com.au/", phone: "02 4296 7909", sourceUrl: "https://bushsmeats.com.au/pages/location",
    osmUrl: "https://www.openstreetmap.org/node/11245027814",
  },
  {
    id: "node/11245027815", name: "Mitchell's Market Warilla", aliases: ["Mitchell's Market", "Mitchells Fresh Fruit", "Mitchell's Fresh Fruit", "Mitchell's Market Warilla"], kind: "produce",
    lat: -34.5469676, lon: 150.8635162,
    address: "T10/11, HomeCo. Warilla Grove, 43–57 Shellharbour Road, Warilla NSW 2528",
    website: "https://www.mitchellsmarket.com.au/", phone: "02 4295 5377", sourceUrl: "https://home-co.com.au/warilla/mitchells-fresh-fruit/",
    osmUrl: "https://www.openstreetmap.org/node/11245027815",
  },
];
const nameKey = (name: string) => name.normalize("NFKC").toLocaleLowerCase("en-AU").replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Coordinates are real reviewed shop pins except the explicitly approximate
 * Shellharbour mall pin. Its full 500m uncertainty must fit inside the radius;
 * the centre point alone never establishes that the branch is inside it. */
export function verifiedSpecialistsForSearch(input: ShopSearch, now = new Date()): Shop[] {
  validateShopSearch(input);
  const at = now.getTime();
  if (!Number.isFinite(at) || at < Date.parse(REVIEWED_AT) || at >= Date.parse(EXPIRES_AT)) return [];
  return LISTINGS.flatMap(listing => {
    const distance = distanceKm(input.lat, input.lon, listing.lat, listing.lon);
    if (distance + (listing.uncertaintyKm || 0) > input.radiusKm) return [];
    return [{
      id: listing.id, name: listing.name, kind: listing.kind,
      shopType: listing.kind === "butcher" ? "butcher" : "greengrocer",
      lat: listing.lat, lon: listing.lon, distanceKm: distance,
      address: listing.address, website: listing.website, phone: listing.phone,
      openingHours: null, osmUrl: listing.osmUrl, inventoryStatus: "unverified" as const,
      listingSourceUrl: listing.sourceUrl, listingReviewedAt: REVIEWED_AT,
      locationAccuracy: listing.uncertaintyKm ? "shopping-centre" as const : "mapped-shop" as const,
    }];
  }).sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name));
}

/** Keep live OSM identities when present. Reviewed details fill only absent
 * links/address/phone; a name or kind change must not inherit old shop details. */
export function supplementVerifiedSpecialists(result: ShopResponse, now = new Date()): ShopResponse {
  const candidates = verifiedSpecialistsForSearch({ ...result.location, radiusKm: result.radiusKm }, now);
  if (!candidates.length) return result;
  const shops = [...result.shops];
  let added = 0, enriched = 0;
  for (const candidate of candidates) {
    const listing = LISTINGS.find(row => row.id === candidate.id)!;
    const aliases = new Set(listing.aliases.map(nameKey));
    const existing = shops.findIndex(shop => shop.id === candidate.id || shop.kind === candidate.kind && aliases.has(nameKey(shop.name)) && distanceKm(shop.lat, shop.lon, candidate.lat, candidate.lon) <= (listing.uncertaintyKm || 0.15));
    if (existing >= 0) {
      const shop = shops[existing];
      const separation = distanceKm(shop.lat, shop.lon, candidate.lat, candidate.lon);
      if (shop.kind !== candidate.kind || !aliases.has(nameKey(shop.name)) || !Number.isFinite(separation) || separation > (listing.uncertaintyKm || 0.15)) continue;
      const updated = { ...shop, website: shop.website || candidate.website, address: shop.address || candidate.address, phone: shop.phone || candidate.phone, listingSourceUrl: candidate.listingSourceUrl, listingReviewedAt: candidate.listingReviewedAt, locationAccuracy: shop.locationAccuracy || "mapped-shop" as const };
      if (JSON.stringify(updated) === JSON.stringify(shop)) continue;
      shops[existing] = updated;
      enriched++;
    } else { shops.push(candidate); added++; }
  }
  if (!added && !enriched) return result;
  shops.sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name));
  const returned = shops.slice(0, MAX_SHOPS);
  return {
    ...result, shops: returned, count: returned.length,
    matchedCount: result.matchedCount + added, sourceCount: result.sourceCount + added,
    truncated: result.truncated || shops.length > MAX_SHOPS,
    matchedCountIsLowerBound: result.matchedCountIsLowerBound || shops.length > MAX_SHOPS,
    source: `${result.source} + reviewed specialist directories`,
    notice: `${result.notice} Nearby specialist listings checked against official shop directories on ${REVIEWED_AT} supplement map-index gaps. The Shellharbour Bush's listing uses an approximate shopping-centre location. No price or stock is implied.`,
  };
}
