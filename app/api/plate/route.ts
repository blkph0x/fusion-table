import { renderPlate } from "@/lib/plate-picture";
import { decodeShare, recipeFromShare } from "@/lib/share-recipe";

export const dynamic = "force-dynamic";

const cache = new Map<string, { bytes: Uint8Array; type: string; note: string }>();

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  try {
    let picture = cache.get(token);
    if (!picture) {
      const rendered = await renderPlate(recipeFromShare(decodeShare(token)));
      picture = { bytes: rendered.bytes, type: rendered.contentType, note: rendered.note };
      cache.set(token, picture);
      if (cache.size > 40) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
    }
    return new Response(Buffer.from(picture.bytes), {
      headers: {
        "Content-Type": picture.type,
        "Cache-Control": "public, max-age=86400",
        "X-Plate-Note": picture.note,
      },
    });
  } catch {
    return new Response("This link is not a recipe.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
