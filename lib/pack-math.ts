/**
 * Pack and money helpers for Fusion Table.
 *
 * These mirror the Android domain rules (ceil packs, pantry once, integer cents)
 * for local estimates. They never invent a shelf price or claim a live retailer feed.
 * Unknown price is never treated as zero.
 */

export const PACK_MATH_LABEL =
  "Estimated pack count only. Not a shelf price, not Coles or ALDI, and not a verified within-budget total.";

export interface PackNeed {
  /** Required usable quantity after any pantry deduction (same unit as packSize). */
  required: number;
  /** Usable quantity in one pack (must be > 0). */
  packSize: number;
}

export interface PackResult {
  packs: number;
  /** packs * packSize when sized; null when required is unresolved. */
  purchasedQty: number | null;
  unresolved: boolean;
  reason?: string;
}

export interface MoneyLine {
  /** Integer Australian cents. Omit or null when unknown — never invent 0. */
  unitCents: number | null;
  packs: number;
}

export interface MoneySummary {
  knownCents: number;
  unpricedLines: number;
  /** True only when every line has a known unit price. */
  pricesAreVerified: boolean;
  /** Within-budget only when verified and knownCents <= budgetCents. */
  withinBudget: boolean | null;
  label: string;
}

/** Ceiling packs: 600 g needed / 500 g pack → 2 packs. */
export function packsRequired(need: PackNeed): PackResult {
  const { required, packSize } = need;
  if (!Number.isFinite(required) || required < 0 || !Number.isFinite(packSize) || packSize <= 0) {
    return { packs: 0, purchasedQty: null, unresolved: true, reason: "Quantity or pack size is not usable." };
  }
  if (required === 0) return { packs: 0, purchasedQty: 0, unresolved: false };
  const packs = Math.ceil(required / packSize);
  return { packs, purchasedQty: packs * packSize, unresolved: false };
}

/**
 * Deduct pantry once. Remaining required is max(0, needed - pantryOnHand).
 * Unlike units are not converted here — callers must pass matching units.
 */
export function remainingAfterPantry(needed: number, pantryOnHand: number): number {
  if (!Number.isFinite(needed) || needed < 0) return Number.NaN;
  if (!Number.isFinite(pantryOnHand) || pantryOnHand < 0) return needed;
  return Math.max(0, needed - pantryOnHand);
}

/** Example from the master prompt: 600 g / 500 g @ A$4 → A$8; with 200 g pantry → A$4. */
export function checkoutCentsForPacks(packs: number, unitCents: number | null): number | null {
  if (unitCents == null || !Number.isInteger(unitCents) || unitCents < 0) return null;
  if (!Number.isInteger(packs) || packs < 0) return null;
  return packs * unitCents;
}

export function summariseMoney(lines: readonly MoneyLine[], budgetCents: number | null): MoneySummary {
  let knownCents = 0;
  let unpricedLines = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.packs) || line.packs < 0) {
      unpricedLines += 1;
      continue;
    }
    const lineCents = checkoutCentsForPacks(line.packs, line.unitCents);
    if (lineCents == null) unpricedLines += 1;
    else knownCents += lineCents;
  }
  const pricesAreVerified = unpricedLines === 0 && lines.length > 0;
  let withinBudget: boolean | null = null;
  if (budgetCents != null && Number.isInteger(budgetCents) && budgetCents >= 0) {
    withinBudget = pricesAreVerified ? knownCents <= budgetCents : null;
  }
  return {
    knownCents,
    unpricedLines,
    pricesAreVerified,
    withinBudget,
    label: PACK_MATH_LABEL,
  };
}

/** Format integer cents as Australian dollars for display (estimate copy only). */
export function formatAudCents(cents: number): string {
  if (!Number.isInteger(cents)) return "unpriced";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}A$${(abs / 100).toFixed(2)}`;
}
