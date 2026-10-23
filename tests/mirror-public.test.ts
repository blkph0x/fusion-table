import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { mirrorPublic, publishedBase } from "../scripts/mirror-public.mjs";

const root = mkdtempSync(join(tmpdir(), "fusion-mirror-"));
after(() => rmSync(root, { recursive: true, force: true }));

test("a base path is taken from the environment or next.config, and nowhere else", () => {
  assert.equal(publishedBase("const nextConfig = {};", ""), "");
  assert.equal(publishedBase("basePath: \"/fusion\",", ""), "/fusion");
  assert.equal(publishedBase("basePath: \"/fusion\",", "/preview"), "/preview");
  assert.equal(publishedBase("basePath: \"/fusion/../etc\",", ""), "");
  assert.equal(publishedBase("", "/"), "");
});

test("public pictures are copied under the prefix without touching other built files", () => {
  const publicDir = join(root, "public");
  const clientDir = join(root, "client");
  mkdirSync(join(publicDir, "images"), { recursive: true });
  writeFileSync(join(publicDir, "images", "hero.png"), "png");
  writeFileSync(join(publicDir, "favicon.svg"), "<svg>");
  mkdirSync(join(clientDir, "fusion", "_next"), { recursive: true });
  writeFileSync(join(clientDir, "fusion", "_next", "keep.js"), "keep");
  assert.equal(mirrorPublic(publicDir, clientDir, "/fusion"), true);
  assert.equal(readFileSync(join(clientDir, "fusion", "images", "hero.png"), "utf8"), "png");
  assert.equal(readFileSync(join(clientDir, "fusion", "favicon.svg"), "utf8"), "<svg>");
  assert.equal(readFileSync(join(clientDir, "fusion", "_next", "keep.js"), "utf8"), "keep");
  assert.equal(mirrorPublic(publicDir, clientDir, ""), false);
});
