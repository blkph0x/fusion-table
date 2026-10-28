import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { generateMeal } from "../lib/meals.ts";
import { recipePdf } from "../lib/recipe-pdf.ts";
import { estimateIngredientCost } from "../lib/ingredient-estimates.ts";
import { checkLiveRecipeBatch, normalizeAuditBase, selectPriceLines, validateRecipeHtml, validateRecipePdf, validatePriceResponse } from "../scripts/check-live-recipe-batch.mjs";

const recipe = generateMeal({ mainId: "chicken", methodId: "grilled", regionId: "thai", sideId: "rice-greens", cutId: "chicken-breast", servings: 3 });
const witness = { input: { cutId: "chicken-breast" }, expected: recipe };
const escaped = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const html = `<h1>${escaped(recipe.title)}</h1><p>${recipe.servings} servings · template-generated · not kitchen-tested</p><p>Chosen cut: Chicken breast fillets</p><ul class="ingredient-list">${recipe.ingredients.map(ingredient => `<li><strong>${escaped(ingredient.name)}</strong><em>${Number(ingredient.amount.toFixed(2))} ${ingredient.unit}</em></li>`).join("")}</ul>`;

test("live recipe checker only accepts the public HTTPS site or a loopback test base", () => {
  assert.equal(normalizeAuditBase("https://gearsqueens.online/fusion/"), "https://gearsqueens.online/fusion");
  assert.equal(normalizeAuditBase("http://127.0.0.1:8793/fusion"), "http://127.0.0.1:8793/fusion");
  for (const value of ["http://gearsqueens.online/fusion", "https://elsewhere.invalid/fusion", "https://user:secret@gearsqueens.online/fusion", "http://127.0.0.1:8793/fusion?personal=data"]) assert.throws(() => normalizeAuditBase(value));
});

test("HTML validation checks visible content rather than accepting names hidden in scripts", () => {
  assert.deepEqual(validateRecipeHtml(witness, html).issues, []);
  assert.ok(validateRecipeHtml(witness, html.replace("<h1>", "<script>" ).replace("</h1>", "</script><h1>Another meal</h1>")).issues.some(issue => issue.includes("title")));
  assert.ok(validateRecipeHtml(witness, html.replace(/<li>[\s\S]*?<\/li>/, "")).issues.some(issue => issue.includes("ingredient count")));
  assert.ok(validateRecipeHtml(witness, html.replace("Chosen cut: Chicken breast fillets", "")).issues.some(issue => issue.includes("chosen-cut")));
});

test("PDF checker validates real recipe structure, identity, cut label and corruption", () => {
  assert.deepEqual(validateRecipePdf(witness, recipePdf(recipe), "application/pdf").issues, []);
  assert.ok(validateRecipePdf(witness, Buffer.from("%PDF-1.4 fake %%EOF"), "application/pdf").issues.length > 0);
  assert.ok(validateRecipePdf({ ...witness, expected: { ...recipe, title: "Unrelated dinner" } }, recipePdf(recipe), "application/pdf").issues.some(issue => issue.includes("title")));
});

test("six-line price samples include the main, side staple and regional seasoning", () => {
  const lines = selectPriceLines(witness);
  assert.equal(lines.length, 6);
  assert.equal(new Set(lines.map(line => line.id)).size, 6);
  assert.ok(lines.some(line => line.id === "chicken"));
  assert.ok(lines.some(line => /rice/i.test(line.name) && !/vinegar/i.test(line.name)));
  assert.ok(lines.some(line => /ginger|garlic|paste|chilli/i.test(line.name)));
});

const now = Date.parse("2026-10-28T04:00:00Z");
const line = { id: "ginger", name: "Fresh ginger", amount: 10, unit: "g", category: "produce" };
function dataFor(productName = "Fresh Ginger Punnet", packageSize = "100g") {
  return { providerStatuses: [{ id: "coles", status: "ready" }], lines: [{ ...line, planningEstimate: estimateIngredientCost(line), chosenOfferId: "offer", estimatedCents: 300, offers: [{ id: "offer", productName, priceCents: 300, packageSize, stock: "IN_STOCK", eligible: true, freshness: "current", fetchedAt: new Date(now).toISOString(), source: "coles-online-catalogue", scope: "chain-online", url: "https://www.coles.com.au/product/fresh-ginger", cost: { lineCents: 300 } }] }] };
}

test("live price validation catches old cookie matches, wrong units, stock and stale source evidence", () => {
  const valid = validatePriceResponse([line], dataFor(), now);
  assert.deepEqual(valid.issues, []); assert.equal(valid.metrics.colesPricedMatches, 1); assert.equal(valid.metrics.colesSelectedGuides, 1);
  assert.ok(validatePriceResponse([line], dataFor("Stem Ginger Cookies"), now).issues.some(issue => issue.includes("Wrong food")));
  assert.ok(validatePriceResponse([line], dataFor("Fresh ginger", "100ml"), now).issues.some(issue => issue.includes("quantities")));
  const bad = dataFor(); bad.lines[0].offers[0].stock = "OUT_OF_STOCK"; bad.lines[0].offers[0].fetchedAt = new Date(now - 60 * 60_000).toISOString();
  const issues = validatePriceResponse([line], bad, now).issues;
  assert.ok(issues.some(issue => issue.includes("Out-of-stock"))); assert.ok(issues.some(issue => issue.includes("stale")));
  const zero = dataFor(); zero.lines[0].planningEstimate.recipeCents = 0;
  assert.ok(validatePriceResponse([line], zero, now).issues.some(issue => issue.includes("planning")));
});

test("missing exact retailer costs remain acceptable when positive planning estimates are clearly separate", () => {
  const data = dataFor(); data.lines[0].offers = []; data.lines[0].chosenOfferId = null; data.lines[0].estimatedCents = null;
  const result = validatePriceResponse([line], data, now);
  assert.deepEqual(result.issues, []); assert.equal(result.metrics.selectedGuides, 0); assert.equal(result.metrics.planningLines, 1);
});

test("one loopback batch checks HTML/PDF/prices without following image or authentication links", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fusion-live-check-"));
  const requests = [];
  const server = createServer(async (request, response) => {
    requests.push(request.url);
    if (request.url === "/fusion/deployment.json") { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ version: "test", releaseId: "test" })); }
    else if (request.url.startsWith("/fusion/r/")) { response.setHeader("Content-Type", "text/html"); response.end(`${html}<img src="/fusion/api/plate?t=test"><a href="/fusion/api/account">Account</a>`); }
    else if (request.url.startsWith("/fusion/api/recipe-pdf")) { response.setHeader("Content-Type", "application/pdf"); response.end(Buffer.from(recipePdf(recipe))); }
    else if (request.url === "/fusion/api/shopping-prices") {
      let raw = ""; for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw); assert.equal(body.localRecords, false); assert.equal(body.lines.length, 6);
      const lines = body.lines.map((line, index) => ({ ...line, offers: index ? [] : [{ id: "main", productName: line.name, priceCents: 900, packageSize: "500g", stock: "IN_STOCK", eligible: true, freshness: "current", fetchedAt: new Date().toISOString(), source: "coles-online-catalogue", scope: "chain-online", url: "https://www.coles.com.au/product/chicken", cost: { lineCents: 900 } }], chosenOfferId: index ? null : "main", estimatedCents: index ? null : 900, planningEstimate: estimateIngredientCost(line) }));
      response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ lines, providerStatuses: [{ id: "coles", status: "ready" }] }));
    } else { response.statusCode = 500; response.end("Unexpected side effect"); }
  });
  try {
    await new Promise(resolveReady => server.listen(0, "127.0.0.1", resolveReady));
    const file = join(directory, "witness.json"), report = join(directory, "report.json");
    await writeFile(file, JSON.stringify({ cases: [{ ...witness, shareToken: "valid-test-token" }] }));
    const result = await checkLiveRecipeBatch(["--base", `http://127.0.0.1:${server.address().port}/fusion`, "--witness", file, "--report", report, "--limit", "1", "--prices", "--require-coles-ready"]);
    assert.equal(result.status, "passed"); assert.equal(result.htmlPassed, 1); assert.equal(result.pdfPassed, 1); assert.equal(result.pricesPassed, 1);
    assert.equal(result.colesPricedMatches, 1); assert.equal(result.selectedGuideCoveragePercent, 16.67);
    assert.equal(JSON.parse(await readFile(report, "utf8")).status, "passed");
    assert.ok(requests.every(url => !url.includes("/api/plate") && !url.includes("/api/account") && !url.includes("/api/community")));
  } finally {
    server.closeAllConnections(); await new Promise(resolveClosed => server.close(resolveClosed));
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep) && basename(directory).startsWith("fusion-live-check-"));
    await rm(directory, { recursive: true, force: true });
  }
});
