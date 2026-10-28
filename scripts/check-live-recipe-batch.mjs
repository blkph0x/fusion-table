#!/usr/bin/env node
/** Read-only public recipe/PDF audit. --prices additionally checks shopping APIs.
 * Node >=22.13: node --experimental-strip-types scripts/check-live-recipe-batch.mjs
 * No browser, image requests, authentication or community mutations are used.
 */
import { randomUUID, createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { withDeadline } from "../lib/abort-deadline.mjs";
import { getCut } from "../lib/cuts.ts";
import { ingredientPreparationConflict } from "../lib/product-match.ts";
import { costShoppingQuantity } from "../lib/shopping-costs.ts";

const positive = value => Number.isSafeInteger(value) && value > 0;
const plain = value => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
const same = (left, right) => plain(left) === plain(right);
function decodeEntities(value) {
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, code) => {
    if (code[0] !== "#") return entities[code.toLowerCase()] ?? whole;
    const point = code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
  });
}
const htmlText = value => plain(decodeEntities(value.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ")));
const visibleHtml = value => value.replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, "");

export function normalizeAuditBase(raw) {
  const url = new URL(raw);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !["", "/", "/fusion", "/fusion/"].includes(url.pathname)
    || !(loopback && ["http:", "https:"].includes(url.protocol) || url.hostname === "gearsqueens.online" && url.protocol === "https:" && !url.port)) {
    throw new Error("Use the public Fusion Table HTTPS address or a loopback test server, without credentials or query parameters.");
  }
  return url.href.replace(/\/$/, "");
}

function cutName(witness) {
  const id = witness.shareSpec?.cutId ?? witness.input?.cutId;
  if (!id) return null;
  const cut = getCut(id);
  if (!cut) throw new Error(`Witness has an unsupported chosen cut: ${id}`);
  return cut.shoppingName;
}

export function validateRecipeHtml(witness, html) {
  const issues = [], expected = witness.expected;
  const visible = visibleHtml(html), body = htmlText(visible);
  const title = visible.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!title || !same(htmlText(title[1]), expected.title)) issues.push("HTML title differs from the witness recipe.");
  const lists = [...visible.matchAll(/<ul\b[^>]*class=(?:"[^"]*\bingredient-list\b[^"]*"|'[^']*\bingredient-list\b[^']*')[^>]*>([\s\S]*?)<\/ul>/gi)];
  if (lists.length !== 1) issues.push("HTML must contain exactly one visible ingredient list.");
  const entries = [...(lists[0]?.[1] ?? "").matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(match => match[1]);
  if (entries.length !== expected.ingredients.length) issues.push(`HTML ingredient count ${entries.length} differs from ${expected.ingredients.length}.`);
  for (let index = 0; index < expected.ingredients.length; index++) {
    const ingredient = expected.ingredients[index], entry = entries[index] ?? "";
    const name = entry.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i);
    if (!name || !same(htmlText(name[1]), ingredient.name)) issues.push(`HTML ingredient ${index + 1} name differs: ${ingredient.name}`);
    const quantity = entry.match(/<em\b[^>]*>([\s\S]*?)<\/em>/i);
    if (!quantity || !same(htmlText(quantity[1]), `${Number(ingredient.amount.toFixed(2))} ${ingredient.unit}`)) issues.push(`HTML ingredient quantity differs: ${ingredient.name}`);
  }
  if (!new RegExp(`\\b${expected.servings} servings\\b`).test(body)) issues.push("HTML serving count differs from the witness recipe.");
  const chosen = cutName(witness);
  if (chosen && !body.includes(`Chosen cut: ${chosen}`)) issues.push(`HTML is missing the chosen-cut label: ${chosen}`);
  if (!body.includes("not kitchen-tested")) issues.push("HTML is missing the template disclosure.");
  return { issues, ingredientsFound: entries.length };
}

function pdfDisplay(value) {
  const fractions = { "¼": "1/4", "½": "1/2", "¾": "3/4", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };
  return plain(value.replace(/[¼½¾⅛⅜⅝⅞]/g, char => fractions[char]).replace(/[–—−‑]/g, "-")
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').normalize("NFKD").replace(/[^\x20-\x7E\u00A0-\u00FF\s]/g, ""));
}

export function validateRecipePdf(witness, bytes, contentType) {
  const issues = [], buffer = Buffer.from(bytes), text = buffer.toString("latin1");
  if (!/application\/pdf/i.test(contentType ?? "")) issues.push("PDF response has the wrong content type.");
  if (buffer.length < 512 || !text.startsWith("%PDF-") || !text.trimEnd().endsWith("%%EOF")) issues.push("PDF magic, length or EOF marker is invalid.");
  const pages = (text.match(/\/Type\s*\/Page\b/g) ?? []).length;
  if (pages < 1 || pages > 40) issues.push("PDF page structure is invalid.");
  const offset = Number(text.match(/startxref\s+(\d+)\s+%%EOF\s*$/)?.[1]);
  if (!Number.isSafeInteger(offset) || offset < 0 || !text.slice(offset).startsWith("xref")) issues.push("PDF cross-reference offset is invalid.");
  const cookingText = plain([...text.matchAll(/\(((?:\\[\s\S]|[^\\)])*)\)\s*Tj/g)].map(match => match[1].replace(/\\([\\()])/g, "$1")).join(" "));
  if (!cookingText.includes(pdfDisplay(witness.expected.title))) issues.push("PDF title differs from the witness recipe.");
  if (!cookingText.includes(`${witness.expected.servings} servings`)) issues.push("PDF serving count differs from the witness recipe.");
  for (const ingredient of witness.expected.ingredients) if (!cookingText.includes(pdfDisplay(ingredient.name))) issues.push(`PDF is missing ingredient: ${ingredient.name}`);
  const chosen = cutName(witness);
  if (chosen && !cookingText.includes(pdfDisplay(`Chosen cut: ${chosen}`))) issues.push(`PDF is missing the chosen-cut label: ${chosen}`);
  return { issues, pages, bytes: buffer.length };
}

/** One main, one staple, an aromatic and regional condiment, then other produce. */
export function selectPriceLines(witness) {
  const ingredients = witness.expected.ingredients, chosen = [], ids = new Set();
  const take = ingredient => {
    if (ingredient && !ids.has(ingredient.id) && Number.isFinite(ingredient.amount) && ingredient.amount > 0) { chosen.push(ingredient); ids.add(ingredient.id); }
  };
  take(ingredients.find(ingredient => ingredient.id === witness.expected.mainId) ?? ingredients[0]);
  take(ingredients.find(ingredient => /rice|noodle|pasta|bread|quinoa|couscous|polenta|potato|grain|millet|burghul|bulgur/i.test(ingredient.name) && !/vinegar|flour|sauce|oil|stock/i.test(ingredient.name)));
  take(ingredients.find(ingredient => /garlic|ginger|lemongrass|basil|coriander|chilli|cumin|paprika|spice/i.test(ingredient.name)));
  take(ingredients.find(ingredient => ingredient.category === "specialty" || /paste|miso|soy sauce|fish sauce|vinegar|spice|harissa|sumac/i.test(ingredient.name)));
  take(ingredients.find(ingredient => ingredient.category === "produce" && !/garlic|ginger|chilli|basil|coriander|juice/i.test(ingredient.name)));
  for (const ingredient of ingredients) if (chosen.length < 6) take(ingredient);
  return chosen.slice(0, 6).map(({ id, name, amount, unit, category, allergens }) => ({ id, name, amount, unit, category, allergens }));
}

const FINISHED = /\b(?:cookies?|biscuits?|cakes?|muffins?|chocolate|cordial|crisps?|crackers?|chutney|relish|pesto|mayonnaise|aioli|hummus|dressing)\b/i;
const COOKED = /\b(?:cooked|smoked|crumbed|breaded|battered|marinated|rotisserie|nuggets?|chipees?)\b/i;
const PROTEIN = /\b(?:chicken|turkey|beef|lamb|pork|duck|fish|salmon|tuna|prawn|prawns|kangaroo)\b/i;

export function validatePriceResponse(lines, data, now = Date.now()) {
  const issues = [], rows = Array.isArray(data?.lines) ? data.lines : [];
  const metrics = { requestedLines: lines.length, planningLines: 0, selectedGuides: 0, eligibleOffers: 0, pricedOffers: 0, colesPricedMatches: 0, colesEligibleOffers: 0, colesSelectedGuides: 0, unknownStockGuides: 0, oldestEligibleSeconds: 0, colesStatus: "missing" };
  if (rows.length !== lines.length || new Set(rows.map(row => row.id)).size !== lines.length) issues.push("Price response does not contain one row for every requested ingredient.");
  const statuses = Array.isArray(data?.providerStatuses) ? data.providerStatuses : [];
  metrics.colesStatus = statuses.find(status => status.id === "coles")?.status ?? "missing";
  for (const input of lines) {
    const row = rows.find(row => row.id === input.id);
    if (!row || row.name !== input.name || row.unit !== input.unit || row.amount !== input.amount) { issues.push(`Price row identity/quantity differs: ${input.name}`); continue; }
    const planning = row.planningEstimate;
    if (!planning || !positive(planning.recipeCents) || !positive(planning.purchaseCents) || planning.source !== "planning-guide" || planning.observed !== false || planning.currency !== "AUD") issues.push(`No transparent positive planning value: ${input.name}`);
    else metrics.planningLines++;
    const offers = Array.isArray(row.offers) ? row.offers : [];
    const selected = offers.find(offer => offer.id === row.chosenOfferId);
    if (row.chosenOfferId && (!selected || !selected.eligible)) issues.push(`Chosen price is not an eligible offer: ${input.name}`);
    if (row.estimatedCents !== null && !positive(row.estimatedCents)) issues.push(`Invalid or zero selected estimate: ${input.name}`);
    if (!row.chosenOfferId && row.estimatedCents !== null) issues.push(`A selected estimate has no product: ${input.name}`);
    for (const offer of offers) {
      const coles = offer.source === "coles-online-catalogue";
      if (positive(offer.priceCents)) { metrics.pricedOffers++; if (coles) metrics.colesPricedMatches++; }
      else if (offer.priceCents !== null) issues.push(`Invalid published pack price: ${input.name} / ${offer.productName}`);
      if (["recorded", "public-page"].includes(offer.source)) issues.push(`Recorded/manual price returned although disabled: ${input.name}`);
      if (offer.url) {
        try {
          const url = new URL(offer.url);
          if (url.protocol !== "https:" || url.username || url.password || coles && !["www.coles.com.au", "coles.com.au"].includes(url.hostname)) issues.push(`Invalid quote provenance URL: ${input.name}`);
        } catch { issues.push(`Malformed quote URL: ${input.name}`); }
      }
      if (!offer.eligible && offer.id !== row.chosenOfferId) continue;
      metrics.eligibleOffers++; if (coles) metrics.colesEligibleOffers++;
      if (offer.stock === "OUT_OF_STOCK") issues.push(`Out-of-stock product is eligible: ${input.name}`);
      if (offer.stock === "UNKNOWN") metrics.unknownStockGuides++;
      if (ingredientPreparationConflict(input.name, offer.productName)
        || !FINISHED.test(input.name) && FINISHED.test(offer.productName)
        || PROTEIN.test(input.name) && !COOKED.test(input.name) && !/stock|sauce|paste|broth/i.test(input.name) && COOKED.test(offer.productName)) issues.push(`Wrong food/preparation is eligible: ${input.name} / ${offer.productName}`);
      const quantity = /^(?:tbsp|tsp)$/.test(input.unit) && /(?:ml|litre|liter|\d\s*l\b)/i.test(offer.packageSize ?? "")
        ? { amount: input.amount * (input.unit === "tbsp" ? 20 : 5), unit: "ml" } : input;
      const expectedCost = costShoppingQuantity(quantity.amount, quantity.unit, offer.priceCents, offer.packageSize);
      if (!positive(offer.cost?.lineCents) || expectedCost.lineCents === null || offer.cost.lineCents !== expectedCost.lineCents) issues.push(`Eligible pack/recipe quantities cannot be costed consistently: ${input.name} / ${offer.productName}`);
      const age = (now - Date.parse(offer.fetchedAt)) / 1000;
      if (offer.freshness !== "current" || !Number.isFinite(age) || age < -300 || age > 16 * 60) issues.push(`Eligible source is stale or undated: ${input.name}`);
      else metrics.oldestEligibleSeconds = Math.max(metrics.oldestEligibleSeconds, age);
      if (offer.source === "iga-online-catalogue" && (offer.scope !== "shop-online" || !offer.shopId || !offer.shopName)) issues.push(`IGA quote lacks verified-branch scope: ${input.name}`);
      if (coles && offer.scope !== "chain-online") issues.push(`Coles online guide claims an unsupported scope: ${input.name}`);
    }
    if (selected) {
      metrics.selectedGuides++; if (selected.source === "coles-online-catalogue") metrics.colesSelectedGuides++;
      if (row.estimatedCents !== selected.cost?.lineCents) issues.push(`Selected total differs from the selected product: ${input.name}`);
    }
  }
  return { issues: [...new Set(issues)], metrics };
}

async function fetchBytes(url, options, timeout, limit) {
  return withDeadline(timeout, [], async signal => {
    const response = await fetch(url, { ...options, signal, redirect: "manual", headers: { "user-agent": "FusionTable-ReleaseAudit/1.0", ...options?.headers } });
    const reader = response.body?.getReader();
    const chunks = []; let length = 0;
    if (reader) for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new Error("Audit response exceeded its bounded size."); }
      chunks.push(value);
    }
    return { status: response.status, bytes: Buffer.concat(chunks), headers: Object.fromEntries(["content-type", "cache-control", "retry-after"].map(name => [name, response.headers.get(name)])) };
  });
}

function argumentsFor(argv) {
  const valued = new Set(["--base", "--witness", "--report", "--limit"]), flags = new Set(["--prices", "--require-coles-ready", "--help"]), options = {};
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    if (valued.has(name)) { if (!argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error(`Missing value after ${name}`); options[name] = argv[++index]; }
    else if (flags.has(name)) options[name] = true;
    else throw new Error(`Unknown option ${name}`);
  }
  return options;
}

export async function checkLiveRecipeBatch(argv = process.argv.slice(2)) {
  const options = argumentsFor(argv);
  if (options["--help"]) { console.log("Node22+ --experimental-strip-types scripts/check-live-recipe-batch.mjs [--base https://gearsqueens.online/fusion] [--witness work/recipe-50-audit/live-50.json] [--report work/live-recipe-50-report.json] [--limit 1..50] [--prices] [--require-coles-ready]. --prices requires a positive Coles match somewhere; --require-coles-ready additionally requires a fully ready Coles batch."); return; }
  const base = normalizeAuditBase(options["--base"] ?? "https://gearsqueens.online/fusion");
  const reportPath = resolve(options["--report"] ?? "work/live-recipe-50-report.json"), failureRoot = `${reportPath}.failures`;
  const witnessBytes = await readFile(resolve(options["--witness"] ?? "work/recipe-50-audit/live-50.json"));
  const witness = JSON.parse(witnessBytes.toString("utf8"));
  const limit = Number(options["--limit"] ?? 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Array.isArray(witness.cases) || witness.cases.length < limit) throw new Error("Use 1–50 complete witness recipes.");
  if (options["--require-coles-ready"] && !options["--prices"]) throw new Error("--require-coles-ready requires --prices.");
  const cases = witness.cases.slice(0, limit);
  for (const item of cases) if (!/^[A-Za-z0-9_-]{8,7500}$/.test(item.shareToken ?? "") || !item.expected?.title || !Array.isArray(item.expected.ingredients) || !item.expected.ingredients.length || !Number.isInteger(item.expected.servings)) throw new Error("Witness recipes are incomplete.");
  const began = Date.now(), device = `live-recipe-audit-${randomUUID()}`;
  const summary = { status: "running", checkedAt: new Date().toISOString(), base, requestedCases: limit, priceChecksRequested: !!options["--prices"], witnessSha256: createHash("sha256").update(witnessBytes).digest("hex"), witnessSource: witness.source?.sha256 ?? null, deployment: null, htmlPassed: 0, pdfPassed: 0, pricesPassed: 0, priceLines: options["--prices"] ? cases.reduce((sum, item) => sum + selectPriceLines(item).length, 0) : 0, pricesSkipped: 0, planningLines: 0, selectedGuideLines: 0, colesPricedMatches: 0, colesEligibleOffers: 0, colesSelectedGuides: 0, colesReadyBatches: 0, colesStatuses: {}, oldestEligibleSeconds: 0, rateLimitRetries: 0, failures: [], cases: [] };
  await mkdir(dirname(reportPath), { recursive: true });
  const save = () => writeFile(reportPath, JSON.stringify(summary, null, 2));
  const failure = async (index, stage, issues, response) => {
    const file = `case-${String(index + 1).padStart(3, "0")}-${stage}.json`;
    await mkdir(failureRoot, { recursive: true });
    await writeFile(resolve(failureRoot, file), JSON.stringify({ index, stage, recipeId: cases[index]?.expected.id, issues, ...(response ? { status: response.status, headers: response.headers, bodyExcerpt: response.bytes.toString("utf8").slice(0, 6_000) } : {}) }, null, 2));
    summary.failures.push({ case: index + 1, stage, issues, detail: file });
  };
  try {
    const deployment = await fetchBytes(`${base}/deployment.json`, {}, 15_000, 20_000);
    if (deployment.status !== 200) throw new Error(`Deployment preflight returned HTTP ${deployment.status}.`);
    const metadata = JSON.parse(deployment.bytes.toString("utf8"));
    summary.deployment = { releaseId: metadata.releaseId, version: metadata.version, gitCommit: metadata.gitCommit };
    let previousPrice = false, pricesStopped = false;
    for (const [index, item] of cases.entries()) {
      const row = { case: index + 1, recipeId: item.expected.id, main: item.expected.mainId, cut: item.expected.cutId ?? null, method: item.expected.methodId, region: item.expected.regionId, side: item.expected.sideId, html: false, pdf: false };
      const requests = await Promise.allSettled([
        fetchBytes(`${base}/r/${item.shareToken}`, {}, 20_000, 5_000_000),
        fetchBytes(`${base}/api/recipe-pdf?t=${item.shareToken}`, {}, 20_000, 10_000_000),
      ]);
      for (const [offset, stage] of ["html", "pdf"].entries()) {
        const result = requests[offset];
        if (result.status === "rejected") { await failure(index, stage, [result.reason?.message ?? String(result.reason)]); continue; }
        const response = result.value;
        const validation = response.status !== 200 ? { issues: [`HTTP ${response.status}`] } : stage === "html"
          ? validateRecipeHtml(item, response.bytes.toString("utf8")) : validateRecipePdf(item, response.bytes, response.headers["content-type"]);
        if (validation.issues.length) await failure(index, stage, validation.issues, response);
        else { row[stage] = true; summary[`${stage}Passed`]++; }
      }
      if (options["--prices"] && !pricesStopped) {
        if (previousPrice) await pause(1_000); previousPrice = true;
        const lines = selectPriceLines(item), started = Date.now();
        let response;
        try {
          for (let retry = 0; retry < 3; retry++) {
            response = await fetchBytes(`${base}/api/shopping-prices`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines, area: "Newtown NSW 2042", country: "Australia", device, localRecords: false, shops: [], location: { lat: -33.897, lon: 151.18 }, radiusKm: 5 }) }, 40_000, 6_000_000);
            if (![429, 502, 503, 504].includes(response.status) || retry === 2) break;
            if (response.status === 429) summary.rateLimitRetries++;
            const hint = response.headers["retry-after"], parsed = Number(hint);
            const delay = Number.isFinite(parsed) && parsed > 0 ? parsed * 1_000 : hint && Number.isFinite(Date.parse(hint)) ? Date.parse(hint) - Date.now() : 5_000 * (retry + 1);
            if (delay > 60_000) {
              pricesStopped = true;
              throw new Error(`The API requested a ${Math.ceil(delay / 1000)} second pause. Remaining price calls were stopped rather than retrying before that time; rerun later.`);
            }
            await pause(Math.max(1_000, delay));
          }
          if (response.status !== 200) throw new Error(`Price API returned HTTP ${response.status}.`);
          const data = JSON.parse(response.bytes.toString("utf8"));
          const validation = validatePriceResponse(lines, data);
          row.prices = { ...validation.metrics, seconds: (Date.now() - started) / 1000 };
          summary.planningLines += validation.metrics.planningLines;
          summary.selectedGuideLines += validation.metrics.selectedGuides; summary.colesPricedMatches += validation.metrics.colesPricedMatches;
          summary.colesEligibleOffers += validation.metrics.colesEligibleOffers; summary.colesSelectedGuides += validation.metrics.colesSelectedGuides;
          summary.oldestEligibleSeconds = Math.max(summary.oldestEligibleSeconds, validation.metrics.oldestEligibleSeconds);
          const state = validation.metrics.colesStatus;
          summary.colesStatuses[state] = (summary.colesStatuses[state] ?? 0) + 1;
          if (state === "ready") summary.colesReadyBatches++;
          if (validation.issues.length) await failure(index, "prices", validation.issues, response);
          else summary.pricesPassed++;
        } catch (error) { await failure(index, "prices", [error.message ?? String(error)], response); }
      }
      if (options["--prices"] && pricesStopped && !row.prices) { row.pricesSkipped = true; summary.pricesSkipped++; }
      summary.cases.push(row); await save();
      console.log(JSON.stringify({ case: index + 1, of: limit, html: row.html, pdf: row.pdf, ...(row.prices ? { priceLines: row.prices.requestedLines, colesStatus: row.prices.colesStatus, colesPricedMatches: row.prices.colesPricedMatches } : {}) }));
    }
    if (options["--prices"] && summary.colesPricedMatches === 0) summary.failures.push({ stage: "coles-coverage", issues: ["Coles returned no positively priced product matches across the recipe batch."] });
    if (options["--require-coles-ready"] && summary.colesReadyBatches === 0) summary.failures.push({ stage: "coles-readiness", issues: ["No recipe batch returned a fully ready Coles provider."] });
    summary.status = summary.failures.length ? "failed" : "passed";
  } catch (error) { summary.status = "failed"; summary.failures.push({ stage: "startup", issues: [error.message ?? String(error)] }); }
  summary.elapsedSeconds = (Date.now() - began) / 1000;
  summary.selectedGuideCoveragePercent = summary.priceLines ? Math.round(summary.selectedGuideLines / summary.priceLines * 10_000) / 100 : null;
  summary.colesSelectedGuideCoveragePercent = summary.priceLines ? Math.round(summary.colesSelectedGuides / summary.priceLines * 10_000) / 100 : null;
  await save();
  console.log(JSON.stringify({ status: summary.status, recipes: summary.cases.length, htmlPassed: summary.htmlPassed, pdfPassed: summary.pdfPassed, pricesPassed: summary.pricesPassed, colesPricedMatches: summary.colesPricedMatches, colesStatuses: summary.colesStatuses, failures: summary.failures.length, report: reportPath }));
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkLiveRecipeBatch().then(result => { if (result?.status === "failed") process.exitCode = 1; }).catch(error => { console.error(error.message ?? String(error)); process.exitCode = 1; });
}
