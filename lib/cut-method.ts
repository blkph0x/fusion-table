/**
 * Cut × method affinity: which butcher forms suit which techniques,
 * and how to prepare them so steps never ask for steak slices on a grind/pull cut.
 */

import { cutsForMain as allCutsForMain, getCut, type CutForm, type MeatCut } from "./cuts.ts";

export type CookingMethodId =
  | "schnitzel"
  | "baked"
  | "pan-fried"
  | "air-fried"
  | "poached"
  | "grilled"
  | "stir-fried"
  | "braised"
  | "curry"
  | "patties"
  | "roasted"
  | "steamed";

/** Methods that cook thin, fast pieces as steaks/fillets — not for stew or mince forms. */
const STEAK_QUICK = new Set<string>(["schnitzel", "pan-fried", "air-fried", "grilled"]);
const SLOW_SIMMER = new Set<string>(["braised", "curry"]);
const OVEN = new Set<string>(["baked", "roasted"]);

/**
 * Forms allowed for each method. A missing form is rejected in validation
 * and hidden in the meal builder cut picker.
 */
export const FORM_METHODS: Readonly<Record<CutForm, readonly string[]>> = {
  fillet: ["schnitzel", "baked", "pan-fried", "air-fried", "poached", "grilled", "stir-fried", "braised", "curry", "roasted", "steamed"],
  steak: ["schnitzel", "baked", "pan-fried", "air-fried", "grilled", "stir-fried", "braised", "curry", "roasted"],
  mince: ["patties", "baked", "pan-fried", "air-fried", "grilled", "stir-fried", "braised", "curry", "roasted"],
  "bone-in": ["baked", "pan-fried", "air-fried", "grilled", "braised", "curry", "roasted", "steamed", "poached"],
  whole: ["baked", "roasted", "braised", "curry", "steamed", "poached"],
  offal: ["pan-fried", "air-fried", "grilled", "braised", "curry", "baked", "roasted"],
  slow: ["braised", "curry", "patties", "roasted", "baked", "stir-fried"],
  slice: ["pan-fried", "air-fried", "grilled", "stir-fried", "baked", "roasted", "braised", "curry"],
};

/** Cuts that pull/shred when braised rather than stay as neat cubes. */
const PULL_CUT_IDS = new Set([
  "beef-brisket", "angus-brisket", "wagyu-brisket",
  "beef-cheek", "pork-shoulder", "pork-cheek", "pork-neck", "pork-leg",
  "lamb-shoulder", "lamb-breast", "lamb-neck",
  "chicken-frame",
]);

/** Bone-in slow pieces that stay whole (not cubed like chuck). */
const WHOLE_SLOW_IDS = new Set([
  "beef-osso", "beef-oxtail", "beef-short-rib",
  "lamb-shank", "pork-hock", "pork-ribs", "pork-trotter",
  "chicken-drumstick", "chicken-wing", "chicken-wingette", "chicken-maryland", "chicken-thigh-bone",
  "lamb-cutlet", "lamb-loin", "lamb-rack", "pork-cutlet",
]);

/** Sausage / link forms — cook as links, never as steaks. */
const SAUSAGE_IDS = new Set(["beef-sausage", "lamb-sausage", "pork-sausage"]);

export function cutAllowedForMethod(cut: MeatCut, methodId: string): boolean {
  const allowed = FORM_METHODS[cut.form];
  if (!allowed.includes(methodId)) return false;
  // Schnitzel needs a flattenable boneless piece — not drumsticks, racks, or sausages.
  if (methodId === "schnitzel") {
    if (cut.form === "bone-in" || cut.form === "whole" || cut.form === "slow" || cut.form === "mince") return false;
    if (SAUSAGE_IDS.has(cut.id)) return false;
  }
  // Stir-fry of whole birds or heavy bone pieces is nonsense.
  if (methodId === "stir-fried" && (cut.form === "whole" || WHOLE_SLOW_IDS.has(cut.id) && cut.form === "slow")) return false;
  // Poach is for fillets / bone pieces that sit in liquid — not mince or schnitzel steaks.
  if (methodId === "poached" && (cut.form === "mince" || cut.form === "slow" || SAUSAGE_IDS.has(cut.id))) return false;
  return true;
}

export function cutsForMethod(mainId: string, methodId?: string): MeatCut[] {
  const cuts = allCutsForMain(mainId);
  if (!methodId) return cuts;
  return cuts.filter((cut) => cutAllowedForMethod(cut, methodId));
}

export interface CutPrep {
  preparation: string;
  endpoint: string;
  /** Extra minutes when the cut needs longer than the method default. */
  minutesBump?: number;
}

function poultryNote(cut: MeatCut): string {
  return cut.mainId === "chicken" || cut.mainId === "turkey" ? " Do not wash raw poultry." : "";
}

function isPoultry(cut: MeatCut): boolean {
  return cut.mainId === "chicken" || cut.mainId === "turkey";
}

/**
 * Full prep and endpoint for a chosen cut + method.
 * Replaces method-default steak language when the form requires grind, cubes, pull, or links.
 */
export function prepareCut(cut: MeatCut, methodId: string): CutPrep | null {
  if (!cutAllowedForMethod(cut, methodId)) return null;
  const name = cut.shoppingName.toLocaleLowerCase("en");
  const poultry = isPoultry(cut);
  const wash = poultryNote(cut);

  if (cut.form === "mince" || methodId === "patties" && cut.form === "slow") {
    if (methodId === "patties" && cut.form === "slow") {
      return {
        preparation: `Ask the butcher to grind the ${name}, or mince it finely at home with a clean mincer or food processor. Keep the raw mince refrigerated until shaping. Do not portion this cut into steaks.${wash}`,
        endpoint: "The centre of each patty must reach 75°C on a clean food thermometer; check several pieces and cook longer if needed.",
      };
    }
    if (methodId === "patties") {
      return {
        preparation: `Keep the raw ${name} refrigerated until shaping. Do not wash raw meat${poultry ? " or poultry" : ""}.`,
        endpoint: "The centre of each patty must reach 75°C on a clean food thermometer; check several pieces and cook longer if needed.",
      };
    }
    if (SLOW_SIMMER.has(methodId)) {
      return {
        preparation: `Keep the raw ${name} refrigerated. Break it up in the pan as it cooks; do not form steaks.${wash}`,
        endpoint: "The mince must reach 75°C throughout on a clean food thermometer; break up any clumps and cook longer if needed.",
      };
    }
    if (methodId === "stir-fried") {
      return {
        preparation: `Keep the raw ${name} refrigerated. Crumble it into the hot pan; do not cut steaks from mince.${wash}`,
        endpoint: "The mince must reach 75°C throughout on a clean food thermometer; cook longer if needed.",
      };
    }
    // grilled / pan-fried / air-fried / baked / roasted with mince → cook as loose mince or quick patties, never steaks
    return {
      preparation: `Keep the raw ${name} refrigerated. Shape into flat patties about 1.5 cm thick, or cook it crumbled in the pan — do not treat mince as steaks.${wash}`,
      endpoint: "The centre must reach 75°C on a clean food thermometer; check several pieces and cook longer if needed.",
    };
  }

  if (cut.form === "whole") {
    return {
      preparation: `Use the whole bird (${name}). Check the cavity is empty. Do not wash raw poultry. A whole bird takes longer than fillets.`,
      endpoint: "Check the thickest part of the thigh and the breast with a clean food thermometer: both must reach 75°C. Continue cooking if needed.",
      minutesBump: methodId === "roasted" || methodId === "baked" ? 40 : 20,
    };
  }

  if (cut.form === "offal") {
    return {
      preparation: `Keep the ${name} cold until cooking and trim ducts or sinew. Do not serve offal rare.${wash}`,
      endpoint: "The centre must reach 75°C on a clean food thermometer.",
    };
  }

  if (SAUSAGE_IDS.has(cut.id)) {
    return {
      preparation: `Keep the ${name} refrigerated. Prick lightly only if the packet says to; cook as links, not steaks.`,
      endpoint: "Sausages must reach 75°C in the centre; check several links with a clean food thermometer.",
    };
  }

  if (cut.form === "slow") {
    if (SLOW_SIMMER.has(methodId)) {
      if (PULL_CUT_IDS.has(cut.id)) {
        return {
          preparation: `Trim excess surface fat from the ${name}. Leave it in large pieces (or cut into fist-sized chunks) — do not slice into steaks. After cooking, shred or pull across the grain.${wash}`,
          endpoint: "Cook until fork-tender and at least 71°C in the centre (75°C for poultry). Extend the gentle simmer until it pulls apart easily.",
          minutesBump: 20,
        };
      }
      if (WHOLE_SLOW_IDS.has(cut.id)) {
        return {
          preparation: `Pat the ${name} dry. Leave the pieces whole on the bone; do not cut into steaks. Brown lightly if the method allows, then simmer gently.${wash}`,
          endpoint: poultry
            ? "Check next to the bone with a clean food thermometer: the centre must reach 75°C. Continue until the meat is tender."
            : "Cook until fork-tender and at least 71°C in the centre next to the bone. Extend the gentle simmer if still tough.",
          minutesBump: 15,
        };
      }
      // chuck, gravy beef, diced, silverside, etc.
      return {
        preparation: cut.id.includes("dice") || cut.id.includes("diced")
          ? `Pat the ${name} dry. Use the cubes as they are, or trim any large uneven pieces to about 3 cm.${wash}`
          : `Trim excess fat from the ${name} and cut into even 3 cm cubes for braising. Do not portion into steaks.${wash}`,
        endpoint: poultry
          ? "Check several thickest pieces with a clean food thermometer: the centre must reach 75°C."
          : "Cook until fork-tender as well as at least 71°C in the centre. Extend the gentle simmer if still tough.",
      };
    }
    if (OVEN.has(methodId)) {
      if (PULL_CUT_IDS.has(cut.id) || WHOLE_SLOW_IDS.has(cut.id)) {
        return {
          preparation: `Pat the ${name} dry. Roast or bake as a whole piece (or large chunks); do not cut into thin steaks.${wash}`,
          endpoint: poultry
            ? "The thickest part must reach 75°C. Continue until tender."
            : "The centre must reach at least 71°C; continue until probe-tender for slow cuts, then rest before slicing or pulling.",
          minutesBump: 30,
        };
      }
      return {
        preparation: `Trim the ${name} and cut into even 3–4 cm pieces for the tray. Do not flatten into schnitzel steaks.${wash}`,
        endpoint: poultry
          ? "The centre must reach 75°C on a clean food thermometer."
          : "Cook until at least 71°C in the centre and tender; extend if still tough.",
      };
    }
    if (methodId === "stir-fried") {
      return {
        preparation: `For stir-fry, freeze the ${name} briefly until firm, then slice very thinly across the grain (about 2–3 mm). Marinate if you like; do not cut thick steaks.${wash}`,
        endpoint: poultry
          ? "The strips must reach 75°C throughout."
          : "Cook the thin strips until browned and at least 71°C; do not leave thick pieces.",
      };
    }
  }

  if (cut.form === "bone-in") {
    const boneExtra = " This cut is bone-in, so allow extra time and check next to the bone.";
    if (methodId === "stir-fried") {
      return {
        preparation: `Joint or cut the ${name} into small, even pieces that will cook through quickly.${boneExtra}${wash}`,
        endpoint: poultry
          ? "Check next to the bone: the centre must reach 75°C."
          : "Check next to the bone: the centre must reach at least 71°C.",
      };
    }
    if (SLOW_SIMMER.has(methodId) || OVEN.has(methodId) || methodId === "grilled" || methodId === "pan-fried" || methodId === "air-fried" || methodId === "poached" || methodId === "steamed") {
      return {
        preparation: `Pat the ${name} dry and leave on the bone.${boneExtra}${wash}`,
        endpoint: poultry
          ? "Check next to the bone with a clean food thermometer: the centre must reach 75°C."
          : "Check next to the bone: the centre must reach at least 71°C, then rest briefly.",
        minutesBump: 5,
      };
    }
  }

  if (cut.form === "slice") {
    if (methodId === "stir-fried" || cut.id.includes("strip")) {
      return {
        preparation: `Use the ${name} as strips, or slice any thicker pieces into even 5–10 mm strips across the grain.${wash}`,
        endpoint: poultry
          ? "The strips must reach 75°C throughout."
          : "Cook until hot through and at least 71°C in the thickest strip.",
      };
    }
    if (cut.id.includes("belly")) {
      return {
        preparation: `Pat the ${name} dry. Slice into even strips or leave as packet slices; do not flatten like schnitzel steaks.`,
        endpoint: "Cook until the fat renders and the thickest part reaches at least 71°C.",
      };
    }
  }

  // fillet / steak (and remaining slice) — method-shaped steak/fillet language
  if (methodId === "schnitzel") {
    return {
      preparation: poultry
        ? `Slice the ${name} horizontally if thick and flatten between baking paper to an even 1 cm thickness. Do not wash raw poultry.`
        : `Trim and flatten the ${name} between baking paper to an even 8–10 mm thickness.`,
      endpoint: "The centre must reach 75°C on a clean food thermometer; check several pieces and cook longer if needed.",
    };
  }
  if (methodId === "stir-fried") {
    return {
      preparation: poultry
        ? `Slice the ${name} across the grain into even 1 cm strips. Do not wash raw poultry.`
        : `Slice the ${name} across the grain into thin 5 mm strips.`,
      endpoint: poultry
        ? "Check several thickest pieces with a clean food thermometer: the centre must reach 75°C."
        : "Check the centre of the thickest pieces reaches at least 71°C for a medium result.",
    };
  }
  if (SLOW_SIMMER.has(methodId)) {
    return {
      preparation: poultry
        ? `Trim and cut the ${name} into 3 cm pieces. Do not wash raw poultry.`
        : `Trim the ${name} and cut into even 3 cm cubes for simmering.`,
      endpoint: poultry
        ? "Check several thickest pieces with a clean food thermometer: the centre must reach 75°C."
        : "Cook until fork-tender as well as at least 71°C in the centre. Extend the gentle simmer if still tough.",
    };
  }
  // grilled / pan / air / bake / roast / poach / steam — even steak thickness
  return {
    preparation: poultry
      ? `Cut large pieces of ${name} into individual portions no thicker than 2.5 cm, and pat dry with disposable kitchen paper. Do not wash raw poultry.`
      : `Trim and portion the ${name} to an even 2 cm thickness; pat dry.`,
    endpoint: poultry
      ? "Check several thickest pieces with a clean food thermometer: the centre must reach 75°C. Continue cooking if needed."
      : "Check the centre of the thickest pieces reaches at least 71°C for a medium result, then rest for 3 minutes before slicing.",
  };
}

export function cutMethodMismatchMessage(cut: MeatCut, methodId: string): string {
  const method = methodId.replace(/-/g, " ");
  if (cut.form === "slow" && STEAK_QUICK.has(methodId)) {
    return `${cut.shoppingName} is a slow-cooking cut — it does not suit ${method} as steaks. Choose braised, curry, patties (grind), or a steak cut.`;
  }
  if (cut.form === "whole" && (STEAK_QUICK.has(methodId) || methodId === "patties" || methodId === "stir-fried")) {
    return `A whole bird does not suit ${method}. Choose roasted, baked or braised, or pick breast/thigh fillets.`;
  }
  if (cut.form === "mince" && methodId === "schnitzel") {
    return `Mince cannot be crumbed as schnitzel steaks. Choose patties, or pick a steak or fillet cut.`;
  }
  return `${cut.shoppingName} is not a sensible cut for ${method}. Choose a cut that matches the technique, or leave the cut blank.`;
}

export function assertCutForMethod(cutId: string | undefined, mainId: string, methodId: string): string | undefined {
  if (!cutId) return undefined;
  const cut = getCut(cutId);
  if (!cut || cut.mainId !== mainId) {
    throw new Error("Choose a recognised cut for this main, or leave it to match the method.");
  }
  if (!cutAllowedForMethod(cut, methodId)) {
    throw new Error(cutMethodMismatchMessage(cut, methodId));
  }
  return cut.id;
}
