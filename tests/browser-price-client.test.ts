import assert from "node:assert/strict";
import { test } from "node:test";
import { browserPriceRenderer, BrowserPriceError, localShopPageRenderer } from "../lib/browser-price-client.ts";
const endpoint = "http://127.0.0.1:6190/render";
const pageUrl = "https://www.coles.com.au/search?q=rice";

test("malformed gateway JSON and response shapes fail as typed provider errors", async () => {
  for (const body of ["not JSON", "null", "[]", "5", JSON.stringify({ html: "<html>Rice</html>", url: pageUrl, status: "403" }), JSON.stringify({ html: "<html>Rice</html>", url: "bad URL" })]) {
    const renderer = browserPriceRenderer(endpoint, async () => new Response(body))!;
    await assert.rejects(renderer(pageUrl), (error: unknown) => error instanceof BrowserPriceError && error.providerStatus === "unavailable");
  }
});

test("gateway challenge/configuration states remain explicit, without returning a price page", async () => {
  for (const providerStatus of ["needs-browser", "needs-store", "not-configured"] as const) {
    const renderer = browserPriceRenderer(endpoint, async () => Response.json({ providerStatus, message: "Open store directly" }, { status: 503 }))!;
    await assert.rejects(renderer(pageUrl), (error: unknown) => error instanceof BrowserPriceError && error.providerStatus === providerStatus);
  }
});

test("declared oversized gateway bodies are cancelled before reading", async () => {
  let cancelled = false;
  const renderer = browserPriceRenderer(endpoint, async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "Content-Length": "4000001" } }))!;
  await assert.rejects(renderer(pageUrl), /exceeded/); assert.equal(cancelled, true);
});

test("local-shop browser responses may use the same public host's www alias only", async () => {
  const good = localShopPageRenderer(endpoint, async () => Response.json({ html: "<html>Products</html>", url: "https://www.butcher.example.org/products", providerStatus: "ready", status: 200 }))!;
  assert.equal((await good("https://butcher.example.org/products")).status, 200);
  const bad = localShopPageRenderer(endpoint, async () => Response.json({ html: "<html>Products</html>", url: "https://elsewhere.example.org/products", providerStatus: "ready" }))!;
  await assert.rejects(bad("https://butcher.example.org/products"), /unexpected page/);
});
