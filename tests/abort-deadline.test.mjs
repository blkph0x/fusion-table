import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getEventListeners } from "node:events";
import { createDeadline, withDeadline } from "../lib/abort-deadline.mjs";

test("deadline forwards parent reasons and removes every parent listener",() => {
  const first = new AbortController(), second = new AbortController();
  const reason = new Error("Shopping cancelled");
  const scope = createDeadline(1000,[first.signal,undefined,second.signal]);
  assert.equal(getEventListeners(first.signal,"abort").length,1);
  assert.equal(getEventListeners(second.signal,"abort").length,1);
  second.abort(reason);
  assert.equal(scope.signal.reason,reason);
  assert.equal(getEventListeners(first.signal,"abort").length,0);
  assert.equal(getEventListeners(second.signal,"abort").length,0);
  scope.dispose();
});

test("deadline disposal clears timers without cancelling a completed operation",async () => {
  const parent = new AbortController(), scope = createDeadline(10,[parent.signal]);
  scope.dispose(); scope.dispose();
  await new Promise(resolve => setTimeout(resolve,30));
  assert.equal(scope.signal.aborted,false);
  assert.equal(getEventListeners(parent.signal,"abort").length,0);
  const result = await withDeadline(100,[parent.signal],async () => ({value:42}));
  assert.equal(result.value,42); assert.equal(getEventListeners(parent.signal,"abort").length,0);
});

test("withDeadline rejects standard timeouts and refuses late callbacks",async () => {
  const keeper = setTimeout(() => {},100);
  try {
    await assert.rejects(withDeadline(10,[],async () => new Promise(resolve => setTimeout(() => resolve("too late"),60))),error => error instanceof DOMException && error.name === "TimeoutError" && error.message === "The operation was aborted due to timeout");
    const parent = new AbortController(), reason = new Error("Already cancelled"); parent.abort(reason);
    let called = false;
    await assert.rejects(withDeadline(100,[parent.signal],async () => { called = true; }),error => error === reason);
    assert.equal(called,false);
  } finally { clearTimeout(keeper); }
});

test("worker queue deadlines survive forced GC and expire all outstanding readers at 150ms",async () => {
  const workerUrl = new URL("../scripts/retailer-browser.mjs",import.meta.url).href;
  const source = `
    import {startRetailerBrowser} from ${JSON.stringify(workerUrl)};
    const renderer={configured:true,connected:true,close:async()=>{},render:async(url,signal)=>{
      await new Promise(resolve=>{
        const timer=setTimeout(resolve,url.endsWith("q=1")?35:300);
        signal.addEventListener("abort",()=>{clearTimeout(timer);resolve();},{once:true});
      });
      return {html:"<main>Product $2</main>",url,status:200,providerStatus:"ready"};
    }};
    const worker=await startRetailerBrowser({port:0,renderer,deadlineMs:150});
    const store={id:"gc-test",name:"Lloyds IGA",area:"Newtown 2042",address:"259 King Street Newtown 2042"};
    const pressure=setInterval(()=>global.gc(),5),started=performance.now();
    try{
      const results=await Promise.all([1,2,3].map(async number=>{
        const response=await fetch("http://127.0.0.1:"+worker.port+"/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:"https://www.igashop.com.au/search?q="+number,store})});
        const body=await response.json();
        return {number,status:body.status,providerStatus:body.providerStatus,elapsed:Math.round(performance.now()-started)};
      }));
      console.log(JSON.stringify(results));
    }finally{clearInterval(pressure);await worker.close();}
  `;
  const {stdout} = await promisify(execFile)(process.execPath,["--expose-gc","--input-type=module","-e",source],{timeout:10_000,windowsHide:true});
  const results = JSON.parse(stdout.trim());
  assert.deepEqual(results.map(row => row.providerStatus),["ready","unavailable","unavailable"]);
  assert.deepEqual(results.map(row => row.status),[200,504,504]);
  assert.ok(results.every(row => row.elapsed < 1000),JSON.stringify(results));
});
