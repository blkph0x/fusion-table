/** Enrich only server-discovered OSM identities; never infer a domain from a name. */
import { safeWebsite, shopKind, type Shop } from "./locations.ts";
import { SharedPriceCache } from "./price-provider-cache.ts";
import { publicShopUrl } from "./public-shop-reader.ts";

export interface ShopWebsiteDependencies { fetch?: typeof fetch; appOrigin?: string }
type Tags={id:string;name:string;kind:Shop["kind"];lat?:number;lon?:number;website:string|null;address:string|null};
const cache=new SharedPriceCache<Tags[]>(96,6*60*60_000,60_000);
const record=(value:unknown):Record<string,unknown>|null=>!!value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
const clean=(value:unknown,max=250)=>typeof value==="string"?value.replace(/[\u0000-\u001f]/g," ").trim().slice(0,max):"";
const nameKey=(value:string)=>value.normalize("NFKC").toLocaleLowerCase("en-AU").replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();
const osmId=(id:string)=>/^(node|way|relation)\/[1-9]\d{0,15}$/.test(id)&&Number.isSafeInteger(Number(id.split("/")[1]));
const relevant=(shop:Shop)=>["produce","butcher","market"].includes(shop.kind)||shop.kind==="grocery"&&/fruit|produce|vegetable/i.test(shop.name);
const websiteOf=(value:unknown):string|null=>{const candidate=safeWebsite(value);if(!candidate)return null;try{const url=new URL(candidate);if(url.protocol==="http:"){if(url.port&&url.port!=="80")return null;url.protocol="https:";url.port="";}return publicShopUrl(url.href).href;}catch{return null;}};
let active=false;
const waiting:(()=>void)[]=[];
async function slot(signal:AbortSignal):Promise<()=>void>{
  signal.throwIfAborted();
  if(active){
    if(waiting.length>=6)throw new Error("Shop website discovery is busy. Existing shop links remain available.");
    await new Promise<void>((resolve,reject)=>{const abort=()=>{const i=waiting.indexOf(start);if(i>=0)waiting.splice(i,1);reject(signal.reason);};const start=()=>{signal.removeEventListener("abort",abort);resolve();};signal.addEventListener("abort",abort,{once:true});waiting.push(start);});
  }else active=true;
  return ()=>{const next=waiting.shift();if(next)next();else active=false;};
}
async function read(response:Response,signal:AbortSignal):Promise<unknown>{
  if(!response.ok||!/application\/json/i.test(response.headers.get("content-type")||"")){await response.body?.cancel();throw new Error("The shop website directory is temporarily unavailable.");}
  if(Number(response.headers.get("content-length"))>600_000){await response.body?.cancel();throw new Error("Shop website metadata exceeded its reading limit.");}
  const reader=response.body?.getReader();if(!reader)throw new Error("The shop website directory returned no data.");
  const chunks:Uint8Array[]=[];let bytes=0;
  try{for(;;){signal.throwIfAborted();const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>600_000)throw new Error("Shop website metadata exceeded its reading limit.");chunks.push(next.value);}}finally{await reader.cancel().catch(()=>undefined);}
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** One small official OSM read per element type (at most three), max 12 known IDs.
 * Caller must use its trusted map results, not request-supplied shop objects. */
export async function enrichShopWebsites(shops:readonly Shop[],deps:ShopWebsiteDependencies={},signal?:AbortSignal):Promise<Shop[]> {
  signal?.throwIfAborted();
  const selected=shops.filter(shop=>!shop.website&&relevant(shop)&&osmId(shop.id)).slice(0,12);
  if(!selected.length)return [...shops];
  const fetcher=deps.fetch||fetch,ids=[...new Set(selected.map(shop=>shop.id))].sort();
  const loaded=await cache.load(JSON.stringify(ids),fetcher,async shared=>{
    const combined=AbortSignal.any([shared,AbortSignal.timeout(6500)]),release=await slot(combined),output:Tags[]=[];
    try{
      for(const type of ["node","way","relation"]){
        const numbers=ids.filter(id=>id.startsWith(type+"/")).map(id=>id.split("/")[1]);if(!numbers.length)continue;
        const url=new URL(`https://api.openstreetmap.org/api/0.6/${type}s.json`);url.searchParams.set(`${type}s`,numbers.join(","));
        const response=await fetcher(url,{method:"GET",redirect:"manual",signal:combined,headers:{Accept:"application/json","User-Agent":"FusionTable/1.0 (nearby food-shop website metadata)",...(deps.appOrigin?{Referer:new URL(deps.appOrigin).origin+"/"}:{})}});
        const body=record(await read(response,combined));if(!body||!Array.isArray(body.elements)||body.elements.length>100)throw new Error("The shop website directory returned unexpected data.");
        for(const raw of body.elements){
          const row=record(raw),tags=record(row?.tags);if(!row||!tags||row.type!==type||!Number.isSafeInteger(row.id))continue;
          const id=`${row.type}/${row.id}`,kind=shopKind(tags);if(!ids.includes(id)||!kind)continue;
          const lat=typeof row.lat==="number"?row.lat:undefined,lon=typeof row.lon==="number"?row.lon:undefined;
          const address=[[clean(tags["addr:housenumber"],30),clean(tags["addr:street"],120)].filter(Boolean).join(" "),clean(tags["addr:suburb"],100),clean(tags["addr:city"],100),clean(tags["addr:postcode"],20)].filter(Boolean).join(", ")||null;
          output.push({id,kind,name:clean(tags.name),lat,lon,website:websiteOf(tags["contact:website"]||tags.website),address});
        }
      }
      return output;
    }finally{release();}
  },signal);
  const details=new Map(loaded.value.map(row=>[row.id,row]));
  return shops.map(shop=>{
    if(shop.website||!selected.some(row=>row.id===shop.id))return shop;
    const detail=details.get(shop.id);if(!detail||detail.kind!==shop.kind||!detail.name||nameKey(detail.name)!==nameKey(shop.name))return shop;
    if(detail.lat!==undefined||detail.lon!==undefined){if(!Number.isFinite(detail.lat)||!Number.isFinite(detail.lon)||Math.abs(detail.lat!-shop.lat)>0.002||Math.abs(detail.lon!-shop.lon)>0.002)return shop;}
    return {...shop,website:detail.website,address:shop.address||detail.address};
  });
}
