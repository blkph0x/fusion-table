import type { LocationResult, LocationsResponse, Shop, ShopKind, ShopResponse } from "./locations.ts";

// Allow the server's bounded provider queue/retry to finish, while ensuring that
// a stalled browser request cannot leave search controls disabled indefinitely.
const REQUEST_TIMEOUT_MS = 45_000;
const SHOP_KINDS = new Set<ShopKind>(["supermarket", "produce", "butcher", "fishmonger", "market", "grocery", "specialty"]);

const MESSAGES = {
  locations: {
    unavailable: "Location search is temporarily unavailable. Please try again in a moment.",
    network: "We couldn't reach location search. Check your connection and try again.",
    malformed: "The location service returned an unreadable response. Please try again.",
    timeout: "Location search took too long. Please try again in a moment.",
  },
  shops: {
    unavailable: "The shop directory is temporarily unavailable. Please try again in a moment.",
    network: "We couldn't reach the shop directory. Check your connection and try again.",
    malformed: "The shop directory returned an unreadable response. Please try again.",
    timeout: "The shop search took too long. Try a smaller radius or retry in a moment.",
  },
};

class LocationClientError extends Error {}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function coordinate(value: unknown, limit: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

function nullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function webUrl(value: unknown): value is string {
  if (!nonempty(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch { return false; }
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function metadata(value: Record<string, unknown>): boolean {
  return nonempty(value.source) && nonempty(value.attribution) && webUrl(value.attributionUrl) && timestamp(value.fetchedAt) && typeof value.cached === "boolean";
}

function locationResult(value: unknown): value is LocationResult {
  return record(value) && nonempty(value.id) && nonempty(value.name) && nonempty(value.label) &&
    coordinate(value.lat, 90) && coordinate(value.lon, 180) &&
    (value.country === undefined || typeof value.country === "string") &&
    (value.region === undefined || typeof value.region === "string");
}

function locationsResponse(value: unknown): value is LocationsResponse {
  return record(value) && Array.isArray(value.locations) && value.locations.every(locationResult) && metadata(value);
}

function shopResult(value: unknown): value is Shop {
  return record(value) && nonempty(value.id) && nonempty(value.name) && SHOP_KINDS.has(value.kind as ShopKind) &&
    coordinate(value.lat, 90) && coordinate(value.lon, 180) &&
    typeof value.distanceKm === "number" && Number.isFinite(value.distanceKm) && value.distanceKm >= 0 &&
    (value.shopType === undefined || typeof value.shopType === "string") &&
    nullableText(value.address) && nullableText(value.phone) && nullableText(value.openingHours) &&
    (value.website === null || webUrl(value.website)) && webUrl(value.osmUrl) && value.inventoryStatus === "unverified";
}

function shopResponse(value: unknown): value is ShopResponse {
  if (!record(value) || !Array.isArray(value.shops) || !value.shops.every(shopResult) || !metadata(value)) return false;
  return record(value.location) && coordinate(value.location.lat, 90) && coordinate(value.location.lon, 180) &&
    typeof value.radiusKm === "number" && Number.isFinite(value.radiusKm) && value.radiusKm >= 1 && value.radiusKm <= 25 &&
    value.shops.every(shop => shop.distanceKm <= (value.radiusKm as number)) &&
    value.count === value.shops.length &&
    Number.isInteger(value.matchedCount) && (value.matchedCount as number) >= value.shops.length &&
    Number.isInteger(value.sourceCount) && (value.sourceCount as number) >= 0 &&
    typeof value.matchedCountIsLowerBound === "boolean" && typeof value.truncated === "boolean" &&
    value.distanceType === "straight-line" && (value.coverage === "limited-nearby" || value.coverage === "area-query") &&
    (value.osmTimestamp === null || timestamp(value.osmTimestamp)) && nonempty(value.notice);
}

function cancelled(signal?: AbortSignal): Error {
  const reason: unknown = signal?.reason;
  // Preserve an ordinary caller AbortError. Custom abort reasons still become an
  // AbortError so the UI can consistently ignore deliberately cancelled work.
  if (reason instanceof Error && reason.name === "AbortError") return reason;
  return new DOMException("The search was cancelled.", "AbortError");
}

function serviceMessage(data: unknown): string | undefined {
  if (!record(data) || typeof data.error !== "string") return undefined;
  const message = data.error.trim();
  // Proxy HTML and stack traces are not useful instructions for a visitor.
  if (!message || message.length > 500 || /[<>\u0000-\u001f\u007f]/.test(message)) return undefined;
  return message;
}

async function request<T>(path: string, validate: (value: unknown) => value is T, kind: keyof typeof MESSAGES, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw cancelled(signal);
  const messages = MESSAGES[kind];
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(cancelled(signal));
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await response.text();
    if (signal?.aborted) throw cancelled(signal);
    if (timedOut) throw new LocationClientError(messages.timeout);
    let data: unknown;
    try { data = JSON.parse(body) as unknown; } catch { /* Handled below without leaking a JSON parser error. */ }
    if (!response.ok) {
      const fallback = response.status === 429
        ? "The map service is busy. Please wait a moment and try again."
        : messages.unavailable;
      throw new LocationClientError(serviceMessage(data) || fallback);
    }
    if (!validate(data)) throw new LocationClientError(messages.malformed);
    return data;
  } catch (error) {
    if (signal?.aborted) throw cancelled(signal);
    if (timedOut) throw new LocationClientError(messages.timeout);
    if (error instanceof LocationClientError) throw error;
    throw new LocationClientError(messages.network);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/** Submitted searches only: no third-party requests or credentials in the client. */
export function fetchLocationResults(query: string, signal?: AbortSignal): Promise<LocationsResponse> {
  const params = new URLSearchParams({ q: query.trim() });
  return request(`/api/locations?${params}`, locationsResponse, "locations", signal);
}

/** Keep the selected centre and radius attached to the matching response. */
export function fetchNearbyShops(place: { lat: number; lon: number }, radiusKm: number, signal?: AbortSignal): Promise<ShopResponse> {
  const params = new URLSearchParams({ lat: String(place.lat), lon: String(place.lon), radiusKm: String(radiusKm) });
  const matchesRequest = (value: unknown): value is ShopResponse => shopResponse(value) &&
    value.location.lat === place.lat && value.location.lon === place.lon && value.radiusKm === radiusKm;
  return request(`/api/shops?${params}`, matchesRequest, "shops", signal);
}
