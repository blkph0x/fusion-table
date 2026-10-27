import { withAutomaticPrices } from "./automatic-offers";
import { lookupQueries } from "@/lib/catalogue";
import { lookupColesQueries } from "@/lib/coles-catalogue";
import { lookupAldiQueries } from "@/lib/aldi-catalogue";
import { lookupIgaQueries } from "@/lib/iga-catalogue";
import { browserPriceRenderer, localShopPageRenderer } from "@/lib/browser-price-client";
import { lookupLocalShopPrices } from "@/lib/local-shop-prices";
import { readPublicShopPage } from "@/lib/public-shop-reader";
import { searchShopsWithFresh } from "@/lib/location-providers";
import { enrichShopWebsites } from "@/lib/shop-website-discovery";
import type { Shop } from "@/lib/locations";
import { createDeadline } from "@/lib/abort-deadline.mjs";
import { compareShopping } from "@/lib/shopping-compare";
import { parseShoppingPriceRequest } from "@/lib/shopping-request";
import { quoteItems } from "@/lib/price-memory";
import { ledgerFile, PostLimiter, readReportJson, ReportBodyError, withLedger } from "@/lib/ledger";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const limiter = new PostLimiter({ maxPerDevice: 80, maxTotal: 240 });
const render = browserPriceRenderer(process.env.FUSION_BROWSER_PRICE_URL);
const renderShop = localShopPageRenderer(process.env.FUSION_BROWSER_PRICE_URL);

export async function POST(request: Request) {
  try {
    const input = parseShoppingPriceRequest(await readReportJson(request));
    if (!limiter.allow(input.device)) return Response.json({ error: "A lot of prices were just checked. Please try again in a minute." }, { status: 429, headers });
    const deadline = createDeadline(35_000, [request.signal]);
    try {
      const signal = deadline.signal;
      let nearbySearch: Promise<Shop[]> | undefined;
      const nearbyShops = () => nearbySearch ??= input.location ? searchShopsWithFresh({ ...input.location, radiusKm: input.radiusKm ?? 5 }, { photonReverseUrl: process.env.PHOTON_REVERSE_API_URL, overpassUrl: process.env.OVERPASS_API_URL, shopProvider: process.env.SHOP_DATA_PROVIDER, appOrigin: new URL(request.url).origin }).then(result => enrichShopWebsites(result.shops, { appOrigin: new URL(request.url).origin }, signal).catch(() => result.shops)) : Promise.resolve([]);
      const result = await compareShopping(input, {
        woolworths: (queries, abort) => lookupQueries(queries, fetch, abort),
        coles: (queries, abort) => lookupColesQueries(queries, fetch, abort, render),
        aldi: (queries, abort) => lookupAldiQueries(queries, fetch, abort, render),
        iga: async (queries, abort) => {
          const shops = input.location ? await nearbyShops().catch(() => []) : [];
          const shop = shops.find(shop => /\biga\b/i.test(shop.name) && (shop.name.replace(/\b(?:iga|supa|supermarket|express|local|store|grocer|grocers|grocery|food|fresh|plus|liquor)\b/gi, "").trim().length >= 4 || /^\d+[a-z]?\s+[^,]+(?:street|st|road|rd|avenue|ave|parade|pde|drive|dr|lane|ln|highway|hwy|way)\b/i.test(shop.address || "") && /\b\d{4}\b/.test(shop.address || "")));
          const store = shop ? { id: shop.id, name: shop.name, website: "https://www.igashop.com.au/", area: input.area, address: shop.address, lat: shop.lat, lon: shop.lon } : undefined;
          // A named branch is selected through the retailer's normal chooser and
          // verified again by the adapter. Generic IGA listings cannot prove identity.
          const storeRender = store ? browserPriceRenderer(process.env.FUSION_BROWSER_PRICE_URL, fetch, store) : render;
          return lookupIgaQueries(queries, fetch, abort, storeRender, store);
        },
        local: async (context, abort) => {
          if (!context.location) return { quotes: [], warnings: [], checkedShops: [] };
          // The visitor supplies coordinates only. Shop identities/websites come from
          // our existing server-side map search, never request-provided URLs.
          const shops = await nearbyShops();
          return lookupLocalShopPrices(context.lines, shops, { area: context.area, location: context.location, radiusKm: context.radiusKm ?? 5, country: context.country }, { render: renderShop, ...(renderShop ? { discover: readPublicShopPage } : {}) }, abort);
        },
        recorded: (area, items, today) => withLedger(ledgerFile(), (ledger) => ({ result: quoteItems(ledger, area, items, today) })),
      }, signal);
      return Response.json(withAutomaticPrices(result), { headers });
    } finally { deadline.dispose(); }
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    const message = timeout ? "The price check took too long. Retry this batch; completed results are kept." : error instanceof Error ? error.message : "The price check could not finish. Please try again.";
    return Response.json({ error: message }, { status: error instanceof ReportBodyError ? error.status : timeout ? 504 : 400, headers });
  }
}
