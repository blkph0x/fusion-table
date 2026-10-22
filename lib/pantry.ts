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
  return CONSUMABLE.test(name.toLowerCase().replace(/[’']/g, ""));
}

export function pantryKey(name: string): string {
  return name.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function sameUnit(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function formatAmount(value: number): string {
  return String(round(value));
}

/**
 * Record a cook. Items marked as already owned are kept in the pantry and used first.
 * Oils, butter, flour and similar consumables are tracked even when they must be bought.
 * A shortfall is the amount still to buy. It is never a price.
 */
export function makeRecipe(pantry: readonly Stock[], lines: readonly UseLine[]): MakeResult {
  const next = pantry.map((item) => ({ ...item }));
  const shopping: ShopNeed[] = [];
  const warnings: string[] = [];

  for (const line of lines) {
    if (!Number.isFinite(line.amount) || line.amount <= 0) continue;
    const key = pantryKey(line.name);
    const consumable = isConsumable(line.name);
    let stock = next.find((item) => item.key === key && sameUnit(item.unit, line.unit));
    if (line.have) {
      if (!stock) {
        stock = { key, name: line.name, unit: line.unit, onHand: line.amount };
        next.push(stock);
      } else if (stock.onHand < line.amount) {
        stock.onHand = line.amount;
      }
    } else if (consumable && !stock) {
      stock = { key, name: line.name, unit: line.unit, onHand: 0 };
      next.push(stock);
    }

    if (!stock || !sameUnit(stock.unit, line.unit)) {
      shopping.push({ id: line.id, name: line.name, amount: round(line.amount), unit: line.unit, reason: "Not in the pantry" });
      continue;
    }

    if (stock.onHand + 1e-9 >= line.amount) {
      stock.onHand = round(stock.onHand - line.amount);
      if (consumable && stock.onHand <= line.amount * 0.25) {
        warnings.push(`${stock.name} is getting low (${formatAmount(stock.onHand)} ${stock.unit} left).`);
      }
    } else {
      const buy = round(line.amount - Math.max(0, stock.onHand));
      stock.onHand = 0;
      shopping.push({
        id: line.id,
        name: line.name,
        amount: buy,
        unit: line.unit,
        reason: consumable ? "Pantry staple, not enough on hand" : "Not enough on hand",
      });
      warnings.push(`Not enough ${line.name}. You still need ${formatAmount(buy)} ${line.unit}.`);
    }
  }

  return {
    pantry: next.filter((item) => item.onHand > 0 || isConsumable(item.name) || lines.some((line) => line.have && pantryKey(line.name) === item.key)),
    shopping,
    warnings,
  };
}

interface WeekLine { id?: string; name: string; amount: number; unit: string }

function groupedNeed(lines: readonly WeekLine[]) {
  const need = new Map<string, { id: string; name: string; unit: string; amount: number }>();
  for (const line of lines) {
    if (!Number.isFinite(line.amount) || line.amount <= 0) continue;
    const id = `${pantryKey(line.name)}|${line.unit.trim().toLowerCase()}`;
    const current = need.get(id);
    if (current) current.amount = round(current.amount + line.amount);
    else need.set(id, { id: line.id || id, name: line.name, unit: line.unit, amount: round(line.amount) });
  }
  return need;
}

/**
 * Oils, butter, flour and similar cupboard items join the pantry as soon as a plan needs them.
 * A new item starts at zero on hand. It is not a price and it is not a claim that the jar is empty in the shop.
 */
export function rememberConsumables(pantry: readonly Stock[], lines: readonly WeekLine[]): Stock[] {
  const next = pantry.map((item) => ({ ...item }));
  for (const item of groupedNeed(lines).values()) {
    if (!isConsumable(item.name)) continue;
    const key = pantryKey(item.name);
    if (next.some((entry) => entry.key === key && sameUnit(entry.unit, item.unit))) continue;
    next.push({ key, name: item.name, unit: item.unit, onHand: 0 });
  }
  return next;
}

/** Amounts still to buy for a week. Covered items are left off. Never a price. */
export function weekNeeds(pantry: readonly Stock[], lines: readonly WeekLine[]): ShopNeed[] {
  const out: ShopNeed[] = [];
  for (const item of groupedNeed(lines).values()) {
    const stock = pantry.find((entry) => entry.key === pantryKey(item.name) && sameUnit(entry.unit, item.unit));
    const onHand = stock?.onHand ?? 0;
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
    const stock = pantry.find((entry) => entry.key === pantryKey(item.name) && sameUnit(entry.unit, item.unit));
    const onHand = stock?.onHand ?? 0;
    if (onHand + 1e-9 < item.amount) {
      warnings.push(`Not enough ${item.name} for this week. Have ${formatAmount(onHand)} ${item.unit}, need ${formatAmount(item.amount)} ${item.unit}.`);
      if (isConsumable(item.name)) warnings[warnings.length - 1] += " It stays on the pantry list.";
    }
  }
  return warnings;
}
