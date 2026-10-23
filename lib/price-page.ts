/**
 * Read a public https shop page the visitor asked us to open.
 * No cookies, no login, no private address, and no second attempt if the shop refuses.
 */

import { lookup } from "node:dns/promises";
import { matchPagePrices, priceLines, type PagePick } from "./price-memory.ts";

export interface ShopPageRead {
  url: string;
  picks: PagePick[];
  lines: string[];
  note: string;
}

export function assertPublicShopUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Enter the shop's public https page.");
  }
  if (url.protocol !== "https:") throw new Error("The shop page has to be https.");
  if (url.username || url.password) throw new Error("The shop page cannot include a username or password.");
  if (url.port && url.port !== "443") throw new Error("The shop page has to be ordinary https.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("That address is not a public shop page.");
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || /^\d/.test(host) || host.includes("..")) {
    throw new Error("Enter the shop's public website, not an IP address.");
  }
  return url;
}

export function isBlockedAddress(address: string): boolean {
  const mapped = address.toLowerCase().startsWith("::ffff:") ? address.slice(7) : address;
  const v4 = mapped.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const v6 = address.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fe80") || v6.startsWith("fc") || v6.startsWith("fd")) return true;
  return !/^[0-9a-f:]+$/.test(v6);
}

export async function assertResolvesPublic(hostname: string, lookupImpl: typeof lookup = lookup): Promise<void> {
  let records: { address: string }[];
  try {
    records = await lookupImpl(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("That shop website did not resolve. Open it on this device and type the price you see.");
  }
  if (!records.length || records.some((record) => isBlockedAddress(record.address))) {
    throw new Error("That address is not a public shop page.");
  }
}

async function readBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < 500_000) {
    const step = await reader.read();
    if (step.done) break;
    received += step.value.byteLength;
    chunks.push(step.value);
  }
  reader.cancel().catch(() => undefined);
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes.slice(0, 500_000));
}

async function pull(url: URL, fetchImpl: typeof fetch, hops: number): Promise<Response> {
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "manual",
    headers: { Accept: "text/html, text/plain;q=0.5", "User-Agent": "FusionTable price reader (public page only)" },
    signal: AbortSignal.timeout(8000),
  });
  if (![301, 302, 303, 307, 308].includes(response.status) || hops >= 1) return response;
  const location = response.headers.get("location");
  if (!location) return response;
  const next = assertPublicShopUrl(new URL(location, url).toString());
  await assertResolvesPublic(next.hostname);
  return pull(next, fetchImpl, hops + 1);
}

export async function readShopPage(rawUrl: string, items: readonly string[], deps?: { fetch?: typeof fetch; lookup?: typeof lookup }): Promise<ShopPageRead> {
  const fetchImpl = deps?.fetch ?? fetch;
  const url = assertPublicShopUrl(rawUrl);
  await assertResolvesPublic(url.hostname, deps?.lookup);
  let response: Response;
  try {
    response = await pull(url, fetchImpl, 0);
  } catch (error) {
    if (error instanceof Error && /public shop page|https|resolve|username/i.test(error.message)) throw error;
    throw new Error("The page did not open from here. Open it on this device and type the price you see.");
  }
  if (!response.ok) {
    throw new Error("The shop page did not return its prices. Open it on this device and type the price you see.");
  }
  const type = response.headers.get("content-type") || "";
  if (type && !/text\/html|text\/plain|application\/xhtml/i.test(type)) {
    throw new Error("That page is not readable text. Open it on this device and type the price you see.");
  }
  const html = await readBody(response);
  const picks = matchPagePrices(html, items);
  const lines = priceLines(html);
  const note = picks.length
    ? "A public page named a price. It is not a shelf check. Correct it if the shop showed something else."
    : "No single price was readable for these items. Open the page on this device and type what you saw.";
  return { url: url.toString(), picks, lines, note };
}
