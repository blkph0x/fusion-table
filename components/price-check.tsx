"use client";

import { useMemo, useState } from "react";
import { CATALOGUE_LABEL, shopAsk, type PriceQuote } from "@/lib/catalogue";
import { audToCents, catalogueSearchPhrases, formatAudCents } from "@/lib/product-match";

interface Line {
  id: string;
  name: string;
  amount: number;
  unit: string;
}

interface ShopRef {
  id: string;
  name: string;
  kind: string;
}

interface RecordedPrice {
  shopId: string;
  shopName: string;
  lineId: string;
  cents: number;
  at: string;
}

const STORAGE_KEY = "fusion-recorded-prices";
const apiPrefix = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

function loadRecorded(): RecordedPrice[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is RecordedPrice => {
      const item = row as RecordedPrice;
      return !!item && typeof item.shopName === "string" && typeof item.lineId === "string" && Number.isSafeInteger(item.cents) && item.cents > 0 && typeof item.at === "string";
    }).slice(0, 200);
  } catch {
    return [];
  }
}

export function PriceCheck({ lines, shops }: { lines: Line[]; shops: ShopRef[] }) {
  const [quotes, setQuotes] = useState<PriceQuote[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [recorded, setRecorded] = useState<RecordedPrice[]>(() => (typeof window === "undefined" ? [] : loadRecorded()));
  const [draftShop, setDraftShop] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftPrice, setDraftPrice] = useState<Record<string, string>>({});
  const asks = useMemo(() => shops.map(shopAsk), [shops]);
  const hasWoolworths = asks.some((shop) => shop.catalogueGuide);
  const catalogueTotal = useMemo(() => {
    const cents = quotes.flatMap((quote) => quote.matches.filter((match) => match.selected && match.priceCents && match.priceCents > 0).map((match) => match.priceCents as number));
    return cents.length ? cents.reduce((sum, value) => sum + value, 0) : null;
  }, [quotes]);
  const recordedTotal = useMemo(() => {
    const seen = new Set<string>();
    let cents = 0;
    let count = 0;
    for (const row of recorded) {
      if (!lines.some((line) => line.id === row.lineId) || seen.has(row.lineId)) continue;
      seen.add(row.lineId);
      cents += row.cents;
      count += 1;
    }
    return count ? cents : null;
  }, [recorded, lines]);

  async function check() {
    if (!lines.length || busy) return;
    setBusy(true);
    setNote("");
    setQuotes([]);
    try {
      const response = await fetch(`${apiPrefix}/api/prices`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ queries: lines.slice(0, 16).map((line) => line.name.slice(0, 80)) }),
        cache: "no-store",
      });
      const data = await response.json() as { quotes?: PriceQuote[]; error?: string };
      if (!response.ok || !Array.isArray(data.quotes)) {
        setNote(data.error || "The catalogue check failed. No price was invented.");
        return;
      }
      setQuotes(data.quotes);
      setNote(lines.length > 16 ? "The first 16 items were checked. Check the rest after that." : "");
    } catch {
      setNote("We couldn't reach the catalogue. No price was invented.");
    } finally {
      setBusy(false);
    }
  }

  function remember(line: Line) {
    const cents = audToCents(draftPrice[line.id] || "");
    const shop = asks.find((item) => item.id === draftShop);
    const shopName = (shop?.name || draftName).trim();
    if (!cents) {
      setNote("Enter a price above $0. A blank price is not saved as $0.");
      return;
    }
    if (shopName.length < 2) {
      setNote("Name the shop you saw that price in.");
      return;
    }
    const next = [{ shopId: shop?.id || "named", shopName, lineId: line.id, cents, at: new Date().toISOString() }, ...recorded.filter((row) => !(row.lineId === line.id && row.shopName === shopName))].slice(0, 200);
    setRecorded(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setNote(`Remembered ${formatAudCents(cents)} at ${shopName}. That is the price you recorded, not a live catalogue.`);
  }

  return <section className="price-check" aria-label="Price check">
    <h3>Check prices</h3>
    <p>{CATALOGUE_LABEL} The check also tries the other names a shop may use. Coles blocks an automatic check. ALDI, butchers and fruit shops do not publish a board here. Record the price you actually see at that shop. A missing price stays blank, never $0.</p>
    {!lines.length ? <p>Add a recipe or a week first. The list is what gets checked.</p> : <button type="button" className="button secondary" onClick={() => void check()} disabled={busy}>{busy ? "Checking the catalogue…" : "Check these items"}</button>}
    {note && <p role="status">{note}</p>}
    {quotes.length > 0 && <p>{hasWoolworths ? "A Woolworths near you can use this as a guide only. It is still not that store's shelf." : shops.length ? "No Woolworths is in this shop list. The catalogue below is not a price for the shops here." : "Set a location to list the supermarkets, butchers and fruit shops around you."}</p>}
    <label className="field">Shop for a price you record
      <select aria-label="Shop for a recorded price" value={draftShop} onChange={(event) => setDraftShop(event.target.value)}>
        <option value="">Type a shop name</option>
        {asks.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
      </select>
    </label>
    {!draftShop && <label className="field">Shop name<input aria-label="Shop name for a recorded price" value={draftName} maxLength={80} onChange={(event) => setDraftName(event.target.value)} placeholder="e.g. the butcher on the corner" /></label>}
    {catalogueTotal != null && <p><strong>{formatAudCents(catalogueTotal)}</strong> is the Woolworths catalogue subtotal for the lines it could match. It is not your basket, and it is not a local shelf total.</p>}
    {recordedTotal != null && <p><strong>{formatAudCents(recordedTotal)}</strong> is what you recorded. It is kept apart from the catalogue and is not a verified shelf price.</p>}
    <ul>
      {lines.slice(0, 16).map((line, index) => {
        const quote = quotes[index];
        const chosen = quote?.matches.find((match) => match.selected);
        const others = quote?.matches.filter((match) => match !== chosen).slice(0, 3) ?? [];
        const mine = recorded.filter((row) => row.lineId === line.id);
        const otherNames = (quote?.searched ?? catalogueSearchPhrases(line.name)).slice(1);
        return <li key={`${line.id}-${line.unit}`}>
          <div><strong>{line.name}</strong><span>{Number(line.amount.toFixed(2))} {line.unit}</span></div>
          {otherNames.length > 0 && <small>Shops may call this {otherNames.join(" or ")}. The check looks those up too.</small>}
          {!quote ? <small>Not checked yet.</small> : quote.error ? <small>{quote.error}</small> : chosen ? <small>{chosen.name} — {formatAudCents(chosen.priceCents)}{chosen.packageSize ? ` · ${chosen.packageSize}` : ""}. {chosen.reason} {CATALOGUE_LABEL}</small> : <small>No catalogue row was selected. A missing price is not $0.</small>}
          {others.map((match) => <small key={match.name}>{match.name}{formatAudCents(match.priceCents) ? ` — ${formatAudCents(match.priceCents)}` : " — no price"}. {match.reason}</small>)}
          {mine.map((row) => <small key={`${row.shopName}-${row.at}`}>You recorded {formatAudCents(row.cents)} at {row.shopName}. Not a live catalogue.</small>)}
          <label>Price you saw<input aria-label={`Price you saw for ${line.name}`} inputMode="decimal" value={draftPrice[line.id] || ""} placeholder="e.g. 12.50" onChange={(event) => setDraftPrice((current) => ({ ...current, [line.id]: event.target.value }))} /></label>
          <button type="button" className="text-button" onClick={() => remember(line)}>Remember this price</button>
        </li>;
      })}
    </ul>
    {asks.length > 0 && <ul className="shop-ask">{asks.map((shop) => <li key={shop.id}><strong>{shop.name}</strong> — {shop.note}</li>)}</ul>}
  </section>;
}
