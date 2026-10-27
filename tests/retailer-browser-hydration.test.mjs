import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { startEgressProxy, watchPageNetwork, settleVerifiedIgaQuery } from "../scripts/retailer-browser.mjs";

const executable = [process.env.RETAILER_CHROMIUM_PATH,"/usr/bin/chromium","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(path => path && existsSync(path));

test("a real browser waits for selected-store product prices after the header hydrates",{skip:!executable},async () => {
  const {chromium} = await import("playwright-core");
  const proxy = await startEgressProxy();
  let browser;
  try {
    browser = await chromium.launch({executablePath:executable,chromiumSandbox:true,headless:true,proxy:{server:proxy.url,bypass:"<-loopback>"},args:["--disable-quic","--force-webrtc-ip-handling-policy=disable_non_proxied_udp"]});
    const context = await browser.newContext({serviceWorkers:"block"});
    await context.route("**/*",async route => {
      const url = new URL(route.request().url());
      if (url.origin !== "https://www.igashop.com.au") return route.abort();
      if (url.pathname === "/branch-data") {
        await new Promise(resolve => setTimeout(resolve,250));
        return route.fulfill({status:200,contentType:"application/json",body:'{"price":"7.50"}'});
      }
      if (url.pathname !== "/search") return route.abort();
      return route.fulfill({status:200,contentType:"text/html",body:`<!doctype html><header data-test-id="header-store-select"><strong id="branch">Ashcroft's IGA</strong></header><article data-product-card="true">Chicken breast <span id="price">$6.50</span></article><button id="hydrate">Load selected store</button><script>document.querySelector('#hydrate').onclick=() => { document.querySelector('#branch').textContent='Lloyds IGA Newtown'; fetch('/branch-data').then(response=>response.json()).then(data=>{document.querySelector('#price').textContent='$'+data.price;}); };</script>`});
    });
    const page = await context.newPage(), network = watchPageNetwork(page);
    await page.goto("https://www.igashop.com.au/search?q=chicken",{waitUntil:"domcontentloaded"});
    assert.equal(await page.locator("#price").innerText(),"$6.50");
    await page.getByRole("button",{name:"Load selected store",exact:true}).click();
    const settled = await settleVerifiedIgaQuery(page,"Lloyds IGA Newtown",() => network.quiet({timeoutMs:2000,quietMs:100}));
    assert.deepEqual(settled,{ready:true});
    assert.equal(await page.locator("#price").innerText(),"$7.50");
  } finally { await browser?.close(); await proxy.close(); }
});
