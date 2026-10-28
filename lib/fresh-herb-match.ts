const LEAF_HERBS = /\b(?:coriander|cilantro|parsley|basil|mint|dill|rosemary|thyme|sage|oregano|tarragon|chives?|chervil)\b/;
const PRESERVED = /\b(?:dried|dry|ground|powder|seeds?|paste|sauce|oil|tea|infusion|flakes?|frozen|preserved|pickled|tinned|canned|jarred)\b/;
const plain = (value: string) => value.toLowerCase().replace(/[^a-z]+/g, " ").trim();

/** A tiny, generically named herb jar is not proof of the fresh leaves used by
 * a recipe. Keep uncertainty rather than assuming a fresh-to-dried conversion.
 * Explicit fresh/bunch/pot/punnet wording still permits genuinely small herbs. */
export function freshHerbPackUnverified(requested: string, productName: string, packageSize: string | null | undefined): boolean {
  const wanted = plain(requested), seen = plain(productName);
  if (!LEAF_HERBS.test(wanted) || PRESERVED.test(wanted)) return false;
  if (/\b(?:fresh|bunch(?:es)?|punnets?|potted|pots?|living|hydroponic|microherbs?|microgreens?)\b/.test(seen)) return false;
  const pack = (packageSize || "").trim().toLowerCase().replace(/×/g, "x").replace(/\s+/g, " ");
  const match = pack.match(/^(?:(\d{1,3})\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|g)(?:\s*x\s*(\d{1,3}))?$/);
  if (!match || match[1] && match[4]) return false;
  const grams = Number(match[2]) * (match[3] === "kg" ? 1000 : 1) * Number(match[1] || match[4] || 1);
  return Number.isFinite(grams) && grams > 0 && grams <= 10;
}
