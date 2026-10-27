/** Pantry amounts stay on this device. Nothing here is a shop price or a verified stock level. */

export const VERDICTS = [
  { id: "wont", label: "Won't have again" },
  { id: "might", label: "Might have again" },
  { id: "will", label: "Will have again" },
  { id: "staple", label: "This is a new staple" },
] as const;

export type VerdictId = (typeof VERDICTS)[number]["id"];

export interface Stock {
  key: string;
  name: string;
  unit: string;
  onHand: number;
}

export interface UseLine {
  id: string;
  name: string;
  amount: number;
  unit: string;
  /** The household already has this ingredient. */
  have: boolean;
}

export interface ShopNeed {
  id: string;
  name: string;
  amount: number;
  unit: string;
  reason: string;
}

export interface MakeResult {
  pantry: Stock[];
  shopping: ShopNeed[];
  warnings: string[];
}

const CONSUMABLE = /\b(oils?|butter|margarine|ghee|flour|flours|cornflour|sugar|salt|pepper|vinegar|stock|soy sauce|fish sauce|oyster sauce|honey|yeast|rice|pasta|noodles|paprika|cumin|turmeric|spice|spices|milk|yogh?urt|cream)\b/i;

export function isConsumable(name: string): boolean {
  const text = name.toLowerCase().replace(/[’']/g, "");
  // Fresh peppers are produce, while ground pepper and chilli flakes are cupboard staples.
  if (/\b(?:red|green|yellow|orange|bell|sweet|fresh|roasted|charred) peppers?\b/.test(text)
    && !/\b(?:flakes?|powder|ground|dried|oil|sauce|paste)\b/.test(text)) return false;
  return CONSUMABLE.test(text);
}

export function pantryKey(name: string): string {
  return name.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** One food in one compatible measurement family. No density or culinary aliases are guessed. */
export function pantryAmountKey(name: string, unit: string): string {
  return `${pantryKey(name)}|${measure(unit).unit}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Only exact metric conversions are inferred. Spoons, cups and counts stay distinct. */
function measure(unit: string): { unit: string; factor: number } {
  const value = unit.trim().toLowerCase();
  if (/^(g|grams?|grammes?)$/.test(value)) return { unit: "g", factor: 1 };
  if (/^(kg|kilograms?|kilogrammes?)$/.test(value)) return { unit: "g", factor: 1000 };
  if (/^(ml|millilitres?|milliliters?)$/.test(value)) return { unit: "ml", factor: 1 };
  if (/^(l|litres?|liters?)$/.test(value)) return { unit: "ml", factor: 1000 };
  return { unit: value, factor: 1 };
}

export function formatPantryQuantity(value: number, unit: string): string {
  return `${round(value)}${unit.trim() ? ` ${unit.trim()}` : ""}`;
}

/** Read existing records without changing their storage shape or inferring ingredient density. */
export function pantryOnHand(pantry: readonly Stock[], name: string, unit: string): number {
  const target = measure(unit);
  const total = pantry.reduce((sum, item) => {
    const source = measure(item.unit);
    if (pantryKey(item.name) !== pantryKey(name) || source.unit !== target.unit || !Number.isFinite(item.onHand)) return sum;
    return sum + Math.max(0, item.onHand) * source.factor / target.factor;
  }, 0);
  return round(total);
}

function normalisedPantry(pantry: readonly Stock[]): Stock[] {
  const next = new Map<string, Stock>();
  for (const item of pantry) {
    const unit = measure(item.unit);
    const key = pantryKey(item.name);
    const id = `${key}|${unit.unit}`;
    const onHand = Number.isFinite(item.onHand) ? Math.max(0, item.onHand) * unit.factor : 0;
    const current = next.get(id);
    if (current) current.onHand = round(current.onHand + onHand);
    else next.set(id, { key, name: item.name, unit: unit.unit, onHand: round(onHand) });
  }
  return [...next.values()];
}

/** Allocate stock across recipe lines once, so two uses cannot both claim the same amount. */
export function pantryOwnedIds(pantry: readonly Stock[], lines: readonly { id: string; name: string; amount: number; unit: string }[]): Set<string> {
  const remaining = normalisedPantry(pantry);
  const owned = new Set<string>();
  for (const line of lines) {
    if (!Number.isFinite(line.amount) || line.amount <= 0) continue;
    const unit = measure(line.unit);
    const needed = line.amount * unit.factor;
    const stock = remaining.find((item) => item.key === pantryKey(line.name) && item.unit === unit.unit);
    if (!stock || stock.onHand + 1e-9 < needed) continue;
    owned.add(line.id);
    stock.onHand = round(Math.max(0, stock.onHand - needed));
  }
  return owned;
}

/**
 * Apply an explicit checkbox declaration immediately, without consuming stock.
 * A tick covers all checked uses of this food together; an untick clears this
 * food/measurement family except other checked uses. A caller may restore a
 * known partial amount when reversing a top-up made in this same interaction.
 */
export function declarePantryOwnership(pantry: readonly Stock[], lines: readonly UseLine[], changedId: string, restore?: { amount: number; unit: string }): Stock[] {
  const next = normalisedPantry(pantry);
  const changed = lines.find(item => item.id === changedId);
  if (!changed || !Number.isFinite(changed.amount) || changed.amount <= 0) return next;
  const target = measure(changed.unit), key = pantryKey(changed.name);
  const id = `${key}|${target.unit}`;
  const checked = groupedNeed(lines.filter(item => item.have)).get(id)?.amount || 0;
  const existing = next.find(item => item.key === key && item.unit === target.unit);
  let retained = 0;
  if (restore && Number.isFinite(restore.amount) && restore.amount >= 0) {
    const prior = measure(restore.unit);
    if (prior.unit === target.unit) retained = restore.amount * prior.factor;
  }
  const onHand = round(changed.have ? Math.max(existing?.onHand || 0, checked) : Math.max(checked, retained));
  if (existing) existing.onHand = onHand;
  else if (changed.have || onHand > 0) next.push({ key, name: changed.name, unit: target.unit, onHand });
  return next;
}

/**
 * Record a cook. Items marked as already owned are kept in the pantry and used first.
 * Oils, butter, flour and similar consumables are tracked even when they must be bought.
 * A shortfall is the amount still to buy. It is never a price.
 */
export function makeRecipe(pantry: readonly Stock[], lines: readonly UseLine[]): MakeResult {
  const prepared = prepareRecipe(pantry, lines);
  const next = prepared.pantry.map((item) => ({ ...item }));
  const warnings = [...prepared.warnings];
  for (const line of groupedNeed(lines).values()) {
    const stock = next.find((item) => item.key === pantryKey(line.name) && item.unit === line.unit);
    if (!stock) continue;
    const covered = stock.onHand + 1e-9 >= line.amount;
    stock.onHand = round(Math.max(0, stock.onHand - line.amount));
    if (covered && isConsumable(stock.name) && stock.onHand <= line.amount * 0.25) {
      warnings.push(`${stock.name} is getting low (${formatPantryQuantity(stock.onHand, stock.unit)} left).`);
    }
  }
  return { pantry: next, shopping: prepared.shopping, warnings };
}

/** Prepare shopping and record declared ownership without consuming any stock. */
export function prepareRecipe(pantry: readonly Stock[], lines: readonly UseLine[]): MakeResult {
  const next = rememberConsumables(pantry, lines);
  for (const line of groupedNeed(lines.filter((item) => item.have)).values()) {
    const key = pantryKey(line.name);
    const stock = next.find((item) => item.key === key && item.unit === line.unit);
    if (stock) stock.onHand = Math.max(stock.onHand, line.amount);
    else next.push({ key, name: line.name, unit: line.unit, onHand: line.amount });
  }
  const shopping = weekNeeds(next, lines).map((line) => ({
    ...line,
    reason: isConsumable(line.name) ? "Pantry staple, not enough on hand"
      : pantryOnHand(next, line.name, line.unit) > 0 ? "Not enough on hand" : "Not in the pantry",
  }));
  const warnings = shopping
    .filter((line) => pantryOnHand(next, line.name, line.unit) > 0 || isConsumable(line.name))
    .map((line) => `Not enough ${line.name}. You still need ${formatPantryQuantity(line.amount, line.unit)}.`);
  return { pantry: next, shopping, warnings };
}

interface WeekLine { id?: string; name: string; amount: number; unit: string }

function groupedNeed(lines: readonly WeekLine[]) {
  const need = new Map<string, { id: string; name: string; unit: string; amount: number }>();
  for (const line of lines) {
    if (!Number.isFinite(line.amount) || line.amount <= 0) continue;
    const unit = measure(line.unit);
    const id = `${pantryKey(line.name)}|${unit.unit}`;
    const amount = line.amount * unit.factor;
    const current = need.get(id);
    if (current) current.amount = round(current.amount + amount);
    else need.set(id, { id: line.id || id, name: line.name, unit: unit.unit, amount: round(amount) });
  }
  return need;
}

/**
 * Oils, butter, flour and similar cupboard items join the pantry as soon as a plan needs them.
 * A new item starts at zero on hand. It is not a price and it is not a claim that the jar is empty in the shop.
 */
export function rememberConsumables(pantry: readonly Stock[], lines: readonly WeekLine[]): Stock[] {
  const next = normalisedPantry(pantry);
  for (const item of groupedNeed(lines).values()) {
    if (!isConsumable(item.name)) continue;
    const key = pantryKey(item.name);
    if (next.some((entry) => entry.key === key && entry.unit === item.unit)) continue;
    next.push({ key, name: item.name, unit: item.unit, onHand: 0 });
  }
  return next;
}

/** Amounts still to buy for a week. Covered items are left off. Never a price. */
export function weekNeeds(pantry: readonly Stock[], lines: readonly WeekLine[]): ShopNeed[] {
  const out: ShopNeed[] = [];
  for (const item of groupedNeed(lines).values()) {
    const onHand = pantryOnHand(pantry, item.name, item.unit);
    if (onHand + 1e-9 >= item.amount) continue;
    out.push({
      id: item.id,
      name: item.name,
      amount: round(item.amount - Math.max(0, onHand)),
      unit: item.unit,
      reason: isConsumable(item.name) ? "Pantry staple, not enough for the week" : "Not enough for the week",
    });
  }
  return out;
}

/** Compare a week list with the pantry without using any of it up. */
export function weekShortfalls(pantry: readonly Stock[], lines: readonly WeekLine[]): string[] {
  const warnings: string[] = [];
  for (const item of groupedNeed(lines).values()) {
    const onHand = pantryOnHand(pantry, item.name, item.unit);
    if (onHand + 1e-9 < item.amount) {
      warnings.push(`Not enough ${item.name} for this week. Have ${formatPantryQuantity(onHand, item.unit)}, need ${formatPantryQuantity(item.amount, item.unit)}.`);
      if (isConsumable(item.name)) warnings[warnings.length - 1] += " It stays on the pantry list.";
    }
  }
  return warnings;
}
