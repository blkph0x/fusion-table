#!/usr/bin/env node
/** Small opt-in live provider diagnosis; eight representative foods, no private data. */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { lookupQueries } from "../lib/catalogue.ts";
import { lookupColesQueries } from "../lib/coles-catalogue.ts";
import { buildShoppingOffers } from "../lib/shopping-costs.ts";
import { withAutomaticPrices } from "../app/api/shopping-prices/automatic-offers.ts";
const args = process.argv.slice(2), at = args.indexOf("--report");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(root, at >= 0 ? args[at + 1] : "docs/audit-evidence-2026-10-27/account-price-sources.json");
const lines = [
  ["Chicken breast fillets", 650, "g", "butcher"], ["Jasmine rice", 200, "g", "grocery"],
  ["Brown onion", 180, "g", "produce"], ["Mushrooms", 200, "g", "produce"],
  ["Soy sauce", 2, "tbsp", "grocery"], ["Olive oil", 1, "tbsp", "grocery"],
  ["Carrots", 250, "g", "produce"], ["Plain flour", 80, "g", "grocery"],
].map(([name, amount, unit, category], index) => ({ id: `source-audit-${index}`, name, amount, unit, category }));
const start = performance.now(), signal = AbortSignal.timeout(30_000), names = lines.map(line => line.name);
const attempts = await Promise.allSettled([lookupQueries(names, fetch, signal), lookupColesQueries(names, fetch, signal)]);
const quotes = attempts.flatMap(result => result.status === "fulfilled" ? result.value : []);
const compared = withAutomaticPrices({ lines: buildShoppingOffers(lines, quotes, [], { area: "2000" }) });
const result = {
  checkedAt: new Date().toISOString(), scope: "Eight Australian online ingredient guides from this execution host; no selected branch, local stock, or locality-specific price guarantee.",
  elapsedMs: Math.round(performance.now() - start), ingredients: lines.length,
  observedPricedLines: compared.lines.filter(line => line.estimatedCents !== null).length,
  planningEstimateLines: compared.lines.filter(line => line.planningEstimate !== null).length,
  providers: attempts.map((attempt, index) => ({ provider: index ? "coles" : "woolworths", status: attempt.status, error: attempt.status === "rejected" ? String(attempt.reason) : null })),
  quotes, lines: compared.lines,
};
mkdirSync(path.dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ checkedAt: result.checkedAt, elapsedMs: result.elapsedMs, ingredients: result.ingredients, observedPricedLines: result.observedPricedLines, planningEstimateLines: result.planningEstimateLines, report: output }));
