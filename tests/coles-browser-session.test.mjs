import assert from "node:assert/strict";
import test from "node:test";
import {existsSync} from "node:fs";
import {mkdtemp,mkdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createBrowserRenderer,startRetailerBrowser} from "../scripts/retailer-browser.mjs";
import {readColesBrowserState} from "../lib/coles-browser-state.mjs";

const executable=[process.env.RETAILER_CHROMIUM_PATH,"/usr/bin/chromium","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(path => path && existsSync(path));

test("a fresh Coles context reuses only its own persisted first-party fixture session",{skip:!executable},async () => {
  const directory=await mkdtemp(join(tmpdir(),"fusion-coles-state-")),file=join(directory,"state.json");
  let generation=0,homes=0,queries=0,otherContexts=0;
  const fixture=async context => {
    const initial=await context.cookies();
    if(generation===2) assert.ok(initial.some(cookie=>cookie.name==="coles-own-home"),"the second browser loads its own saved state before navigation");
    await context.route("**/*",async route => {
      const request=route.request(),url=new URL(request.url());
      if(url.origin==="https://www.aldi.com.au") {
        otherContexts++;assert.equal(initial.some(cookie=>cookie.domain.includes("coles.com.au")),false,"Coles state must not leak to another retailer context");
        return route.fulfill({status:200,contentType:"text/html",body:'<!doctype html><h1>Other retailer</h1><p>$4.50</p>'});
      }
      if(url.origin!=="https://www.coles.com.au") return route.abort();
      const cookie=(await request.allHeaders()).cookie || "";
      if(url.pathname==="/") {
        homes++;
        if(generation===2) assert.match(cookie,/coles-own-home=ready/);
        return route.fulfill({status:200,contentType:"text/html",body:'<!doctype html><h1>Coles fixture</h1><script id="__NEXT_DATA__" type="application/json">{"buildId":"fixture-own-state"}</script><script>document.cookie="coles-own-home=ready; Path=/; Secure; SameSite=Lax; Max-Age=3600";localStorage.setItem("fixture-own-origin","ready");</script>'});
      }
      if(url.pathname==="/search/products") {
        queries++;assert.match(cookie,/coles-own-home=ready/);
        if(generation===2) assert.match(cookie,/coles-own-product=ready/);
        return route.fulfill({status:200,contentType:"text/html",body:'<!doctype html><section data-testid="product-tile"><h2>Jasmine rice</h2><span data-testid="product-pricing">$3.20</span></section><script>document.cookie="coles-own-product=ready; Path=/; Secure; SameSite=Lax; Max-Age=3600";</script>'});
      }
      return route.abort();
    });
  };
  const signal=new AbortController().signal;
  let renderer;
  try {
    generation=1;renderer=createBrowserRenderer({executablePath:executable,colesStateFile:file,onContext:fixture});
    assert.equal((await renderer.colesBuild(signal)).buildId,"fixture-own-state");
    assert.ok((await readColesBrowserState(file)).cookies.some(cookie=>cookie.name==="coles-own-home"));
    assert.equal((await renderer.render("https://www.coles.com.au/search/products?q=rice",signal)).providerStatus,"ready");
    assert.ok((await readColesBrowserState(file)).cookies.some(cookie=>cookie.name==="coles-own-product"),"a verified product page updates saved state");
    await renderer.close();renderer=undefined;
    generation=2;renderer=createBrowserRenderer({executablePath:executable,colesStateFile:file,onContext:fixture});
    assert.equal((await renderer.render("https://www.coles.com.au/search/products?q=rice",signal)).providerStatus,"ready");
    const state=await readColesBrowserState(file);
    assert.ok(state.origins.some(origin=>origin.origin==="https://www.coles.com.au"&&origin.localStorage.some(item=>item.name==="fixture-own-origin")));
    generation=3;
    assert.equal((await renderer.render("https://www.aldi.com.au/search?q=fixture",signal)).providerStatus,"ready");
    assert.equal(homes,2);assert.equal(queries,2);assert.equal(otherContexts,1);
  } finally {await renderer?.close();await rm(directory,{recursive:true,force:true});}
});

test("an unverified browser-check page never persists its fixture cookies",{skip:!executable},async () => {
  const directory=await mkdtemp(join(tmpdir(),"fusion-coles-refused-")),file=join(directory,"state.json");
  const renderer=createBrowserRenderer({executablePath:executable,colesStateFile:file,onContext:async context=>{
    await context.route("**/*",route=>route.fulfill({status:200,contentType:"text/html",body:'<!doctype html><h1>Verify you are human</h1><script>document.cookie="unverified-fixture=true; Path=/; Secure; Max-Age=3600";</script>'}));
  }});
  try {
    await assert.rejects(renderer.colesBuild(new AbortController().signal),error=>error.providerStatus==="needs-browser");
    assert.equal(await readColesBrowserState(file),undefined);assert.equal(existsSync(file),false);
  } finally {await renderer.close();await rm(directory,{recursive:true,force:true});}
});

test("private state write failures do not discard verified Coles metadata or prices",{skip:!executable},async () => {
  const directory=await mkdtemp(join(tmpdir(),"fusion-coles-write-failure-")),file=join(directory,"existing-directory");
  await mkdir(file);
  const renderer=createBrowserRenderer({executablePath:executable,colesStateFile:file,onContext:async context=>{
    await context.route("**/*",route=>route.fulfill({status:200,contentType:"text/html",body:new URL(route.request().url()).pathname==="/"
      ? '<!doctype html><h1>Coles fixture</h1><script id="__NEXT_DATA__" type="application/json">{"buildId":"fixture-no-state-write"}</script><script>document.cookie="coles-own-write-fixture=ready; Path=/; Secure; Max-Age=3600";</script>'
      : '<!doctype html><section data-testid="product-tile"><h2>Rice</h2><span data-testid="product-pricing">$3.20</span></section>'}));
  }});
  try {
    const signal=new AbortController().signal;
    assert.equal((await renderer.colesBuild(signal)).buildId,"fixture-no-state-write");
    assert.equal((await renderer.render("https://www.coles.com.au/search/products?q=rice",signal)).providerStatus,"ready");
  } finally {await renderer.close();await rm(directory,{recursive:true,force:true});}
});

test("ordinary Coles bootstrap refreshes once when requested and retains anonymous cookies across queries",{skip:!executable},async () => {
  let contexts=0,homes=0,queries=0;
  const renderer=createBrowserRenderer({executablePath:executable,colesStateFile:"",onContext:async context => {
    contexts++;
    await context.route("**/*",async route => {
      const request=route.request(),url=new URL(request.url());
      if(url.origin!=="https://www.coles.com.au") return route.abort();
      const cookies=(await request.allHeaders()).cookie || "";
      if(url.pathname==="/") {
        homes++;
        return route.fulfill({status:200,contentType:"text/html",body:cookies.includes("coles-fixture=ready")
          ? '<!doctype html><h1>Coles</h1><script id="__NEXT_DATA__" type="application/json">{"buildId":"fixture-current"}</script>'
          : '<!doctype html><h1>Enable JavaScript and cookies, then refresh this page</h1><script>document.cookie="coles-fixture=ready; Path=/; Secure; SameSite=Lax";</script>'});
      }
      if(url.pathname==="/search/products") {
        queries++;assert.match(cookies,/coles-fixture=ready/);
        return route.fulfill({status:200,contentType:"text/html",body:'<!doctype html><section data-testid="product-tile"><h2>Jasmine rice</h2><span data-testid="product-pricing">$3.20</span></section>'});
      }
      return route.abort();
    });
  }});
  try {
    const signal=new AbortController().signal;
    const observation=await renderer.colesBuild(signal);assert.equal(observation.buildId,"fixture-current");
    assert.equal(observation.sourceUrl,"https://www.coles.com.au/");
    assert.equal((await renderer.render("https://www.coles.com.au/search/products?q=rice",signal)).providerStatus,"ready");
    assert.equal((await renderer.render("https://www.coles.com.au/search/products?q=onion",signal)).providerStatus,"ready");
    assert.equal(contexts,1);assert.equal(homes,2);assert.equal(queries,2);
  } finally {await renderer.close();}
});

test("SSR build metadata waits for asynchronous cookie initialisation and retains its control tab",{skip:!executable},async () => {
  let homes=0,completed=0,current="fixture-current";
  const renderer=createBrowserRenderer({executablePath:executable,colesStateFile:"",onContext:async context => {
    await context.route("**/*",async route => {
      const request=route.request(),url=new URL(request.url());
      if(url.origin!=="https://www.coles.com.au") return route.abort();
      const cookie=(await request.allHeaders()).cookie || "";
      if(url.pathname==="/bootstrap-cookie") {
        await new Promise(resolve => setTimeout(resolve,750));
        return route.fulfill({status:200,contentType:"application/json",body:'{"ready":true}'}).catch(() => undefined);
      }
      if(url.pathname==="/") {
        homes++;
        if(homes>1 && !cookie.includes("coles-async=ready")) return route.fulfill({status:200,contentType:"text/html",body:"<h1>Verify you are human</h1>"});
        return route.fulfill({status:200,contentType:"text/html",body:`<!doctype html><h1>Coles homepage</h1><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({buildId:current})}</script>${homes===1 ? '<script>fetch("/bootstrap-cookie").then(r=>r.json()).then(()=>{document.cookie="coles-async=ready; Path=/; Secure; SameSite=Lax";});</script>' : ''}`});
      }
      return route.abort();
    });
    context.on("requestfinished",request => {if(new URL(request.url()).pathname==="/bootstrap-cookie")completed++;});
  }});
  try {
    const signal=new AbortController().signal;
    assert.equal((await renderer.colesBuild(signal)).buildId,"fixture-current");
    assert.equal(completed,1);assert.equal(renderer.retainedControlPages,1);
    assert.equal((await renderer.colesBuild(signal)).buildId,"fixture-current");assert.equal(homes,1);
    current="fixture-next";
    assert.equal((await renderer.colesBuild(signal,"fixture-current")).buildId,"fixture-next");assert.equal(homes,2);
  } finally {await renderer.close();assert.equal(renderer.retainedControlPages,0);}
});

test("Coles metadata shares the bounded private scheduler and browser-check backoff",async () => {
  let calls=0;
  const renderer={configured:true,connected:false,async close(){},async colesBuild(){calls++;throw Object.assign(new Error("Verify you are human"),{providerStatus:"needs-browser",status:403});},async render(){throw new Error("A cached browser barrier must stop queued page checks.");}};
  const worker=await startRetailerBrowser({port:0,renderer});
  try {
    const base=`http://127.0.0.1:${worker.port}`;
    const refused=await fetch(base+"/coles-build",{headers:{Origin:"https://attacker.invalid"}});assert.equal(refused.status,403);assert.equal(calls,0);
    const first=await fetch(base+"/coles-build"),second=await fetch(base+"/coles-build");
    assert.equal(first.status,403);assert.equal(second.status,403);assert.equal(calls,1);
    const page=await fetch(base+"/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:"https://www.coles.com.au/search/products?q=rice"})});
    const result=await page.json();assert.equal(result.providerStatus,"needs-browser");assert.equal(result.html,"");assert.equal(result.status,403);
  } finally {await worker.close();}
});

test("an uncooperative Coles metadata reader cannot outlive its explicit request budget",async () => {
  let aborted,finish;
  const renderer={configured:true,connected:false,async close(){finish?.({});},async colesBuild(signal){aborted=signal;return new Promise(resolve => {finish=resolve;});},async render(){throw new Error("unused");}};
  const worker=await startRetailerBrowser({port:0,renderer,deadlineMs:30});
  try {
    const response=await fetch(`http://127.0.0.1:${worker.port}/coles-build`);
    assert.equal(response.status,504);assert.equal(aborted.aborted,true);assert.equal((await response.json()).providerStatus,"unavailable");
  } finally {await worker.close();}
});

test("private metadata refresh forwards a validated previous deployment ID",async () => {
  let previous,calls=0;
  const renderer={configured:true,connected:false,async close(){},async colesBuild(_signal,value){calls++;previous=value;return {version:1,buildId:"fixture-current",observedAt:new Date().toISOString(),sourceUrl:"https://www.coles.com.au/"};},async render(){throw new Error("unused");}};
  const worker=await startRetailerBrowser({port:0,renderer});
  try {
    const url=`http://127.0.0.1:${worker.port}/coles-build`;
    assert.equal((await fetch(url,{headers:{"X-Fusion-Coles-Previous-Build":"fixture-old"}})).status,200);assert.equal(previous,"fixture-old");
    assert.equal((await fetch(url,{headers:{"X-Fusion-Coles-Previous-Build":"../bad"}})).status,422);assert.equal(calls,1);
  } finally {await worker.close();}
});
