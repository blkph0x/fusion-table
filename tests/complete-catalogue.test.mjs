import assert from "node:assert/strict";
import { test } from "node:test";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { buildCompleteCataloguePlan, optionsFrom, parseShard, renameAuditFile, runCatalogue, shardCaseCount, verifyCatalogue } from "../scripts/audit-complete-catalogue.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TEMP = path.join(ROOT, "work", "culinary-temp");
mkdirSync(TEMP, { recursive: true });
function workspace(t) {
  const out = mkdtempSync(path.join(TEMP, "complete-catalogue-test-"));
  t.after(() => {
    const resolved = path.resolve(out);
    assert.ok(resolved.startsWith(`${path.resolve(TEMP)}${path.sep}`));
    rmSync(resolved, { recursive: true, force: true });
  });
  return out;
}
function fixture(total = 7) {
  return {
    plan: { definition: "fixture-only", total, meals: total, classics: 0, catalogue: { fixture: true }, inputAt: (index) => ({ mainId: "fixture", methodId: "grilled", regionId: `region-${index % 2}`, sideId: "side-0", diet: "balanced", servings: 4, spiceHeat: "medium", fixtureIndex: index }) },
    fingerprint: () => ({ sha256: "fixture-source-a", files: 1 }),
    generate: (input) => ({ id: `fixture-${input.fixtureIndex}`, ingredients: [
      { id: "rice-miso", name: "Gluten-free white rice miso", amount: (input.fixtureIndex + 1) * 1.25, unit: "g", category: "grocery", allergens: ["soy"], aliases: ["gluten-free white rice miso"], notes: "An explicitly labelled product.", inPantry: false },
      { id: "lemon", name: "Lemon", amount: 1, unit: "", category: "produce", allergens: [], inPantry: false },
    ], steps: [{ title: "Finish", detail: "Finish.", finishBoundary: true }], equipment: ["Pan"], prepMinutes: 5, cookMinutes: 10, totalMinutes: 15, allergens: ["soy"] }),
    inspect: () => [],
    assess: () => ({ version: "fixture-rules", score: 100, issues: [] }),
  };
}
const silent = () => {};
test("atomic audit replacement tolerates brief Windows sharing locks without deleting prior evidence", () => {
  let calls = 0; const pauses = [];
  renameAuditFile("pending", "manifest", { platform: "win32", pause: ms => pauses.push(ms), rename(from, to) { assert.equal(from, "pending"); assert.equal(to, "manifest"); if (++calls < 4) throw Object.assign(new Error("temporarily locked"), { code: "EPERM" }); } });
  assert.equal(calls, 4); assert.deepEqual(pauses, [20, 40, 60]);
  for (const [platform, code, expected] of [["linux", "EPERM", 1], ["win32", "ENOENT", 1], ["win32", "EACCES", 8]]) {
    calls = 0;
    assert.throws(() => renameAuditFile("pending", "manifest", { platform, pause() {}, rename() { calls++; throw Object.assign(new Error("cannot replace"), { code }); } }));
    assert.equal(calls, expected);
  }
});
const readState = (out, index = 0, count = 1) => JSON.parse(readFileSync(path.join(out, `shard-${index}-of-${count}`, "manifest.json"), "utf8"));
function readRecords(out, state) {
  return state.chunks.flatMap((chunk) => gunzipSync(readFileSync(path.join(out, `shard-${state.run.shard.index}-of-${state.run.shard.count}`, chunk.file))).toString("utf8").trim().split("\n").map((line) => JSON.parse(line))).filter((record) => record.type === "case");
}

test("canonical plan derives every dietary default/cut row and all4250 classics without generation", () => {
  const plan = buildCompleteCataloguePlan();
  assert.equal(plan.total, 20_414_810);
  assert.equal(plan.meals, 20_410_560);
  assert.equal(plan.classics, 4250);
  assert.deepEqual(plan.catalogue.dietRows, { balanced: { default: 266, chosenCut: 641 }, vegetarian: { default: 148, chosenCut: 0 }, vegan: { default: 129, chosenCut: 0 }, "gluten-free": { default: 266, chosenCut: 641 }, "dairy-free": { default: 252, chosenCut: 641 } });
  assert.equal(plan.allHeatServingProjection, "1224888600");
  for (const index of [0, 89, 90, 6839, 6840, plan.meals - 1, plan.meals, plan.total - 1]) {
    const input = plan.inputAt(index);
    assert.equal(input.servings, 4);
    assert.equal(input.spiceHeat, "medium");
    assert.equal(input.seed, undefined);
    assert.equal("classicId" in input, index >= plan.meals);
  }
  assert.throws(() => plan.inputAt(plan.total), /outside/);
});

test("zero-based shards partition every index exactly, including uneven and empty workers", () => {
  for (const total of [1, 7, 17, 100]) for (const count of [1, 2, 3, 8]) {
    const indices = [];
    for (let index = 0; index < count; index++) {
      const shard = parseShard(`${index}/${count}`), scheduled = shardCaseCount(total, shard);
      for (let position = 0; position < scheduled; position++) indices.push(index + position * count);
    }
    assert.deepEqual(indices.sort((a, b) => a - b), Array.from({ length: total }, (_, index) => index));
  }
  assert.equal(shardCaseCount(20_414_810, parseShard("0/2")), 10_207_405);
  assert.throws(() => parseShard("2/2"), /below/);
  assert.throws(() => parseShard("-1/2"), /zero-based/);
});

test("default CLI is plan-only and never creates its requested output directory", (t) => {
  const root = workspace(t), out = path.join(root, "must-not-exist");
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/audit-complete-catalogue.mjs", "--out", out], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout.trim()).mode, "plan");
  assert.equal(existsSync(out), false);
  assert.equal(optionsFrom([]).mode, "plan");
  assert.throws(() => optionsFrom(["--full"]), /absolute/);
  assert.throws(() => optionsFrom(["--limit", "-2"]), /non-negative/);
});

test("partial witnesses retain every measured ingredient and resume without duplicates", async (t) => {
  const out = workspace(t), dependencies = fixture();
  const partial = await runCatalogue({ out, limit: 2, chunkRecords: 3, onProgress: silent }, dependencies);
  assert.equal(partial.status, "partial");
  assert.equal(partial.coverageComplete, false);
  assert.equal(partial.processed, 2);
  const partialRecords = readRecords(out, partial);
  assert.deepEqual(partialRecords.map((record) => record.index), [0, 1]);
  assert.deepEqual(partialRecords[0].ingredients, [[1, 1.25], [2, 1]]);
  const dictionary = path.join(out, "shard-0-of-1", "ingredients.ndjson");
  const entry = JSON.parse(readFileSync(dictionary, "utf8").split("\n")[0]);
  assert.equal(entry.ingredient.normalizedName, "gluten-free white rice miso");
  assert.deepEqual(entry.ingredient.aliases, ["gluten-free white rice miso"]);
  appendFileSync(dictionary, '{"uncommitted-tail":true}\n');
  const complete = await runCatalogue({ out, chunkRecords: 3, onProgress: silent }, dependencies);
  assert.equal(complete.status, "complete");
  assert.equal(complete.dictionary.entries, 2);
  assert.equal(complete.ingredientSummary[1].occurrences, 7);
  assert.equal(readFileSync(dictionary, "utf8").includes("uncommitted-tail"), false);
  assert.deepEqual(readRecords(out, complete).map((record) => record.index), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(complete.chunks.map((chunk) => chunk.records), [2, 3, 2]);
});

test("all completed shards are required and their ingredient witnesses form one exact union", async (t) => {
  const out = workspace(t), dependencies = fixture(17);
  await runCatalogue({ out, shard: parseShard("0/2"), chunkRecords: 4, onProgress: silent }, dependencies);
  await assert.rejects(() => verifyCatalogue(out, 2, dependencies));
  await runCatalogue({ out, shard: parseShard("1/2"), chunkRecords: 4, onProgress: silent }, dependencies);
  const complete = await verifyCatalogue(out, 2, dependencies);
  assert.equal(complete.coverageComplete, true);
  assert.equal(complete.checked, 17);
  assert.equal(complete.passed, true);
  assert.equal(complete.distinctIngredientEntries, 2);
  const records = [readState(out, 0, 2), readState(out, 1, 2)].flatMap((state) => readRecords(out, state));
  assert.equal(new Set(records.map((record) => record.index)).size, 17);
});

test("a changed source, changed chunk contract or tampered committed file cannot resume", async (t) => {
  const out = workspace(t), dependencies = fixture();
  await runCatalogue({ out, limit: 2, chunkRecords: 3, onProgress: silent }, dependencies);
  await assert.rejects(() => runCatalogue({ out, chunkRecords: 3, onProgress: silent }, { ...dependencies, fingerprint: () => ({ sha256: "different-source", files: 1 }) }), /Cannot resume/);
  await assert.rejects(() => runCatalogue({ out, chunkRecords: 4, onProgress: silent }, dependencies), /Cannot resume/);
  const state = readState(out), file = path.join(out, "shard-0-of-1", state.chunks[0].file), bytes = readFileSync(file);
  bytes[10] ^= 1; writeFileSync(file, bytes);
  await assert.rejects(() => runCatalogue({ out, chunkRecords: 3, onProgress: silent }, dependencies), /integrity failure/);
});

test("source changes during a run and complete-dictionary mutations invalidate completion", async (t) => {
  const out = workspace(t), dependencies = fixture(3);
  let fingerprintCalls = 0;
  const changed = await runCatalogue({ out, chunkRecords: 2, onProgress: silent }, { ...dependencies, fingerprint: () => ({ sha256: ++fingerprintCalls === 1 ? "before" : "after", files: 1 }) });
  assert.equal(changed.processed, 3);
  assert.equal(changed.status, "source-changed");
  assert.equal(changed.coverageComplete, false);
  const second = workspace(t);
  await runCatalogue({ out: second, chunkRecords: 2, onProgress: silent }, dependencies);
  appendFileSync(path.join(second, "shard-0-of-1", "ingredients.ndjson"), "extra\n");
  await assert.rejects(() => verifyCatalogue(second, 1, dependencies), /unexpected tail/);
});

test("quality and generation failures are witnessed with bounded examples, never silently passed", async (t) => {
  const out = workspace(t), dependencies = fixture(8);
  const result = await runCatalogue({ out, chunkRecords: 3, onProgress: silent }, {
    ...dependencies,
    generate(input) { if (input.fixtureIndex === 0) throw new Error("fixture generation failure"); return dependencies.generate(input); },
    assess() { throw new Error("fixture quality failure"); },
  });
  assert.equal(result.status, "complete-with-errors");
  assert.equal(result.coverageComplete, true);
  assert.equal(result.passed, false);
  assert.equal(result.failedCases, 8);
  assert.ok(result.examples.length <= 6);
  const records = readRecords(out, result);
  assert.match(records[0].error, /generation failure/);
  assert.equal(records[1].ingredients.length, 2, "quality-check failure must not discard generated ingredients");
  assert.equal(records[1].quality.issues[0].code, "QUALITY_CHECK_ERROR");
});

test("streamed multi-chunk output handles backpressure without retaining all case records", async (t) => {
  const out = workspace(t), dependencies = fixture(1001);
  const result = await runCatalogue({ out, chunkRecords: 100, onProgress: silent }, dependencies);
  assert.equal(result.chunks.length, 11);
  assert.equal(result.processed, 1001);
  assert.equal(result.dictionary.entries, 2);
  assert.equal(result.examples.length, 0);
  assert.ok(result.memory.heapPeak > 0);
  const complete = await verifyCatalogue(out, 1, dependencies);
  assert.equal(complete.checked, 1001);
});
