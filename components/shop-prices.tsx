"use client";

import { useEffect, useState } from "react";
import { formatAudCents } from "@/lib/product-match";
import { publicPath } from "@/lib/public-path";
import type { ItemQuote, PriceMemory, ShopPage } from "@/lib/price-memory";

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
  website: string | null;
}

function deviceId(): string {
  try {
    const existing = localStorage.getItem("fusion-device") || "";
    if (/^[a-z0-9]{16,64}$/.test(existing)) return existing;
    const next = (crypto.randomUUID?.() || `${Date.now()}`.padEnd(16, "0")).replace(/-/g, "").toLowerCase().slice(0, 32);
    if (!/^[a-z0-9]{16,64}$/.test(next)) return "localpricebook0001";
    localStorage.setItem("fusion-device", next);
    return next;
  } catch {
    return "localpricebook0001";
  }
}

export function ShopPrices({ lines, shops, area }: { lines: Line[]; shops: ShopRef[]; area: string }) {
  const [quotes, setQuotes] = useState<ItemQuote[]>([]);
  const [pages, setPages] = useState<ShopPage[]>([]);
  const [shopId, setShopId] = useState("");
  const [shopName, setShopName] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [specials, setSpecials] = useState<Record<string, boolean>>({});
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const [linesSeen, setLinesSeen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const chosen = shops.find((shop) => shop.id === shopId);
  const namedShop = (chosen?.name || shopName).trim();
  const knownUrl = chosen?.website || pages.find((page) => page.shopName === namedShop)?.url || "";

  const itemNames = lines.slice(0, 16).map((line) => line.name).join("|");

  async function load(nextArea = area) {
    const response = await fetch(publicPath("/api/price-memory"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "quote", device: deviceId(), area: nextArea, items: itemNames ? itemNames.split("|") : [] }),
      cache: "no-store",
    });
    const data = await response.json() as { quotes?: ItemQuote[]; pages?: ShopPage[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Saved prices could not be read. Nothing was invented.");
    return data;
  }

  useEffect(() => {
    if (!area || !itemNames) return;
    let cancel = false;
    void fetch(publicPath("/api/price-memory"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "quote", device: deviceId(), area, items: itemNames.split("|") }),
      cache: "no-store",
    }).then(async (response) => {
      const data = await response.json() as { quotes?: ItemQuote[]; pages?: ShopPage[]; error?: string };
      if (cancel) return;
      if (!response.ok) {
        setNote(data.error || "Saved prices could not be read. Nothing was invented.");
        return;
      }
      setQuotes(data.quotes || []);
      setPages(data.pages || []);
    }).catch(() => {
      if (!cancel) setNote("Saved prices could not be read. Nothing was invented.");
    });
    return () => { cancel = true; };
  }, [area, itemNames]);

  async function remember(line: Line) {
    if (!area) {
      setNote("Set a suburb or postcode first. A price is kept for that area, and a missing price is not $0.");
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const response = await fetch(publicPath("/api/price-memory"), {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record",
          device: deviceId(),
          shopName: namedShop,
          shopId: chosen?.id || "",
          area,
          itemName: line.name,
          price: drafts[line.id] || "",
          kind: specials[line.id] ? "special" : "recorded",
          until: specials[line.id] ? until : "",
        }),
        cache: "no-store",
      });
      const data = await response.json() as { error?: string; price?: PriceMemory };
      if (!response.ok || !data.price) {
        setNote(data.error || "That price was not saved. Nothing was invented.");
        return;
      }
      setNote(`${data.price.label} ${formatAudCents(data.price.cents)} at ${data.price.shopName}.`);
      await load();
    } catch {
      setNote("The price book could not be reached. Nothing was invented.");
    } finally {
      setBusy(false);
    }
  }

  function openPage(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function readPage(url: string) {
    if (!url) {
      setNote("Add the shop's public https page. A butcher's own specials page is fine.");
      return;
    }
    setBusy(true);
    setNote("");
    setLinesSeen([]);
    openPage(url);
    try {
      const response = await fetch(publicPath("/api/price-memory"), {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "read",
          device: deviceId(),
          url,
          shopName: namedShop || "Shop page",
          area,
          items: lines.slice(0, 16).map((line) => line.name),
        }),
        cache: "no-store",
      });
      const data = await response.json() as { error?: string; note?: string; lines?: string[]; saved?: PriceMemory[] };
      if (!response.ok) {
        setNote(data.error || "Open the page on this device and type the price you see. Nothing was invented.");
        return;
      }
      setLinesSeen(data.lines || []);
      setNote(data.note || "If the price is not listed, type what you saw.");
      await load();
    } catch {
      setNote("Open the page on this device and type the price you see. Nothing was invented.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="shop-prices" aria-label="Prices by shop and area">
    <h3>Prices people have seen</h3>
    <p>A public shop page can be opened on this device and read when it is ordinary https. Coles and other blocked catalogues are not forced open. If a price cannot be read, type what you paid. It is saved for that shop and area. A missing price is never $0.</p>
    {!area && <p>Set a suburb or postcode. Prices are kept for that area.</p>}
    {area && <p>Area: {area}. Averages use prices people typed, not a page read and not a special.</p>}
    <label className="field">Shop
      <select aria-label="Shop for this price" value={shopId} onChange={(event) => setShopId(event.target.value)}>
        <option value="">Type a shop name</option>
        {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
      </select>
    </label>
    {!shopId && <label className="field">Shop name<input aria-label="Shop name" value={shopName} maxLength={80} onChange={(event) => setShopName(event.target.value)} placeholder="e.g. the butcher on the corner" /></label>}
    <label className="field">Public price page
      <input aria-label="Public shop page" value={pageUrl} maxLength={300} onChange={(event) => setPageUrl(event.target.value)} placeholder={knownUrl || "https://the-butcher.example/specials"} />
    </label>
    <div className="yes-no">
      <button type="button" className="button secondary small" disabled={busy} onClick={() => openPage(pageUrl.trim() || knownUrl)}>Open the page</button>
      <button type="button" className="button secondary small" disabled={busy || !area} onClick={() => void readPage((pageUrl.trim() || knownUrl))}>Read public prices</button>
    </div>
    {note && <p role="status">{note}</p>}
    {linesSeen.length > 0 && <ul>{linesSeen.map((line) => <li key={line}><small>{line}</small></li>)}</ul>}
    <ul>
      {lines.slice(0, 16).map((line) => {
        const quote = quotes.find((item) => item.itemName === line.name || item.itemKey === line.name.toLowerCase());
        return <li key={`${line.id}-${line.unit}`}>
          <div><strong>{line.name}</strong><span>{Number(line.amount.toFixed(2))} {line.unit}</span></div>
          {quote?.averageLabel && <small>{quote.averageLabel}</small>}
          {quote?.specials.map((row) => <small key={row.id}>{row.label} {formatAudCents(row.cents)} at {row.shopName}{row.until ? ` until ${row.until}` : ""}.</small>)}
          {quote?.records.map((row) => <small key={row.id}>{row.label} {formatAudCents(row.cents)} at {row.shopName}.</small>)}
          {!quote?.records.length && !quote?.averageLabel && <small>No saved price for this area. Type what you saw.</small>}
          <label>Price you saw
            <input aria-label={`Price you saw for ${line.name}`} inputMode="decimal" value={drafts[line.id] || ""} placeholder="e.g. 12.50" onChange={(event) => setDrafts((current) => ({ ...current, [line.id]: event.target.value }))} />
          </label>
          <label className="text-button"><input type="checkbox" checked={!!specials[line.id]} onChange={(event) => setSpecials((current) => ({ ...current, [line.id]: event.target.checked }))} /> This is a special</label>
          <button type="button" className="text-button" disabled={busy} onClick={() => void remember(line)}>Save this price for the shop</button>
        </li>;
      })}
    </ul>
    {Object.values(specials).some(Boolean) && <label className="field">Special until, if it ends<input aria-label="Special end date" value={until} placeholder="YYYY-MM-DD" maxLength={10} onChange={(event) => setUntil(event.target.value)} /></label>}
    {pages.length > 0 && <ul className="shop-ask">{pages.map((page) => <li key={page.id}><button type="button" className="text-button" onClick={() => { setPageUrl(page.url); setShopName(page.shopName); openPage(page.url); }}>{page.shopName} page</button></li>)}</ul>}
  </section>;
}
