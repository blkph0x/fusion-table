import type { CookPace, Recipe } from "./recipe-types.ts";

const PACES = new Set<CookPace>(["quick", "morning", "lunch", "long"]);

export function isCookPace(value: unknown): value is CookPace {
  return typeof value === "string" && PACES.has(value as CookPace);
}

export const COOK_PACE_LABELS: Record<CookPace, string> = {
  quick: "Quick cook",
  morning: "Start in the morning",
  lunch: "Start at lunch",
  long: "Long smoke day",
};

const QUICK = "Quick session. Use the shorter grill or oven route already written in the method. Do not stop early. Poultry and mince still need at least 75°C in the centre. Whole cuts still need at least 71°C, then a rest of at least 3 minutes. Fish still needs at least 63°C in the thickest part. Long barbecue cuts must pass 71°C and finish probe-tender, usually 90–96°C. A short clock does not turn a brisket, shoulder or rack of ribs into a weeknight meal.";
const MORNING = "Morning start. Light an outdoor cooker after breakfast, or do the prep in the morning and cook later. Keep a low smoke chamber within 107–149°C (225–300°F). Probe the food separately. Start the side near the end. Keep finished hot food above 60°C. Do not leave it on the bench through the afternoon. Refrigerate anything that will not be served hot.";
const LUNCH = "Lunch start. Begin around midday for an evening meal. If the hours already in the method will not finish in time, use the covered-oven route in the steps and still cook to the thermometer endpoint. Do not push a low smoke above 149°C to hurry a long cut.";
const LONG = "Long smoke day. Plan about 12–16 hours, including the cook, a rest, and a hot hold above 60°C. The 1–1.5 kg pieces in these templates are usually probe-tender in the hours already written, not a 16-hour cook. For a true all-day smoke, use a larger unrolled piece, hold the chamber around 107–121°C (225–250°F), and finish at the same endpoint: past 71°C and probe-tender, usually 90–96°C. A whole packer brisket is not the 1.2 kg schedule. Outdoor smokers only. Do not leave food between 5°C and 60°C. These templates do not cover home cold-smoking or curing of raw food.";
const LONG_SHORT = "Long session. This plate is not a 16-hour smoke. Give yourself the afternoon to prep, cook to the checks in the method, and hold hot food above 60°C. A 12–16 hour smoke is for the large barbecue cuts, outdoors, finishing probe-tender rather than by the clock. Do not leave food between 5°C and 60°C.";

function sessionNote(recipe: Recipe, pace: CookPace): string {
  if (pace === "quick") return QUICK;
  if (pace === "morning") return MORNING;
  if (pace === "lunch") return LUNCH;
  const text = recipe.steps.map((step) => step.detail).join(" ");
  return recipe.cookMinutes >= 120 || /90–96/.test(text) ? LONG : LONG_SHORT;
}

function withPaceId(id: string, pace: CookPace): string {
  const tag = `-pace-${pace}`;
  if (id.includes(tag)) return id;
  if (/-sat-\d+$/.test(id)) return id.replace(/-sat-(\d+)$/, `${tag}-sat-$1`);
  return `${id}${tag}`;
}

/** Schedule note only. Ingredients, steps and thermometer endpoints stay as authored. */
export function applyCookPace<T extends Recipe>(recipe: T, pace: CookPace): T {
  return { ...recipe, id: withPaceId(recipe.id, pace), cookPace: pace, sessionNote: sessionNote(recipe, pace) };
}
