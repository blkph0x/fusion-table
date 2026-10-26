# Fusion overhaul — handoff

**Date:** 26 October 2026  
**Branch:** `cursor/fusion-overhaul-91e1`  
**PR:** https://github.com/blkph0x/fusion-table/pull/5  
**Live SHA:** `765cfea` (host `deploy/fusion-overhaul-91e1`)  
**Rollback:** `56fc5d6`  
**Brief:** store `docs/fusion-overhaul-brief.md`

## Short analysis (then shipped)

| Area | Gap | Fix in this push |
| --- | --- | --- |
| Home | Sticky classic inspirations only | Randomised curated meal suggestions each load + shuffle control |
| MOTW | None | Score plates for simplicity + food groups + quick/easy; week-stable hero |
| Naming | `Region main · method` | `mealName()` — verb + side hooks; SAT tails use em dash |
| Images | Generic prompt / still keyed only on region\|method\|main | `platePicturePrompt` + `platePictureKey` from title, components, ingredients |
| Variety / condiments | Finish slot often 0; thin FAMILY_EXTRA finishes | Prefer ≥1 finish when pool allows; expand regional finish pools; never re-pick used ids |
| Tests | Affinity/diversity only | Large generated suite (≥300 samples) + MOTW/home/image/naming |
| UI | Generic planning hero | MOTW hero composition + suggestion strip + polish |
| Android | Generic `${flavour} ${main}` titles | `mealTitle` + `weekScore` parity helpers |

Hard exclusions, region affinity, cut×method and smoke allowlists unchanged.

## Behaviour

### Meal of the week
- `lib/meal-of-week.ts` scores generated meals from ingredient/step/equipment counts, method pace, and food-group coverage (protein, veg, grain/starch, healthy fat).
- `pickMealOfWeek({ seed: weekSeed() })` is stable within an ISO week; discover hero opens that plate.

### Random suggestions
- `buildHomeDiscover({ loadSeed })` shuffles `PLATES` per visit, excludes the MOTW plate, returns 6 cards.
- Discover “Shuffle again” re-seeds without changing MOTW.

### Naming
- Example: `Japanese grilled chicken with rice & greens` (not `Japanese chicken · grilled`).
- Seeded SAT appends ` — {form} with {signature}` (was middle-dot).

### Images
- Prompt includes title, method, region, side, components and visible ingredients.
- Cache/paint identity: `platePictureKey(recipe)`.

### Condiment variety
- Seeded explore prefers at least one finish when the family pool has unused finishes.
- Extra finishes added for Thai, Vietnamese, Indonesian, Malaysian, Levantine, Moroccan, Greek, Spanish, Caribbean, etc., still filtered by strong-marker affinity.

## Tests

| Suite | Result |
| --- | --- |
| Full `pnpm`/`node scripts/test.mjs` | **174** pass / 0 fail |
| `tests/fusion-overhaul.test.ts` | **8** pass (naming, MOTW, shuffle, images, ≥300 sample suite, all PLATES) |

## Android

- `PlateStudio.mealTitle` / `weekScore` + unit test in `PlateStudioTest`.
- On-device plate studio only (not full web matrix). APK rebuild optional; parity for naming/score helpers shipped in `D:\MealplannerAU`.

## Deploy / rollback

- Live: https://gearsqueens.online/fusion/ — MOTW hero + randomised “Tonight’s ideas” verified HTTP 200 @ **`765cfea`**.
- Host branch: `deploy/fusion-overhaul-91e1` (no ff-merge of `main`; basePath `/fusion` restored on host only).
- Rollback: checkout/redeploy **`56fc5d6`** (`deploy/smoke-method-affinity-91e1`).
- Android: local commit `c29b83d` on `cursor/fusion-overhaul-91e1` (no git remote); APK not rebuilt this push.
