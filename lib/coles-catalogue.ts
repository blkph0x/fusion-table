import { cleanSearchQuery, type PriceQuote } from "./catalogue.ts";
import { audToCents, catalogueSearchPhrases, isNonFoodCatalogueProduct, matchProducts, type CatalogueProduct } from "./product-match.ts";
import { SharedPriceCache } from "./price-provider-cache.ts";

export const COLES_CATALOGUE_LABEL = "Coles online price guide. Choose your store on Coles to confirm local pricing and availability.";
const SEARCH_URL = "https://www.coles.com.au/search";
const MAX_BYTES = 3_000_000;
const CACHE_MS = 10 * 60 * 1000;
const MAX_CACHE = 512;
type Snapshot = { products: CatalogueProduct[]; fetchedAt: string; at: number };
const catalogueCache = new SharedPriceCache<Snapshot>(MAX_CACHE, CACHE_MS);
const backoff = new WeakMap<typeof fetch, { until: number; message: string }>();
let active = 0;
const waiters: (() => void)[] = [];

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, limit = 240): string => typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, limit) : "";

function productLink(html: string, id: string, name: string): string {
  for (const match of html.matchAll(/\bhref=["']([^"']+)["']/gi)) {
    if (!match[1].includes(`/product/`) || !match[1].split(/[?#]/)[0].endsWith(`-${id}`)) continue;
    try {
      const url = new URL(match[1].replace(/&amp;/g, "&"), "https://www.coles.com.au");
      if (url.protocol === "https:" && url.hostname === "www.coles.com.au" && !url.username && !url.password && !url.port) return url.toString();
    } catch { /* A malformed link is not used. */ }
  }
  return `${SEARCH_URL}?q=${encodeURIComponent(name)}`;
}

/** Read only the product results already published in the public search page. */
export function parseColesSearch(html: string): CatalogueProduct[] {
  if (html.length > MAX_BYTES) throw new Error("The Coles response was too large to read.");
  const script = /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script\s*>/i.exec(html);
  if (!script) throw new Error("Coles did not publish readable product results. Open Coles to check this item.");
  let parsed: unknown;
  try { parsed = JSON.parse(script[1]); } catch { throw new Error("The Coles product results could not be read."); }
  const root = record(parsed), props = record(root?.props), page = record(props?.pageProps), results = record(page?.searchResults);
  if (!results || !Array.isArray(results.results)) throw new Error("Coles did not publish readable product results. Open Coles to check this item.");
  const products: CatalogueProduct[] = [];
  const seen = new Set<string>();
  for (const entry of results.results.slice(0, 100)) {
    const row = record(entry);
    if (!row || row._type !== "PRODUCT") continue;
    const id = typeof row.id === "number" && Number.isSafeInteger(row.id) && row.id > 0 ? String(row.id) : "";
    const title = text(row.name), brand = text(row.brand), description = text(row.description, 400);
    if (!id || !title || seen.has(id)) continue;
    const pricing = record(row.pricing);
    // Use the selling price, never the comparison-unit price or a crossed-out price.
    const priceCents = pricing?.now == null ? null : audToCents(pricing.now);
    const name = description || [brand, title].filter(Boolean).join(" ");
    const available = typeof row.availability === "boolean" ? row.availability : null;
    const quantity = typeof row.availableQuantity === "number" && Number.isFinite(row.availableQuantity) ? row.availableQuantity : null;
    const product: CatalogueProduct = {
      name,
      priceCents,
      packageSize: text(row.size, 100) || null,
      stockcode: id,
      available,
      inStock: available === false ? false : quantity != null ? quantity > 0 : available,
      url: productLink(html, id, [brand, title].filter(Boolean).join(" ")),
    };
    if (isNonFoodCatalogueProduct(product)) continue;
    seen.add(id); products.push(product);
    if (products.length >= 48) break;
  }
  return products;
}

async function slot(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (active < 4) { active++; return; }
  if (waiters.length >= 16) throw new Error("Coles price checking is busy. Try this item again shortly.");
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const start = () => { cleanup(); active++; resolve(); };
    const abort = () => {
      const index = waiters.indexOf(start);
      if (index >= 0) waiters.splice(index, 1);
      cleanup();
      reject(signal?.reason ?? new DOMException("Price lookup cancelled.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    waiters.push(start);
  });
  if (signal?.aborted) { release(); signal.throwIfAborted(); }
}
function release() { active = Math.max(0, active - 1); waiters.shift()?.(); }

async function readHtml(url: string, fetchImpl: typeof fetch, signal: AbortSignal, redirects = 1): Promise<string> {
  const response = await fetchImpl(url, { redirect: "manual", signal, headers: { Accept: "text/html", "Accept-Language": "en-AU,en;q=0.9", "User-Agent": "FusionTable shopping lookup" } });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const next = new URL(response.headers.get("location") || "", url);
    if (redirects <= 0 || next.hostname !== "www.coles.com.au" || next.protocol !== "https:" || next.port || next.username || next.password) throw new Error("Coles redirected the search. Open Coles to check this item.");
    return readHtml(next.toString(), fetchImpl, signal, redirects - 1);
  }
  if (!response.ok) throw new Error("Coles is not returning prices for this search. You can open Coles directly.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The Coles product results were empty.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_BYTES) throw new Error("The Coles response was too large to read.");
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(output);
}

async function load(query: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<{ snapshot: Snapshot; cached: boolean }> {
  const key = query.toLocaleLowerCase("en-AU");
  const result = await catalogueCache.load(key, fetchImpl, async sharedSignal => {
    const before = backoff.get(fetchImpl);
    if (before && before.until > Date.now()) throw new Error(before.message);
    await slot(sharedSignal);
    try {
      const paused = backoff.get(fetchImpl);
      if (paused && paused.until > Date.now()) throw new Error(paused.message);
      const timeout = AbortSignal.timeout(12_000);
      const combined = AbortSignal.any([sharedSignal, timeout]);
      const html = await readHtml(`${SEARCH_URL}?q=${encodeURIComponent(query)}`, fetchImpl, combined);
      const snapshot = { products: parseColesSearch(html), fetchedAt: new Date().toISOString(), at: Date.now() };
      backoff.delete(fetchImpl);
      return snapshot;
    } catch (error) {
      if (!sharedSignal.aborted && !(error instanceof Error && error.name === "AbortError")) {
        const existing = backoff.get(fetchImpl);
        if (!existing || existing.until <= Date.now()) backoff.set(fetchImpl, { until: Date.now() + 60_000, message: "Coles is temporarily not returning readable prices. Open Coles directly, or retry later." });
      }
      throw error;
    } finally { release(); }
  }, signal);
  return { snapshot: result.value, cached: result.cached };
}

export async function lookupColesQuery(raw: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<PriceQuote> {
  const query = cleanSearchQuery(raw);
  const phrases = catalogueSearchPhrases(query).slice(0, 3);
  const products: CatalogueProduct[] = [];
  const seen = new Set<string>();
  const searched: string[] = [];
  let fetchedAt: string | null = null, cached = true, lastError = "";
  for (const phrase of phrases) {
    if (signal?.aborted) break;
    searched.push(phrase);
    try {
      const loaded = await load(phrase, fetchImpl, signal);
      fetchedAt = loaded.snapshot.fetchedAt; cached &&= loaded.cached;
      for (const product of loaded.snapshot.products) {
        if (seen.has(product.stockcode || product.name)) continue;
        seen.add(product.stockcode || product.name); products.push(product);
      }
      if (matchProducts(query, products).some((match) => match.selected) || products.length >= 48) break;
    } catch (error) {
      lastError = error instanceof Error && error.message.length < 240 ? error.message : "Coles prices are unavailable for this item.";
      if (signal?.aborted || (error instanceof Error && error.name === "TimeoutError")) break;
    }
  }
  return { query, source: "coles-online-catalogue", label: COLES_CATALOGUE_LABEL, fetchedAt, cached, fulfilmentStoreId: null, searched, matches: matchProducts(query, products), error: fetchedAt ? null : lastError || "Coles prices are unavailable for this item." };
}

export async function lookupColesQueries(queries: readonly string[], fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<PriceQuote[]> {
  if (queries.length < 1 || queries.length > 16) throw new Error("Check between 1 and 16 items at a time.");
  return Promise.all(queries.map((query) => lookupColesQuery(query, fetchImpl, signal)));
}
