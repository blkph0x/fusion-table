/**
 * Hot-smoke affinity: which mains and cuts belong on a smoker,
 * and how to prepare them (bark, stall, rest, slice/pull).
 * Mince, patties, eggs, prawns and other non-smoked items stay off this method.
 */

import { getCut, type MeatCut } from "./cuts.ts";

/** Mains that may offer the smoked cooking method. */
export const SMOKE_MAINS = new Set([
  "beef",
  "pork",
  "lamb",
  "chicken",
  "turkey",
  "duck",
  "salmon",
  "mushrooms",
  "tempeh",
  "tofu",
  "jackfruit",
]);

/** Mains that must never use smoked (even if a cut were forced). */
export const NEVER_SMOKE_MAINS = new Set([
  "eggs",
  "prawns",
  "halloumi",
  "paneer",
  "lentils",
  "chickpeas",
  "butter-beans",
  "black-beans",
  "kidney-beans",
  "white-fish",
  "tuna",
  "sardines",
  "kangaroo",
  "aubergine",
  "cauliflower",
  "pumpkin",
  "sweet-potato",
  "courgette",
  "broccoli",
]);

/**
 * Butcher cuts that are commonly hot-smoked.
 * Mince, steak-only pieces, and offal are intentionally absent.
 */
export const SMOKE_STAPLE_CUTS = new Set([
  "beef-brisket", "angus-brisket", "wagyu-brisket",
  "beef-short-rib", "beef-chuck",
  "pork-ribs", "pork-belly", "pork-shoulder", "pork-hock", "pork-neck", "pork-leg",
  "lamb-shoulder", "lamb-breast", "lamb-shank",
  "chicken-thigh-bone", "chicken-drumstick", "chicken-wing", "chicken-wingette",
  "chicken-maryland", "chicken-whole", "chicken-spatchcock", "chicken-thigh-fillet",
  "turkey-breast", "turkey-thigh", "turkey-whole",
]);

export function mainAllowsSmoke(mainId: string): boolean {
  return SMOKE_MAINS.has(mainId) && !NEVER_SMOKE_MAINS.has(mainId);
}

export function cutAllowedForSmoke(cut: MeatCut): boolean {
  if (!mainAllowsSmoke(cut.mainId)) return false;
  if (cut.form === "mince" || cut.form === "offal") return false;
  if (cut.form === "steak") return false; // steaks grill; they are not low-and-slow smoke joints
  return SMOKE_STAPLE_CUTS.has(cut.id);
}

export function smokeMismatchMessage(mainId: string, cutId?: string): string {
  if (NEVER_SMOKE_MAINS.has(mainId) || !SMOKE_MAINS.has(mainId)) {
    return "Hot-smoking is not a realistic method for that main. Choose grilled, braised or another technique.";
  }
  if (cutId) {
    const cut = getCut(cutId);
    if (cut?.form === "mince") {
      return "Mince is not hot-smoked as a joint. Choose patties, or pick brisket, ribs or another smoke staple cut.";
    }
    if (cut && !cutAllowedForSmoke(cut)) {
      return `${cut.shoppingName} is not a usual hot-smoke cut. Choose brisket, ribs, belly, shoulder or another smoke staple, or leave the cut blank.`;
    }
  }
  return "That cut does not suit hot-smoking.";
}

export interface SmokePlan {
  shoppingName: string;
  preparation: string;
  endpoint: string;
  minutes: number;
  /** Rest / slice vs pull finishing cue. */
  finish: "slice" | "pull" | "portion";
  safetySource: string;
}

const SMOKE_SAFETY = "https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/smoking-meat-and-poultry";

/** Default smoke plan when no cut is chosen (method-first shopping name). */
export function defaultSmokePlan(mainId: string): SmokePlan | null {
  if (!mainAllowsSmoke(mainId)) return null;
  switch (mainId) {
    case "beef":
      return {
        shoppingName: "Beef brisket",
        preparation: "Trim the fat layer to about 5 mm. Leave the brisket as one piece — do not cut into steaks or mince it. Pat dry and season the surface; keep refrigerated until the smoker is ready.",
        endpoint: "The meat must pass 71°C for safety; continue until probe-tender, usually around 90–96°C. Tenderness and a thermometer determine the finish, not the clock alone. Rest 20–30 minutes, then slice across the grain.",
        minutes: 360,
        finish: "slice",
        safetySource: SMOKE_SAFETY,
      };
    case "pork":
      return {
        shoppingName: "Pork spare ribs",
        preparation: "Remove the membrane from the bone side if present. Keep the rack whole; do not turn ribs into mince or patties. Pat dry and season; chill until the smoker is ready.",
        endpoint: "Cook until a probe slides between the bones with little resistance and the meat reaches at least 71°C. Rest 10–15 minutes, then portion between bones.",
        minutes: 240,
        finish: "portion",
        safetySource: SMOKE_SAFETY,
      };
    case "lamb":
      return {
        shoppingName: "Boneless lamb shoulder",
        preparation: "Leave the shoulder in a large piece for the smoker. Do not grind it for patties. Pat dry and season; keep chilled until cooking.",
        endpoint: "Cook until probe-tender (about 90–96°C) and at least 71°C. Rest 20 minutes, then pull or slice.",
        minutes: 300,
        finish: "pull",
        safetySource: SMOKE_SAFETY,
      };
    case "chicken":
      return {
        shoppingName: "Chicken marylands",
        preparation: "Pat the marylands dry. Leave them bone-in; do not mince. Do not wash raw poultry. Season the skin and keep refrigerated until the smoker is ready.",
        endpoint: "Check next to the bone: the centre must reach 75°C. Rest 10 minutes before serving.",
        minutes: 90,
        finish: "portion",
        safetySource: SMOKE_SAFETY,
      };
    case "turkey":
      return {
        shoppingName: "Turkey breast fillets",
        preparation: "Pat the turkey breast dry. Leave as large pieces; do not mince. Do not wash raw poultry. Season and chill until the smoker is ready.",
        endpoint: "The thickest part must reach 75°C. Rest 15 minutes before slicing.",
        minutes: 120,
        finish: "slice",
        safetySource: SMOKE_SAFETY,
      };
    case "duck":
      return {
        shoppingName: "Duck marylands",
        preparation: "Pat the duck pieces dry. Leave bone-in legs or marylands whole; do not mince. Do not wash raw poultry. Score the skin lightly if fatty, season, and chill.",
        endpoint: "Check next to the bone: the centre must reach 75°C. Rest 10 minutes. Duck is poultry — do not serve it pink.",
        minutes: 150,
        finish: "portion",
        safetySource: SMOKE_SAFETY,
      };
    case "salmon":
      return {
        shoppingName: "Boneless skin-on salmon fillets",
        preparation: "Check carefully for bones and pat dry. Keep the skin on for hot-smoking. This is a hot cook, not a cold-smoked ready-to-eat pack.",
        endpoint: "Cook until the thickest part reaches 63°C and the flesh is opaque. Serve freshly cooked; this is not a shelf-stable smoked product.",
        minutes: 45,
        finish: "portion",
        safetySource: SMOKE_SAFETY,
      };
    case "mushrooms":
      return {
        shoppingName: "Portobello mushrooms",
        preparation: "Wipe the caps clean and keep them whole. Season lightly; mushrooms take a short hot-smoke, not a brisket schedule.",
        endpoint: "Cook until hot throughout and tender. Follow any longer packet requirement on prepared proteins.",
        minutes: 50,
        finish: "portion",
        safetySource: SMOKE_SAFETY,
      };
    case "tempeh":
      return {
        shoppingName: "Plain soy tempeh",
        preparation: "Use plain soy tempeh. Slice into 1 cm slabs. Season; keep the pieces large enough to handle on the grate.",
        endpoint: "Cook until hot throughout. Follow any longer cooking requirement on the packet.",
        minutes: 45,
        finish: "portion",
        safetySource: SMOKE_SAFETY,
      };
    case "tofu":
      return {
        shoppingName: "Plain firm tofu",
        preparation: "Drain and press the tofu for 10 minutes. Cut into 2 cm slabs. Season; do not crumble into mince for smoking.",
        endpoint: "Cook until hot throughout and lightly coloured. Follow any longer packet requirement.",
        minutes: 40,
        finish: "portion",
        safetySource: SMOKE_SAFETY,
      };
    case "jackfruit":
      return {
        shoppingName: "Young green jackfruit in brine, drained",
        preparation: "Use young jackfruit in brine, not syrup. Drain, rinse, and pull into even pieces. It is already processed; smoking heats and flavours it.",
        endpoint: "Heat until steaming hot throughout and tender. Do not use jackfruit in syrup.",
        minutes: 60,
        finish: "pull",
        safetySource: SMOKE_SAFETY,
      };
    default:
      return null;
  }
}

/** Cut-specific smoke prep when a staple cut is chosen. */
export function prepareSmokeCut(cut: MeatCut): SmokePlan | null {
  if (!cutAllowedForSmoke(cut)) return null;
  const name = cut.shoppingName;
  const lower = name.toLocaleLowerCase("en");
  const poultry = cut.mainId === "chicken" || cut.mainId === "turkey";

  if (cut.id.includes("brisket")) {
    return {
      shoppingName: name,
      preparation: `Trim the fat on the ${lower} to about 5 mm. Leave it as one piece — do not cut steaks and do not grind for patties. Pat dry, season the surface, and keep refrigerated until the smoker is ready.`,
      endpoint: "The meat must pass 71°C for safety; continue until probe-tender, usually around 90–96°C. Rest 20–30 minutes, then slice across the grain (or pull if the piece is very soft).",
      minutes: 360,
      finish: "slice",
      safetySource: SMOKE_SAFETY,
    };
  }
  if (cut.id.includes("rib") || cut.id === "beef-short-rib" || cut.id === "pork-ribs") {
    return {
      shoppingName: name,
      preparation: `Pat the ${lower} dry. Keep on the bone as a rack or large pieces. Remove the membrane on pork ribs if present. Do not mince. Season and chill until the smoker is ready.`,
      endpoint: poultry
        ? "Check next to the bone: the centre must reach 75°C."
        : "Cook until probe-tender (about 90–96°C for beef short ribs) and at least 71°C. Rest, then portion between bones.",
      minutes: cut.id.includes("short") ? 300 : 240,
      finish: "portion",
      safetySource: SMOKE_SAFETY,
    };
  }
  if (cut.id.includes("belly")) {
    return {
      shoppingName: name,
      preparation: `Pat the ${lower} dry. Leave as a slab or thick slices suited to the grate — not mince and not schnitzel steaks. Score the skin lightly if present, season, and chill.`,
      endpoint: "Cook until the fat has rendered and the thickest part reaches at least 71°C. Rest 10 minutes before slicing.",
      minutes: 180,
      finish: "slice",
      safetySource: SMOKE_SAFETY,
    };
  }
  if (cut.id.includes("shoulder") || cut.id.includes("neck") || cut.id.includes("breast") && cut.mainId === "lamb" || cut.id === "pork-leg" || cut.id === "beef-chuck") {
    return {
      shoppingName: name,
      preparation: `Pat the ${lower} dry. Leave in a large piece for the smoker. Do not grind for burgers. Season and keep chilled until cooking.`,
      endpoint: poultry
        ? "The thickest part must reach 75°C. Rest before pulling or slicing."
        : "Cook until probe-tender (about 90–96°C) and at least 71°C. Rest 20 minutes, then pull or slice.",
      minutes: 300,
      finish: "pull",
      safetySource: SMOKE_SAFETY,
    };
  }
  if (cut.form === "whole") {
    return {
      shoppingName: name,
      preparation: `Use the whole bird. Check the cavity is empty. Do not wash raw poultry. Season the skin; a whole bird takes longer than pieces.`,
      endpoint: "Check the thickest part of the thigh and the breast: both must reach 75°C. Rest 15–20 minutes before carving.",
      minutes: cut.mainId === "turkey" ? 240 : 150,
      finish: "slice",
      safetySource: SMOKE_SAFETY,
    };
  }
  if (poultry) {
    return {
      shoppingName: name,
      preparation: `Pat the ${lower} dry. Leave bone-in pieces whole where applicable. Do not mince and do not wash raw poultry. Season and chill until the smoker is ready.`,
      endpoint: "Check the thickest part (next to the bone if bone-in): the centre must reach 75°C. Rest 10 minutes.",
      minutes: 90,
      finish: "portion",
      safetySource: SMOKE_SAFETY,
    };
  }
  return {
    shoppingName: name,
    preparation: `Pat the ${lower} dry. Keep it in large pieces suited to hot-smoking — not mince and not thin steaks. Season and chill until the smoker is ready.`,
    endpoint: "Cook until at least 71°C and tender for the cut. Rest before slicing or pulling.",
    minutes: 180,
    finish: "slice",
    safetySource: SMOKE_SAFETY,
  };
}
