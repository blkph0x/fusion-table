import type { MeatCut } from "./cuts.ts";

const BONE_IN_SLOW = new Set(["beef-osso", "beef-oxtail", "beef-short-rib", "lamb-shank", "pork-hock", "pork-ribs", "pork-trotter"]);

export function isBoneInCut(cut: MeatCut): boolean { return cut.form === "bone-in" || BONE_IN_SLOW.has(cut.id); }

/** Four-serving purchased raw weight; bones are not counted as fillet meat. */
export function cutShoppingGrams(cut: MeatCut, fallback: number): number {
  if (cut.id === "chicken-maryland") return 1500;
  if (cut.id === "lamb-shank") return 1400;
  if (BONE_IN_SLOW.has(cut.id) || /chicken-wing/.test(cut.id)) return 1200;
  return cut.form === "bone-in" ? 1000 : fallback;
}

/** Estimates describe the specified form; thermometer and tenderness checks prevail. */
export function cutCookingMinutes(cut: MeatCut, method: string, fallback: number): number {
  if (method === "smoked") return fallback;
  // Liver is a short final cook, not a collagen-rich joint; retain the 75 C endpoint.
  if (/liver$/.test(cut.id)) return ["baked", "roasted"].includes(method) ? 12 : 8;
  if (cut.id === "chicken-heart") return ["braised", "curry"].includes(method) ? 40 : ["baked", "roasted"].includes(method) ? 15 : 10;
  if (cut.mainId === "chicken" && cut.form === "bone-in") {
    const maryland = cut.id === "chicken-maryland";
    const wing = /wing/.test(cut.id);
    if (["baked", "roasted"].includes(method)) return maryland ? 50 : wing ? 35 : 40;
    if (method === "air-fried") return maryland ? 40 : wing ? 25 : 30;
    if (["pan-fried", "grilled"].includes(method)) return maryland ? 45 : wing ? 30 : 35;
    if (["braised", "curry"].includes(method)) return maryland ? 60 : wing ? 35 : 45;
    if (["poached", "steamed"].includes(method)) return maryland ? 45 : wing ? 25 : 35;
  }
  if (cut.id === "lamb-rack") return ["baked", "roasted"].includes(method) ? 35 : ["braised", "curry"].includes(method) ? 45 : 15;
  if (cut.form === "slow" && ["braised", "curry"].includes(method)) {
    if (["beef-oxtail", "pork-trotter"].includes(cut.id)) return 180;
    if (["beef-brisket", "angus-brisket", "wagyu-brisket", "beef-cheek", "pork-hock"].includes(cut.id)) return 180;
    if (BONE_IN_SLOW.has(cut.id) || /shoulder|neck|cheek/.test(cut.id)) return Math.max(150, fallback);
  }
  if (cut.id === "beef-tongue") return ["braised", "curry"].includes(method) ? 15 : ["baked", "roasted"].includes(method) ? 12 : 8;
  if (cut.id === "chicken-gizzard") return ["braised", "curry"].includes(method) ? 90 : ["baked", "roasted"].includes(method) ? 10 : 8;
  if (/sausage/.test(cut.id)) return ["braised", "curry"].includes(method) ? 25 : 18;
  if (cut.form === "whole") {
    if (cut.mainId === "turkey") return ["baked", "roasted"].includes(method) ? 180 : 200;
    return ["baked", "roasted"].includes(method) ? cut.id === "chicken-spatchcock" ? 65 : 90 : 100;
  }
  if (cut.form === "mince" && ["braised", "curry"].includes(method)) return 20;
  if (["steak", "fillet", "slice"].includes(cut.form) && !/sausage|belly/.test(cut.id) && ["braised", "curry"].includes(method)) return /thigh/.test(cut.id) ? 35 : 20;
  if (cut.form === "slow" && ["baked", "roasted"].includes(method)) return cut.mainId === "chicken" ? 120 : 180;
  return fallback;
}

/** Whole birds are bought and cooked whole, with surplus retained for another meal. */
export function wholeBirdPortion(cut: MeatCut, servings: number): { birds: number; draftAmount: number; weight: string; restMinutes: number } | null {
  if (cut.form !== "whole") return null;
  const birds = Math.ceil(servings / (cut.mainId === "turkey" ? 8 : 4));
  return { birds, draftAmount: birds * 4 / servings, weight: cut.mainId === "turkey" ? "3–4 kg" : "1.5–1.8 kg", restMinutes: cut.mainId === "turkey" ? 25 : 15 };
}
