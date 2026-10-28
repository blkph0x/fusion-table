import { catalogueSearchPhrases, isNonFoodCatalogueProduct, matchProducts, audToCents, type CatalogueProduct, type ProductMatch } from "./product-match.ts";
import { SharedPriceCache } from "./price-provider-cache.ts";
import { withDeadline } from "./abort-deadline.mjs";

export const CATALOGUE_LABEL = "Woolworths online catalogue. Not a confirmed price on the shelf at your local shop, and not a butcher or fruit-shop board.";
const SEARCH_URL = "https://www.woolworths.com.au/apis/ui/Search/products";
const MAX_BODY = 2_000_000;
const CACHE_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 512;

export interface PriceQuote {
  query: string;
  source: "woolworths-online-catalogue" | "coles-online-catalogue" | "aldi-online-catalogue" | "iga-online-catalogue" | "local-shop-website";
  retailerName?: string;
  scope?: "chain-online" | "shop-website" | "selected-store";
  shop?: { id: string; name: string; website: string; area: string; lat?: number; lon?: number };
  storeLabel?: string;
  collectionMethod?: "http" | "browser";
  status?: "ready" | "partial" | "needs-browser" | "needs-store" | "unavailable" | "not-configured";
  label: string;
  fetchedAt: string | null;
  cached: boolean;
  fulfilmentStoreId: string | null;
  matches: ProductMatch[];
  /** The list wording, then any other shop words that were also looked up. */
  searched: string[];
  error: string | null;
}

export interface ShopAsk {
  id: string;
  name: string;
  kind: string;
  note: string;
  /** True only for a Woolworths listing, and even then the catalogue is not that store's shelf. */
  catalogueGuide: boolean;
}

interface CachedCatalogue {
  at: number;
  products: CatalogueProduct[];
  fulfilmentStoreId: string | null;
  fetchedAt: string;
}

const catalogueCache = new SharedPriceCache<CachedCatalogue>(CACHE_LIMIT, CACHE_MS);
const providerBackoff = new WeakMap<typeof fetch, number>();
let catalogueInFlight = 0;
const catalogueWaiters: (() => void)[] = [];
const CATALOGUE_IN_FLIGHT = 8;
const CATALOGUE_QUEUE = 16;

function acquireCatalogueSlot(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (catalogueInFlight < CATALOGUE_IN_FLIGHT) {
    catalogueInFlight += 1;
    return Promise.resolve();
  }
  if (catalogueWaiters.length >= CATALOGUE_QUEUE) {
    return Promise.reject(new Error("The catalogue is busy. No price was invented."));
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const start = () => {
      cleanup();
      catalogueInFlight += 1;
      resolve();
    };
    const abort = () => {
      const index = catalogueWaiters.indexOf(start);
      if (index >= 0) catalogueWaiters.splice(index, 1);
      cleanup();
      reject(signal?.reason ?? new DOMException("Price lookup cancelled.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    catalogueWaiters.push(start);
  });
}

function releaseCatalogueSlot(): void {
  catalogueInFlight = Math.max(0, catalogueInFlight - 1);
  const next = catalogueWaiters.shift();
  if (next) next();
}

export function cleanSearchQuery(raw: string): string {
  const query = raw.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  if (query.length < 2 || query.length > 80) throw new Error("Enter a product name between 2 and 80 characters.");
  return query;
}

function textField(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function flag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function productPrice(row: Record<string, unknown>): number | null {
  const shelf = audToCents(row.Price);
  if (shelf) return shelf;
  if (row.Price == null) return audToCents(row.InstorePrice);
  return null;
}

function productCategories(row: Record<string, unknown>): string[] {
  const categories: string[] = [];
  for (const field of ["Department", "DepartmentName", "Category", "CategoryName", "Categories", "ProductCategories"]) {
    const values = Array.isArray(row[field]) ? (row[field] as unknown[]).slice(0, 12) : [row[field]];
    for (const value of values) {
      const label = typeof value === "string" ? value : value && typeof value === "object"
        ? textField((value as Record<string, unknown>).Name) ?? textField((value as Record<string, unknown>).Label) : null;
      if (label) categories.push(label.slice(0, 160));
      if (categories.length >= 12) return categories;
    }
  }
  return categories;
}

function productDietaryClaims(row: Record<string, unknown>): string[] {
  // Only explicit product-level claims are considered. Department/category names
  // such as "vegan & vegetarian" do not establish a particular product's label.
  const raw = row.DietaryClaims;
  return (Array.isArray(raw) ? raw.slice(0, 12) : typeof raw === "string" ? [raw] : [])
    .filter((claim): claim is string => typeof claim === "string" && claim.length <= 160);
}

function productPreparedForm(row: Record<string, unknown>): CatalogueProduct["preparedForm"] {
  const raw = row.AdditionalAttributes;
  const attributes = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const ingredients = [row.Ingredients, attributes.ingredients]
    .filter((value): value is string => typeof value === "string")
    .map(value => value.slice(0, 4_000)).join(" ").toLowerCase();
  const segment = [attributes.sapsegmentname, attributes.sapsubcategoryname]
    .filter((value): value is string => typeof value === "string")
    .map(value => value.slice(0, 160)).join(" ").toLowerCase();
  // Category and ingredient facts establish a prepared food. Generic microwave
  // instructions/flags do not: dry rice can also be cooked in a microwave.
  const cookedIngredients = /\bcooked\s+(?:(?:jasmine|basmati|white|brown)\s+)?rice\b|\brice\s*\(\s*cooked\b/.test(ingredients);
  const preparedCategory = /\brice\b.{0,32}\bmicrowav(?:e)?able\b|\b(?:ready|pre)[ -]*cooked\s+rice\b/.test(segment);
  return cookedIngredients || preparedCategory ? "cooked-rice" : undefined;
}

function pushProduct(row: Record<string, unknown>, products: CatalogueProduct[], seen: Set<string>): string | null {
  const name = textField(row.Name) ?? textField(row.DisplayName);
  if (!name || name.length > 500) return textField(row.FulfilmentStoreId);
  const stockcode = textField(row.Stockcode);
  const key = stockcode ?? name;
  if (seen.has(key)) return textField(row.FulfilmentStoreId);
  const categories = productCategories(row);
  const dietaryClaims = productDietaryClaims(row);
  const preparedForm = productPreparedForm(row);
  const product: CatalogueProduct = {
    name,
    priceCents: productPrice(row),
    packageSize: textField(row.PackageSize),
    stockcode,
    inStock: flag(row.IsInStock),
    available: flag(row.IsAvailable),
    url: stockcode ? `https://www.woolworths.com.au/shop/productdetails/${encodeURIComponent(stockcode)}` : null,
    ...(categories.length ? { categories } : {}),
    ...(dietaryClaims.length ? { dietaryClaims } : {}),
    ...(preparedForm ? { preparedForm } : {}),
  };
  if (isNonFoodCatalogueProduct(product)) return textField(row.FulfilmentStoreId);
  seen.add(key);
  products.push(product);
  return textField(row.FulfilmentStoreId);
}

/** Read the public search JSON. InstoreIsAvailable is ignored: it is not the user's local shelf. */
export function parseWoolworthsSearch(payload: unknown): { products: CatalogueProduct[]; fulfilmentStoreId: string | null } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { products: [], fulfilmentStoreId: null };
  const groups = (payload as Record<string, unknown>).Products;
  if (!Array.isArray(groups)) return { products: [], fulfilmentStoreId: null };
  const products: CatalogueProduct[] = [];
  const seen = new Set<string>();
  let fulfilmentStoreId: string | null = null;
  for (const group of groups) {
    if (!group || typeof group !== "object") continue;
    const record = group as Record<string, unknown>;
    const nested = Array.isArray(record.Products) ? record.Products : [record];
    for (const item of nested) {
      if (!item || typeof item !== "object") continue;
      const storeId = pushProduct(item as Record<string, unknown>, products, seen);
      fulfilmentStoreId ??= storeId;
      if (products.length >= 24) return { products, fulfilmentStoreId };
    }
  }
  return { products, fulfilmentStoreId };
}

function sameHost(current: string, location: string): string | null {
  try {
    const next = new URL(location, current);
    if (next.protocol !== "https:" || next.hostname !== "www.woolworths.com.au") return null;
    if (next.port !== "" && next.port !== "443") return null;
    if (next.username !== "" || next.password !== "") return null;
    return next.toString();
  } catch {
    return null;
  }
}

async function readJson(url: string, fetchImpl: typeof fetch, signal: AbortSignal, redirectsLeft: number): Promise<unknown> {
  const response = await fetchImpl(url, {
    redirect: "manual",
    signal,
    headers: {
      Accept: "application/json",
      "Accept-Language": "en-AU,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const next = redirectsLeft > 0 ? sameHost(url, response.headers.get("location") ?? "") : null;
    if (!next) throw new Error("Woolworths redirected the lookup somewhere else. No price was taken.");
    return readJson(next, fetchImpl, signal, redirectsLeft - 1);
  }
  if (!response.ok) {
    if ([403, 429, 503].includes(response.status)) providerBackoff.set(fetchImpl, Date.now() + 60_000);
    await response.body?.cancel().catch(() => undefined);
    throw new Error("The Woolworths catalogue did not respond. No price was invented.");
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY) { await response.body?.cancel().catch(() => undefined); throw new Error("The Woolworths response was too large to read. No price was taken."); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The Woolworths catalogue was empty. No price was taken.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_BODY) throw new Error("The Woolworths response was too large to read. No price was taken.");
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(buffer);
  if (!text || text.length > MAX_BODY || text.trimStart().startsWith("<")) {
    throw new Error("The Woolworths catalogue was not readable. No price was invented.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("The Woolworths catalogue was not readable. No price was invented.");
  }
}

async function loadCatalogue(query: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<{ value: CachedCatalogue; cached: boolean }> {
  signal?.throwIfAborted();
  const key = query.toLocaleLowerCase("en-AU");
  return catalogueCache.load(key, fetchImpl, async sharedSignal => {
    if ((providerBackoff.get(fetchImpl) ?? 0) > Date.now()) throw new Error("Woolworths is temporarily blocking price checks. Planning estimates remain available; retry later.");
    await acquireCatalogueSlot(sharedSignal);
    try {
    if ((providerBackoff.get(fetchImpl) ?? 0) > Date.now()) throw new Error("Woolworths is temporarily blocking price checks. Planning estimates remain available; retry later.");
    const payload = await withDeadline(12_000, [sharedSignal], boundedSignal => readJson(`${SEARCH_URL}?searchTerm=${encodeURIComponent(query)}`, fetchImpl, boundedSignal, 2));
    const parsed = parseWoolworthsSearch(payload);
    const stored: CachedCatalogue = { at: Date.now(), fetchedAt: new Date().toISOString(), ...parsed };
    return stored;
  } finally {
    releaseCatalogueSlot();
  }
  }, signal);
}

function quoteError(error: unknown): string {
  const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  if (timedOut) return "The Woolworths catalogue took too long. No price was invented.";
  if (error instanceof Error && error.message && error.message.length < 240 && !error.message.includes("\n")) return error.message;
  return "The Woolworths catalogue did not respond. No price was invented.";
}

export async function lookupQuery(raw: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<PriceQuote> {
  const query = cleanSearchQuery(raw);
  const phrases = catalogueSearchPhrases(query);
  const base = {
    query,
    source: "woolworths-online-catalogue" as const,
    label: CATALOGUE_LABEL,
    searched: phrases.length ? phrases : [query],
  };
  const products: CatalogueProduct[] = [];
  const seen = new Set<string>();
  let fulfilmentStoreId: string | null = null;
  let fetchedAt: string | null = null;
  let cached = true;
  let any = false;
  let primaryError: unknown = null;
  for (let index = 0; index < base.searched.length; index += 1) {
    const phrase = base.searched[index];
    try {
      const response = await loadCatalogue(phrase, fetchImpl, signal);
      const loaded = response.value;
      if (!response.cached) cached = false;
      any = true;
      fetchedAt = loaded.fetchedAt;
      fulfilmentStoreId ??= loaded.fulfilmentStoreId;
      for (const product of loaded.products) {
        const id = product.stockcode ?? product.name;
        if (seen.has(id)) continue;
        seen.add(id);
        products.push(product);
        if (products.length >= 48) break;
      }
    } catch (error) {
      if (index === 0) primaryError = error;
      if (signal?.aborted) break;
    }
    if (products.length >= 48) break;
  }
  if (!any) return { ...base, fetchedAt: null, cached: false, fulfilmentStoreId: null, matches: [], error: quoteError(primaryError ?? new Error("The Woolworths catalogue did not respond. No price was invented.")) };
  return {
    ...base,
    fetchedAt,
    cached,
    fulfilmentStoreId,
    matches: matchProducts(query, products),
    error: null,
  };
}

export async function lookupQueries(rawQueries: readonly string[], fetchImpl: typeof fetch = fetch, signal?: AbortSignal, onQuote?: (quote: PriceQuote) => void): Promise<PriceQuote[]> {
  if (rawQueries.length < 1 || rawQueries.length > 16) throw new Error("Check between 1 and 16 items at a time.");
  const quotes: PriceQuote[] = [];
  for (let index = 0; index < rawQueries.length; index += 4) {
    if (signal?.aborted) break;
    const chunk = rawQueries.slice(index, index + 4);
    quotes.push(...await Promise.all(chunk.map(async query => {
      const quote = await lookupQuery(query, fetchImpl, signal);
      if (!signal?.aborted) onQuote?.(quote);
      return quote;
    })));
  }
  return quotes;
}

export function shopAsk(shop: { id: string; name: string; kind: string }): ShopAsk {
  const name = shop.name.toLowerCase();
  const butcher = shop.kind === "butcher" || name.includes("butcher");
  const produce = shop.kind === "produce" || /greengrocer|\bfruit\b|\bveg\b/.test(name);
  if (butcher) {
    return { ...shop, catalogueGuide: false, note: "No published board. Ask for the cut by name, then record the price you see. A Woolworths catalogue price is not this shop." };
  }
  if (produce) {
    return { ...shop, catalogueGuide: false, note: "No published fruit-and-veg price. Ask in the shop, or record what you see. A supermarket catalogue price is not this shop." };
  }
  if (name.includes("woolworths")) {
    return { ...shop, catalogueGuide: true, note: "Woolworths online catalogue can be checked. That price is not confirmed on the shelf at this store." };
  }
  if (name.includes("coles")) {
    return { ...shop, catalogueGuide: false, note: "Coles blocks an automatic price check. Open the shop, or record the shelf price you see. Nothing is invented." };
  }
  if (/\baldi\b/.test(name)) {
    return { ...shop, catalogueGuide: false, note: "ALDI does not publish a price feed we can read. Record the shelf price you see." };
  }
  if (shop.kind === "supermarket" || shop.kind === "grocery" || shop.kind === "market") {
    return { ...shop, catalogueGuide: false, note: "No public price feed for this shop. Ask in store, or record the price you see." };
  }
  return { ...shop, catalogueGuide: false, note: "No published price for this listing. Stock is not confirmed." };
}

export function catalogueSubtotalCents(quotes: readonly { matches: readonly { selected: boolean; priceCents: number | null }[] }[]): number | null {
  const priced = quotes.flatMap((quote) => quote.matches.filter((match) => match.selected && match.priceCents != null && match.priceCents > 0).map((match) => match.priceCents as number));
  return priced.length ? priced.reduce((sum, cents) => sum + cents, 0) : null;
}
