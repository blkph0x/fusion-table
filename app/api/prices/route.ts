import { CATALOGUE_LABEL, cleanSearchQuery, lookupQueries, lookupQuery } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers });
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("q") ?? "";
  try {
    cleanSearchQuery(raw);
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Enter a product name.");
  }
  return Response.json(await lookupQuery(raw), { headers });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad("Send the item names as JSON.");
  }
  const queries = body && typeof body === "object" && !Array.isArray(body) ? (body as { queries?: unknown }).queries : undefined;
  if (!Array.isArray(queries) || queries.some((query) => typeof query !== "string")) return bad("Send the item names to check.");
  try {
    const quotes = await lookupQueries(queries);
    return Response.json({ label: CATALOGUE_LABEL, quotes }, { headers });
  } catch (error) {
    return bad(error instanceof Error ? error.message : "The catalogue check failed. No price was invented.");
  }
}
