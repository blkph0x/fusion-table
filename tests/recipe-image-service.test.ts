import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { RecipeImageService, recipeImageKey, recipeImagePrompt } from "../app/api/plate/image-service.ts";
import { encodeShare, recipeFromShare, type ShareSpec } from "../lib/share-recipe.ts";
import type { PlatePicture } from "../lib/plate-picture.ts";

const TEMP = path.resolve("work/culinary-temp"); mkdirSync(TEMP, { recursive: true });
const spec: ShareSpec = { v: 1, kind: "meal", mainId: "chicken", methodId: "grilled", regionId: "thai", sideId: "rice-greens", diet: "balanced", spiceHeat: "medium", servings: 4, seed: 42 };
const picture = (): PlatePicture => ({ bytes: new Uint8Array(64).fill(1), contentType: "image/png", note: "Test illustration" });
const placeholder = async (): Promise<PlatePicture> => ({ ...picture(), placeholder: true });
function setup(t: { after: (callback: () => void) => void }) {
  const dir = mkdtempSync(path.join(TEMP, "image-service-")); t.after(() => { assert.ok(path.resolve(dir).startsWith(`${TEMP}${path.sep}`)); rmSync(dir, { force: true, recursive: true }); });
  return { dir, automatic: false, endpoint: () => "http://127.0.0.1:7860", still: placeholder };
}

test("full image identity includes every ingredient, quantity and cooking form", () => {
  const recipe = recipeFromShare(spec), key = recipeImageKey(recipe);
  assert.equal(key.length, 64);
  assert.ok(recipe.ingredients.length > 16);
  const changed = { ...recipe, ingredients: recipe.ingredients.map((item, index) => index === recipe.ingredients.length - 1 ? { ...item, amount: item.amount + 1 } : item) };
  assert.notEqual(recipeImageKey(changed), key);
  assert.notEqual(recipeImageKey({ ...recipe, methodId: "steamed" }), key);
  assert.ok(recipeImagePrompt(recipe).includes(recipe.ingredients.at(-1)!.name));
});
test("missing images queue immediately, deduplicate and survive service restart", async (t) => {
  const options = setup(t), token = encodeShare(spec), recipe = recipeFromShare(spec); let calls = 0;
  const render = async () => { calls++; return picture(); };
  const service = new RecipeImageService({ ...options, render });
  assert.equal((await service.request(token, recipe)).status, "queued");
  await service.request(token, recipe);
  assert.equal(calls, 0, "a request never waits for model inference");
  assert.equal(JSON.parse(readFileSync(path.join(options.dir, "queue.json"), "utf8")).jobs.length, 1);
  const restarted = new RecipeImageService({ ...options, render }); await restarted.workOnce();
  assert.equal(calls, 1);
  const cached = await service.request(token, recipe);
  assert.equal(cached.status, "ready"); assert.deepEqual(cached.picture?.bytes, picture().bytes);
  await restarted.workOnce(); assert.equal(calls, 1);
});
test("a durable renderer claim prevents duplicate work across service instances", async (t) => {
  const options = setup(t), token = encodeShare(spec), recipe = recipeFromShare(spec); let release!: (image: PlatePicture) => void, calls = 0;
  const render = () => { calls++; return new Promise<PlatePicture>((resolve) => { release = resolve; }); };
  const first = new RecipeImageService({ ...options, render }), second = new RecipeImageService({ ...options, render });
  await first.request(token, recipe); const working = first.workOnce();
  assert.equal((await second.request(token, recipe)).status, "rendering"); assert.equal(await second.workOnce(), false); assert.equal(calls, 1);
  release(picture()); await working; assert.equal((await second.request(token, recipe)).status, "ready");
});
test("retry delays, attempt budgets and pending capacity are enforced", async (t) => {
  const options = setup(t); let now = 1_000_000, calls = 0;
  const service = new RecipeImageService({ ...options, now: () => now, maxPending: 1, hourlyAttempts: 2, render: async () => { calls++; return null; } });
  const token = encodeShare(spec), recipe = recipeFromShare(spec); await service.request(token, recipe); await service.workOnce();
  assert.equal((await service.request(token, recipe)).status, "retry"); await service.workOnce(); assert.equal(calls, 1);
  now += 30_001; await service.workOnce(); assert.equal(calls, 2); now += 60_001; await service.workOnce(); assert.equal(calls, 2);
  const other = { ...spec, seed: 43 }; assert.equal((await service.request(encodeShare(other), recipeFromShare(other))).status, "full");
});
test("requested images take priority over warm jobs and unavailable model is explicit", async (t) => {
  const options = setup(t), order: string[] = [], service = new RecipeImageService({ ...options, render: async (_recipe, key) => { order.push(key); return picture(); } });
  const secondSpec = { ...spec, seed: 81 }, first = recipeFromShare(spec), second = recipeFromShare(secondSpec);
  await service.request(encodeShare(spec), first, 0); await service.request(encodeShare(secondSpec), second, 1); await service.workOnce();
  assert.equal(order[0], recipeImageKey(second));
  const offline = new RecipeImageService({ ...options, endpoint: () => null });
  assert.equal((await offline.request(encodeShare(spec), first)).status, "unavailable");
});
test("persistent cache obeys entry and byte budgets", async (t) => {
  const options = setup(t), service = new RecipeImageService({ ...options, maxEntries: 1, maxBytes: 64, render: async () => picture() });
  for (const seed of [42, 43]) { const input = { ...spec, seed }; await service.request(encodeShare(input), recipeFromShare(input)); await service.workOnce(); }
  const jobs = JSON.parse(readFileSync(path.join(options.dir, "queue.json"), "utf8")).jobs;
  assert.equal(jobs.filter((job: { status: string }) => job.status === "ready").length, 1);
});

test("expired renderer leases resume and obsolete queued versions cannot block new work", async (t) => {
  const options = setup(t); let now = Date.now();
  const first = new RecipeImageService({ ...options, now: () => now }), recipe = recipeFromShare(spec), token = encodeShare(spec);
  await first.request(token, recipe);
  const file = path.join(options.dir, "queue.json"), state = JSON.parse(readFileSync(file, "utf8"));
  state.jobs[0].status = "rendering"; state.jobs[0].lease = now - 1;
  state.jobs.push({ ...state.jobs[0], key: "a".repeat(64), status: "queued", version: "obsolete-version" });
  writeFileSync(file, JSON.stringify(state));
  let calls = 0;
  const restarted = new RecipeImageService({ ...options, now: () => now, render: async () => { calls++; return picture(); } });
  now += 1; await restarted.workOnce();
  assert.equal(calls, 1); assert.equal((await restarted.request(token, recipe)).status, "ready");
  assert.equal(JSON.parse(readFileSync(file, "utf8")).jobs.length, 1);
});
