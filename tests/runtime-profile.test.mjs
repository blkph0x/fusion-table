import assert from "node:assert/strict";
import { test } from "node:test";
import { readRuntimeProfile } from "../scripts/runtime-profile.mjs";

test("runtime selection keeps Worker as the default and requires an explicit Node profile", () => {
  assert.equal(readRuntimeProfile(""), "worker");
  assert.equal(readRuntimeProfile("worker"), "worker");
  assert.equal(readRuntimeProfile("node"), "node");
  assert.throws(() => readRuntimeProfile("automatic"), /node or worker/);
  assert.throws(() => readRuntimeProfile("node;anything"), /node or worker/);
});
