# Cut × method affinity

Prep text and builder cut lists now follow real butchery/cookery pairing instead of method-default steak language on every cut.

## Problem (before)

`mainPlan` wrote technique-first prep (“portion steaks to 2 cm”, “flatten steaks”, “cut chuck into cubes”). `withCut` only special-cased mince / whole / offal / a weak “slice thin” note for slow cuts on quick methods. Choosing **beef brisket + grilled** or **brisket + patties** still produced steak-slice instructions.

### Before examples

| Choice | Bad prep (before) |
| --- | --- |
| Beef brisket + grilled / pan-fried / schnitzel | “Trim and portion the steaks to an even 2 cm thickness” / “flatten the steaks…” |
| Beef brisket + patties | Mince-shaped method text, but no “grind this brisket”; shopping name only swapped |
| Beef chuck + schnitzel | Flatten steaks |
| Whole chicken + schnitzel | Breast-flatten language on a whole bird |
| Beef mince + grilled | “2 cm thickness” steak wording |
| Braised + brisket | Generic “chuck” cube language, not pull/shred |

## Fix

New module `lib/cut-method.ts`:

1. **Form × method allowlists** — e.g. `slow` → braised, curry, patties, roasted, baked, stir-fried (not grilled/schnitzel/pan-fried/air-fried).
2. **`prepareCut`** — full prep + endpoint replacement (grind, cubes, pull/shred, bone-in whole, sausage links, measured steaks).
3. **`validateMealInput` / `assertCutForMethod`** — rejects forbidden pairs with a clear message.
4. **Meal builder** — cut dropdown uses `cutsForMethod(mainId, methodId)`; changing method clears an incompatible cut.

### After examples

| Choice | Prep now |
| --- | --- |
| Beef brisket + patties | “Ask the butcher to grind the beef brisket… Do not portion this cut into steaks.” |
| Beef brisket + braised | Large pieces, then “shred or pull across the grain” |
| Beef chuck + braised | “cut into even 3 cm cubes… Do not portion into steaks” |
| Beef rump + grilled | “portion … to an even 2 cm thickness” (unchanged, correct) |
| Beef mince + grilled | Shape patties or cook crumbled — not steaks |
| Beef short rib + braised | Leave whole on the bone |
| Brisket + grilled | **Rejected** in validate / hidden in builder |

## Android

`MeatCuts` gains a `form` field. `CutMethodAffinity` mirrors the web allowlists and prep hints. Shopping cut picker filters by inferred method from the line title (burger → patties, grill → grilled, etc.) and shows an inline prep hint when a cut is chosen.

## Tests

- `tests/cut-method.test.ts` — allowlist matrix, forbidden pairs, required grind/pull/cube/steak phrases.
- Full web suite green.
- Android `CatalogueMatchTest.cutMethodAffinityHidesStewCutsFromGrillAndGrindsBrisketForPatties`.
