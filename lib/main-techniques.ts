import type { MeatCut } from "./cuts.ts";
import { foodWordHit } from "./food-words.ts";
import type { RecipeIngredient } from "./recipe-types.ts";
import type { DraftIngredient } from "./template-types.ts";

export interface StirFryCoatingInput {
  mainId: string;
  methodId: string;
  regionId: string;
  /** The authored four-serving raw-meat quantity, before public recipe scaling. */
  main: Pick<RecipeIngredient, "id" | "name" | "amount" | "unit">;
  cut?: MeatCut;
  servings: number;
  /** Existing four-serving neutral cooking oil allocation in Australian tablespoons. */
  mainOil: number;
  avoid?: readonly string[];
  dislikes?: readonly string[];
}

export interface StirFryCoating {
  /** Four-serving quantity; the recipe's normal ingredient scaling applies once. */
  ingredient: DraftIngredient;
  /** Serving-scaled preparation instruction. */
  detail: string;
  /** Four-serving oil allocations, whose sum equals the existing mainOil. */
  coatingOil: number;
  panOil: number;
  restMinutes: 15;
  note: string;
}

const REGIONS = new Set(["chinese", "cantonese", "sichuan", "hunan", "taiwanese", "shanghainese", "yunnan"]);
const MAINS = new Set(["beef", "chicken", "pork", "turkey"]);
const EXCLUDED_FORMS = new Set(["whole", "bone-in", "mince", "offal"]);
const CORN_WORDS = ["corn", "maize", "cornflour", "corn flour", "corn starch", "cornstarch", "maize starch"];
const UNSUITABLE_NAMES = /\b(?:bone[ -]?in|on the bone|whole|carcass(?:es)?|frames?|mince[d]?|ground|sausages?|links?|offal|livers?|kidneys?|hearts?|tongues?|oxtail|short ribs?|spare ribs?|hocks?|trotters?)\b/i;

function rounded(value: number): number { return Number(value.toFixed(4)); }
function number(value: number): string { return String(rounded(value)); }

function excludesCorn(input: StirFryCoatingInput): boolean {
  return [...(input.avoid ?? []), ...(input.dislikes ?? [])].some(term => {
    const words = term.toLowerCase().replace(/[^a-z]+/g, " ").split(" ");
    return words.some(word => ["corn", "maize", "cornflour", "cornstarch"].includes(word))
      || CORN_WORDS.some(name => foodWordHit(name, term));
  });
}

/** A light coating for selected thin stir-fry meats, using the main's existing oil. */
export function buildStirFryCoating(input: StirFryCoatingInput): StirFryCoating | null {
  if (input.methodId !== "stir-fried" || !MAINS.has(input.mainId) || !REGIONS.has(input.regionId) || excludesCorn(input)) return null;
  if (!Number.isInteger(input.servings) || input.servings <= 0 || !Number.isFinite(input.mainOil) || input.mainOil <= 0) return null;
  if (!Number.isFinite(input.main.amount) || input.main.amount <= 0) return null;
  const unit = input.main.unit.trim().toLowerCase();
  if (unit !== "g" && unit !== "kg") return null;
  if (input.cut && (input.cut.mainId !== input.mainId || EXCLUDED_FORMS.has(input.cut.form))) return null;
  if (UNSUITABLE_NAMES.test(`${input.main.name} ${input.cut?.shoppingName ?? ""}`)) return null;
  // Unspecified slow-cut forms may include bones. Only explicitly boneless slow
  // cuts can join this technique; their method still supplies the thin slicing.
  if (input.cut?.form === "slow" && !/\bboneless\b/i.test(input.cut.shoppingName)) return null;

  const grams = input.main.amount * (unit === "kg" ? 1000 : 1);
  const starch = rounded(grams * 0.015);
  const water = rounded(grams * 0.06);
  const scale = input.servings / 4;
  const coatingOil = input.mainOil / 4;
  const panOil = input.mainOil - coatingOil;
  const actualOilMl = coatingOil * 20 * scale;
  const actualPanOilMl = panOil * 20 * scale;
  if (![grams, starch, water, actualOilMl, actualPanOilMl].every(value => Number.isFinite(value) && value > 0)) return null;
  const ingredient: DraftIngredient = {
    id: "cornflour", name: "Cornflour (corn starch)", amount: starch, unit: "g", category: "grocery", allergens: [],
    aliases: ["cornflour", "corn starch", "cornstarch", "maize starch", "corn flour"],
    notes: "Use pure maize starch, not wheat flour. For the measured light stir-fry coating.",
  };
  return {
    ingredient,
    detail: `Slice the ${number(grams * scale)} g prepared boneless ${input.mainId} across the grain into even 3–5 mm pieces. Toss with ${number(starch * scale)} g cornflour (corn starch) and ${number(water * scale)} ml cold water until lightly coated and the water is absorbed. Mix in ${number(actualOilMl)} ml neutral cooking oil from the main's listed portion; keep the remaining ${number(actualPanOilMl)} ml for the pan. Cover and refrigerate at 5°C or colder for 15 minutes. Keep chilled until cooking, then stir-fry in uncrowded batches to the recipe's stated thermometer endpoint. Discard any coating mixture left in the raw-meat bowl. Wash hands, the bowl and utensils before handling cooked or ready-to-eat food.`,
    coatingOil, panOil, restMinutes: 15,
    note: "A light starch coating for thin stir-fry slices helps retain moisture. Rest chilled and complete the recipe's stated cooking endpoint.",
  };
}
