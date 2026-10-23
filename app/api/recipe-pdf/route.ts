import { recipePdf } from "@/lib/recipe-pdf";
import { decodeShare, recipeFromShare } from "@/lib/share-recipe";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  try {
    const recipe = recipeFromShare(decodeShare(token));
    const pdf = recipePdf(recipe);
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"fusion-table-recipe.pdf\"",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("This link is not a recipe.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
