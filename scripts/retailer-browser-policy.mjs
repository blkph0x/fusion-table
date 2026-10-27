import { isIP } from "node:net";

export const PAGE_LIMIT = 3_000_000;
export const JOB_DEADLINE_MS = 20_000;
export const CACHE_TTL_MS = 10 * 60_000;
export const CHALLENGE_BACKOFF_MS = 2 * 60_000;
const RETAILER_HOSTS = new Map([
  ["coles.com.au", "coles"], ["aldi.com.au", "aldi"],
  ["igashop.com.au", "iga"], ["iga.com.au", "iga"],
  ["woolworths.com.au", "woolworths"],
]);

/** Validate before Chromium sees a URL. Hashes never change the price request. */
export function publicHttpsUrl(value) {
  if (typeof value !== "string" || value.length > 1600) throw new Error("Use a public HTTPS retailer URL.");
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443"
    || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(host) || host.includes("..")
    || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/.test(host)
    || isIP(host) || host.endsWith(".")) throw new Error("Use a public HTTPS retailer URL.");
  url.hash = "";
  return url;
}

export function retailerUrl(value) {
  const url = publicHttpsUrl(value);
  const retailer = RETAILER_HOSTS.get(url.hostname.replace(/^www\./, ""));
  if (!retailer) throw new Error("Browser checks are limited to the official Australian Coles, ALDI, IGA and Woolworths websites.");
  return { url: url.toString(), retailer };
}

export function renderTarget(value,source) {
  if (source != null && source !== "local-shop") throw new Error("Unknown browser price source.");
  if (source === "local-shop") {
    const url = publicHttpsUrl(value);
    return {url:url.toString(),retailer:`local:${url.hostname.replace(/^www\./,"")}`};
  }
  return retailerUrl(value);
}

export function navigationUrl(value,initial,source) {
  const target = renderTarget(value,source), original = renderTarget(initial,source);
  if (target.retailer !== original.retailer) throw new Error("The shop redirected outside its own public website.");
  return target.url;
}

/** Kept equivalent to lib/public-shop-reader.ts, for plain-Node service startup. */
export function publicAddress(address) {
  if (typeof address !== "string" || !address || address.includes("%")) return false;
  if (isIP(address) === 4) {
    const [a,b,c] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127
      || a === 192 && b === 0 || a === 192 && b === 88 && c === 99 || a === 198 && [18,19].includes(b)
      || a === 198 && b === 51 && c === 100 || a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (isIP(address) !== 6) return false;
  const canonical = new URL(`https://[${address}]/`).hostname.slice(1,-1).toLowerCase();
  const first = Number.parseInt(canonical.split(":")[0],16);
  const second = Number.parseInt(canonical.split(":")[1] || "0",16);
  if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff || first === 0x2002 || first === 0x3ffe) return false;
  if (first === 0x2001 && (second < 0x200 || second === 0xdb8) || first === 0x3fff && second < 0x1000) return false;
  return true;
}

/** Resolve all answers, reject mixed private/public DNS, then connect to this literal IP. */
export async function pinnedPublicTarget(authority, resolve) {
  if (typeof authority !== "string" || !/^[a-z0-9.-]+:443$/i.test(authority)) throw new Error("Only public HTTPS connections are permitted.");
  const url = publicHttpsUrl(`https://${authority}/`);
  const addresses = await resolve(url.hostname, { all: true, verbatim: true });
  if (!Array.isArray(addresses) || !addresses.length || addresses.length > 32
    || addresses.some(row => ![4,6].includes(row.family) || isIP(row.address) !== row.family || !publicAddress(row.address))) throw new Error("The destination did not resolve entirely to public addresses.");
  const selected = addresses.find(row => row.family === 4) || addresses[0];
  return { host: selected.address, family: selected.family, port: 443 };
}

/** Inspect visible text only; no clicks, CAPTCHA solving or repeated refresh loop. */
export function pageAction({ text = "", title = "", status = 200 }) {
  const visible = `${title}\n${text}`.slice(0, 80_000);
  if ([401,403,429].includes(status) || /\b(?:captcha|verify (?:that )?you(?:'re| are)? (?:a )?human|human verification|prove you are|access denied|unusual traffic|checking your browser|security challenge|robot check|pardon our interruption|press (?:and|&) hold)\b/i.test(visible)) return "needs-browser";
  if (/\b(?:refresh|reload)\b/i.test(visible) && /\b(?:javascript|cookies?)\b/i.test(visible)) return "refresh-once";
  if (/\b(?:enable (?:javascript|cookies)|javascript (?:is )?(?:disabled|required)|sign in to (?:view|see|shop)|log in to (?:view|see|shop))\b/i.test(visible)) return "needs-browser";
  return "ready";
}

export function readablePriceContent({text = "",html = ""}) {
  return /(?:\$|\bAUD\s*)\s*\d/.test(text) || /\b(?:no|0) (?:products|results)|couldn.t find any/i.test(text)
    || /"@type"\s*:\s*"Product"/i.test(html) && /"price"\s*:/i.test(html);
}

/** A local homepage may be needed to discover its catalogue before any prices exist. */
export function readableLocalDiscovery({text = "",html = ""}) {
  return text.replace(/\s+/g," ").trim().length >= 25 && /<(?:a|main|article|section|h1)\b/i.test(html);
}

export function colesEmptyBrowserGate({url,text = "",html = ""}) {
  return retailerUrl(url).retailer === "coles" && text.trim().length < 100
    && [...html.matchAll(/<meta\b[^>]*>/gi)].some(match => /\bname=["']robots["']/i.test(match[0]) && /\bcontent=["'][^"']*noindex/i.test(match[0]));
}

const STREET_TYPES = {st:"street",street:"street",rd:"road",road:"road",ave:"avenue",av:"avenue",avenue:"avenue",dr:"drive",drive:"drive",ln:"lane",lane:"lane",ct:"court",court:"court",pde:"parade",parade:"parade",hwy:"highway",highway:"highway",cres:"crescent",crescent:"crescent",tce:"terrace",terrace:"terrace",pl:"place",place:"place",blvd:"boulevard",boulevard:"boulevard",way:"way"};
export function addressProof(value) {
  const text = String(value || "").normalize("NFKC").toLowerCase().replace(/[.,]/g," ").replace(/\s+/g," ").trim();
  const postcode = text.match(/\b\d{4}\b(?![\s\S]*\b\d{4}\b)/)?.[0];
  const street = /(?:^|\s)(\d+[a-z]?(?:-\d+[a-z]?)?)\s+([a-z][a-z' -]{0,90}?)\s+(street|st|road|rd|avenue|ave|av|drive|dr|lane|ln|court|ct|parade|pde|highway|hwy|crescent|cres|terrace|tce|place|pl|boulevard|blvd|way)\b/.exec(text);
  return postcode && street ? {number:street[1],street:street[2].replace(/[' -]+/g," ").trim(),type:STREET_TYPES[street[3]],postcode} : null;
}
export function sameStoreAddress(expected,actual) {
  const a = addressProof(expected), b = addressProof(actual);
  return !!a && !!b && a.number === b.number && a.street === b.street && a.type === b.type && a.postcode === b.postcode;
}

export function verifiedStoreKey(store) {
  // A visitor's shopping area is not the physical branch identity. Include it
  // only when a complete independent address is unavailable for store proof.
  return JSON.stringify([store.id,store.name,store.address || "",store.lat ?? null,store.lon ?? null,addressProof(store.address) ? null : store.area]);
}

/** Anonymous contexts enter this pool only after the factory proves a branch. */
export function createVerifiedStoreSessions({maxSessions = 4,ttlMs = 5 * 60_000,now = Date.now} = {}) {
  const entries = new Map();
  let closed = false;
  const dispose = entry => {
    entry.invalid = true;
    if (entries.get(entry.key) === entry) entries.delete(entry.key);
    entry.controller.abort(new DOMException("Store session closed.","AbortError"));
    return entry.value?.close().catch(() => undefined);
  };
  return {
    get size() { return entries.size; },
    async acquire(key,create,signal) {
      signal?.throwIfAborted();
      if (closed) throw new Error("Store browser sessions are stopping.");
      let entry = entries.get(key);
      const expired = [...entries.values()].filter(row => !row.leases && !row.waiters.size && row.ready && now()-row.at >= ttlMs);
      const retired = expired.map(dispose);
      if (entry?.invalid || entry?.signal.aborted) entry = undefined;
      if (!entry) {
        if (entries.size >= maxSessions) {
          const idle = [...entries.values()].filter(row => row.ready && !row.leases && !row.waiters.size).sort((a,b) => a.at-b.at)[0];
          if (!idle) throw new Error("Nearby-store browser sessions are busy. Try again shortly.");
          retired.push(dispose(idle));
        }
        const controller = new AbortController();
        entry = {key,controller,signal:controller.signal,waiters:new Set(),leases:0,ready:false,invalid:false,at:now(),value:null,task:null};
        const created = entry;
        entries.set(key,entry);
        entry.task = (async () => {
          await Promise.all(retired);
          controller.signal.throwIfAborted();
          const value = await create(controller.signal);
          if (created.invalid || controller.signal.aborted || closed) { await value.close(); controller.signal.throwIfAborted(); throw new Error("Store session no longer needed."); }
          created.value = value; created.ready = true; created.at = now();
          return value;
        })().catch(error => { void dispose(created); throw error; });
      }
      const waiting = entry, token = Symbol("store session reader");
      waiting.waiters.add(token);
      return new Promise((resolve,reject) => {
        const detach = () => {
          signal?.removeEventListener("abort",abort); waiting.waiters.delete(token);
          if (!waiting.ready && !waiting.waiters.size && !waiting.leases) void dispose(waiting);
        };
        const abort = () => { detach(); reject(signal.reason); };
        signal?.addEventListener("abort",abort,{once:true});
        if (signal?.aborted) { abort(); return; }
        waiting.task.then(value => {
          if (signal?.aborted) return;
          waiting.leases++; detach();
          let released = false;
          resolve({value,release() {
            if (released) return; released = true;
            waiting.leases--; waiting.at = now();
            if (waiting.invalid && !waiting.leases) void dispose(waiting);
          },invalidate() {
            waiting.invalid = true;
            if (entries.get(key) === waiting) entries.delete(key);
            if (!waiting.leases) void dispose(waiting);
          }});
        },error => { detach(); reject(error); });
      });
    },
    async clear() { await Promise.all([...entries.values()].map(dispose)); },
    async close() { closed = true; await Promise.all([...entries.values()].map(dispose)); },
  };
}

export function storeContext(value) {
  if (value == null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Use a verified nearby IGA store.");
  const clean = (field,max,required = true) => {
    if (value[field] == null && !required) return undefined;
    if (typeof value[field] !== "string" || !value[field].trim() || value[field].length > max || /[\u0000-\u001f<>]/.test(value[field])) throw new Error("Use a verified nearby IGA store.");
    return value[field].trim();
  };
  const output = {id:clean("id",140),name:clean("name",180),area:clean("area",240)};
  const address = clean("address",300,false);
  if (address) output.address = address;
  if (value.lat != null || value.lon != null) {
    if (!Number.isFinite(value.lat) || !Number.isFinite(value.lon) || Math.abs(value.lat) > 90 || Math.abs(value.lon) > 180) throw new Error("Use valid store coordinates.");
    output.lat = value.lat; output.lon = value.lon;
  }
  return output;
}

export function requestKey(url,store,source) {
  return JSON.stringify([url,store || null,source || null]);
}

/** Small bounded scheduler; queued work also observes its caller's deadline. */
export function createScheduler({ concurrency = 2, maxQueue = 16 } = {}) {
  let active = 0;
  const waiting = [];
  const drain = () => {
    while (active < concurrency && waiting.length) {
      const job = waiting.shift();
      job.signal?.removeEventListener("abort",job.abort);
      if (job.signal?.aborted) { job.reject(job.signal.reason); continue; }
      active++;
      Promise.resolve().then(job.run).then(job.resolve,job.reject).finally(() => { active--; drain(); });
    }
  };
  return {
    get active() { return active; }, get queued() { return waiting.length; },
    run(run, signal) {
      signal?.throwIfAborted();
      if (active >= concurrency && waiting.length >= maxQueue) return Promise.reject(Object.assign(new Error("Price checking is busy. Try again shortly."),{ status:429 }));
      return new Promise((resolve,reject) => {
        const job = { run,signal,resolve,reject,abort:() => {
          const index = waiting.indexOf(job);
          if (index >= 0) { waiting.splice(index,1); reject(signal.reason); }
        } };
        signal?.addEventListener("abort",job.abort,{once:true});
        waiting.push(job); drain();
      });
    },
  };
}
