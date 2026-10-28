import type { PriceQuote } from "./catalogue.ts";
import type { Shop } from "./locations.ts";
import { canonicalizeProductText, isNonFoodCatalogueProduct, matchProducts, audToCents, type CatalogueProduct } from "./product-match.ts";
import { inferShoppingCategory, type ShoppingLine } from "./shopping.ts";
import { publicShopUrl, readPublicShopPage, type PublicShopPage, type ShopPageReader, MAX_SHOP_PAGE_BYTES } from "./public-shop-reader.ts";
import { SharedPriceCache } from "./price-provider-cache.ts";
import { createDeadline, withDeadline } from "./abort-deadline.mjs";

export interface LocalShopContext { area: string; location: { lat: number; lon: number }; radiusKm: number; country?: string }
export interface LocalShopQuote extends Omit<PriceQuote,"source"> {
  source: "local-shop-website";
  scope: "shop-website";
  shop: { id: string; name: string; website: string; area: string; lat: number; lon: number };
}
export interface LocalShopPriceDependencies { read?: ShopPageReader; render?: ShopPageReader; discover?: ShopPageReader; now?: () => Date }
export interface CheckedLocalShop { id: string; name: string; website: string }
export interface LocalShopPriceResult { quotes: LocalShopQuote[]; warnings: string[]; checkedShops: CheckedLocalShop[] }
export type LocalShopPriceObserver = (snapshot: LocalShopPriceResult) => void;
type LocalFailure={message:string;status:"needs-browser"|"needs-store"|"not-configured"|"unavailable"};
const cache = new SharedPriceCache<{products:CatalogueProduct[];fetchedAt:string;searched:string[];issues:Record<string,LocalFailure>}>(96,10*60_000);
const identities=new WeakMap<ShopPageReader,typeof fetch>();
const identity=(reader:ShopPageReader) => { let key=identities.get(reader);if(!key){key=(async()=>new Response()) as typeof fetch;identities.set(reader,key);}return key; };
const text=(value:unknown,max=300) => typeof value === "string" ? value.replace(/[\u0000-\u001f]/g," ").replace(/\s+/g," ").trim().slice(0,max) : "";
const object=(value:unknown):Record<string,unknown>|null => value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
const schemaType=(value:unknown,type:string) => (Array.isArray(value)?value:[value]).some(item=>typeof item==="string"&&item.replace(/^https?:\/\/(?:www\.)?schema\.org\//,"")===type);
const decode=(value:string) => value.replace(/&(?:amp|quot|apos|lt|gt|#39|#34|#x27);/gi,entity=>({"&amp;":"&","&quot;":"\"","&apos;":"'","&lt;":"<","&gt;":">","&#39;":"'","&#34;":"\"","&#x27;":"'"}[entity.toLowerCase()]||entity));
const cleanHtml=(value:string) => decode(value.replace(/<[^>]*>/g," ")).replace(/\s+/g," ").trim();
const localFailure=(error:unknown):LocalFailure=>{const message=error instanceof Error&&error.message.length<250?error.message:"The website price check could not finish.",status=object(error)?.providerStatus;return {message,status:status==="needs-browser"||status==="needs-store"||status==="not-configured"||status==="unavailable"?status:/browser check|captcha|verify.*human/i.test(message)?"needs-browser":"unavailable"};};
/** OSM can retain an old HTTP spelling. Upgrade only that exact host/path; never
 * request HTTP or guess another website if HTTPS fails. */
export function officialShopHttpsUrl(value:string):URL {
  const url=new URL(value);
  if(url.protocol==="http:"){if(url.port&&url.port!=="80")throw new Error("Use ordinary HTTPS for this shop.");url.protocol="https:";url.port="";}
  return publicShopUrl(url.href);
}
let activeChecks=0;
const waitingChecks:(()=>void)[]=[];
async function shopSlot(signal:AbortSignal):Promise<()=>void> {
  signal.throwIfAborted();
  if(activeChecks>=2){
    if(waitingChecks.length>=8)throw new Error("Nearby shop price checks are busy. Please try shortly.");
    await new Promise<void>((resolve,reject)=>{
      const abort=()=>{const at=waitingChecks.indexOf(start);if(at>=0)waitingChecks.splice(at,1);reject(signal.reason);};
      const start=()=>{signal.removeEventListener("abort",abort);activeChecks++;resolve();};
      signal.addEventListener("abort",abort,{once:true});waitingChecks.push(start);
    });
  }else activeChecks++;
  return ()=>{activeChecks=Math.max(0,activeChecks-1);waitingChecks.shift()?.();};
}

export function localSellingQuantity(product:Record<string,unknown>,offer:Record<string,unknown>):string|null {
  const candidates=[text(offer.size,100),text(product.size,100),text(product.name,300)];
  const weight=object(product.weight),unit=weight&&text(weight.unitCode||weight.unitText).toLowerCase();
  if(weight&&typeof weight.value==="number"&&weight.value>0&&weight.value<=1e6&&unit&&["g","grm","kg","kgm","ml","mll","l","ltr"].includes(unit))candidates.unshift(`${weight.value} ${({grm:"g",kgm:"kg",mll:"ml",ltr:"l"} as Record<string,string>)[unit]||unit}`);
  for(const value of candidates){
    if(!value)continue;
    if(/\b(?:approx(?:imately)?|minimum|min\.?|from|between|up to)\b|\d\s*[-–]\s*\d/i.test(value))continue;
    const rate=/\bper\s*(?:(\d+(?:\.\d+)?)\s*)?(kg|g|ml|litres?|liters?|l)\b/i.exec(value);
    if(rate){if(/\d\s*(?:kg|g|ml|l)\b/i.test(value.replace(rate[0],"")))continue;return `per ${rate[1]||""}${rate[2].toLowerCase().replace(/lit(?:re|er)s?/,"l")}`;}
    const multi=/\b(\d{1,3})\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i.exec(value);
    if(multi){if(/\b(?:or|to)\b|[/–-]/.test(value.slice(multi.index+multi[0].length)))continue;return `${multi[1]} x ${multi[2]} ${multi[3].toLowerCase()}`;}
    const measure=/\b(\d+(?:\.\d+)?)\s*(kg|g|ml|litres?|liters?|l)\b/i.exec(value);
    const count=/\b(\d{1,3})\s*(?:pack|pk|pieces?|count|each)\b/i.exec(value);
    if(measure){if(count||[...value.matchAll(/\b\d+(?:\.\d+)?\s*(?:kg|g|ml|litres?|liters?|l)\b/gi)].length!==1)continue;return `${measure[1]} ${measure[2].toLowerCase().replace(/lit(?:re|er)s?/,"l")}`;}
    if(count)return `${count[1]} each`;
    if(/\bdozen\b/i.test(value))return "12 each";
    if(/\b(?:each|per item|per piece)\b/i.test(value))return "each";
  }
  return null;
}

function sameShopUrl(value:unknown,base:URL):string|null {
  if(typeof value!=="string"||value.length>1000)return null;
  try {const url=publicShopUrl(new URL(decode(value),base).toString());return url.hostname.replace(/^www\./,"")===base.hostname.replace(/^www\./,"")?url.toString():null;}catch{return null;}
}
function conditional(offer:Record<string,unknown>):boolean {
  if(offer.validForMemberTier||offer.eligibleCustomerType||offer.eligibleQuantity||offer.addOn)return true;
  const specs=(Array.isArray(offer.priceSpecification)?offer.priceSpecification:[offer.priceSpecification]).map(object).filter(Boolean);
  return specs.some(spec=>spec!.validForMemberTier||spec!.eligibleCustomerType||/strikethrough|listprice|msrp|invoiceprice/i.test(text(spec!.priceType)));
}
function expired(offer:Record<string,unknown>,now:Date):boolean {
  const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Australia/Sydney",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  for(const key of ["priceValidUntil","availabilityEnds","validThrough"]){const raw=text(offer[key],60);if(raw&&(/^\d{4}-\d{2}-\d{2}$/.test(raw)?raw<day:!Number.isFinite(Date.parse(raw))||Date.parse(raw)<now.getTime()))return true;}
  const start=text(offer.validFrom||offer.availabilityStarts,60);return !!start&&(!Number.isFinite(Date.parse(start))||Date.parse(start)>now.getTime());
}

/** Only explicit AUD Product/Offer data. Struck prices, comparison units, ranges
 * and member-only offers are never guessed from nearby text or a minimum price. */
export function parseLocalShopProducts(html:string,pageUrl:string,now=new Date()):CatalogueProduct[] {
  if(Buffer.byteLength(html,"utf8")>MAX_SHOP_PAGE_BYTES)throw new Error("The shop page exceeds the reading limit.");
  const base=publicShopUrl(pageUrl);
  if(/<title[^>]*>\s*(?:Just a moment|Access Denied|Robot or human|Please verify)|id=["'](?:challenge-running|challenge-form)|verify (?:that )?you are human|captcha-delivery\.com/i.test(html))throw new Error("The shop requires a browser check. Open its website to continue.");
  const products:CatalogueProduct[]=[];const seen=new Set<string>();let visited=0;
  function visit(value:unknown,depth=0):void {
    if(++visited>20_000||depth>18)return;
    if(Array.isArray(value)){for(const item of value.slice(0,200))visit(item,depth+1);return;}
    const row=object(value);if(!row)return;
    if(schemaType(row["@type"],"Product")){
      const name=decode(text(row.name));const offers=(Array.isArray(row.offers)?row.offers:[row.offers]).map(object).filter((offer):offer is Record<string,unknown>=>!!offer&&schemaType(offer["@type"],"Offer"));
      // Several differently priced/packed variants require an explicit variant selection.
      if(name&&offers.length===1&&!/\b(?:members? only|member price|subscription only|seedlings?|seed packets?|grow kit|potting mix|fertilisers?|fertilizers?|compost)\b/i.test(name)){
        const offer=offers[0],price=audToCents(offer.price),url=sameShopUrl(offer.url||row.url||base.href,base);
        if(price&&text(offer.priceCurrency).toUpperCase()==="AUD"&&url&&!conditional(offer)&&!expired(offer,now)){
          const availability=text(offer.availability);const stocked=/\/(?:InStock)$/.test(availability)||availability==="InStock"?true:/\/(?:OutOfStock|Discontinued|SoldOut)$/.test(availability)||["OutOfStock","Discontinued","SoldOut"].includes(availability)?false:null;
          const product:CatalogueProduct={name,priceCents:price,packageSize:localSellingQuantity(row,offer),stockcode:text(row.sku||row.productID||row["@id"],180)||url,inStock:stocked,available:stocked,url,categories:[text(row.category)]};
          const key=`${url}|${name}|${price}|${product.packageSize}`;
          if(!seen.has(key)&&!isNonFoodCatalogueProduct(product)){products.push(product);seen.add(key);}
        }
      }
    }
    for(const key of ["@graph","itemListElement","item","mainEntity","hasVariant"])if(row[key])visit(row[key],depth+1);
  }
  for(const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){
    if(match[1].length>1_000_000)continue;
    try{visit(JSON.parse(match[1]));}catch{/* Invalid structured data is not a price. */}
    if(products.length>=64)break;
  }
  return products.slice(0,64);
}

export function localProductLinks(html:string,pageUrl:string,query:string):string[] {
  const base=publicShopUrl(pageUrl),wanted=canonicalizeProductText(query).split(" ").filter(word=>word.length>1&&!['fresh','for','the','side'].includes(word));
  const links=new Map<string,number>();
  for(const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi)){
    const href=sameShopUrl(match[1],base);if(!href)continue;const url=new URL(href);
    if(!/\/(?:products?|items?|shop)\/[^/]+/.test(url.pathname)||/\/product-category\//.test(url.pathname))continue;
    let slug:string;try{slug=decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1)||'');}catch{continue;}
    const title=canonicalizeProductText(`${cleanHtml(match[2]).slice(0,300)} ${slug}`);
    const overlap=wanted.filter(word=>title.split(" ").includes(word)).length;
    if(overlap!==wanted.length||!overlap)continue;
    // Apply the same preparation/cut/food exclusions before spending a page read.
    // A link has no known price or stock, and is never itself a quote.
    if(!matchProducts(query,[{name:title,priceCents:null,packageSize:null,inStock:null,available:null,stockcode:null}]).length)continue;
    const score=overlap*10-title.split(" ").length;links.set(href,Math.max(links.get(href)??-1000,score));
    if(links.size>100)break;
  }
  return [...links].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,4).map(([url])=>url);
}

function kilometres(a:{lat:number;lon:number},b:{lat:number;lon:number}):number {
  const rad=(n:number)=>n*Math.PI/180;const x=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
const validPoint=(point:{lat:number;lon:number})=>Number.isFinite(point?.lat)&&Math.abs(point.lat)<=90&&Number.isFinite(point?.lon)&&Math.abs(point.lon)<=180;
const produceShop=(shop:Shop)=>shop.kind==="produce"||["greengrocer","farm"].includes(shop.shopType||"")||["market","grocery"].includes(shop.kind)&&/\b(?:fruit|produce|vegetable|farmers)\b/i.test(shop.name);
const butcherShop=(shop:Shop)=>shop.kind==="butcher"||shop.shopType==="butcher";
const category=(line:ShoppingLine)=>{const inferred=inferShoppingCategory(line.name);return inferred==="produce"||inferred==="butcher"?inferred:line.category==="produce"&&!/\b(?:dried|powder|frozen|canned|tinned|pickled|sauce|paste|seed)\b/i.test(line.name)?"produce":inferred;};

/** Caller must pass server-discovered shops, never client-supplied website URLs.
 * Recompute radius from coordinates; a supplied distanceKm never grants locality. */
export async function lookupLocalShopPrices(lines:readonly ShoppingLine[],verifiedShops:readonly Shop[],context:LocalShopContext,deps:LocalShopPriceDependencies={},signal?:AbortSignal,onProgress?:LocalShopPriceObserver):Promise<LocalShopPriceResult> {
  if(!validPoint(context.location)||!Number.isFinite(context.radiusKm)||context.radiusKm<1||context.radiusKm>25||!context.area.trim()||context.country&&!/^(?:au|aus|australia)$/i.test(context.country))return {quotes:[],warnings:["Choose an Australian shopping area to check nearby specialist websites."],checkedShops:[]};
  const reader=deps.render||deps.read||readPublicShopPage,now=deps.now?.()||new Date();
  const needs=new Set(lines.map(category));
  const candidates=verifiedShops.filter(shop=>validPoint(shop)&&typeof shop.id==="string"&&shop.id.length<=100&&typeof shop.name==="string"&&shop.website&&(produceShop(shop)&&needs.has("produce")||butcherShop(shop)&&needs.has("butcher"))&&kilometres(context.location,shop)<=context.radiusKm).flatMap(shop=>{try{const website=officialShopHttpsUrl(shop.website!);return /(?:^|\.)(?:facebook|instagram|youtube|google|goo\.gl|tiktok)\./i.test(website.hostname)?[]:[{...shop,website:website.href}];}catch{return [];}}).sort((a,b)=>kilometres(context.location,a)-kilometres(context.location,b));
  // Reserve one check for each needed specialist type before filling by distance.
  // Several nearby fruit markets must not crowd out the first nearby butcher.
  const chosen=new Map<string,Shop>();
  for(const kind of ["produce","butcher"]){const first=candidates.find(shop=>(kind==="produce"?produceShop(shop):butcherShop(shop)));if(first)chosen.set(first.id,first);}
  for(const candidate of candidates){if(chosen.size>=3)break;chosen.set(candidate.id,candidate);}
  const shops=[...chosen.values()].sort((a,b)=>kilometres(context.location,a)-kilometres(context.location,b));
  const batch=createDeadline(28_000,signal?[signal]:[]);
  try{
  const batchSignal=batch.signal;
  const progress=new Map<string,LocalShopPriceResult>();
  const publish=(id:string,result:LocalShopPriceResult)=>{
    if(batchSignal.aborted||!onProgress)return;
    progress.set(id,structuredClone(result));
    const completed=shops.flatMap(shop=>progress.get(shop.id)||[]);
    onProgress({quotes:completed.flatMap(item=>item.quotes),warnings:completed.flatMap(item=>item.warnings),checkedShops:completed.flatMap(item=>item.checkedShops)});
  };
  async function checkShop(shop:Shop){
    const quotes:LocalShopQuote[]=[],warnings:string[]=[],checkedShops:CheckedLocalShop[]=[];
    const result={quotes,warnings,checkedShops};
    if(batchSignal.aborted)return result;
    const suitable=lines.filter(line=>category(line)===(butcherShop(shop)?"butcher":"produce")&&line.name.length<=80);
    if(!suitable.length)return result;
    let base:URL;try{base=publicShopUrl(shop.website!);if(/(?:^|\.)(?:facebook|instagram|youtube|google|goo\.gl|tiktok)\./i.test(base.hostname))return result;}catch{return result;}
    const queries=[...new Set(suitable.map(line=>line.name))].slice(0,2);
    checkedShops.push({id:shop.id,name:shop.name,website:base.href});
    publish(shop.id,result);
    const shopInfo={id:shop.id,name:shop.name,website:base.href,area:context.area,lat:shop.lat,lon:shop.lon};
    const key=JSON.stringify([shop.id,base.href,shop.lat,shop.lon,context.area,queries]);
    try{
      const loaded=await cache.load(key,identity(reader),async shared=>withDeadline(26_000,[shared],async combined=>{
        const release=await shopSlot(combined);const searched:string[]=[];const found:CatalogueProduct[]=[];const seen=new Set<string>();const issues:Record<string,LocalFailure>={};
        async function read(url:string){combined.throwIfAborted();const page=await reader(url,combined);combined.throwIfAborted();if(page.status!==undefined&&(page.status<200||page.status>=300))throw new Error([401,403,429].includes(page.status)?"This shop requires a browser check.":"This shop did not return a public price page.");publicShopUrl(page.url);if(new URL(page.url).hostname.replace(/^www\./,"")!==base.hostname.replace(/^www\./,""))throw new Error("The shop redirected to a different website.");searched.push(page.url);for(const product of parseLocalShopProducts(page.html,page.url,now)){const key=JSON.stringify([product.url,product.name,product.priceCents,product.packageSize]);if(!seen.has(key)){seen.add(key);found.push(product);}}return page;}
        try{
          let metadata:PublicShopPage|null=null,homepageHasProducts=false;
          if(deps.render&&deps.discover){
            try{
              const page=await withDeadline(6500,[combined],metadataSignal=>deps.discover!(base.href,metadataSignal));combined.throwIfAborted();
              publicShopUrl(page.url);
              if(page.status!==undefined&&(page.status<200||page.status>=300)||new URL(page.url).hostname.replace(/^www\./,"")!==base.hostname.replace(/^www\./,""))throw new Error("The homepage metadata was unavailable.");
              // Discovery can identify an offer, but none of its prices or stock
              // enter found. Verify that homepage through the browser instead.
              homepageHasProducts=parseLocalShopProducts(page.html,page.url,now).length>0;
              metadata=page;
            }catch{combined.throwIfAborted();/* Fall back to an ordinary browser homepage. */}
          }
          const home:PublicShopPage=metadata&&!homepageHasProducts?metadata:await read(base.href),shopify=/Shopify|cdn\.shopify\.com|shopify-section/i.test(home.html);
          const commerce=shopify||/woocommerce|wc-block|wc\/store|post_type=product/i.test(home.html)||[...home.html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].slice(0,1000).some(match=>{const url=sameShopUrl(match[1],new URL(home.url));return !!url&&/\/(?:products?|shop)\/[^/]+/.test(new URL(url).pathname);});
          for(const query of queries){
            if(matchProducts(query,found).some(match=>match.selected))continue;
            if(!commerce)continue;
            try{
              const direct=localProductLinks(home.html,home.url,query)[0];
              if(direct&&!searched.includes(direct)){await read(direct);if(matchProducts(query,found).some(match=>match.nameMatched&&match.priceCents!=null))continue;}
              const search=new URL(shopify?"/search":"/",base);
              search.searchParams.set(shopify?"q":"s",query);search.searchParams.set(shopify?"type":"post_type","product");
              const page=await read(search.href);
              if(!matchProducts(query,found).some(match=>match.selected)){
                const link=localProductLinks(page.html,page.url,query)[0];if(!direct&&link&&!searched.includes(link))await read(link);
              }
            }catch(error){combined.throwIfAborted();issues[query]=localFailure(error);}
          }
          return {products:found,fetchedAt:new Date().toISOString(),searched,issues};
        }finally{release();}
      }),batchSignal);
      for(const line of suitable){
        const matches=matchProducts(line.name,loaded.value.products).filter(match=>match.score>0);
        const issue=loaded.value.issues[line.name];if(issue)warnings.push(`${shop.name}: ${issue.message}`);
        quotes.push({query:line.name,source:"local-shop-website",scope:"shop-website",shop:shopInfo,status:matches.some(match=>match.selected)?"ready":matches.length?"partial":issue?.status||"unavailable",collectionMethod:deps.render?"browser":"http",label:`Published website guide for ${shop.name}. Branch prices, delivery terms and shelf stock are unconfirmed.`,fetchedAt:loaded.value.fetchedAt,cached:loaded.cached,fulfilmentStoreId:null,searched:loaded.value.searched,matches,error:matches.length?null:issue?.message||"No matching published product price was readable. Open this shop's website to check."});
      }
    }catch(error){
      const {message,status}=localFailure(error);
      warnings.push(`${shop.name}: ${message}`);
      for(const line of suitable)quotes.push({query:line.name,source:"local-shop-website",scope:"shop-website",shop:shopInfo,status,collectionMethod:deps.render?"browser":"http",label:`Published website guide for ${shop.name}. Branch prices, delivery terms and shelf stock are unconfirmed.`,fetchedAt:null,cached:false,fulfilmentStoreId:null,searched:[base.href],matches:[],error:message});
    }
    publish(shop.id,result);
    return result;
  }
  // Start one of each needed specialist first. shopSlot still limits all requests
  // to two actual jobs, while a slow market cannot hold a butcher behind it.
  const priority=new Map<string,Shop>();
  for(const kind of ["produce","butcher"]){const first=shops.find(shop=>kind==="produce"?produceShop(shop):butcherShop(shop));if(first)priority.set(first.id,first);}
  for(const shop of shops)priority.set(shop.id,shop);
  const jobs=new Map([...priority.values()].map(shop=>[shop.id,checkShop(shop)]));
  const results=await Promise.all(shops.map(shop=>jobs.get(shop.id)!));
  return {quotes:results.flatMap(result=>result.quotes),warnings:results.flatMap(result=>result.warnings),checkedShops:results.flatMap(result=>result.checkedShops)};
  }finally{batch.dispose();}
}
