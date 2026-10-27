import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { request } from "node:http";
import { createServer as createTcpServer, connect } from "node:net";
import { mkdtemp, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { retailerUrl, publicHttpsUrl, publicAddress, pinnedPublicTarget, pageAction, createScheduler, storeContext, requestKey, renderTarget, navigationUrl, readablePriceContent, addressProof, sameStoreAddress, createVerifiedStoreSessions, verifiedStoreKey, colesEmptyBrowserGate } from "../scripts/retailer-browser-policy.mjs";
import { publicShopAddress } from "../lib/public-shop-reader.ts";
import { startEgressProxy, startRetailerBrowser } from "../scripts/retailer-browser.mjs";

test("entry URLs are restricted to official Australian retailer hosts and public HTTPS resources",() => {
  for (const host of ["www.coles.com.au","coles.com.au","www.aldi.com.au","www.igashop.com.au","www.iga.com.au","www.woolworths.com.au"]) {
    assert.match(retailerUrl(`https://${host}/search?q=rice#test`).url,/search\?q=rice$/);
  }
  for (const url of ["http://www.coles.com.au/","https://www.coles.com.au.evil.net/","https://evil.net/","https://login.coles.com.au/","https://127.0.0.1/","https://[::1]/","https://u:p@www.coles.com.au/","https://www.coles.com.au:444/","file:///etc/passwd","https://www.coles.com.au./"]) assert.throws(() => retailerUrl(url));
  assert.equal(publicHttpsUrl("https://cdn.retailer.net/code.js").hostname,"cdn.retailer.net");
  assert.throws(() => publicHttpsUrl("https://host.internal/"));
});

test("egress rejects reserved, private, mapped and transition addresses and matches the published-site reader",() => {
  const denied = ["0.0.0.0","10.1.1.111","127.0.0.1","169.254.169.254","172.16.0.1","172.31.255.255","192.168.1.1","100.64.0.1","100.127.255.255","192.0.0.1","192.0.2.1","192.88.99.2","198.18.0.1","198.19.255.1","198.51.100.4","203.0.113.4","224.0.0.1","255.255.255.255","::","::1","::ffff:127.0.0.1","::ffff:808:808","fe80::1","fc00::1","ff02::1","2001:db8::1","2001:20::1","2002:808:808::1","2001::1","2001:2::1","2001:3::1","2001:100::1","3fff::1","3ffe::1","fe80::1%eth0","invalid"];
  const allowed = ["8.8.8.8","1.1.1.1","104.18.12.1","172.32.0.1","2001:4860:4860::8888","2606:4700:4700::1111"];
  for (const value of denied) assert.equal(publicAddress(value),false,value);
  for (const value of allowed) assert.equal(publicAddress(value),true,value);
  for (const value of [...denied,...allowed]) assert.equal(publicAddress(value),publicShopAddress(value),value);
});

test("verified local-shop browsing stays on the shop's own public HTTPS host",() => {
  assert.equal(renderTarget("https://butcher.retailer.net/products","local-shop").retailer,"local:butcher.retailer.net");
  assert.equal(navigationUrl("https://www.butcher.net/beef","https://butcher.net/","local-shop"),"https://www.butcher.net/beef");
  assert.throws(() => navigationUrl("https://other-butcher.net/","https://butcher.net/","local-shop"));
  assert.throws(() => renderTarget("https://127.0.0.1/","local-shop"));
  assert.throws(() => renderTarget("https://butcher.net/","unknown"));
  assert.throws(() => navigationUrl("https://www.aldi.com.au/","https://www.coles.com.au/"));
});

test("DNS is rechecked for each CONNECT, refuses mixed private answers, and returns only a pinned literal IP",async () => {
  let calls = 0;
  const resolve = async hostname => { assert.equal(hostname,"cdn.retailer.net"); calls++; return [{address:calls === 1 ? "8.8.8.8" : "127.0.0.1",family:4}]; };
  assert.deepEqual(await pinnedPublicTarget("cdn.retailer.net:443",resolve),{host:"8.8.8.8",family:4,port:443});
  await assert.rejects(pinnedPublicTarget("cdn.retailer.net:443",resolve),/public addresses/);
  await assert.rejects(pinnedPublicTarget("cdn.retailer.net:443",async () => [{address:"8.8.8.8",family:4},{address:"10.0.0.1",family:4}]),/public addresses/);
  for (const authority of ["127.0.0.1:443","cdn.retailer.net:80","cdn.retailer.net:444","u:p@cdn.retailer.net:443","[::1]:443","cdn.retailer.net:443/path"]) await assert.rejects(pinnedPublicTarget(authority,resolve));
});

test("a human check is never refreshed; only an explicit cookies/JavaScript refresh instruction permits one refresh",() => {
  assert.equal(pageAction({text:"Please enable cookies and JavaScript and refresh this page"}),"refresh-once");
  assert.equal(pageAction({text:"Please refresh and verify you are human. Enable cookies."}),"needs-browser");
  assert.equal(pageAction({title:"Robot check",text:"Refresh your browser cookies"}),"needs-browser");
  assert.equal(pageAction({text:"Chicken breast $9.00. Refresh your weekly shopping inspiration."}),"ready");
  assert.equal(pageAction({status:403,text:""}),"needs-browser");
  assert.equal(pageAction({text:"Sign in to see prices"}),"needs-browser");
  assert.equal(pageAction({title:"Pardon Our Interruption",text:""}),"needs-browser");
  assert.equal(pageAction({text:"Main page\nPardon Our Interruption\nPlease verify you are a human"}),"needs-browser");
});

test("an empty or instruction-only retailer page cannot be reported as ready price content",() => {
  assert.equal(readablePriceContent({text:"",html:'<html><head><meta name="ROBOTS" content="NOINDEX"></head><body></body></html>'}),false);
  assert.equal(readablePriceContent({text:"Choose your shopping experience"}),false);
  assert.equal(readablePriceContent({text:"Rice 1 kg $3.50"}),true);
  assert.equal(readablePriceContent({text:"No products found"}),true);
  assert.equal(readablePriceContent({html:'<script type="application/ld+json">{"@type":"Product","offers":{"price":"12.50"}}</script>'}),true);
});

test("only the observed nearly-empty Coles NOINDEX response is classified as requiring a browser visit",() => {
  const html = '<html><meta name="ROBOTS" content="NOINDEX"><body></body></html>';
  assert.equal(colesEmptyBrowserGate({url:"https://www.coles.com.au/search?q=rice",html,text:""}),true);
  assert.equal(colesEmptyBrowserGate({url:"https://www.aldi.com.au/results?q=rice",html,text:""}),false);
  assert.equal(colesEmptyBrowserGate({url:"https://www.coles.com.au/search?q=rice",html:"<body></body>",text:""}),false);
  assert.equal(colesEmptyBrowserGate({url:"https://www.coles.com.au/search?q=rice",html,text:"Full product search content ".repeat(20)}),false);
});

test("IGA branch proof requires the same house, street name/type and postcode even if retailer names differ",() => {
  assert.equal(sameStoreAddress("259 King Street, Newtown, Sydney, 2042","259 King St Newtown NSW 2042"),true);
  for (const address of ["260 King St Newtown NSW 2042","259 King Road Newtown NSW 2042","259 Kings St Newtown NSW 2042","259 King St Newtown NSW 2048"]) assert.equal(sameStoreAddress("259 King Street, Newtown, 2042",address),false,address);
  assert.equal(sameStoreAddress("Newtown 2042","259 King St Newtown NSW 2042"),false);
  assert.equal(addressProof("1234 King Street, Newtown, 2042").postcode,"2042");
  assert.equal(sameStoreAddress("191-193 Enmore Road, Enmore, 2042","191 Enmore Rd Enmore NSW 2042"),false);
});

test("verified session keys isolate branch identities and addresses while retaining the same physical store across visitor areas",() => {
  const first = {id:"node/1",name:"Lloyds IGA",area:"Newtown 2042",address:"259 King Street, Newtown 2042"};
  assert.equal(verifiedStoreKey(first),verifiedStoreKey({...first,area:"Stanmore 2048"}));
  assert.notEqual(verifiedStoreKey(first),verifiedStoreKey({...first,id:"node/2"}));
  assert.notEqual(verifiedStoreKey(first),verifiedStoreKey({...first,address:"260 King Street, Newtown 2042"}));
  assert.notEqual(verifiedStoreKey({...first,address:""}),verifiedStoreKey({...first,address:"",area:"Stanmore 2048"}));
});

test("verified IGA session selection is coalesced and reused until idle expiry, with isolated branch contexts",async t => {
  let clock = 100, created = 0, closed = 0;
  const pool = createVerifiedStoreSessions({ttlMs:50,now:() => clock}); t.after(() => pool.close());
  let finish;
  const create = async () => { created++; await new Promise(resolve => { finish = resolve; }); return {id:created,close:async () => { closed++; }}; };
  const first = pool.acquire("store-one",create), second = pool.acquire("store-one",create);
  await Promise.resolve(); await Promise.resolve(); assert.equal(created,1);
  finish(); const [a,b] = await Promise.all([first,second]);
  assert.equal(a.value,b.value); a.release(); b.release();
  const warm = await pool.acquire("store-one",async () => { throw new Error("Selected twice"); });
  assert.equal(warm.value,a.value); warm.release(); assert.equal(closed,0);
  const other = await pool.acquire("store-two",async () => ({id:2,close:async () => { closed++; }}));
  assert.notEqual(other.value,a.value); other.release();
  clock += 51;
  const renewed = await pool.acquire("store-one",async () => ({id:3,close:async () => { closed++; }}));
  assert.notEqual(renewed.value,a.value); assert.equal(closed,2); renewed.release();
});

test("cancelling the first IGA selection reader retains another reader, and cancelling all closes unproven selection",async t => {
  const pool = createVerifiedStoreSessions(); t.after(() => pool.close());
  let finish, selectionSignal, created = 0;
  const create = async signal => {
    created++; selectionSignal = signal;
    await new Promise((resolve,reject) => { finish = resolve; signal.addEventListener("abort",() => reject(signal.reason),{once:true}); });
    return {close:async () => {}};
  };
  const firstController = new AbortController(), secondController = new AbortController();
  const first = pool.acquire("shared",create,firstController.signal), second = pool.acquire("shared",create,secondController.signal);
  await Promise.resolve(); await Promise.resolve();
  firstController.abort(new Error("first closed")); await assert.rejects(first,/first closed/);
  assert.equal(selectionSignal.aborted,false); finish();
  const lease = await second; assert.equal(created,1); lease.release();
  const thirdController = new AbortController(), fourthController = new AbortController();
  const third = pool.acquire("cancel-all",create,thirdController.signal), fourth = pool.acquire("cancel-all",create,fourthController.signal);
  await Promise.resolve(); await Promise.resolve();
  thirdController.abort(new Error("third closed")); fourthController.abort(new Error("fourth closed"));
  await Promise.all([assert.rejects(third,/third closed/),assert.rejects(fourth,/fourth closed/)]);
  assert.equal(selectionSignal.aborted,true);
});

test("the context bound evicts idle stores, preserves active queries, and rejects new contexts when all slots are leased",async t => {
  const pool = createVerifiedStoreSessions({maxSessions:2}); t.after(() => pool.close());
  const closed = [];
  const create = name => async () => ({name,close:async () => { closed.push(name); }});
  const a = await pool.acquire("a",create("a")), b = await pool.acquire("b",create("b"));
  await assert.rejects(pool.acquire("c",create("c")),/busy/);
  b.release(); const c = await pool.acquire("c",create("c"));
  assert.deepEqual(closed,["b"]); assert.equal(a.value.name,"a"); assert.equal(pool.size,2);
  a.invalidate(); assert.deepEqual(closed,["b"]);
  a.release(); await Promise.resolve(); assert.deepEqual(closed,["b","a"]); c.release();
});

test("scheduler enforces two active pages, bounded waiting, and removes cancelled queued work",async () => {
  const scheduler = createScheduler({concurrency:2,maxQueue:1});
  const release = [];
  const pending = () => new Promise(resolve => release.push(resolve));
  const first = scheduler.run(pending), second = scheduler.run(pending);
  await Promise.resolve();
  const controller = new AbortController();
  const third = scheduler.run(pending,controller.signal);
  assert.equal(scheduler.active,2); assert.equal(scheduler.queued,1);
  await assert.rejects(scheduler.run(pending),/busy/);
  controller.abort(new Error("Cancelled")); await assert.rejects(third,/Cancelled/);
  assert.equal(scheduler.queued,0);
  release.forEach(resolve => resolve("done")); await Promise.all([first,second]);
});

test("CONNECT proxy rejects private DNS before dialing and pins the accepted connection target",async t => {
  const echo = createTcpServer(socket => socket.pipe(socket));
  echo.listen(0,"127.0.0.1"); await once(echo,"listening");
  const dialled = [];
  const proxy = await startEgressProxy({
    resolve:async host => [{address:host === "private.retailer.net" ? "127.0.0.1" : "8.8.8.8",family:4}],
    dial:target => { dialled.push(target); return connect({host:"127.0.0.1",port:echo.address().port}); },
  });
  t.after(async () => { await proxy.close(); await new Promise(resolve => echo.close(resolve)); });
  const tunnel = authority => new Promise((resolve,reject) => {
    const req = request(proxy.url,{method:"CONNECT",path:authority});
    req.once("connect",(response,socket) => { socket.destroy(); resolve(response.statusCode); });
    req.once("error",reject); req.end();
  });
  assert.equal(await tunnel("private.retailer.net:443"),403); assert.equal(dialled.length,0);
  assert.equal(await tunnel("cdn.retailer.net:443"),200);
  assert.deepEqual(dialled,[{host:"8.8.8.8",family:4,port:443}]);
  const ordinary = await fetch(proxy.url); assert.equal(ordinary.status,405);
});

test("store context validation and cache identities keep separate IGA branches isolated",() => {
  const first = storeContext({id:"node/123",name:"Lloyds IGA Newtown",area:"Newtown NSW 2042",address:"259 King St",lat:-33.9,lon:151.1});
  assert.equal(first.id,"node/123");
  const url = "https://www.igashop.com.au/search?q=rice";
  assert.notEqual(requestKey(url,first),requestKey(url,{...first,id:"node/456"}));
  assert.notEqual(requestKey(url,first),requestKey(url));
  assert.throws(() => storeContext({id:"x",name:"IGA",area:"Newtown",lat:Infinity,lon:151}));
  assert.throws(() => storeContext({id:"x",name:"<script>",area:"Newtown"}));
});

test("HTTP service accepts server JSON only, deduplicates/cache results, and backs off a blocked retailer across ingredients",async t => {
  let calls = 0;
  const renderer = {configured:true,connected:true,close:async () => {},render:async (url,_signal,store) => {
    calls++;
    if (url.includes("blocked")) return {html:"",url,status:403,providerStatus:"needs-browser",message:"Open retailer"};
    return {html:`<div>${store?.name || "Rice"} $2.00</div>`,url,status:200,providerStatus:"ready"};
  }};
  const worker = await startRetailerBrowser({port:0,renderer}); t.after(() => worker.close());
  const base = `http://127.0.0.1:${worker.port}`;
  const post = (body,headers = {}) => fetch(base+"/render",{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body)});
  assert.equal((await (await fetch(base+"/health")).json()).browserConfigured,true);
  assert.equal((await post({url:"https://www.coles.com.au/search?q=rice"},{Origin:"https://evil.net"})).status,403);
  assert.equal((await post({url:"https://www.coles.com.au/"},{"Content-Type":"text/plain"})).status,415);
  assert.equal((await post({url:"http://127.0.0.1/"})).status,422);
  assert.equal(calls,0);
  const url = "https://www.coles.com.au/search?q=rice";
  const results = await Promise.all([post({url}),post({url})]);
  for (const response of results) assert.equal((await response.json()).providerStatus,"ready");
  assert.equal(calls,1); assert.equal((await (await post({url})).json()).cached,true);
  await post({url:"https://www.aldi.com.au/results?q=blocked"});
  const blocked = await (await post({url:"https://www.aldi.com.au/results?q=milk"})).json();
  assert.equal(blocked.providerStatus,"needs-browser"); assert.match(blocked.url,/q=milk$/); assert.ok(blocked.retryAfterSeconds > 0); assert.equal(calls,2);
  const store = {id:"node/1",name:"IGA First",area:"Newtown 2042"};
  await post({url:"https://www.igashop.com.au/search?q=rice",store});
  await post({url:"https://www.igashop.com.au/search?q=rice",store:{...store,id:"node/2",name:"IGA Second"}});
  assert.equal(calls,4);
  assert.equal((await post({url,store})).status,422);
  assert.equal((await post({url:"https://butcher.retailer.net/products",source:"local-shop"})).status,200);
  assert.equal(calls,5);
});

test("queued ingredients recheck provider backoff after an earlier browser refusal",async t => {
  const releases = new Map(); let colesCalls = 0;
  const renderer = {configured:true,connected:true,close:async () => { for (const release of releases.values()) release(); },render:async url => {
    if (url.includes("coles")) { colesCalls++; return {html:"",url,status:403,providerStatus:"needs-browser",message:"Open Coles"}; }
    await new Promise(resolve => releases.set(url,resolve));
    return {html:"<div>Rice $2</div>",url,status:200,providerStatus:"ready"};
  }};
  const worker = await startRetailerBrowser({port:0,renderer}); t.after(() => worker.close());
  const base = `http://127.0.0.1:${worker.port}`;
  const post = url => fetch(base+"/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})}).then(response => response.json());
  const waitHealth = async predicate => {
    for (let index = 0; index < 100; index++) { const health = await (await fetch(base+"/health")).json(); if (predicate(health)) return; await new Promise(resolve => setTimeout(resolve,5)); }
    assert.fail("Worker queue did not reach the expected state.");
  };
  const wooliesUrl = "https://www.woolworths.com.au/shop/search/products?searchTerm=rice";
  const aldiUrl = "https://www.aldi.com.au/results?q=rice";
  const first = post(wooliesUrl), second = post(aldiUrl);
  await waitHealth(health => health.active === 2);
  const third = post("https://www.coles.com.au/search?q=rice"), fourth = post("https://www.coles.com.au/search?q=chicken");
  await waitHealth(health => health.queued === 2);
  releases.get(wooliesUrl)();
  const [blocked,cached] = await Promise.all([third,fourth]);
  assert.equal(blocked.providerStatus,"needs-browser"); assert.equal(cached.providerStatus,"needs-browser");
  assert.equal(cached.cached,true); assert.equal(colesCalls,1);
  releases.get(aldiUrl)(); await Promise.all([first,second]);
});

test("HTTP response deadlines are bounded even if the browser has not finished shutting its page",async t => {
  let release;
  const renderer = {configured:true,connected:true,close:async () => release?.(),render:() => new Promise(resolve => { release = () => resolve({html:"",providerStatus:"unavailable"}); })};
  const worker = await startRetailerBrowser({port:0,renderer,deadlineMs:40}); t.after(() => worker.close());
  const response = await fetch(`http://127.0.0.1:${worker.port}/render`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:"https://www.coles.com.au/search?q=rice"})});
  const result = await response.json();
  assert.equal(result.status,504); assert.equal(result.providerStatus,"unavailable"); assert.match(result.message,/timed out/);
});

test("a symlinked release entry starts the service and responds to health",async t => {
  const directory = await mkdtemp(join(tmpdir(),"fusion-browser-entry-"));
  const project = fileURLToPath(new URL("../",import.meta.url));
  const linked = join(directory,"current");
  await symlink(project,linked,"junction");
  const child = spawn(process.execPath,[join(linked,"scripts","retailer-browser.mjs")],{env:{...process.env,RETAILER_BROWSER_PORT:"0"},stdio:["ignore","pipe","pipe"],windowsHide:true});
  let stderr = ""; child.stderr.on("data",chunk => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child,"exit"); }
    assert.equal(dirname(directory),tmpdir());
    await rm(directory,{recursive:true,force:true});
  });
  const port = await new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error(`Symlinked browser worker did not start: ${stderr}`)),8000);
    child.once("error",error => { clearTimeout(timer); reject(error); });
    child.once("exit",code => { clearTimeout(timer); reject(new Error(`Worker exited ${code} before listening: ${stderr}`)); });
    child.stdout.on("data",chunk => { const match = /127\.0\.0\.1:(\d+)/.exec(chunk.toString()); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
  });
  const result = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(result.ok,true); assert.equal(result.active,0);
});

test("HTTP cancellation preserves a shared survivor and aborts work only after its last subscriber leaves",async t => {
  const jobs = new Map(); let aborted = 0;
  const renderer = {configured:true,connected:true,close:async () => {},render:(url,signal) => new Promise(resolve => {
    jobs.set(url,{signal,resolve});
    signal.addEventListener("abort",() => { aborted++; resolve({html:"",url,status:499,providerStatus:"unavailable"}); },{once:true});
  })};
  const worker = await startRetailerBrowser({port:0,renderer}); t.after(() => worker.close());
  const base = `http://127.0.0.1:${worker.port}`;
  const open = url => {
    const req = request(base+"/render",{method:"POST",headers:{"Content-Type":"application/json"}});
    const result = new Promise((resolve,reject) => {
      req.once("response",response => { const chunks = []; response.on("data",chunk => chunks.push(chunk)); response.once("end",() => resolve(JSON.parse(Buffer.concat(chunks)))); });
      req.once("error",reject);
    });
    // Abandoned clients are intentionally rejected; attach a handler before cancellation.
    result.catch(() => undefined); req.end(JSON.stringify({url}));
    return {req,result};
  };
  const waitHealth = async predicate => {
    for (let index = 0; index < 100; index++) {
      const health = await (await fetch(base+"/health")).json();
      if (predicate(health)) return health;
      await new Promise(resolve => setTimeout(resolve,5));
    }
    assert.fail("Browser subscriptions did not reach the expected state.");
  };
  const url = "https://www.coles.com.au/search?q=survivor";
  const first = open(url), second = open(url);
  await waitHealth(health => health.subscribers === 2);
  first.req.destroy(new Error("First subscriber closed"));
  await waitHealth(health => health.subscribers === 1);
  assert.equal(aborted,0); assert.equal(jobs.get(url).signal.aborted,false);
  jobs.get(url).resolve({html:"<div>Rice $2</div>",url,status:200,providerStatus:"ready"});
  assert.equal((await second.result).providerStatus,"ready");
  const other = "https://www.coles.com.au/search?q=cancel-both";
  const third = open(other), fourth = open(other);
  await waitHealth(health => health.subscribers === 2);
  third.req.destroy(new Error("Third closed")); fourth.req.destroy(new Error("Fourth closed"));
  await waitHealth(health => health.active === 0 && health.subscribers === 0);
  assert.equal(aborted,1); assert.equal(jobs.get(other).signal.aborted,true);
  const activeOne = open("https://www.coles.com.au/search?q=active-one");
  const activeTwo = open("https://www.coles.com.au/search?q=active-two");
  await waitHealth(health => health.active === 2);
  const queuedUrl = "https://www.coles.com.au/search?q=cancel-queued", queued = open(queuedUrl);
  await waitHealth(health => health.queued === 1);
  queued.req.destroy(new Error("Queued reader closed"));
  await waitHealth(health => health.queued === 0);
  assert.equal(jobs.has(queuedUrl),false);
  activeOne.req.destroy(); activeTwo.req.destroy();
  await waitHealth(health => health.active === 0);
});
