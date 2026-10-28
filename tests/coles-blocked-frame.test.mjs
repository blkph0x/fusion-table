import assert from "node:assert/strict";
import test from "node:test";
import {existsSync} from "node:fs";
import {createBrowserRenderer,settleColesQuery} from "../scripts/retailer-browser.mjs";

const executablePath=[process.env.RETAILER_CHROMIUM_PATH,"/usr/bin/chromium","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(value=>value&&existsSync(value));
const signal=()=>new AbortController().signal;
const home='<!doctype html><h1>Local fixture</h1><script id="__NEXT_DATA__" type="application/json">{"buildId":"fixture-blocked-protection-frame"}</script>';
const prices='<section data-testid="product-tile"><h2>Fixture rice</h2><span>$3.20</span></section>';
const frame='<iframe width="1365" height="900" src="https://www.coles.com.au/_Incapsula_Resource?fixture-sensitive-query=not-for-diagnostics"></iframe>';

test("a standalone protection frame blocked by default-src none fails promptly without claiming a CAPTCHA or exposing its query",{skip:!executablePath},async()=>{
 let context,queries=0,protectionRequests=0,scriptRequests=0;
 const renderer=createBrowserRenderer({executablePath,colesStateFile:"",onContext:async value=>{context=value;},continueRequest:route=>{
  const url=new URL(route.request().url());assert.equal(url.origin,"https://www.coles.com.au");
  if(url.pathname==="/")return route.fulfill({status:200,contentType:"text/html",body:home});
  if(url.pathname==="/search/products"){
   queries++;
   return route.fulfill({status:200,contentType:"text/html",headers:queries===1?{}:{"content-security-policy":"default-src 'none'"},body:queries===1?`<!doctype html>${prices}`:`<!doctype html><body>${frame}<script src="/fixture-protection-script"></script></body>`});
  }
  if(url.pathname==="/_Incapsula_Resource")protectionRequests++;
  if(url.pathname==="/fixture-protection-script")scriptRequests++;
  throw new Error("Unexpected fixture request");
 }});
 try{
  assert.equal((await renderer.render("https://www.coles.com.au/search/products?q=fixture-before",signal())).providerStatus,"ready");
  const page=context.pages()[0],started=Date.now();
  const result=await renderer.render("https://www.coles.com.au/search/products?q=fixture-after",signal());
  assert.equal(result.providerStatus,"unavailable");assert.equal(result.status,503);
  assert.deepEqual(result.diagnostic,{stage:"coles-query",reason:"retailer-protection-frame-blocked",directive:"default-src"});
  assert.ok(Date.now()-started<8000,"known frame blocking must not spend the ten-second hydration allowance");
  assert.match(result.message,/No human check was established/);
  assert.ok(!JSON.stringify(result).includes("fixture-sensitive-query"));
  assert.equal(queries,2,"no automatic refresh or extra navigation is permitted");
  assert.equal(protectionRequests,0);assert.equal(scriptRequests,0,"the browser's CSP remains enforced");
  assert.equal(context.pages()[0],page);assert.equal(renderer.retainedControlPages,1);
 }finally{await renderer.close();}
});

test("CSP frame fallback precedence is respected without labelling permitted, hidden or unrelated frames as a blocked protection page",{skip:!executablePath},async()=>{
 let context,fixture;
 const renderer=createBrowserRenderer({executablePath,colesStateFile:"",onContext:async value=>{context=value;},continueRequest:route=>{
  const url=new URL(route.request().url());assert.equal(url.origin,"https://www.coles.com.au");
  if(url.pathname==="/")return route.fulfill({status:200,contentType:"text/html",body:home});
  if(url.pathname==="/search/products")return route.fulfill({status:200,contentType:"text/html",headers:{"content-security-policy":fixture.policy},body:`<!doctype html><body>${fixture.body||frame}</body>`});
  if(url.pathname==="/_Incapsula_Resource"||url.pathname==="/ordinary-frame")return route.fulfill({status:200,contentType:"text/html",body:"<!doctype html><h1>Local frame fixture</h1>"});
  throw new Error("Unexpected fixture request");
 }});
 try{
  await renderer.colesBuild(signal());const page=context.pages()[0];
  for(const entry of [
   {policy:"default-src 'none'",reason:"retailer-protection-frame-blocked",directive:"default-src"},
   {policy:"default-src 'self'; child-src 'none'",reason:"retailer-protection-frame-blocked",directive:"child-src"},
   {policy:"default-src 'self'; child-src 'self'; frame-src 'none'",reason:"retailer-protection-frame-blocked",directive:"frame-src"},
   {policy:"default-src 'none'; child-src 'none'; frame-src 'self'",reason:"query-content-loading"},
   {policy:"default-src 'none'; frame-src 'none' 'self'",reason:"query-content-loading"},
   {policy:"default-src 'none'",body:frame.replace("<iframe ",'<iframe hidden '),reason:"query-content-loading"},
   {policy:"default-src 'none'",body:frame.replace("_Incapsula_Resource","ordinary-frame"),reason:"query-content-loading"},
   {policy:"default-src 'none'",body:"<h1>Verify you are human</h1>"+frame,reason:"needs-browser"},
   {policy:"default-src 'none'",body:prices+frame,ready:true},
  ]){
   fixture=entry;
   const response=await page.goto("https://www.coles.com.au/search/products?q=local-fixture",{waitUntil:"domcontentloaded"});
   const result=await settleColesQuery(page,async()=>{},signal(),{timeoutMs:300,cspHeaders:await response.headerValues("content-security-policy")});
   assert.deepEqual(result,entry.ready?{settled:true}:{settled:false,reason:entry.reason,...(entry.directive?{directive:entry.directive}:{})},entry.policy+" "+(entry.body||"default frame"));
  }
 }finally{await renderer.close();}
});

test("an enforced CSP meta policy can identify the same standalone blocked protection frame",{skip:!executablePath},async()=>{
 let context;
 const renderer=createBrowserRenderer({executablePath,colesStateFile:"",onContext:async value=>{context=value;},continueRequest:route=>{
  const url=new URL(route.request().url());assert.equal(url.origin,"https://www.coles.com.au");
  return route.fulfill({status:200,contentType:"text/html",body:url.pathname==="/"?home:`<!doctype html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'"></head><body>${frame}</body>`});
 }});
 try{
  await renderer.colesBuild(signal());const page=context.pages()[0];
  await page.goto("https://www.coles.com.au/search/products?q=meta-local-fixture",{waitUntil:"domcontentloaded"});
  assert.deepEqual(await settleColesQuery(page,async()=>{},signal(),{timeoutMs:1000}),{settled:false,reason:"retailer-protection-frame-blocked",directive:"default-src"});
 }finally{await renderer.close();}
});
