import { PLATE_IMAGE_VERSION } from "@/lib/plate-version";
import { decodeShare, recipeFromShare } from "@/lib/share-recipe";
import { imageService, pendingImage } from "./image-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url), token = url.searchParams.get("t") ?? "";
  let recipe;
  try { recipe = recipeFromShare(decodeShare(token)); }
  catch { return new Response("This link is not a recipe.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
  try {
    const result = await imageService().request(token, recipe, url.searchParams.get("warm") === "1" ? 0 : 1);
    if (url.searchParams.get("status") === "1") return Response.json({ status: result.status, key: result.key, retryAfterMs: result.retryAfterMs, note: result.note }, { headers: { "Cache-Control": "no-store", "X-Plate-Version": PLATE_IMAGE_VERSION } });
    const picture = result.picture ?? pendingImage(recipe);
    return new Response(Buffer.from(picture.bytes), {
      headers: {
        "Content-Type": picture.contentType,
        "Cache-Control": result.status === "ready" ? "public, max-age=86400" : "no-store",
        "X-Plate-Note": picture.note,
        "X-Plate-Cache": result.status === "ready" ? "persistent" : result.status,
        "X-Plate-Key": result.key,
        "X-Plate-Version": PLATE_IMAGE_VERSION,
        "X-Plate-Kind": picture.placeholder ? "placeholder" : "image",
        "X-Content-Type-Options": "nosniff",
        ...(result.status !== "ready" ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) } : {}),
      },
    });
  } catch {
    if (url.searchParams.get("status") === "1") return Response.json({ status: "unavailable", retryAfterMs: 30_000, note: "The image cache is unavailable. Your recipe is ready." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    const picture = pendingImage(recipe);
    return new Response(Buffer.from(picture.bytes), { headers: { "Content-Type": picture.contentType, "Cache-Control": "no-store", "X-Plate-Kind": "placeholder", "Retry-After": "30" } });
  }
}
