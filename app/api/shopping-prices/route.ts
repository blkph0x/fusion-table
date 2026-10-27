import { withAutomaticPrices } from "./automatic-offers";
import { lookupQueries } from "@/lib/catalogue";
import { lookupColesQueries } from "@/lib/coles-catalogue";
import { compareShopping } from "@/lib/shopping-compare";
import { parseShoppingPriceRequest } from "@/lib/shopping-request";
import { quoteItems } from "@/lib/price-memory";
import { ledgerFile, PostLimiter, readReportJson, ReportBodyError, withLedger } from "@/lib/ledger";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const limiter = new PostLimiter({ maxPerDevice: 80, maxTotal: 240 });

export async function POST(request: Request) {
  try {
    const input = parseShoppingPriceRequest(await readReportJson(request));
    if (!limiter.allow(input.device)) return Response.json({ error: "A lot of prices were just checked. Please try again in a minute." }, { status: 429, headers });
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(35_000)]);
    const result = await compareShopping(input, {
      woolworths: (queries, abort) => lookupQueries(queries, fetch, abort),
      coles: (queries, abort) => lookupColesQueries(queries, fetch, abort),
      recorded: (area, items, today) => withLedger(ledgerFile(), (ledger) => ({ result: quoteItems(ledger, area, items, today) })),
    }, signal);
    return Response.json(withAutomaticPrices(result), { headers });
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    const message = timeout ? "The price check took too long. Retry this batch; completed results are kept." : error instanceof Error ? error.message : "The price check could not finish. Please try again.";
    return Response.json({ error: message }, { status: error instanceof ReportBodyError ? error.status : timeout ? 504 : 400, headers });
  }
}
