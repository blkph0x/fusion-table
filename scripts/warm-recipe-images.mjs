#!/usr/bin/env node
/** Bounded exact featured recipes. Existing HTTP queue enforces the model budget. */
import { readFileSync } from "node:fs";
import { buildHomeDiscover } from "../lib/home-suggestions.ts";
import { encodeShare, specFromRecipe, decodeShare } from "../lib/share-recipe.ts";

const args = process.argv.slice(2), option = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const base = new URL(option("--base") ?? "http://127.0.0.1:5173/fusion/");
if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error("Supply a public site URL without credentials.");
if (!base.pathname.endsWith("/")) base.pathname += "/";
const max = Math.min(24, Math.max(1, Number(option("--max") ?? 8)));
if (!Number.isInteger(max)) throw new Error("--max must be an integer from1to24.");
const discover = buildHomeDiscover({ loadSeed: 1, suggestionCount: 6, servings: 4 });
const tokens = [encodeShare(specFromRecipe(discover.mealOfWeek.recipe)), ...discover.suggestions.map((item) => item.shareToken)];
// An optional list carries exact popular recipe tokens; never guess a seed from a title.
if (option("--tokens")) { const file = option("--tokens"); const text = readFileSync(file, "utf8"); if (text.length > 200_000) throw new Error("Token list exceeds its budget."); const list = JSON.parse(text); if (!Array.isArray(list)) throw new Error("Token file must be a JSON array."); for (const token of list.slice(0, 24)) { decodeShare(token); tokens.unshift(token); } }
const selected = [...new Set(tokens)].slice(0, max);
if (!args.includes("--run")) console.log(JSON.stringify({ status: "plan", recipes: selected.length, instruction: "Add --run to queue only these exact featured/popular images; the server model budget still applies." }));
else for (const token of selected) { const url = new URL("api/plate", base); url.searchParams.set("t", token); url.searchParams.set("status", "1"); url.searchParams.set("warm", "1"); const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" }); const result = await response.json(); console.log(JSON.stringify({ http: response.status, status: result.status, key: result.key, retryAfterMs: result.retryAfterMs })); if (!response.ok) process.exitCode = 1; }
