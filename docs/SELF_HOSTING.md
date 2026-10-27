# Self-hosting Fusion Table and building your own app

For the current shared cook reports and recorded prices, use the explicit **Node** profile with a persistent filesystem. On Windows, `scripts/Start-Fusion.ps1` defaults to Node: run `-Task build`, then `-Task start`. On Linux, build with `FUSION_RUNTIME=node NEXT_PUBLIC_BASE_PATH=/fusion pnpm build`, then start with `FUSION_RUNTIME=node NEXT_PUBLIC_BASE_PATH=/fusion FUSION_DATA_DIR=/persistent/fusion-data node scripts/run-framework.mjs start --port 8792`. Use one supervised Node writer and back up that directory. See [the verified environment guide](DEV_ENVIRONMENT.txt). The Worker profile remains available for Sites/Cloudflare; it needs a separate durable storage adapter for shared records. Build and start the same profile; both currently use `dist/`.

Fusion Table v0.2.3 includes the complete source for a deterministic recipe website, an expanded barbecue/classic catalog, an ingredient-led meal builder and live local shop discovery. The default deployment is a React/Vinext website backed by a Cloudflare Worker. Both recipe engines are pure TypeScript and can be reused independently.

## 1. Get the source

The [repository](https://github.com/blkph0x/fusion-table) and [published GitHub release assets](https://github.com/blkph0x/fusion-table/releases) are public. No owner-granted repository access is required to clone or download them. The hosted Sites app is also public; its access settings remain separate from repository visibility.

```sh
git clone https://github.com/blkph0x/fusion-table.git
cd fusion-table
```

Alternatively, extract `fusion-table-v0.2.3-source.zip` and open the included `fusion-table` directory. The ZIP contains application code, complete recipe data, image assets, server routes, vendored runtime helpers, environment examples, tests, documentation, package manifest and pnpm lockfile. Installed dependencies, build output and credentials are omitted. Install from the lockfile to reproduce the build.

## 2. Install and run locally

Use Node.js **22.13.0+** and pnpm **11.25.0**. Install the pinned package manager if needed:

```sh
npm install --global pnpm@11.25.0
```

From the application root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the printed URL, normally `http://localhost:5173`. Use the committed pnpm lockfile and only one installer at a time; do not generate a separate npm or Yarn lockfile.

A clean checkout selects the portable execution profile. All framework helpers resolve from this repository and `node_modules`; there is no dependency on another machine's plugin filesystem. The managed `pnpm install:ci` workflow uses Bash, `flock` and GNU `timeout` and is only for the managed Linux Sites environment. Ordinary Windows, macOS and Linux checkouts use the commands above.

Recipe generation is synchronous, deterministic and local. It makes no network call and requires no model, credential or database. Map searches use configured network providers. The cookbook stays in the visitor's browser, and browser geolocation requires permission after an explicit visitor action.

## 3. Verify and build

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

`pnpm test` recursively discovers `*.test.ts`, `*.test.mts`, `*.test.js` and `*.test.mjs` under `tests/`. Filenames are expanded in Node so the command does not depend on shell wildcard handling. Tests cover the full classic/region/diet matrix, ingredient-led meals, dietary substitutions, cut and temperature rules, ready-to-eat smoked products, deterministic output, pantry matching, map-provider errors and conservative shop suggestions.

`pnpm build` creates the Worker in `dist/server/`, the browser assets in `dist/client/`, and the generated Wrangler configuration. `pnpm start` previews that built Worker locally; use its printed URL. Building does not publish. GitHub CI performs the locked installation, tests, type checking, lint and build without deployment secrets.

### Static hosting and other runtimes

The complete app needs server routes for live location/shop searches. **GitHub Pages or a generic static-file host alone cannot provide the full website.** The map routes currently use Cloudflare Worker environment bindings. A Node/Docker or other runtime needs an explicit adapter and its own verification; this release does not claim that deployment target works unchanged.

A separate static or mobile app can use the pure TypeScript recipe engines directly. For location discovery, provide an appropriate backend or proxy. The included map routes serve the same-origin website; a different browser origin needs a deliberate CORS/access design.

## 4. Configure optional map providers

Default Photon/OpenStreetMap discovery works without a key. To override a provider, copy **one** local example:

- `.dev.vars.example` → `.dev.vars` for the Cloudflare Worker workflow (recommended).
- `.env.example` → `.env` for the supported environment-file alternative.

Uncomment only the values needed. When `.dev.vars` exists, Cloudflare does not combine it with `.env` for local secret loading. See [Cloudflare Vite environment guidance](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/).

| Variable | Purpose and default |
| --- | --- |
| `PHOTON_API_URL` | HTTPS location endpoint: `https://photon.komoot.io/api/`. |
| `PHOTON_REVERSE_API_URL` | HTTPS nearby endpoint: `https://photon.komoot.io/reverse`. |
| `SHOP_DATA_PROVIDER` | `photon` by default, or `overpass`. |
| `OVERPASS_API_URL` | HTTPS interpreter: `https://overpass.private.coffee/api/interpreter`. |

Restart the local server after changing these settings. Provider configuration stays server-side; visitors cannot supply arbitrary upstream endpoints. No recipe-generation environment variables are needed. Keep future provider credentials out of browser code, URLs, source and release archives.

## 5. Deploy your own Cloudflare Worker

This creates an independent deployment in **your Cloudflare account**. It preserves the original Site identity in `.openai/hosting.json` and needs no Sites publishing helper.

Build and validate using your own distinct Worker name:

```sh
pnpm build
pnpm deploy:cloudflare --name your-name-fusion-table --dry-run
```

The helper creates `dist/server/wrangler.self-hosted.json`, retaining relative module/asset paths while setting the requested name and removing inherited account/custom-domain route selection. The original generated configuration stays unchanged. The bare original name `fusion-table` is rejected. A dry run validates without uploading.

Sign in to your own account, then publish:

```sh
pnpm exec wrangler login
pnpm deploy:cloudflare --name your-name-fusion-table
```

Wrangler prints the actual deployed URL. Select the intended account if you belong to several. For headless automation, put Cloudflare's documented account/API-token variables in your CI secret store, not Git.

The helper uses `--keep-vars` so ordinary runtime variables configured through the Cloudflare dashboard survive subsequent deployments. Set any optional map overrides in that dashboard. Local `.dev.vars` values do not configure a deployed Worker. See [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/) and [Cloudflare build/deployment environments](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/).

A new build replaces the output directory. Recreate the independent configuration with the same name if needed:

```sh
pnpm deploy:cloudflare --name your-name-fusion-table --config-only
```

A `workers.dev` deployment has its own audience and does not inherit the managed Site's access settings. Configure Cloudflare Access or another appropriate authentication layer if the whole site should be private. For larger public map traffic, provision suitable provider capacity and shared rate limiting/caching rather than relying on demo-service capacity or per-instance controls.

## 6. Reuse the deterministic recipe engines

### Classic and barbecue templates

`lib/recipes.ts` exports the full `CLASSICS`, `REGIONS` and `DIETS` arrays and `generateRecipe()`. The original entries remain. `lib/bbq-classics.ts` adds the smoke and grill classics, including shotgun shells, ribs on a rack, foil-boat ribs, burnt ends, smoked meatloaf and a rotisserie roast. `lib/bbq-regions.ts` adds 16 profiles. Home kitchen is `home-style`.

```ts
import { generateRecipe } from "./lib/recipes.ts";

const recipe = generateRecipe({
  classicId: "smoked-brisket",
  regionId: "texas-bbq",
  servings: 4,
  diet: "balanced",
  spiceHeat: "medium",
  pantry: ["olive oil", "salt"],
});
```

### Catalogue now

There are 34 × 25 = 850 classic/region pairings and 4,250 configurations with the 5 dietary choices. The generator validates inputs, selects a concrete dietary adaptation, scales four-serving quantities once, merges compatible ingredient entries, and returns cooking steps, equipment, method notes and applicable safety guidance. The same input returns the same full recipe. An optional `cookPace` of `quick`, `morning`, `lunch` or `long` adds a schedule note only. Leave it off and the id, steps and minutes stay the same.

Barbecue profiles supply separate warm and finishing ingredients. Templates use both in a deliberate sauce/dressing sequence, including protection against scorching sweet sauces. Cold-smoked platters use commercially ready-to-eat foods or fully cooked alternatives; there is no home raw-fish curing workflow. No smoking wood or fuel is required as a shopping ingredient.

### Main ingredient and method

`lib/meal-catalog.ts` contains compatible main/method options, regions and sides. `getMethodsForMain()` and `getMainsForDiet()` support guided controls.

```ts
import { generateMeal, getMethodsForMain } from "./lib/meals.ts";

const methods = getMethodsForMain("chicken");
const meal = generateMeal({
  mainId: "chicken",
  methodId: "schnitzel",
  regionId: "japanese",
  sideId: "rice-greens",
  servings: 4,
  diet: "balanced",
  spiceHeat: "medium",
  pantry: ["olive oil", "salt"],
});
```

This engine retains the chosen main and rejects incompatible main/diet/method choices rather than silently replacing that ingredient. Its 266 compatible main/method pairs × 76 regions × 90 sides give 1,819,440 configurations. Spice is gentle, mild, medium, hot or fiery. Mild, medium and hot keep their previous amounts. Home kitchen is the weekday flavour. Each other region uses its own paste, heat, spices and herbs. Serving, dietary, heat and cook-session variants do not inflate that count.

Both engines return typed ingredients, quantities, steps, estimated times, shopping categories and the exact source label **“Template-generated · not kitchen-tested”**. Keep that label in your own interface. Automated validity checks do not demonstrate taste or a completed kitchen trial.

## 7. Create release assets

### Editable source ZIP

From a Git checkout, commit all intended source changes, then run:

```sh
pnpm release:source
```

The script requires a clean checkout and archives the committed `HEAD` into:

```text
releases/fusion-table-v0.2.3-source.zip
releases/fusion-table-v0.2.3-source.zip.sha256
```

The version comes from committed `package.json`. The ZIP includes tracked source and rejects tracked environment files, private-key filenames, generated dependency/build/cache directories and common credential formats. These checks are a backstop, not a complete secret audit. The checksum identifies exact archive bytes; publish it with the matching version/tag.

### Compiled Worker archive

After a fresh successful build:

```sh
pnpm release:worker
```

This needs the standard `tar` command and creates `releases/fusion-table-v0.2.3-cloudflare-worker.tar.gz` plus its checksum. It includes the compiled server/client and an independent deployment README/configuration. Original Site metadata, Worker name, account routing, local environment/key files and runtime variables are excluded. Inherited provisioned resource/service bindings and absolute configuration paths are rejected. Current Fusion Table needs no D1, R2 or service binding.

The compiled archive is for deployment; use the source ZIP for editing or building another app. Cloudflare's Vite plugin may copy `.dev.vars` into build output, so do not share an arbitrary manually zipped `dist/` containing local settings. Inspect deployment bundles separately.

## 8. Publish a versioned GitHub release

The **Publish versioned release** workflow runs on `main` when `package.json` or `.github/workflows/release.yml` changes, or through manual dispatch. It does not release every general source commit.

1. Update `package.json` and add `docs/releases/vVERSION.md` notes.
2. Commit all intended application/catalog/documentation/tooling changes together.
3. Push to `main` and inspect the Actions run.

The workflow validates the version, checks for an existing `vVERSION` release, installs locked dependencies and runs tests, TypeScript, lint and build. After successful checks it creates the missing release with source ZIP, Worker archive and `SHA256SUMS`. Notes record the exact commit and verification run. Its short-lived `GITHUB_TOKEN` has `contents: write`; no Cloudflare credential is needed and the workflow does not deploy a website.

Existing releases/assets stay untouched. A 404 counts as absent only after release-read access is confirmed. Authentication/network failures and an existing tag pointing to another commit stop publication. If uploading leaves a draft, inspect it before retrying; the workflow does not overwrite/delete previous release content automatically. See [GitHub release API](https://docs.github.com/en/rest/releases/releases), [release CLI](https://cli.github.com/manual/gh_release_create) and [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Clone or release download denied | The repository and published releases are public. Check the repository URL, release tag and network/proxy settings; Sites access settings are separate. |
| `pnpm` missing/wrong version | Install pnpm 11.25.0 and use supported Node. |
| Deployment cannot find build output | Run `pnpm build` before the deployment helper. |
| Ingredient-led choice is rejected | Select a compatible main, diet and method; that builder does not silently exchange the main. |
| No nearby shops appear | Verify location/radius and provider response. Coverage is incomplete; stock is never inferred. |
| Cookbook missing on another device | Storage is browser-local; account sync is not implemented. |
| Cookbook cannot accept another new recipe | Export your records, then make room below the 100-new-save limit. Existing records are retained. |

See [Architecture](ARCHITECTURE.md) for implementation boundaries and [Live location/shop data](LOCATION_DATA.md) for provider attribution and limits.

## 8. Pictures, PDF and links you can send

Every recipe page asks this site for a picture at `/api/plate`. The three example plates, and eight exact meals, use the generated pictures in `public/images`. Every other dish is painted on this computer from that recipe's own ingredient list, so a different meal does not reuse another meal's picture. The same recipe paints the same picture again. A seeded finish is painted rather than shown as one of the saved pictures. Set `FUSION_LOCAL_IMAGE_URL` to a local Automatic1111-compatible server, for example `http://127.0.0.1:7860`, and this site will ask that server to draw the plate. The address must be this machine (`127.0.0.1`, `localhost` or `::1`). No picture request is sent to a cloud API, and no API key is required. If that server is off, the painted plate is used. The picture is not a photograph of a cooked dish. On a host that answers public files with an empty file signal, the site reads `public/` or `dist/client/` on this machine and sends the bytes itself.

Save PDF downloads `/api/recipe-pdf`. The file is the template, including the line that it is not kitchen-tested.

Share copies a link such as `/r/<token>`. The token rebuilds the same recipe. Friends do not need an account, PHP, or MySQL. The same Node app does this on Windows and Linux. If the site is mounted under a prefix such as `/fusion`, set `NEXT_PUBLIC_BASE_PATH=/fusion` for that build only. The favicon, pictures, PDF and shared links then stay under that prefix. Do not hard-code the prefix into the public GitHub config.

## 9. The cook's book and shop prices

Ratings, yes or no, and "I will not make this again" are written to `data/community-ledger.json` on the machine running the site. Set `FUSION_DATA_DIR` to put that file somewhere else. The same file works on Windows and Linux. There is no account. A random id in the browser keeps one person's latest report distinct. Older reports are kept.

A plate is still generated by the template. Reports only change what is offered first. The plate leaves that default list when at least five people have said whether they would make it again, at least four say they will not, and those votes are at least 80%. It stays on the Trends page with the reasons. Three 0 or 1 star reports ask what was wrong and what to change. If two or more people agree an ingredient should be less or more, the recipe page can show that try. The template amounts are unchanged until the visitor asks to see the try.

Shop prices are the same book. Open a public https page, or type the price you saw. A price that cannot be read is not invented and is not stored as $0. What you type is labelled as recorded. A page read is labelled as a page read. Neither is a live shelf price. Averages use only prices people typed for that postcode, and only once two of them exist. Specials stay out of the average.
