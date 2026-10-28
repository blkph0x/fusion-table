import type { Shop } from "./locations.ts";
import { rankShopsForList, type ShoppingLine } from "./shopping.ts";
import type { ShoppingStrategyResult } from "./shopping-strategy.ts";

/** Spreadsheet cells are text, including user-entered ingredient/shop names. */
function cell(value: string): string {
  const text = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Export the chosen shopping route; an unlisted price is never exported as zero. */
export function shoppingListCsv(lines: readonly ShoppingLine[], options: {
  area?: string;
  shops?: readonly Shop[];
  radiusKm?: number;
  selection?: ShoppingStrategyResult;
} = {}): string {
  const ranked = rankShopsForList(lines, options.shops || [], { radiusKm: options.radiusKm });
  const assignments = new Map(options.selection?.rows.map(row => [row.id, row]));
  const header = ["Ingredient", "Quantity", "Selected shop", "Purchase cost AUD", "Price status", "Selected product", "Nearby shop suggestions", "Area"];
  const rows = lines.map(line => {
    const candidate = assignments.get(line.id);
    const row = candidate?.name === line.name && candidate.amount === line.amount && candidate.unit === line.unit ? candidate : undefined;
    const known = row && row.selectionState !== "unknown" && row.estimatedCents !== null && Number.isSafeInteger(row.estimatedCents) && row.estimatedCents >= 0;
    const offer = row?.offers.find(offer => offer.id === row.chosenOfferId);
    return [
      line.name,
      `${Number(line.amount.toFixed(2))} ${line.unit || "each"}`,
      row?.selectionState === "pantry" ? "Already at home" : row?.assignedShop?.name || "Not selected",
      known ? (row!.estimatedCents! / 100).toFixed(2) : "Price unknown",
      row?.selectionState === "pantry" ? "Nothing to buy" : known ? offer?.evidenceLabel || "Selected price guide" : "Price unknown / not listed",
      known ? offer?.productName || "" : "",
      ranked.filter(entry => entry.matchedIngredientIds.includes(line.id)).slice(0, 3).map(entry => entry.shop.name).join("; ") || "Search nearby shops",
      options.area || "Area not set",
    ];
  });
  return [header, ...rows].map(row => row.map(cell).join(",")).join("\r\n");
}
