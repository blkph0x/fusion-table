/** Anonymous ordinary-browser price reader. Run as a dedicated unprivileged user. */
import { createServer } from "node:http";
import { connect } from "node:net";
import { lookup } from "node:dns/promises";
import { existsSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  PAGE_LIMIT, JOB_DEADLINE_MS, CACHE_TTL_MS, CHALLENGE_BACKOFF_MS,
  retailerUrl, publicHttpsUrl, pinnedPublicTarget, pageAction, createScheduler, storeContext, requestKey, renderTarget, navigationUrl, readablePriceContent, addressProof, sameStoreAddress, createVerifiedStoreSessions, verifiedStoreKey, colesEmptyBrowserGate, readableLocalDiscovery,
} from "./retailer-browser-policy.mjs";

const loopback = address => address === "127.0.0.1" || address === "::ffff:127.0.0.1";
const MAX_PAGE_REQUESTS = 512;
const controlled = (url,providerStatus,message,status = 503,extra = {}) => ({ html:"",url,status,providerStatus,message,...extra });
const safeMessage = value => String(value || "The retailer could not be read.").replace(/[\u0000-\u001f]/g," ").slice(0,400);
const normalized = value => String(value || "").normalize("NFKC").toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g," ").trim();

async function igaHeaderMatches(page,name) {
  const labels = await page.locator('[data-test-id="header-store-select"]:visible strong').allTextContents();
  return labels.length > 0 && normalized(labels.at(-1)) === normalized(name);
}

/** Track new query requests rather than relying on an earlier document-idle event. */
export function watchPageNetwork(page) {
  const pending = new Set(); let lastActivity = Date.now();
  page.on("request",request => {
    if (request.resourceType() === "eventsource") return;
    // Advertising/analytics requests do not publish the selected branch's prices.
    // They still load normally; only the product-readiness timer ignores them.
    if (typeof request.url === "function") {
      const host = new URL(request.url()).hostname;
      if (/(?:^|\.)(?:google\.com|google-analytics\.com|googletagmanager\.com|doubleclick\.net)$/.test(host)) return;
    }
    pending.add(request); lastActivity = Date.now();
  });
  const finished = request => { if (pending.delete(request)) lastActivity = Date.now(); };
  page.on("requestfinished",finished); page.on("requestfailed",finished);
  return {
    quiet({timeoutMs = 5000,quietMs = 500} = {}) {
      const started = Date.now();
      return new Promise((resolve,reject) => {
        let timer;
        const cleanup = () => { clearTimeout(timer); page.removeListener("close",closed); };
        const closed = () => { cleanup(); reject(new Error("The query page closed before its prices settled.")); };
        const poll = () => {
          const now = Date.now();
          if (!pending.size && now-Math.max(lastActivity,started) >= quietMs) { cleanup(); resolve(); return; }
          if (now-started >= timeoutMs) { cleanup(); reject(new Error("The branch product prices are still loading.")); return; }
          timer = setTimeout(poll,25);
        };
        page.once("close",closed); poll();
      });
    },
  };
}

export async function settleVerifiedIgaQuery(page,name,waitForQuiet) {
  try {
    await page.waitForFunction(expected => {
      const labels = [...document.querySelectorAll('[data-test-id="header-store-select"] strong')]
        .filter(node => node.getBoundingClientRect().height > 0).map(node => node.textContent);
      const clean = value => String(value || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
      return clean(labels.at(-1)) === clean(expected);
    },name,{timeout:4000});
  } catch { return {ready:false,reason:"selected-header-pending",wrongBranch:false}; }
  try { await waitForQuiet(); }
  catch { return {ready:false,reason:"branch-prices-loading",wrongBranch:false}; }
  if (!await igaHeaderMatches(page,name)) return {ready:false,reason:"selected-header-changed",wrongBranch:true};
  return {ready:true};
}

/** Only normal visible store-choice controls; uncertain branch identity fails closed. */
export async function selectIgaStore(page,store,onDiagnostic = () => {}) {
  let stage = "open-store-chooser";
  const fail = reason => { onDiagnostic({stage,reason}); return false; };
  try {
    const postcode = store.address?.match(/\b\d{4}\b(?![\s\S]*\b\d{4}\b)/)?.[0] || store.area.match(/\b\d{4}\b/)?.[0];
    const areaWords = normalized(store.area).split(" ").filter(word => word.length > 1 && !["australia","au"].includes(word));
    if (!postcode && !areaWords.length) return fail("no-public-search-area");
    const chooseSuburb = async input => {
      stage = "fill-suburb-postcode";
      await input.fill(postcode || store.area);
      const options = page.getByRole("option");
      stage = "wait-suburb-options";
      await options.first().waitFor({state:"visible",timeout:3000});
      const labels = await options.allTextContents();
      const rows = labels.map((label,index) => ({label:normalized(label),index}));
      const addressWords = normalized(store.address).split(" ");
      let matching = postcode && store.address?.includes(postcode) ? rows.filter(row => row.label.split(" ").includes(postcode)
        && row.label.split(" ").filter(word => !/^\d+$/.test(word) && !["nsw","vic","qld","sa","wa","nt","tas","act"].includes(word)).every(word => addressWords.includes(word))) : [];
      if (!matching.length) matching = rows.filter(row => postcode
        ? row.label.split(" ").includes(postcode) && (labels.length === 1 || areaWords.filter(word => !/^\d+$/.test(word)).every(word => row.label.split(" ").includes(word)))
        : areaWords.every(word => row.label.split(" ").includes(word)));
      stage = "verify-suburb-option";
      if (matching.length !== 1) return fail(matching.length ? "ambiguous-suburb" : "suburb-not-matched");
      await options.nth(matching[0].index).click();
      return true;
    };
    await page.locator('[data-test-id="header-store-select-button"]:visible').click({timeout:2500});
    await page.waitForTimeout(150);
    stage = "search-another-store";
    const searchAgain = page.getByRole("button",{name:"Search for another store",exact:true});
    const inStore = page.getByRole("tab",{name:"Shop in-store",exact:true});
    const reminder = page.locator("#store-reminder-location:visible");
    const chooseStore = page.getByRole("button",{name:"Choose your store",exact:true});
    await searchAgain.or(inStore).or(reminder).or(chooseStore).first().waitFor({state:"visible",timeout:2500});
    // Anonymous first visits have a location reminder before the full chooser.
    if (await chooseStore.isVisible() && !await reminder.isVisible() && !await inStore.isVisible() && !await searchAgain.isVisible()) await chooseStore.click();
    await searchAgain.or(inStore).or(reminder).first().waitFor({state:"visible",timeout:2500});
    if (await searchAgain.isVisible()) await searchAgain.click();
    const searchedInReminder = await reminder.isVisible();
    if (searchedInReminder && !await chooseSuburb(reminder)) return false;
    stage = "choose-in-store";
    await inStore.click({timeout:2500});
    // Changing fulfilment tabs resets the suburb even when the reminder supplied it.
    if (!await chooseSuburb(page.locator("#search-location:visible"))) return false;
    stage = "wait-exact-store-card";
    const cards = page.locator('[data-test-id="store-selection-list-item"]:visible');
    await cards.first().waitFor({state:"visible",timeout:3500});
    const proof = addressProof(store.address);
    const matchingCards = [];
    for (let index = 0; index < Math.min(await cards.count(),30); index++) {
      const card = cards.nth(index);
      const name = await card.getByRole("heading",{level:3}).innerText();
      const address = await card.getByRole("heading",{level:3}).evaluate(node => (node.parentElement?.innerText || "").split("\n").slice(1,3).join(" ").replace(/\s+/g," ").trim());
      if (proof ? sameStoreAddress(store.address,address) : normalized(name) === normalized(store.name)) matchingCards.push({card,name,address});
    }
    if (matchingCards.length !== 1) return fail(matchingCards.length ? "ambiguous-store-address" : "store-address-not-matched");
    const {card:candidates,name:selectedName,address:selectedAddress} = matchingCards[0];
    const cardText = normalized(await candidates.innerText());
    // Exact branch name plus independent postcode/area evidence is required.
    stage = "verify-store-area-address";
    if (postcode ? !cardText.split(" ").includes(postcode) : !areaWords.every(word => cardText.split(" ").includes(word))) return fail("store-area-not-matched");
    if (store.address) {
      const streetNumber = store.address.match(/^\s*(\d+[a-z]?)/i)?.[1];
      if (streetNumber && !cardText.split(" ").includes(streetNumber.toLowerCase())) return fail("store-address-not-matched");
    }
    stage = "select-exact-store";
    const retailerStoreId = await candidates.getAttribute("data-store-id");
    await candidates.getByRole("button",{name:"Select Store",exact:true}).click();
    stage = "wait-selected-store-header";
    await page.waitForFunction(expected => {
      const labels = [...document.querySelectorAll('[data-test-id="header-store-select"] strong')].map(node => node.textContent);
      const clean = value => String(value || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
      return clean(labels.at(-1)) === clean(expected);
    },selectedName,{timeout:3000});
    const selected = await igaHeaderMatches(page,selectedName);
    onDiagnostic({stage,reason:selected ? "verified" : "selected-header-not-matched",...(selected ? {selectedStore:{id:store.id,name:selectedName,address:selectedAddress,...(/^\d{1,24}$/.test(retailerStoreId || "") ? {retailerStoreId} : {})}} : {})});
    return selected;
  } catch (error) { return fail(error?.name === "TimeoutError" ? "visible-control-timeout" : "visible-control-unavailable"); }
}

/** Chromium cannot choose the resolved address: every TLS tunnel is pinned here. */
export async function startEgressProxy({ resolve = lookup, dial = connect } = {}) {
  const sockets = new Set();
  const track = socket => {
    sockets.add(socket);
    socket.on("error",() => undefined);
    socket.once("close",() => sockets.delete(socket));
    socket.setTimeout(JOB_DEADLINE_MS,() => socket.destroy());
    const timer = setTimeout(() => socket.destroy(),JOB_DEADLINE_MS + 1000);
    timer.unref(); socket.once("close",() => clearTimeout(timer));
  };
  const proxy = createServer({ maxHeaderSize:8192 },(_request,response) => {
    response.writeHead(405,{Connection:"close"}); response.end();
  });
  proxy.on("connection",socket => {
    if (!loopback(socket.remoteAddress) || sockets.size >= 256) { socket.destroy(); return; }
    track(socket);
  });
  proxy.on("connect",async (request,client,head) => {
    let upstream;
    const deadline = setTimeout(() => { client.destroy(); upstream?.destroy(); },8000);
    deadline.unref();
    try {
      const target = await pinnedPublicTarget(request.url,resolve);
      if (client.destroyed) return;
      upstream = dial(target);
      track(upstream);
      upstream.once("connect",() => {
        clearTimeout(deadline);
        if (client.destroyed) { upstream.destroy(); return; }
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        let bytes = head.length;
        const limit = chunk => {
          bytes += chunk.byteLength;
          if (bytes > 16_000_000) { client.destroy(); upstream.destroy(); }
        };
        client.on("data",limit); upstream.on("data",limit);
        client.pipe(upstream); upstream.pipe(client);
      });
      upstream.once("error",() => client.destroy());
      client.once("close",() => upstream.destroy());
      upstream.once("close",() => client.destroy());
    } catch {
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    } finally {
      if (!upstream) clearTimeout(deadline);
    }
  });
  proxy.headersTimeout = 4000;
  await new Promise((resolve,reject) => { proxy.once("error",reject); proxy.listen(0,"127.0.0.1",resolve); });
  return {
    url:`http://127.0.0.1:${proxy.address().port}`,
    async close() { for (const socket of sockets) socket.destroy(); await new Promise(resolve => proxy.close(resolve)); },
  };
}

export function createBrowserRenderer({ executablePath = process.env.RETAILER_CHROMIUM_PATH || "/usr/bin/chromium" } = {}) {
  let browser, launching, proxy, closed = false;
  const storeSessions = createVerifiedStoreSessions();
  const getBrowser = async () => {
    if (closed) throw new Error("Browser reader is stopping.");
    if (browser?.isConnected()) return browser;
    if (launching) return launching;
    launching = (async () => {
      if (!existsSync(executablePath)) throw Object.assign(new Error("The retailer browser is not installed on this host."),{ providerStatus:"not-configured" });
      proxy ||= await startEgressProxy();
      const { chromium } = await import("playwright-core");
      browser = await chromium.launch({ executablePath, headless:true, chromiumSandbox:true,
        timeout:12_000, proxy:{server:proxy.url,bypass:"<-loopback>"},
        args:["--disable-quic","--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
      });
      browser.on("disconnected",() => { browser = undefined; void storeSessions.clear(); });
      return browser;
    })().finally(() => { launching = undefined; });
    return launching;
  };
  const newSession = async (instance,value,source) => {
    const context = await instance.newContext({ javaScriptEnabled:true, serviceWorkers:"block", acceptDownloads:false,
      viewport:{width:1365,height:900}, locale:"en-AU", timezoneId:"Australia/Sydney",
    });
    const counts = new WeakMap(), networks = new WeakMap(); let expectedPages = 0;
    context.on("page",page => {
      if (expectedPages) { expectedPages--; return; }
      void page.close().catch(() => undefined);
    });
    await context.route("**/*",async route => {
      try {
        const request = route.request();
        publicHttpsUrl(request.url());
        const frame = request.frame(), page = frame.page(), count = (counts.get(page) || 0)+1;
        counts.set(page,count);
        if (count > MAX_PAGE_REQUESTS) throw new Error("Request limit reached.");
        if (request.isNavigationRequest() && frame === page.mainFrame()) navigationUrl(request.url(),value,source);
        await route.continue();
      } catch { await route.abort("blockedbyclient").catch(() => undefined); }
    });
    await context.routeWebSocket("**/*",socket => socket.close());
    return {context,count:page => counts.get(page) || 0,quiet:page => networks.get(page).quiet(),close:() => context.close(),async newPage() {
      expectedPages++;
      const page = await context.newPage();
      networks.set(page,watchPageNetwork(page));
      page.setDefaultTimeout(5000); page.setDefaultNavigationTimeout(12_000);
      page.on("dialog",dialog => void dialog.dismiss());
      return page;
    }};
  };
  const settle = async (page,source,allowStoreChooser = false) => {
    if (source === "local-shop") await page.waitForLoadState("networkidle",{timeout:2000}).catch(() => undefined);
    await page.waitForFunction(({allowStoreChooser,local}) => {
      const visible = document.body?.innerText || "";
      const cards = [...document.querySelectorAll('[id^="product-tile-"],[data-product-card="true"],section[data-testid="product-tile"],[data-testid="product-card"]')];
      if (cards.some(card => card.getBoundingClientRect().height > 0 && /\$\s*\d/.test(card.textContent || ""))) return true;
      if (/captcha|verify.*human|access denied|checking your browser|refresh.*(?:cookies|javascript)|(?:cookies|javascript).*refresh|\b(?:no|0) (?:products|results)|couldn.t find any/i.test(visible)) return true;
      if (allowStoreChooser && document.querySelector('[data-test-id="header-store-select-button"]')) return true;
      return local && (!!document.querySelector('script[type="application/ld+json"]') || /\$\s*\d/.test(visible));
    },{allowStoreChooser,local:source === "local-shop"},{timeout:4000}).catch(() => undefined);
  };
  const visible = async page => {
    const snapshot = await page.evaluate(() => ({text:(document.body?.innerText || "").slice(0,60_000),title:document.title.slice(0,300)}));
    for (const frame of page.frames().slice(1,5)) {
      try {
        const element = await frame.frameElement();
        const shown = await element.isVisible(); await element.dispose();
        if (!shown) continue;
        const embedded = await frame.evaluate(() => ({text:(document.body?.innerText || "").slice(0,12_000),title:document.title.slice(0,300)}));
        snapshot.text += `\n${embedded.title}\n${embedded.text}`;
      } catch { /* A visible frame may disappear while the page settles. */ }
    }
    snapshot.text = snapshot.text.slice(0,80_000); return snapshot;
  };
  const proveStoreSession = async (instance,value,store,readerSignal) => {
    const signal = AbortSignal.any([readerSignal,AbortSignal.timeout(JOB_DEADLINE_MS)]);
    const session = await newSession(instance,value);
    let page,proven = false;
    const abort = () => { void session.close().catch(() => undefined); };
    signal.addEventListener("abort",abort,{once:true});
    try {
      signal.throwIfAborted(); page = await session.newPage();
      let response = await page.goto("https://www.igashop.com.au/",{waitUntil:"domcontentloaded"});
      await settle(page,undefined,true);
      let snapshot = await visible(page), action = pageAction({...snapshot,status:response?.status() || 200});
      if (action === "refresh-once") {
        response = await page.reload({waitUntil:"domcontentloaded"}); await settle(page,undefined,true);
        snapshot = await visible(page); action = pageAction({...snapshot,status:response?.status() || 200});
      }
      if (action !== "ready") throw Object.assign(new Error("Open IGA and complete its browser check before choosing a store."),{providerStatus:"needs-browser",status:403});
      let diagnostic;
      if (!await selectIgaStore(page,store,value => { diagnostic = value; })) throw Object.assign(new Error("Open IGA and select the exact nearby store to confirm its prices."),{providerStatus:"needs-store",status:409,diagnostic:session.count(page) > MAX_PAGE_REQUESTS ? {...diagnostic,reason:"network-request-limit"} : diagnostic});
      signal.throwIfAborted();
      if (!diagnostic?.selectedStore || !await igaHeaderMatches(page,diagnostic.selectedStore.name)) throw new Error("IGA store proof was not completed.");
      session.selectedStore = diagnostic.selectedStore; proven = true;
      return session;
    } finally {
      signal.removeEventListener("abort",abort);
      await page?.close().catch(() => undefined);
      if (!proven) await session.close().catch(() => undefined);
    }
  };
  return {
    get configured() { return existsSync(executablePath); },
    get connected() { return !!browser?.isConnected(); },
    async render(value,signal,store,source) {
      signal.throwIfAborted();
      let context, page, session, lease;
      const abort = () => { void (lease ? page?.close() : context?.close())?.catch(() => undefined); };
      signal.addEventListener("abort",abort,{once:true});
      try {
        const instance = await getBrowser();
        signal.throwIfAborted();
        if (store && !source && retailerUrl(value).retailer === "iga") {
          lease = await storeSessions.acquire(verifiedStoreKey(store),sharedSignal => proveStoreSession(instance,value,store,sharedSignal),signal);
          session = lease.value;
        } else session = await newSession(instance,value,source);
        context = session.context;
        signal.throwIfAborted(); page = await session.newPage();
        let response = await page.goto(value,{waitUntil:"domcontentloaded"});
        await settle(page,source);
        let snapshot = await visible(page);
        let action = pageAction({...snapshot,status:response?.status() || 200});
        if (action === "refresh-once") {
          response = await page.reload({waitUntil:"domcontentloaded"});
          await settle(page,source); snapshot = await visible(page);
          action = pageAction({...snapshot,status:response?.status() || 200});
        }
        const final = navigationUrl(page.url(),value,source);
        if (action !== "ready") return controlled(final,"needs-browser","Open the retailer in your browser and complete its check, then choose your store. No automated challenge solving was attempted.",response?.status() || 403);
        const selectedStore = session.selectedStore;
        if (selectedStore) {
          const settled = await settleVerifiedIgaQuery(page,selectedStore.name,() => session.quiet(page));
          if (!settled.ready) {
            if (settled.wrongBranch) lease.invalidate();
            return controlled(final,"unavailable","IGA is still confirming this branch and its product prices. Try this item again shortly.",503,{diagnostic:{stage:"settle-branch-query",reason:settled.reason}});
          }
          snapshot = await visible(page);
          if (pageAction(snapshot) !== "ready") return controlled(final,"needs-browser","Open IGA and complete its browser check before confirming prices.",403);
        }
        if ((response?.status() || 200) >= 400) return controlled(final,"unavailable","The retailer page is temporarily unavailable. Open its website to check this item.",response.status());
        const html = await page.evaluate(limit => {
          const clone = document.documentElement.cloneNode(true);
          clone.querySelectorAll("style,svg,noscript,iframe,canvas,video,audio").forEach(node => node.remove());
          clone.querySelectorAll("script").forEach(node => {
            const inert = /^(?:application\/json|application\/ld\+json)$/i.test(node.type || "") || node.id === "__NEXT_DATA__";
            if (!inert || node.textContent.length > 1_500_000) { node.remove(); return; }
            try { JSON.parse(node.textContent); if (!node.type) node.type = "application/json"; node.removeAttribute("src"); }
            catch { node.remove(); }
          });
          clone.querySelectorAll("*").forEach(node => {
            for (const attr of [...node.attributes]) {
              if (/^on/i.test(attr.name) || /^(?:style|srcdoc|srcset)$/i.test(attr.name) || attr.value.length > 4000) node.removeAttribute(attr.name);
            }
          });
          const output = "<!doctype html>\n" + clone.outerHTML;
          return new TextEncoder().encode(output).length <= limit ? output : null;
        },PAGE_LIMIT);
        if (!html) return controlled(final,"unavailable","The retailer page exceeded the safe reading limit. Open it directly to check prices.",413);
        if (!readablePriceContent({text:snapshot.text,html}) && !(source === "local-shop" && readableLocalDiscovery({text:snapshot.text,html}))) {
          if (!source && colesEmptyBrowserGate({url:value,text:snapshot.text,html})) return controlled(final,"needs-browser","Coles did not display prices in this browser session; open Coles to continue.",403);
          return controlled(final,"unavailable","The retailer did not display readable product prices. Open its website to check this item.",503);
        }
        return {html,url:navigationUrl(page.url(),value,source),status:response?.status() || 200,providerStatus:"ready",...(selectedStore ? {selectedStore} : {})};
      } catch (error) {
        if (lease && context && !context.browser()?.isConnected()) lease.invalidate();
        if (signal.aborted) return controlled(value,"unavailable","The browser price check timed out. Try again shortly or open the retailer directly.",504);
        const status = ["not-configured","needs-browser","needs-store"].includes(error?.providerStatus) ? error.providerStatus : "unavailable";
        return controlled(value,status,status !== "unavailable" ? error.message : "The retailer could not be read in the browser. Open its website to check this item.",error?.status || 503,error?.diagnostic ? {diagnostic:error.diagnostic} : {});
      } finally {
        signal.removeEventListener("abort",abort);
        if (lease) { await page?.close().catch(() => undefined); lease.release(); }
        else await context?.close().catch(() => undefined);
      }
    },
    async close() {
      closed = true;
      await launching?.catch(() => undefined);
      await storeSessions.close();
      await browser?.close().catch(() => undefined);
      await proxy?.close();
    },
  };
}

export async function startRetailerBrowser({ port = Number(process.env.RETAILER_BROWSER_PORT || 8794), renderer = createBrowserRenderer(), deadlineMs = JOB_DEADLINE_MS } = {}) {
  const scheduler = createScheduler(), cache = new Map(), pending = new Map(), backoff = new Map();
  const run = async (value,store,source,subscriberSignal) => {
    subscriberSignal?.throwIfAborted();
    const {url,retailer} = renderTarget(value,source);
    const key = requestKey(url,store,source);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return {...cached.result,cached:true};
    if (cached) cache.delete(key);
    const blocked = backoff.get(retailer);
    if (blocked?.until > Date.now()) return {...blocked.result,url,cached:true,retryAfterSeconds:Math.ceil((blocked.until-Date.now())/1000)};
    if (blocked) backoff.delete(retailer);
    let shared = pending.get(key);
    if (!shared || shared.signal.aborted) {
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal,AbortSignal.timeout(deadlineMs)]);
      shared = {controller,signal,subscribers:new Set(),settled:false,task:null};
      const entry = shared;
      let expire;
      const timeout = new Promise(resolve => {
        expire = () => resolve(controlled(url,"unavailable","The browser price check timed out. Try again shortly or open the retailer directly.",504));
        signal.addEventListener("abort",expire,{once:true});
      });
      const scheduled = scheduler.run(async () => {
        // Another queued ingredient may already have encountered this retailer's gate.
        const recent = backoff.get(retailer);
        if (recent?.until > Date.now()) return {...recent.result,url,cached:true,retryAfterSeconds:Math.ceil((recent.until-Date.now())/1000)};
        const result = await renderer.render(url,signal,store,source);
        if (!signal.aborted && result.providerStatus === "needs-browser") {
          backoff.delete(retailer); backoff.set(retailer,{result,until:Date.now()+CHALLENGE_BACKOFF_MS});
          while (backoff.size > 128) backoff.delete(backoff.keys().next().value);
        }
        return result;
      },signal,!source && retailer === "coles" ? "retailer:coles" : store && !source && retailer === "iga" ? `iga:${verifiedStoreKey(store)}` : null);
      shared.task = Promise.race([scheduled,timeout]).then(result => {
        if (!signal.aborted && result.providerStatus === "ready" && Buffer.byteLength(result.html || "") <= PAGE_LIMIT) {
          cache.delete(key); cache.set(key,{result,at:Date.now()});
          while (cache.size > 32) cache.delete(cache.keys().next().value);
        }
        return result;
      }).finally(() => {
        entry.settled = true; signal.removeEventListener("abort",expire);
        if (pending.get(key) === entry) pending.delete(key);
      });
      pending.set(key,shared);
    }
    const token = Symbol("browser subscriber"), entry = shared;
    entry.subscribers.add(token);
    return new Promise((resolve,reject) => {
      const detach = () => {
        subscriberSignal?.removeEventListener("abort",abort);
        entry.subscribers.delete(token);
        if (!entry.settled && entry.subscribers.size === 0) entry.controller.abort(new DOMException("All price readers disconnected.","AbortError"));
      };
      const abort = () => { detach(); reject(subscriberSignal.reason); };
      subscriberSignal?.addEventListener("abort",abort,{once:true});
      entry.task.then(value => { detach(); resolve(value); },error => { detach(); reject(error); });
    });
  };
  const server = createServer({maxHeaderSize:8192},async (request,response) => {
    const reply = (status,result) => {
      if (response.destroyed) return;
      response.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
      response.end(JSON.stringify(result));
    };
    if (!loopback(request.socket.remoteAddress) || request.headers.origin || request.headers["sec-fetch-site"] && request.headers["sec-fetch-site"] !== "none") { reply(403,{error:"Only local server requests are accepted."}); return; }
    if (request.method === "GET" && request.url === "/health") {
      reply(200,{ok:true,browserConfigured:renderer.configured,browserConnected:renderer.connected,active:scheduler.active,queued:scheduler.queued,cachedPages:cache.size,backoffHosts:backoff.size,subscribers:[...pending.values()].reduce((sum,entry) => sum + entry.subscribers.size,0)}); return;
    }
    if (request.method !== "POST" || !["/","/render"].includes(request.url)) { reply(404,{error:"Not found."}); return; }
    if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "") || Number(request.headers["content-length"]) > 4096) { reply(415,{error:"Use a small JSON URL request."}); request.resume(); return; }
    try {
      const chunks = []; let bytes = 0;
      request.setTimeout(5000,() => request.destroy());
      for await (const chunk of request) { bytes += chunk.length; if (bytes > 4096) throw new Error("URL request is too large."); chunks.push(chunk); }
      request.setTimeout(0);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const {url} = renderTarget(body?.url,body?.source);
      const store = storeContext(body?.store);
      if (store && (body?.source || retailerUrl(url).retailer !== "iga")) throw new Error("A store context is supported only for IGA.");
      const subscriber = new AbortController();
      const detach = () => { if (!response.writableEnded) subscriber.abort(new DOMException("Price reader disconnected.","AbortError")); };
      response.once("close",detach);
      try { reply(200,await run(url,store,body?.source,subscriber.signal)); }
      catch (error) { reply(error?.status || (error?.name === "TimeoutError" ? 504 : 503),controlled(url,"unavailable",safeMessage(error?.message),error?.status || 503)); }
      finally { response.removeListener("close",detach); }
    } catch (error) { reply(422,{error:safeMessage(error.message),providerStatus:"unavailable"}); }
  });
  server.headersTimeout = 5000; server.requestTimeout = 6000; server.keepAliveTimeout = 1000;
  await new Promise((resolve,reject) => { server.once("error",reject); server.listen(port,"127.0.0.1",resolve); });
  return { port:server.address().port, async close() {
    for (const entry of pending.values()) entry.controller.abort(new DOMException("Browser reader is stopping.","AbortError"));
    await renderer.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  } };
}

let entryUrl;
try { if (process.argv[1]) entryUrl = pathToFileURL(realpathSync(process.argv[1])).href; } catch { /* Imported modules need not have an executable entry file. */ }
if (import.meta.url === entryUrl) {
  const worker = await startRetailerBrowser();
  console.log(`Retailer browser ready on 127.0.0.1:${worker.port}`);
  for (const signal of ["SIGTERM","SIGINT"]) process.once(signal,() => { void worker.close().finally(() => process.exit(0)); });
}
