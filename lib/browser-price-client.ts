import { publicShopUrl } from "./public-shop-reader.ts";
import { withDeadline } from "./abort-deadline.mjs";
/** Private, anonymous browser renderer. No visitor cookies or account data cross this boundary. */
export interface SelectedStoreProof { id: string; name: string; address: string; retailerStoreId?: string }
export type RetailerPageRenderer = (url: string, signal?: AbortSignal) => Promise<{ html: string; url: string; status?: number; selectedStore?: SelectedStoreProof }>;
export interface BrowserStoreContext { id: string; name: string; area: string; address?: string | null; lat?: number; lon?: number }
export class BrowserPriceError extends Error {
  readonly providerStatus: "needs-browser" | "needs-store" | "unavailable" | "not-configured";
  constructor(message: string, providerStatus: "needs-browser" | "needs-store" | "unavailable" | "not-configured" = "unavailable") { super(message); this.name = "BrowserPriceError"; this.providerStatus = providerStatus; }
}
export function browserPriceRenderer(endpoint: string | undefined, fetchImpl: typeof fetch = fetch, store?: BrowserStoreContext, source: "retailer" | "local-shop" = "retailer"): RetailerPageRenderer | undefined {
  if (!endpoint) return;
  const address = new URL(endpoint);
  if (address.protocol !== "http:" || address.hostname !== "127.0.0.1" || address.username || address.password || address.search || address.hash) throw new Error("The retailer browser must use a private loopback endpoint.");
  return async (url, signal) => {
    const page = new URL(url);
    if (source === "local-shop") publicShopUrl(url);
    else if (page.protocol !== "https:" || !["www.coles.com.au", "www.aldi.com.au", "www.igashop.com.au", "www.woolworths.com.au"].includes(page.hostname) || page.username || page.password || page.port) throw new BrowserPriceError("Only official Australian retailer pages can be checked.");
    return withDeadline(30_000, [signal], async boundedSignal => {
    const response = await fetchImpl(address.href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: page.href, ...(source === "local-shop" ? { source } : {}), ...(store && page.hostname === "www.igashop.com.au" ? { store } : {}) }), signal: boundedSignal, redirect: "error" });
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > 4_000_000) { await response.body?.cancel().catch(() => undefined); throw new BrowserPriceError("The retailer browser response exceeded its limit."); }
    const reader = response.body?.getReader();
    if (!reader) throw new BrowserPriceError("The retailer browser returned no page.");
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 4_000_000) throw new BrowserPriceError("The retailer browser response exceeded its limit."); chunks.push(part.value); } }
    finally { await reader.cancel().catch(() => undefined); }
    const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new BrowserPriceError("The retailer browser returned an unreadable response."); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new BrowserPriceError("The retailer browser returned an unexpected response.");
    const data = parsed as Record<string, unknown>;
    if (!response.ok || data.providerStatus && data.providerStatus !== "ready") throw new BrowserPriceError(typeof data.message === "string" ? data.message.slice(0, 240) : "The retailer browser could not return prices.", data.providerStatus === "needs-browser" || data.providerStatus === "needs-store" || data.providerStatus === "not-configured" ? data.providerStatus : "unavailable");
    if (typeof data.html !== "string" || data.html.length > 3_000_000 || typeof data.url !== "string" || data.status !== undefined && (!Number.isInteger(data.status) || (data.status as number) < 100 || (data.status as number) > 599)) throw new BrowserPriceError("The retailer browser returned an unexpected page.");
    let final: URL; try { final = new URL(data.url); } catch { throw new BrowserPriceError("The retailer browser returned an unexpected page."); }
    if (final.protocol !== "https:" || final.port || final.username || final.password || (source === "local-shop" ? final.hostname.replace(/^www\./, "") !== page.hostname.replace(/^www\./, "") : final.origin !== page.origin)) throw new BrowserPriceError("The retailer browser returned an unexpected page.");
    let selectedStore: SelectedStoreProof | undefined;
    if (data.selectedStore !== undefined) {
      const proof = data.selectedStore && typeof data.selectedStore === "object" && !Array.isArray(data.selectedStore) ? data.selectedStore as Record<string, unknown> : null;
      if (!store || !proof || proof.id !== store.id || typeof proof.name !== "string" || !proof.name.trim() || proof.name.length > 180 || typeof proof.address !== "string" || !proof.address.trim() || proof.address.length > 600 || /[\u0000-\u001f<>]/.test(proof.name + proof.address) || proof.retailerStoreId !== undefined && (typeof proof.retailerStoreId !== "string" || !/^\d{1,24}$/.test(proof.retailerStoreId))) throw new BrowserPriceError("The retailer browser returned an unverified store.", "needs-store");
      selectedStore = { id: store.id, name: proof.name.trim(), address: proof.address.trim(), ...(typeof proof.retailerStoreId === "string" ? { retailerStoreId: proof.retailerStoreId } : {}) };
    }
    return { html: data.html, url: data.url, status: typeof data.status === "number" ? data.status : 200, ...(selectedStore ? { selectedStore } : {}) };
    });
  };
}
/** Call only for websites obtained from verified server-side nearby-shop discovery. */
export function localShopPageRenderer(endpoint: string | undefined, fetchImpl: typeof fetch = fetch): RetailerPageRenderer | undefined {
  return browserPriceRenderer(endpoint, fetchImpl, undefined, "local-shop");
}
