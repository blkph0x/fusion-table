import { withDeadline } from "./abort-deadline.mjs";
import { SharedPriceCache } from "./price-provider-cache.ts";
import { colesNavigationUrl, parseColesBuildId, parseColesNavigationData, type ColesNavigationReader } from "./coles-catalogue.ts";

export interface ColesBuildObservation { version: 1; buildId: string; observedAt: string; sourceUrl: string }
export interface ColesBuildRequest { previousBuildId?: string }
export type ColesBuildProvider = (signal: AbortSignal, request?: ColesBuildRequest) => Promise<ColesBuildObservation>;
const BUILD_MAX_AGE = 24 * 60 * 60_000;
const BUILD_CACHE_MS = 30 * 60_000;
const RESOURCE_LIMIT = 3_000_000;
const fileWrites = new Map<string,Promise<void>>();
const unavailable = (message: string, providerStatus = "unavailable") => Object.assign(new Error(message), { providerStatus });

/** A deployment observation is not a price and cannot choose an arbitrary host. */
export function validateColesBuildObservation(value: unknown, now = Date.now(), allowExpiredCandidate = false): ColesBuildObservation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw unavailable("Coles catalogue metadata could not be verified.");
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || typeof row.buildId !== "string" || typeof row.observedAt !== "string" || typeof row.sourceUrl !== "string") throw unavailable("Coles catalogue metadata could not be verified.");
  colesNavigationUrl(row.buildId, "rice");
  const age = now - Date.parse(row.observedAt);
  if (!Number.isFinite(age) || age < -5 * 60_000 || !allowExpiredCandidate && age > BUILD_MAX_AGE) throw unavailable("Coles catalogue metadata needs an automatic refresh.");
  const source = new URL(row.sourceUrl);
  if (source.origin !== "https://www.coles.com.au" || source.username || source.password || source.hash || source.href.length > 1600) throw unavailable("Coles catalogue metadata did not come from its official site.");
  return { version: 1, buildId: row.buildId, observedAt: row.observedAt, sourceUrl: source.href };
}

async function readResource(url: string, fetchImpl: typeof fetch, signal: AbortSignal, json: boolean, limit = RESOURCE_LIMIT): Promise<string> {
  const response = await fetchImpl(url, { signal, redirect: "error", headers: { Accept: json ? "application/json" : "text/html", "Accept-Language": "en-AU,en;q=0.9", "User-Agent": "FusionTable shopping lookup" } });
  if (response.status === 404) { await response.body?.cancel().catch(() => undefined); throw Object.assign(unavailable("Coles' published catalogue version changed."), { staleColesBuild: true }); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    const retry = response.headers.get("retry-after") || "";
    const milliseconds = /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
    throw Object.assign(unavailable("Coles is temporarily not returning readable catalogue data.", [401,403].includes(response.status) ? "needs-browser" : "unavailable"), { retailerRefusal: [401,403,429].includes(response.status), retryAfterMs: Number.isFinite(milliseconds) && milliseconds >= 0 ? Math.min(milliseconds,24 * 60 * 60_000) : 120_000 });
  }
  if (json && !/^application\/(?:[a-z0-9.+-]*\+)?json\b/i.test(response.headers.get("content-type") || "")) { await response.body?.cancel().catch(() => undefined); throw Object.assign(unavailable("Coles returned a browser check instead of public catalogue data.", "needs-browser"),{retailerRefusal:true,retryAfterMs:120_000}); }
  if (Number(response.headers.get("content-length") || 0) > limit) { await response.body?.cancel().catch(() => undefined); throw unavailable("Coles catalogue data exceeded its reading limit."); }
  const reader = response.body?.getReader();
  if (!reader) throw unavailable("Coles catalogue data was empty.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > limit) throw unavailable("Coles catalogue data exceeded its reading limit."); chunks.push(part.value); }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function readColesBuildFile(filename: string, allowExpiredCandidate = false): Promise<ColesBuildObservation | null> {
  try {
    const fs = await import("node:fs/promises");
    const stat = await fs.stat(filename); if (!stat.isFile() || stat.size > 4096) return null;
    return validateColesBuildObservation(JSON.parse(await fs.readFile(filename, "utf8")),Date.now(),allowExpiredCandidate);
  } catch { return null; }
}

export async function saveColesBuildFile(filename: string, observation: ColesBuildObservation): Promise<void> {
  const value = validateColesBuildObservation(observation);
  const task=(fileWrites.get(filename) || Promise.resolve()).catch(() => undefined).then(async () => {
    const [fs, path, crypto] = await Promise.all([import("node:fs/promises"), import("node:path"), import("node:crypto")]);
    await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
    const temporary = filename + "." + crypto.randomUUID() + ".tmp";
    try { await fs.writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 }); await fs.rename(temporary, filename); }
    finally { await fs.unlink(temporary).catch(() => undefined); }
  });
  fileWrites.set(filename,task);
  try { await task; } finally { if (fileWrites.get(filename)===task) fileWrites.delete(filename); }
}

/** Operator-configured loopback browser metadata; no visitor-supplied URL. */
function metadataAddress(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/coles-build" || url.username || url.password || url.search || url.hash) throw new Error("Coles browser metadata must use its private loopback endpoint.");
  return url.href;
}

export function createColesBuildProvider(options: { fetchImpl?: typeof fetch; file?: string; metadataUrl?: string } = {}): ColesBuildProvider {
  const fetchImpl = options.fetchImpl || fetch;
  const metadataUrl = options.metadataUrl ? metadataAddress(options.metadataUrl) : null;
  return async (signal, request) => {
    const existing = options.file ? await readColesBuildFile(options.file,true) : null;
    if (existing && existing.buildId !== request?.previousBuildId) return existing;
    let observed: ColesBuildObservation;
    if (metadataUrl) {
      const response = await fetchImpl(metadataUrl, { signal, redirect: "error", headers: { Accept: "application/json" } });
      if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw unavailable("Coles' normal browser session could not refresh the catalogue version.", response.status === 403 ? "needs-browser" : "unavailable"); }
      const reader = response.body?.getReader(); if (!reader) throw unavailable("Coles browser metadata was empty.");
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 4096) throw unavailable("Coles browser metadata exceeded its reading limit."); chunks.push(part.value); } }
      finally { await reader.cancel().catch(() => undefined); }
      const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
      observed = validateColesBuildObservation(JSON.parse(new TextDecoder().decode(bytes)));
    } else {
      const sourceUrl = "https://www.coles.com.au/";
      const html = await readResource(sourceUrl, fetchImpl, signal, false);
      const buildId = parseColesBuildId(html);
      if (!buildId) throw unavailable("Coles' public page did not publish its catalogue version; an automatic browser refresh is needed.", "needs-browser");
      observed = { version: 1, buildId, observedAt: new Date().toISOString(), sourceUrl };
    }
    if (observed.buildId === request?.previousBuildId) throw unavailable("Coles' catalogue version is still refreshing. Prices will retry automatically.");
    if (options.file) await saveColesBuildFile(options.file, observed).catch(() => undefined);
    return observed;
  };
}

/** Public navigation data at a modest fixed rate, with shared deployment discovery. */
export function createColesNavigationReader(options: { fetchImpl?: typeof fetch; buildProvider?: ColesBuildProvider; file?: string; metadataUrl?: string; minimumIntervalMs?: number } = {}): ColesNavigationReader {
  const fetchImpl = options.fetchImpl || fetch;
  const buildProvider = options.buildProvider || createColesBuildProvider(options);
  const builds = new SharedPriceCache<ColesBuildObservation>(2, BUILD_CACHE_MS, 30_000);
  const interval = options.minimumIntervalMs ?? 1500;
  if (!Number.isInteger(interval) || interval < 0 || interval > 10_000) throw new Error("Use a bounded fixed Coles request interval.");
  let epoch = 0, rejectedBuild: string | undefined, nextStart = 0, pausedUntil = 0, lastValidated: ColesBuildObservation | undefined;
  let paceTimer: ReturnType<typeof setTimeout> | undefined;
  const waiting: {signal:AbortSignal;start:()=>void;abort:()=>void}[] = [];
  const drainPace = () => {
    if (paceTimer || !waiting.length) return;
    const delay = Math.max(0,nextStart-Date.now());
    if (delay) { paceTimer=setTimeout(() => {paceTimer=undefined;drainPace();},delay); return; }
    const entry=waiting.shift()!; entry.signal.removeEventListener("abort",entry.abort);
    if (entry.signal.aborted) { entry.abort(); drainPace(); return; }
    nextStart=Date.now()+interval; entry.start(); drainPace();
  };
  const pace = (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (waiting.length>=32) return Promise.reject(unavailable("Coles price scheduling is busy. Try again shortly."));
    return new Promise<void>((resolve,reject) => {
      const entry={signal,start:resolve,abort:() => {
        const index=waiting.indexOf(entry); if (index>=0) waiting.splice(index,1);
        signal.removeEventListener("abort",entry.abort);
        if (!waiting.length && paceTimer) {clearTimeout(paceTimer);paceTimer=undefined;}
        reject(signal.reason); drainPace();
      }};
      waiting.push(entry); signal.addEventListener("abort",entry.abort,{once:true});
      if (signal.aborted) entry.abort(); else drainPace();
    });
  };
  const resolveBuild = async (signal: AbortSignal, stale?: string) => {
    if (stale && rejectedBuild !== stale) { rejectedBuild = stale; epoch++; }
    const version = epoch;
    const load = () => builds.load(String(epoch), fetchImpl, async shared => {
      const value=validateColesBuildObservation(await buildProvider(shared,{previousBuildId:rejectedBuild}),Date.now(),true);
      if(value.buildId===rejectedBuild) throw unavailable("Coles' catalogue version is still refreshing. Prices will retry automatically.");
      return value;
    }, signal);
    const result = await load();
    let observed: ColesBuildObservation;
    try { observed = validateColesBuildObservation(result.value,Date.now(),true); }
    catch { if (epoch === version) epoch++; observed = validateColesBuildObservation((await load()).value,Date.now(),true); }
    if (lastValidated?.buildId===observed.buildId) observed=lastValidated;
    if (observed.buildId === rejectedBuild) throw unavailable("Coles' catalogue version is still refreshing. Prices will retry automatically.");
    return observed;
  };
  let persistence=Promise.resolve();
  return (query, signal) => withDeadline(24_000, [signal], async bounded => {
    if (pausedUntil > Date.now()) throw unavailable("Coles asked to pause catalogue requests. Automatic prices will retry after its waiting period.");
    let build = await resolveBuild(bounded);
    for (let attempt = 0; attempt < 2; attempt++) {
      await pace(bounded);
      if (pausedUntil > Date.now()) throw unavailable("Coles asked to pause catalogue requests. Automatic prices will retry after its waiting period.");
      try {
        const raw = await readResource(colesNavigationUrl(build.buildId, query), fetchImpl, bounded, true);
        let payload: unknown; try { payload = JSON.parse(raw); } catch { throw unavailable("Coles returned unreadable catalogue data."); }
        const products = parseColesNavigationData(payload);
        if (rejectedBuild===build.buildId) {
          if (attempt) throw unavailable("Coles' catalogue changed while this price was loading. Prices will retry automatically.");
          build=await resolveBuild(bounded,build.buildId); continue;
        }
        const observedAt=new Date().toISOString(), source=new URL(colesNavigationUrl(build.buildId,query)); source.search="";
        const renewed=validateColesBuildObservation({version:1,buildId:build.buildId,observedAt,sourceUrl:source.href});
        lastValidated=renewed;
        if (options.file) {
          persistence=persistence.catch(() => undefined).then(async () => { if (rejectedBuild!==renewed.buildId) await saveColesBuildFile(options.file!,renewed); });
          await persistence.catch(() => undefined);
        }
        if (rejectedBuild===build.buildId) {
          if (attempt) throw unavailable("Coles' catalogue changed while this price was loading. Prices will retry automatically.");
          build=await resolveBuild(bounded,build.buildId); continue;
        }
        bounded.throwIfAborted();
        return { products, fetchedAt: observedAt, at: Date.now(), collectionMethod: "http" as const };
      } catch (error) {
        if (error && typeof error === "object" && "retailerRefusal" in error && error.retailerRefusal) pausedUntil = Math.max(pausedUntil,Date.now() + ("retryAfterMs" in error && typeof error.retryAfterMs === "number" ? error.retryAfterMs : 120_000));
        if (attempt || !error || typeof error !== "object" || !("staleColesBuild" in error)) throw error;
        build = await resolveBuild(bounded, build.buildId);
      }
    }
    throw unavailable("Coles catalogue data could not be refreshed.");
  });
}
