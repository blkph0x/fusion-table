import type { PriceQuote } from "./catalogue.ts";
import type { ItemQuote } from "./price-memory.ts";
import { buildShoppingOffers, summarizeShoppingCosts } from "./shopping-costs.ts";
import { australianPriceGuide, type ShoppingPriceRequest } from "./shopping-request.ts";

export type ShoppingQuoteObserver = (quote: PriceQuote) => void;
type RetailerLookup = (queries: readonly string[], signal?: AbortSignal, onQuote?: ShoppingQuoteObserver) => Promise<PriceQuote[]>;
export interface ShoppingLocalProgress { quotes: PriceQuote[]; warnings: string[]; checkedShops: { id: string; name: string; website?: string | null }[] }
export type ShoppingLocalObserver = (snapshot: ShoppingLocalProgress) => void;
interface Dependencies {
  woolworths: RetailerLookup;
  coles: RetailerLookup;
  aldi?: RetailerLookup;
  iga?: RetailerLookup;
  local?: (request: ShoppingPriceRequest, signal?: AbortSignal, onProgress?: ShoppingLocalObserver) => Promise<ShoppingLocalProgress>;
  recorded: (area: string, items: readonly string[], today: string) => Promise<ItemQuote[]>;
  now?: () => Date;
}

export interface ShoppingProviderStatus {
  id: string; name: string; status: NonNullable<PriceQuote["status"]>; message: string;
  url?: string; shopId?: string; shopName?: string;
}
const RETAILERS = [
  { id: "woolworths", name: "Woolworths", url: "https://www.woolworths.com.au/" },
  { id: "coles", name: "Coles", url: "https://www.coles.com.au/" },
  { id: "aldi", name: "ALDI", url: "https://www.aldi.com.au/results" },
  { id: "iga", name: "IGA", url: "https://www.igashop.com.au/" },
] as const;

/** Stop waiting for an uncooperative provider without cancelling shared map work. */
function untilAbort<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return task;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("Price check cancelled.", "AbortError"));
    if (signal.aborted) { task.catch(() => undefined); abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    task.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Price providers fail independently; a partial result is useful without becoming a full-basket claim. */
export async function compareShopping(request: ShoppingPriceRequest, deps: Dependencies, signal?: AbortSignal) {
  const now = deps.now?.() ?? new Date();
  const names = [...new Set(request.lines.map((line) => line.name))];
  const queries = names.filter((name) => name.length <= 80);
  const online = request.online && australianPriceGuide(request.country) && queries.length > 0;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  let localProgress: ShoppingLocalProgress | undefined, acceptingLocal = true;
  const rememberLocal: ShoppingLocalObserver = snapshot => {
    if (!acceptingLocal || signal?.aborted) return;
    try {
      const copy = structuredClone(snapshot), shops = new Map(copy.checkedShops.map(shop => [shop.id, shop]));
      copy.quotes = copy.quotes.filter(quote => quote.source === "local-shop-website" && queries.includes(quote.query)
        && quote.shop && quote.shop.area === request.area && shops.get(quote.shop.id)?.name === quote.shop.name
        && (!shops.get(quote.shop.id)?.website || shops.get(quote.shop.id)?.website === quote.shop.website));
      localProgress = copy;
    } catch { /* Invalid progress does not replace completed local evidence. */ }
  };
  // Start specialist discovery first. It shares the map search with IGA, and
  // nearby produce/meat pages should not wait behind repeated chain searches.
  const localTask = online && request.location && deps.local ? Promise.resolve().then(() => { signal?.throwIfAborted(); return deps.local!(request, signal, rememberLocal); }).then(result => { rememberLocal(result); return result; }).finally(() => { acceptingLocal = false; }) : Promise.resolve({ quotes: [] as PriceQuote[], warnings: [] as string[], checkedShops: [] as {id:string;name:string;website?:string|null}[] });
  const incremental = new Map<number, { source: PriceQuote["source"]; name: string; quotes: Map<string, PriceQuote> }>();
  const cleanQuery = (value: string) => value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  const retailerTask = (index: number, guide: typeof RETAILERS[number], lookup?: RetailerLookup) => {
    if (!online || !lookup) return Promise.resolve([] as PriceQuote[]);
    const collected = { source: `${guide.id}-online-catalogue` as PriceQuote["source"], name: guide.name, quotes: new Map<string, PriceQuote>() };
    incremental.set(index, collected);
    let accepting = true;
    const remember: ShoppingQuoteObserver = quote => {
      if (!accepting || signal?.aborted || quote?.source !== collected.source || typeof quote.query !== "string") return;
      for (const query of queries) if (cleanQuery(query) === cleanQuery(quote.query)) {
        // Snapshot completed evidence: later callbacks or object mutation cannot
        // alter a quote after the provider's deadline or settlement.
        try { collected.quotes.set(query, { ...structuredClone(quote), query }); } catch { /* Invalid internal evidence is not a usable quote. */ }
      }
    };
    const task = Promise.resolve().then(() => { signal?.throwIfAborted(); return lookup(queries, signal, remember); }).then(quotes => {
      for (const quote of quotes) if (!collected.quotes.has(quote.query)) remember(quote);
      return quotes;
    });
    return untilAbort(task, signal).finally(() => { accepting = false; });
  };
  const tasks = [
    retailerTask(0, RETAILERS[0], deps.woolworths),
    retailerTask(1, RETAILERS[1], deps.coles),
    request.localRecords !== false && australianPriceGuide(request.country) ? Promise.resolve().then(() => deps.recorded(request.area, names, today)) : Promise.resolve([] as ItemQuote[]),
    retailerTask(3, RETAILERS[2], deps.aldi),
    retailerTask(4, RETAILERS[3], deps.iga),
    localTask,
  ];
  const sources = await Promise.allSettled(tasks.map((task, index) => incremental.has(index) ? task : untilAbort<unknown>(task, signal)));
  acceptingLocal = false;
  const warnings: string[] = [];
  if (signal?.aborted) warnings.push("Some price sources took too long. Available prices are shown; retry the remaining items.");
  const catalogue: PriceQuote[] = [];
  let recorded: ItemQuote[] = [];
  const providerStatuses: ShoppingProviderStatus[] = [];
  let localResult: ShoppingLocalProgress | undefined;
  for (const [index, result] of sources.entries()) {
    const collected = incremental.get(index);
    if (collected) {
      for (const query of queries) catalogue.push(collected.quotes.get(query) || {
        query, source: collected.source, label: `${collected.name} online price guide; this ingredient check did not complete.`,
        fetchedAt: null, cached: false, fulfilmentStoreId: null, searched: [query], matches: [], status: "unavailable",
        error: signal?.aborted ? "This ingredient did not finish before the price-check deadline. Completed prices are kept; retry this item." : "No completed price check was returned for this ingredient. Retry this item.",
      });
      if (result.status === "rejected") warnings.push(`${collected.name} prices could not be checked for this batch.`);
      continue;
    }
    if (index === 5 && localProgress) {
      localResult = localProgress; catalogue.push(...localResult.quotes); warnings.push(...localResult.warnings);
      if (result.status === "rejected") warnings.push("Some nearby shop checks did not finish. Completed shop prices are kept; retry the remaining shops.");
      continue;
    }
    if (result.status === "fulfilled") {
      if (index === 2) recorded = result.value as ItemQuote[];
      else if (index === 5) { localResult = result.value as typeof localResult; catalogue.push(...(localResult?.quotes || [])); warnings.push(...(localResult?.warnings || [])); }
      else catalogue.push(...result.value as PriceQuote[]);
    } else warnings.push(index === 2 ? "Saved local prices could not be loaded. Catalogue results are still shown." : `${["Woolworths", "Coles", "", "ALDI", "IGA", "Nearby shop"][index]} prices could not be checked for this batch.`);
  }
  if (!australianPriceGuide(request.country)) warnings.push("Price comparison currently covers Australian stores. Nearby shop listings and retailer links remain available.");
  if (request.localRecords === false) warnings.push("Choose a suburb or postcode to include prices recorded in that area. Online price guides are shown meanwhile.");
  if (names.some((name) => name.length > 80)) warnings.push("Some ingredient names are too long for catalogue search. Shorten those names to check online prices.");
  for (const guide of RETAILERS) {
    const quotes = catalogue.filter(quote => quote.source === `${guide.id}-online-catalogue`);
    const errors = quotes.filter(quote => quote.error);
    const actionable = quotes.find(quote => quote.status === "needs-browser" || quote.status === "needs-store" || quote.status === "not-configured");
    const status = actionable?.status || (quotes.some(quote => quote.fetchedAt) ? errors.length ? "partial" : "ready" : quotes.some(quote => quote.status === "unavailable") ? "unavailable" : guide.id === "iga" ? "needs-store" : "unavailable");
    providerStatuses.push({ ...guide, status, message: actionable?.error || (errors[0]?.error ?? (status === "ready" ? "Published online price guide. Confirm the selected store, availability and final price on the retailer." : guide.id === "iga" ? "Choose an IGA store to see its own prices. A default branch is not treated as your local shop." : !online ? "Online price checking is disabled or outside the supported area." : "No readable prices were returned for this batch. Open the retailer to check.")) });
  }
  for (const shop of localResult?.checkedShops || []) {
    const quotes = catalogue.filter(quote => quote.shop?.id === shop.id);
    const action = quotes.find(quote => ["needs-browser", "needs-store", "not-configured"].includes(quote.status || ""));
    providerStatuses.push({ id: `local:${shop.id}`, name: shop.name, shopId: shop.id, shopName: shop.name, ...(shop.website ? { url: shop.website } : {}), status: action?.status || (quotes.some(quote => quote.fetchedAt && quote.matches.length) ? quotes.some(quote => quote.error) ? "partial" : "ready" : "unavailable"), message: action?.error || quotes.find(quote => quote.error)?.error || (quotes.some(quote => quote.matches.length) ? "Published shop website price; confirm branch, collection/delivery area and current stock with the shop." : "No clear published price for these ingredients. Open the shop website or contact the shop.") });
  }
  if (!request.location) providerStatuses.push({ id: "nearby", name: "Nearby fresh food shops", status: "needs-store", message: "Choose a suburb or postcode to search nearby fruit shops and butchers." });
  else if (sources[5].status === "rejected" || !(localResult?.checkedShops.length)) {
    const completedLocal = !!localResult?.quotes.some(quote => quote.fetchedAt && quote.matches.length);
    providerStatuses.push({ id: "nearby", name: "Nearby fresh food shops", status: completedLocal ? "partial" : "unavailable", message: completedLocal ? "Some nearby shop checks did not finish. Completed shop prices are shown; retry the remaining shops." : sources[5].status === "rejected" ? "Nearby shop search is temporarily unavailable. Existing shop links and saved prices remain available." : "No nearby specialist with a readable public price website was found for these ingredients." });
  }
  for (const quote of catalogue) if (quote.error) warnings.push(`${quote.retailerName || quote.shop?.name || RETAILERS.find(guide => quote.source === `${guide.id}-online-catalogue`)?.name || "Shop"}: ${quote.query} — ${quote.error}`);
  const lines = buildShoppingOffers(request.lines, catalogue, recorded, { area: request.area, shops: request.shops, now });
  return { area: request.area, checkedAt: now.toISOString(), label: "Published online price guides and local recorded prices; quantities, source and unconfirmed stock are shown for each offer.", lines, summary: summarizeShoppingCosts(lines), warnings: [...new Set(warnings)].slice(0, 16), providerStatuses };
}
