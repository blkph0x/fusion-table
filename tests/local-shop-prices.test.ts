import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { lookup } from "node:dns/promises";
import type { request } from "node:https";
import type { Shop } from "../lib/locations.ts";
import { lookupLocalShopPrices, localProductLinks, localSellingQuantity, parseLocalShopProducts, officialShopHttpsUrl } from "../lib/local-shop-prices.ts";
import { MAX_SHOP_PAGE_BYTES, publicShopAddress, publicShopUrl, readPublicShopPage, shopConnectionTarget } from "../lib/public-shop-reader.ts";
import { costShoppingQuantity } from "../lib/shopping-costs.ts";
import { isBlockedAddress, readShopPage } from "../lib/price-page.ts";

const now=new Date("2026-10-27T08:00:00Z");
const fixture=(product:Record<string,unknown>)=>`<script type="application/ld+json">${JSON.stringify({"@graph":[product]})}</script>`;
const product=(overrides:Record<string,unknown>={})=>({"@type":"Product",name:"Chicken breast fillets (1kg)",url:"https://butcher.example.com/products/chicken-breast-fillets",offers:{"@type":"Offer",price:13.88,priceCurrency:"AUD",availability:"https://schema.org/InStock",url:"https://butcher.example.com/products/chicken-breast-fillets"},...overrides});
const shop=(overrides:Partial<Shop>={}):Shop=>({id:"osm/1",name:"Local butcher",kind:"butcher",shopType:"butcher",lat:-33.9,lon:151.18,distanceKm:0,address:"Newtown NSW",website:"https://butcher.example.com/",phone:null,openingHours:null,osmUrl:"https://www.openstreetmap.org/node/1",inventoryStatus:"unverified",...overrides});
const context={area:"2042",location:{lat:-33.9,lon:151.18},radiusKm:5,country:"Australia"};
const publicLookup=(async()=>[{address:"93.184.216.34",family:4}]) as unknown as typeof lookup;

test("explicit official-style butcher and produce JSON-LD yields current AUD prices with actual selling packs",()=>{
 const meat=parseLocalShopProducts(fixture(product()),"https://butcher.example.com/",now)[0];
 assert.equal(meat.priceCents,1388);assert.equal(meat.packageSize,"1 kg");assert.equal(meat.inStock,true);
 assert.equal(costShoppingQuantity(650,"g",meat.priceCents,meat.packageSize).lineCents,1388);
 const veg=product({name:"Tomatoes Round 1kg Bag | Panetta Mercato",offers:{"@type":"Offer",price:"5.99",priceCurrency:"AUD",priceValidUntil:"2027-12-31",availability:"http://schema.org/InStock"}});
 const tomatoes=parseLocalShopProducts(fixture(veg),"https://butcher.example.com/",now)[0];assert.equal(tomatoes.priceCents,599);assert.equal(tomatoes.packageSize,"1 kg");
});

test("comparison, crossed-out, member, expired, foreign-currency and aggregate prices never become current offers",()=>{
 const offer=product().offers as Record<string,unknown>;
 for(const wrong of [{...offer,priceCurrency:"USD"},{...offer,price:undefined,priceSpecification:{price:"2.99",priceCurrency:"AUD"}},{...offer,validForMemberTier:"Club"},{...offer,eligibleCustomerType:"member"},{...offer,eligibleQuantity:{minValue:5}},{...offer,priceValidUntil:"2026-10-26"},{...offer,validFrom:"2027-01-01"},{...offer,"@type":"AggregateOffer",lowPrice:4,highPrice:30},{...offer,priceSpecification:{priceType:"https://schema.org/StrikethroughPrice"}}]){
  assert.equal(parseLocalShopProducts(fixture(product({offers:wrong})),"https://butcher.example.com/",now).length,0,JSON.stringify(wrong));
 }
 assert.equal(parseLocalShopProducts(`<p>Chicken Breast <del>$18.00</del> $12.00/kg</p>`,"https://butcher.example.com/",now).length,0);
 assert.equal(parseLocalShopProducts(fixture(product({offers:[offer,{...offer,price:18}]})),"https://butcher.example.com/",now).length,0);
});

test("stock stays unknown unless published and foreign product links or nonfood products are rejected",()=>{
 const offer=product().offers as Record<string,unknown>;
 const unknown=parseLocalShopProducts(fixture(product({offers:{...offer,availability:undefined}})),"https://butcher.example.com/",now)[0];assert.equal(unknown.inStock,null);assert.equal(unknown.available,null);
 assert.equal(parseLocalShopProducts(fixture(product({offers:{...offer,url:"https://other.example.com/products/steak"}})),"https://butcher.example.com/",now).length,0);
 assert.equal(parseLocalShopProducts(fixture(product({name:"Chicken dog food 1kg"})),"https://butcher.example.com/",now).length,0);
 assert.equal(parseLocalShopProducts(fixture(product({name:"Basil seedlings 20g"})),"https://butcher.example.com/",now).length,0);
 assert.throws(()=>parseLocalShopProducts('<title>Just a moment</title>'+fixture(product()),"https://butcher.example.com/",now),/browser check/);
});

test("pack and rate extraction preserves selling dimensions and declines approximations",()=>{
 for(const [name,expected] of [["Chicken breast per kg","per kg"],["Tomatoes per 100g","per 100g"],["Prawns 2 x 500g","2 x 500 g"],["Eggs 6 pack","6 each"],["Eggs dozen","12 each"],["Cucumber each","each"]])assert.equal(localSellingQuantity({name},{}),expected);
 for(const name of ["Chicken approx 1.2kg-1.4kg","Tomato minimum 1kg","Rump from 500g","Tomatoes","Rump 500g / 1kg","Rump 1kg-2kg","Tomatoes 500g priced per kg","Tomatoes 3 pack 500g"])assert.equal(localSellingQuantity({name},{}),null);
 assert.equal(localSellingQuantity({weight:{value:500,unitCode:"GRM"}},{}),"500 g");
});

test("product-link discovery selects relevant products on the verified site only",()=>{
 const html='<a href="/products/chicken-breast-fillets">Chicken breast fillets</a><a href="https://elsewhere.com/products/chicken-breast">Chicken breast</a><a href="/pages/chicken-breast">Chicken breast recipe</a><a href="/products/beef-mince">Beef mince</a>';
 assert.deepEqual(localProductLinks(html,"https://butcher.example.com/search","chicken breast"),["https://butcher.example.com/products/chicken-breast-fillets"]);
 assert.deepEqual(localProductLinks('<a href="/products/smoked-chicken-breast">Smoked chicken breast</a><a href="/products/pasture-raised-chicken-breast">Pasture raised chicken breast</a>',"https://butcher.example.com/search","Chicken breast"),["https://butcher.example.com/products/pasture-raised-chicken-breast"]);
});

test("official HTTP website spellings upgrade to the exact HTTPS host/path and never request HTTP",async()=>{
 assert.equal(officialShopHttpsUrl("http://butcher.example.com/specials?q=chicken#board").href,"https://butcher.example.com/specials?q=chicken");
 for(const url of ["http://127.0.0.1/","http://user:pass@butcher.example.com/","http://butcher.example.com:8888/","ftp://butcher.example.com/"])assert.throws(()=>officialShopHttpsUrl(url));
 const requested:string[]=[];await lookupLocalShopPrices([{id:"chicken",name:"Chicken breast",amount:500,unit:"g",category:"butcher"}],[shop({id:"old-http",website:"http://butcher.example.com/"})],context,{read:async url=>{requested.push(url);return {url,html:fixture(product())};}});assert.deepEqual(requested,["https://butcher.example.com/"]);
});

test("a relevant homepage product link avoids a redundant search and keeps the page budget",async()=>{
 const calls:string[]=[];const result=await lookupLocalShopPrices([{id:"chicken",name:"Chicken breast",amount:500,unit:"g",category:"butcher"}],[shop({id:"direct-product"})],context,{read:async url=>{calls.push(url);return {url,html:calls.length===1?'<a href="/products/chicken-breast-fillets">Chicken breast fillets</a>':fixture(product())};}});
 assert.equal(calls.length,2);assert.equal(calls.some(url=>new URL(url).search),false);assert.equal(result.quotes[0].matches[0].priceCents,1388);
});

test("browser provider statuses survive custom messages in both home and ingredient failures",async()=>{
 for(const status of ["needs-browser","needs-store","not-configured","unavailable"] as const){
  const result=await lookupLocalShopPrices([{id:"chicken",name:"Chicken breast",amount:500,unit:"g",category:"butcher"}],[shop({id:`status-${status}`})],context,{render:async()=>{throw Object.assign(new Error("An explicit source state."),{providerStatus:status});}});assert.equal(result.quotes[0].status,status);assert.equal(result.quotes[0].collectionMethod,"browser");
 }
});

test("nearby locality is recomputed, wrong-country and remote/client-claimed distances cannot grant quotes",async()=>{
 let calls=0;const read=async(url:string)=>{calls++;return {html:fixture(product()),url};};
 const remote=shop({lat:-37.8,lon:144.9,distanceKm:0});
 assert.equal((await lookupLocalShopPrices([{id:"chicken",name:"Chicken breast",amount:500,unit:"g",category:"butcher"}],[remote],context,{read})).checkedShops.length,0);
 assert.equal((await lookupLocalShopPrices([],[shop()],{...context,country:"United States"},{read})).checkedShops.length,0);
 assert.equal(calls,0);
});

test("verified nearby sites produce shop-bound guides, cache them and retain unknown availability",async()=>{
 let calls=0;const read=async(url:string)=>{calls++;return {html:fixture(product()),url};};
 const lines=[{id:"chicken",name:"Chicken breast",amount:650,unit:"g",category:"butcher" as const}];
 const first=await lookupLocalShopPrices(lines,[shop()],context,{read,now:()=>now});assert.equal(first.checkedShops.length,1);assert.equal(first.quotes.length,1);assert.equal(first.quotes[0].shop.id,"osm/1");assert.equal(first.quotes[0].shop.area,"2042");assert.match(first.quotes[0].label,/shelf stock are unconfirmed/);assert.equal(first.quotes[0].matches[0].priceCents,1388);
 const second=await lookupLocalShopPrices(lines,[shop()],context,{read,now:()=>now});assert.equal(calls,1);assert.equal(second.quotes[0].cached,true);
 await lookupLocalShopPrices(lines,[shop()],{...context,area:"2000"},{read,now:()=>now});assert.equal(calls,2,"the same site price is rebound to each actual area context");
});

test("WooCommerce and Shopify discovery read at most home, search and one relevant product",async()=>{
 for(const platform of ["woocommerce","Shopify"]){
  const calls:string[]=[];const read=async(url:string)=>{calls.push(url);return {url,html:calls.length===1?platform:calls.length===2?'<a href="/products/chicken-breast-fillets">Chicken breast fillets</a>':fixture(product())};};
  const result=await lookupLocalShopPrices([{id:"chicken",name:"Chicken breast",amount:500,unit:"g",category:"butcher"}],[shop({id:platform})],context,{read,now:()=>now});
  assert.equal(calls.length,3);assert.equal(new URL(calls[1]).searchParams.get(platform==="Shopify"?"q":"s"),"Chicken breast");assert.equal(result.quotes[0].matches[0].priceCents,1388);
 }
});

test("only nearby fresh-food specialists are checked and at most three shops are read",async()=>{
 let calls=0;const read=async(url:string)=>{calls++;return {url,html:fixture(product())};};
 const shops=Array.from({length:7},(_,i)=>shop({id:`shop-${i}`}));
 const result=await lookupLocalShopPrices([{id:"chicken",name:"Chicken breast",amount:500,unit:"g",category:"butcher"}],shops,context,{read});assert.equal(result.checkedShops.length,3);assert.equal(calls,3);
 assert.equal((await lookupLocalShopPrices([{id:"stock",name:"Chicken stock",amount:500,unit:"ml",category:"grocery"}],[shop()],context,{read})).checkedShops.length,0);
});

test("needed shop categories retain a search slot even when many fruit markets are closer",async()=>{
 const nearby=Array.from({length:4},(_,i)=>shop({id:`fruit-${i}`,kind:"produce",shopType:"greengrocer",name:`Fruit market ${i}`}));
 const butcher=shop({id:"needed-butcher",lat:-33.901});
 const result=await lookupLocalShopPrices([{id:"tomato",name:"Tomatoes",amount:500,unit:"g",category:"produce"},{id:"chicken",name:"Chicken breast",amount:500,unit:"g",category:"butcher"}],[...nearby,butcher],context,{read:async url=>({url,html:fixture(product())})});
 assert.equal(result.checkedShops.length,3);assert.equal(result.checkedShops.some(shop=>shop.id==="needed-butcher"),true);
});

test("HTTPS URLs and global address validation block localhost, private, mapped, transition and documentation ranges",()=>{
 for(const url of ["http://shop.com/","https://u:p@shop.com/","https://127.0.0.1/","https://shop.local/","https://shop.com:8443/","https://[::ffff:7f00:1]/"])assert.throws(()=>publicShopUrl(url));
 for(const address of ["10.1.1.111","127.0.0.1","169.254.169.254","192.168.1.1","100.64.0.1","192.0.2.1","198.51.100.1","203.0.113.1","198.19.0.1","::","::1","::ffff:127.0.0.1","::ffff:7f00:1","fe80::1","fc00::1","2001:db8::1","2002:7f00:1::1","2001:100::1","3ffe::1","3fff::1"]){assert.equal(publicShopAddress(address),false,address);assert.equal(isBlockedAddress(address),true,address);}
 for(const address of ["93.184.216.34","1.1.1.1","2606:4700:4700::1111","2001:4860:4860::8888"])assert.equal(publicShopAddress(address),true,address);
});

test("blocked and unavailable shops retain source identity and never produce a price",async()=>{
 const lines=[{id:"chicken",name:"Chicken breast",amount:500,unit:"g",category:"butcher" as const}];
 const blocked=await lookupLocalShopPrices(lines,[shop({id:"blocked-shop"})],context,{read:async url=>({url,html:"<title>Just a moment</title>",status:200})});
 assert.deepEqual(blocked.checkedShops,[{id:"blocked-shop",name:"Local butcher",website:"https://butcher.example.com/"}]);
 assert.equal(blocked.quotes[0].status,"needs-browser");assert.deepEqual(blocked.quotes[0].matches,[]);assert.equal(blocked.quotes[0].fetchedAt,null);
 const down=await lookupLocalShopPrices(lines,[shop({id:"down-shop"})],context,{read:async url=>({url,html:"",status:503})});assert.equal(down.quotes[0].status,"unavailable");assert.deepEqual(down.quotes[0].matches,[]);
});

test("two distinct ingredients are searched with a five-page budget and duplicate listings do not create false ambiguity",async()=>{
 const calls:string[]=[];
 const read=async(url:string)=>{
  calls.push(url);const parsed=new URL(url),beef=parsed.searchParams.get("s")==="Beef mince"||parsed.pathname.includes("beef-mince");
  if(calls.length===1)return {url,html:"WooCommerce"};
  if(parsed.search)return {url,html:`<a href="/products/${beef?"beef-mince":"chicken-breast-fillets"}">${beef?"Beef mince":"Chicken breast fillets"}</a>`};
  const item=beef?product({name:"Beef mince 1kg",url,offers:{...product().offers,url,price:14.5}}):product();return {url,html:fixture(item)+fixture(item)};
 };
 const result=await lookupLocalShopPrices([{id:"chicken",name:"Chicken breast",amount:500,unit:"g",category:"butcher"},{id:"beef",name:"Beef mince",amount:500,unit:"g",category:"butcher"}],[shop({id:"two-ingredients"})],context,{read});
 assert.equal(calls.length,5);assert.deepEqual(result.quotes.map(q=>q.matches[0].priceCents),[1388,1450]);assert.equal(result.quotes[0].matches.length,1);assert.equal(result.quotes[1].matches.length,1);
});

test("caller cancellation stops shared work and releases the provider slot",async()=>{
 const controller=new AbortController();let started!:()=>void;const beginning=new Promise<void>(resolve=>{started=resolve;});let cancelled=false;
 const read=async(url:string,signal?:AbortSignal)=>new Promise<{url:string;html:string}>((_resolve,reject)=>{started();signal?.addEventListener("abort",()=>{cancelled=true;reject(signal.reason);},{once:true});});
 const work=lookupLocalShopPrices([{id:"chicken",name:"Chicken breast",amount:500,unit:"g",category:"butcher"}],[shop({id:"cancelled-shop"})],context,{read},controller.signal);
 await beginning;controller.abort();const result=await work;assert.equal(cancelled,true);assert.equal(result.quotes[0].status,"unavailable");assert.deepEqual(result.quotes[0].matches,[]);
});

test("a later ingredient failure retains an earlier verified published price",async()=>{
 const read=async(url:string)=>({url,html:new URL(url).searchParams.get("s")==="Beef mince"?"<title>Just a moment</title>":fixture(product())});
 const result=await lookupLocalShopPrices([{id:"chicken",name:"Chicken breast",amount:500,unit:"g",category:"butcher"},{id:"beef",name:"Beef mince",amount:500,unit:"g",category:"butcher"}],[shop({id:"partial-shop"})],context,{read});
 assert.equal(result.quotes[0].status,"ready");assert.equal(result.quotes[0].matches[0].priceCents,1388);assert.equal(result.quotes[1].status,"needs-browser");assert.deepEqual(result.quotes[1].matches,[]);
});

test("provider concurrency stays bounded across independent nearby-price requests",async()=>{
 let active=0,maximum=0;
 const read=async(url:string)=>{active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,8));active--;return {url,html:fixture(product())};};
 await Promise.all(Array.from({length:5},(_,i)=>lookupLocalShopPrices([{id:"chicken",name:"Chicken breast",amount:500,unit:"g",category:"butcher"}],[shop({id:`concurrent-${i}`})],context,{read})));
 assert.equal(maximum,2);assert.equal(active,0);
});

test("manual price imports validate every redirect's DNS and reject oversized bodies",async()=>{
 let calls=0;
 await assert.rejects(()=>readShopPage("https://butcher.example/specials",["chicken breast"],{lookup:(async()=>[{address:++calls===1?"93.184.216.34":"::ffff:7f00:1",family:calls===1?4:6}]) as unknown as typeof lookup,fetch:async()=>new Response(null,{status:302,headers:{location:"/next"}})}),/not a public shop page/);
 assert.equal(calls,2);
 await assert.rejects(()=>readShopPage("https://butcher.example/specials",["chicken breast"],{lookup:publicLookup,fetch:async()=>new Response("x".repeat(500_001),{headers:{"content-type":"text/html"}})}),/reading limit/);
});

test("all DNS addresses must be public and the TLS lookup uses the validated address without re-resolving",async()=>{
 await assert.rejects(()=>shopConnectionTarget("https://butcher.example.com/",(async()=>[{address:"93.184.216.34",family:4},{address:"127.0.0.1",family:4}]) as unknown as typeof lookup),/entirely to public/);
 let calls=0;const target=await shopConnectionTarget("https://butcher.example.com/",(async()=>{calls++;return [{address:"93.184.216.34",family:4}];}) as unknown as typeof lookup);
 target.pinnedLookup("butcher.example.com",{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,"93.184.216.34");assert.equal(family,4);});assert.equal(calls,1);
 target.pinnedLookup("butcher.example.com",{all:true},(error,address)=>{assert.equal(error,null);assert.deepEqual(address,[{address:"93.184.216.34",family:4}]);});assert.equal(calls,1);
});

test("a slow DNS resolution aborts promptly without making a connection",async()=>{
 const controller=new AbortController();const waiting=shopConnectionTarget("https://butcher.example.com/",(async()=>new Promise(()=>{})) as typeof lookup,controller.signal);controller.abort();await assert.rejects(waiting,{name:"AbortError"});
});

test("pinned HTTPS reads validate every redirect and cap response bytes",async()=>{
 let connections=0;const fakeRequest=((_url:URL,options:Record<string,unknown>,callback:(res:PassThrough)=>void)=>{
  connections++;assert.equal(options.agent,false);assert.equal((options.headers as Record<string,string>).Cookie,undefined);
  const req=new EventEmitter();Object.assign(req,{end(){queueMicrotask(()=>{const res=Object.assign(new PassThrough(),{statusCode:200,headers:{"content-type":"text/html"}});callback(res);res.end("<p>public</p>");});}});return req;
 }) as unknown as typeof request;
 const result=await readPublicShopPage("https://butcher.example.com/",undefined,{lookup:publicLookup,request:fakeRequest});assert.equal(result.html,"<p>public</p>");assert.equal(connections,1);
 const redirect=((_url:URL,_options:Record<string,unknown>,callback:(res:PassThrough)=>void)=>{const req=new EventEmitter();Object.assign(req,{end(){queueMicrotask(()=>callback(Object.assign(new PassThrough(),{statusCode:302,headers:{location:"https://127.0.0.1/private"}})));}});return req;}) as unknown as typeof request;
 await assert.rejects(()=>readPublicShopPage("https://butcher.example.com/",undefined,{lookup:publicLookup,request:redirect}),/public HTTPS/);
 const huge=((_url:URL,_options:Record<string,unknown>,callback:(res:PassThrough)=>void)=>{const req=new EventEmitter();Object.assign(req,{end(){queueMicrotask(()=>{const res=Object.assign(new PassThrough(),{statusCode:200,headers:{"content-type":"text/html"}});callback(res);res.end(Buffer.alloc(MAX_SHOP_PAGE_BYTES+1));});}});return req;}) as unknown as typeof request;
 await assert.rejects(()=>readPublicShopPage("https://butcher.example.com/",undefined,{lookup:publicLookup,request:huge}),/reading limit/);
});
