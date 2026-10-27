#!/usr/bin/env node
/** Exhaustive finite finish graphs in declared representative contexts, not all seeds. */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGzip } from "node:zlib";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";
import { MAIN_INGREDIENTS, MEAL_REGIONS, getMainsForDiet, generateMeal } from "../lib/meals.ts";
import { CLASSICS, REGIONS, generateRecipe } from "../lib/recipes.ts";
import { enumerateRecipeFinishes } from "../lib/fusion-sat.ts";
import { markerLeak } from "../lib/region-affinity.ts";
import { foodWordHit } from "../lib/food-words.ts";
import { sourceFingerprint } from "./audit-complete-catalogue.mjs";

const ownFile = fileURLToPath(import.meta.url);
const ownHash = () => createHash("sha256").update(readFileSync(ownFile)).digest("hex");
const DIETS = ["balanced", "vegetarian", "vegan", "gluten-free", "dairy-free"];
const LIMITS = { maxModels: 2048, maxTotalWork: 100_000_000, maxTotalSteps: 200_000, maxProofWork: 4_000_000 };
const WARM = new Set(["sat-capsicum", "sat-wombok", "sat-carrot", "sat-sprouts", "sat-snow-peas"]);
const ACIDS = new Set(["sat-lime", "sat-lemon", "sat-vinegar", "sat-tamarind"]);
const ALIASES = {
  "sat-lime": ["lime"], "sat-lemon": ["lemon"], "sat-vinegar": ["rice vinegar"], "sat-tamarind": ["tamarind"],
  "sat-coriander": ["coriander", "cilantro"], "sat-cucumber": ["cucumber"], "sat-capsicum": ["red capsicum", "red pepper", "bell pepper"],
  "sat-spring-onion": ["spring onion", "green onion", "scallion"], "sat-wombok": ["wombok", "chinese cabbage", "cabbage"],
  "sat-carrot": ["carrot"], "sat-sprouts": ["bean sprouts", "beansprouts"], "sat-snow-peas": ["snow peas", "mange tout", "mangetout"],
};
function allergen(value) {
  const name = String(value).toLowerCase().replace(/[^a-z]/g, "");
  return ({ dairy: "milk", eggs: "egg", soya: "soy", crustaceans: "crustacean", crustacea: "crustacean", molluscs: "mollusc", mollusks: "mollusc" })[name] ?? name;
}
export function buildFinishContexts() {
  const contexts = [];
  for (const diet of DIETS) for (const region of MEAL_REGIONS) {
    const preferred = diet === "vegan" || diet === "vegetarian" ? "tofu" : "chicken";
    const main = getMainsForDiet(diet).find((item) => item.id === preferred) ?? getMainsForDiet(diet)[0];
    contexts.push({ mainId: main.id, methodId: main.methodIds.includes("grilled") ? "grilled" : main.methodIds[0], regionId: region.id, sideId: "rice-greens", servings: 4, diet });
  }
  for (const [mi, main] of MAIN_INGREDIENTS.entries()) for (const [ki, methodId] of main.methodIds.entries()) contexts.push({ mainId: main.id, methodId, regionId: MEAL_REGIONS[(mi * 13 + ki * 7) % MEAL_REGIONS.length].id, sideId: "garden-salad", servings: [1, 4, 12][(mi + ki) % 3], diet: "balanced" });
  for (const classic of CLASSICS) for (const region of REGIONS) contexts.push({ classicId: classic.id, regionId: region.id, servings: 4, diet: "balanced" });
  return contexts;
}
function specFor(input, recipe) {
  const vegan = input.diet === "vegan", vegetarian = vegan || input.diet === "vegetarian";
  return { seed: 1, regionId: input.regionId, diet: input.diet, spiceHeat: "medium", glutenFree: input.diet === "gluten-free", dairyFree: vegan || input.diet === "dairy-free", vegan, vegetarian, eggFree: vegan, mainId: recipe.mainId, methodId: recipe.methodId, servings: input.servings };
}
/** Domain checks are deliberately separate from evaluating the solver's clauses. */
export function checkFinishModel(recipe, spec, model, clauses, nvars) {
  const issues = [], add = (code) => issues.push(code), assignment = model.assignment;
  if (!Array.isArray(assignment) || assignment.length !== nvars + 1 || assignment.slice(1).some((value) => typeof value !== "boolean") || !clauses.every((clause) => clause.some((lit) => assignment[Math.abs(lit)] === (lit > 0)))) add("invalid-model");
  const picks = model.picks ?? [];
  if (picks.length > 2) add("too-many-finishes");
  if (new Set(picks.map((pick) => pick.id)).size !== picks.length) add("duplicate-finish-id");
  if (recipe.classicId === "cold-smoked-platter") {
    if (model.formId !== "form_plate") add("cold-platter-reinterpreted");
    if (picks.some((pick) => pick.id === "sat-sprouts")) add("cold-platter-cook-and-chill");
  } else if (!["form_plate", "form_hot", "form_hot_stir", "form_broth"].includes(model.formId)) add("main-reinterpreted");
  if (model.formId === "form_hot_stir" && recipe.methodId !== "stir-fried" && recipe.classicId !== "fried-rice") add("stir-form-incompatible");
  if (["form_hot", "form_hot_stir"].includes(model.formId) && !picks.some((pick) => WARM.has(pick.id))) add("warm-form-without-vegetables");
  if (model.formId === "form_broth") {
    const liquid = recipe.ingredients.filter((item) => item.unit === "ml" && ["vegetable-stock", "coconut-milk", "passata"].includes(item.id)).reduce((sum, item) => sum + item.amount, 0);
    if (recipe.kind !== "meal" || !["curry", "braised"].includes(recipe.methodId) || !Number.isFinite(recipe.servings) || recipe.servings < 1 || liquid < recipe.servings * 100) add("broth-form-without-liquid");
  }
  const vegan = spec.vegan || spec.diet === "vegan", vegetarian = vegan || spec.vegetarian || spec.diet === "vegetarian";
  const forbidden = new Set((spec.avoid ?? []).map(allergen));
  if (vegetarian) for (const name of ["fish", "crustacean", "mollusc"]) forbidden.add(name);
  if (vegan || spec.dairyFree || spec.diet === "dairy-free") forbidden.add("milk");
  if (vegan || spec.eggFree) forbidden.add("egg");
  if (spec.glutenFree || spec.diet === "gluten-free" || forbidden.has("gluten")) for (const name of ["wheat", "barley", "rye", "oats", "gluten"]) forbidden.add(name);
  for (const pick of picks) {
    if (!Number.isFinite(pick.amount) || pick.amount <= 0) add("invalid-portion");
    if (!ALIASES[pick.id]) add(`unexpected-finish:${pick.id}`);
    if (["butcher", "fishmonger"].includes(pick.category) || /\b(?:tofu|tempeh)\b/i.test(pick.name)) add("second-protein");
    if (markerLeak(spec.regionId, pick.id, pick.name)) add(`region-leak:${pick.id}`);
    const labels = [pick.name, ...(ALIASES[pick.id] ?? [])];
    // Dried chilli seasoning and roasted/pickled sauce peppers have different
    // cooking roles from fresh capsicum. Do not erase those authored forms.
    if (recipe.ingredients.some((item) => !(pick.id === "sat-capsicum" && /\b(?:chilli|chili|flakes|powder|roasted|pickled)\b/i.test(`${item.id} ${item.name}`)) && [item.name, ...(item.aliases ?? [])].some((base) => labels.some((label) => foodWordHit(base, label))))) add(`duplicate-food:${pick.id}`);
    if (pick.allergens.some((value) => forbidden.has(allergen(value)))) add(`diet-or-allergen-leak:${pick.id}`);
    if (ACIDS.has(pick.id) && recipe.ingredients.some((item) => /\b(lemon|lime|vinegar|tamarind|sumac)\b/i.test(`${item.id} ${item.name}`))) add(`competing-acid:${pick.id}`);
  }
  return [...new Set(issues)];
}
async function writeLine(stream, value) {
  if (stream.destroyed || stream.errored) throw new Error("Finish witness stream failed.");
  if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, "drain");
}
async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}
export async function runFinishAudit(out, overrides = {}) {
  if (!out || !path.isAbsolute(out)) throw new Error("Pass an absolute output report path.");
  const fingerprint = overrides.fingerprint ?? sourceFingerprint, auditorFingerprint = overrides.auditorFingerprint ?? ownHash;
  const before = fingerprint(), auditorBefore = auditorFingerprint(), contexts = overrides.contexts ?? buildFinishContexts();
  const generate = overrides.generate ?? ((input) => "classicId" in input ? generateRecipe(input) : generateMeal(input));
  const enumerate = overrides.enumerate ?? enumerateRecipeFinishes, emit = overrides.onProgress ?? ((value) => console.log(JSON.stringify(value)));
  const witness = out.replace(/\.json$/i, "") + "-models.ndjson.gz", temporary = `${witness}.part`;
  mkdirSync(path.dirname(out), { recursive: true });
  const gzip = createGzip({ level: 1 }), completion = pipeline(gzip, createWriteStream(temporary));
  completion.catch(() => {});
  const reports = [], failures = [], issueCounts = {};
  let models = 0, failedContexts = 0;
  try {
    await writeLine(gzip, { type: "header", schemaVersion: 1, source: before, auditorSha256: auditorBefore, contexts: contexts.length, limits: LIMITS });
    for (const [index, input] of contexts.entries()) {
      let row, emitted = 0;
      try {
        const recipe = generate(input), spec = specFor(input, recipe), result = enumerate(recipe, spec, LIMITS), check = [], seen = new Set();
        if (!result.complete) check.push(`incomplete:${result.termination}`);
        if (result.modelCount !== result.models.length) check.push("model-count-mismatch");
        await writeLine(gzip, { type: "context", index, input, recipeId: recipe.id, ingredients: recipe.ingredients.map(({ id, name, amount, unit, category, allergens, aliases }) => ({ id, name, amount, unit, category, allergens, ...(aliases ? { aliases } : {}) })), clauses: result.clauses, names: result.names, complete: result.complete, termination: result.termination });
        for (const model of result.models) {
          const issues = checkFinishModel(recipe, spec, model, result.clauses, result.variables), bits = Array.isArray(model.assignment) ? model.assignment.slice(1).map(Number).join("") : "invalid";
          if (seen.has(bits)) issues.push("duplicate-model");
          seen.add(bits); check.push(...issues);
          await writeLine(gzip, { type: "model", context: index, formId: model.formId, signature: bits, picks: model.picks, issues });
          emitted++; models++;
        }
        row = { index, input, complete: result.complete, termination: result.termination, models: result.models.length, modelHash: createHash("sha256").update([...seen].sort().join("\n")).digest("hex"), variables: result.variables, clauses: result.clauses.length, work: result.work, issues: [...new Set(check)] };
      } catch (error) {
        if (gzip.destroyed || gzip.errored) throw error;
        row = { index, input, complete: false, models: emitted, issues: ["context-error"], error: (error instanceof Error ? error.message : String(error)).slice(0, 500) };
        await writeLine(gzip, { type: "context-error", ...row });
      }
      reports.push(row);
      for (const code of row.issues) issueCounts[code] = (issueCounts[code] ?? 0) + 1;
      if (row.issues.length) { failedContexts++; if (failures.length < 40) failures.push(row); }
      if ((index + 1) % 100 === 0) { emit({ contexts: index + 1, total: contexts.length, models, failures: failedContexts }); await new Promise((resolve) => setImmediate(resolve)); }
    }
    await writeLine(gzip, { type: "footer", contexts: reports.length, models, failedContexts });
    gzip.end(); await completion; renameSync(temporary, witness);
  } finally {
    if (!gzip.writableFinished) { gzip.destroy(); await completion.catch(() => {}); }
  }
  const after = fingerprint(), auditorAfter = auditorFingerprint(), sourceUnchanged = before.sha256 === after.sha256, auditorUnchanged = auditorBefore === auditorAfter;
  const report = { schemaVersion: 2, createdAt: new Date().toISOString(), status: failedContexts || !sourceUnchanged || !auditorUnchanged ? "failed" : "passed", coverage: "Complete finite finish graphs for every region/diet representative, every supported main/method with rotated region and serving boundary, and every classic/region at balanced. This is not all regional pantry seeds, all sides, household filters or every context.", source: before, sourceEnd: after, sourceUnchanged, auditor: { file: "scripts/audit-finish-graph.mjs", sha256: auditorBefore, finalSha256: auditorAfter, unchanged: auditorUnchanged }, limits: LIMITS, contexts: reports.length, models, failedContexts, issueCounts, failures, reports, witnesses: { file: path.basename(witness), bytes: statSync(witness).size, sha256: await hashFile(witness), format: "gzip NDJSON header/context/model/context-error/footer; every model has form, Boolean signature, measured ingredient picks and semantic issues" } };
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  emit({ status: report.status, contexts: report.contexts, models, failedContexts, out, witnesses: witness });
  return report;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { const report = await runFinishAudit(process.argv[2]); if (report.status !== "passed") process.exitCode = 1; }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; }
}
