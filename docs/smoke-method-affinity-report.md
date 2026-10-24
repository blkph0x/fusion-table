# Smoke method affinity

Hot-smoking is a first-class meal-builder method with realistic main × cut pairing. Builds on cut×method affinity (PR #3).

## Allowlist (smoked)

| Main | Default cut / form | Notes |
| --- | --- | --- |
| Beef | Brisket | Also chuck, short rib |
| Pork | Spare ribs | Also belly, shoulder, hock, neck, leg |
| Lamb | Shoulder | Also breast, shank |
| Chicken | Marylands | Bone-in pieces, whole, spatchcock, thigh fillet |
| Turkey | Breast | Also thigh, whole |
| Duck | Marylands | Poultry endpoint 75°C |
| Salmon | Skin-on fillets | Hot smoke to 63°C — not cold-smoked RTE |
| Mushrooms / tempeh / tofu / jackfruit | Short hot-smoke | Plant slabs / pulled jackfruit |

**Cuts:** `SMOKE_STAPLE_CUTS` in `lib/smoke-method.ts` (brisket, ribs, belly, shoulder, …).

## Denylist (never smoked)

| Category | Examples |
| --- | --- |
| Mince / patties | All `mince` cuts; patties method stays separate |
| Steak-only cuts | Rump, scotch, sirloin, eye fillet (grill instead) |
| Offal | Liver, tongue, … |
| Non-smoke mains | Eggs, prawns, halloumi, paneer, lentils, chickpeas, beans, white fish, tuna, sardines, kangaroo, most vegetables |

## Generated technique

Outdoor smoker / covered BBQ, **120–140°C**, bark → stall/wrap for long joints → rest → slice or pull. Sauce stays separate. Indoor oven smoking is refused in the step text.

## Tests

- `tests/smoke-method.test.ts` — allow/deny matrix + brisket/ribs/duck wording
- Full suite **166** pass
- Android `CatalogueMatchTest.smokeAffinityAllowsBrisketAndRibsButNotMince`
