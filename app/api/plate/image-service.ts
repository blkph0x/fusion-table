import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { localImageEndpoint, plateModelSize, plateModelSteps, plateModelTimeout, platePlaceholder, renderPlate, type PlatePicture } from "../../../lib/plate-picture.ts";
import { PLATE_IMAGE_VERSION } from "../../../lib/plate-version.ts";
import { decodeShare, recipeFromShare, type ShareSpec } from "../../../lib/share-recipe.ts";
import type { Recipe } from "../../../lib/recipe-types.ts";
import { PLATES } from "../../../lib/plates.ts";
import { encodeShare } from "../../../lib/share-recipe.ts";

const MAX_IMAGE_BYTES = 5_000_000;
const VERSION = `queue-v1:${PLATE_IMAGE_VERSION}`;
export type ImageStatus = "ready" | "queued" | "rendering" | "retry" | "unavailable" | "full";
type Job = { key: string; token: string; version?: string; status: "queued" | "rendering" | "retry" | "ready"; priority: number; hits?: number; created: number; touched: number; attempts: number; next: number; lease?: number; contentType?: PlatePicture["contentType"]; note?: string; bytes?: number };
type State = { v: 1; jobs: Job[]; budgetStart: number; attempts: number; warmedDay?: string };
export type ImageResult = { status: ImageStatus; key: string; retryAfterMs: number; note: string; picture?: PlatePicture };
type Options = { dir?: string; now?: () => number; endpoint?: () => string | null; render?: (recipe: Recipe, key: string) => Promise<PlatePicture | null>; still?: (recipe: Recipe) => Promise<PlatePicture>; maxPending?: number; maxEntries?: number; maxBytes?: number; hourlyAttempts?: number; automatic?: boolean; warm?: boolean };

/** Full cooking content, including ingredients beyond the old first16/truncated key. */
export function recipeImageKey(recipe: Recipe): string {
  return createHash("sha256").update(JSON.stringify({ version: VERSION, kind: recipe.kind ?? "classic", title: recipe.title, region: recipe.regionId, main: recipe.mainId ?? recipe.classicId, method: recipe.methodId, side: recipe.sideId, diet: recipe.diet, ingredients: recipe.ingredients.map(({ id, name, amount, unit }) => [id, name, amount, unit]), steps: recipe.steps.map(({ title, detail }) => [title, detail]) })).digest("hex");
}
export function recipeImagePrompt(recipe: Recipe): string {
  const ingredients = recipe.ingredients.filter((item) => !/^(?:water|salt|.*-oil|.*-stock)$/.test(item.id)).map((item) => `${item.name} (${item.amount} ${item.unit})`).join(", ");
  const components = "components" in recipe ? JSON.stringify(recipe.components) : "";
  return `Realistic close-up food photograph style, one finished home-cooked serving, natural window light, ceramic plate, sharp focus. A generated visualisation, not a photograph of an actually cooked dish. No text or people. Depict exactly ${recipe.title}. Region: ${recipe.regionId}. Cooking method: ${recipe.methodId ?? recipe.classicId}. Side: ${recipe.sideId ?? "as listed"}. Plate components: ${components}. Ingredients for ${recipe.servings} servings: ${ingredients}. Show only the listed meal. No raw meat, no extra proteins, no extra bread, rice or garnish not listed.`.slice(0, 6000);
}
function limit(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}
function empty(now: number): State { return { v: 1, jobs: [], budgetStart: now, attempts: 0 }; }
function writeAtomic(file: string, value: string | Uint8Array) {
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try { writeFileSync(temporary, value, { flag: "wx", mode: 0o600 }); renameSync(temporary, file); }
  finally { try { unlinkSync(temporary); } catch { /* Renamed or never created. */ } }
}
function eligibleStill(recipe: Recipe): boolean {
  return !recipe.generationInput && !/-sat-\d+/.test(recipe.id) && recipe.spiceHeat === "medium" && (recipe.kind !== "meal" || recipe.diet === "balanced");
}
async function boundedBody(response: Response, maximum: number): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > maximum || !response.body) throw new Error("Image response is too large or empty.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maximum) throw new Error("Image response exceeded its budget."); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; } return bytes;
}
export async function renderQueuedImage(recipe: Recipe, key: string, raw = process.env.FUSION_LOCAL_IMAGE_URL): Promise<PlatePicture | null> {
  const endpoint = localImageEndpoint(raw); if (!endpoint) return null;
  const target = endpoint.includes("sdapi") ? endpoint : `${endpoint}/sdapi/v1/txt2img`;
  try {
    const response = await fetch(target, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(plateModelTimeout()), headers: { "Content-Type": "application/json", Accept: "application/json, image/png, image/jpeg" }, body: JSON.stringify({ prompt: recipeImagePrompt(recipe), negative_prompt: "text, watermark, logo, cartoon, illustration, painting, plastic food, blurry, deformed, raw poultry, raw mince, people, hands, extra foods, wrong cuisine, generic buffet, stock photo collage", steps: plateModelSteps(), width: plateModelSize(), height: plateModelSize(), cfg_scale: 1, scheduler: "karras", seed: parseInt(key.slice(0, 8), 16) & 0x7fffffff }) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "", rawBytes = await boundedBody(response, 8_000_000);
    let bytes = rawBytes;
    if (!type.includes("image/")) { const data = JSON.parse(new TextDecoder().decode(rawBytes)) as { images?: unknown[]; image?: unknown }; const image = data.images?.[0] ?? data.image; if (typeof image !== "string" || image.length > 7_000_000) return null; bytes = Buffer.from(image.replace(/^data:image\/(png|jpeg);base64,/, ""), "base64"); }
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47, jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if ((!png && !jpeg) || bytes.length < 32 || bytes.length > MAX_IMAGE_BYTES) return null;
    return { bytes, contentType: png ? "image/png" : "image/jpeg", note: "Generated by the local image model from this recipe. An illustration, not a photograph of a cooked dish." };
  } catch { return null; }
}

/** Durable bounded host queue. Claims/leases are atomic across Node workers. */
export class RecipeImageService {
  private readonly dir: string; private readonly now: () => number; private readonly options: Options;
  private running = false; private timer?: ReturnType<typeof setTimeout>; private stopped = false;
  constructor(options: Options = {}) {
    this.options = options; this.dir = options.dir ?? join(process.env.FUSION_DATA_DIR || join(process.cwd(), "data"), "plate-images"); this.now = options.now ?? Date.now;
  }
  private endpoint() { return this.options.endpoint ? this.options.endpoint() : localImageEndpoint(process.env.FUSION_LOCAL_IMAGE_URL); }
  private mutate<T>(callback: (state: State) => T): T {
    mkdirSync(this.dir, { recursive: true }); const lock = join(this.dir, "queue.lock"); let fd: number;
    try { fd = openSync(lock, "wx", 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; if (this.now() - statSync(lock).mtimeMs > 10_000) { unlinkSync(lock); fd = openSync(lock, "wx", 0o600); } else throw new Error("The image queue is busy. Try again shortly."); }
    try {
      let state: State;
      try { if (statSync(join(this.dir, "queue.json")).size > 8_000_000) throw new Error("Image queue exceeds its budget."); state = JSON.parse(readFileSync(join(this.dir, "queue.json"), "utf8")); if (state.v !== 1 || !Array.isArray(state.jobs) || state.jobs.length > 2500 || state.jobs.some((job) => !/^[a-f0-9]{64}$/.test(job.key) || typeof job.token !== "string" || job.token.length > 7500)) throw new Error("Invalid image queue."); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; state = empty(this.now()); }
      // Old generator jobs must never block current pictures after a deployment.
      // Their completed images remain bounded cache entries, but are never reused under a new key.
      state.jobs = state.jobs.filter((job) => job.status === "ready" || job.version === VERSION);
      const result = callback(state); writeAtomic(join(this.dir, "queue.json"), JSON.stringify(state)); return result;
    } finally { closeSync(fd); unlinkSync(lock); }
  }
  private picture(job: Job): PlatePicture | undefined {
    try { const file = join(this.dir, `${job.key}.img`); if (statSync(file).size > MAX_IMAGE_BYTES) return; const bytes = new Uint8Array(readFileSync(file)); if (bytes.length !== job.bytes || !job.contentType) return; return { bytes, contentType: job.contentType, note: job.note ?? "Generated recipe illustration." }; } catch { return; }
  }
  private prune(state: State) {
    const maxEntries = this.options.maxEntries ?? 500, maxBytes = this.options.maxBytes ?? 128 * 1024 * 1024;
    let ready = state.jobs.filter((job) => job.status === "ready").sort((a, b) => a.touched - b.touched), bytes = ready.reduce((sum, job) => sum + (job.bytes ?? 0), 0);
    while (ready.length > maxEntries || bytes > maxBytes) { const job = ready.shift()!; try { unlinkSync(join(this.dir, `${job.key}.img`)); } catch { /* Missing cache entries are regenerated. */ } state.jobs = state.jobs.filter((item) => item.key !== job.key); bytes -= job.bytes ?? 0; }
    ready = [];
    state.jobs = state.jobs.filter((job) => job.status === "ready" || job.status === "rendering" || job.attempts < 3 || this.now() - job.touched < 86_400_000);
  }
  async request(token: string, recipe: Recipe, priority = 1): Promise<ImageResult> {
    const key = recipeImageKey(recipe), now = this.now();
    const existing = this.mutate((state) => { const job = state.jobs.find((item) => item.key === key); if (job) { job.touched = now; job.hits = Math.min(1_000_000, (job.hits ?? 0) + 1); if (priority > job.priority) job.priority = priority; } return job ? { ...job } : undefined; });
    if (existing?.status === "ready") { const picture = this.picture(existing); if (picture) return { status: "ready", key, retryAfterMs: 0, note: picture.note, picture }; }
    if (!existing && eligibleStill(recipe)) {
      const picture = await (this.options.still ?? ((item) => renderPlate(item, { model: false })))(recipe);
      if (!picture.placeholder) { this.mutate((state) => { if (state.jobs.some((job) => job.key === key)) return; writeAtomic(join(this.dir, `${key}.img`), picture.bytes); state.jobs.push({ key, token, status: "ready", priority, created: now, touched: now, attempts: 0, next: 0, contentType: picture.contentType, note: picture.note, bytes: picture.bytes.length }); this.prune(state); }); return { status: "ready", key, retryAfterMs: 0, note: picture.note, picture }; }
    }
    if (!this.endpoint()) return { status: "unavailable", key, retryAfterMs: 60_000, note: "The recipe is ready. Its image model is currently unavailable." };
    const result = this.mutate((state): ImageResult => {
      this.prune(state); let job = state.jobs.find((item) => item.key === key);
      if (job?.status === "ready") job.status = "queued";
      if (!job) { if (state.jobs.filter((item) => item.status !== "ready").length >= (this.options.maxPending ?? 64)) return { status: "full", key, retryAfterMs: 30_000, note: "Pictures are busy. The recipe is ready to use." }; job = { key, token, version: VERSION, priority, status: "queued", created: now, touched: now, attempts: 0, next: now }; state.jobs.push(job); }
      if (job.attempts >= 3 && job.next <= now) { job.attempts = 0; job.status = "queued"; }
      return { status: job.status, key, retryAfterMs: Math.max(2000, Math.min(60_000, job.next - now)), note: job.status === "retry" ? "The image model is busy. Its picture will be tried again." : "Preparing a recipe illustration in the background." };
    });
    if (this.options.automatic !== false) this.schedule(); return result;
  }
  private schedule(delay = 10) { if (this.timer || this.stopped) return; this.timer = setTimeout(() => { this.timer = undefined; void this.workOnce().catch(() => {}).finally(() => { if (!this.stopped) this.schedule(2000); }); }, delay); this.timer.unref?.(); }
  async workOnce(): Promise<boolean> {
    if (this.running || !this.endpoint()) return false; this.running = true;
    let claimed: Job | undefined;
    try {
      claimed = this.mutate((state) => {
        const now = this.now(); for (const job of state.jobs) if (job.status === "rendering" && (job.lease ?? 0) <= now) { job.status = "retry"; job.next = now; }
        if (state.jobs.some((job) => job.status === "rendering")) return;
        if (now - state.budgetStart >= 3_600_000) { state.budgetStart = now; state.attempts = 0; }
        if (state.attempts >= (this.options.hourlyAttempts ?? limit(process.env.FUSION_IMAGE_HOURLY_ATTEMPTS, 24, 240))) return;
        const job = state.jobs.filter((item) => item.status !== "ready" && item.status !== "rendering" && item.next <= now && item.attempts < 3).sort((a, b) => b.priority - a.priority || (b.hits ?? 0) - (a.hits ?? 0) || a.created - b.created)[0];
        if (!job) return; job.status = "rendering"; job.lease = now + 120_000; job.attempts++; state.attempts++; return { ...job };
      });
      if (!claimed) return false;
      let picture: PlatePicture | null = null;
      try { const recipe = recipeFromShare(decodeShare(claimed.token)); if (recipeImageKey(recipe) === claimed.key) picture = await (this.options.render ?? renderQueuedImage)(recipe, claimed.key); } catch { /* Invalid or stale jobs cannot produce a mismatched image. */ }
      const image = picture;
      this.mutate((state) => {
        const job = state.jobs.find((item) => item.key === claimed!.key); if (!job || job.lease !== claimed!.lease || job.status !== "rendering") return;
        if (image && !image.placeholder && image.bytes.length <= MAX_IMAGE_BYTES) { writeAtomic(join(this.dir, `${job.key}.img`), image.bytes); job.status = "ready"; job.bytes = image.bytes.length; job.contentType = image.contentType; job.note = image.note; job.next = 0; }
        else { job.status = "retry"; job.next = this.now() + (job.attempts >= 3 ? 3_600_000 : 30_000 * 2 ** (job.attempts - 1)); }
        delete job.lease; this.prune(state);
      }); return true;
    } finally { this.running = false; }
  }
  start() { if (this.options.automatic === false || this.stopped) return; this.schedule(); if (this.options.warm ?? process.env.FUSION_IMAGE_AUTOWARM === "1") void this.warmCurated().catch(() => {}); }
  async warmCurated(): Promise<number> {
    if (!this.endpoint()) return 0;
    const day = new Date(this.now()).toISOString().slice(0, 10), should = this.mutate((state) => { if (state.warmedDay === day) return false; state.warmedDay = day; return true; });
    if (!should) return 0; let queued = 0;
    for (let index = 0; index < Math.min(8, PLATES.length); index++) { const plate = PLATES[Math.floor(index * PLATES.length / 8)]; const spec: ShareSpec = { v: 1, kind: "meal", mainId: plate.mainId, methodId: plate.methodId, sideId: plate.sideId, regionId: plate.regionId, diet: "balanced", spiceHeat: "medium", servings: 4 }; try { await this.request(encodeShare(spec), recipeFromShare(spec), 0); queued++; } catch { /* One unavailable curated meal does not stop the queue. */ } }
    return queued;
  }
  stop() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }
}

const globalImages = globalThis as typeof globalThis & { fusionRecipeImages?: RecipeImageService };
export function imageService(): RecipeImageService { if (!globalImages.fusionRecipeImages) { globalImages.fusionRecipeImages = new RecipeImageService(); globalImages.fusionRecipeImages.start(); } return globalImages.fusionRecipeImages; }
export function pendingImage(recipe: Recipe): PlatePicture { return { bytes: platePlaceholder(recipe), contentType: "image/svg+xml", placeholder: true, note: "Recipe image pending or unavailable. Ingredients and cooking instructions are ready." }; }
