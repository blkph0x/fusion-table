import { env } from "cloudflare:workers";
import { validateLocationQuery } from "@/lib/locations";
import { locationErrorResponse, searchLocations } from "@/lib/location-providers";

export const dynamic = "force-dynamic";

/** Explicitly submitted searches only; the UI does not call this on keystrokes. */
export async function GET(request: Request) {
  try {
    const query = validateLocationQuery(new URL(request.url).searchParams.get("q"));
    const settings = env as unknown as Record<string, string | undefined>;
    const result = await searchLocations(query, {
      photonUrl: settings.PHOTON_API_URL,
      appOrigin: new URL(request.url).origin,
    });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return locationErrorResponse(error);
  }
}
