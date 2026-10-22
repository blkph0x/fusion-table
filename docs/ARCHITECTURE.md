# Fusion Table architecture

## Purpose and boundaries

Fusion Table has two independent capabilities: a deterministic fusion-recipe composer and live discovery of nearby food shops. Recipe composition works without a network request. Shop discovery requires a map provider and returns places that may carry an ingredient, with inventory explicitly unverified.

The application uses React with the Next-style App Router through Vinext. Vite builds the client and Cloudflare Worker. The supplied Sites integration in `vite.config.ts` and `worker/index.ts` is retained for hosted execution and private access.

The website is maintained as a standalone Fusion Table application repository. The original [research repository](https://github.com/blkph0x/p-vs-np-proof-research) was cloned for inspection and is retained separately. Its inspected baseline is [`7dedc73f758dfbdc072e7aa29dfc08505761ebd5`](https://github.com/blkph0x/p-vs-np-proof-research/tree/7dedc73f758dfbdc072e7aa29dfc08505761ebd5). No mathematics engine is called by this website. The reused idea is the separation between a proposed recipe, automated checks, and the cook's recorded observations.

## Main modules

| Path | Responsibility |
| --- | --- |
| `app/page.tsx` | Responsive Discover, Recipe Studio, Local Shops and Cookbook views; state, cooking mode, local saves and exports. |
| `app/layout.tsx` and site styles | Global presentation and application metadata. |
| `lib/recipe-types.ts` | Recipe briefs, ingredient categories, steps and generated recipe shape. |
| `lib/recipes.ts` | Classic structures, regional flavour profiles, dietary substitutions, serving scaling, pantry matching and structured methods. |
| `lib/locations.ts` | Provider-independent location/shop types, input validation, distance calculations, normalisation, bounded results and safe links. |
| `lib/location-providers.ts` | Outbound Photon/Overpass calls, provider selection, timeouts, caches, cooldowns and error mapping. |
| `lib/shopping.ts` | Conservative ingredient/shop matching and ranking. |
| `app/api/locations/route.ts` | Explicit location-search API. |
| `app/api/shops/route.ts` | Bounded nearby-shop API. |
| `public/images/` | Generated culinary inspiration imagery. |
| `tests/` | Focused deterministic tests for recipes, map results and matching rules. |
| `.openai/hosting.json` | Site identity and deployment bindings. D1 and R2 are unused. |
| `scripts/`, `vite.config.ts`, `worker/index.ts` | Supplied installation, development, build and Sites runtime integration. |

The starter contains optional database and connector helpers. Their presence does not mean a retailer inventory connector, application database, or background research agent is active.

## Recipe composition

`generateRecipe(brief)` accepts a classic ID, region ID, whole servings from 1–12, one dietary preference, a heat preference, and optional pantry text or terms. It validates the brief, assembles the appropriate classic method and regional seasoning, scales the ingredient amounts from four servings, and returns structured ingredients and steps.

The eight classic structures are creamy pasta, tacos, risotto, burgers, a roast traybake, fried rice, flatbread, and cottage pie. The eight profiles are Japanese, Korean, Thai, Mexican, Indian, Levantine, Italian, and Moroccan. The five dietary variants are no restriction, vegetarian, vegan, gluten-free, and dairy-free. These give 320 supported classic/region/diet configurations before servings, heat and pantry choices; they are not 320 independently kitchen-tested recipes.

Ingredient categories are `produce`, `butcher`, `fishmonger`, `grocery`, and `specialty`. Each ingredient has a stable ID, name, numeric amount, unit, known ingredient allergens, optional notes, and pantry status. Names and methods reflect substitutions: a vegan taco uses tofu and its method cooks tofu, rather than retaining chicken instructions.

Pantry matching is intentionally exact after case/spacing normalisation and explicit aliases. For example, ordinary soy sauce does not satisfy labelled gluten-free tamari, and milk does not satisfy coconut milk. A match is a convenience for the shopping checklist, not a quantity or freshness check.

Preparation and cooking times are estimates. Scaling quantity does not prove the same elapsed time for twelve servings, so larger batches receive pan/tray and batch-cooking guidance. Chicken and mince instructions retain their thermometer endpoint regardless of serving count. The source for the 75°C endpoint is [Food Standards Australia New Zealand](https://www.foodstandards.gov.au/consumer/prevention-of-foodborne-illness/food-safety-basics).

Every result retains `sourceLabel: "Template-generated · not kitchen-tested"`. A user's “I've cooked this recipe” setting is saved as their observation and does not convert a template into independently validated evidence. Dietary labels are ingredient-selection rules; packaged-food labels and substitutions still require checking.

## Local discovery and ingredient suggestions

### Request flow

1. The visitor explicitly submits location text to `GET /api/locations?q=...`, or chooses browser geolocation.
2. Text search returns up to six Photon location candidates. The visitor selects the intended place.
3. The client calls `GET /api/shops?lat=...&lon=...&radiusKm=...` for a radius between 1 and 25 km.
4. The server validates finite coordinates and the bounded radius, calls its configured provider, normalises records, filters exact straight-line distances, and returns attributed results.
5. `lib/shopping.ts` associates the recipe's missing ingredients with plausible shop types. The client shows up to three suggestions per ingredient.

The default nearby provider is Photon tag-filtered reverse search, with at most 50 returned food-shop entries. This is labelled `coverage: "limited-nearby"`, and its count is not presented as an area-wide total. Optional Overpass queries use `coverage: "area-query"`; dataset incompleteness still applies.

`inventoryStatus` is always `"unverified"` in this release. Shop-category matches, website links, and retailer product-search links do not demonstrate stock. Source opening-hours text is shown as supplied; the application does not infer “open now.” A mapped marketplace is not assumed to be a farmers market or to run every day.

Matching uses the original OpenStreetMap shop subtype. A bakery can match bread or buns; a spice merchant can match dry spices; a butcher can match meat. An arbitrary specialty shop does not match all specialist ingredients. Appropriate specialist sources rank ahead of supermarkets, then grocers or convenience shops; distance orders otherwise equivalent sources. A supermarket match still needs product and dietary-variant confirmation.

### Provider boundary

Provider endpoint selection belongs to server runtime configuration, never incoming visitor parameters. Endpoint configuration is restricted to HTTPS URLs without user information, fragments or query strings. Overpass queries are generated from validated numbers and a fixed shop-tag set, rather than accepting user-authored query text.

A bounded in-memory cache stores location results for 24 hours and shop results for 30 minutes. Identical in-flight requests coalesce. Provider cooldowns and concurrency limits operate per Worker isolate, with explicit timeouts and maximum response sizes. These are suitable controls for a private low-traffic first release, not a distributed public-service quota.

Malformed input, provider rate limits, timeouts and upstream failures return explicit non-success responses. A failed or incomplete provider request is never turned into a successful empty directory. Responses retain attribution and retrieval time. See [LOCATION_DATA.md](LOCATION_DATA.md) for exact contracts, limits, policies, configuration and live verification evidence.

## State, privacy and persistence

| State | Location and lifetime |
| --- | --- |
| Current recipe, form values, ingredient checkmarks, filters and cooking step | React state in the active page. |
| Saved recipe snapshots, notes, ratings and own kitchen-test status | Browser `localStorage`, under `fusion-table-v1`. |
| Selected location and radius | The same browser-local record. |
| Map provider cache and in-flight requests | Transient Worker-isolate memory; not a durable user database. |
| Recipe/cookbook JSON and shopping CSV | Explicitly downloaded by the visitor. |

Cookbook records are device/browser specific and have no cross-device sync. Clearing browser site data removes them. Exports preserve a portable record, but this version does not offer an import interface. A saved recipe stores its complete snapshot, so future engine changes do not silently rewrite the saved method.

Location text goes to Photon for geocoding. Coordinates and radius go to the configured nearby provider. Recipe history, kitchen notes, user names and email addresses are not included in those requests. The optional map contacts OpenStreetMap only when opened. External shop/product-search links contact their destination when followed. Precise geolocation requires the visitor's browser permission after an explicit action.

## Hosting and source workflow

The application is configured for an owner-private Sites deployment; the hosting platform enforces the audience. It does not create an application-specific login/password system. Keep the assigned `project_id` in `.openai/hosting.json` when updating the existing Site and preserve private access unless an authorised owner changes it.

The current manifest leaves D1 and R2 unset. Do not treat browser-local cookbook entries as server-backed accounts. Runtime configuration and any future secrets belong in server-side deployment settings; never commit credentials or include them in generated client code.

Use the supplied Sites source helper to synchronise the exact source, build, package, and deploy the corresponding version. The standalone Fusion Table repository contains the application at its root; the Site deploys that application source through its configured source workflow. Generated `dist/`, dependencies, local environment files, publication archives and runtime state remain outside tracked source. A local build is not evidence of a completed deployment; use the hosting operation's result.

For local development, `package.json` pins pnpm 11.25.0 and requires Node 22.13.0+. Existing `dev`, `build` and `start` scripts select the supplied runtime workflow. `install:ci` is the managed Linux Bash/pnpm installer. Ordinary clean local checkouts select the portable profile. [README.md](../README.md) gives the current commands.

## Focused verification

- Recipe tests exercise all classic/region/diet combinations, substitution-sensitive methods, serving scaling, conservative pantry matching, heat changes and invalid inputs.
- Location tests exercise coordinate/radius validation, geodesic edge cases, exact boundaries, incomplete data, safe links, provider errors and bounded counts.
- Two provider regression tests exercise Workers-compatible `redirect: "manual"`, rejection of upstream redirects without following them, and caching of successful location results.
- Shopping tests prevent implausible specialist matches, preserve category-specific matching and check ranking/deduplication.
- Type checking and a production build check framework integration. Browser QA checks the actual user flows separately.

These checks cannot verify taste, recipe repeatability, a shop's current stock, or a retailer's prices. Kitchen observations and real retailer evidence remain separate data.

## Extension points

### Ingredient catalog

The current ingredient definitions live in `lib/recipes.ts`. A future catalog can move them into a versioned data layer with canonical ingredient IDs, preparation states, units, retailer identifiers, provenance and verified dietary attributes. Preserve distinctions such as raw versus cooked, canned drained weight, and a specifically labelled gluten-free product. If nutrition is added, record the source and measurement basis instead of assigning values from recipe prose.

### Additional recipes and regions

Add a classic method or profile through the existing typed structures, then check every supported dietary substitution and the actual ingredient use in its method. Keep the template source status until a kitchen trial is recorded. New recipes should use ingredients that the sourcing layer can classify; adding a cuisine name alone does not create a useful regional adaptation.

### Real retailer inventory

Confirmed availability or pricing requires a permitted retailer/provider integration with the correct branch, product and freshness information. Introduce a separate inventory response model that carries evidence such as retailer product ID, store ID, timestamp, status, currency and price basis. Keep map-based suggestions visibly distinct from verified inventory, and never upgrade a category match into “in stock.” Follow the provider's access terms and store credentials only in server-side secret settings.

For a wider public audience, replace public demo endpoints with provisioned or self-hosted services and add shared rate limiting/cache infrastructure before increasing traffic. The current per-isolate controls are not a substitute for an agreed provider quota.

## Image provenance

All three images were generated with the built-in Imagegen tool for this website and visually checked. They are 1536 × 1024 PNGs. No external stock photography or third-party logo assets were used for them. The following are recorded prompt briefs, not verbatim prompts:

| Asset | Recorded generation brief |
| --- | --- |
| `public/images/fusion-table-hero.png` | Editorial natural-light food image of Japanese–Italian miso mushroom pasta: glossy tagliatelle, mushrooms, herbs and sesame in a sage ceramic bowl, with lemon and a small ingredient bowl on light oak. Landscape 3:2, elevated 45-degree view, food toward centre-right; no text, logos or people. |
| `public/images/korean-tacos.png` | Editorial view of three vegan corn-tortilla tacos with gochujang-coated mushrooms and tofu, cabbage, scallions, sesame and coriander, on a sage plate and warm oak, from an elevated 45-degree angle. |
| `public/images/moroccan-traybake.png` | Editorial vegan chickpea, cauliflower and carrot traybake with lemon, herbs, cumin and paprika, in a cream dish on warm oak with sage linen, from an elevated 45-degree angle. |

These images illustrate the featured pairings. They do not establish that a recipe was cooked or photographed, and their garnishes or vegetables can differ from the generated recipe. For example, the Moroccan template uses potatoes, carrots, onion and chickpeas, while the inspiration image includes cauliflower. The structured ingredient list and method are the cooking instructions.
