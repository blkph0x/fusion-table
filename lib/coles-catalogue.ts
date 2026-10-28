import { cleanSearchQuery, type PriceQuote } from "./catalogue.ts";
import { audToCents, catalogueSearchPhrases, isNonFoodCatalogueProduct, matchProducts, type CatalogueProduct } from "./product-match.ts";
import { SharedPriceCache } from "./price-provider-cache.ts";
import { withDeadline } from "./abort-deadline.mjs";
import { retailerFailureStatus, shouldBackOffRetailer, type RetailerPageRenderer } from "./aldi-catalogue.ts";

export const COLES_CATALOGUE_LABEL = "Coles online price guide. Choose your store on Coles to confirm local pricing and availability.";
export const COLES_SEARCH_URL = "https://www.coles.com.au/search/products";
const SEARCH_URL = COLES_SEARCH_URL;
const MAX_BYTES = 3_000_000;
const CACHE_MS = 10 * 60 * 1000;
const MAX_CACHE = 512;
export type ColesCatalogueSnapshot = { products: CatalogueProduct[]; fetchedAt: string; at: number; storeLabel?: string; collectionMethod?: "browser" | "http" };
export type ColesNavigationReader = (query: string, signal?: AbortSignal) => Promise<ColesCatalogueSnapshot>;
type Snapshot = ColesCatalogueSnapshot;
const catalogueCache = new SharedPriceCache<Snapshot>(MAX_CACHE, CACHE_MS);
const browserCaches = new WeakMap<RetailerPageRenderer, SharedPriceCache<Snapshot>>();
const navigationCaches = new WeakMap<ColesNavigationReader, SharedPriceCache<Snapshot>>();
const backoff = new WeakMap<object, { until: number; message: string; status: NonNullable<PriceQuote["status"]> }>();
let active = 0;
const waiters: (() => void)[] = [];

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, limit = 240): string => typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, limit) : "";

function decode(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&#(x[\da-f]+|\d+);/gi, (_, n: string) => {
    const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
  }).replace(/&(?:amp|nbsp|quot|apos|lt|gt);/g, m => ({ "&amp;": "&", "&nbsp;": " ", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" })[m] || m)
    .replace(/[\u0000-\u001f\s]+/g, " ").trim();
}
function attributes(tag: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) values[match[1].toLowerCase()] = decode(match[3]);
  return values;
}
function secureColesUrl(raw: string): string {
  const url = new URL(raw, "https://www.coles.com.au");
  if (url.origin !== "https://www.coles.com.au" || url.username || url.password) throw new Error("Coles redirected the search. Open Coles to check this item.");
  return url.toString();
}

/** Deployment IDs are discovered from Coles' own public page or manifest link. */
export function parseColesBuildId(html: string): string | null {
  if (html.length > MAX_BYTES) return null;
  const script = /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script\s*>/i.exec(html);
  if (script) {
    try {
      const id = record(JSON.parse(script[1]))?.buildId;
      if (typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/.test(id)) return id;
    } catch { /* An unreadable page is not deployment evidence. */ }
  }
  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    try {
      const url = new URL(match[1], "https://www.coles.com.au");
      const id = /^\/_next\/static\/([A-Za-z0-9][A-Za-z0-9._-]{0,149})\/_buildManifest\.js$/.exec(url.pathname)?.[1];
      if (url.origin === "https://www.coles.com.au" && !url.username && !url.password && !url.search && !url.hash && id) return id;
    } catch { /* Ignore foreign or malformed script references. */ }
  }
  return null;
}

export function colesNavigationUrl(buildId: string, query: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/.test(buildId)) throw new Error("Coles' current catalogue version could not be established.");
  const url = new URL(`https://www.coles.com.au/_next/data/${buildId}/search/products.json`);
  url.searchParams.set("q", cleanSearchQuery(query));
  return url.toString();
}

function parseRenderedCards(html: string): CatalogueProduct[] | null {
  const starts = [...html.matchAll(/<section\b[^>]*\bdata-testid=["']product-tile["'][^>]*>/gi)].slice(0, 101);
  if (!starts.length) return null;
  const products: CatalogueProduct[] = [], seen = new Set<string>();
  for (let index = 0; index < Math.min(starts.length, 100); index++) {
    const card = html.slice(starts[index].index!, starts[index + 1]?.index ?? html.length);
    const anchors = [...card.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(match => ({ attrs: attributes(match[1]), body: match[2] }));
    const anchor = anchors.find(row => row.attrs.href?.includes("/product/") && row.attrs["aria-label"]?.includes(" | "))
      || anchors.find(row => row.attrs.href?.includes("/product/") && /<h2\b/i.test(row.body));
    if (!anchor) continue;
    let url: string; try { url = secureColesUrl(anchor.attrs.href); } catch { continue; }
    const id = /\/product\/[^/]+-(\d{3,24})$/.exec(new URL(url).pathname)?.[1];
    if (!id || seen.has(id)) continue;
    const title = anchor.attrs["aria-label"] || decode(anchor.body);
    const separator = title.lastIndexOf(" | ");
    const name = text(separator >= 0 ? title.slice(0, separator) : title, 400);
    let packageSize = text(separator >= 0 ? title.slice(separator + 3) : "", 100) || null;
    if (!name || /\b(?:members? (?:only|price)|membership|coupon (?:price|only))\b/i.test(decode(card))) continue;
    if (packageSize && /final price is based on weight|final cost based on weight/i.test(decode(card)) && !/approx|average|\bavg\b/i.test(packageSize)) packageSize = `approx. ${packageSize}`;
    const selling = [...card.matchAll(/<span\b([^>]*\bdata-testid=["']product-pricing["'][^>]*)>([\s\S]*?)<\/span>/gi)];
    if (selling.length !== 1) continue;
    const priceAttrs = attributes(selling[0][1]);
    const visible = /^\$(\d+(?:\.\d{1,2})?)$/.exec(decode(selling[0][2]));
    const labelled = priceAttrs["aria-label"] ? /^Price\s+\$(\d+(?:\.\d{1,2})?)$/i.exec(priceAttrs["aria-label"]) : null;
    if (!visible || (priceAttrs["aria-label"] && (!labelled || labelled[1] !== visible[1]))) continue;
    const priceCents = audToCents(visible[1]);
    if (!priceCents) continue;
    const addButton = [...card.matchAll(/<button\b[^>]*\bdata-testid=["']add-to-cart-button["'][^>]*>/gi)][0]?.[0];
    const unavailable = /\b(?:out of stock|temporarily unavailable|currently unavailable|unavailable online)\b/i.test(decode(card));
    const enabled = addButton && !/\sdisabled(?:\s|=|\/?>)/i.test(addButton) && attributes(addButton)["aria-disabled"] !== "true";
    const available = unavailable ? false : enabled ? true : null;
    const product: CatalogueProduct = { name, priceCents, packageSize, stockcode: id, inStock: available, available, url };
    if (isNonFoodCatalogueProduct(product) || /\b(?:fabric softener|laundry|detergent|body wash|shampoo|conditioner|surface cleaner)\b/i.test(name)) continue;
    seen.add(id); products.push(product); if (products.length >= 48) break;
  }
  return products;
}

function publishedStoreLabel(html: string): string | undefined {
  // This describes the retailer's own default context, never the visitor's location.
  const visible = decode(html.replace(/<script\b[\s\S]*?<\/script>/gi, ""));
  return /You[’']re seeing items for (?:delivery|collection) (?:to|at)\s+([A-Za-z][A-Za-z .'-]{1,60}\s\d{4})\b/i.exec(visible)?.[1];
}

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
  const rendered = parseRenderedCards(html);
  if (rendered) return rendered;
  const script = /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script\s*>/i.exec(html);
  if (!script) throw new Error("Coles did not publish readable product results. Open Coles to check this item.");
  let parsed: unknown;
  try { parsed = JSON.parse(script[1]); } catch { throw new Error("The Coles product results could not be read."); }
  const root = record(parsed), props = record(root?.props);
  return parseColesProductData(record(props?.pageProps), html);
}

/** Same public product schema returned by Next.js client navigation. */
export function parseColesNavigationData(payload: unknown): CatalogueProduct[] {
  const root = record(payload);
  return parseColesProductData(record(root?.pageProps), "");
}

function parseColesProductData(page: Record<string, unknown> | null, html: string): CatalogueProduct[] {
  const results = record(page?.searchResults);
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
    const unit = record(pricing?.unit);
    let packageSize = text(row.size, 100) || null;
    if (unit?.isWeighted === true && packageSize && !/approx|average|\bavg\b/i.test(packageSize)) packageSize = `approx. ${packageSize}`;
    const product: CatalogueProduct = {
      name,
      priceCents,
      packageSize,
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

async function readHtml(url: string, fetchImpl: typeof fetch, signal: AbortSignal, redirects = 1, renderer?: RetailerPageRenderer): Promise<string> {
  if (renderer) {
    const page = await renderer(url, signal);
    secureColesUrl(page.url);
    if (page.status != null && (page.status < 200 || page.status >= 300)) throw Object.assign(new Error("Coles is not returning prices in the browser. Open Coles directly."), { retailerRefusal: [401, 403, 429].includes(page.status) });
    if (new TextEncoder().encode(page.html).byteLength > MAX_BYTES) throw new Error("The Coles response was too large to read.");
    return page.html;
  }
  const response = await fetchImpl(url, { redirect: "manual", signal, headers: { Accept: "text/html", "Accept-Language": "en-AU,en;q=0.9", "User-Agent": "FusionTable shopping lookup" } });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const next = new URL(response.headers.get("location") || "", url);
    if (redirects <= 0 || next.hostname !== "www.coles.com.au" || next.protocol !== "https:" || next.port || next.username || next.password) throw new Error("Coles redirected the search. Open Coles to check this item.");
    return readHtml(next.toString(), fetchImpl, signal, redirects - 1);
  }
  if (!response.ok) throw Object.assign(new Error("Coles is not returning prices for this search. You can open Coles directly."), { retailerRefusal: [401, 403, 429].includes(response.status) });
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

async function load(query: string, fetchImpl: typeof fetch, signal?: AbortSignal, renderer?: RetailerPageRenderer, navigation?: ColesNavigationReader): Promise<{ snapshot: Snapshot; cached: boolean }> {
  const key = query.toLocaleLowerCase("en-AU");
  let selectedCache = catalogueCache;
  if (renderer) { selectedCache = browserCaches.get(renderer) || new SharedPriceCache<Snapshot>(MAX_CACHE, CACHE_MS); browserCaches.set(renderer, selectedCache); }
  if (navigation) { selectedCache = navigationCaches.get(navigation) || new SharedPriceCache<Snapshot>(MAX_CACHE, CACHE_MS); navigationCaches.set(navigation, selectedCache); }
  const identity = navigation || renderer || fetchImpl;
  const result = await selectedCache.load(key, fetchImpl, async sharedSignal => {
    const before = backoff.get(identity);
    if (before && before.until > Date.now()) throw Object.assign(new Error(before.message), { providerStatus: before.status });
    await slot(sharedSignal);
    try {
      const paused = backoff.get(identity);
      if (paused && paused.until > Date.now()) throw Object.assign(new Error(paused.message), { providerStatus: paused.status });
      if (navigation) {
        const snapshot = await withDeadline(32_000, [sharedSignal], boundedSignal => navigation(query, boundedSignal));
        backoff.delete(identity);
        return snapshot;
      }
      const html = await withDeadline(renderer ? 32_000 : 12_000, [sharedSignal], boundedSignal => readHtml(`${SEARCH_URL}?q=${encodeURIComponent(query)}`, fetchImpl, boundedSignal, 1, renderer));
      const snapshot = { products: parseColesSearch(html), fetchedAt: new Date().toISOString(), at: Date.now(), storeLabel: publishedStoreLabel(html), collectionMethod: renderer ? "browser" as const : "http" as const };
      backoff.delete(identity);
      return snapshot;
    } catch (error) {
      if (!sharedSignal.aborted && shouldBackOffRetailer(error)) {
        const existing = backoff.get(identity);
        if (!existing || existing.until <= Date.now()) backoff.set(identity, { until: Date.now() + 60_000, message: "Coles is temporarily not returning readable prices. Open Coles directly, or retry later.", status: retailerFailureStatus(error, "needs-browser") });
      }
      throw error;
    } finally { release(); }
  }, signal);
  return { snapshot: result.value, cached: result.cached };
}

export async function lookupColesQuery(raw: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal, renderer?: RetailerPageRenderer, navigation?: ColesNavigationReader): Promise<PriceQuote> {
  const query = cleanSearchQuery(raw);
  const phrases = catalogueSearchPhrases(query).slice(0, 3);
  const products: CatalogueProduct[] = [];
  const seen = new Set<string>();
  const searched: string[] = [];
  let fetchedAt: string | null = null, cached = true, lastError = "", storeLabel: string | undefined, collectionMethod: "browser" | "http" = navigation ? "http" : renderer ? "browser" : "http", failureStatus: NonNullable<PriceQuote["status"]> = "needs-browser";
  for (const phrase of phrases) {
    if (signal?.aborted) break;
    searched.push(phrase);
    try {
      const loaded = await load(phrase, fetchImpl, signal, renderer, navigation);
      fetchedAt = loaded.snapshot.fetchedAt; cached &&= loaded.cached;
      storeLabel = loaded.snapshot.storeLabel;
      collectionMethod = loaded.snapshot.collectionMethod || collectionMethod;
      for (const product of loaded.snapshot.products) {
        if (seen.has(product.stockcode || product.name)) continue;
        seen.add(product.stockcode || product.name); products.push(product);
      }
      if (matchProducts(query, products).some(match => match.priceCents != null && (match.selected || match.nameMatched || match.nameReviewable && match.score >= 40)) || products.length >= 48) break;
    } catch (error) {
      lastError = error instanceof Error && error.message.length < 240 ? error.message : "Coles prices are unavailable for this item.";
      failureStatus = retailerFailureStatus(error, failureStatus);
      // Alternate wording cannot resolve a failed browser/transport check.
      // Only successful empty searches try a different ingredient phrase.
      break;
    }
  }
  return { query, source: "coles-online-catalogue", label: COLES_CATALOGUE_LABEL, retailerName: "Coles", scope: "chain-online", collectionMethod, storeLabel, status: fetchedAt ? "ready" : failureStatus, fetchedAt, cached, fulfilmentStoreId: null, searched, matches: matchProducts(query, products), error: fetchedAt ? null : lastError || "Coles prices are unavailable for this item." };
}

export async function lookupColesQueries(queries: readonly string[], fetchImpl: typeof fetch = fetch, signal?: AbortSignal, renderer?: RetailerPageRenderer, navigation?: ColesNavigationReader, onQuote?: (quote: PriceQuote) => void): Promise<PriceQuote[]> {
  if (queries.length < 1 || queries.length > 16) throw new Error("Check between 1 and 16 items at a time.");
  return Promise.all(queries.map(async query => {
    const quote = await lookupColesQuery(query, fetchImpl, signal, renderer, navigation);
    if (!signal?.aborted) onQuote?.(quote);
    return quote;
  }));
}
