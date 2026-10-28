/** Shared public location types. Distances are geodesic, not road distances. */
export type ShopKind =
  | "supermarket"
  | "produce"
  | "butcher"
  | "fishmonger"
  | "market"
  | "grocery"
  | "specialty";

export interface LocationResult {
  id: string;
  label: string;
  name: string;
  lat: number;
  lon: number;
  country?: string;
  region?: string;
}

export interface Shop {
  id: string;
  name: string;
  kind: ShopKind;
  /** Original OSM shop tag; distinguishes bakery, cheese, spices and deli. */
  shopType?: string;
  lat: number;
  lon: number;
  distanceKm: number;
  address: string | null;
  website: string | null;
  phone: string | null;
  openingHours: string | null;
  osmUrl: string;
  inventoryStatus: "unverified";
  /** Evidence for a small, reviewed directory supplement when a map index lags. */
  listingSourceUrl?: string;
  listingReviewedAt?: string;
  locationAccuracy?: "mapped-shop" | "shopping-centre";
}

export interface ShopSearch {
  lat: number;
  lon: number;
  radiusKm: number;
}

export interface ShopResponse {
  shops: Shop[];
  count: number;
  /** Number checked inside the radius before our presentation limit. */
  matchedCount: number;
  /** Provider object count: returned objects for ranked search, selected total for area queries. */
  sourceCount: number;
  matchedCountIsLowerBound: boolean;
  truncated: boolean;
  radiusKm: number;
  location: { lat: number; lon: number };
  distanceType: "straight-line";
  coverage: "limited-nearby" | "area-query";
  source: string;
  attribution: string;
  attributionUrl: string;
  fetchedAt: string;
  osmTimestamp: string | null;
  cached: boolean;
  notice: string;
}

export interface LocationsResponse {
  locations: LocationResult[];
  source: string;
  attribution: string;
  attributionUrl: string;
  fetchedAt: string;
  cached: boolean;
}

export const SHOP_LABELS: Record<ShopKind, string> = {
  supermarket: "Supermarket",
  produce: "Fruit & vegetables",
  butcher: "Butcher",
  fishmonger: "Fishmonger",
  market: "Market",
  grocery: "Local grocer",
  specialty: "Specialty food shop",
};

export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 25;
export const MAX_SHOPS = 120;
export const OVERPASS_OUTPUT_LIMIT = 750;

export class LocationError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: number;

  constructor(message: string, status = 400, code = "invalid_input", retryAfter?: number) {
    super(message);
    this.name = "LocationError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function numeric(value: unknown, label: string): number {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    (typeof value === "string" && !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim()))
  ) {
    throw new LocationError(`${label} must be a number.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new LocationError(`${label} must be a finite number.`);
  return number;
}

export function validateShopSearch(input: { lat: unknown; lon: unknown; radiusKm: unknown }): ShopSearch {
  const lat = numeric(input.lat, "Latitude");
  const lon = numeric(input.lon, "Longitude");
  const radiusKm = numeric(input.radiusKm, "Radius");
  if (lat < -90 || lat > 90) throw new LocationError("Latitude must be between −90 and 90.");
  if (lon < -180 || lon > 180) throw new LocationError("Longitude must be between −180 and 180.");
  if (radiusKm < MIN_RADIUS_KM || radiusKm > MAX_RADIUS_KM) {
    throw new LocationError(`Choose a radius between ${MIN_RADIUS_KM} and ${MAX_RADIUS_KM} km.`);
  }
  return { lat, lon, radiusKm };
}

export function validateLocationQuery(input: unknown): string {
  if (typeof input !== "string") throw new LocationError("Enter a suburb, town or postcode.");
  const query = input.trim().replace(/\s+/g, " ");
  if (query.length < 2 || query.length > 160 || /[\u0000-\u001f\u007f]/.test(query)) {
    throw new LocationError("Enter a location between 2 and 160 characters.");
  }
  return query;
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = Math.PI / 180;
  const dLat = (lat2 - lat1) * radians;
  const dLon = (lon2 - lon1) * radians;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}

function text(value: unknown, limit = 240): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, limit) || undefined;
}

export function safeWebsite(value: unknown): string | null {
  const candidate = text(value, 1000);
  if (!candidate) return null;
  try {
    const url = new URL(candidate.startsWith("www.") ? `https://${candidate}` : candidate);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function normalizePhoton(data: unknown): LocationResult[] {
  const root = record(data);
  if (!root || !Array.isArray(root.features)) {
    throw new LocationError("The location provider returned an unreadable result. Please try again.", 502, "provider_response");
  }
  const output: LocationResult[] = [];
  const seen = new Set<string>();
  for (const feature of root.features.slice(0, 20)) {
    const item = record(feature);
    const geometry = record(item?.geometry);
    const properties = record(item?.properties);
    if (!properties || geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) continue;
    const [lon, lat] = geometry.coordinates;
    if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const name = text(properties.name) ?? text(properties.city) ?? text(properties.district) ?? text(properties.postcode);
    if (!name) continue;
    const country = text(properties.country);
    const region = text(properties.state);
    const label = [...new Set([name, text(properties.city), region, text(properties.postcode), country].filter(Boolean))].join(", ");
    const key = `${name.toLowerCase()}/${lat.toFixed(5)}/${lon.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      id: `${text(properties.osm_type, 8) ?? "place"}/${typeof properties.osm_id === "number" ? properties.osm_id : key}`,
      name, label, lat, lon, ...(country ? { country } : {}), ...(region ? { region } : {}),
    });
    if (output.length >= 6) break;
  }
  return output;
}

const SERVICE_STATION = /\b(petrol|diesel|fuel|servo|service station|truck stop|ampol|caltex|\bbp\b|shell|mobil|united petroleum|7-?eleven|coles express|reddy express|\botr\b|eg australia|puma energy|liberty oil|nightowl)\b/i;

/** Service stations are not useful grocery stops. A convenience tag alone is not a supermarket. */
export function isUsefulFoodShop(name: string, tags: Record<string, unknown>, _kind: ShopKind): boolean {
  if (tags.amenity === "fuel" || tags.fuel === "yes" || tags.shop === "fuel") return false;
  if (SERVICE_STATION.test(name)) return false;
  if (tags.shop === "convenience") {
    return /\b(woolworths|coles|aldi|iga|foodworks|friendly grocer|supermarket)\b/i.test(name);
  }
  return true;
}

export function shopKind(tags: Record<string, unknown>): ShopKind | null {
  switch (tags.shop) {
    case "supermarket": return "supermarket";
    case "greengrocer": case "farm": return "produce";
    case "butcher": return "butcher";
    case "seafood": return "fishmonger";
    case "convenience": case "grocery": return "grocery";
    case "deli": case "spices": case "cheese": case "bakery": return "specialty";
  }
  return tags.amenity === "marketplace" ? "market" : null;
}

export function buildOverpassQuery(input: ShopSearch): string {
  // Only validated numbers enter the query. Visitors cannot supply Overpass QL.
  const { lat, lon, radiusKm } = validateShopSearch(input);
  const around = `around:${Math.ceil(radiusKm * 1000)},${lat},${lon}`;
  return `[out:json][timeout:15];(nwr["shop"~"^(supermarket|greengrocer|butcher|seafood|farm|deli|spices|cheese|bakery|grocery)$"](${around});nwr["amenity"="marketplace"](${around}););out tags center qt ${OVERPASS_OUTPUT_LIMIT};out count;`;
}

export function normalizeOverpass(data: unknown, input: ShopSearch): Pick<ShopResponse, "shops" | "count" | "matchedCount" | "sourceCount" | "matchedCountIsLowerBound" | "truncated" | "osmTimestamp"> {
  const root = record(data);
  if (!root || !Array.isArray(root.elements)) {
    throw new LocationError("The shop provider returned an unreadable result. Please try again.", 502, "provider_response");
  }
  if (root.remark) {
    // Overpass can return HTTP 200 with a timeout/runtime error and partial data.
    throw new LocationError("The map search could not finish. Try a smaller radius or retry later.", 503, "provider_incomplete", 30);
  }
  const shops: Shop[] = [];
  const seenIds = new Set<string>();
  let rawElements = 0;
  let providerCount: number | null = null;
  for (const raw of root.elements) {
    const element = record(raw);
    const tags = record(element?.tags);
    if (!element || !tags) continue;
    if (element.type === "count") {
      const total = Number(tags.total);
      if (Number.isSafeInteger(total) && total >= 0) providerCount = total;
      continue;
    }
    rawElements++;
    if (!["node", "way", "relation"].includes(String(element.type)) || !Number.isSafeInteger(element.id) || Number(element.id) <= 0) continue;
    const center = record(element.center);
    const lat = element.lat ?? center?.lat;
    const lon = element.lon ?? center?.lon;
    if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const kind = shopKind(tags);
    const nameForFilter = text(tags.name) ?? text(tags.brand) ?? text(tags.operator) ?? "";
    if (!kind || !isUsefulFoodShop(nameForFilter, tags, kind) || tags.disused === "yes" || tags.abandoned === "yes" || tags.access === "private") continue;
    const distance = distanceKm(input.lat, input.lon, lat, lon);
    // Do not round before this check: a location outside the chosen radius must
    // never be shown as inside it. Overpass geometries may extend past a centre.
    if (distance > input.radiusKm) continue;
    const id = `${element.type}/${element.id}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const name = text(tags.name) ?? text(tags.brand) ?? text(tags.operator) ?? `Unnamed ${SHOP_LABELS[kind].toLowerCase()}`;
    const address = [
      [text(tags["addr:housenumber"]), text(tags["addr:street"])].filter(Boolean).join(" "),
      text(tags["addr:suburb"]), text(tags["addr:city"]), text(tags["addr:postcode"]),
    ].filter(Boolean).join(", ") || null;
    const rawPhone = text(tags["contact:phone"]) ?? text(tags.phone);
    const phone = rawPhone && /^[+\d\s(),;/.#-]{5,80}$/.test(rawPhone) ? rawPhone : null;
    shops.push({
      id, name, kind, lat, lon, distanceKm: distance, address,
      ...(text(tags.shop, 60) ? { shopType: text(tags.shop, 60) } : {}),
      website: safeWebsite(tags["contact:website"] ?? tags.website),
      phone, openingHours: text(tags.opening_hours, 300) ?? null,
      osmUrl: `https://www.openstreetmap.org/${id}`,
      inventoryStatus: "unverified",
    });
  }
  shops.sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name));
  const sourceCount = providerCount ?? rawElements;
  const matchedCount = shops.length;
  const sourceTruncated = sourceCount > rawElements || (providerCount === null && rawElements >= OVERPASS_OUTPUT_LIMIT);
  const returned = shops.slice(0, MAX_SHOPS);
  return {
    shops: returned, count: returned.length, matchedCount, sourceCount,
    matchedCountIsLowerBound: sourceTruncated,
    truncated: sourceTruncated || matchedCount > MAX_SHOPS,
    osmTimestamp: text(record(root.osm3s)?.timestamp_osm_base, 60) ?? null,
  };
}

/** Photon supports tagged reverse search but does not report a total match count. */
export function normalizePhotonShops(data: unknown, input: ShopSearch): ReturnType<typeof normalizeOverpass> {
  const root = record(data);
  if (!root || !Array.isArray(root.features)) {
    throw new LocationError("The shop provider returned an unreadable result. Please try again.", 502, "provider_response");
  }
  const typeNames: Record<string, string> = { N: "node", W: "way", R: "relation" };
  const elements: Record<string, unknown>[] = [];
  for (const raw of root.features.slice(0, 120)) {
    const feature = record(raw);
    const properties = record(feature?.properties);
    const geometry = record(feature?.geometry);
    if (!properties || geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) continue;
    const type = typeNames[String(properties.osm_type)];
    if (!type || !["shop", "amenity"].includes(String(properties.osm_key))) continue;
    const [lon, lat] = geometry.coordinates;
    const extra = record(properties.extra) ?? {};
    elements.push({
      type, id: properties.osm_id, lat, lon,
      tags: {
        ...extra, [String(properties.osm_key)]: properties.osm_value,
        name: properties.name,
        "addr:housenumber": properties.housenumber,
        "addr:street": properties.street,
        "addr:suburb": properties.district,
        "addr:city": properties.city,
        "addr:postcode": properties.postcode,
      },
    });
  }
  const result = normalizeOverpass({ elements }, input);
  return {
    ...result,
    // Ranked Photon search is a partial list; it provides no area-wide total.
    sourceCount: root.features.length,
    matchedCountIsLowerBound: true,
    truncated: root.features.length >= 50,
  };
}
