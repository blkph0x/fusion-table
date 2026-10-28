import { cleanSearchQuery, type PriceQuote } from "./catalogue.ts";
import { audToCents, catalogueSearchPhrases, isNonFoodCatalogueProduct, matchProducts, type CatalogueProduct } from "./product-match.ts";
import { SharedPriceCache } from "./price-provider-cache.ts";
import { withDeadline } from "./abort-deadline.mjs";

/** Returned only after the browser matches a chooser card's street and postcode. */
export interface RetailerSelectedStore { id: string; name: string; address: string; retailerStoreId?: string }
export type RetailerPageRenderer = (url: string, signal?: AbortSignal) => Promise<{ html: string; url: string; status?: number; selectedStore?: RetailerSelectedStore }>;
export const ALDI_CATALOGUE_LABEL = "ALDI published online price guide. Store pricing and stock must be checked with ALDI; this is not a local shelf check.";
const ORIGIN = "https://www.aldi.com.au";
const MAX_BYTES = 3_000_000;
type Snapshot = { products: CatalogueProduct[]; fetchedAt: string };
const cache = new SharedPriceCache<Snapshot>(512, 10 * 60_000);
const browserCaches = new WeakMap<RetailerPageRenderer, SharedPriceCache<Snapshot>>();
const backoffs = new WeakMap<object, { until: number; status: NonNullable<PriceQuote["status"]> }>();
let active = 0;
const waiters: (() => void)[] = [];

export function retailerFailureStatus(error: unknown, fallback: NonNullable<PriceQuote["status"]>): NonNullable<PriceQuote["status"]> {
  const status = error && typeof error === "object" && "providerStatus" in error ? error.providerStatus : null;
  return status === "needs-browser" || status === "needs-store" || status === "unavailable" || status === "not-configured" ? status : fallback;
}

/** Host capacity and caller deadlines are not evidence that a retailer refused us. */
export function shouldBackOffRetailer(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (["AbortError", "TimeoutError"].includes(error.name) || /\b(?:busy|queue|timed? out|timeout|deadline|cancelled|canceled)\b/i.test(error.message)) return false;
  const status = retailerFailureStatus(error, "unavailable");
  if (status === "needs-store") return false;
  if (status === "needs-browser" || status === "not-configured") return true;
  if ("retailerRefusal" in error && error.retailerRefusal === true) return true;
  return /readable product results|product results could not be read|response was too large|returned an empty page|product results were empty|browser returned an unreadable response/i.test(error.message);
}

function decode(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&#(x[\da-f]+|\d+);/gi, (_, n: string) => {
    const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
  }).replace(/&(?:amp|nbsp|quot|apos|lt|gt);/g, m => ({ "&amp;": "&", "&nbsp;": " ", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" })[m] || m)
    .replace(/[\u0000-\u001f\s]+/g, " ").trim();
}
function safeUrl(raw: string): string {
  const url = new URL(raw.replace(/&amp;/g, "&"), ORIGIN);
  if (url.origin !== ORIGIN || url.username || url.password) throw new Error("ALDI redirected outside its official Australian website.");
  return url.toString();
}
function field(card: string, key: string): string {
  return decode(new RegExp(`<div\\b[^>]*data-test=["']product-tile__${key}["'][^>]*>([\\s\\S]*?)<\\/div\\s*>`, "i").exec(card)?.[1] || "").slice(0, 400);
}

/** Parse visible, current selling-price fields, never comparison rates or future specials. */
export function parseAldiSearch(html: string): CatalogueProduct[] {
  if (html.length > MAX_BYTES) throw new Error("The ALDI response was too large to read.");
  const starts = [...html.matchAll(/<div\b[^>]*\bid=["']product-tile-(\d{4,24})["'][^>]*>/gi)].slice(0, 101);
  if (!starts.length && !/no (?:products|results)|couldn.t find|0 (?:products|results)/i.test(decode(html.replace(/<script\b[\s\S]*?<\/script>/gi, "")))) {
    throw new Error("ALDI did not publish readable product results. Open ALDI to check this item.");
  }
  const products: CatalogueProduct[] = [], seen = new Set<string>();
  for (let index = 0; index < Math.min(starts.length, 100); index++) {
    const start = starts[index], id = start[1];
    const card = html.slice(start.index!, starts[index + 1]?.index ?? html.length);
    if (seen.has(id) || field(card, "on-sale-label")) continue;
    const name = [field(card, "brandname"), field(card, "name")].filter(Boolean).join(" ");
    const packageSize = field(card, "unit-of-measurement") || null;
    if (!name || /\b(?:members?|membership|coupon|voucher|buy\s+\d|multibuy|multi-buy)\b/i.test(decode(card))) continue;
    // The observed regular-price span is the current selling price. Unknown discount
    // layouts are refused rather than treating a comparison/previous price as payable.
    const prices = [...card.matchAll(/<span\b[^>]*class=["'][^"']*\bbase-price__regular\b[^"']*["'][^>]*>\s*<span\b[^>]*>\s*\$(\d+(?:\.\d{1,2})?)\s*<\/span>/gi)];
    if (prices.length !== 1 || /base-price__(?:old|was|previous|reduced|discounted|strikethrough)|<del\b|<s\b/i.test(card)) continue;
    const priceCents = audToCents(prices[0][1]);
    const href = /<a\b[^>]*\bhref=(["'])([^<>]*?\/product\/[^<>]*?)\1/i.exec(card)?.[2];
    if (!href || !priceCents) continue;
    let url: string;
    try { url = safeUrl(href); } catch { continue; }
    if (!new URL(url).pathname.endsWith(`-${id}`)) continue;
    const product: CatalogueProduct = { name, packageSize, priceCents, stockcode: id, inStock: null, available: null, url };
    if (isNonFoodCatalogueProduct(product) || /\b(?:fabric softener|laundry|detergent|body wash|shampoo|conditioner|surface cleaner)\b/i.test(name)) continue;
    seen.add(id); products.push(product);
    if (products.length >= 48) break;
  }
  return products;
}

async function acquire(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (active < 4) { active++; return; }
  if (waiters.length >= 16) throw new Error("ALDI price checking is busy. Please retry shortly.");
  await new Promise<void>((resolve, reject) => {
    const start = () => { signal.removeEventListener("abort", abort); active++; resolve(); };
    const abort = () => { const i = waiters.indexOf(start); if (i >= 0) waiters.splice(i, 1); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true }); waiters.push(start);
  });
  if (signal.aborted) { release(); signal.throwIfAborted(); }
}
function release() { active = Math.max(0, active - 1); waiters.shift()?.(); }

async function read(url: string, fetchImpl: typeof fetch, signal: AbortSignal, renderer?: RetailerPageRenderer, redirects = 1): Promise<string> {
  if (renderer) {
    const page = await renderer(url, signal);
    safeUrl(page.url);
    if (page.status != null && (page.status < 200 || page.status >= 300)) throw Object.assign(new Error("ALDI is not returning prices in the browser. Open ALDI directly."), { retailerRefusal: [401, 403, 429].includes(page.status) });
    if (new TextEncoder().encode(page.html).byteLength > MAX_BYTES) throw new Error("The ALDI response was too large to read.");
    return page.html;
  }
  const response = await fetchImpl(url, { signal, redirect: "manual", headers: { Accept: "text/html", "Accept-Language": "en-AU,en;q=0.9", "User-Agent": "FusionTable shopping lookup" } });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirects <= 0) throw new Error("ALDI redirected the search too many times.");
    return read(safeUrl(new URL(response.headers.get("location") || "", url).toString()), fetchImpl, signal, undefined, redirects - 1);
  }
  if (!response.ok) throw Object.assign(new Error("ALDI is not returning prices. Open ALDI directly."), { retailerRefusal: [401, 403, 429].includes(response.status) });
  const reader = response.body?.getReader();
  if (!reader) throw new Error("ALDI returned an empty page.");
  let size = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > MAX_BYTES) throw new Error("The ALDI response was too large to read."); chunks.push(part.value); } }
  finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function load(query: string, fetchImpl: typeof fetch, signal?: AbortSignal, renderer?: RetailerPageRenderer) {
  let selectedCache = cache;
  if (renderer) { selectedCache = browserCaches.get(renderer) || new SharedPriceCache<Snapshot>(512, 10 * 60_000); browserCaches.set(renderer, selectedCache); }
  const identity = renderer || fetchImpl;
  return selectedCache.load(query.toLocaleLowerCase("en-AU"), fetchImpl, async sharedSignal => {
    const before = backoffs.get(identity);
    if (before && before.until > Date.now()) throw Object.assign(new Error("ALDI is temporarily not returning readable prices. Open ALDI directly, or retry later."), { providerStatus: before.status });
    await acquire(sharedSignal);
    try {
      const paused = backoffs.get(identity);
      if (paused && paused.until > Date.now()) throw Object.assign(new Error("ALDI is temporarily not returning readable prices. Retry later."), { providerStatus: paused.status });
      const html = await withDeadline(renderer ? 32_000 : 15_000, [sharedSignal], boundedSignal => read(`${ORIGIN}/results?q=${encodeURIComponent(query)}`, fetchImpl, boundedSignal, renderer));
      const products = parseAldiSearch(html);
      backoffs.delete(identity);
      return { products, fetchedAt: new Date().toISOString() };
    } catch (error) {
      if (!sharedSignal.aborted && shouldBackOffRetailer(error)) backoffs.set(identity, { until: Date.now() + 60_000, status: retailerFailureStatus(error, renderer ? "unavailable" : "needs-browser") });
      throw error;
    } finally { release(); }
  }, signal);
}

export async function lookupAldiQuery(raw: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal, renderer?: RetailerPageRenderer): Promise<PriceQuote> {
  const query = cleanSearchQuery(raw), products: CatalogueProduct[] = [], searched: string[] = [], seen = new Set<string>();
  let fetchedAt: string | null = null, cached = true, error: string | null = null, failureStatus: NonNullable<PriceQuote["status"]> = renderer ? "unavailable" : "needs-browser";
  for (const phrase of catalogueSearchPhrases(query).slice(0, 3)) {
    if (signal?.aborted) break;
    searched.push(phrase);
    try {
      const loaded = await load(phrase, fetchImpl, signal, renderer); fetchedAt = loaded.value.fetchedAt; cached &&= loaded.cached;
      for (const product of loaded.value.products) { if (!seen.has(product.stockcode!)) { seen.add(product.stockcode!); products.push(product); } }
      if (matchProducts(query, products).some(match => match.priceCents != null && (match.selected || match.nameMatched || match.nameReviewable && match.score >= 40)) || products.length >= 48) break;
    } catch (cause) { error = cause instanceof Error ? cause.message.slice(0, 240) : "ALDI prices are unavailable."; failureStatus = retailerFailureStatus(cause, failureStatus); break; }
  }
  return { query, source: "aldi-online-catalogue", label: ALDI_CATALOGUE_LABEL, retailerName: "ALDI", scope: "chain-online", collectionMethod: renderer ? "browser" : "http", status: fetchedAt ? "ready" : failureStatus, fetchedAt, cached, fulfilmentStoreId: null, searched, matches: matchProducts(query, products), error: fetchedAt ? null : error || "ALDI prices are unavailable." };
}
export async function lookupAldiQueries(queries: readonly string[], fetchImpl: typeof fetch = fetch, signal?: AbortSignal, renderer?: RetailerPageRenderer, onQuote?: (quote: PriceQuote) => void): Promise<PriceQuote[]> {
  if (!queries.length || queries.length > 16) throw new Error("Check between 1 and 16 items at a time.");
  return Promise.all(queries.map(async query => {
    const quote = await lookupAldiQuery(query, fetchImpl, signal, renderer);
    if (!signal?.aborted) onQuote?.(quote);
    return quote;
  }));
}
