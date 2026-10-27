import type { PriceQuote } from "./catalogue.ts";
import type { ItemQuote } from "./price-memory.ts";
import { buildShoppingOffers, summarizeShoppingCosts } from "./shopping-costs.ts";
import { australianPriceGuide, type ShoppingPriceRequest } from "./shopping-request.ts";

interface Dependencies {
  woolworths: (queries: readonly string[], signal?: AbortSignal) => Promise<PriceQuote[]>;
  coles: (queries: readonly string[], signal?: AbortSignal) => Promise<PriceQuote[]>;
  aldi?: (queries: readonly string[], signal?: AbortSignal) => Promise<PriceQuote[]>;
  iga?: (queries: readonly string[], signal?: AbortSignal) => Promise<PriceQuote[]>;
  local?: (request: ShoppingPriceRequest, signal?: AbortSignal) => Promise<{ quotes: PriceQuote[]; warnings: string[]; checkedShops: { id: string; name: string; website?: string | null }[] }>;
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
  // Start specialist discovery first. It shares the map search with IGA, and
  // nearby produce/meat pages should not wait behind repeated chain searches.
  const localTask = online && request.location && deps.local ? Promise.resolve().then(() => deps.local!(request, signal)) : Promise.resolve({ quotes: [] as PriceQuote[], warnings: [] as string[], checkedShops: [] as {id:string;name:string;website?:string|null}[] });
  const tasks = [
    online ? Promise.resolve().then(() => deps.woolworths(queries, signal)) : Promise.resolve([] as PriceQuote[]),
    online ? Promise.resolve().then(() => deps.coles(queries, signal)) : Promise.resolve([] as PriceQuote[]),
    request.localRecords !== false && australianPriceGuide(request.country) ? Promise.resolve().then(() => deps.recorded(request.area, names, today)) : Promise.resolve([] as ItemQuote[]),
    online && deps.aldi ? Promise.resolve().then(() => deps.aldi!(queries, signal)) : Promise.resolve([] as PriceQuote[]),
    online && deps.iga ? Promise.resolve().then(() => deps.iga!(queries, signal)) : Promise.resolve([] as PriceQuote[]),
    localTask,
  ];
  const sources = await Promise.allSettled(tasks.map(task => untilAbort<unknown>(task, signal)));
  const warnings: string[] = [];
  if (signal?.aborted) warnings.push("Some price sources took too long. Available prices are shown; retry the remaining items.");
  const catalogue: PriceQuote[] = [];
  let recorded: ItemQuote[] = [];
  const providerStatuses: ShoppingProviderStatus[] = [];
  let localResult: { quotes: PriceQuote[]; warnings: string[]; checkedShops: {id:string;name:string;website?:string|null}[] } | undefined;
  for (const [index, result] of sources.entries()) {
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
    const status = actionable?.status || (quotes.some(quote => quote.fetchedAt) ? errors.length ? "partial" : "ready" : guide.id === "iga" ? "needs-store" : "unavailable");
    providerStatuses.push({ ...guide, status, message: actionable?.error || (errors[0]?.error ?? (status === "ready" ? "Published online price guide. Confirm the selected store, availability and final price on the retailer." : guide.id === "iga" ? "Choose an IGA store to see its own prices. A default branch is not treated as your local shop." : !online ? "Online price checking is disabled or outside the supported area." : "No readable prices were returned for this batch. Open the retailer to check.")) });
  }
  for (const shop of localResult?.checkedShops || []) {
    const quotes = catalogue.filter(quote => quote.shop?.id === shop.id);
    const action = quotes.find(quote => ["needs-browser", "needs-store", "not-configured"].includes(quote.status || ""));
    providerStatuses.push({ id: `local:${shop.id}`, name: shop.name, shopId: shop.id, shopName: shop.name, ...(shop.website ? { url: shop.website } : {}), status: action?.status || (quotes.some(quote => quote.fetchedAt && quote.matches.length) ? quotes.some(quote => quote.error) ? "partial" : "ready" : "unavailable"), message: action?.error || quotes.find(quote => quote.error)?.error || (quotes.some(quote => quote.matches.length) ? "Published shop website price; confirm branch, collection/delivery area and current stock with the shop." : "No clear published price for these ingredients. Open the shop website or contact the shop.") });
  }
  if (!request.location) providerStatuses.push({ id: "nearby", name: "Nearby fresh food shops", status: "needs-store", message: "Choose a suburb or postcode to search nearby fruit shops and butchers." });
  else if (sources[5].status === "rejected" || !(localResult?.checkedShops.length)) providerStatuses.push({ id: "nearby", name: "Nearby fresh food shops", status: "unavailable", message: sources[5].status === "rejected" ? "Nearby shop search is temporarily unavailable. Existing shop links and saved prices remain available." : "No nearby specialist with a readable public price website was found for these ingredients." });
  for (const quote of catalogue) if (quote.error) warnings.push(`${quote.retailerName || quote.shop?.name || RETAILERS.find(guide => quote.source === `${guide.id}-online-catalogue`)?.name || "Shop"}: ${quote.query} — ${quote.error}`);
  const lines = buildShoppingOffers(request.lines, catalogue, recorded, { area: request.area, shops: request.shops, now });
  return { area: request.area, checkedAt: now.toISOString(), label: "Published online price guides and local recorded prices; quantities, source and unconfirmed stock are shown for each offer.", lines, summary: summarizeShoppingCosts(lines), warnings: [...new Set(warnings)].slice(0, 16), providerStatuses };
}
