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
type ProviderKind = "photon" | "overpass";
type WaitingSearch = {
  resolve: () => void;
  reject: (error: LocationError) => void;
  timeout: ReturnType<typeof setTimeout>;
};
type ProviderState = { active: boolean; nextAt: number; blockedUntil: number; waiting: WaitingSearch[] };
const providerState: Record<ProviderKind, ProviderState> = {
  photon: { active: false, nextAt: 0, blockedUntil: 0, waiting: [] },
  overpass: { active: false, nextAt: 0, blockedUntil: 0, waiting: [] },
};
const MAX_WAITING_SEARCHES = 3;
const QUEUE_WAIT_MS = 8_000;
const pause = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));
const cooldownMs = (kind: ProviderKind) => kind === "overpass" ? 3500 : 1200;

// These failures can be transient. Configuration, redirects, malformed results
// and provider rate limits must not trigger an immediate repeat request.
class RetryableProviderError extends LocationError {}

function rateLimitError(state: ProviderState): LocationError {
  const retryAfter = Math.max(1, Math.ceil((state.blockedUntil - Date.now()) / 1000));
  return new LocationError(`The public map service is busy. Please retry in ${retryAfter} seconds.`, 429, "provider_rate_limited", retryAfter);
}

async function acquireProvider(kind: ProviderKind): Promise<void> {
  const state = providerState[kind];
  if (state.blockedUntil > Date.now()) throw rateLimitError(state);
  if (state.active) {
    if (state.waiting.length >= MAX_WAITING_SEARCHES) {
      throw new LocationError("Several map searches are in progress. Please try again in a few seconds.", 429, "search_rate_limited", 5);
    }
    await new Promise<void>((resolve, reject) => {
      const waiting: WaitingSearch = {
        resolve, reject,
        timeout: setTimeout(() => {
          const index = state.waiting.indexOf(waiting);
          if (index !== -1) state.waiting.splice(index, 1);
          reject(new LocationError("The map search queue is busy. Please try again in a few seconds.", 429, "search_rate_limited", 5));
        }, QUEUE_WAIT_MS),
      };
      state.waiting.push(waiting);
    });
  } else state.active = true;
  // The slot remains owned during this wait, so another visitor cannot start a
  // simultaneous provider request or skip its cooldown.
  const delay = state.nextAt - Date.now();
  if (delay > 0) await pause(delay);
}

function releaseProvider(kind: ProviderKind): void {
  const state = providerState[kind];
  state.nextAt = Date.now() + cooldownMs(kind);
  state.active = false;
  while (state.waiting.length) {
    const waiting = state.waiting.shift()!;
    clearTimeout(waiting.timeout);
    if (state.blockedUntil > Date.now()) waiting.reject(rateLimitError(state));
    else {
      state.active = true;
      waiting.resolve();
      break;
    }
  }
}

function retryAfterSeconds(value: string | null): number {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
    const date = Date.parse(value);
    if (Number.isFinite(date) && date > Date.now()) return Math.ceil((date - Date.now()) / 1000);
  }
  return 60;
}

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

async function fetchProvider(kind: ProviderKind, url: URL, init: RequestInit, config: LocationProviderConfig): Promise<unknown> {
  await acquireProvider(kind);
  // A slow first attempt cannot double the visitor's wait indefinitely. These
  // budgets include both attempts and their intervening provider cooldown.
  const deadline = Date.now() + (kind === "overpass" ? 26_000 : 20_000);
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetchProviderAttempt(kind, url, init, config, Math.min(kind === "overpass" ? 22_000 : 12_000, deadline - Date.now()));
      } catch (error) {
        if (!(error instanceof RetryableProviderError) || attempt >= 1 || deadline - Date.now() <= cooldownMs(kind) + 1000) throw error;
        await pause(cooldownMs(kind));
      }
    }
  } finally {
    releaseProvider(kind);
  }
}

async function fetchProviderAttempt(kind: ProviderKind, url: URL, init: RequestInit, config: LocationProviderConfig, timeoutMs: number): Promise<unknown> {
  const state = providerState[kind];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    let origin = "https://github.com/blkph0x/fusion-table";
    if (config.appOrigin) {
      try { origin = new URL(config.appOrigin).origin + "/"; headers.set("Referer", origin); } catch { /* optional identification */ }
    }
    headers.set("User-Agent", `FusionTable/1.0 (${origin}; nearby food-shop discovery)`);
    // Workers supports only "follow" and "manual". "error" throws before any
    // network request. Manual handling keeps redirects disabled without that
    // runtime incompatibility or forwarding headers to another destination.
    const response = await fetch(url, { ...init, headers, signal: controller.signal, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      throw new LocationError("The map provider endpoint has changed and needs a configuration update.", 503, "provider_redirect");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 429) {
        state.blockedUntil = Date.now() + retryAfterSeconds(response.headers.get("Retry-After")) * 1000;
        throw rateLimitError(state);
      }
      if (response.status === 408 || response.status >= 500) {
        throw new RetryableProviderError("The live map service is temporarily unavailable. Please retry the shop search in a moment.", 503, "provider_unavailable", 30);
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
      throw new RetryableProviderError("The map search took too long. Try a smaller radius or retry in a moment.", 504, "provider_timeout", 15);
    }
    throw new RetryableProviderError("We couldn't reach the live map service. Please retry in a moment.", 503, "provider_unavailable", 30);
  } finally {
    clearTimeout(timeout);
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
      notice: "Supermarkets, grocers, butchers and markets only. Petrol stations are left out. Stock is not confirmed and no shelf price is included. Distances are straight-line.",
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
    for (const tag of ["supermarket", "greengrocer", "butcher", "seafood", "farm", "deli", "spices", "cheese", "bakery", "grocery"]) {
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
      notice: "Supermarkets, grocers, butchers and markets only. Petrol stations are left out. Stock is not confirmed and no shelf price is included. Distances are straight-line.",
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
