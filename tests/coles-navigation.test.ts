import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createColesBuildProvider, createColesNavigationReader, readColesBuildFile, saveColesBuildFile, validateColesBuildObservation, type ColesBuildObservation } from "../lib/coles-navigation.ts";
import { lookupColesQuery } from "../lib/coles-catalogue.ts";

const observation = (buildId = "fixture-current", observedAt = new Date().toISOString()): ColesBuildObservation => ({version:1,buildId,observedAt,sourceUrl:"https://www.coles.com.au/"});
const payload = (name = "Coles Jasmine Rice", price = 3.2) => ({ pageProps: { searchResults: { results: [{_type:"PRODUCT",id:8703004,name,description:name,brand:"Coles",size:"1kg",availability:true,availableQuantity:10,pricing:{now:price,was:9,unit:{price:.32,isWeighted:false}}}] } } });
const json = (value: unknown,status = 200,extra: Record<string,string> = {}) => new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json",...extra}});
const flush = () => new Promise(resolve => setImmediate(resolve));

test("navigation data coalesces public build discovery and keeps genuine Coles provenance",async () => {
  let discovery = 0, searches = 0;
  const fetchImpl: typeof fetch = async (input,init) => {
    const url = new URL(String(input));
    assert.equal(url.origin,"https://www.coles.com.au"); assert.equal(init?.redirect,"error");
    if (url.pathname === "/") { discovery++; return new Response('<script id="__NEXT_DATA__">{"buildId":"fixture-current"}</script>'); }
    searches++; assert.equal(url.pathname,"/_next/data/fixture-current/search/products.json"); return json(payload());
  };
  const navigation = createColesNavigationReader({fetchImpl,minimumIntervalMs:0});
  const renderer = async () => { throw new Error("A readable public data response does not need browser queries."); };
  const results = await Promise.all([lookupColesQuery("jasmine rice",fetchImpl,undefined,renderer,navigation),lookupColesQuery("jasmine rice",fetchImpl,undefined,renderer,navigation)]);
  assert.equal(discovery,1); assert.equal(searches,1); assert.equal(results[0].matches[0].priceCents,320);
  assert.equal(results[0].source,"coles-online-catalogue"); assert.equal(results[0].scope,"chain-online");
  assert.equal(results[0].fulfilmentStoreId,null); assert.equal(results[0].collectionMethod,"http");
  assert.equal((await lookupColesQuery("jasmine rice",fetchImpl,undefined,renderer,navigation)).cached,true);
});

test("one stale deployment causes one shared rediscovery before retrying the new version",async () => {
  let discoveries = 0; const urls: string[] = [];
  const navigation = createColesNavigationReader({minimumIntervalMs:0,buildProvider:async (_signal,request) => {
    discoveries++; if (discoveries > 1) assert.equal(request?.previousBuildId,"fixture-old"); return observation(discoveries === 1 ? "fixture-old" : "fixture-new");
  },fetchImpl:async input => { const url = String(input); urls.push(url); return url.includes("fixture-old") ? json({notFound:true},404) : json(payload()); }});
  const results = await Promise.all([navigation("rice"),navigation("tofu")]);
  assert.equal(discoveries,2); assert.equal(results.length,2);
  assert.ok(urls.filter(url => url.includes("fixture-old")).length <= 2);
  assert.equal(urls.filter(url => url.includes("fixture-new")).length,2);
});

test("an unchanged obsolete build is not requested repeatedly",async () => {
  let calls = 0, discoveries = 0;
  const navigation = createColesNavigationReader({minimumIntervalMs:0,buildProvider:async () => { discoveries++; return observation("fixture-old"); },fetchImpl:async () => { calls++; return json({notFound:true},404); }});
  await assert.rejects(navigation("rice"),/still refreshing/);
  await assert.rejects(navigation("tofu"),/still refreshing/);
  assert.equal(calls,1); assert.equal(discoveries,2);
});

test("HTML challenges are not mistaken for JSON and stop further data queries",async () => {
  let calls = 0;
  const navigation = createColesNavigationReader({minimumIntervalMs:0,buildProvider:async () => observation(),fetchImpl:async () => { calls++; return new Response('<meta name="robots" content="noindex">',{headers:{"Content-Type":"text/html"}}); }});
  await assert.rejects(navigation("rice"),/browser check/);
  await assert.rejects(navigation("tofu"),/pause/);
  assert.equal(calls,1);
});

test("429 Retry-After pauses all Coles queries for the requested period",async t => {
  t.mock.timers.enable({apis:["Date","setTimeout"],now:Date.now()});
  let calls = 0;
  const navigation = createColesNavigationReader({minimumIntervalMs:0,buildProvider:async () => observation(),fetchImpl:async () => { calls++; return json({},429,{"Retry-After":"120"}); }});
  await assert.rejects(navigation("rice"),/not returning/);
  t.mock.timers.tick(60_000); await assert.rejects(navigation("tofu"),/pause/); assert.equal(calls,1);
  t.mock.timers.tick(60_000); await assert.rejects(navigation("onion"),/not returning/); assert.equal(calls,2);
});

test("default fixed pacing separates requests and a cancelled waiting query makes no request",async t => {
  t.mock.timers.enable({apis:["Date","setTimeout"],now:Date.now()});
  let calls = 0;
  const navigation = createColesNavigationReader({buildProvider:async () => observation(),fetchImpl:async () => { calls++; return json(payload()); }});
  await navigation("rice");
  const second = navigation("onion"); await flush(); assert.equal(calls,1);
  t.mock.timers.tick(1499); await flush(); assert.equal(calls,1);
  t.mock.timers.tick(1); await second; assert.equal(calls,2);
  const abort = new AbortController(), waiting = navigation("tofu",abort.signal); await flush(); abort.abort();
  await assert.rejects(waiting,{name:"AbortError"});
  const healthy=navigation("carrot"); await flush(); t.mock.timers.tick(1499); await flush(); assert.equal(calls,2);
  t.mock.timers.tick(1); await healthy; assert.equal(calls,3);
});

test("metadata validates origin, timestamp, schema and deployment ID",() => {
  assert.equal(validateColesBuildObservation(observation()).buildId,"fixture-current");
  for (const value of [null,{},observation("../bad"),{...observation(),sourceUrl:"https://evil.example/"},observation("fixture",new Date(Date.now()-25*60*60_000).toISOString()),observation("fixture",new Date(Date.now()+10*60_000).toISOString())]) assert.throws(() => validateColesBuildObservation(value));
  for (const metadataUrl of ["https://www.coles.com.au/coles-build","http://10.1.1.111/coles-build","http://127.0.0.1:8794/render","http://127.0.0.1:8794/coles-build?secret=bad"]) assert.throws(() => createColesBuildProvider({metadataUrl}));
});

test("private normal-browser metadata is persisted atomically and a changed build refreshes the stored observation",async () => {
  const root = await mkdtemp(path.join(tmpdir(),"fusion-coles-build-")), file = path.join(root,"coles-build.json");
  try {
    let calls = 0;
    const provider = createColesBuildProvider({file,metadataUrl:"http://127.0.0.1:8794/coles-build",fetchImpl:async input => { calls++; assert.equal(String(input),"http://127.0.0.1:8794/coles-build"); return json(observation("fixture-new")); }});
    await saveColesBuildFile(file,observation("fixture-old"));
    assert.equal((await provider(new AbortController().signal)).buildId,"fixture-old"); assert.equal(calls,0);
    assert.equal((await provider(new AbortController().signal,{previousBuildId:"fixture-old"})).buildId,"fixture-new");
    assert.equal((await readColesBuildFile(file))?.buildId,"fixture-new"); assert.equal(calls,1);
    await writeFile(file,"x".repeat(4097)); assert.equal(await readColesBuildFile(file),null);
    assert.ok((await readFile(file,"utf8")).length>4096);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("uncooperative response and oversized body are bounded without fabricated products",async t => {
  t.mock.timers.enable({apis:["setTimeout"]}); let signal: AbortSignal | undefined;
  const navigation = createColesNavigationReader({minimumIntervalMs:0,buildProvider:async () => observation(),fetchImpl:async (_input,init) => { signal=init?.signal as AbortSignal; return new Promise<never>(() => {}); }});
  const waiting = navigation("rice"); await flush(); assert.ok(signal);
  t.mock.timers.tick(23999); assert.equal(signal.aborted,false);
  t.mock.timers.tick(1); await assert.rejects(waiting,{name:"TimeoutError"}); assert.equal(signal.aborted,true);
  let cancelled = false;
  const oversized = createColesNavigationReader({minimumIntervalMs:0,buildProvider:async () => observation(),fetchImpl:async () => new Response(new ReadableStream({start(controller) { controller.enqueue(new Uint8Array(3_000_001)); },cancel() { cancelled=true; }}),{headers:{"Content-Type":"application/json"}})});
  await assert.rejects(oversized("rice"),/limit/); assert.equal(cancelled,true);
});

test("an old deployment observation is only a candidate until fresh official JSON renews it",async () => {
  const root=await mkdtemp(path.join(tmpdir(),"fusion-coles-idle-")), file=path.join(root,"coles-build.json");
  try {
    await writeFile(file,JSON.stringify(observation("fixture-current",new Date(Date.now()-48*60*60_000).toISOString())));
    assert.equal(await readColesBuildFile(file),null);
    let calls=0;
    const navigation=createColesNavigationReader({file,minimumIntervalMs:0,fetchImpl:async input => {calls++;assert.match(String(input),/\/_next\/data\/fixture-current\//);return json(payload());}});
    assert.equal((await navigation("rice")).products[0].priceCents,320);assert.equal(calls,1);
    const renewed=await readColesBuildFile(file); assert.ok(renewed);assert.match(renewed.sourceUrl,/\/_next\/data\/fixture-current\//);
    assert.ok(Date.now()-Date.parse(renewed.observedAt)<5000);
  } finally {await rm(root,{recursive:true,force:true});}
});

test("late responses from a rejected old build cannot price a meal or overwrite the new metadata",async () => {
  const root=await mkdtemp(path.join(tmpdir(),"fusion-coles-late-")),file=path.join(root,"coles-build.json");
  try {
    let discoveries=0,release!:(value:Response)=>void;
    const navigation=createColesNavigationReader({file,minimumIntervalMs:0,buildProvider:async () => observation(++discoveries===1 ? "fixture-old" : "fixture-new"),fetchImpl:async input => {
      const url=new URL(String(input));
      if(url.pathname.includes("fixture-old")) return url.searchParams.get("q")==="rice" ? new Promise<Response>(resolve => {release=resolve;}) : json({notFound:true},404);
      return json(payload());
    }});
    const old=navigation("rice");await flush();assert.ok(release);
    const fresh=await navigation("tofu");release(json(payload("Retired price",.01)));
    assert.equal(fresh.products[0].priceCents,320);assert.equal((await old).products[0].priceCents,320);
    assert.equal((await readColesBuildFile(file))?.buildId,"fixture-new");
  } finally {await rm(root,{recursive:true,force:true});}
});
