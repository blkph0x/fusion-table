#!/usr/bin/env node
/** Opt-in, resumable canonical catalogue witnesses. Default command prints a plan only. */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, truncateSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGzip } from "node:zlib";
import { once } from "node:events";
import { finished, pipeline } from "node:stream/promises";
import { performance } from "node:perf_hooks";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIETS = ["balanced", "vegetarian", "vegan", "gluten-free", "dairy-free"];
const DEFINITION = "canonical-medium-four-authored-v1";
const MAX_DICTIONARY_BYTES = 64 * 1024 * 1024;

export function sourceFingerprint() {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name.endsWith(".ts")) files.push(path.relative(ROOT, full).replaceAll("\\", "/"));
    }
  }
  visit(path.join(ROOT, "lib"));
  files.push("scripts/audit-culinary-matrix.mjs", "scripts/audit-complete-catalogue.mjs");
  const hash = createHash("sha256");
  for (const file of files.sort()) hash.update(file).update("\0").update(readFileSync(path.join(ROOT, file))).update("\0");
  return { sha256: hash.digest("hex"), files: files.length, scope: "lib/**/*.ts and both catalogue auditors" };
}

// Bind the loaded implementation to the code snapshot, including import time.
const beforeImport = sourceFingerprint();
const [{ MEAL_REGIONS, MEAL_SIDES, getMainsForDiet, generateMeal }, { cutsForMethod }, { CLASSICS, REGIONS, generateRecipe }, { inspectRecipe }] = await Promise.all([
  import("../lib/meals.ts"), import("../lib/cut-method.ts"), import("../lib/recipes.ts"), import("./audit-culinary-matrix.mjs"),
]);
const loadedSource = sourceFingerprint();
if (loadedSource.sha256 !== beforeImport.sha256) throw new Error("Recipe source changed during auditor import; restart after freezing source.");

export function parseShard(value = "0/1") {
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (!match) throw new Error("Use a zero-based shard such as 0/2 or 1/2.");
  const index = Number(match[1]), count = Number(match[2]);
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || count < 1 || count > 1024 || index >= count) throw new Error("Shard index must be zero-based and below its count (1–1024).");
  return { index, count };
}

export function shardCaseCount(total, shard) {
  return shard.index >= total ? 0 : Math.floor((total - 1 - shard.index) / shard.count) + 1;
}

export function buildCompleteCataloguePlan() {
  const rows = DIETS.flatMap((diet) => getMainsForDiet(diet).flatMap((main) => main.methodIds.flatMap((methodId) => [
    { diet, mainId: main.id, methodId },
    ...cutsForMethod(main.id, methodId).map((cut) => ({ diet, mainId: main.id, methodId, cutId: cut.id })),
  ])));
  const regionCount = MEAL_REGIONS.length, sideCount = MEAL_SIDES.length;
  const meals = rows.length * regionCount * sideCount;
  const classics = CLASSICS.length * REGIONS.length * DIETS.length;
  const total = meals + classics;
  const dietRows = Object.fromEntries(DIETS.map((diet) => [diet, {
    default: rows.filter((row) => row.diet === diet && !row.cutId).length,
    chosenCut: rows.filter((row) => row.diet === diet && row.cutId).length,
  }]));
  return {
    definition: DEFINITION, total, meals, classics,
    catalogue: { mealRegions: regionCount, sides: sideCount, classics: CLASSICS.length, classicRegions: REGIONS.length, diets: DIETS.length, rows: rows.length, dietRows },
    boundary: "All compatible dietary default/chosen-cut main-method rows × every meal region × every side, plus every classic × classic region × diet. Four servings, medium heat, authored/unseeded. Custom filters, cleaner flags, pantry text, other heats/servings and seeds are separate spaces.",
    allHeatServingProjection: String(BigInt(total) * 5n * 12n),
    inputAt(index) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= total) throw new Error("Catalogue index is outside the canonical space.");
      if (index < meals) {
        const side = index % sideCount, rest = Math.floor(index / sideCount), region = rest % regionCount;
        return { ...rows[Math.floor(rest / regionCount)], regionId: MEAL_REGIONS[region].id, sideId: MEAL_SIDES[side].id, servings: 4, spiceHeat: "medium" };
      }
      const rest = index - meals, diet = DIETS[rest % DIETS.length], rest2 = Math.floor(rest / DIETS.length);
      return { classicId: CLASSICS[Math.floor(rest2 / REGIONS.length)].id, regionId: REGIONS[rest2 % REGIONS.length].id, diet, servings: 4, spiceHeat: "medium" };
    },
  };
}

function description(plan) {
  return Object.fromEntries(Object.entries(plan).filter(([key]) => key !== "inputAt"));
}
/** Windows scanners can briefly hold the previous manifest open. Keep replacement
 * atomic, retry only transient Windows sharing errors, and never delete it first. */
export function renameAuditFile(from, to, { platform = process.platform, rename = renameSync, pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return rename(from, to); }
    catch (error) {
      if (platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt >= 7) throw error;
      pause(20 * (attempt + 1));
    }
  }
}
function jsonAtomic(file, value) {
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameAuditFile(temporary, file);
}
async function fileHash(file) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}
async function writeLine(stream, line) {
  try {
    if (stream.destroyed || stream.errored) throw new Error("Witness stream closed before its record was written.");
    if (!stream.write(line)) await once(stream, "drain");
  } catch (error) {
    throw Object.assign(new Error(`Witness I/O failed: ${error instanceof Error ? error.message : String(error)}`), { auditFatal: true });
  }
}
function normalizedIngredient(item) {
  return {
    id: item.id, name: item.name, normalizedName: item.name.trim().toLowerCase().replace(/\s+/g, " "), unit: item.unit,
    category: item.category, allergens: [...item.allergens].sort(), aliases: [...(item.aliases ?? [])].sort(), notes: item.notes ?? null,
    inPantry: Boolean(item.inPantry),
  };
}
function dictionarySignature(item) { return JSON.stringify(item); }

function loadDictionary(directory, state) {
  const file = path.join(directory, "ingredients.ndjson");
  const bytes = state.dictionary.bytes;
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_DICTIONARY_BYTES) throw new Error("Dictionary checkpoint exceeds the bounded reader limit.");
  if (!existsSync(file)) {
    if (bytes) throw new Error("Committed ingredient dictionary is missing.");
    return { registry: new Map(), hash: createHash("sha256"), bytes: 0, file };
  }
  const size = statSync(file).size;
  if (size < bytes) throw new Error("Ingredient dictionary is shorter than its committed checkpoint.");
  if (size > MAX_DICTIONARY_BYTES) throw new Error("Ingredient dictionary exceeds the bounded reader limit.");
  const buffer = readFileSync(file);
  if (buffer.length > MAX_DICTIONARY_BYTES) throw new Error("Ingredient dictionary exceeds the bounded reader limit.");
  const prefix = buffer.subarray(0, bytes), hash = createHash("sha256").update(prefix);
  if (hash.copy().digest("hex") !== state.dictionary.sha256) throw new Error("Committed ingredient dictionary hash mismatch.");
  const registry = new Map();
  for (const line of prefix.toString("utf8").split("\n").filter(Boolean)) {
    const entry = JSON.parse(line);
    if (entry.id !== registry.size + 1 || !entry.ingredient || typeof entry.ingredient.normalizedName !== "string") throw new Error("Invalid ingredient dictionary sequence.");
    registry.set(dictionarySignature(entry.ingredient), entry.id);
  }
  if (registry.size !== state.dictionary.entries) throw new Error("Ingredient dictionary count mismatch.");
  // A killed process may have written only uncommitted tail entries.
  if (buffer.length > bytes) {
    if (state.coverageComplete) throw new Error("Completed ingredient dictionary has an unexpected tail.");
    truncateSync(file, bytes);
  }
  return { registry, hash, bytes, file };
}

async function verifyCommitted(directory, state) {
  let records = 0;
  for (const [index, chunk] of state.chunks.entries()) {
    if (chunk.file !== `cases-${String(index).padStart(6, "0")}.ndjson.gz`) throw new Error("Unexpected committed witness filename.");
    if (!Number.isSafeInteger(chunk.records) || chunk.records < 1 || chunk.firstIndex !== state.run.shard.index + records * state.run.shard.count || chunk.lastIndex !== chunk.firstIndex + (chunk.records - 1) * state.run.shard.count) throw new Error("Witness chunk index coverage is inconsistent.");
    const file = path.join(directory, chunk.file);
    if (statSync(file).size !== chunk.bytes || await fileHash(file) !== chunk.sha256) throw new Error(`Witness chunk integrity failure: ${chunk.file}`);
    records += chunk.records;
  }
  if (records !== state.processed) throw new Error("Witness count differs from committed checkpoint.");
}

function addCount(map, key) { map[key] = (map[key] ?? 0) + 1; }
function issueSummary(state, input, index, issues) {
  const errors = issues.some((issue) => issue.severity === "error");
  if (errors) state.failedCases++;
  if (issues.some((issue) => issue.severity === "warning")) state.warningCases++;
  for (const issue of issues) {
    const key = `${issue.severity}:${issue.code}`;
    addCount(state.issueCounts, key);
    if (state.examples.length < 40 && state.examples.filter((entry) => entry.code === issue.code).length < 3) state.examples.push({ index, input, ...issue });
  }
}

/** Dependency overrides allow tiny, real streaming/repair tests without running the catalogue. */
export async function runCatalogue(options, overrides = {}) {
  if (!options.out || !path.isAbsolute(options.out)) throw new Error("Use --out with an absolute D: output directory.");
  const plan = overrides.plan ?? buildCompleteCataloguePlan(), fingerprint = overrides.fingerprint ?? sourceFingerprint;
  const source = fingerprint();
  if (!overrides.fingerprint && source.sha256 !== loadedSource.sha256) throw new Error("Loaded recipe code changed; restart the auditor.");
  const requestedShard = options.shard ?? { index: 0, count: 1 };
  const shard = parseShard(`${requestedShard.index}/${requestedShard.count}`), chunkRecords = options.chunkRecords ?? 100_000;
  if (!Number.isSafeInteger(chunkRecords) || chunkRecords < 1 || chunkRecords > 1_000_000) throw new Error("Chunk size must be1–1000000 records.");
  const limit = options.limit ?? Infinity;
  if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 0)) throw new Error("Limit must be a non-negative integer.");
  const directory = path.join(options.out, `shard-${shard.index}-of-${shard.count}`);
  mkdirSync(directory, { recursive: true });
  const manifest = path.join(directory, "manifest.json");
  const run = { definition: plan.definition, source, shard, total: plan.total, scheduled: shardCaseCount(plan.total, shard), chunkRecords, gzipLevel: 1, catalogue: plan.catalogue };
  let state;
  if (existsSync(manifest)) {
    state = JSON.parse(readFileSync(manifest, "utf8"));
    if (state.schemaVersion !== 1 || JSON.stringify(state.run) !== JSON.stringify(run)) throw new Error("Cannot resume: source, canonical plan, shard or chunk settings changed.");
    await verifyCommitted(directory, state);
  } else {
    if (readdirSync(directory).length) throw new Error("Output shard contains files without an auditable checkpoint; choose a new directory.");
    state = { schemaVersion: 1, run, status: "partial", coverageComplete: false, passed: false, startedAt: new Date().toISOString(), updatedAt: null, processed: 0, failedCases: 0, warningCases: 0, issueCounts: {}, examples: [], chunks: [], dictionary: { file: "ingredients.ndjson", entries: 0, bytes: 0, sha256: createHash("sha256").digest("hex") }, ingredientSummary: {}, coverage: { meals: 0, classics: 0, diets: {}, regions: {}, sides: {}, cutSelection: {} }, quality: { scored: 0, scoreTotal: 0, minimum: null, maximum: null }, memory: { heapPeak: 0, rssPeak: 0 }, elapsedSeconds: 0 };
    jsonAtomic(manifest, state);
  }
  const dictionary = loadDictionary(directory, state);
  if (state.coverageComplete) {
    if (fingerprint().sha256 !== source.sha256) throw new Error("Source changed while verifying the completed checkpoint.");
    return state;
  }
  const generate = overrides.generate ?? ((input) => "classicId" in input ? generateRecipe(input) : generateMeal(input));
  const inspect = overrides.inspect ?? inspectRecipe;
  const assess = overrides.assess ?? (await import("../lib/recipe-quality.ts")).assessRecipeQuality;
  const dictionaryStream = createWriteStream(dictionary.file, { flags: "a" });
  dictionaryStream.on("error", () => {});
  let stopping = false, invocationProcessed = 0, lastProgress = performance.now();
  const started = performance.now(), previousElapsed = state.elapsedSeconds;
  const interrupt = () => { stopping = true; };
  process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
  const emit = options.onProgress ?? ((value) => console.log(JSON.stringify(value)));
  let chunk = null;
  async function openChunk() {
    const file = `cases-${String(state.chunks.length).padStart(6, "0")}.ndjson.gz`, temporary = path.join(directory, `${file}.part`);
    const gzip = createGzip({ level: 1 }), output = createWriteStream(temporary);
    const completion = pipeline(gzip, output);
    completion.catch(() => {});
    chunk = { file, temporary, gzip, completion, records: 0, firstIndex: shard.index + state.processed * shard.count, lastIndex: null };
    await writeLine(gzip, `${JSON.stringify({ type: "header", schemaVersion: 1, definition: plan.definition, source: source.sha256, shard, dictionary: "ingredients.ndjson" })}\n`);
  }
  async function commitChunk() {
    if (!chunk) return;
    await writeLine(chunk.gzip, `${JSON.stringify({ type: "footer", records: chunk.records, firstIndex: chunk.firstIndex, lastIndex: chunk.lastIndex })}\n`);
    chunk.gzip.end(); await chunk.completion;
    await new Promise((resolve, reject) => dictionaryStream.write("", (error) => error ? reject(error) : resolve()));
    const sha256 = await fileHash(chunk.temporary), bytes = statSync(chunk.temporary).size;
    renameAuditFile(chunk.temporary, path.join(directory, chunk.file));
    state.chunks.push({ file: chunk.file, records: chunk.records, firstIndex: chunk.firstIndex, lastIndex: chunk.lastIndex, bytes, sha256 });
    state.dictionary = { file: "ingredients.ndjson", entries: dictionary.registry.size, bytes: dictionary.bytes, sha256: dictionary.hash.copy().digest("hex") };
    state.elapsedSeconds = Math.round((previousElapsed + (performance.now() - started) / 1000) * 10) / 10;
    state.updatedAt = new Date().toISOString(); state.status = "partial"; state.coverageComplete = false; state.passed = false;
    jsonAtomic(manifest, state); chunk = null;
  }
  try {
    while (!stopping && invocationProcessed < limit && state.processed < run.scheduled) {
      if (!chunk) await openChunk();
      const index = shard.index + state.processed * shard.count, input = plan.inputAt(index);
      let record;
      try {
        const recipe = generate(input);
        let quality, structural;
        try { quality = assess(recipe); }
        catch (error) { quality = { version: "audit-error", score: null, issues: [{ code: "QUALITY_CHECK_ERROR", severity: "error", message: String(error).slice(0, 500) }] }; }
        try { structural = inspect(recipe, input); }
        catch (error) { structural = [{ code: "STRUCTURAL_CHECK_ERROR", detail: String(error).slice(0, 500) }]; }
        const issues = [...structural.map((issue) => ({ ...issue, severity: "error", message: issue.detail })), ...quality.issues];
        const tuples = [];
        for (const item of recipe.ingredients) {
          const ingredient = normalizedIngredient(item), key = dictionarySignature(ingredient);
          let id = dictionary.registry.get(key);
          if (id === undefined) {
            id = dictionary.registry.size + 1;
            const line = `${JSON.stringify({ id, ingredient })}\n`, bytes = Buffer.byteLength(line);
            if (dictionary.bytes + bytes > MAX_DICTIONARY_BYTES) throw Object.assign(new Error("Ingredient dictionary resource limit exceeded."), { auditFatal: true });
            await writeLine(dictionaryStream, line); dictionary.hash.update(line); dictionary.bytes += bytes; dictionary.registry.set(key, id);
          }
          tuples.push([id, Number.isFinite(item.amount) ? item.amount : String(item.amount)]);
          const summary = state.ingredientSummary[id] ?? { occurrences: 0, totalAmount: 0, minimum: null, maximum: null };
          summary.occurrences++;
          if (Number.isFinite(item.amount)) { summary.totalAmount += item.amount; summary.minimum = summary.minimum === null ? item.amount : Math.min(summary.minimum, item.amount); summary.maximum = summary.maximum === null ? item.amount : Math.max(summary.maximum, item.amount); }
          state.ingredientSummary[id] = summary;
        }
        issueSummary(state, input, index, issues);
        if (Number.isFinite(quality.score)) { state.quality.scored++; state.quality.scoreTotal += quality.score; state.quality.minimum = state.quality.minimum === null ? quality.score : Math.min(state.quality.minimum, quality.score); state.quality.maximum = state.quality.maximum === null ? quality.score : Math.max(state.quality.maximum, quality.score); }
        record = { type: "case", index, input, recipeId: recipe.id, ingredients: tuples, minutes: [recipe.prepMinutes, recipe.cookMinutes, recipe.totalMinutes], allergens: recipe.allergens, method: { kind: recipe.kind ?? "classic", steps: recipe.steps.length, finishBoundaries: recipe.steps.filter((step) => step.finishBoundary).length, equipment: recipe.equipment.length, notes: recipe.methodNotes?.length ?? 0, endpoint: recipe.safetyNote?.match(/\b(?:63|71|75)°C/)?.[0] ?? null }, quality: { version: quality.version, score: quality.score, issues: issues.map(({ code, severity, ingredientId, stepIndex }) => ({ code, severity, ...(ingredientId ? { ingredientId } : {}), ...(stepIndex !== undefined ? { stepIndex } : {}) })) } };
      } catch (error) {
        if (error?.auditFatal) throw error;
        const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
        const issue = { code: "GENERATION_OR_AUDIT_ERROR", severity: "error", message };
        issueSummary(state, input, index, [issue]); record = { type: "case", index, input, ingredients: [], error: message, quality: { issues: [issue] } };
      }
      await writeLine(chunk.gzip, `${JSON.stringify(record)}\n`);
      state.processed++; invocationProcessed++; chunk.records++; chunk.lastIndex = index;
      addCount(state.coverage.diets, input.diet); addCount(state.coverage.regions, input.regionId);
      if ("classicId" in input) state.coverage.classics++;
      else { state.coverage.meals++; addCount(state.coverage.sides, input.sideId); addCount(state.coverage.cutSelection, input.cutId ? "chosen" : "default"); }
      if (chunk.records >= chunkRecords) await commitChunk();
      if (state.processed % 500 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
        const memory = process.memoryUsage(); state.memory.heapPeak = Math.max(state.memory.heapPeak, memory.heapUsed); state.memory.rssPeak = Math.max(state.memory.rssPeak, memory.rss);
        if (performance.now() - lastProgress >= 30_000) {
          const progress = { status: "running", shard, processed: state.processed, committed: state.chunks.reduce((sum, entry) => sum + entry.records, 0), scheduled: run.scheduled, failedCases: state.failedCases, dictionaryEntries: dictionary.registry.size, heapMiB: Math.round(memory.heapUsed / 1048576), elapsedSeconds: Math.round(previousElapsed + (performance.now() - started) / 1000) };
          jsonAtomic(path.join(directory, "progress.json"), progress); emit(progress); lastProgress = performance.now();
        }
      }
    }
    await commitChunk();
    const finalSource = fingerprint(); state.sourceEnd = finalSource;
    state.coverageComplete = state.processed === run.scheduled && finalSource.sha256 === source.sha256;
    state.passed = state.coverageComplete && state.failedCases === 0;
    state.status = finalSource.sha256 !== source.sha256 ? "source-changed" : state.coverageComplete ? state.passed ? "complete" : "complete-with-errors" : stopping ? "interrupted" : "partial";
    state.updatedAt = new Date().toISOString(); state.elapsedSeconds = Math.round((previousElapsed + (performance.now() - started) / 1000) * 10) / 10;
    jsonAtomic(manifest, state); emit({ status: state.status, shard, processed: state.processed, scheduled: run.scheduled, failedCases: state.failedCases, manifest });
    return state;
  } finally {
    process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);
    if (chunk) { chunk.gzip.destroy(); await chunk.completion.catch(() => {}); }
    dictionaryStream.end(); await finished(dictionaryStream);
  }
}

export async function verifyCatalogue(out, shardCount, overrides = {}) {
  if (!path.isAbsolute(out)) throw new Error("Use an absolute catalogue output directory.");
  parseShard(`0/${shardCount}`);
  const plan = overrides.plan ?? buildCompleteCataloguePlan(), fingerprint = overrides.fingerprint ?? sourceFingerprint, source = fingerprint();
  const manifests = [], ingredientKeys = new Set();
  for (let index = 0; index < shardCount; index++) {
    const directory = path.join(out, `shard-${index}-of-${shardCount}`), state = JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8"));
    if (state.schemaVersion !== 1 || state.run.definition !== plan.definition || state.run.source.sha256 !== source.sha256 || state.sourceEnd?.sha256 !== source.sha256 || state.run.total !== plan.total || JSON.stringify(state.run.catalogue) !== JSON.stringify(plan.catalogue) || state.run.shard.index !== index || state.run.shard.count !== shardCount || state.processed !== shardCaseCount(plan.total, { index, count: shardCount }) || !state.coverageComplete) throw new Error(`Shard ${index} is incomplete or belongs to different code.`);
    await verifyCommitted(directory, state);
    const dictionary = loadDictionary(directory, state);
    for (const key of dictionary.registry.keys()) ingredientKeys.add(key);
    manifests.push({ file: path.relative(out, path.join(directory, "manifest.json")).replaceAll("\\", "/"), sha256: await fileHash(path.join(directory, "manifest.json")), processed: state.processed, failedCases: state.failedCases, warningCases: state.warningCases, chunks: state.chunks.length, ingredients: state.dictionary.entries });
  }
  if (fingerprint().sha256 !== source.sha256) throw new Error("Source changed during final catalogue verification.");
  const checked = manifests.reduce((sum, state) => sum + state.processed, 0), failedCases = manifests.reduce((sum, state) => sum + state.failedCases, 0);
  const result = { schemaVersion: 1, status: failedCases ? "complete-with-errors" : "complete", coverageComplete: checked === plan.total, passed: checked === plan.total && failedCases === 0, source, plan: description(plan), checked, failedCases, distinctIngredientEntries: ingredientKeys.size, manifests, verifiedAt: new Date().toISOString() };
  jsonAtomic(path.join(out, "completion.json"), result); return result;
}

export function optionsFrom(argv) {
  const options = { mode: "plan", shard: { index: 0, count: 1 }, out: "", chunkRecords: 100_000 };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--plan") options.mode = "plan";
    else if (value === "--full") options.mode = "full";
    else if (value === "--verify") options.mode = "verify";
    else if (value === "--out") options.out = argv[++index] ?? "";
    else if (value === "--shard") options.shard = parseShard(argv[++index]);
    else if (value === "--limit") options.limit = Number(argv[++index]);
    else if (value === "--chunk-records") options.chunkRecords = Number(argv[++index]);
    else if (value === "--help" || value === "-h") options.mode = "help";
    else throw new Error(`Unknown argument:${value}`);
  }
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 0)) throw new Error("Limit must be a non-negative integer.");
  if (["full", "verify"].includes(options.mode) && (!options.out || !path.isAbsolute(options.out))) throw new Error("Pass an absolute --out directory on D:.");
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = optionsFrom(argv), plan = buildCompleteCataloguePlan();
  console.log(JSON.stringify({ mode: options.mode, plan: description(plan), shard: options.shard, scheduled: shardCaseCount(plan.total, options.shard), source: loadedSource }));
  if (options.mode === "help") { console.log("Default/--plan: counts only. --full --out D:/audit --shard 0/2; add --limit 100 for partial smoke. Same command automatically resumes identical code/settings. --verify --out D:/audit --shard 0/2 verifies both completed workers. Node22.13 with --experimental-strip-types; gzip level1,100k-record chunks, no full recipe methods copied."); return 0; }
  if (options.mode === "plan") return 0;
  const result = options.mode === "verify" ? await verifyCatalogue(options.out, options.shard.count) : await runCatalogue(options);
  return result.status === "interrupted" ? 130 : result.status === "source-changed" || result.failedCases ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; }
}
