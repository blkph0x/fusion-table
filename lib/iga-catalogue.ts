import { cleanSearchQuery, type PriceQuote } from "./catalogue.ts";
import { audToCents, catalogueSearchPhrases, isNonFoodCatalogueProduct, matchProducts, type CatalogueProduct } from "./product-match.ts";
import { SharedPriceCache } from "./price-provider-cache.ts";
import { retailerFailureStatus, shouldBackOffRetailer, type RetailerPageRenderer, type RetailerSelectedStore } from "./aldi-catalogue.ts";

export interface IgaStoreContext { id: string; name: string; website: string; area: string; address?: string | null; lat?: number; lon?: number }
export const IGA_CATALOGUE_LABEL = "IGA stores set their own prices. Select the matching local store on IGA before using its published price guide.";
const ORIGIN = "https://www.igashop.com.au";
const MAX_BYTES = 3_000_000;
type Snapshot = { products: CatalogueProduct[]; fetchedAt: string; storeLabel: string };
const cache = new SharedPriceCache<Snapshot>(512, 10 * 60_000);
const browserCaches = new WeakMap<RetailerPageRenderer, SharedPriceCache<Snapshot>>();
const backoffs = new WeakMap<object, { until: number; status: NonNullable<PriceQuote["status"]> }>();
let active = 0;
const waiters: (() => void)[] = [];
function decode(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&#(x[\da-f]+|\d+);/gi, (_, n: string) => {
    const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
  }).replace(/&(?:amp|nbsp|quot|apos|lt|gt);/g, m => ({ "&amp;": "&", "&nbsp;": " ", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" })[m] || m)
    .replace(/[\u0000-\u001f\s]+/g, " ").trim();
}
const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en-AU").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
function safeUrl(raw: string): string {
  const url = new URL(raw.replace(/&amp;/g, "&"), ORIGIN);
  if (url.origin !== ORIGIN || url.username || url.password) throw new Error("IGA redirected outside its official shopping website.");
  return url.toString();
}

function selectedStoreContext(expected: IgaStoreContext, selected?: RetailerSelectedStore): IgaStoreContext {
  // Canonical retailer names may differ from OpenStreetMap labels. Only trusted
  // browser metadata bound to this requested shop may supply the canonical name;
  // the worker separately proves the chooser card's exact street and postcode.
  if (!selected || selected.id !== expected.id || typeof selected.name !== "string" || !selected.name.trim() || selected.name.length > 160
    || typeof selected.address !== "string" || !selected.address.trim() || selected.address.length > 500
    || /[<>\u0000-\u001f\u007f]/.test(selected.name + selected.address)
    || selected.retailerStoreId !== undefined && !/^[A-Za-z0-9_-]{1,80}$/.test(selected.retailerStoreId)) return expected;
  return { ...expected, name: selected.name.trim(), address: selected.address.trim() };
}

/** Require the selected header, not a generic product's default-store availability. */
export function verifyIgaStore(html: string, expected: IgaStoreContext, selected?: RetailerSelectedStore): boolean {
  if (html.length > MAX_BYTES || !expected.id || !expected.name || !expected.area) return false;
  try { safeUrl(expected.website); } catch { return false; }
  const header = /<header\b[^>]*>([\s\S]*?)<\/header>/i.exec(html)?.[1];
  if (!header) return false;
  const selection = /data-test-id=["']header-store-select["']([\s\S]*?)data-test-id=["']header-store-select-button["']/i.exec(header)?.[1];
  if (!selection || /no store selected/i.test(decode(selection))) return false;
  const labels = [...selection.matchAll(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi)].map(match => decode(match[1]));
  return labels.length >= 2 && normalized(labels[labels.length - 1]) === normalized(selectedStoreContext(expected, selected).name);
}

/** Use rendered cards: IGA's hydration JSON can retain a different default store. */
export function parseIgaSearch(html: string, store: IgaStoreContext, selected?: RetailerSelectedStore): CatalogueProduct[] {
  if (html.length > MAX_BYTES) throw new Error("The IGA response was too large to read.");
  if (!verifyIgaStore(html, store, selected)) throw new Error("Select the matching IGA store before checking its prices.");
  const starts = [...html.matchAll(/<div\b[^>]*data-product-card=["']true["'][^>]*>/gi)].slice(0, 101);
  if (!starts.length && !/no (?:products|results)|0 (?:products|results)/i.test(decode(html.replace(/<script\b[\s\S]*?<\/script>/gi, "")))) throw new Error("IGA did not publish readable product results. Open your IGA store directly.");
  const products: CatalogueProduct[] = [], seen = new Set<string>();
  for (let index = 0; index < Math.min(starts.length, 100); index++) {
    const card = html.slice(starts[index].index!, starts[index + 1]?.index ?? html.length);
    const anchor = /<a\b(?=[^>]*\bdata-variant=["']link["'])(?=[^>]*\bhref=(["'])([^<>]*?)\1)[^>]*>([\s\S]*?)<\/a>/i.exec(card);
    if (!anchor) continue;
    const spans = [...anchor[3].matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map(match => decode(match[1]));
    const name = spans[0]?.slice(0, 240), packageText = spans[1]?.slice(0, 100) || null;
    if (!name || /\b(?:member(?:s|ship)?|coupon|voucher|buy\s+\d|multibuy|multi-buy)\b/i.test(decode(card))) continue;
    const selling = [...card.matchAll(/<span\b[^>]*class=["'](?=[^"']*\bleading-none\b)(?=[^"']*\bfont-bold\b)[^"']*["'][^>]*>\s*\$(\d+(?:\.\d{1,2})?)\s*<\/span>/gi)];
    if (selling.length !== 1) continue;
    const priceCents = audToCents(selling[0][1]);
    let url: string; try { url = safeUrl(anchor[2]); } catch { continue; }
    const id = /\/product\/[^/]+-(\d{3,24})$/.exec(new URL(url).pathname)?.[1];
    if (!id || !priceCents || seen.has(id)) continue;
    // Average pack weights are not exact sellable quantities. Preserve the warning
    // so shopping arithmetic cannot silently turn them into fixed packs or rates.
    const average = /\bavg\b|final cost based on weight|sold by weight/i.test(decode(card));
    const product: CatalogueProduct = { name, priceCents, packageSize: packageText && average ? `approx. ${packageText}` : packageText, stockcode: id, url, available: null, inStock: /\bout of stock\b|\bunavailable\b/i.test(decode(card)) ? false : null };
    if (isNonFoodCatalogueProduct(product)) continue;
    seen.add(id); products.push(product); if (products.length >= 48) break;
  }
  return products;
}

async function acquire(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted(); if (active < 3) { active++; return; }
  if (waiters.length >= 16) throw new Error("IGA price checking is busy. Please retry shortly.");
  await new Promise<void>((resolve, reject) => {
    const start = () => { signal.removeEventListener("abort", abort); active++; resolve(); };
    const abort = () => { const i = waiters.indexOf(start); if (i >= 0) waiters.splice(i, 1); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true }); waiters.push(start);
  });
  if (signal.aborted) { release(); signal.throwIfAborted(); }
}
function release() { active = Math.max(0, active - 1); waiters.shift()?.(); }
async function read(url: string, fetchImpl: typeof fetch, signal: AbortSignal, renderer?: RetailerPageRenderer, redirects = 1): Promise<{ html: string; selectedStore?: RetailerSelectedStore }> {
  if (renderer) {
    const page = await renderer(url, signal); safeUrl(page.url);
    if (page.status != null && (page.status < 200 || page.status >= 300)) throw Object.assign(new Error("IGA is not returning prices in the browser. Open IGA directly."), { retailerRefusal: [401, 403, 429].includes(page.status) });
    if (new TextEncoder().encode(page.html).byteLength > MAX_BYTES) throw new Error("The IGA response was too large to read.");
    return { html: page.html, selectedStore: page.selectedStore };
  }
  const response = await fetchImpl(url, { redirect: "manual", signal, headers: { Accept: "text/html", "Accept-Language": "en-AU,en;q=0.9", "User-Agent": "FusionTable shopping lookup" } });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (!redirects) throw new Error("IGA redirected the search too many times.");
    return read(safeUrl(new URL(response.headers.get("location") || "", url).toString()), fetchImpl, signal, undefined, redirects - 1);
  }
  if (!response.ok) throw Object.assign(new Error("IGA is not returning prices. Open your IGA store directly."), { retailerRefusal: [401, 403, 429].includes(response.status) });
  const reader = response.body?.getReader(); if (!reader) throw new Error("IGA returned an empty page.");
  let size = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > MAX_BYTES) throw new Error("The IGA response was too large to read."); chunks.push(part.value); } }
  finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { html: new TextDecoder().decode(bytes) };
}
async function load(query: string, store: IgaStoreContext, fetchImpl: typeof fetch, signal?: AbortSignal, renderer?: RetailerPageRenderer) {
  let selectedCache = cache;
  if (renderer) { selectedCache = browserCaches.get(renderer) || new SharedPriceCache<Snapshot>(512, 10 * 60_000); browserCaches.set(renderer, selectedCache); }
  const key = JSON.stringify([store.id, normalized(store.name), store.area, store.address || "", store.lat, store.lon, query.toLocaleLowerCase("en-AU")]), identity = renderer || fetchImpl;
  return selectedCache.load(key, fetchImpl, async sharedSignal => {
    const before = backoffs.get(identity);
    if (before && before.until > Date.now()) throw Object.assign(new Error("IGA is temporarily not returning readable prices. Open IGA directly, or retry later."), { providerStatus: before.status });
    await acquire(sharedSignal);
    try {
      const paused = backoffs.get(identity);
      if (paused && paused.until > Date.now()) throw Object.assign(new Error("IGA is temporarily not returning readable prices. Retry later."), { providerStatus: paused.status });
      const page = await read(`${ORIGIN}/search?q=${encodeURIComponent(query)}`, fetchImpl, AbortSignal.any([sharedSignal, AbortSignal.timeout(renderer ? 32_000 : 15_000)]), renderer);
      const products = parseIgaSearch(page.html, store, page.selectedStore); backoffs.delete(identity);
      return { products, fetchedAt: new Date().toISOString(), storeLabel: selectedStoreContext(store, page.selectedStore).name };
    } catch (error) {
      // A different/no selected store is a context mismatch, not a provider outage.
      if (!sharedSignal.aborted && shouldBackOffRetailer(error)) backoffs.set(identity, { until: Date.now() + 60_000, status: retailerFailureStatus(error, renderer ? "unavailable" : "needs-browser") });
      throw error;
    } finally { release(); }
  }, signal);
}
export async function lookupIgaQuery(raw: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal, renderer?: RetailerPageRenderer, store?: IgaStoreContext): Promise<PriceQuote> {
  const query = cleanSearchQuery(raw), products: CatalogueProduct[] = [], searched: string[] = [], seen = new Set<string>();
  const base = { query, source: "iga-online-catalogue" as const, label: IGA_CATALOGUE_LABEL, retailerName: "IGA", scope: "selected-store" as const, collectionMethod: renderer ? "browser" as const : "http" as const, fulfilmentStoreId: null };
  if (!store || !store.id || !store.name || !store.area) return { ...base, status: "needs-store", fetchedAt: null, cached: false, searched, matches: [], error: "Select your local IGA store to check its own prices. IGA stores price independently." };
  let fetchedAt: string | null = null, cached = true, error: string | null = null, storeLabel = store.name, failureStatus: NonNullable<PriceQuote["status"]> = renderer ? "unavailable" : "needs-browser";
  for (const phrase of catalogueSearchPhrases(query).slice(0, 3)) {
    if (signal?.aborted) break; searched.push(phrase);
    try {
      const loaded = await load(phrase, store, fetchImpl, signal, renderer); fetchedAt = loaded.value.fetchedAt; cached &&= loaded.cached; storeLabel = loaded.value.storeLabel;
      for (const product of loaded.value.products) if (!seen.has(product.stockcode!)) { seen.add(product.stockcode!); products.push(product); }
      if (matchProducts(query, products).some(match => match.priceCents != null && (match.selected || match.nameMatched || match.nameReviewable && match.score >= 40)) || products.length >= 48) break;
    } catch (cause) { error = cause instanceof Error ? cause.message.slice(0, 240) : "IGA prices are unavailable."; failureStatus = retailerFailureStatus(cause, failureStatus); break; }
  }
  return { ...base, shop: { ...store, name: storeLabel }, storeLabel, fulfilmentStoreId: fetchedAt ? store.id : null, status: fetchedAt ? "ready" : /matching IGA store/.test(error || "") ? "needs-store" : failureStatus, fetchedAt, cached, searched, matches: matchProducts(query, products), error: fetchedAt ? null : error || "IGA prices are unavailable." };
}
export async function lookupIgaQueries(queries: readonly string[], fetchImpl: typeof fetch = fetch, signal?: AbortSignal, renderer?: RetailerPageRenderer, store?: IgaStoreContext): Promise<PriceQuote[]> {
  if (!queries.length || queries.length > 16) throw new Error("Check between 1 and 16 items at a time.");
  return Promise.all(queries.map(query => lookupIgaQuery(query, fetchImpl, signal, renderer, store)));
}
