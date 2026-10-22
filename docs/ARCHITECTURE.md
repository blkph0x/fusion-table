# Fusion Table architecture

## Purpose and boundaries

Fusion Table combines two deterministic authored recipe engines with live discovery of nearby food shops. Recipe composition is synchronous and uses only the selected inputs and checked-in templates. Identical inputs produce identical recipes; no runtime language model, remote recipe-generation API or random recipe selection is used.

Shop discovery is separate: server routes call the configured map provider and return places that may carry an ingredient, with stock and prices explicitly unverified. A template proposal, an automated check, a cook's observation and actual retailer inventory evidence remain different records.

The app uses React with the Next-style App Router through Vinext. Vite builds browser assets and a Cloudflare Worker. Tracked Sites integration remains for the existing private deployment; an independent Cloudflare deployment has its own configuration, account and audience.

This is a standalone application repository. The original [research repository](https://github.com/blkph0x/p-vs-np-proof-research) was inspected at [`7dedc73f758dfbdc072e7aa29dfc08505761ebd5`](https://github.com/blkph0x/p-vs-np-proof-research/tree/7dedc73f758dfbdc072e7aa29dfc08505761ebd5). No mathematics engine or P-versus-NP result is used by the website.

## Main modules

| Path | Responsibility |
| --- | --- |
| `app/page.tsx` | Discover/classic studio, local shops, cooking mode, browser cookbook and exports. |
| `components/meal-builder.tsx` | Guided main/method/region/side controls using the deterministic meal engine. |
| `app/layout.tsx` and styles | Global presentation and metadata. |
| `lib/recipe-types.ts` | Shared inputs, ingredients, steps, source label and recipe output. |
| `lib/template-types.ts` | Four-serving draft ingredients, regional profiles, recipe context and base-template result. |
| `lib/recipes.ts` | Public classic/region/diet catalogs, validation, original classic templates and integrated generation. |
| `lib/bbq-classics.ts` | 20 additional barbecue/smoking templates, specific cuts/substitutions, method notes and doneness guidance. |
| `lib/bbq-regions.ts` | 16 additional regional profiles with warm/finish ingredients and dietary-aware labels. |
| `lib/meal-types.ts` | Ingredient-led input and complete-meal types. |
| `lib/meal-catalog.ts` | 22 mains, compatible methods, 20 profiles, 6 sides and count helpers. |
| `lib/meals.ts` | Ingredient-led complete meals, selected-main preservation, scaling, substitutions and method instructions. |
| `lib/locations.ts` | Location/shop types, validation, distances, normalisation and safe links. |
| `lib/location-providers.ts` | Photon/Overpass clients, selection, timeouts, caches, cooldowns and error mapping. |
| `lib/shopping.ts` | Conservative ingredient/shop matching and ranking. |
| `app/api/locations/route.ts` | Explicit location-search API. |
| `app/api/shops/route.ts` | Bounded nearby-shop API. |
| `tests/recipes.test.ts`, `tests/bbq-recipes.test.ts`, `tests/meals.test.ts` | Original behavior, full BBQ matrix, dietary/technique rules and ingredient-led recipes. |
| Other `tests/` files | Location/provider and shopping behavior. |
| `public/images/` | Culinary inspiration images. |
| `.openai/hosting.json` | Existing Site identity; D1/R2 are unused. |
| `scripts/`, `vite.config.ts`, `worker/index.ts` | Tracked runtime/build helpers, tests, independent deployment and archive packaging. |
| `.github/workflows/` | Verification and versioned release workflows. |

Starter database/connector helpers do not imply an active inventory connector, user database or background agent.

## Expanded classic and barbecue engine

`generateRecipe(input)` accepts `classicId`, `regionId`, integer `servings` from 1–12, and optional `diet`, `spiceHeat` and `pantry`. All original 8 classics, 8 regions and 5 diets remain. The added 20 classics and 16 profiles expand the catalog to **28 classics × 24 regions = 672 pairings**, or **3,360 classic/region/diet configurations**. Serving, heat and pantry variants are not used to inflate those counts.

The new classic set covers low-and-slow brisket, pulled protein and ribs; reverse-seared/flank steaks and lamb chops; skewers, sausages and wings; whole chicken and turkey breast; pork belly; hot-smoked/whole fish, prawns and ready-cooked octopus; vegetable trays, grain bowls, smoked dip and a ready-to-eat cold platter. The [README tables](../README.md#new-barbecue-and-smoking-classics) list every new classic and regional profile with its role.

### Generation flow

1. Validate the selected IDs, diet, heat, pantry structure and serving count.
2. Construct the regional profile as separate warm and finishing ingredients.
3. Select the classic template and its concrete dietary adaptation.
4. Assemble the base ingredients and both profile portions, merging compatible ingredient IDs/units.
5. Scale authored four-serving quantities exactly once and apply conservative pantry matching.
6. Return measured ingredients, steps, estimated times, equipment, method notes, dietary notes and applicable safety guidance.

A vegetarian or vegan classic uses its own ingredient choices and cooking instructions. Whole cuts, minced sausages, poultry, fish and fully cooked products have different treatment. A long-cook meat version does not impose its meat cooking duration on a plant alternative. Glazes and regional sauces are prepared separately and added at the appropriate point; sugary condiments are not automatically used as a high-heat rub.

Portion changes can alter the method as well as ingredient amounts. The whole-bird classic uses bone-in chicken portions for one to three servings and whole unstuffed birds for four or more, retaining a stable ingredient ID while changing its displayed product and directions. Small brisket, shoulder, rib and belly portions use covered-oven instructions instead of a large-joint outdoor smoking schedule. Quantities still scale once from the four-serving base; cooking durations follow the selected cut and method.

### Smoking, grilling and cold products

`Recipe.methodNotes` carries the template's method guidance to the website. Outdoor smokers, direct grills, indirect heat and ordinary oven alternatives are identified explicitly. Smoke-style seasoning in a kitchen oven is presented as a practical alternative, not as the same smoke process. Fuel/wood belongs to equipment guidance rather than mandatory food-shopping ingredients.

Poultry and raw minced-meat sausage guidance uses a 75°C centre endpoint. Whole beef/lamb/pork cuts use the templates' conservative 71°C target, with additional texture/endpoints for slow-cooked cuts. Fish uses applicable 63°C guidance, and already-cooked octopus is reheated as directed. Brisket, pulled meat and ribs also need their higher tenderness target and a probe/texture check; clock time alone is insufficient. The source notes refer to [Food Standards Australia New Zealand](https://www.foodstandards.gov.au/consumer/prevention-of-foodborne-illness/food-safety-basics) and the [NSW Food Authority](https://www.foodauthority.nsw.gov.au/consumer/food-safety-home/cooking-temperatures).

The cold platter is an **assembly recipe using commercially ready-to-eat smoked products or fully cooked alternatives**. It is not a home curing process and never treats cold smoke as sufficient cooking for raw fish. The template includes refrigeration/use-by handling and guidance for vulnerable people, with fully cooked alternatives. Smoked cheese uses appropriate ready-to-eat pasteurised products; plant versions use fully cooked ready-to-eat smoked tofu or the specified alternative.

## Ingredient-led complete meals

`generateMeal(input)` accepts `mainId`, `methodId`, `regionId`, optional `sideId`, integer servings from 1–12, and optional diet/heat/pantry. `getMethodsForMain()` and `getMainsForDiet()` support guided controls. In this builder, incompatible main/diet choices fail explicitly rather than silently changing the main the visitor selected.

The catalog has **195 compatible main/method pairs**, **20 regions** and **6 sides**, giving **23,400 supported main/method/region/side configurations**. Every meal includes a main, side, vegetables and sauce. Cut, preparation, quantities, cooking sequence and dietary alternatives follow the chosen method. For example, gluten-free quinoa uses quinoa cooking instructions rather than retaining a couscous method.

Both engines are pure TypeScript and reusable without Cloudflare-specific routes. [Self-hosting](SELF_HOSTING.md) includes working calls for each.

## Shared recipe semantics and provenance

Ingredients have IDs, names, numeric amounts, units, known allergens, shopping categories, notes and pantry status. Categories are `produce`, `butcher`, `fishmonger`, `grocery` and `specialty`. Matching is exact after explicit normalisation/aliases: ordinary soy sauce does not satisfy labelled gluten-free tamari, and generic milk does not satisfy coconut milk. Pantry matching is a convenience, not a quantity or freshness check.

All generated output has the exact `sourceLabel` **“Template-generated · not kitchen-tested”**. A saved cooked flag records the visitor's own observation; it does not turn a template into independent kitchen validation. Dietary substitutions guide ingredient selection, while product labels and preparation conditions still matter. Quantities scale with portions, but time estimates and larger-batch advice must be interpreted with the specified doneness checks.

## Local discovery and shopping suggestions

1. The visitor explicitly submits location text to `GET /api/locations?q=...`, or chooses browser geolocation.
2. Text search returns up to six candidates and the visitor chooses the intended one.
3. The browser requests `GET /api/shops?lat=...&lon=...&radiusKm=...` for a radius of 1–25 km.
4. The server validates inputs, calls its configured provider, normalises records and filters exact straight-line distances.
5. Missing ingredients are associated with plausible shop types, with up to three suggestions per ingredient.

Photon tag-filtered nearby search returns at most 50 food-shop entries and uses `coverage: "limited-nearby"`. Optional Overpass uses `coverage: "area-query"`; both remain incomplete map data. Counts are not an area-wide inventory.

`inventoryStatus` is always `"unverified"`. Shop-category matches, websites and product-search links do not prove stock or price. Opening-hours text is shown as supplied, and the app does not infer “open now.” A mapped market is not automatically a farmers market or a daily event.

Matching respects the original shop subtype: a bakery can supply bread, a butcher meat, a spice merchant dry spices. Arbitrary specialty shops do not match every specialist item. Appropriate specialists rank ahead of supermarkets/grocers, with distance ordering otherwise equivalent matches.

Provider endpoints come only from server settings and must be HTTPS without embedded credentials, fragments or query strings. Overpass queries use validated numbers and fixed shop tags. Location results cache for 24 hours and shops for 30 minutes, with bounded caches, coalescing, timeouts, response limits, concurrency controls and per-instance cooldowns. Errors remain explicit, rather than becoming a successful empty directory. See [LOCATION_DATA.md](LOCATION_DATA.md) for exact contracts, attribution, provider policies and verification records.

## State and privacy

| State | Location and lifetime |
| --- | --- |
| Current form/recipe, checkmarks, filters and cooking step | React state in the active page. |
| Saved full recipe snapshots, notes, ratings and cooked status | Browser `localStorage`, under `fusion-table-v1`. |
| Selected shopping location/radius | The same browser-local record. |
| Provider caches/limits | Transient Worker-instance memory. |
| Recipe/cookbook JSON and shopping CSV | Files explicitly downloaded by the visitor. |

Saved recipes do not sync between devices. Clearing browser data removes them; exports keep an independent copy. New saves are limited to 100 recipes while existing records remain intact. Snapshots preserve ingredients/methods when the generator changes.

Recipe composition sends no data to a remote recipe service. Map providers receive only required query text/coordinates. Cookbook history and notes are not included. Opening the optional map contacts OpenStreetMap, while external shop links contact their destinations. Precise geolocation follows explicit visitor action and browser permission.

## Builds, hosting and releases

The GitHub source repository and published release assets are public. The original Sites deployment preserves its assigned project ID and owner-private audience, controlled by the platform. No application-specific account system is implemented. D1/R2 are unused and cookbook entries are browser-local.

A clean checkout selects the portable runner and resolves helpers from tracked source. Use Node 22.13.0+, pnpm 11.25.0, and the committed lockfile. Ordinary development uses `pnpm install --frozen-lockfile`, `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build`. The managed Linux installer remains separate.

`pnpm deploy:cloudflare --name your-name-fusion-table` requires an explicit independent Worker name and writes a separate configuration while preserving original Site/build identity. `--dry-run` validates without publishing. The full app needs map server routes, so a static-only upload is insufficient.

`pnpm release:source` archives a clean committed Git HEAD into a ZIP with checksum and excludes generated/private state. `pnpm release:worker` packages a fresh compiled build into an independent Worker archive, excluding local environment files/Sites metadata and clearing runtime variables. Binding/path and common-credential checks are safeguards, not a substitute for review.

CI verifies pull requests and main pushes. The release workflow runs on main changes to `package.json` or itself, or manual dispatch. It validates the version/access, preserves existing releases, runs all checks and builds, then creates a missing release with source ZIP, Worker archive and checksums. A conflicting tag or authentication/network error stops publication. See [Self-hosting](SELF_HOSTING.md) for the maintainer process.

## Verification and extension points

- Original recipe regression tests keep the original IDs, diets, substitutions, scaling and validation behavior.
- BBQ tests cover every integrated classic/region/diet configuration, deterministic repeated output, source labels, selected cuts, cooking endpoints, ready-to-eat handling, plant-specific methods, small-portion branches, dietary/pantry safeguards, suitable shop subtypes and absence of mandatory wood-shopping ingredients.
- Ingredient-led tests cover compatible combinations, main preservation, substitutions, side sequencing and quantities.
- Location/provider tests cover exact-radius boundaries, safe links, manual redirect handling, caches and error responses.
- Shopping tests reject implausible specialist matches and check ranking/deduplication. Type checking, lint and production builds cover integration.

Extend templates with concrete ingredients, cuts, cooking sequence, substitutions and method notes. Keep raw/cooked/drained states distinct. New regional profiles need measured warm/finish ingredients and valid dietary labels. Preserve the exact source label and verify the full matrix after additions.

Nutrition or verified retailer inventory requires its own evidence, source and measurement basis. A future inventory response should identify the actual branch/product, timestamp, status, quantity and price/currency. Do not infer availability from map categories.

## Image provenance

All three images were generated with the built-in Imagegen tool for this website and visually checked. They are 1536 × 1024 PNGs. No external stock photography or third-party logo assets were used for them. The following are recorded prompt briefs, not verbatim prompts:

| Asset | Recorded generation brief |
| --- | --- |
| `public/images/fusion-table-hero.png` | Editorial natural-light food image of Japanese–Italian miso mushroom pasta: glossy tagliatelle, mushrooms, herbs and sesame in a sage ceramic bowl, with lemon and a small ingredient bowl on light oak. Landscape 3:2, elevated 45-degree view, food toward centre-right; no text, logos or people. |
| `public/images/korean-tacos.png` | Editorial view of three vegan corn-tortilla tacos with gochujang-coated mushrooms and tofu, cabbage, scallions, sesame and coriander, on a sage plate and warm oak, from an elevated 45-degree angle. |
| `public/images/moroccan-traybake.png` | Editorial vegan chickpea, cauliflower and carrot traybake with lemon, herbs, cumin and paprika, in a cream dish on warm oak with sage linen, from an elevated 45-degree angle. |

These images illustrate the featured pairings. They do not establish that a recipe was cooked or photographed, and their garnishes or vegetables can differ from the generated recipe. For example, the Moroccan template uses potatoes, carrots, onion and chickpeas, while the inspiration image includes cauliflower. The structured ingredient list and method are the cooking instructions.
