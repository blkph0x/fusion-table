import { ReportBodyError, allowPost, ledgerFile, newId, readReportJson, validPostDevice, withLedger } from "@/lib/ledger";
import { quoteItems, rememberPrice, rememberShopPage, shopPagesFor } from "@/lib/price-memory";
import { assertPublicShopUrl, readShopPage } from "@/lib/price-page";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readReportJson(request);
  } catch (error) {
    if (error instanceof ReportBodyError) return bad(error.message, error.status);
    return bad("Send the price note as JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Send the price note as JSON.");
  const row = body as { action?: unknown; device?: unknown; area?: unknown; items?: unknown; url?: unknown; shopName?: unknown };
  const device = typeof row.device === "string" ? row.device : "prices";
  if (!validPostDevice(device)) return bad("That browser id is not valid. The price note was not saved.");
  if (!allowPost(device)) return bad("Slow down a moment. Nothing was discarded.", 429);
  const items = Array.isArray(row.items) ? row.items.filter((item): item is string => typeof item === "string").slice(0, 16) : [];
  const now = new Date().toISOString();
  try {
    if (row.action === "quote") {
      const quoted = await withLedger(ledgerFile(), (ledger) => ({
        result: { quotes: quoteItems(ledger, row.area, items, today()), pages: shopPagesFor(ledger, row.area) },
      }));
      return Response.json(quoted, { headers });
    }
    if (row.action === "record") {
      if (typeof row.url === "string" && row.url.trim()) {
        try { row.url = assertPublicShopUrl(row.url).toString(); }
        catch (error) { return bad(error instanceof Error ? error.message : "That shop page is not public https."); }
      }
      const saved = await withLedger(ledgerFile(), (ledger) => {
        const next = rememberPrice(ledger, row as never, now, newId("price"));
        return next.error ? { result: next } : { ledger: next.ledger, result: next };
      });
      if (saved.error || !saved.price) return bad(saved.error || "That price was not saved.");
      const quotes = quoteItems({ prices: [saved.price], shopPages: [] }, saved.price.area, [saved.price.itemName], today());
      return Response.json({ price: saved.price, label: saved.price.label, quote: quotes[0] }, { headers });
    }
    if (row.action === "page") {
      const url = assertPublicShopUrl(typeof row.url === "string" ? row.url : "").toString();
      const saved = await withLedger(ledgerFile(), (ledger) => {
        const next = rememberShopPage(ledger, row as never, now, newId("shop"), url);
        return next.error ? { result: next } : { ledger: next.ledger, result: next };
      });
      if (saved.error) return bad(saved.error);
      return Response.json({ saved: true }, { headers });
    }
    if (row.action === "read") {
      const url = typeof row.url === "string" ? row.url : "";
      const read = await readShopPage(url, items);
      const stored = await withLedger(ledgerFile(), (ledger) => {
        let next = ledger;
        const page = rememberShopPage(next, { shopName: row.shopName, area: row.area, url: read.url }, now, newId("shop"), read.url);
        if (!page.error) next = page.ledger;
        const saved = [];
        for (const pick of read.picks) {
          const price = rememberPrice(next, {
            shopName: row.shopName, area: row.area, itemName: pick.item, cents: pick.cents,
            kind: pick.special ? "special" : "page", url: read.url,
          }, now, newId("price"));
          if (price.error || !price.price) continue;
          next = price.ledger;
          saved.push(price.price);
        }
        return { ledger: next === ledger ? undefined : next, result: saved };
      });
      return Response.json({ ...read, saved: stored }, { headers });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The price book could not be saved. Nothing was deleted.";
    const status = /could not be read|could not be saved|book is full|price book is full/i.test(message) ? 503 : 400;
    return bad(message, status);
  }
  return bad("Say whether this is a recorded price, a shop page, or a lookup.");
}
