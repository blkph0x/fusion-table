import assert from "node:assert/strict";
import test from "node:test";
import {existsSync} from "node:fs";
import {createBrowserRenderer,startRetailerBrowser} from "../scripts/retailer-browser.mjs";

const executable=[process.env.RETAILER_CHROMIUM_PATH,"/usr/bin/chromium","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(path => path && existsSync(path));

test("ordinary Coles bootstrap refreshes once when requested and retains anonymous cookies across queries",{skip:!executable},async () => {
  let contexts=0,homes=0,queries=0;
  const renderer=createBrowserRenderer({executablePath:executable,onContext:async context => {
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
  const renderer=createBrowserRenderer({executablePath:executable,onContext:async context => {
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
  let aborted;
  const renderer={configured:true,connected:false,async close(){},async colesBuild(signal){aborted=signal;return new Promise(() => {});},async render(){throw new Error("unused");}};
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
