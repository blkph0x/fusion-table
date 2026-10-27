import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
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

export const MAX_LEDGER_BYTES = 8_000_000;
export const MAX_REPORT_BYTES = 65_536;

const READ_ERROR = "The cook's book could not be read. Nothing was deleted.";

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
  let parsed: unknown;
  try {
    const info = statSync(file);
    if (!info.isFile() || info.size > MAX_LEDGER_BYTES) throw new Error(READ_ERROR);
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyLedger();
    throw new Error(READ_ERROR);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(READ_ERROR);
  const row = parsed as Partial<Ledger>;
  for (const key of ["votes", "whys", "news", "prices", "shopPages"] as const) {
    if (row[key] !== undefined && !Array.isArray(row[key])) throw new Error(READ_ERROR);
  }
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
  if (Buffer.byteLength(raw, "utf8") > MAX_LEDGER_BYTES) throw new Error("The cook's book is full. Nothing already saved was deleted.");
  const tmp = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(tmp, raw, { mode: 0o600, flag: "wx" });
    renameSync(tmp, file);
  } catch {
    throw new Error("The cook's book could not be saved. Nothing already saved was deleted.");
  } finally {
    try { unlinkSync(tmp); } catch { /* Renamed successfully, or no temporary file was created. */ }
  }
}

export function validPostDevice(device: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(device);
}

/** A bounded per-process backstop, not authentication or a distributed quota. */
export class PostLimiter {
  private readonly hits = new Map<string, number[]>();
  private total: number[] = [];
  private readonly windowMs: number;
  private readonly maxDevices: number;
  private readonly maxPerDevice: number;
  private readonly maxTotal: number;
  private readonly now: () => number;

  constructor(options: { windowMs?: number; maxDevices?: number; maxPerDevice?: number; maxTotal?: number; now?: () => number } = {}) {
    this.windowMs = options.windowMs ?? 60_000;
    this.maxDevices = options.maxDevices ?? 1000;
    this.maxPerDevice = options.maxPerDevice ?? 30;
    this.maxTotal = options.maxTotal ?? 300;
    this.now = options.now ?? Date.now;
    if (![this.windowMs, this.maxDevices, this.maxPerDevice, this.maxTotal].every((value) => Number.isInteger(value) && value > 0)) {
      throw new Error("Post limits must be positive integers.");
    }
  }

  allow(device: string): boolean {
    if (!validPostDevice(device)) return false;
    device = device.toLowerCase();
    const now = this.now();
    for (const [key, times] of this.hits) {
      const recent = times.filter((at) => now - at < this.windowMs);
      if (recent.length) this.hits.set(key, recent);
      else this.hits.delete(key);
    }
    this.total = this.total.filter((at) => now - at < this.windowMs);
    const recent = this.hits.get(device) ?? [];
    if (recent.length >= this.maxPerDevice || this.total.length >= this.maxTotal) return false;
    // Do not evict active identities: churn must not reset an existing quota.
    if (!this.hits.has(device) && this.hits.size >= this.maxDevices) return false;
    this.hits.set(device, [...recent, now]);
    this.total.push(now);
    return true;
  }
}

const postLimiter = new PostLimiter();

export function allowPost(device: string): boolean {
  return postLimiter.allow(device);
}

export class ReportBodyError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ReportBodyError";
    this.status = status;
  }
}

/** Buffer at most a small report, even when Content-Length is absent or misleading. */
export async function readReportJson(request: Request, options: { maxBytes?: number; timeoutMs?: number } = {}): Promise<unknown> {
  const maxBytes = options.maxBytes ?? MAX_REPORT_BYTES;
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(maxBytes) || maxBytes <= 0 || !Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("Invalid report size or deadline.");
  const tooLarge = () => new ReportBodyError("That report is too large. Nothing was saved.", 413);
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes) {
    void request.body?.cancel().catch(() => undefined);
    throw tooLarge();
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ReportBodyError("Send a report as JSON.", 400);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ReportBodyError("The report took too long to arrive. Nothing was saved.", 408)), timeoutMs);
  });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw tooLarge();
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

const tails = new Map<string, Promise<void>>();

export async function withLedger<T>(file: string, change: (ledger: Ledger) => { ledger?: Ledger; result: T }): Promise<T> {
  const previous = tails.get(file) ?? Promise.resolve();
  const run = previous.then(async () => {
    const current = readLedger(file);
    const next = change(current);
    if (next.ledger) writeLedger(next.ledger, file);
    return next.result;
  });
  const tail = run.then(() => undefined, () => undefined);
  tails.set(file, tail);
  void tail.then(() => { if (tails.get(file) === tail) tails.delete(file); });
  return run;
}
