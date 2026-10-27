import assert from "node:assert/strict";
import { test } from "node:test";
import { enrichShopWebsites } from "../lib/shop-website-discovery.ts";
import type { Shop } from "../lib/locations.ts";
const shop=(changes:Partial<Shop>={}):Shop=>({id:"node/12200892725",name:"Feather & Bone",kind:"butcher",shopType:"butcher",lat:-33.9093979,lon:151.168471,distanceKm:1.5,address:null,website:null,phone:null,openingHours:null,osmUrl:"https://www.openstreetmap.org/node/12200892725",inventoryStatus:"unverified",...changes});
const row=(changes:Record<string,unknown>={})=>({type:"node",id:12200892725,lat:-33.9093979,lon:151.168471,tags:{name:"Feather & Bone",shop:"butcher",website:"https://featherandbone.com.au/","addr:housenumber":"10-14","addr:street":"Lilian Fowler Place"},...changes});
test("trusted exact OSM IDs restore official websites omitted by Photon and are cached",async()=>{
 let calls=0;const fetcher=(async(input:RequestInfo|URL,init?:RequestInit)=>{calls++;const url=new URL(String(input));assert.equal(url.origin,"https://api.openstreetmap.org");assert.equal(url.searchParams.get("nodes"),"12200892725");assert.equal(init?.redirect,"manual");assert.equal(new Headers(init?.headers).has("cookie"),false);return Response.json({elements:[row()]});}) as typeof fetch;
 const first=await enrichShopWebsites([shop()],{fetch:fetcher});assert.equal(first[0].website,"https://featherandbone.com.au/");assert.equal(first[0].address,"10-14 Lilian Fowler Place");assert.equal(first[0].name,"Feather & Bone");await enrichShopWebsites([shop()],{fetch:fetcher});assert.equal(calls,1);
});
test("different identities, names, shop categories or moved coordinates do not enrich a nearby shop",async()=>{
 for(const changed of [{id:999},{tags:{name:"Other branch",shop:"butcher",website:"https://wrong.com/"}},{tags:{name:"Feather & Bone",shop:"greengrocer",website:"https://wrong.com/"}},{lat:-37.8},{lon:144.9}]){
  const result=await enrichShopWebsites([shop()],{fetch:async()=>Response.json({elements:[row(changed)]})});assert.equal(result[0].website,null);
 }
});
test("invalid/client-shaped IDs and already-known sites are not sent to OSM",async()=>{
 let calls=0;const result=await enrichShopWebsites([shop({id:"node/1);out;"}),shop({id:"node/-1"}),shop({id:"unknown/123"}),shop({website:"https://already.example.org/"})],{fetch:async()=>{calls++;throw new Error("should not fetch");}});assert.equal(calls,0);assert.equal(result[3].website,"https://already.example.org/");
});
test("each element type gets one fixed official batch and the twelve-shop limit is enforced",async()=>{
 const calls:URL[]=[];const fetcher=(async(input:RequestInfo|URL)=>{calls.push(new URL(String(input)));return Response.json({elements:[]});}) as typeof fetch;
 await enrichShopWebsites(Array.from({length:20},(_,i)=>shop({id:`${["node","way","relation"][i%3]}/${i+1}`})),{fetch:fetcher});assert.equal(calls.length,3);assert.equal(calls.reduce((sum,url)=>sum+[...url.searchParams.values()][0].split(",").length,0),12);assert.ok(calls.every(url=>url.origin==="https://api.openstreetmap.org"));
});
test("nonpublic website links, redirects and oversized responses are not trusted metadata",async()=>{
 for(const website of ["javascript:alert(1)","https://127.0.0.1/","https://[::1]/","http://private.local/","https://u:p@public.example.org/","http://public.example.org:8888/"]){const unsafe=await enrichShopWebsites([shop()],{fetch:async()=>Response.json({elements:[row({tags:{name:"Feather & Bone",shop:"butcher",website}})]})});assert.equal(unsafe[0].website,null);}
 await assert.rejects(()=>enrichShopWebsites([shop()],{fetch:async()=>new Response(null,{status:302,headers:{location:"https://other.example.org/"}})}),/unavailable/);
 await assert.rejects(()=>enrichShopWebsites([shop()],{fetch:async()=>new Response("x".repeat(600_001),{headers:{"content-type":"application/json"}})}),/reading limit/);
});
test("cancelling the only subscriber aborts website enrichment promptly",async()=>{
 const controller=new AbortController();let ready!:()=>void;const begun=new Promise<void>(resolve=>{ready=resolve;});let stopped=false;
 const task=enrichShopWebsites([shop()],{fetch:async(_url,init)=>new Promise((_resolve,reject)=>{ready();init?.signal?.addEventListener("abort",()=>{stopped=true;reject(init.signal?.reason);},{once:true});})},controller.signal);await begun;controller.abort();await assert.rejects(task,{name:"AbortError"});assert.equal(stopped,true);
});
