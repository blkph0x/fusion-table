import { buildBoard, submitVote, submitWhy } from "@/lib/community";
import { allowPost, ledgerFile, newId, withLedger } from "@/lib/ledger";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };
const file = () => ledgerFile();

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers });
}

export async function GET() {
  try {
    const board = await withLedger(file(), (ledger) => ({ result: buildBoard(ledger) }));
    return Response.json(board, { headers });
  } catch (error) {
    return bad(error instanceof Error ? error.message : "The cook's book could not be read. Nothing was deleted.", 503);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad("Send the cook's report as JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Send the cook's report as JSON.");
  const row = body as { action?: unknown; device?: unknown };
  const device = typeof row.device === "string" ? row.device : "anon";
  if (!allowPost(device)) return bad("Slow down a moment. Nothing was discarded.", 429);
  const now = new Date().toISOString();
  try {
    if (row.action === "vote") {
      const saved = await withLedger(file(), (ledger) => {
        const next = submitVote(ledger, row as never, now, newId("vote"));
        return next.error ? { result: next } : { ledger: next.ledger, result: next };
      });
      if (saved.error) return bad(saved.error);
      return Response.json({ askWhy: saved.askWhy, board: saved.board, label: saved.board.label }, { headers });
    }
    if (row.action === "why") {
      const saved = await withLedger(file(), (ledger) => {
        const next = submitWhy(ledger, row as never, now, newId("why"));
        return next.error ? { result: next } : { ledger: next.ledger, result: next };
      });
      if (saved.error) return bad(saved.error);
      return Response.json({ board: saved.board, label: saved.board.label }, { headers });
    }
  } catch (error) {
    return bad(error instanceof Error ? error.message : "The cook's book could not be saved. Nothing was deleted.", 503);
  }
  return bad("Say whether this is a vote or a note about what went wrong.");
}
