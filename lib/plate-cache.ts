import type { PlatePicture } from "./plate-picture.ts";

export interface PlateCacheResult {
  picture: PlatePicture;
  maxAgeSeconds: number;
  source: "rendered" | "cached" | "fallback";
}

type Entry = { picture: PlatePicture; expiresAt: number };

export function plateRenderConcurrency(value = process.env.FUSION_LOCAL_IMAGE_CONCURRENCY): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? Math.min(4, parsed) : 2;
}

/** Bounded per-process images and work. Overflow gets a labelled placeholder, never a GPU queue. */
export class PlateCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<PlateCacheResult>>();
  private bytes = 0;
  private rendering = 0;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly maxConcurrent: number;
  private readonly fallbackMs: number;
  private readonly now: () => number;

  constructor(options: { maxEntries?: number; maxBytes?: number; maxConcurrent?: number; fallbackMs?: number; now?: () => number } = {}) {
    this.maxEntries = options.maxEntries ?? 40;
    this.maxBytes = options.maxBytes ?? 24 * 1024 * 1024;
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.fallbackMs = options.fallbackMs ?? 5000;
    this.now = options.now ?? Date.now;
    if (![this.maxEntries, this.maxBytes, this.maxConcurrent, this.fallbackMs].every((value) => Number.isInteger(value) && value > 0)) {
      throw new Error("Image cache limits must be positive integers.");
    }
  }

  get size(): number { return this.entries.size; }
  get byteSize(): number { return this.bytes; }

  async get(key: string, render: (model: boolean) => Promise<PlatePicture>): Promise<PlateCacheResult> {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.now()) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return { picture: cached.picture, maxAgeSeconds: Math.max(1, Math.ceil((cached.expiresAt - this.now()) / 1000)), source: "cached" };
    }
    if (cached) this.remove(key);
    const pending = this.pending.get(key);
    if (pending) return pending;

    const model = this.rendering < this.maxConcurrent;
    if (model) this.rendering += 1;
    const work = Promise.resolve().then(async () => {
      const picture = await render(model);
      const temporary = !model || picture.temporary === true;
      const maxAgeSeconds = temporary ? Math.max(1, Math.ceil(this.fallbackMs / 1000)) : 86400;
      // Copy the view so a small byteLength cannot retain an oversized backing buffer.
      if (picture.bytes.byteLength <= this.maxBytes) {
        this.store(key, { picture: { ...picture, bytes: picture.bytes.slice() }, expiresAt: this.now() + maxAgeSeconds * 1000 });
      }
      return { picture, maxAgeSeconds, source: temporary ? "fallback" as const : "rendered" as const };
    }).finally(() => {
      if (model) this.rendering -= 1;
      this.pending.delete(key);
    });
    this.pending.set(key, work);
    return work;
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.picture.bytes.byteLength;
    this.entries.delete(key);
  }

  private store(key: string, entry: Entry) {
    this.remove(key);
    for (const [other, value] of this.entries) if (value.expiresAt <= this.now()) this.remove(other);
    this.entries.set(key, entry);
    this.bytes += entry.picture.bytes.byteLength;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
  }
}
