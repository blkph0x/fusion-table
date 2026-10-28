import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { startRetailerBrowser } from "../scripts/retailer-browser.mjs";

const wait = milliseconds => new Promise(resolve => setTimeout(resolve,milliseconds));
const post = (base,url) => fetch(`${base}/render`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url})});
const ready = {html:"<main>Rice $3.50</main>",providerStatus:"ready",status:200};

test("a hung cancelled render retains its slot and requires worker restart instead of creating ghost pages",async t => {
  const stalls = []; let calls = 0, finish;
  const renderer = {configured:true,connected:true,render:() => { calls++; return new Promise(resolve => { finish = resolve; }); },close:async () => finish?.(ready)};
  const worker = await startRetailerBrowser({port:0,renderer,deadlineMs:25,stalledJobGraceMs:25,onStalledJob:reason => stalls.push(reason)});
  t.after(() => worker.close());
  const base = `http://127.0.0.1:${worker.port}`;
  const response = await post(base,"https://www.aldi.com.au/results?q=rice");
  assert.equal((await response.json()).status,504);
  await wait(80);
  const status = await fetch(`${base}/health`), health = await status.json();
  assert.equal(status.status,503); assert.equal(health.ok,false); assert.equal(health.restartRequired,true);
  assert.equal(health.active,1,"raw browser work still owns its concurrency slot"); assert.equal(health.subscribers,0);
  assert.deepEqual(stalls,[{kind:"render",graceMs:25}]);
  const retry = await post(base,"https://www.aldi.com.au/results?q=chicken");
  assert.equal(retry.status,503); assert.equal(calls,1,"unhealthy reader does not start another browser page");
});

test("hung Coles metadata uses the same watchdog and cannot retain an undiagnosed active key",async t => {
  const stalls = []; let finish;
  const renderer = {configured:true,connected:true,colesBuild:() => new Promise(resolve => { finish = resolve; }),render:async () => { throw new Error("must not start"); },close:async () => finish?.({})};
  const worker = await startRetailerBrowser({port:0,renderer,deadlineMs:25,stalledJobGraceMs:25,onStalledJob:reason => stalls.push(reason)});
  t.after(() => worker.close());
  const base = `http://127.0.0.1:${worker.port}`;
  const response = await fetch(`${base}/coles-build`);
  assert.equal(response.status,504);
  await wait(80);
  const status = await fetch(`${base}/health`), health = await status.json();
  assert.equal(status.status,503); assert.equal(health.active,1); assert.equal(health.restartRequired,true);
  assert.deepEqual(stalls,[{kind:"coles-build",graceMs:25}]);
});

test("ordinary cancellation can finish cleanup during the grace without restarting healthy work",async t => {
  const stalls = []; let healthy = false;
  const renderer = {configured:true,connected:true,close:async () => {},render:(_url,signal) => healthy ? Promise.resolve(ready) : new Promise(resolve => signal.addEventListener("abort",() => setTimeout(() => resolve({providerStatus:"unavailable",status:504,html:""}),20),{once:true}))};
  const worker = await startRetailerBrowser({port:0,renderer,deadlineMs:25,stalledJobGraceMs:150,onStalledJob:reason => stalls.push(reason)});
  t.after(() => worker.close());
  const base = `http://127.0.0.1:${worker.port}`;
  assert.equal((await (await post(base,"https://www.aldi.com.au/results?q=rice")).json()).status,504);
  await wait(190);
  const status = await fetch(`${base}/health`), health = await status.json();
  assert.equal(status.status,200); assert.equal(health.active,0); assert.equal(health.restartRequired,false); assert.deepEqual(stalls,[]);
  healthy = true;
  assert.equal((await (await post(base,"https://www.aldi.com.au/results?q=chicken")).json()).providerStatus,"ready");
});

test("a normally returned retailer challenge is a bounded result, not a reason to restart or solve it",async t => {
  const stalls = [];
  const renderer = {configured:true,connected:true,close:async () => {},render:async () => ({html:"",providerStatus:"needs-browser",status:403,message:"Human verification required"})};
  const worker = await startRetailerBrowser({port:0,renderer,deadlineMs:25,stalledJobGraceMs:25,onStalledJob:reason => stalls.push(reason)});
  t.after(() => worker.close());
  const base = `http://127.0.0.1:${worker.port}`;
  assert.equal((await (await post(base,"https://www.coles.com.au/search/products?q=rice")).json()).providerStatus,"needs-browser");
  await wait(80);
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.ok,true); assert.equal(health.active,0); assert.equal(health.backoffHosts,1); assert.deepEqual(stalls,[]);
});

test("the default containment exits only its own hung worker with failure for the service supervisor",async () => {
  const moduleUrl = new URL("../scripts/retailer-browser.mjs",import.meta.url).href;
  const source = `import {startRetailerBrowser} from ${JSON.stringify(moduleUrl)};
const renderer={configured:true,connected:true,render:()=>new Promise(()=>{}),close:async()=>{}};
const worker=await startRetailerBrowser({port:0,renderer,deadlineMs:25,stalledJobGraceMs:25});
const response=await fetch('http://127.0.0.1:'+worker.port+'/render',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://www.aldi.com.au/results?q=rice'})});
console.log('timeout-response-status='+ (await response.json()).status);
`;
  const child = spawn(process.execPath,["--input-type=module","-e",source],{stdio:["ignore","pipe","pipe"],windowsHide:true});
  let stdout = "",stderr = "";
  child.stdout.on("data",chunk => { stdout += chunk; }); child.stderr.on("data",chunk => { stderr += chunk; });
  const timeout = setTimeout(() => child.kill(),5000);
  try {
    const [code,signal] = await once(child,"close");
    assert.equal(signal,null); assert.equal(code,1);
    assert.match(stdout,/timeout-response-status=504/);
    assert.match(stderr,/cancellation did not finish; stopping this worker for supervisor restart/);
    assert.doesNotMatch(stderr,/aldi\.com|rice/);
  } finally { clearTimeout(timeout); }
});
