# Live location and shop data

The first release uses real public map data. It does not include a retailer stock,
price, reservation or checkout integration. Ingredient-to-shop suggestions are
inferences from the mapped shop category, not evidence of products in stock.

## Providers and permissions

- **Location search:** [Photon](https://github.com/komoot/photon#demo-server),
  `https://photon.komoot.io/api/`. Its operator permits reasonable project usage,
  throttles extensive traffic and gives no availability guarantee. Searches are
  submitted explicitly; there is no request on every keystroke.
- **Nearby food shops by default:** Photon's documented
  [tag-filtered reverse search](https://github.com/komoot/photon/blob/master/docs/api-v1.md#reverse),
  `https://photon.komoot.io/reverse`. Radius is in kilometres. One request includes
  the supported food-shop tags and returns at most 50 ranked nearby results.
  The exact-radius filter is applied again locally, and the list is explicitly
  labelled a limited selection rather than a complete directory.
- **Optional area-query provider:** [Private.coffee Overpass](https://overpass.private.coffee/),
  `https://overpass.private.coffee/api/interpreter`. The operator permits projects
  including commercial uses, asks for fair resource use and no identifying user
  data, and requires advance contact for large operations. Queries are bounded,
  use POST and identify this application in User-Agent/Referer.
- Both providers use OpenStreetMap data. Display **© OpenStreetMap contributors**
  linked to <https://www.openstreetmap.org/copyright> beside location/shop results.
- The chosen search text is sent to Photon. The selected latitude/longitude and
  radius are sent to Photon (or Private.coffee when configured); names, emails, recipe history and user IDs
  are not sent. Prefer a suburb or town as a location, and explain this data flow
  in the application's location panel/privacy information.

Nominatim's public endpoint is intentionally not used. Its
[current policy](https://operations.osmfoundation.org/policies/nominatim/) has
specific restrictions on automatically generated geocoding services.
The main `overpass-api.de` instance is also not used; current instance-specific
guidance discourages this deployment pattern and it timed out during a bounded
verification request. These are separate services with separate use conditions.

## Runtime configuration

Optional runtime variables allow a compatible self-hosted or provisioned provider
to replace either service without changing application source:

| Variable | Expected value |
| --- | --- |
| `PHOTON_API_URL` | HTTPS Photon search endpoint, including `/api/` |
| `PHOTON_REVERSE_API_URL` | HTTPS Photon reverse endpoint, including `/reverse` |
| `SHOP_DATA_PROVIDER` | `photon` (default) or `overpass` |
| `OVERPASS_API_URL` | HTTPS Overpass interpreter endpoint when Overpass is selected |

These values are server-owned. Visitors cannot provide a destination URL or an
Overpass query. Only a bounded set of shop tags and validated numeric coordinates
enter the Overpass query. Endpoints must use HTTPS and cannot contain credentials,
query parameters or fragments. The current default providers do not need API keys.
Any future authenticated provider adapter must keep credentials in server-side
runtime secrets, never in source or a client bundle.

Provider fetches use `redirect: "manual"` and reject 3xx responses without following
them. This preserves the configured destination and is compatible with Cloudflare
Workers, whose [Request API](https://developers.cloudflare.com/workers/runtime-apis/request/)
does not support `redirect: "error"`. Configure a canonical, non-redirecting endpoint.

## API contracts

`GET /api/locations?q=<explicitly submitted location>` returns `locations`,
`source`, `attribution`, `attributionUrl`, `fetchedAt` and `cached`. A location has
`id`, `name`, `label`, `lat`, `lon` and optional `country` / `region`. The UI should
let the user select between ambiguous candidates, rather than assume the first
one is their location.

`GET /api/shops?lat=<latitude>&lon=<longitude>&radiusKm=<1..25>` returns:

- `shops` with stable OSM IDs, names, categories, coordinates, exact `distanceKm`,
  available address/contact/opening-hours fields, `osmUrl`, and
  `inventoryStatus: "unverified"`.
- `count` (returned shops), `matchedCount` (parsed shops inside the radius),
  `sourceCount` (objects returned by Photon, or the selected count reported by
  Overpass), `truncated`, and `matchedCountIsLowerBound`. Photon never supplies an
  area-wide total, so `matchedCountIsLowerBound` is always true for that provider.
- `location`, `radiusKm`, `distanceType: "straight-line"`, attribution,
  `fetchedAt`, source dataset `osmTimestamp` when supplied, `cached` and `notice`.
- `coverage`: `limited-nearby` for Photon, or `area-query` for Overpass. A map
  dataset is not guaranteed to include every shop, even for an area query.

The response contains at most 50 Photon results or 120 Overpass results, sorted
by straight-line distance. Overpass output is capped at 750 objects. Haversine filtering happens on
unrounded distances against the user's exact centre. This matters for area
objects whose mapped geometry intersects a radius but whose centre lies outside.

Categories: `supermarket`, `produce`, `butcher`, `fishmonger`, `market`, `grocery`
and `specialty`. A generic mapped marketplace is labelled **Market**, not assumed
to be a farmers market or operating on a particular day. Opening-hours strings
are shown as supplied; the application does not infer “open now.”

The original `shopType` is retained from OSM's `shop` tag. Ingredient suggestions
in `lib/shopping.ts` use that detail: bakeries match actual breads/buns, cheese
shops match dairy cheese, spice shops match dry spices, and delis match a narrow
set of deli ingredient families. A generic specialty shop or marketplace does
not automatically match ingredients. Relevant specialist sources rank ahead of
supermarkets, then grocers/convenience shops; distance orders equivalent sources.
Even a category match for gluten-free bread is only a place to ask: availability,
labelling and suitability still need checking with the retailer.

Errors return `{ error, code, retryAfter? }` with a non-2xx status. Invalid inputs
produce 400; concurrency/cooldowns and provider rate limits produce 429;
unreadable provider output produces 502; unavailability/incomplete results produce
503; timeouts produce 504. Partial Overpass results containing a runtime-error
remark are rejected. An upstream error is never transformed into “no shops.”

## Caching and limits

In-memory caches are bounded to 80 combined entries. Locations are cached for
24 hours; shop results for 30 minutes. Identical in-flight requests coalesce.
Only one outbound request per provider runs per worker isolate, followed by
a short cooldown (1.2 seconds for Photon, 3.5 seconds for Overpass). A provider
429 enforces a 60-second cooldown. Upstream requests time out after 12 seconds
(Photon) or 22 seconds (Overpass), and large responses are rejected.

These controls are **per worker isolate**, not a global distributed quota. A
public service with many visitors should use a provisioned provider and a shared
cache/rate limiter; the current defaults suit this private, low-traffic first
release. They cannot guarantee completeness, current business operation or
service uptime. Return `fetchedAt` from the actual retrieval even on cache hits.

## Verification

Run the deterministic assertions with:

```sh
node tests/locations.test.ts
node tests/location-providers.test.ts
node tests/shopping.test.ts
```

Nine tests cover malformed inputs/query injection, coordinate limits, dateline and
antipodal distances, exact radius boundaries, missing source fields, unsafe links,
partial provider errors and truthful counts under result caps.
Provider tests also cover Workers-compatible redirect handling, safe rejection of
redirects, and the preservation of the retrieval time on cache hits. Ingredient
matching tests check specialist shop subtypes and ranked alternatives.

On 22 October 2026, live endpoint reads verified Photon location lookup for
Newtown, New South Wales and its nearby food-shop reverse query. The latter
returned 50 real map entries, all within the requested 1.5 km radius after
normalisation: 15 supermarkets, 12 specialty shops, 19 grocers, 2 produce shops,
1 market and 1 butcher. The maximum returned distance was approximately 1.418 km.
The multiple category results also verified that repeated `osm_tag` filters work
as alternatives. These counts are a verification record, not hard-coded app data.

Overpass requests timed out from the development executor, including a small
GET diagnostic. It is consequently optional, not a failed request that users
must wait for on every normal search. The live default is Photon.
