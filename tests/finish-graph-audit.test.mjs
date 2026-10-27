import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { buildFinishContexts, checkFinishModel, runFinishAudit } from "../scripts/audit-finish-graph.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url)), TEMP = path.join(ROOT, "work", "culinary-temp");
mkdirSync(TEMP, { recursive: true });
const input = { mainId: "chicken", methodId: "grilled", regionId: "thai", diet: "balanced", servings: 4 };
const recipe = { id: "fixture", kind: "meal", methodId: "grilled", regionId: "thai", servings: 4, ingredients: [] };
const carrot = { id: "sat-carrot", name: "Carrot", amount: 150, unit: "g", category: "produce", allergens: [] };
const model = (formId = "form_plate", picks = []) => ({ formId, picks, assignment: [false, true] });
const check = (base, spec, candidate) => checkFinishModel(base, spec, candidate, [[1]], 1);
function folder(t) {
  const directory = mkdtempSync(path.join(TEMP, "finish-graph-test-"));
  t.after(() => { assert.ok(path.resolve(directory).startsWith(`${path.resolve(TEMP)}${path.sep}`)); rmSync(directory, { recursive: true, force: true }); });
  return directory;
}
function fixture() {
  return { contexts: [input], generate: () => recipe, enumerate: () => ({ complete: true, termination: "exhausted", models: [model()], modelCount: 1, variables: 1, clauses: [[1]], names: ["form_plate"], work: 1 }), fingerprint: () => ({ sha256: "source-a" }), auditorFingerprint: () => "auditor-a", onProgress: () => {} };
}

test("representative context boundary remains1496, not a claim about all seeds or sides", () => {
  const contexts = buildFinishContexts();
  assert.equal(contexts.length, 1496);
  assert.equal(contexts.filter((entry) => "classicId" in entry).length, 850);
  assert.equal(new Set(contexts.filter((entry) => !("classicId" in entry)).map((entry) => entry.regionId)).size, 76);
});

test("form checks independently preserve cooking technique, temperature and cold service", () => {
  assert.deepEqual(check(recipe, input, model()), []);
  assert.ok(check(recipe, input, model("form_wrap")).includes("main-reinterpreted"));
  assert.ok(check(recipe, input, model("form_hot_stir", [carrot])).includes("stir-form-incompatible"));
  assert.ok(check(recipe, input, model("form_hot")).includes("warm-form-without-vegetables"));
  assert.deepEqual(check({ ...recipe, methodId: "stir-fried" }, input, model("form_hot_stir", [carrot])), []);
  const cold = { ...recipe, kind: undefined, classicId: "cold-smoked-platter" };
  assert.ok(check(cold, input, model("form_hot", [carrot])).includes("cold-platter-reinterpreted"));
  assert.ok(check(cold, input, model("form_plate", [{ ...carrot, id: "sat-sprouts", name: "Bean sprouts" }])).includes("cold-platter-cook-and-chill"));
});

test("broth form requires retained measured liquid in an integrated liquid cooking method", () => {
  const stock = { id: "vegetable-stock", name: "Vegetable stock", amount: 400, unit: "ml", allergens: [] };
  assert.ok(check({ ...recipe, ingredients: [stock] }, input, model("form_broth")).includes("broth-form-without-liquid"));
  assert.deepEqual(check({ ...recipe, methodId: "curry", ingredients: [stock] }, input, model("form_broth")), []);
  assert.ok(check({ ...recipe, methodId: "curry", ingredients: [{ ...stock, amount: 399 }] }, input, model("form_broth")).includes("broth-form-without-liquid"));
});

test("aliases, exact portions and all dietary exclusions are checked outside SAT evaluation", () => {
  assert.ok(check({ ...recipe, ingredients: [{ name: "Chinese cabbage", aliases: ["wombok"], id: "cabbage" }] }, input, model("form_plate", [{ ...carrot, id: "sat-wombok", name: "Wombok" }])).some((code) => code.startsWith("duplicate-food:")));
  assert.ok(check(recipe, { ...input, diet: "vegan" }, model("form_plate", [{ ...carrot, allergens: ["molluscs"] }])).some((code) => code.startsWith("diet-or-allergen-leak:")));
  assert.ok(check(recipe, { ...input, diet: "vegetarian" }, model("form_plate", [{ ...carrot, allergens: ["fish"] }])).some((code) => code.startsWith("diet-or-allergen-leak:")));
  assert.ok(check(recipe, { ...input, diet: "gluten-free" }, model("form_plate", [{ ...carrot, allergens: ["barley"] }])).some((code) => code.startsWith("diet-or-allergen-leak:")));
  assert.ok(check(recipe, { ...input, avoid: ["soy"] }, model("form_plate", [{ ...carrot, allergens: ["soya"] }])).some((code) => code.startsWith("diet-or-allergen-leak:")));
  assert.ok(check(recipe, input, model("form_plate", [{ ...carrot, amount: 0 }])).includes("invalid-portion"));
  assert.ok(check(recipe, input, { ...model(), assignment: [false, false] }).includes("invalid-model"));
});

test("fresh capsicum identity is distinct from a dried chilli seasoning alias", () => {
  const capsicum = { ...carrot, id: "sat-capsicum", name: "Red capsicum" };
  assert.deepEqual(check({ ...recipe, ingredients: [{ id: "chilli-flakes", name: "Chilli flakes", aliases: ["red pepper flakes"] }] }, input, model("form_plate", [capsicum])), []);
  assert.deepEqual(check({ ...recipe, ingredients: [{ id: "roasted-red-peppers", name: "Roasted red peppers" }] }, input, model("form_plate", [capsicum])), []);
  assert.ok(check({ ...recipe, ingredients: [{ id: "pepper", name: "Fresh red pepper" }] }, input, model("form_plate", [capsicum])).includes("duplicate-food:sat-capsicum"));
});

test("compressed witnesses contain every model and bind both library and auditor code", async (t) => {
  const directory = folder(t), out = path.join(directory, "report.json"), report = await runFinishAudit(out, fixture());
  assert.equal(report.status, "passed");
  assert.equal(report.auditor.sha256, "auditor-a");
  const bytes = readFileSync(path.join(directory, report.witnesses.file));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), report.witnesses.sha256);
  const rows = gunzipSync(bytes).toString("utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(rows.map((row) => row.type), ["header", "context", "model", "footer"]);
  assert.equal(rows[2].signature, "1");
  assert.equal(rows[3].models, 1);
});

test("context errors preserve other witnesses; incomplete, duplicate and changed-code results fail", async (t) => {
  const directory = folder(t), options = fixture();
  let calls = 0;
  const report = await runFinishAudit(path.join(directory, "errors.json"), { ...options, contexts: [input, input], generate() { if (++calls === 1) throw new Error("bad fixture"); return recipe; } });
  assert.equal(report.status, "failed");
  assert.equal(report.contexts, 2);
  assert.equal(report.failedContexts, 1);
  assert.equal(report.models, 1);
  const duplicate = await runFinishAudit(path.join(directory, "duplicate.json"), { ...options, enumerate: () => ({ ...options.enumerate(), complete: false, termination: "model-limit", models: [model(), model()], modelCount: 2 }) });
  assert.ok(duplicate.reports[0].issues.includes("duplicate-model"));
  assert.ok(duplicate.reports[0].issues.includes("incomplete:model-limit"));
  let hashes = 0;
  const changed = await runFinishAudit(path.join(directory, "changed.json"), { ...options, auditorFingerprint: () => ++hashes === 1 ? "before" : "after" });
  assert.equal(changed.status, "failed");
  assert.equal(changed.auditor.unchanged, false);
});
