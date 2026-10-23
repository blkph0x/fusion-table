import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { NewsItem, Vote, WhyNote } from "./community.ts";
import type { PriceMemory, ShopPage } from "./price-memory.ts";

export interface Ledger {
  votes: Vote[];
  whys: WhyNote[];
  news: NewsItem[];
  prices: PriceMemory[];
  shopPages: ShopPage[];
}

export function emptyLedger(): Ledger {
  return { votes: [], whys: [], news: [], prices: [], shopPages: [] };
}

export function ledgerFile(dir = process.env.FUSION_DATA_DIR || join(process.cwd(), "data")): string {
  return join(dir, "community-ledger.json");
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

export function readLedger(file = ledgerFile()): Ledger {
  if (!existsSync(file)) return emptyLedger();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error("The cook's book could not be read. Nothing was deleted.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("The cook's book could not be read. Nothing was deleted.");
  const row = parsed as Partial<Ledger>;
  return {
    votes: Array.isArray(row.votes) ? row.votes as Vote[] : [],
    whys: Array.isArray(row.whys) ? row.whys as WhyNote[] : [],
    news: Array.isArray(row.news) ? row.news as NewsItem[] : [],
    prices: Array.isArray(row.prices) ? row.prices as PriceMemory[] : [],
    shopPages: Array.isArray(row.shopPages) ? row.shopPages as ShopPage[] : [],
  };
}

export function writeLedger(ledger: Ledger, file = ledgerFile()): void {
  const raw = JSON.stringify(ledger);
  if (raw.length > 8_000_000) throw new Error("The cook's book is full. Nothing already saved was deleted.");
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, raw);
  renameSync(tmp, file);
}

const hits = new Map<string, number[]>();

export function allowPost(device: string): boolean {
  const now = Date.now();
  const recent = (hits.get(device) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= 30) {
    hits.set(device, recent);
    return false;
  }
  recent.push(now);
  hits.set(device, recent);
  return true;
}

const tails = new Map<string, Promise<void>>();

export async function withLedger<T>(file: string, change: (ledger: Ledger) => { ledger?: Ledger; result: T }): Promise<T> {
  const previous = tails.get(file) ?? Promise.resolve();
  const run = previous.then(async () => {
    const current = readLedger(file);
    const next = change(current);
    if (next.ledger && next.ledger !== current) writeLedger(next.ledger, file);
    return next.result;
  });
  tails.set(file, run.then(() => undefined, () => undefined));
  return run;
}
