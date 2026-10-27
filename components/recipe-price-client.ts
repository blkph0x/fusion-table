import { publicPath } from "../lib/public-path.ts";
import type { ShoppingLine } from "../lib/shopping.ts";
import type { ShoppingCostLine } from "../lib/shopping-costs.ts";
import { mergeProviderStatuses, readProviderStatuses, type ShoppingProviderStatus } from "./shopping-offers.ts";
export interface RecipePriceContext { lines: ShoppingLine[]; area: string; country: string; localRecords: boolean; shops: { id: string; name: string }[]; location?: { lat: number; lon: number }; radiusKm?: number }
export interface RecipePriceResult { rows: ShoppingCostLine[]; checked: number; total: number; checkedAt: string | null; warnings: string[]; error: string; providerStatuses?: ShoppingProviderStatus[] }
export const priceContextKey = (input: RecipePriceContext) => JSON.stringify([input.area, (typeof input.country === "string" ? input.country.trim().toLowerCase() || "australia" : "unknown"), input.localRecords, input.shops.map(shop => [shop.id, shop.name]).sort(), input.lines.map(line => [line.id, line.name, line.amount, line.unit, line.category, line.allergens]), input.location ? [input.location.lat, input.location.lon] : null, input.radiusKm ?? null]);
const cache = new Map<string, { at: number; result: RecipePriceResult }>();
const pending = new Map<string, { listeners: Set<(result: RecipePriceResult) => void>; promise: Promise<RecipePriceResult> }>();
// Retain revisions only for cached or in-flight contexts (at most32+4).
// A manual choice must win over an automatic request started earlier.
const revisions = new Map<string, number>();
const blank = (total: number): RecipePriceResult => ({ rows: [], checked: 0, total, checkedAt: null, warnings: [], error: "" });
const device = () => { try { let value = localStorage.getItem("fusion-device") || ""; if (!/^[a-z0-9]{16,64}$/i.test(value)) { value = crypto.randomUUID().replaceAll("-", ""); localStorage.setItem("fusion-device", value); } return value; } catch { return "recipeautoprices"; } };
/** At most two small batches run together; identical requests share work for this visit. */
export async function fetchRecipePrices(input: RecipePriceContext, onProgress: (result: RecipePriceResult) => void, fetcher: typeof fetch = fetch): Promise<RecipePriceResult> {
  const rows = new Map<string, ShoppingCostLine>(), warnings = new Set<string>();
  let checked = 0, next = 0, checkedAt: string | null = null, error = "", providerStatuses: ShoppingProviderStatus[] = [];
  const snapshot = (): RecipePriceResult => ({ rows: input.lines.flatMap(line => rows.has(line.id) ? [rows.get(line.id)!] : []), checked, total: input.lines.length, checkedAt, warnings: [...warnings], error, providerStatuses });
  const batches = Array.from({ length: Math.ceil(input.lines.length / 6) }, (_, i) => input.lines.slice(i * 6, i * 6 + 6));
  async function work() {
    while (next < batches.length) {
      const batch = batches[next++];
      try {
        const response = await fetcher(publicPath("/api/shopping-prices"), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ ...input, lines: batch, device: device() }), signal: AbortSignal.timeout(38_000), cache: "no-store" });
        const payload = await response.json();
        const data = (payload && typeof payload === "object" ? payload : {}) as { lines?: ShoppingCostLine[]; error?: string; warnings?: unknown; checkedAt?: unknown; providerStatuses?: unknown };
        if (!response.ok || !Array.isArray(data.lines)) throw new Error(data.error || "Some prices could not be checked. Open the shopping list to retry.");
        for (const line of batch) {
          const row = data.lines.find((row: ShoppingCostLine) => row.id === line.id && row.name === line.name && row.amount === line.amount && row.unit === line.unit && Array.isArray(row.offers));
          rows.set(line.id, row || { ...line, offers: [], chosenOfferId: null, estimatedCents: null, reason: "Price unavailable for this ingredient." });
        }
        if (Array.isArray(data.warnings)) data.warnings.filter((value: unknown): value is string => typeof value === "string").forEach((value: string) => warnings.add(value));
        if (typeof data.checkedAt === "string" && Number.isFinite(Date.parse(data.checkedAt))) checkedAt = data.checkedAt;
        providerStatuses = mergeProviderStatuses(providerStatuses, readProviderStatuses(data.providerStatuses));
      } catch (failure) {
        error = failure instanceof Error ? failure.message : "Some prices are unavailable.";
        for (const line of batch) rows.set(line.id, { ...line, offers: [], chosenOfferId: null, estimatedCents: null, reason: "Price could not be checked. Retry from the shopping list." });
      }
      checked += batch.length; onProgress(snapshot());
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, batches.length) }, () => work()));
  return snapshot();
}
export function cachedRecipePrices(input: RecipePriceContext): RecipePriceResult | null {
  const hit = cache.get(priceContextKey(input));
  return hit && Date.now() - hit.at < 5 * 60_000 ? hit.result : null;
}
export function rememberRecipePrices(input: RecipePriceContext, result: RecipePriceResult): void {
  const key = priceContextKey(input);
  revisions.set(key, (revisions.get(key) ?? 0) + 1);
  cache.delete(key); cache.set(key, { at: Date.now(), result });
  while (cache.size > 32) { const oldest = cache.keys().next().value!; cache.delete(oldest); if (!pending.has(oldest)) revisions.delete(oldest); }
}
/** Cancellation detaches the view. Bounded shared requests may finish to warm the visit cache. */
export function observeRecipePrices(input: RecipePriceContext, listener: (result: RecipePriceResult) => void, force = false): () => void {
  const key = priceContextKey(input), hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < 5 * 60_000) { listener(hit.result); return () => {}; }
  const existing = pending.get(key);
  if (existing) { existing.listeners.add(listener); return () => { existing.listeners.delete(listener); }; }
  if (pending.size >= 4) { listener({ ...blank(input.lines.length), error: "Other recipe price checks are finishing. Try again shortly." }); return () => {}; }
  const listeners = new Set([listener]);
  const revision = revisions.get(key) ?? 0;
  const promise = fetchRecipePrices(input, result => {
    const reviewed = (revisions.get(key) ?? 0) !== revision ? cache.get(key)?.result : null;
    listeners.forEach(fn => fn(reviewed || result));
  }).then(result => {
    if ((revisions.get(key) ?? 0) === revision) rememberRecipePrices(input, result);
    return result;
  }).finally(() => { pending.delete(key); if (!cache.has(key)) revisions.delete(key); });
  pending.set(key, { listeners, promise });
  return () => { listeners.delete(listener); };
}
