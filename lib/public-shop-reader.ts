/** Public HTTPS reads with DNS addresses pinned for the entire TLS connection. */
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { request } from "node:https";
import { withDeadline } from "./abort-deadline.mjs";

export interface PublicShopPage { html: string; url: string; status?: number }
export type ShopPageReader = (url: string, signal?: AbortSignal) => Promise<PublicShopPage>;
export const MAX_SHOP_PAGE_BYTES = 3_000_000;

export function publicShopUrl(value: string): URL {
  if (typeof value !== "string" || value.length > 1000) throw new Error("Use the shop's public HTTPS website.");
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443"
    || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(host) || host.includes("..")
    || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/.test(host)
    || isIP(host) || host.startsWith("[") || host.endsWith(".")) throw new Error("Use the shop's public HTTPS website.");
  url.hash = "";
  return url;
}

export function publicShopAddress(address: string): boolean {
  if (!address || address.includes("%")) return false;
  if (isIP(address) === 4) {
    const [a,b,c] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127
      || a === 192 && b === 0 || a === 192 && b === 88 && c === 99 || a === 198 && [18,19].includes(b)
      || a === 198 && b === 51 && c === 100 || a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (isIP(address) !== 6) return false;
  // Public global-unicast only: this also rejects mapped IPv4 (including hex
  // forms), local, multicast, transition and unspecified address families.
  const canonical = new URL(`https://[${address}]/`).hostname.slice(1,-1).toLowerCase();
  const first = Number.parseInt(canonical.split(":")[0],16);
  if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff || first === 0x2002 || first === 0x3ffe) return false;
  if (first === 0x2001 && (Number.parseInt(canonical.split(":")[1] || "0",16) < 0x200 || /^2001:db8:/.test(canonical))) return false;
  if (first === 0x3fff && Number.parseInt(canonical.split(":")[1] || "0",16) < 0x1000) return false;
  return true;
}

export async function shopConnectionTarget(value: string, resolve: typeof lookup = lookup, signal?: AbortSignal) {
  const url = publicShopUrl(value);
  signal?.throwIfAborted();
  const addresses = await new Promise<LookupAddress[]>((accept,reject) => {
    const abort=()=>reject(signal?.reason || new DOMException("Price lookup cancelled.","AbortError"));
    signal?.addEventListener("abort",abort,{once:true});
    resolve(url.hostname,{all:true,verbatim:true}).then(accept,reject).finally(()=>signal?.removeEventListener("abort",abort));
  });
  if (!addresses.length || addresses.length > 32 || addresses.some(row => !publicShopAddress(row.address) || isIP(row.address)!==row.family)) throw new Error("The shop website did not resolve entirely to public addresses.");
  const chosen = addresses.find(row => row.family === 4) || addresses[0];
  const pinnedLookup: LookupFunction = (_host, options, callback) => {
    if (options.all) callback(null,[chosen]); else callback(null,chosen.address,chosen.family);
  };
  return { url, addresses, pinnedLookup };
}

/** No cookies, browser identity spoofing, credentials or automatic challenge solving. */
export async function readPublicShopPage(value: string, signal?: AbortSignal, deps: { lookup?: typeof lookup; request?: typeof request } = {}, hops = 0): Promise<PublicShopPage> {
  signal?.throwIfAborted();
  return withDeadline(6500,signal?[signal]:[],async combined=>{
  const target = await shopConnectionTarget(value,deps.lookup,combined);
  const response = await new Promise<{ status: number; location: string; html: string }>((resolve,reject) => {
    const req = (deps.request || request)(target.url, { method: "GET", lookup: target.pinnedLookup, agent: false, maxHeaderSize: 24_000, signal: combined,
      headers: { Accept: "text/html,application/xhtml+xml;q=0.9", "Accept-Encoding": "identity", "User-Agent": "FusionTable public ingredient price reader" } }, res => {
      const status = res.statusCode || 0;
      if ([301,302,303,307,308].includes(status)) { res.destroy(); resolve({status,location:res.headers.location || "",html:""}); return; }
      if (status < 200 || status >= 300) { res.destroy(); reject(new Error([401,403,429].includes(status)?"The shop website requires a browser check. Open its website to check prices.":"The shop website is unavailable. Open its website to check prices.")); return; }
      const type = String(res.headers["content-type"] || "");
      if (!/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(type)) { res.destroy(); reject(new Error("The shop did not return an HTML product page.")); return; }
      if (Number(res.headers["content-length"]) > MAX_SHOP_PAGE_BYTES || res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") { res.destroy(); reject(new Error("The shop response could not be read within its limits.")); return; }
      const chunks: Buffer[]=[];let bytes=0;
      res.on("data",(chunk: Buffer) => { bytes+=chunk.byteLength; if (bytes > MAX_SHOP_PAGE_BYTES) res.destroy(new Error("The shop page exceeds the reading limit.")); else chunks.push(chunk); });
      res.on("error",reject);res.on("end",()=>resolve({status,location:"",html:Buffer.concat(chunks).toString("utf8")}));
    });
    req.on("error",reject);req.end();
  });
  if (response.location) {
    const next=publicShopUrl(new URL(response.location,target.url).toString());
    if (hops >= 2 || next.hostname.replace(/^www\./,"") !== target.url.hostname.replace(/^www\./,"")) throw new Error("The shop redirected outside its own public website.");
    return readPublicShopPage(next.toString(),combined,deps,hops+1);
  }
  return {html:response.html,url:target.url.toString(),status:response.status};
  });
}
