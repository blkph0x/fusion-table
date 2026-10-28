"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, ChevronDown, Download, ExternalLink, LoaderCircle, MapPin, Navigation, Plus, Search, ShoppingBasket, X } from "lucide-react";
import { SHOP_LABELS, type LocationResult, type Shop, type ShopKind, type ShopResponse } from "@/lib/locations";
import { areaKey } from "@/lib/price-memory";
import { formatAudCents, audToCents } from "@/lib/product-match";
import { publicPath } from "@/lib/public-path";
import { productSearchLink, rankShopsForList, type ShoppingLine } from "@/lib/shopping";
import { australianPriceGuide } from "@/lib/shopping-request";
import { applyShoppingOfferSelection, applyShoppingOfferSelections, isShoppingOfferSelectable, type ShoppingCostLine, type ShoppingOffer } from "@/lib/shopping-costs";
import { applyShoppingStrategy, availableSpecialistShops, DEFAULT_SHOPPING_STRATEGY, normalizeShoppingStrategy, type ShoppingStrategy, type ShoppingStrategyResult } from "@/lib/shopping-strategy";
import { mergeProviderStatuses, readProviderStatuses, shoppingOfferPreview, shoppingScopeLabel, shoppingVendorCards, type ShoppingProviderStatus } from "./shopping-offers";
import { cachedRecipePrices, priceContextKey, rememberRecipePrices } from "./recipe-price-client";
import "./shopping-hub.css";

export interface ShoppingHubProps {
  sourceOptions: { id: string; label: string; count: number; disabled?: boolean }[];
  sourceId: string;
  onSourceChange: (id: string) => void;
  lines: ShoppingLine[];
  listLabel: string;
  onLinesChange: (lines: ShoppingLine[]) => void;
  location: LocationResult | null;
  radius: number;
  onRadiusChange: (radius: number) => void;
  onChangeArea: () => void;
  shopData: ShopResponse | null;
  shopsLoading: boolean;
  shopError: string;
  onSearchShops: () => void;
  onExport: (selection?: ShoppingStrategyResult) => void;
  onOpenRecipe?: () => void;
}

type Comparison = { key: string; rows: ShoppingCostLine[]; checked: number; total: number; busy: boolean; error: string; warnings: string[]; checkedAt: string | null; providerStatuses?: ShoppingProviderStatus[] };
const EMPTY: Comparison = { key: "", rows: [], checked: 0, total: 0, busy: false, error: "", warnings: [], checkedAt: null };
const KINDS: (ShopKind | "all")[] = ["all", "supermarket", "produce", "butcher", "fishmonger", "grocery", "market", "specialty"];
const UNITS = ["each", "g", "kg", "ml", "l", "tsp", "tbsp", "cloves", "bunch", "pack"];
const money = (cents: number | null | undefined) => cents == null || !Number.isFinite(cents) ? "Price unknown" : cents === 0 ? "A$0.00" : formatAudCents(cents);
const quantity = (amount: number, unit: string) => `${Number(amount.toFixed(2))}${unit.trim() ? ` ${unit}` : " each"}`;
const distanceKnown = (km: number) => Number.isFinite(km) && km >= 0;
const distance = (km: number) => !distanceKnown(km) ? "Distance unknown" : km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
const safeUrl = (value: string | null | undefined) => {
  if (!value) return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : null; } catch { return null; }
};
const dateLabel = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "Time not recorded";
const boughtKey = (sourceId: string, line: ShoppingLine) => `${sourceId}|${line.id}|${line.amount}|${line.unit}`;
const STRATEGY_STORAGE = "fusion-shopping-strategy-v1";
const SHOPPING_MODES: { id: ShoppingStrategy["mode"]; label: string }[] = [
  { id: "cheapest", label: "Cheapest per item" }, { id: "woolworths", label: "Woolworths only" },
  { id: "coles", label: "Coles only" }, { id: "aldi", label: "ALDI only" }, { id: "iga", label: "IGA only" },
];

function storedStrategies(): { key: string; value: ShoppingStrategy }[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(STRATEGY_STORAGE) || "[]");
    if (Array.isArray(values)) return values.slice(-12).flatMap(value => value && typeof value === "object" && typeof value.key === "string" && value.key.length < 400 ? [{ key: value.key, value: normalizeShoppingStrategy(value.value) }] : []);
  } catch { /* Shop choices still work when browser storage is unavailable. */ }
  return [];
}

function deviceId(): string {
  try {
    const stored = localStorage.getItem("fusion-device") || "";
    if (/^[a-f0-9]{16,64}$/.test(stored)) return stored;
    const created = (crypto.randomUUID?.() || `${Date.now()}${Math.random().toString(16).slice(2)}`).replace(/-/g, "").slice(0, 32);
    localStorage.setItem("fusion-device", created);
    return created;
  } catch { return "shoppinghubpricebook"; }
}

function OfferCard({ offer, selected, allowed, onSelect }: { offer: ShoppingOffer; selected: boolean; allowed: boolean; onSelect: () => void }) {
  const url = safeUrl(offer.url);
  const usable = isShoppingOfferSelectable(offer);
  return <div className={`sh-offer${selected ? " sh-offer-selected" : ""}`}>
    <div className="sh-offer-top"><span className="sh-source-badge">{shoppingScopeLabel(offer.scope, offer.source)}</span>{selected && <span className="sh-selected-offer"><Check size={13} /> {offer.match === "review" && offer.eligible ? "Suggested estimate" : "In estimate"}</span>}</div>
    <strong className="sh-offer-shop">{offer.shopName}</strong><p className="sh-product-name">{offer.productName}</p>
    <div className="sh-offer-price"><strong>{money(offer.priceCents)}</strong><span>{offer.packageSize || "Pack size unknown"}</span></div>
    {offer.cost.lineCents != null ? <p className="sh-line-cost">{offer.cost.packs != null ? `${offer.cost.packs} ${offer.cost.packs === 1 ? "pack" : "packs"} · ` : ""}<strong>{money(offer.cost.lineCents)}</strong> for this quantity</p> : <p className="sh-muted">{offer.cost.reason || "Quantity cost cannot be calculated from this price."}</p>}
    {offer.match === "review" && <p className="sh-offer-warning">{offer.reviewReason || "Check the product match before using this price."}</p>}
    {offer.freshness === "stale" && <p className="sh-offer-warning">Older price — check again before shopping.</p>}
    {offer.stock === "UNKNOWN" && <p className="sh-offer-warning">Stock at this shop is not confirmed.</p>}
    <p className="sh-evidence">{offer.evidenceLabel}</p><p className="sh-price-time">{dateLabel(offer.fetchedAt)}</p>
    <div className="sh-offer-actions">{usable && !selected && (allowed ? <button type="button" className="sh-small-action" onClick={onSelect}>{offer.match === "review" ? "Use reviewed product" : "Use for this item"}</button> : <span className="sh-outside-strategy">Outside your shop choice</span>)}{url && <a href={url} target="_blank" rel="noreferrer">View product <ExternalLink size={12} /></a>}</div>
  </div>;
}

function RecordPrice({ line, area, shops, selectedShopId, onSaved, disabledReason, onChangeArea }: { line: ShoppingLine; area: string; shops: Shop[]; selectedShopId: string; onSaved: () => void; disabledReason: string; onChangeArea: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopName, setShopName] = useState("");
  const [price, setPrice] = useState("");
  const [pack, setPack] = useState("");
  const [url, setUrl] = useState("");
  const [pendingContext, setPendingContext] = useState<string | null>(null);
  const [feedbackState, setFeedbackState] = useState({ key: "", note: "" });
  const context = JSON.stringify([area, line.id, line.name, line.amount, line.unit, disabledReason]);
  const busy = pendingContext === context;
  const feedback = feedbackState.key === context ? feedbackState.note : "";
  const setFeedback = (note: string) => setFeedbackState({ key: context, note });
  const requestedShopId = shopId ?? selectedShopId;
  const effectiveShopId = shops.some((shop) => shop.id === requestedShopId) ? requestedShopId : "";
  const latest = useRef(context);
  const onSavedLatest = useRef(onSaved);
  useEffect(() => { latest.current = context; onSavedLatest.current = onSaved; }, [context, onSaved]);
  useEffect(() => () => { latest.current = ""; }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (disabledReason) { setFeedback(disabledReason); return; }
    const chosen = shops.find((shop) => shop.id === effectiveShopId);
    if (!area) { setFeedback("Choose your shopping area first."); return; }
    if (!(chosen?.name || shopName).trim() || !audToCents(price)) { setFeedback("Add the shop name and the price you saw."); return; }
    if (!pack.trim()) { setFeedback("Add a pack size, such as 500 g, 6 pack or each, so quantities can be compared."); return; }
    if (url.trim() && (!safeUrl(url.trim()) || !url.trim().startsWith("https://"))) { setFeedback("Use the shop's public https link, or leave the link blank."); return; }
    const requestContext = context;
    if (busy) return;
    setPendingContext(requestContext); setFeedback("");
    try {
      const response = await fetch(publicPath("/api/price-memory"), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ action: "record", device: deviceId(), shopId: chosen?.id || "", shopName: chosen?.name || shopName.trim(), area, itemName: line.name, price, packageSize: pack.trim(), kind: "recorded", ...(url.trim() ? { url: url.trim() } : {}) }), cache: "no-store" });
      const data = await response.json() as { error?: string; price?: unknown };
      if (latest.current !== requestContext) return;
      if (!response.ok || !data.price) throw new Error(data.error || "That price could not be saved. Your list is unchanged.");
      setFeedback("Price recorded for this shop and area. Refreshing the comparison…"); setPrice(""); onSavedLatest.current();
    } catch (error) { if (latest.current === requestContext) setFeedback(error instanceof Error ? error.message : "That price could not be saved. Please try again."); }
    finally { setPendingContext((previous) => previous === requestContext ? null : previous); }
  }
  if (disabledReason) return <details className="sh-record-price"><summary>Have a price from a local shop?</summary><p>{disabledReason}</p><button type="button" className="sh-text-button" onClick={onChangeArea}>Change area</button></details>;
  return <details className="sh-record-price" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}><summary>Have a price from a local shop?</summary>{expanded && <><p>Record the product or pack price you saw. It will be labelled with its source and date.</p><form onSubmit={(event) => void save(event)}>
    <label>Shop<select value={effectiveShopId} onChange={(event) => setShopId(event.target.value)}><option value="">Enter another shop</option>{shops.map((shop) => <option value={shop.id} key={shop.id}>{shop.name}</option>)}</select></label>
    {!effectiveShopId && <label>Shop name<input value={shopName} maxLength={80} onChange={(event) => setShopName(event.target.value)} placeholder="e.g. the local butcher" required /></label>}
    <div className="sh-record-grid"><label>Price you saw<input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="e.g. 4.50" maxLength={15} required /></label><label>Pack size / price unit<input value={pack} maxLength={80} onChange={(event) => setPack(event.target.value)} placeholder="e.g. 500 g or per kg" required /></label></div>
    <label>Product or shop link <span>(optional)</span><input type="url" value={url} maxLength={300} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label>
    <button className="sh-small-action" disabled={busy} type="submit">{busy ? "Saving price…" : "Save recorded price"}</button>{feedback && <p role="status">{feedback}</p>}
  </form></>}</details>;
}

export function ShoppingHub(props: ShoppingHubProps) {
  const { lines, location, radius, shopData, sourceId } = props;
  const [ingredientQuery, setIngredientQuery] = useState("");
  const [onlyUnpriced, setOnlyUnpriced] = useState(false);
  const [addName, setAddName] = useState("");
  const [addAmount, setAddAmount] = useState("1");
  const [addUnit, setAddUnit] = useState("each");
  const [listFeedback, setListFeedback] = useState("");
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [bought, setBought] = useState<Record<string, boolean>>({});
  const [boughtLoaded, setBoughtLoaded] = useState(false);
  const [shopQuery, setShopQuery] = useState("");
  const [shopKind, setShopKind] = useState<ShopKind | "all">("all");
  const [shopSort, setShopSort] = useState<"coverage" | "distance">("coverage");
  const [mobilePane, setMobilePane] = useState<"prices" | "shops">("prices");
  const [selectedShopId, setSelectedShopId] = useState("");
  const [strategyState, setStrategyState] = useState<{ key: string; value: ShoppingStrategy }>({ key: "", value: DEFAULT_SHOPPING_STRATEGY });
  const [expandedOffers, setExpandedOffers] = useState<Record<string, boolean>>({});
  const [comparison, setComparison] = useState<Comparison>(EMPTY);
  const comparisonAbort = useRef<AbortController | null>(null);
  const comparisonRevision = useRef(0);
  const currentSelections = useRef<{ key: string; offers: Record<string, string | null> }>({ key: "", offers: {} });
  const area = areaKey(`${location?.label || ""} ${location?.name || ""}`);
  const supportsPrices = australianPriceGuide(location?.country || "");
  const localRecords = !!location && location.id !== "current-location";
  const unsupportedPriceMessage = "Price comparison currently supports Australia; nearby shops and retailer links still work.";
  const recordDisabledReason = !supportsPrices ? unsupportedPriceMessage : !location || !localRecords ? "Choose a suburb or postcode before recording a local price, so it is saved in the right shopping area." : "";
  const shops = shopData?.shops || [];
  const strategyAreaKey = location ? JSON.stringify([area, location.country || "", location.lat.toFixed(4), location.lon.toFixed(4)]) : "";
  const strategy = strategyState.key === strategyAreaKey ? strategyState.value : DEFAULT_SHOPPING_STRATEGY;
  const specialistShops = availableSpecialistShops(shops, { location, radiusKm: radius });
  const priceContext = { lines, area, country: location?.country || "Australia", localRecords, shops: shops.map(shop => ({ id: shop.id, name: shop.name })), ...(location ? { location: { lat: location.lat, lon: location.lon }, radiusKm: radius } : {}) };
  const contextKey = JSON.stringify([sourceId, priceContextKey(priceContext)]);
  const current = comparison.key === contextKey ? comparison : EMPTY;
  const strategyResult = applyShoppingStrategy(lines, current.rows, strategy, { shops, location, radiusKm: radius, offerSelections: currentSelections.current.key === contextKey ? currentSelections.current.offers : {} });
  const rows = new Map(strategyResult.rows.map(row => [row.id, row]));
  const summary = strategyResult.summary;
  const matches = useMemo(() => rankShopsForList(lines, shopData?.shops || [], { radiusKm: radius }), [lines, shopData, radius]);
  const matchById = useMemo(() => new Map(matches.map((match) => [match.shop.id, match])), [matches]);
  const selectedShop = shops.find((shop) => shop.id === selectedShopId) || null;
  const selectedMatch = selectedShop ? matchById.get(selectedShop.id) : null;
  const visibleShops = useMemo(() => (shopData?.shops || []).filter((shop) => (!distanceKnown(shop.distanceKm) || shop.distanceKm <= radius) && (shopKind === "all" || shop.kind === shopKind) && `${shop.name} ${shop.address || ""}`.toLowerCase().includes(shopQuery.trim().toLowerCase())).sort((a, b) => Number(distanceKnown(b.distanceKm)) - Number(distanceKnown(a.distanceKm)) || (shopSort === "coverage" ? (matchById.get(b.id)?.matchedCount || 0) - (matchById.get(a.id)?.matchedCount || 0) : 0) || (distanceKnown(a.distanceKm) && distanceKnown(b.distanceKm) ? a.distanceKm - b.distanceKm : 0) || a.name.localeCompare(b.name)), [shopData, radius, shopKind, shopQuery, shopSort, matchById]);
  const visibleLines = lines.filter((line) => `${line.name} ${(line.aliases || []).join(" ")}`.toLowerCase().includes(ingredientQuery.trim().toLowerCase()) && (!onlyUnpriced || rows.get(line.id)?.estimatedCents == null));
  const nearbyTabLabel = !location ? "Nearby shops · choose area" : props.shopsLoading ? "Finding shops…" : shopData ? `Nearby shops (${visibleShops.length})` : "Nearby shops";
  const boughtCount = lines.filter((line) => bought[boughtKey(sourceId, line)]).length;
  const vendorSummaries = useMemo(() => shoppingVendorCards(current.rows, current.warnings, current.providerStatuses, { includeEmpty: lines.length > 0, checking: current.busy }), [current.rows, current.warnings, current.providerStatuses, current.busy, lines.length]);

  useEffect(() => {
    const saved = storedStrategies().find(value => value.key === strategyAreaKey);
    setStrategyState({ key: strategyAreaKey, value: saved?.value || DEFAULT_SHOPPING_STRATEGY });
  }, [strategyAreaKey]);

  function changeStrategy(patch: Partial<ShoppingStrategy>) {
    const next = normalizeShoppingStrategy({ ...strategy, ...patch });
    currentSelections.current = { key: contextKey, offers: {} };
    setStrategyState({ key: strategyAreaKey, value: next });
    if (strategyAreaKey) try {
      const saved = storedStrategies().filter(value => value.key !== strategyAreaKey);
      localStorage.setItem(STRATEGY_STORAGE, JSON.stringify([...saved, { key: strategyAreaKey, value: next }].slice(-12)));
    } catch { /* The active choice remains available for this visit. */ }
  }

  useEffect(() => {
    try { const stored = JSON.parse(localStorage.getItem("fusion-shopping-bought-v1") || "{}"); if (stored && typeof stored === "object" && !Array.isArray(stored)) setBought(Object.fromEntries(Object.entries(stored).filter(([key, value]) => key.length < 500 && value === true).slice(-2000)) as Record<string, boolean>); } catch { /* A checklist remains available without storage. */ }
    setBoughtLoaded(true);
  }, []);
  useEffect(() => { if (boughtLoaded) try { localStorage.setItem("fusion-shopping-bought-v1", JSON.stringify(bought)); } catch { /* Checklist still works for this visit. */ } }, [bought, boughtLoaded]);
  useEffect(() => {
    comparisonRevision.current += 1;
    comparisonAbort.current?.abort();
    return () => { comparisonRevision.current += 1; comparisonAbort.current?.abort(); };
  }, [contextKey]);

  function editAmount(line: ShoppingLine, value: string) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) { setListFeedback("Enter an amount above zero and no greater than 1,000,000."); return; }
    setListFeedback(""); props.onLinesChange(lines.map((item) => item.id === line.id ? { ...item, amount } : item));
  }
  function addIngredient(event: FormEvent) {
    event.preventDefault();
    const name = addName.trim().replace(/\s+/g, " "), amount = Number(addAmount);
    if (name.length < 2 || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) { setListFeedback("Add an ingredient name and an amount above zero."); return; }
    if (lines.length >= 200) { setListFeedback("This list has 200 ingredients. Start another list before adding more."); return; }
    props.onLinesChange([...lines, { id: `custom-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`, name, amount, unit: addUnit, allergens: [], aliases: [] }]);
    setAddName(""); setAddAmount("1"); setListFeedback(`${name} added to your custom shopping list.`);
  }
  function selectOffer(lineId: string, offer: ShoppingOffer | null) {
    if (offer && !isShoppingOfferSelectable(offer)) return;
    if (currentSelections.current.key !== contextKey) currentSelections.current = { key: contextKey, offers: {} };
    currentSelections.current.offers[lineId] = offer?.id ?? null;
    setComparison((previous) => previous.key === contextKey ? { ...previous, rows: previous.rows.map((row) => row.id === lineId ? applyShoppingOfferSelection(row, offer?.id ?? null) : row) } : previous);
  }
  async function compare() {
    setMobilePane("prices");
    if (!supportsPrices) return;
    if (!location || !area) { props.onChangeArea(); return; }
    if (!lines.length) { setListFeedback("Add ingredients or choose a meal or week first."); return; }
    comparisonAbort.current?.abort();
    const controller = new AbortController(); comparisonAbort.current = controller;
    const revision = ++comparisonRevision.current;
    const requestKey = contextKey;
    if (currentSelections.current.key !== requestKey) currentSelections.current = { key: requestKey, offers: {} };
    const merged = new Map<string, ShoppingCostLine>();
    const warnings: string[] = [];
    let providerStatuses: ShoppingProviderStatus[] = [];
    setComparison({ ...EMPTY, key: requestKey, busy: true, total: lines.length });
    try {
      for (let index = 0; index < lines.length; index += 6) {
        if (revision !== comparisonRevision.current || controller.signal.aborted) return;
        const batch = lines.slice(index, index + 6);
        const response = await fetch(publicPath("/api/shopping-prices"), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ ...priceContext, lines: batch, device: deviceId() }), cache: "no-store", signal: controller.signal });
        let data: { lines?: ShoppingCostLine[]; warnings?: string[]; error?: string; checkedAt?: string; providerStatuses?: unknown };
        try { data = await response.json(); } catch { throw new Error("The price service could not respond. Your list is still available."); }
        if (revision !== comparisonRevision.current || controller.signal.aborted) return;
        if (!response.ok || !Array.isArray(data.lines)) throw new Error(data.error || "Prices could not be checked. Your list is still available.");
        for (const row of data.lines) if (batch.some((line) => line.id === row.id) && Array.isArray(row.offers)) merged.set(row.id, row);
        for (const line of batch) if (!merged.has(line.id)) merged.set(line.id, { id: line.id, name: line.name, amount: line.amount, unit: line.unit, offers: [], chosenOfferId: null, estimatedCents: null, reason: "This item could not be priced in the response. Retry the comparison or record a price you saw." });
        for (const warning of data.warnings || []) if (typeof warning === "string" && !warnings.includes(warning)) warnings.push(warning);
        providerStatuses = mergeProviderStatuses(providerStatuses, readProviderStatuses(data.providerStatuses));
        const selectedRows = applyShoppingOfferSelections(lines.flatMap((line) => { const row = merged.get(line.id); return row ? [row] : []; }), currentSelections.current.key === requestKey ? currentSelections.current.offers : {});
        setComparison({ key: requestKey, rows: selectedRows, checked: Math.min(index + batch.length, lines.length), total: lines.length, busy: true, error: "", warnings: [...warnings], checkedAt: data.checkedAt || new Date().toISOString(), providerStatuses });
      }
    } catch (error) {
      if (revision === comparisonRevision.current && !controller.signal.aborted) setComparison((previous) => previous.key === requestKey ? { ...previous, error: error instanceof Error ? error.message : "Prices could not be checked. Try again when you're ready." } : previous);
    } finally {
      if (revision === comparisonRevision.current) { setComparison((previous) => previous.key === requestKey ? { ...previous, busy: false } : previous); comparisonAbort.current = null; }
    }
  }
  const automaticComparison = useEffectEvent(() => {
    const input = priceContext;
    const saved = cachedRecipePrices(input);
    if (saved && saved.checked === lines.length && !saved.error) {
      currentSelections.current = { key: contextKey, offers: {} };
      setComparison({ ...saved, key: contextKey, busy: false });
    } else void compare();
  });
  const canAutomaticallyCompare = !!location && !!area && supportsPrices && lines.length > 0;
  useEffect(() => {
    if (!canAutomaticallyCompare) return;
    const timer = setTimeout(() => automaticComparison(), 600);
    return () => clearTimeout(timer);
  }, [contextKey, canAutomaticallyCompare]);
  useEffect(() => {
    if (current.key !== contextKey || current.checked < lines.length || !lines.length) return;
    rememberRecipePrices(priceContext, current);
    // Context binds every request input; current changes when product choices change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, contextKey]);
  function cancelComparison() {
    comparisonAbort.current?.abort(); comparisonRevision.current += 1;
    setComparison((previous) => previous.key === contextKey ? { ...previous, busy: false, error: "Comparison paused. Results already found remain below; unpriced items stay unknown." } : previous);
  }

  const selectedShopDetail = (selectedShop && <section id={`sh-shop-detail-${selectedShop.id}`} className="sh-shop-detail" aria-label={`${selectedShop.name} details`}><div className="sh-detail-title"><h3>{selectedShop.name}</h3><button type="button" className="sh-icon-button" onClick={() => setSelectedShopId("")} aria-label="Close shop details"><X size={16} /></button></div><p>{SHOP_LABELS[selectedShop.kind]} · {distance(selectedShop.distanceKm)} away</p><p>{selectedShop.address || "Address details are not listed."}</p><div className="sh-shop-detail-actions">{location && <a href={`https://www.google.com/maps/dir/?api=1&origin=${location.lat},${location.lon}&destination=${selectedShop.lat},${selectedShop.lon}`} target="_blank" rel="noreferrer"><Navigation size={14} /> Directions</a>}{safeUrl(selectedShop.website) && <a href={safeUrl(selectedShop.website)!} target="_blank" rel="noreferrer">Website <ExternalLink size={12} /></a>}{selectedShop.phone && <a href={`tel:${selectedShop.phone.replace(/[^+\d]/g, "")}`}>Call shop</a>}</div>{selectedShop.openingHours && <details><summary>Listed opening hours</summary><p>{selectedShop.openingHours}</p></details>}{selectedMatch?.matchedIngredients.length ? <><h4>Ingredients to ask about</h4><ul>{selectedMatch.matchedIngredients.map((ingredient) => { const search = productSearchLink(selectedShop, ingredient.name, location?.name); return <li key={ingredient.id}><a href={search.url} target="_blank" rel="noreferrer">{ingredient.name}<ExternalLink size={11} /></a></li>; })}</ul></> : <p className="sh-muted">No ingredient range has been inferred for this listing.</p>}{specialistShops.butchers.some(shop => shop.id === selectedShop.id) && <button type="button" className="sh-small-action sh-use-shop" onClick={() => changeStrategy({ specialists: true, butcherShopId: selectedShop.id })}>Use this butcher for meat</button>}{specialistShops.produce.some(shop => shop.id === selectedShop.id) && <button type="button" className="sh-small-action sh-use-shop" onClick={() => changeStrategy({ specialists: true, produceShopId: selectedShop.id })}>Use this shop for fruit &amp; vegetables</button>}<p className="sh-muted">You can choose this shop without a listed price. Check stock, opening hours and product labels before travelling.</p></section>);

  return <div className="shopping-hub">
    <section className="sh-area" aria-label="Your shopping area"><div className="sh-area-copy"><span className="sh-eyebrow"><MapPin size={15} /> YOUR AREA</span><button type="button" className="sh-area-name" onClick={props.onChangeArea}>{location?.name || "Choose a suburb or postcode"}<ChevronDown size={18} /></button><p>{location ? location.label : "Find food shops nearby and keep recorded prices in the right area."}</p></div><div className="sh-area-radius"><label htmlFor="shopping-hub-radius">Within <strong>{radius} km</strong></label><input id="shopping-hub-radius" type="range" min={1} max={25} value={radius} onChange={(event) => props.onRadiusChange(Number(event.target.value))} /><span>Straight-line radius</span></div><button type="button" className="sh-quiet-button" onClick={props.onChangeArea}>Change area</button></section>
    <section className="sh-list-setup" aria-labelledby="sh-list-heading"><div className="sh-section-heading"><div><span className="sh-eyebrow">YOUR INGREDIENTS</span><h1 id="sh-list-heading">Shop your ingredients</h1></div>{props.onOpenRecipe && <button className="sh-text-button" type="button" onClick={props.onOpenRecipe}>Back to meal <ArrowRight size={14} /></button>}</div><label className="sh-source-select">Use ingredients from<select value={sourceId} onChange={(event) => props.onSourceChange(event.target.value)}>{props.sourceOptions.map((source) => <option key={source.id} value={source.id} disabled={source.disabled}>{source.label} · {source.count} {source.count === 1 ? "item" : "items"}</option>)}</select></label><p className="sh-list-label"><ShoppingBasket size={16} /><strong>{props.listLabel || "Custom shopping list"}</strong><span>{lines.length} {lines.length === 1 ? "ingredient" : "ingredients"}{boughtCount ? ` · ${boughtCount} marked bought` : ""}</span></p><form className="sh-quick-add" onSubmit={addIngredient}><label className="sh-add-name">Add an ingredient<input value={addName} maxLength={80} onChange={(event) => setAddName(event.target.value)} placeholder="e.g. chicken thighs, tomatoes, rice" /></label><label>Amount<input type="number" min="0.01" step="any" value={addAmount} onChange={(event) => setAddAmount(event.target.value)} /></label><label>Unit<select value={addUnit} onChange={(event) => setAddUnit(event.target.value)}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></label><button type="submit" className="sh-add-button"><Plus size={17} /> Add</button></form>{listFeedback && <p className="sh-inline-status" role="status">{listFeedback}</p>}<p className="sh-muted">Edit or add ingredients to make a custom copy. Your original meal and saved recipes stay intact.</p></section>
    <section className="sh-strategy" aria-labelledby="sh-strategy-heading">
      <div className="sh-section-heading"><div><span className="sh-eyebrow">YOUR SHOP CHOICE</span><h2 id="sh-strategy-heading">Where would you like to shop?</h2></div></div>
      <fieldset className="sh-strategy-modes"><legend className="sr-only">Supermarket preference</legend>{SHOPPING_MODES.map(mode => <label key={mode.id} className={strategy.mode === mode.id ? "sh-mode-selected" : ""}><input type="radio" name="shopping-strategy" value={mode.id} checked={strategy.mode === mode.id} onChange={() => changeStrategy({ mode: mode.id })} /><span>{mode.label}</span></label>)}</fieldset>
      <p className="sh-muted">{strategy.mode === "cheapest" ? "Use the lowest eligible pack cost for each ingredient, even when that means different shops. Travel and delivery costs are not included." : `Keep supermarket ingredients at ${SHOPPING_MODES.find(mode => mode.id === strategy.mode)?.label.replace(" only", "")}. Missing prices stay unknown; another supermarket is never substituted.`}</p>
      <button type="button" className="sh-specialist-toggle" aria-pressed={strategy.specialists} aria-expanded={strategy.specialists} aria-controls="sh-specialist-choices" onClick={() => changeStrategy({ specialists: !strategy.specialists })}><span aria-hidden="true">{strategy.specialists ? <Check size={15} /> : <Plus size={15} />}</span>Use local specialists for meat, fruit &amp; vegetables</button>
      {strategy.specialists && <div id="sh-specialist-choices" className="sh-specialist-choices">
        {!location ? <div className="sh-specialist-note"><p>Choose your area to find local butchers and fruit &amp; vegetable shops.</p><button className="sh-small-action" type="button" onClick={props.onChangeArea}>Choose area</button></div> : <>
          <div className="sh-specialist-selects"><label>Meat from<select aria-label="Meat from" value={strategy.butcherShopId} onChange={event => changeStrategy({ butcherShopId: event.target.value })}><option value="">{specialistShops.butchers.length ? "Nearest discovered butcher" : "No nearby butcher found"}</option>{strategy.butcherShopId && !specialistShops.butchers.some(shop => shop.id === strategy.butcherShopId) && <option value={strategy.butcherShopId}>Previously chosen butcher is outside these results</option>}{specialistShops.butchers.map(shop => <option key={shop.id} value={shop.id}>{shop.name} · {distance(shop.distanceKm)}</option>)}</select></label><label>Fruit &amp; vegetables from<select aria-label="Fruit and vegetables from" value={strategy.produceShopId} onChange={event => changeStrategy({ produceShopId: event.target.value })}><option value="">{specialistShops.produce.length ? "Nearest discovered fruit & vegetable shop" : "No nearby fruit & vegetable shop found"}</option>{strategy.produceShopId && !specialistShops.produce.some(shop => shop.id === strategy.produceShopId) && <option value={strategy.produceShopId}>Previously chosen produce shop is outside these results</option>}{specialistShops.produce.map(shop => <option key={shop.id} value={shop.id}>{shop.name} · {distance(shop.distanceKm)}</option>)}</select></label></div>
          {props.shopsLoading ? <p className="sh-muted" role="status">Finding local specialists within {radius} km…</p> : (!shopData || props.shopError || !specialistShops.butchers.length || !specialistShops.produce.length) && <div className="sh-specialist-note"><p>{props.shopError || "Only shops found inside your selected area and radius can be used. Try finding shops again or widening the radius if a shop is missing."}</p><button className="sh-small-action" type="button" onClick={props.onSearchShops}>Find local specialists</button></div>}
        </>}
        <p className="sh-muted">A shop can be on your list without publishing prices. Its items stay “Price unknown” until a usable price is found. Fresh meat and produce follow these choices; the rest follows your supermarket preference. Shop category does not confirm stock.</p>
      </div>}
    </section>
    <div className="sh-compare-bar"><div><strong>{lines.length ? `Compare ${lines.length} ${lines.length === 1 ? "ingredient" : "ingredients"}` : "Start with a meal, a week or your own list"}</strong><p>{location ? `For ${location.name} and nearby shops within ${radius} km` : "Choose your area, then check prices for the whole list."}</p></div><div className="sh-compare-actions">{lines.length > 0 && <button type="button" className="sh-text-button" onClick={() => props.onExport(strategyResult)}><Download size={15} /> Export list</button>}<button type="button" className="sh-primary-button" disabled={!lines.length || current.busy || !supportsPrices} onClick={() => void compare()}>{current.busy ? <LoaderCircle size={18} className="sh-spin" /> : <Search size={18} />}{current.busy ? `Checking ${current.checked} / ${current.total}` : !location ? "Choose area to compare" : "Compare prices"}</button>{current.busy && <button type="button" className="sh-text-button" onClick={cancelComparison}>Cancel</button>}</div></div>
    {!supportsPrices && <p className="sh-inline-status" role="status">{unsupportedPriceMessage}</p>}
    {location?.id === "current-location" && supportsPrices && <p className="sh-muted">Online catalogue comparisons are available. Choose a suburb or postcode to include or record local shop prices.</p>}
    {current.busy && <div className="sh-progress" role="status"><progress max={current.total || 1} value={current.checked} /><p>{current.checked} of {current.total} ingredients checked. Results appear below as they arrive.</p></div>}
    {!current.busy && current.checked > 0 && <p className="sh-inline-status" role="status">{current.checked} of {current.total} ingredients checked.</p>}
    {current.error && <div className="sh-error" role="alert"><strong>Some prices are still unknown</strong><p>{current.error}</p><button type="button" className="sh-small-action" onClick={() => void compare()} disabled={current.busy}>Try comparison again</button></div>}
    <div className="sh-mobile-view-switch" role="group" aria-label="Shopping results view"><button type="button" aria-pressed={mobilePane === "prices"} onClick={() => setMobilePane("prices")}>Prices ({lines.length})</button><button type="button" aria-pressed={mobilePane === "shops"} onClick={() => setMobilePane("shops")}>{nearbyTabLabel}</button></div>
    <div className="sh-main-layout" data-mobile-view={mobilePane}><section className="sh-ingredients" aria-labelledby="sh-results-heading"><div className="sh-section-heading"><div><span className="sh-eyebrow">PRICE COMPARISON</span><h2 id="sh-results-heading">Your list, item by item</h2></div></div>
      {lines.length > 0 && <div className="sh-cost-summary sh-selected-basket" aria-live="polite"><div><span>Your chosen shops · {summary.pricedLines} of {lines.length} items priced</span><strong>{summary.knownSubtotalCents == null ? "Prices unknown" : money(summary.knownSubtotalCents)}</strong><p>{summary.complete ? "Estimated packs to buy from your chosen shops." : `${summary.unpricedLines} ${summary.unpricedLines === 1 ? "item has" : "items have"} an unknown price. ${summary.knownSubtotalCents == null ? "No full basket total is available yet." : "This is the known subtotal, not the full basket total."}`}</p></div><p className="sh-muted">Unknown prices are not counted as $0, and planning allowances are not substituted. Online guides do not confirm local shelf prices or stock.{current.checkedAt ? ` Last check: ${dateLabel(current.checkedAt)}.` : ""}</p></div>}
      {vendorSummaries.length > 0 && <div className="sh-vendor-comparison" aria-label="Compare shop coverage">{vendorSummaries.map((vendor) => <div key={vendor.id} className={vendor.needsAction ? "sh-provider-action" : ""}><span>{vendor.scope === "chain-online" ? "Online price guide" : "Nearby shop"}</span><strong>{vendor.name}</strong><p>{vendor.pricedLines} / {lines.length} items priced</p><b>{vendor.cents == null ? "Not priced" : money(vendor.cents)}</b><small>{vendor.status || (vendor.pricedLines === lines.length ? "Estimated pack basket" : "Partial subtotal")}</small>{vendor.message && <p className="sh-provider-message">{vendor.message}</p>}{vendor.url && <a href={vendor.url} target="_blank" rel="noreferrer">{vendor.linkLabel} <ExternalLink size={11} /></a>}</div>)}<p>Choose your store on the retailer and confirm the product. Browser checks must be completed on that retailer. A smaller partial subtotal does not mean a cheaper full shop.</p></div>}
      {current.warnings.length > 0 && <details className="sh-source-notes"><summary>Price sources and availability notes</summary><ul>{current.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>}
      <div className="sh-list-filters"><label><Search size={16} /><span className="sr-only">Search your ingredients</span><input value={ingredientQuery} maxLength={80} onChange={(event) => setIngredientQuery(event.target.value)} placeholder="Find an ingredient" /></label><label className="sh-check-filter"><input type="checkbox" checked={onlyUnpriced} onChange={(event) => setOnlyUnpriced(event.target.checked)} /> Unpriced only</label></div>
      {!lines.length ? <div className="sh-empty"><ShoppingBasket size={32} /><h3>Your shopping list starts here.</h3><p>Choose a meal or week above, or add the ingredients you need.</p></div> : !visibleLines.length ? <div className="sh-empty"><p>No ingredients match this filter.</p><button type="button" className="sh-text-button" onClick={() => { setIngredientQuery(""); setOnlyUnpriced(false); }}>Show the whole list</button></div> : <div className="sh-item-list">{visibleLines.map((line) => {
        const row = rows.get(line.id), isBought = !!bought[boughtKey(sourceId, line)], draftKey = `${sourceId}|${line.id}`;
        const offers = row?.offers || [], showAll = !!expandedOffers[line.id];
        const previewOffers = shoppingOfferPreview(offers, row?.chosenOfferId || null);
        return <article key={line.id} className={`sh-item${isBought ? " sh-item-bought" : ""}`}><div className="sh-item-heading"><label className="sh-bought-control"><input type="checkbox" checked={isBought} onChange={() => setBought((previous) => ({ ...previous, [boughtKey(sourceId, line)]: !isBought }))} aria-label={`Mark ${line.name} as ${isBought ? "still to buy" : "bought"}`} /><span className="sh-bought-icon" aria-hidden="true">{isBought && <Check size={15} />}</span></label><div><h3>{line.name}</h3><p>Need {quantity(line.amount, line.unit)}{isBought ? " · Bought" : ""}</p></div><button type="button" className="sh-icon-button" aria-label={`Remove ${line.name} from shopping list`} onClick={() => props.onLinesChange(lines.filter((item) => item.id !== line.id))}><X size={18} /></button></div><div className="sh-quantity-edit"><label>Amount<input type="number" min="0.01" step="any" value={amountDrafts[draftKey] ?? line.amount} aria-label={`Amount needed for ${line.name}`} onChange={(event) => setAmountDrafts((previous) => ({ ...previous, [draftKey]: event.target.value }))} onBlur={(event) => { if (event.target.value !== String(line.amount)) editAmount(line, event.target.value); setAmountDrafts((previous) => { const next = { ...previous }; delete next[draftKey]; return next; }); }} /></label><label>Unit<select value={line.unit || "each"} aria-label={`Unit needed for ${line.name}`} onChange={(event) => props.onLinesChange(lines.map((item) => item.id === line.id ? { ...item, unit: event.target.value } : item))}>{!UNITS.includes(line.unit || "each") && <option value={line.unit}>{line.unit}</option>}{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></label></div>
          <div className={`sh-item-assignment${row?.selectionState === "unknown" ? " sh-assignment-unknown" : ""}`}><div><span>{row?.selectionState === "pantry" ? "Nothing to buy" : "On your shopping list"}</span><strong>{row?.assignedShop?.name || (row?.selectionState === "pantry" ? "Already covered" : strategy.specialists ? "Choose an available shop" : "Shop not priced yet")}</strong></div><div className="sh-assignment-cost"><strong>{row?.selectionState === "unknown" ? "Price unknown" : money(row?.estimatedCents)}</strong><span>{row?.selectionState === "unknown" ? "Not listed in the subtotal" : row?.selectionState === "pantry" ? "No purchase needed" : "Estimated packs to buy"}</span></div><p>{row?.strategyReason || "Compare prices to find a suitable product at your chosen shop."}</p></div>
          {!current.rows.some(checked => checked.id === line.id) && <p className="sh-unchecked">{current.busy ? "Waiting for this ingredient…" : !location ? "Choose your area above, then select Compare prices to see products and quantity costs." : "Select Compare prices to see products and quantity costs."}</p>}
          {offers.length > 0 && <><p className="sh-offer-comparison-label">Available offers · your shop choice controls which can be used</p><div className="sh-offer-grid">{(showAll ? offers : previewOffers).map((offer) => <OfferCard key={offer.id} offer={offer} selected={row?.chosenOfferId === offer.id} allowed={!!row?.allowedOfferIds.includes(offer.id)} onSelect={() => selectOffer(line.id, offer)} />)}</div>{offers.length > previewOffers.length && <button type="button" className="sh-text-button sh-more-offers" aria-expanded={showAll} onClick={() => setExpandedOffers((previous) => ({ ...previous, [line.id]: !showAll }))}>{showAll ? "Show fewer offers" : `See all ${offers.length} offers`}<ChevronDown size={14} /></button>}</>}
          {row?.chosenOfferId && <button type="button" className="sh-text-button" onClick={() => selectOffer(line.id, null)}>Exclude this product from store subtotal</button>}
          <div className="sh-item-shops">{matches.filter((match) => match.matchedIngredientIds.includes(line.id)).slice(0, 3).map((match) => { const search = productSearchLink(match.shop, line, location?.name); return <a key={match.shop.id} href={search.url} target="_blank" rel="noreferrer">{match.shop.name} <ExternalLink size={11} /></a>; })}</div><RecordPrice key={`${area}|${line.id}`} line={line} area={area} shops={shops} selectedShopId={row?.assignedShop?.shopId || selectedShopId} onSaved={() => void compare()} disabledReason={recordDisabledReason} onChangeArea={props.onChangeArea} /></article>;
      })}</div>}
    </section><aside className="sh-nearby" aria-labelledby="sh-nearby-heading"><div className="sh-section-heading"><div><span className="sh-eyebrow"><MapPin size={14} /> AROUND YOU</span><h2 id="sh-nearby-heading">Nearby food shops</h2></div></div><p className="sh-muted">Ranked by likely ingredient coverage and distance. Published website prices are checked for nearby fruit shops and butchers when available. Shop categories suggest where to ask; stock is not confirmed.</p><div className="sh-fresh-filters" role="group" aria-label="Fresh food shops"><button type="button" aria-pressed={shopKind === "produce"} onClick={() => { setShopKind(shopKind === "produce" ? "all" : "produce"); setShopQuery(""); }}>Fruit &amp; vegetables</button><button type="button" aria-pressed={shopKind === "butcher"} onClick={() => { setShopKind(shopKind === "butcher" ? "all" : "butcher"); setShopQuery(""); }}>Butchers</button></div><div className="sh-shop-filters"><label><span className="sr-only">Find a nearby shop</span><input value={shopQuery} maxLength={80} onChange={(event) => setShopQuery(event.target.value)} placeholder="Search shop name" /></label><label><span className="sr-only">Shop type</span><select value={shopKind} onChange={(event) => setShopKind(event.target.value as ShopKind | "all")}>{KINDS.map((kind) => <option key={kind} value={kind}>{kind === "all" ? "All food shops" : SHOP_LABELS[kind]}</option>)}</select></label><label><span className="sr-only">Order nearby shops</span><select value={shopSort} onChange={(event) => setShopSort(event.target.value as "coverage" | "distance")}><option value="coverage">Ingredient coverage first</option><option value="distance">Nearest first</option></select></label></div>
      {!location ? <div className="sh-empty"><MapPin size={28} /><p>Choose your area to find shops near you.</p><button className="sh-small-action" type="button" onClick={props.onChangeArea}>Choose area</button></div> : props.shopsLoading ? <div className="sh-shop-loading" role="status"><LoaderCircle className="sh-spin" size={24} /><p>Finding food shops within {radius} km…</p></div> : props.shopError ? <div className="sh-error" role="alert"><p>{props.shopError}</p><button type="button" className="sh-small-action" onClick={props.onSearchShops}>Retry nearby shops</button></div> : !shopData ? <div className="sh-empty"><p>Find supermarkets, produce shops, butchers and markets around {location.name}.</p><button type="button" className="sh-small-action" onClick={props.onSearchShops}>Find food shops</button></div> : <><p className="sh-result-count">{visibleShops.length} {visibleShops.length === 1 ? "shop" : "shops"} shown · within {radius} km</p>{!visibleShops.length && <div className="sh-empty"><p>No shops match this view. Try another type, a wider radius or a shorter name.</p></div>}<div className="sh-shop-list">{visibleShops.map((shop) => { const match = matchById.get(shop.id); return <div key={shop.id} className="sh-shop-entry"><button type="button" className={`sh-shop-card${selectedShopId === shop.id ? " sh-shop-selected" : ""}`} onClick={() => setSelectedShopId((previous) => previous === shop.id ? "" : shop.id)} aria-expanded={selectedShopId === shop.id} aria-controls={selectedShopId === shop.id ? `sh-shop-detail-${shop.id}` : undefined}><div><span className="sh-shop-kind">{SHOP_LABELS[shop.kind]}</span><strong>{shop.name}</strong><small>{shop.address || "Address not listed"}</small></div><span className="sh-shop-distance">{distance(shop.distanceKm)}</span><span className="sh-shop-coverage">{match?.matchedCount ? `Suggested for ${match.matchedCount} / ${lines.length} ingredients` : "Browse this shop"}</span></button>{selectedShopId === shop.id && selectedShopDetail}</div>; })}</div></>}
      {shopData && <p className="sh-attribution">Listings: <a href={safeUrl(shopData.attributionUrl) || "https://www.openstreetmap.org/copyright"} target="_blank" rel="noreferrer">{shopData.attribution}</a>. {dateLabel(shopData.fetchedAt)}. {shopData.notice}{shopData.truncated ? " Results are limited; try a smaller area." : ""}</p>}
    </aside></div>
  </div>;
}
