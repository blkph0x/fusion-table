import assert from "node:assert/strict";
import { test } from "node:test";
import { PlateCache, plateRenderConcurrency } from "../lib/plate-cache.ts";
import { plateModelTimeout, type PlatePicture } from "../lib/plate-picture.ts";

const picture = (bytes = 10): PlatePicture => ({ bytes: new Uint8Array(bytes), contentType: "image/png", note: "Fake image" });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("identical concurrent image requests share one render and then use the cache", async () => {
  const cache = new PlateCache();
  const ready = deferred<PlatePicture>();
  let calls = 0;
  const render = async () => { calls += 1; return ready.promise; };
  const one = cache.get("same-recipe", render);
  const two = cache.get("same-recipe", render);
  await Promise.resolve();
  assert.equal(calls, 1);
  ready.resolve(picture());
  const values = await Promise.all([one, two]);
  assert.equal(values[0].picture, values[1].picture);
  assert.equal((await cache.get("same-recipe", render)).source, "cached");
  assert.equal(calls, 1);
});

test("failed images release their slot and can be rendered again", async () => {
  const cache = new PlateCache({ maxConcurrent: 1 });
  await assert.rejects(cache.get("retry", async () => { throw new Error("Renderer unavailable"); }), /unavailable/);
  let usedModel = false;
  const retried = await cache.get("retry", async (model) => { usedModel = model; return picture(); });
  assert.equal(usedModel, true);
  assert.equal(retried.source, "rendered");
  assert.equal(cache.size, 1);
});

test("image cache evicts least-recently-used entries by both byte and entry budgets", async () => {
  const cache = new PlateCache({ maxEntries: 2, maxBytes: 24 });
  const render = async () => picture();
  await cache.get("one", render);
  await cache.get("two", render);
  await cache.get("one", render);
  await cache.get("three", render);
  assert.equal(cache.size, 2);
  assert.equal(cache.byteSize, 20);
  assert.equal((await cache.get("one", render)).source, "cached");
  assert.equal((await cache.get("two", render)).source, "rendered");
  await cache.get("large", async () => picture(24));
  assert.equal(cache.size, 1);
  assert.equal(cache.byteSize, 24);
  await cache.get("uncacheable", async () => picture(25));
  assert.equal(cache.size, 1);
  assert.equal(cache.byteSize, 24);
});

test("capacity overflow paints immediately instead of queuing model work and retries after a short cache", async () => {
  let now = 1000;
  const cache = new PlateCache({ maxConcurrent: 1, fallbackMs: 5000, now: () => now });
  const ready = deferred<PlatePicture>();
  let modelCalls = 0;
  const first = cache.get("first", async (model) => { assert.equal(model, true); modelCalls += 1; return ready.promise; });
  const overflow = await cache.get("second", async (model) => { assert.equal(model, false); return picture(); });
  assert.equal(overflow.source, "fallback");
  assert.equal(overflow.maxAgeSeconds, 5);
  assert.equal(modelCalls, 1, "overflow finishes while the only model call remains blocked");
  assert.equal((await cache.get("second", async () => { throw new Error("Should use short cache"); })).source, "cached");
  ready.resolve(picture());
  await first;
  now += 5001;
  const upgraded = await cache.get("second", async (model) => { assert.equal(model, true); modelCalls += 1; return picture(); });
  assert.equal(upgraded.source, "rendered");
  assert.equal(modelCalls, 2);
});

test("model configuration has bounded defaults and cannot restore a four-minute request", () => {
  assert.equal(plateModelTimeout(""), 20_000);
  assert.equal(plateModelTimeout("invalid"), 20_000);
  assert.equal(plateModelTimeout("45000"), 45_000);
  assert.equal(plateModelTimeout("240000"), 60_000);
  assert.equal(plateModelTimeout("1"), 1000);
  assert.equal(plateRenderConcurrency(""), 2);
  assert.equal(plateRenderConcurrency("3"), 3);
  assert.equal(plateRenderConcurrency("1000"), 4);
  assert.equal(plateRenderConcurrency("-1"), 2);
});

test("the default allows two full renders while other unique requests get immediate fallbacks", async () => {
  const cache = new PlateCache();
  const ready = deferred<PlatePicture>();
  let fullRenders = 0;
  const render = async (model: boolean) => {
    if (!model) return picture();
    fullRenders += 1;
    return ready.promise;
  };
  const first = cache.get("first", render);
  const second = cache.get("second", render);
  const overflow = await Promise.all(Array.from({ length: 8 }, (_, index) => cache.get(`overflow-${index}`, render)));
  assert.equal(fullRenders, 2);
  assert.ok(overflow.every((result) => result.source === "fallback"));
  ready.resolve(picture());
  await Promise.all([first, second]);
});

test("a configured-model failure keeps its normal-slot fallback temporary and retries for quality", async () => {
  let now = 1000;
  let attempts = 0;
  const cache = new PlateCache({ now: () => now });
  const render = async (model: boolean) => {
    assert.equal(model, true);
    attempts += 1;
    return attempts === 1 ? { ...picture(), temporary: true } : picture();
  };
  const failedModel = await cache.get("recover-quality", render);
  assert.equal(failedModel.source, "fallback");
  assert.equal(failedModel.maxAgeSeconds, 5);
  assert.equal((await cache.get("recover-quality", render)).source, "cached");
  assert.equal(attempts, 1);
  now += 5001;
  const recovered = await cache.get("recover-quality", render);
  assert.equal(recovered.source, "rendered");
  assert.equal(recovered.maxAgeSeconds, 86400);
  assert.equal(attempts, 2);
});
