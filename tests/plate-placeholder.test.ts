import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { generateMeal } from "../lib/meals.ts";
import { plateModelSize, plateModelSteps, platePlaceholder, renderPlate } from "../lib/plate-picture.ts";
import { PLATE_IMAGE_VERSION } from "../lib/plate-version.ts";

test("the fallback is an explicit restrained placeholder with escaped recipe text", () => {
  const bytes = platePlaceholder({ title: 'Dinner & greens <script>alert("x")</script>' });
  const svg = new TextDecoder().decode(bytes);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.match(svg, /Recipe image unavailable/);
  assert.match(svg, /Ingredients and method are ready below/);
  assert.match(svg, /Dinner &amp; greens &lt;script&gt;/);
  assert.equal(svg.includes("<script>"), false);
  assert.equal(svg.includes("<image"), false, "no unrelated food photo is embedded");
  assert.ok(bytes.byteLength < 5000);
  assert.ok(PLATE_IMAGE_VERSION.length > 0);
});

test("no-model fallback stays normal while a failed configured model is temporary", async () => {
  const previous = process.env.FUSION_LOCAL_IMAGE_URL;
  const previousSize = process.env.FUSION_LOCAL_IMAGE_SIZE;
  const previousSteps = process.env.FUSION_LOCAL_IMAGE_STEPS;
  const bodies: Record<string, unknown>[] = [];
  const fetched = mock.method(globalThis, "fetch", async (_input: unknown, init?: { body?: unknown }) => {
    bodies.push(JSON.parse(String(init?.body || "{}")));
    return Response.json({ images: [] });
  });
  const recipe = generateMeal({ mainId: "tofu", methodId: "stir-fried", regionId: "korean", sideId: "sesame-spinach", servings: 2 });
  try {
    delete process.env.FUSION_LOCAL_IMAGE_URL;
    const unconfigured = await renderPlate(recipe);
    assert.equal(unconfigured.contentType, "image/svg+xml");
    assert.equal(unconfigured.placeholder, true);
    assert.equal(unconfigured.temporary, undefined);
    assert.equal(fetched.mock.callCount(), 0);
    process.env.FUSION_LOCAL_IMAGE_URL = "http://127.0.0.1:7860";
    process.env.FUSION_LOCAL_IMAGE_SIZE = "384";
    process.env.FUSION_LOCAL_IMAGE_STEPS = "2";
    const failed = await renderPlate(recipe);
    assert.equal(failed.contentType, "image/svg+xml");
    assert.equal(failed.placeholder, true);
    assert.equal(failed.temporary, true);
    assert.equal(fetched.mock.callCount(), 1, "only the intercepted fake model was called");
    assert.deepEqual([bodies[0].width, bodies[0].height, bodies[0].steps], [384, 384, 2]);
    const skipped = await renderPlate(recipe, { model: false });
    assert.equal(skipped.placeholder, true);
    assert.equal(skipped.temporary, undefined);
    assert.equal(fetched.mock.callCount(), 1);
  } finally {
    fetched.mock.restore();
    if (previous === undefined) delete process.env.FUSION_LOCAL_IMAGE_URL;
    else process.env.FUSION_LOCAL_IMAGE_URL = previous;
    if (previousSize === undefined) delete process.env.FUSION_LOCAL_IMAGE_SIZE;
    else process.env.FUSION_LOCAL_IMAGE_SIZE = previousSize;
    if (previousSteps === undefined) delete process.env.FUSION_LOCAL_IMAGE_STEPS;
    else process.env.FUSION_LOCAL_IMAGE_STEPS = previousSteps;
  }
});

test("local image size and step budgets keep the original defaults and reject unsupported values", () => {
  assert.equal(plateModelSize(""), 512);
  for (const size of ["256", "384", "512"]) assert.equal(plateModelSize(size), Number(size));
  for (const size of ["0", "1024", "384.5", "invalid"]) assert.equal(plateModelSize(size), 512);
  assert.equal(plateModelSteps(""), 4);
  for (const steps of ["1", "2", "3", "4"]) assert.equal(plateModelSteps(steps), Number(steps));
  for (const steps of ["0", "5", "-1", "2.5", "invalid"]) assert.equal(plateModelSteps(steps), 4);
});
