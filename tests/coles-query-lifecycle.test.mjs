import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { createBrowserRenderer, settleColesQuery, startRetailerBrowser } from "../scripts/retailer-browser.mjs";
import { createPageRequestBudget } from "../scripts/retailer-browser-policy.mjs";

const executablePath = [process.env.RETAILER_CHROMIUM_PATH,"/usr/bin/chromium","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(path => path && existsSync(path));
const home = '<!doctype html><h1>Coles fixture</h1><script id="__NEXT_DATA__" type="application/json">{"buildId":"fixture-lifecycle"}</script>';
const cards = '<!doctype html><section data-testid="product-tile"><h2>Jasmine rice</h2><span data-testid="product-pricing">$3.20</span></section>';
const signal = () => new AbortController().signal;

test("a finite page allowance is not renewed by background, redirects or frames, only an intentional job start",() => {
  const budget = createPageRequestBudget(3),page = {},other = {};
  assert.equal(budget.take(page),true); assert.equal(budget.take(page),true); assert.equal(budget.take(page),true);
  for (let index=0;index<1000;index++) assert.equal(budget.take(page),false);
  assert.equal(budget.count(page),4,"blocked background work cannot grow bookkeeping indefinitely");
  assert.equal(budget.exhausted(page),true);
  assert.equal(budget.take(other),true,"another bounded page has its own allowance");
  budget.begin(page); assert.equal(budget.count(page),0); assert.equal(budget.take(page),true);
  assert.equal(budget.count(other),1,"renewal does not reset other pages");
});

test("replacing a closed Coles control page performs a real homepage navigation instead of inspecting about:blank",{skip:!executablePath},async () => {
  let context,homes=0;
  const renderer = createBrowserRenderer({executablePath,colesStateFile:"",onContext:async value => { context=value; },continueRequest:route => {
    assert.equal(new URL(route.request().url()).origin,"https://www.coles.com.au");
    homes++; return route.fulfill({status:200,contentType:"text/html",body:home});
  }});
  try {
    assert.equal((await renderer.colesBuild(signal())).buildId,"fixture-lifecycle");
    const first = context.pages()[0]; await first.close();
    assert.equal((await renderer.colesBuild(signal())).buildId,"fixture-lifecycle");
    assert.equal(homes,2); assert.notEqual(context.pages()[0],first); assert.equal(renderer.retainedControlPages,1);
  } finally { await renderer.close(); }
});

test("Coles queries navigate the same bounded tab and wait beyond four seconds for real hydration",{skip:!executablePath},async () => {
  let context,homes=0,queries=0; const pages=[];
  const renderer = createBrowserRenderer({executablePath,colesStateFile:"",onContext:async value => { context=value; value.on("page",page=>pages.push(page)); },continueRequest:route => {
    const url = new URL(route.request().url()); assert.equal(url.origin,"https://www.coles.com.au");
    if (url.pathname === "/") { homes++; return route.fulfill({status:200,contentType:"text/html",body:home}); }
    queries++;
    const delay = queries === 1 ? 5500 : 0;
    return route.fulfill({status:200,contentType:"text/html",body:`<!doctype html><meta name="robots" content="noindex"><body><script>setTimeout(()=>{document.body.innerHTML=${JSON.stringify(cards)}},${delay});</script></body>`});
  }});
  try {
    assert.equal((await renderer.colesBuild(signal())).buildId,"fixture-lifecycle");
    const retained = context.pages()[0];
    const result = await renderer.render("https://www.coles.com.au/search/products?q=rice",signal());
    assert.equal(result.providerStatus,"ready"); assert.match(result.html,/3\.20/);
    assert.equal((await renderer.render("https://www.coles.com.au/search/products?q=onion",signal())).providerStatus,"ready");
    assert.equal(context.pages().length,1); assert.equal(context.pages()[0],retained); assert.equal(pages.length,1);
    assert.equal(homes,1); assert.equal(queries,2); assert.equal(renderer.retainedControlPages,1);
  } finally { await renderer.close(); }
});

test("exhausted Coles request allowance is diagnostic, and the next intentional navigation gets a fresh finite budget",{skip:!executablePath},async () => {
  let context,homes=0,fulfilled=0;
  const renderer = createBrowserRenderer({executablePath,colesStateFile:"",onContext:async value => { context=value; },continueRequest:async route => {
    const url = new URL(route.request().url()); assert.equal(url.origin,"https://www.coles.com.au"); fulfilled++;
    if (url.pathname === "/") {
      homes++;
      return route.fulfill({status:200,contentType:"text/html",body:home+(homes===1?'<script>for(let i=0;i<540;i++)fetch("/fixture-background/"+i).catch(()=>{});</script>':"")});
    }
    return route.fulfill({status:200,contentType:"application/json",body:'{"fixture":true}'});
  }});
  try {
    await assert.rejects(renderer.colesBuild(signal()),error => error.providerStatus === "unavailable" && error.diagnostic?.reason === "network-request-limit");
    assert.ok(fulfilled<=512,"actual guarded browser traffic retains the original 512-request cap");
    const retained = context.pages()[0],before = fulfilled;
    await new Promise(resolve => setTimeout(resolve,100)); assert.equal(fulfilled,before,"idle bookkeeping causes no keepalive or refresh");
    assert.equal((await renderer.colesBuild(signal())).buildId,"fixture-lifecycle");
    assert.equal(homes,2); assert.equal(context.pages()[0],retained); assert.equal(context.pages().length,1);
  } finally { await renderer.close(); }
});

test("an empty query placeholder remains unavailable without a fake CAPTCHA classification or refusal backoff",{skip:!executablePath},async () => {
  const renderer = createBrowserRenderer({executablePath,colesStateFile:"",continueRequest:route => route.fulfill({status:200,contentType:"text/html",body:new URL(route.request().url()).pathname === "/" ? home : '<!doctype html><meta name="robots" content="noindex"><body></body>'})});
  const worker = await startRetailerBrowser({port:0,renderer});
  try {
    const result = await (await fetch(`http://127.0.0.1:${worker.port}/render`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url:"https://www.coles.com.au/search/products?q=fixture"})})).json();
    assert.equal(result.providerStatus,"unavailable"); assert.equal(result.status,503);
    assert.match(result.message,/No human check was established/);
    assert.equal(result.diagnostic.reason,"query-content-loading");
    const health = await (await fetch(`http://127.0.0.1:${worker.port}/health`)).json();
    assert.equal(health.backoffHosts,0); assert.equal(health.active,0); assert.equal(health.retainedControlPages,1);
  } finally { await worker.close(); }
});

test("a real visible human-check instruction remains a refusal with no automatic refresh",{skip:!executablePath},async () => {
  let queries=0;
  const renderer = createBrowserRenderer({executablePath,colesStateFile:"",continueRequest:route => {
    const isHome = new URL(route.request().url()).pathname === "/";
    if (!isHome) queries++;
    return route.fulfill({status:200,contentType:"text/html",body:isHome ? home : '<!doctype html><h1>Verify you are human</h1>'});
  }});
  try {
    const result = await renderer.render("https://www.coles.com.au/search/products?q=fixture",signal());
    assert.equal(result.providerStatus,"needs-browser"); assert.equal(queries,1); assert.equal(renderer.retainedControlPages,1);
  } finally { await renderer.close(); }
});

test("query hydration does not treat unfinished first-party requests as settled prices",async () => {
  const page = {waitForFunction:async()=>{},evaluate:async()=>({text:"Rice $3.20",title:"Products"})};
  assert.deepEqual(await settleColesQuery(page,async()=>{throw new Error("still fetching");},signal()),{settled:false,reason:"query-network-loading"});
});
