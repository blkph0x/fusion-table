/** Read the public HTTPS shop page a visitor explicitly asked to check. */
import { lookup } from "node:dns/promises";
import { matchPagePrices, priceLines, type PagePick } from "./price-memory.ts";
import { publicShopAddress, readPublicShopPage } from "./public-shop-reader.ts";

export interface ShopPageRead { url: string; picks: PagePick[]; lines: string[]; note: string }

export function assertPublicShopUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error("Enter the shop's public https page."); }
  if (url.protocol !== "https:") throw new Error("The shop page has to be https.");
  if (url.username || url.password) throw new Error("The shop page cannot include a username or password.");
  if (url.port && url.port !== "443") throw new Error("The shop page has to be ordinary https.");
  const host = url.hostname.toLowerCase();
  if (/(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(host)) throw new Error("That address is not a public shop page.");
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes("..")) throw new Error("Enter the shop's public website, not an IP address.");
  url.hash = "";
  return url;
}

export const isBlockedAddress = (address: string): boolean => !publicShopAddress(address);

export async function assertResolvesPublic(hostname: string, lookupImpl: typeof lookup = lookup): Promise<void> {
  let records: { address: string }[];
  try { records = await lookupImpl(hostname, { all: true, verbatim: true }); }
  catch { throw new Error("That shop website did not resolve. Open it on this device and type the price you see."); }
  if (!records.length || records.length > 32 || records.some(record => isBlockedAddress(record.address))) throw new Error("That address is not a public shop page.");
}

/** Explicit fetch injection is retained for existing deterministic adapters/tests.
 * Production uses the DNS-pinned HTTPS reader below; custom transports must provide
 * equivalent connection pinning and must not export browser sessions or cookies. */
async function readInjected(url:URL,fetchImpl:typeof fetch,lookupImpl:typeof lookup,signal:AbortSignal,hops=0):Promise<{url:string;html:string}> {
  await assertResolvesPublic(url.hostname,lookupImpl);signal.throwIfAborted();
  const response=await fetchImpl(url,{method:"GET",redirect:"manual",headers:{Accept:"text/html,text/plain;q=0.5","Accept-Encoding":"identity","User-Agent":"FusionTable public ingredient price reader"},signal});
  if([301,302,303,307,308].includes(response.status)){
    await response.body?.cancel();
    const location=response.headers.get("location"),next=location&&assertPublicShopUrl(new URL(location,url).toString());
    if(!next||hops>=2||next.hostname.replace(/^www\./,"")!==url.hostname.replace(/^www\./,""))throw new Error("The shop redirected outside its own public website.");
    return readInjected(next,fetchImpl,lookupImpl,signal,hops+1);
  }
  if(!response.ok){await response.body?.cancel();throw new Error("The shop page did not return its prices. Open it on this device and type the price you see.");}
  const type=response.headers.get("content-type")||"";
  if(type&&!/^(?:text\/html|text\/plain|application\/xhtml\+xml)(?:;|$)/i.test(type)){await response.body?.cancel();throw new Error("That page is not readable text. Open it on this device and type the price you see.");}
  if(Number(response.headers.get("content-length"))>500_000){await response.body?.cancel();throw new Error("The shop page exceeds the reading limit.");}
  const reader=response.body?.getReader();if(!reader)return {url:url.href,html:""};
  const chunks:Uint8Array[]=[];let length=0;
  try{
    for(;;){signal.throwIfAborted();const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>500_000)throw new Error("The shop page exceeds the reading limit.");chunks.push(next.value);}
  }finally{await reader.cancel().catch(()=>undefined);}
  return {url:url.href,html:Buffer.concat(chunks).toString("utf8")};
}

export async function readShopPage(rawUrl:string,items:readonly string[],deps?:{fetch?:typeof fetch;lookup?:typeof lookup}):Promise<ShopPageRead> {
  const url=assertPublicShopUrl(rawUrl),signal=AbortSignal.timeout(8000);
  let page:{url:string;html:string};
  try{
    page=deps?.fetch?await readInjected(url,deps.fetch,deps.lookup||lookup,signal):await readPublicShopPage(url.href,signal,{lookup:deps?.lookup});
  }catch(error){
    if(error instanceof Error&&/public shop page|https|resolve|username|reading limit|redirect|readable text|did not return/i.test(error.message))throw error;
    throw new Error("The page did not open from here. Open it on this device and type the price you see.");
  }
  const picks=matchPagePrices(page.html,items),lines=priceLines(page.html);
  const note=picks.length?"A public page named a price. It is not a shelf check. Correct it if the shop showed something else.":"No single price was readable for these items. Open the page on this device and type what you saw.";
  return {url:page.url,picks,lines,note};
}