import type { PriceQuote } from "./catalogue.ts";
import type { ItemQuote } from "./price-memory.ts";
import { buildShoppingOffers, summarizeShoppingCosts } from "./shopping-costs.ts";
import { australianPriceGuide, type ShoppingPriceRequest } from "./shopping-request.ts";

interface Dependencies {
  woolworths: (queries: readonly string[], signal?: AbortSignal) => Promise<PriceQuote[]>;
  coles: (queries: readonly string[], signal?: AbortSignal) => Promise<PriceQuote[]>;
  recorded: (area: string, items: readonly string[], today: string) => Promise<ItemQuote[]>;
  now?: () => Date;
}

/** Price providers fail independently; a partial result is useful without becoming a full-basket claim. */
export async function compareShopping(request: ShoppingPriceRequest, deps: Dependencies, signal?: AbortSignal) {
  const now = deps.now?.() ?? new Date();
  const names = [...new Set(request.lines.map((line) => line.name))];
  const queries = names.filter((name) => name.length <= 80);
  const online = request.online && australianPriceGuide(request.country) && queries.length > 0;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const sources = await Promise.allSettled([
    online ? Promise.resolve().then(() => deps.woolworths(queries, signal)) : Promise.resolve([] as PriceQuote[]),
    online ? Promise.resolve().then(() => deps.coles(queries, signal)) : Promise.resolve([] as PriceQuote[]),
    request.localRecords !== false && australianPriceGuide(request.country) ? Promise.resolve().then(() => deps.recorded(request.area, names, today)) : Promise.resolve([] as ItemQuote[]),
  ]);
  const warnings: string[] = [];
  if (signal?.aborted) warnings.push("Some price sources took too long. Available prices are shown; retry the remaining items.");
  const catalogue: PriceQuote[] = [];
  let recorded: ItemQuote[] = [];
  for (const [index, result] of sources.entries()) {
    if (result.status === "fulfilled") {
      if (index === 2) recorded = result.value as ItemQuote[];
      else catalogue.push(...result.value as PriceQuote[]);
    } else warnings.push(index === 2 ? "Saved local prices could not be loaded. Catalogue results are still shown." : `${index === 0 ? "Woolworths" : "Coles"} prices could not be checked for this batch.`);
  }
  if (!australianPriceGuide(request.country)) warnings.push("Price comparison currently covers Australian stores. Nearby shop listings and retailer links remain available.");
  if (request.localRecords === false) warnings.push("Choose a suburb or postcode to include prices recorded in that area. Online price guides are shown meanwhile.");
  if (names.some((name) => name.length > 80)) warnings.push("Some ingredient names are too long for catalogue search. Shorten those names to check online prices.");
  for (const quote of catalogue) if (quote.error) warnings.push(`${quote.source === "coles-online-catalogue" ? "Coles" : "Woolworths"}: ${quote.query} — ${quote.error}`);
  const lines = buildShoppingOffers(request.lines, catalogue, recorded, { area: request.area, shops: request.shops, now });
  return { area: request.area, checkedAt: now.toISOString(), label: "Online price guides and local recorded prices; quantities and source are shown for each offer.", lines, summary: summarizeShoppingCosts(lines), warnings: [...new Set(warnings)].slice(0, 16) };
}
