/**
 * Prices people record, specials they record, and prices read from a public shop page.
 * None of these are a live shelf price and none are marked verified.
 * A missing price stays missing. It is never stored as $0.
 */

import { audToCents, formatAudCents } from "./product-match.ts";

export const RECORDED_LABEL = "You recorded this. Not a live catalogue and not a shelf check.";
export const SPECIAL_LABEL = "You recorded this special. Not a live catalogue and not a shelf check.";
export const PAGE_LABEL = "Read from a public shop page. Not checked on the shelf.";
export const PAGE_SPECIAL_LABEL = "Read from a public shop page as a special. Not checked on the shelf.";
const MAX_PRICES = 20_000;
const MAX_PAGES = 2_000;

export type PriceKind = "recorded" | "special" | "page";

export interface PriceMemory {
  id: string;
  at: string;
  shopName: string;
  shopId: string;
  area: string;
  itemKey: string;
  itemName: string;
  cents: number;
  kind: PriceKind;
  until: string;
  url: string;
  label: string;
}

export interface ShopPage {
  id: string;
  at: string;
  shopName: string;
  area: string;
  url: string;
}

export interface PriceLedger {
  prices: PriceMemory[];
  shopPages: ShopPage[];
}

export interface ItemQuote {
  itemKey: string;
  itemName: string;
  averageCents: number | null;
  averageCount: number;
  averageLabel: string | null;
  records: PriceMemory[];
  specials: PriceMemory[];
}

export function itemKey(name: string): string {
  return name.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
}

export function areaKey(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim().slice(0, 200);
  const postcode = text.match(/\b(\d{4})\b/);
  if (postcode) return postcode[1];
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return slug.length >= 2 ? slug : "";
}

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function centsOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 10_000_000) return value;
  return audToCents(value);
}

function dayOf(value: unknown): string {
  const text = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function asPrice(value: unknown): PriceMemory | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PriceMemory>;
  const cents = centsOf(row.cents);
  const itemName = clean(row.itemName, 80);
  const shopName = clean(row.shopName, 80);
  const area = areaKey(row.area);
  if (!cents || itemName.length < 2 || shopName.length < 2 || !area || typeof row.at !== "string") return null;
  const kind: PriceKind = row.kind === "special" || row.kind === "page" ? row.kind : "recorded";
  return {
    id: clean(row.id, 80) || "price",
    at: clean(row.at, 40),
    shopName, shopId: clean(row.shopId, 80), area,
    itemKey: itemKey(itemName), itemName, cents, kind,
    until: dayOf(row.until), url: clean(row.url, 300),
    label: kind === "special" ? (clean(row.url, 300) ? PAGE_SPECIAL_LABEL : SPECIAL_LABEL) : kind === "page" ? PAGE_LABEL : RECORDED_LABEL,
  };
}

export interface PriceInput {
  shopName: unknown;
  shopId?: unknown;
  area: unknown;
  itemName: unknown;
  cents?: unknown;
  price?: unknown;
  kind?: unknown;
  until?: unknown;
  url?: unknown;
}

export function rememberPrice<T extends PriceLedger>(ledger: T, input: PriceInput, now: string, id: string): { ledger: T; price?: PriceMemory; error?: string } {
  const itemName = clean(input.itemName, 80);
  const shopName = clean(input.shopName, 80);
  const area = areaKey(input.area);
  const cents = centsOf(input.cents ?? input.price);
  if (!cents) return { ledger, error: "Enter the price you saw, above $0. A blank price is not saved as $0." };
  if (shopName.length < 2) return { ledger, error: "Name the shop you saw that price in." };
  if (itemName.length < 2) return { ledger, error: "Name the item." };
  if (!area) return { ledger, error: "Add a postcode or suburb so this price stays with that area." };
  if (ledger.prices.length >= MAX_PRICES) return { ledger, error: "The price book is full. Nothing already saved was deleted." };
  const kind: PriceKind = input.kind === "special" || input.kind === "page" ? input.kind : "recorded";
  const until = kind === "special" ? dayOf(input.until) : "";
  const price = asPrice({
    id, at: now, shopName, shopId: clean(input.shopId, 80), area, itemName, cents, kind, until, url: clean(input.url, 300),
  });
  if (!price) return { ledger, error: "That price could not be saved. Nothing was invented." };
  return { ledger: { ...ledger, prices: [...ledger.prices, price] }, price };
}

export interface ShopPageInput {
  shopName: unknown;
  area: unknown;
  url: unknown;
}

export function rememberShopPage<T extends PriceLedger>(ledger: T, input: ShopPageInput, now: string, id: string, url: string): { ledger: T; error?: string } {
  const shopName = clean(input.shopName, 80);
  const area = areaKey(input.area);
  if (shopName.length < 2 || !area) return { ledger, error: "Name the shop and the postcode or suburb." };
  if (ledger.shopPages.some((page) => page.shopName === shopName && page.area === area && page.url === url)) return { ledger };
  if (ledger.shopPages.length >= MAX_PAGES) return { ledger, error: "The shop-page list is full. Nothing already saved was deleted." };
  const page: ShopPage = { id, at: now, shopName, area, url };
  return { ledger: { ...ledger, shopPages: [...ledger.shopPages, page] } };
}

function meanHalfUp(values: readonly number[]): number {
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.round(sum / values.length);
}

export function quoteItems(ledger: PriceLedger, areaValue: unknown, items: readonly string[], today: string): ItemQuote[] {
  const area = areaKey(areaValue);
  const prices = ledger.prices.map(asPrice).filter((row): row is PriceMemory => !!row);
  return items.slice(0, 16).map((itemName) => {
    const key = itemKey(itemName);
    const mine = area ? prices.filter((row) => row.area === area && row.itemKey === key) : [];
    const recorded = mine.filter((row) => row.kind === "recorded");
    const specials = mine.filter((row) => row.kind === "special" && (!row.until || row.until >= today));
    const pages = mine.filter((row) => row.kind === "page");
    const averageCents = recorded.length >= 2 ? meanHalfUp(recorded.map((row) => row.cents)) : null;
    const shown = formatAudCents(averageCents);
    return {
      itemKey: key,
      itemName: clean(itemName, 80) || itemName,
      averageCents,
      averageCount: recorded.length,
      averageLabel: shown ? `Average of ${recorded.length} prices people recorded for ${itemName} in ${area}. ${shown}. Not a shelf price.` : null,
      records: [...recorded, ...pages].slice(-8).reverse(),
      specials: specials.slice(-8).reverse(),
    };
  });
}

export function shopPagesFor(ledger: PriceLedger, areaValue: unknown): ShopPage[] {
  const area = areaKey(areaValue);
  if (!area) return [];
  return ledger.shopPages.filter((page) => page && page.area === area && typeof page.url === "string").slice(-20).reverse();
}

export interface PagePick {
  item: string;
  cents: number;
  special: boolean;
  line: string;
}

const HIDDEN = /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi;
const BREAKS = /<(?:br|\/p|\/div|\/li|\/tr|\/h\d)\b[^>]*>/gi;
const MONEY = /(?:a\$|\$)\s*(\d{1,5})(?:\.(\d{2}))?/gi;

export function htmlToLines(html: string): string[] {
  const text = html
    .replace(HIDDEN, " ")
    .replace(BREAKS, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&#36;|&dollar;/gi, "$")
    .replace(/&lt;|&#60;/gi, "<")
    .replace(/&gt;|&#62;/gi, ">");
  return text.split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 400);
}

export function pricesOnLine(line: string): number[] {
  const found: number[] = [];
  for (const match of line.matchAll(MONEY)) {
    const cents = audToCents(`${match[1]}.${match[2] || "00"}`);
    if (cents) found.push(cents);
  }
  return found;
}

/** A pick is saved only when one line names the item and shows a price. Anything ambiguous is left for the person to type. */
export function matchPagePrices(html: string, items: readonly string[]): PagePick[] {
  const lines = htmlToLines(html);
  const picks: PagePick[] = [];
  for (const item of items.slice(0, 16)) {
    const words = itemKey(item).split(" ").filter((word) => word.length >= 3);
    if (!words.length) continue;
    const hits = lines.filter((line) => {
      const folded = line.toLowerCase();
      return words.every((word) => folded.includes(word));
    });
    if (hits.length !== 1) continue;
    const amounts = pricesOnLine(hits[0]);
    if (!amounts.length) continue;
    picks.push({
      item,
      cents: amounts[amounts.length - 1],
      special: /\b(specials?|was|save)\b/i.test(hits[0]),
      line: hits[0].slice(0, 180),
    });
  }
  return picks;
}

export function priceLines(html: string): string[] {
  return htmlToLines(html).filter((line) => pricesOnLine(line).length > 0).slice(0, 8);
}
