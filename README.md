# Fusion Table

**Familiar classics, new regional flavours, and nearby places to shop.**

Fusion Table is a responsive cooking website that turns a classic dish and a regional flavour profile into a structured recipe, then suggests nearby food shops for its ingredients. It includes a recipe studio, cooking mode, ingredient checklist, local shop directory, and a personal cookbook with notes and ratings.

![Fusion Table homepage](docs/images/fusion-table-preview-1792653198544.jpg)

## What the first release does

- Combines **8 classic cooking structures × 8 regional profiles**. Each combination supports **5 dietary choices**: no restriction, vegetarian, vegan, gluten-free, and dairy-free.
- Scales ingredient quantities to **1–12 servings**, with mild, medium, or hot seasoning and exact pantry-name matching.
- Provides ingredients, cooking steps, approximate preparation/cooking times, known ingredient allergens, and applicable food-temperature guidance.
- Finds a suburb, town, or postcode, or uses browser geolocation after the visitor chooses that option.
- Searches a **1–25 km radius** for supermarkets, greengrocers, butchers, fishmongers, markets, grocers, and specialty food shops.
- Suggests plausible shops for each ingredient using the mapped shop type, with links to retailer/product searches where available.
- Saves recipes, ratings, cooking notes, and the visitor's own kitchen-tested status in the current browser. Recipes and the cookbook export as JSON; the shopping list exports as CSV.

Recipe creation uses authored, deterministic cooking templates. It needs no model API key and every generated recipe is labelled **“Template-generated · not kitchen-tested.”** Flavour combinations are proposals to cook and improve; generated imagery illustrates inspiration rather than a tested result.

**Shop listings are live map data, but stock and prices are unverified.** A butcher or supermarket match identifies a place to ask. It does not confirm that a particular product, dietary variant, quantity, or price is available. A mapped market is not automatically a farmers market, and its operating day must be checked with the operator.

## Using the website

1. Choose a classic and a regional twist, then select the number of people.
2. Open **Diet, spice & pantry** to set preferences and list ingredients you already have.
3. Choose **Create my fusion**. Review the ingredients and method, and tick any additional ingredients already in your kitchen.
4. Choose **Find these ingredients**, set your location, and select a shopping radius. Choose the correct location when several search results have similar names.
5. Browse shop categories and ingredient suggestions. Use shop websites or contact details to check availability before travelling.
6. Save a recipe to your cookbook. After cooking, record a rating, your changes, and whether you cooked it. Export the cookbook to keep an independent copy.

Distances are measured in a **straight line** from the selected point. Walking or driving routes can be longer. Search results are a limited selection from OpenStreetMap and may miss shops, especially occasional markets.

## Development setup

Fusion Table is a standalone application repository. Run website commands from its root directory, normally named `fusion-table`.

Requirements:

- **Node.js 22.13.0 or later**.
- **pnpm 11.25.0**, as pinned by `packageManager` in `package.json`.
- Git; Git and tar are used by the Sites publishing workflow.
- Internet access for initial dependency installation and live map searches.

For an ordinary local checkout with the pinned pnpm available:

```sh
cd fusion-table
pnpm install --frozen-lockfile
pnpm dev
```

Open the development URL printed by the server. A clean checkout selects the portable development profile and normally starts on port 5173. The optional checkout-local execution profile is kept in ignored `.sites-runtime/` state.

In the managed Linux Sites environment, use its installation workflow. The supplied `install:ci` script is specifically the managed Bash/pnpm installer and additionally requires Linux `flock` and GNU `timeout`:

```sh
pnpm run install:ci
```

Use one installer at a time. Keep the pnpm lockfile and package manifest together; do not regenerate a second package-manager lockfile.

Useful existing commands:

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the Vite/Vinext development application. |
| `pnpm build` | Build the Worker and client assets. |
| `pnpm start` | Preview the built Worker locally through Wrangler; this does not publish it. |
| `pnpm exec tsc --noEmit --allowImportingTsExtensions` | Type-check the application and native TypeScript tests. |

Run the focused tests directly with Node:

```sh
node --experimental-strip-types tests/recipes.test.ts
node --experimental-strip-types tests/locations.test.ts
node --experimental-strip-types tests/location-providers.test.ts
node --experimental-strip-types tests/shopping.test.ts
```

The tests cover recipe combinations and substitutions, scaling, pantry matching, location validation, exact-radius filtering, provider-result handling, and conservative ingredient/shop matching. Two provider regression cases check Workers-compatible manual redirect handling, refusal to follow upstream redirects, and successful-response caching. A passing test suite does not demonstrate taste, live retailer stock, or a completed kitchen trial.

## Map services and configuration

[Photon](https://github.com/komoot/photon) is the default provider for explicit location searches and tag-filtered nearby food shops, using [OpenStreetMap data](https://www.openstreetmap.org/copyright). The app rechecks distances locally. Photon returns up to 50 nearby results; this is not a complete area inventory.

An optional [Private.coffee Overpass](https://overpass.private.coffee/) adapter supports bounded area queries. It is not part of the default request path. Configure providers through server-owned runtime variables:

| Variable | Purpose |
| --- | --- |
| `PHOTON_API_URL` | Compatible HTTPS Photon search endpoint, including `/api/`. |
| `PHOTON_REVERSE_API_URL` | Compatible HTTPS Photon nearby reverse endpoint. |
| `SHOP_DATA_PROVIDER` | `photon` by default; `overpass` for the optional adapter. |
| `OVERPASS_API_URL` | Compatible HTTPS Overpass interpreter endpoint. |

The default services need no API keys. Do not put credentials in source, browser code, URLs, or the hosting manifest. If a future provider needs credentials, use the deployment platform's server-side secret management and the provider's supported authentication mechanism.

For endpoint contracts, attribution, cache limits, provider policies, and verification records, read [Live location and shop data](docs/LOCATION_DATA.md).

## Storage, privacy and deployment

The current cookbook, saved location and radius use browser `localStorage`. They do not sync between devices. Clearing site data removes them; exported JSON is a portable record, with no import interface in this first release.

Submitted location text and coordinates/radius needed for a shop query are sent to the selected map provider. The app does not send recipe history, notes, names, or emails to those providers. Opening the optional map also contacts OpenStreetMap. Precise browser geolocation is requested only after the visitor selects that action.

The website is configured for a **private Sites deployment**. The platform controls access; application code does not implement a separate account system. `.openai/hosting.json` identifies the existing Site and keeps D1/R2 bindings unset. Build output and checkout-local state are ignored. For deployment, use the Sites source/version workflow, preserving the assigned project identity and current private audience; `pnpm build` alone does not deploy.

## Relationship to the research repository

Source reference: [blkph0x/p-vs-np-proof-research](https://github.com/blkph0x/p-vs-np-proof-research), inspected at commit [`7dedc73f758dfbdc072e7aa29dfc08505761ebd5`](https://github.com/blkph0x/p-vs-np-proof-research/tree/7dedc73f758dfbdc072e7aa29dfc08505761ebd5).

Fusion Table is a **new application inspired by the research project's practice of recording proposals, checks and observed results**. It does not repurpose the binary-code/SAT solvers as a cooking engine or depend on a P-versus-NP result. The original repository was cloned for inspection and is retained separately; Fusion Table's application source is maintained in its own repository.

See [Architecture](docs/ARCHITECTURE.md) for implementation boundaries, extension points, and image provenance.
