import type { ShoppingLine } from "./shopping.ts";
import { areaKey } from "./price-memory.ts";

export interface ShoppingPriceRequest {
  lines: ShoppingLine[];
  area: string;
  country: string;
  device: string;
  shops: { id: string; name: string }[];
  online: boolean;
  localRecords?: boolean;
}

const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
function clean(value: unknown, limit: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

/** Bound an incremental price check before making retailer requests. */
export function parseShoppingPriceRequest(value: unknown): ShoppingPriceRequest {
  const body = object(value);
  if (!body || !Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 6) throw new Error("Check between 1 and 6 ingredients at a time.");
  const area = areaKey(body.area);
  if (!area) throw new Error("Choose a suburb or postcode for your shopping area.");
  const seen = new Set<string>();
  const categories = new Set(["produce", "butcher", "fishmonger", "grocery", "specialty"]);
  const lines = body.lines.map((raw): ShoppingLine => {
    const line = object(raw);
    const id = clean(line?.id, 120), name = clean(line?.name, 160), unit = clean(line?.unit, 30);
    const amount = line?.amount;
    if (!id || name.length < 2 || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000 || typeof line?.unit !== "string" || line.unit.length > 30 || seen.has(id)) throw new Error("Each ingredient needs its own name, a positive quantity and a unit.");
    if (typeof line?.name !== "string" || line.name.length > 160 || typeof line?.id !== "string" || line.id.length > 120) throw new Error("An ingredient name is too long. Shorten it and try again.");
    seen.add(id);
    return {
      id, name, amount, unit,
      ...(typeof line.category === "string" && categories.has(line.category) ? { category: line.category as ShoppingLine["category"] } : {}),
      ...(Array.isArray(line.allergens) ? { allergens: line.allergens.filter((item): item is string => typeof item === "string" && item.length <= 40).slice(0, 20) } : {}),
    };
  });
  if (body.device !== undefined && (typeof body.device !== "string" || body.device.length > 128)) throw new Error("Refresh the shopping page and try again.");
  if (body.country !== undefined && (typeof body.country !== "string" || body.country.length > 80)) throw new Error("Choose a valid country for your shopping area.");
  if (body.online !== undefined && typeof body.online !== "boolean") throw new Error("Choose whether to check online price guides.");
  if (body.localRecords !== undefined && typeof body.localRecords !== "boolean") throw new Error("Choose a valid local-price setting.");
  const device = clean(body.device, 128) || "shopping";
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(device)) throw new Error("Refresh the shopping page and try again.");
  if (body.shops !== undefined && (!Array.isArray(body.shops) || body.shops.length > 120)) throw new Error("The nearby shop list is too large. Search a smaller area.");
  const shops = (Array.isArray(body.shops) ? body.shops : []).flatMap((entry) => {
    const shop = object(entry);
    if (typeof shop?.id !== "string" || shop.id.length > 120 || typeof shop?.name !== "string" || shop.name.length > 160) return [];
    const id = clean(shop.id, 120), name = clean(shop.name, 160);
    return id && name ? [{ id, name }] : [];
  });
  return { lines, area, device, shops, country: clean(body.country, 80), online: body.online !== false, localRecords: body.localRecords !== false };
}

export function australianPriceGuide(country: string): boolean {
  const value = country.trim().toLowerCase();
  return !value || ["au", "aus", "australia", "australian"].includes(value);
}
