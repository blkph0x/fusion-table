import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PACK_MATH_LABEL,
  checkoutCentsForPacks,
  formatAudCents,
  packsRequired,
  remainingAfterPantry,
  summariseMoney,
} from "../lib/pack-math.ts";

describe("pack and money maths (estimate only)", () => {
  it("uses ceil packs: 600 g / 500 g → 2 packs; pantry 200 g → 1 pack", () => {
    assert.deepEqual(packsRequired({ required: 600, packSize: 500 }), { packs: 2, purchasedQty: 1000, unresolved: false });
    const remaining = remainingAfterPantry(600, 200);
    assert.equal(remaining, 400);
    assert.deepEqual(packsRequired({ required: remaining, packSize: 500 }), { packs: 1, purchasedQty: 500, unresolved: false });
  });

  it("never treats unknown price as zero or within-budget when unpriced", () => {
    assert.equal(checkoutCentsForPacks(2, 400), 800);
    assert.equal(checkoutCentsForPacks(1, 400), 400);
    assert.equal(checkoutCentsForPacks(2, null), null);
    const partial = summariseMoney(
      [
        { packs: 2, unitCents: 400 },
        { packs: 1, unitCents: null },
      ],
      2000,
    );
    assert.equal(partial.knownCents, 800);
    assert.equal(partial.unpricedLines, 1);
    assert.equal(partial.pricesAreVerified, false);
    assert.equal(partial.withinBudget, null);
    assert.equal(partial.label, PACK_MATH_LABEL);
    const full = summariseMoney([{ packs: 2, unitCents: 400 }], 900);
    assert.equal(full.pricesAreVerified, true);
    assert.equal(full.withinBudget, true);
    assert.equal(formatAudCents(800), "A$8.00");
  });

  it("rejects zero or negative pack sizes as unresolved", () => {
    assert.equal(packsRequired({ required: 100, packSize: 0 }).unresolved, true);
    assert.equal(packsRequired({ required: -1, packSize: 100 }).unresolved, true);
    assert.equal(packsRequired({ required: 0, packSize: 100 }).packs, 0);
  });
});
