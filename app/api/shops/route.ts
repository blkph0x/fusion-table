import { env } from "cloudflare:workers";
import { validateShopSearch } from "@/lib/locations";
import { locationErrorResponse, searchShopsWithFresh } from "@/lib/location-providers";
import { enrichShopWebsites } from "@/lib/shop-website-discovery";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const input = validateShopSearch({ lat: params.get("lat"), lon: params.get("lon"), radiusKm: params.get("radiusKm") });
    const settings = env as unknown as Record<string, string | undefined>;
    const result = await searchShopsWithFresh(input, {
      photonReverseUrl: settings.PHOTON_REVERSE_API_URL,
      overpassUrl: settings.OVERPASS_API_URL,
      shopProvider: settings.SHOP_DATA_PROVIDER,
      appOrigin: new URL(request.url).origin,
    });
    const shops = await enrichShopWebsites(result.shops, { appOrigin: new URL(request.url).origin }, request.signal).catch(() => result.shops);
    return Response.json({ ...result, shops }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return locationErrorResponse(error);
  }
}
