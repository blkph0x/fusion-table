import assert from "node:assert/strict";
import test from "node:test";
import {existsSync} from "node:fs";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {colesSessionLifetimeMs,createBrowserRenderer} from "../scripts/retailer-browser.mjs";
import {createVerifiedStoreSessions} from "../scripts/retailer-browser-policy.mjs";

const minute=60_000,hour=60*minute;
function lifecycleClock() {
  let elapsed=0;const timers=new Map();
  return {
    now:()=>elapsed,
    schedule:(fn,delay)=>{const token={unref(){}};timers.set(token,{at:elapsed+delay,fn});return token;},
    cancel:token=>timers.delete(token),
    advance(ms){elapsed+=ms;for(const[token,timer]of[...timers].sort((a,b)=>a[1].at-b[1].at)){if(timer.at<=elapsed&&timers.delete(token))timer.fn();}},
    get pending(){return timers.size;},
  };
}

test("persistent Coles lifetime defaults to eight hours and operator values stay between fifteen minutes and one day",()=>{
  assert.equal(colesSessionLifetimeMs(undefined,"24"),15*minute);
  assert.equal(colesSessionLifetimeMs("","8"),15*minute);
  for(const value of [undefined,"",0,-1,"invalid",Infinity]) assert.equal(colesSessionLifetimeMs("/private/state.json",value),8*hour);
  assert.equal(colesSessionLifetimeMs("/private/state.json","1.5"),1.5*hour);
  assert.equal(colesSessionLifetimeMs("/private/state.json","0.001"),15*minute);
  assert.equal(colesSessionLifetimeMs("/private/state.json","24"),24*hour);
  assert.equal(colesSessionLifetimeMs("/private/state.json","999999"),24*hour);
});

test("absolute context expiry closes once, waits for retirement and does not renew through ordinary use",async()=>{
  const clock=lifecycleClock(),pool=createVerifiedStoreSessions({maxSessions:1,ttlMs:8*hour,maxAgeMs:8*hour,...clock});
  let creates=0,closes=0,finishClose;
  const closeGate=new Promise(resolve=>{finishClose=resolve;});
  const create=async()=>({id:++creates,close:async()=>{closes++;if(creates===1)await closeGate;}});
  const first=await pool.acquire("coles",create);first.release();
  clock.advance(16*minute);
  const reused=await pool.acquire("coles",create);assert.equal(reused.value,first.value);reused.release();
  const active=await pool.acquire("coles",create);
  clock.advance(8*hour-16*minute);
  assert.equal(closes,1);assert.equal(pool.size,0);
  active.release();assert.equal(closes,1,"releasing an expired active lease must not close the same context twice");
  const next=pool.acquire("coles",create);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(creates,1,"new context must wait for the retiring context to finish closing");
  finishClose();const second=await next;assert.equal(creates,2);assert.notEqual(second.value,first.value);second.release();
  await pool.close();assert.equal(closes,2);assert.equal(clock.pending,0);
});

const executable=[process.env.RETAILER_CHROMIUM_PATH,"/usr/bin/chromium","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(path=>path&&existsSync(path));
test("the actual retained Coles context and control page survive simulated idle then close at the absolute cap and shutdown",{skip:!executable},async()=>{
  const directory=await mkdtemp(join(tmpdir(),"fusion-coles-lifetime-")),clock=lifecycleClock();
  const contexts=[];let homes=0,queries=0,closed=0;
  let firstClosed;
  const closedAtCap=new Promise(resolve=>{firstClosed=resolve;});
  const renderer=createBrowserRenderer({executablePath:executable,colesStateFile:join(directory,"state.json"),colesLifecycleClock:clock,onContext:async context=>{
    contexts.push(context);context.once("close",()=>{closed++;if(closed===1)firstClosed();});
    await context.route("**/*",async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!=="https://www.coles.com.au")return route.abort();
      if(url.pathname==="/"){
        homes++;
        return route.fulfill({status:200,contentType:"text/html",body:'<!doctype html><h1>Coles fixture</h1><script id="__NEXT_DATA__" type="application/json">{"buildId":"fixture-lifetime"}</script><script>document.cookie="coles-own-lifetime=ready; Path=/; Secure; Max-Age=86400";</script>'});
      }
      if(url.pathname==="/search/products"){
        queries++;assert.match((await request.allHeaders()).cookie||"",/coles-own-lifetime=ready/);
        return route.fulfill({status:200,contentType:"text/html",body:'<!doctype html><section data-testid="product-tile"><h2>Rice</h2><span data-testid="product-pricing">$3.20</span></section>'});
      }
      return route.abort();
    });
  }});
  try{
    const signal=new AbortController().signal;
    assert.equal((await renderer.colesBuild(signal)).buildId,"fixture-lifetime");
    assert.equal(renderer.retainedControlPages,1);
    clock.advance(16*minute);
    assert.equal(closed,0);assert.equal(renderer.retainedControlPages,1);assert.equal(homes,1);assert.equal(queries,0,"idle retention sends no background requests");
    assert.equal((await renderer.render("https://www.coles.com.au/search/products?q=rice",signal)).providerStatus,"ready");
    assert.equal(contexts.length,1);assert.equal(homes,1);assert.equal(queries,1);
    clock.advance(8*hour-16*minute);await closedAtCap;
    assert.equal(closed,1);assert.equal(renderer.retainedControlPages,0);
    assert.equal((await renderer.colesBuild(signal)).buildId,"fixture-lifetime");assert.equal(contexts.length,2);
    await renderer.close();assert.equal(closed,2);assert.equal(renderer.retainedControlPages,0);assert.equal(clock.pending,0);
  }finally{await renderer.close();await rm(directory,{recursive:true,force:true});}
});
