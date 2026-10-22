import {
  buildOverpassQuery, LocationError, normalizeOverpass, normalizePhoton, normalizePhotonShops,
  validateShopSearch,
  type LocationsResponse, type ShopResponse, type ShopSearch,
} from "./locations.ts";

export interface LocationProviderConfig {
  photonUrl?: string;
  photonReverseUrl?: string;
  overpassUrl?: string;
  shopProvider?: string;
  appOrigin?: string;
}

const ATTRIBUTION = "© OpenStreetMap contributors";
const ATTRIBUTION_URL = "https://www.openstreetmap.org/copyright";
const GEO_TTL = 24 * 60 * 60 * 1000;
const SHOP_TTL = 30 * 60 * 1000;

type CacheEntry = { value: LocationsResponse | ShopResponse; expires: number };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<LocationsResponse | ShopResponse>>();
const providerState = {
  photon: { active: false, nextAt: 0 },
  overpass: { active: false, nextAt: 0 },
};

function endpoint(value: string | undefined, fallback: string): URL {
  try {
    const url = new URL(value || fallback);
    // Endpoints are runtime configuration, never taken from incoming requests.
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) throw new Error();
    return url;
  } catch {
    throw new LocationError("The location service needs a configuration update.", 503, "provider_configuration");
  }
}

function cacheRead<T extends LocationsResponse | ShopResponse>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) { cache.delete(key); return null; }
  return { ...entry.value, cached: true } as T;
}

function cacheWrite(key: string, value: LocationsResponse | ShopResponse, ttl: number): void {
  // Bounded caches avoid unbounded worker memory and contain no user identities.
  if (cache.size >= 80) cache.delete(cache.keys().next().value!);
  cache.set(key, { value, expires: Date.now() + ttl });
}

async function singleFlight<T extends LocationsResponse | ShopResponse>(key: string, ttl: number, run: () => Promise<T>): Promise<T> {
  const cached = cacheRead<T>(key);
  if (cached) return cached;
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = run().then(value => {
    cacheWrite(key, value, ttl);
    return value;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function fetchProvider(kind: "photon" | "overpass", url: URL, init: RequestInit, config: LocationProviderConfig): Promise<unknown> {
  const state = providerState[kind];
  const now = Date.now();
  if (state.active || state.nextAt - now > 1500) {
    throw new LocationError("A map search is already in progress. Please try again in a few seconds.", 429, "search_rate_limited", kind === "overpass" ? 5 : 2);
  }
  state.active = true;
  if (now < state.nextAt) await new Promise(resolve => setTimeout(resolve, state.nextAt - now));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), kind === "overpass" ? 22_000 : 12_000);
  try {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    let origin = "https://github.com/blkph0x/p-vs-np-proof-research";
    if (config.appOrigin) {
      try { origin = new URL(config.appOrigin).origin + "/"; headers.set("Referer", origin); } catch { /* optional identification */ }
    }
    headers.set("User-Agent", `FusionTable/1.0 (${origin}; nearby food-shop discovery)`);
    // Workers supports only "follow" and "manual". "error" throws before any
    // network request. Manual handling keeps redirects disabled without that
    // runtime incompatibility or forwarding headers to another destination.
    const response = await fetch(url, { ...init, headers, signal: controller.signal, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      throw new LocationError("The map provider endpoint has changed and needs a configuration update.", 503, "provider_redirect");
    }
    if (!response.ok) {
      if (response.status === 429) {
        state.nextAt = Date.now() + 60_000;
        throw new LocationError("The public map service is busy. Please retry in a minute.", 429, "provider_rate_limited", 60);
      }
      throw new LocationError("The live map service is temporarily unavailable. Your recipes still work; retry the shop search later.", 503, "provider_unavailable", 30);
    }
    // A truncated body is never interpreted as an empty set of shops.
    const contentLength = Number(response.headers.get("content-length"));
    if (contentLength > 4_000_000) throw new LocationError("Too many map results. Try a smaller radius.", 503, "provider_response_limit");
    const body = await response.text();
    if (body.length > 4_000_000) throw new LocationError("Too many map results. Try a smaller radius.", 503, "provider_response_limit");
    try { return JSON.parse(body) as unknown; }
    catch { throw new LocationError("The live map service returned an unreadable response. Please retry later.", 502, "provider_response"); }
  } catch (error) {
    if (error instanceof LocationError) throw error;
    if (controller.signal.aborted) {
      throw new LocationError("The map search took too long. Try a smaller radius or retry in a moment.", 504, "provider_timeout", 15);
    }
    throw new LocationError("We couldn't reach the live map service. Please retry in a moment.", 503, "provider_unavailable", 30);
  } finally {
    clearTimeout(timeout);
    state.active = false;
    state.nextAt = Math.max(state.nextAt, Date.now() + (kind === "overpass" ? 3500 : 1200));
  }
}

export async function searchLocations(query: string, config: LocationProviderConfig = {}): Promise<LocationsResponse> {
  const url = endpoint(config.photonUrl, "https://photon.komoot.io/api/");
  const key = `photon:${url.href}:${query.toLocaleLowerCase("en")}`;
  return singleFlight(key, GEO_TTL, async () => {
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "6");
    url.searchParams.set("lang", "en");
    const data = await fetchProvider("photon", url, {}, config);
    return {
      locations: normalizePhoton(data), source: "Photon / OpenStreetMap",
      attribution: ATTRIBUTION, attributionUrl: ATTRIBUTION_URL,
      fetchedAt: new Date().toISOString(), cached: false,
    };
  });
}

export async function searchShops(input: ShopSearch, config: LocationProviderConfig = {}): Promise<ShopResponse> {
  validateShopSearch(input);
  const provider = config.shopProvider || "photon";
  if (provider === "photon") return searchPhotonShops(input, config);
  if (provider !== "overpass") throw new LocationError("The location service needs a configuration update.", 503, "provider_configuration");
  const url = endpoint(config.overpassUrl, "https://overpass.private.coffee/api/interpreter");
  // Exact input coordinates keep every radius filter attached to its actual centre.
  const key = `overpass:${url.href}:${input.lat}:${input.lon}:${input.radiusKm}`;
  return singleFlight(key, SHOP_TTL, async () => {
    const query = buildOverpassQuery(input);
    const data = await fetchProvider("overpass", url, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ data: query }).toString(),
    }, config);
    return {
      ...normalizeOverpass(data, input),
      radiusKm: input.radiusKm, location: { lat: input.lat, lon: input.lon },
      distanceType: "straight-line", coverage: "area-query", source: "OpenStreetMap via Private.coffee Overpass",
      attribution: ATTRIBUTION, attributionUrl: ATTRIBUTION_URL,
      fetchedAt: new Date().toISOString(), cached: false,
      notice: "Mapped shops are suggested places to look, not confirmed stock. Check ingredient availability, prices and market days with the shop. Distances are straight-line.",
    };
  });
}

async function searchPhotonShops(input: ShopSearch, config: LocationProviderConfig): Promise<ShopResponse> {
  const url = endpoint(config.photonReverseUrl, "https://photon.komoot.io/reverse");
  const key = `photon-shops:${url.href}:${input.lat}:${input.lon}:${input.radiusKm}`;
  return singleFlight(key, SHOP_TTL, async () => {
    url.searchParams.set("lat", String(input.lat));
    url.searchParams.set("lon", String(input.lon));
    url.searchParams.set("radius", String(input.radiusKm));
    url.searchParams.set("limit", "50");
    url.searchParams.set("lang", "en");
    for (const tag of ["supermarket", "convenience", "greengrocer", "butcher", "seafood", "farm", "deli", "spices", "cheese", "bakery", "grocery"]) {
      url.searchParams.append("osm_tag", `shop:${tag}`);
    }
    url.searchParams.append("osm_tag", "amenity:marketplace");
    const data = await fetchProvider("photon", url, {}, config);
    return {
      ...normalizePhotonShops(data, input),
      radiusKm: input.radiusKm, location: { lat: input.lat, lon: input.lon },
      distanceType: "straight-line", coverage: "limited-nearby", source: "Photon / OpenStreetMap",
      attribution: ATTRIBUTION, attributionUrl: ATTRIBUTION_URL,
      fetchedAt: new Date().toISOString(), osmTimestamp: null, cached: false,
      notice: "A limited selection of nearby mapped food shops, not a complete directory. Ingredient matches are suggestions; stock and prices need confirmation. Distances are straight-line.",
    };
  });
}

export function locationErrorResponse(error: unknown): Response {
  const failure = error instanceof LocationError
    ? error
    : new LocationError("The location service is temporarily unavailable. Please try again.", 503, "location_unavailable");
  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (failure.retryAfter) headers["Retry-After"] = String(failure.retryAfter);
  return Response.json({ error: failure.message, code: failure.code, ...(failure.retryAfter ? { retryAfter: failure.retryAfter } : {}) }, { status: failure.status, headers });
}
