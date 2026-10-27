import type { ShoppingLine } from "./shopping.ts";
import type { RecipeIngredient } from "./recipe-types.ts";

type InputLine = { id?: string; name: string; amount: number; unit: string; category?: RecipeIngredient["category"]; allergens?: string[]; aliases?: string[] };
const units: Record<string, readonly [string, number]> = { kg: ["g", 1000], kilogram: ["g", 1000], kilograms: ["g", 1000], g: ["g", 1], grams: ["g", 1], gram: ["g", 1], l: ["ml", 1000], litre: ["ml", 1000], litres: ["ml", 1000], ml: ["ml", 1], millilitres: ["ml", 1], "": ["each", 1], ea: ["each", 1], each: ["each", 1], piece: ["each", 1], pieces: ["each", 1], cloves: ["cloves", 1], clove: ["cloves", 1] };
const cleanName = (name: string) => name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
function identity(name: string, unit: string): string {
  const value = `${name.toLocaleLowerCase("en-AU")}|${unit}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `item-${(hash >>> 0).toString(36)}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 45)}-${unit.replace(/[^a-z0-9]+/g, "-").slice(0, 15)}`;
}

/** Stable name+unit identities prevent one ingredient's grams and cloves sharing a selection. */
export function normalizeShoppingList(raw: readonly InputLine[], metadata: readonly RecipeIngredient[] = [], options: { preserveUnits?: boolean } = {}): ShoppingLine[] {
  const known = new Map(metadata.map((item) => [cleanName(item.name).toLocaleLowerCase("en-AU"), item]));
  const output = new Map<string, ShoppingLine>();
  for (const row of raw.slice(0, 500)) {
    if (!row || typeof row.name !== "string" || typeof row.unit !== "string" || !Number.isFinite(row.amount) || row.amount <= 0) continue;
    const name = cleanName(row.name), originalUnit = row.unit.trim().toLowerCase();
    if (name.length < 2 || name.length > 160 || originalUnit.length > 30) continue;
    const [unit, factor] = units[originalUnit] || [originalUnit, 1];
    const amount = Math.round(row.amount * factor * 1e6) / 1e6;
    if (amount <= 0 || amount > 1_000_000) continue;
    const id = identity(name, unit), previous = output.get(id), info = known.get(name.toLocaleLowerCase("en-AU"));
    if (previous) {
      const previousFactor = previous.unit === "kg" || previous.unit === "l" ? 1000 : 1;
      const combined = Math.round((previous.amount * previousFactor + amount) * 1e6) / 1e6;
      if (combined <= 1_000_000) previous.amount = combined / previousFactor;
      continue;
    }
    const categories = ["produce", "butcher", "fishmonger", "grocery", "specialty"];
    const category = row.category && categories.includes(row.category) ? row.category : info?.category;
    const allergens = Array.isArray(row.allergens) ? row.allergens.filter((item) => typeof item === "string" && item.length <= 40) : [];
    const aliases = Array.isArray(row.aliases) ? row.aliases.filter((item) => typeof item === "string" && item.length <= 160).slice(0, 12) : info?.aliases;
    const displayUnit = options.preserveUnits && ["kg", "kilogram", "kilograms", "l", "litre", "litres"].includes(originalUnit) ? unit === "g" ? "kg" : "l" : unit;
    const displayFactor = displayUnit === "kg" || displayUnit === "l" ? 1000 : 1;
    output.set(id, { id, name, amount: amount / displayFactor, unit: displayUnit, ...(category ? { category } : {}), allergens: [...new Set([...allergens, ...(info?.allergens || [])])], ...(aliases ? { aliases } : {}) });
    if (output.size >= 200) break;
  }
  return [...output.values()];
}

export function readCustomShopping(value: unknown): ShoppingLine[] {
  if (!Array.isArray(value)) return [];
  return normalizeShoppingList(value.filter((row): row is InputLine => !!row && typeof row === "object" && typeof row.name === "string" && typeof row.unit === "string" && typeof row.amount === "number").map(({ name, unit, amount }) => ({ name, unit, amount })), [], { preserveUnits: true });
}
