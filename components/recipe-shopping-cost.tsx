"use client";
import { useEffect, useMemo, useState } from "react";
import { areaKey } from "@/lib/price-memory";
import { australianPriceGuide } from "@/lib/shopping-request";
import { resolveIngredientPricing } from "@/lib/shopping-costs";
import { formatAudCents } from "@/lib/product-match";
import type { ShoppingLine } from "@/lib/shopping";
import type { LocationResult, Shop } from "@/lib/locations";
import { observeRecipePrices, priceContextKey, type RecipePriceResult } from "./recipe-price-client";
import "./recipe-shopping-cost.css";
const empty = (total: number): RecipePriceResult => ({ rows: [], checked: 0, total, checkedAt: null, warnings: [], error: "" });
const safeLink = (value: string | null) => { try { const url = new URL(value || ""); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } };
export function RecipeShoppingCost({ lines, servings, location, shops = [], onSetLocation, onOpenShopping }: { lines: ShoppingLine[]; servings: number; location: LocationResult | null; shops?: Shop[]; onSetLocation: () => void; onOpenShopping: () => void }) {
  const [result, setResult] = useState<{ key: string; data: RecipePriceResult } | null>(null);
  const [retry, setRetry] = useState(0);
  const input = { lines, area: areaKey(`${location?.label || ""} ${location?.name || ""}`) || areaKey("Australia online"), country: location?.country === undefined ? "Australia" : typeof location.country === "string" ? location.country : "unknown", localRecords: !!location && location.id !== "current-location", shops: shops.map(shop => ({ id: shop.id, name: shop.name })) };
  const key = priceContextKey(input), supported = australianPriceGuide(input.country);
  // Key contains the entire immutable request. Avoid restarting on unrelated page renders.
  const request = useMemo(() => input, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!supported || !request.lines.length) return;
    let active = true;
    let cleanup = () => {};
    const timer = setTimeout(() => {
      if (!active) return;
      const detach = observeRecipePrices(request, data => { if (active) setResult({ key, data }); }, retry > 0);
      cleanup = detach;
    }, 350);
    return () => { active = false; clearTimeout(timer); cleanup(); };
  }, [key, request, retry, supported]);
  const current = result?.key === key ? result.data : empty(lines.length);
  const priced = lines.map(line => ({ line, row: current.rows.find(row => row.id === line.id), cost: resolveIngredientPricing(line, current.rows.find(row => row.id === line.id)) }));
  const observed = priced.filter(item => item.cost.purchaseSource === "observed").length;
  const estimated = priced.filter(item => item.cost.purchaseSource === "planning-guide" && item.cost.purchaseCents !== null).length;
  const complete = priced.every(item => item.cost.purchaseCents !== null);
  const subtotal = priced.reduce((sum, item) => sum + (item.cost.purchaseCents ?? 0), 0);
  const busy = supported && lines.length > 0 && current.checked < lines.length && !current.error;
  const noShopping = lines.length === 0;
  return <section className="recipe-cost" aria-label="Automatic shopping estimate">
    <div className="recipe-cost-heading"><div><span className="eyebrow">SHOPPING FOR THIS RECIPE</span><h3>{noShopping ? "Nothing left to buy" : `${formatAudCents(subtotal)}${complete ? "" : "+"} estimated shopping`}</h3></div><button type="button" className="text-button" onClick={onSetLocation}>{location?.name || "Set shopping area"}</button></div>
    <p>{noShopping ? "Your pantry selections cover this shopping list." : `${lines.length} ingredients for ${servings} servings: ${observed} store guides and ${estimated} planning estimates. ${location ? `Area: ${location.name}.` : "Australian online guides while you choose an area."}`}</p>
    {busy && <p role="status">Checking automatically: {current.checked} of {lines.length} ingredients checked. Store guides replace planning values as they arrive.</p>}
    {!supported && <p>Store lookups currently cover Australia. These planning estimates are in Australian dollars; they are not local prices for your selected country.</p>}
    {!noShopping && <p className="subtle-small">{complete ? "Every item has a value." : "Some custom quantities need a manual estimate; + marks an incomplete total."} This estimates packs to buy, including leftovers. Planning values are authored budget allowances. Store guides may come from different retailers; this is not a confirmed basket or local shelf price.</p>}
    {current.checkedAt && <p className="subtle-small">Checked {new Date(current.checkedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}. Pantry items are excluded.</p>}
    {priced.length > 0 && <details><summary>Every ingredient, price and source</summary><ul>{priced.map(({line, cost}) => { const offer = cost.offer; const link = safeLink(offer?.url || null); const estimate = cost.planningEstimate; return <li key={line.id}><span><strong>{line.name}</strong><small>{line.amount} {line.unit || "each"} - {cost.purchaseSource === "observed" && offer ? offer.shopName : "AUD planning estimate"}</small>{offer && cost.purchaseSource === "observed" ? <small>{offer.productName}{offer.cost.packs ? ` - ${offer.cost.packs} pack(s)` : ""}</small> : estimate && <small>{estimate.packs} x assumed {estimate.pack.label} pack at {formatAudCents(estimate.pack.priceCents)}{estimate.confidence === "low" ? " - broad allowance" : ""}</small>}{estimate && cost.purchaseSource !== "observed" && <details><summary>Estimate assumptions</summary>{estimate.assumptions.map(note => <p className="subtle-small" key={note}>{note}</p>)}</details>}{link && cost.purchaseSource === "observed" && <a href={link} target="_blank" rel="noreferrer">Check product</a>}</span><b>{cost.purchaseCents === null ? "Needs quantity" : `~${formatAudCents(cost.purchaseCents)}`}</b></li>; })}</ul></details>}
    {current.error && <p role="status">Some store prices could not be checked. Planning estimates remain available for budgeting.</p>}
    {current.warnings.length > 0 && <details><summary>Price availability notes</summary><ul>{current.warnings.slice(0, 8).map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
    <div className="recipe-cost-actions"><button type="button" className="button secondary small" onClick={onOpenShopping}>Open shopping list</button>{!noShopping && supported && !busy && <button type="button" className="text-button" onClick={() => { setResult(null); setRetry(value => value + 1); }}>Refresh prices</button>}</div>
  </section>;
}
