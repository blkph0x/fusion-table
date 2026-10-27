import assert from "node:assert/strict";
import test from "node:test";
const freshProviders=async(name:string):Promise<typeof import("../lib/location-providers.ts")>=>import(new URL(`../lib/location-providers.ts?test=fresh-${name}`,import.meta.url).href);
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
const feature=(id:number,name:string,kind="supermarket",lon=151.18)=>({geometry:{type:"Point",coordinates:[lon,-33.897]},properties:{osm_type:"N",osm_id:id,osm_key:"shop",osm_value:kind,name}});
test("truncated general results are supplemented with specialist tags and merged by exact OSM identity",async t=>{
 t.mock.timers.enable({apis:["Date","setTimeout"],now:0});const provider=await freshProviders("merge");let calls=0;
 t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>{calls++;const url=new URL(String(input)),tags=url.searchParams.getAll("osm_tag");assert.equal(url.searchParams.get("radius"),"5");assert.equal(url.searchParams.get("lat"),"-33.897");
  if(calls===1){assert.ok(tags.includes("shop:bakery"));return Response.json({features:Array.from({length:50},(_,i)=>feature(i+1,`Nearby supermarket ${i}`))});}
  assert.deepEqual(tags,["shop:greengrocer","shop:butcher","shop:farm","amenity:marketplace"]);return Response.json({features:[feature(1,"Nearby supermarket 0"),feature(12200892725,"Feather & Bone","butcher",151.168471),feature(999,"Out of radius butcher","butcher",152)]});
 });
 const pending=provider.searchShopsWithFresh({lat:-33.897,lon:151.18,radiusKm:5});await flush();assert.equal(calls,1);t.mock.timers.tick(1200);const result=await pending;
 assert.equal(result.count,51);assert.equal(result.shops.filter(shop=>shop.id==="node/1").length,1);assert.equal(result.shops.some(shop=>shop.name==="Feather & Bone"),true);assert.equal(result.shops.some(shop=>shop.id==="node/999"),false);assert.equal(result.matchedCountIsLowerBound,true);assert.equal(result.truncated,true);assert.match(result.notice,/overlapping queries/);
 const cached=await provider.searchShopsWithFresh({lat:-33.897,lon:151.18,radiusKm:5});assert.equal(cached.cached,true);assert.equal(calls,2);
});
test("failed supplemental lookup retains the successful general list with a partial-coverage notice",async t=>{
 t.mock.timers.enable({apis:["Date","setTimeout"],now:0});const provider=await freshProviders("fallback");let calls=0;
 t.mock.method(globalThis,"fetch",async()=>++calls===1?Response.json({features:Array.from({length:50},(_,i)=>feature(i+1,`Shop ${i}`))}):new Response("Provider refused",{status:400}));
 const pending=provider.searchShopsWithFresh({lat:-33.897,lon:151.18,radiusKm:5});await flush();t.mock.timers.tick(1200);const result=await pending;assert.equal(result.count,50);assert.match(result.notice,/extra fresh-food search could not finish/);assert.equal(calls,2);
});
test("untruncated lists avoid an unnecessary second map request",async t=>{
 const provider=await freshProviders("short");let calls=0;t.mock.method(globalThis,"fetch",async()=>{calls++;return Response.json({features:[feature(1,"Known Butcher","butcher")]});});
 const result=await provider.searchShopsWithFresh({lat:-33.897,lon:151.18,radiusKm:5});assert.equal(calls,1);assert.equal(result.count,1);assert.equal(result.truncated,false);
});
