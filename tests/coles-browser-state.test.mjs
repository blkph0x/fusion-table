import assert from "node:assert/strict";
import { test } from "node:test";
import { chmod, lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readColesBrowserState, saveColesBrowserState } from "../lib/coles-browser-state.mjs";

const cookie = (extra = {}) => ({ name: "anonymous_bot_cookie", value: "fixture-only", domain: ".coles.com.au", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax", ...extra });
const state = (extra = {}) => ({ cookies: [cookie()], origins: [], ...extra });
async function workspace(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "fusion-coles-state-"));
  try { await run(path.join(directory, "state.json"), directory); }
  finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(directory).startsWith("fusion-coles-state-"));
    await rm(directory, { recursive: true, force: true });
  }
}

test("anonymous first-party state round-trips through a private versioned atomic file", async () => workspace(async (file, directory) => {
  assert.equal(await saveColesBrowserState(file, state()), true);
  assert.deepEqual(await readColesBrowserState(file), state());
  const envelope = JSON.parse(await readFile(file, "utf8"));
  assert.equal(envelope.version, 1); assert.ok(Number.isFinite(Date.parse(envelope.savedAt)));
  assert.deepEqual(await readdir(directory), ["state.json"]);
  if (process.platform !== "win32") assert.equal((await lstat(file)).mode & 0o777, 0o600);
  assert.equal(await saveColesBrowserState(file, state({ cookies: [cookie({ value: "replacement" })] })), true);
  assert.equal((await readColesBrowserState(file)).cookies[0].value, "replacement");
}));

test("foreign, expired, malformed and account state is minimized without retaining extra fields", async () => workspace(async file => {
  const input = state({ cookies: [cookie({ extra: "ignored" }), cookie({ name: "other", domain: "coles.com.au.evil.invalid" }), cookie({ name: "expired", expires: Date.now() / 1000 - 1 }), cookie({ name: "access_token" }), cookie({ name: "bad", sameSite: "invalid" }), cookie({ name: "invalid name" }), cookie({ name: "invalid-expiry", expires: 1e100 }), cookie({ name: "foreign-partition", partitionKey: "https://elsewhere.invalid" })], origins: [
    { origin: "https://www.coles.com.au", indexedDB: ["ignored"], localStorage: [{ name: "consent", value: "yes", extra: "ignored" }, { name: "customerProfile", value: "private" }] },
    ...["http://www.coles.com.au", "https://www.coles.com.au/visitor", "https://www.coles.com.au:443", "https://coles.com.au", "https://www.coles.com.au.evil.invalid"].map(origin => ({ origin, localStorage: [{ name: "foreign", value: "drop" }] })),
  ] });
  assert.equal(await saveColesBrowserState(file, input), true);
  const restored = await readColesBrowserState(file);
  assert.deepEqual(restored, { cookies: [cookie()], origins: [{ origin: "https://www.coles.com.au", localStorage: [{ name: "consent", value: "yes" }] }] });
  assert.equal((await readFile(file, "utf8")).includes("private"), false);
}));

test("relative paths and empty or invalid state fail closed without throwing", async () => {
  assert.equal(await readColesBrowserState("state.json"), undefined);
  assert.equal(await saveColesBrowserState("state.json", state()), false);
  await workspace(async file => {
    assert.equal(await readColesBrowserState(file), undefined);
    for (const invalid of [null, {}, { cookies: [], origins: [] }, state({ cookies: [cookie({ domain: "evil-coles.com.au" })] })]) assert.equal(await saveColesBrowserState(file, invalid), false);
    assert.equal(await readColesBrowserState(file), undefined);
  });
});

test("corrupt, old, future and oversized envelopes cannot restore browser state", async () => workspace(async file => {
  for (const body of ["broken json", JSON.stringify({ version: 2, savedAt: new Date().toISOString(), state: state() }), ...[-8 * 86400_000, 10 * 60_000].map(offset => JSON.stringify({ version: 1, savedAt: new Date(Date.now() + offset).toISOString(), state: state() })), "x".repeat(256 * 1024 + 1)]) {
    await writeFile(file, body, { mode: 0o600 });
    assert.equal(await readColesBrowserState(file), undefined);
  }
}));

test("oversized sanitized writes preserve the previous complete state and concurrent writes stay atomic", async () => workspace(async (file, directory) => {
  assert.equal(await saveColesBrowserState(file, state()), true);
  const oversized = state({ origins: [{ origin: "https://www.coles.com.au", localStorage: Array.from({ length: 9 }, (_, index) => ({ name: `key-${index}`, value: "x".repeat(32768) })) }] });
  assert.equal(await saveColesBrowserState(file, oversized), false);
  assert.deepEqual(await readColesBrowserState(file), state());
  assert.deepEqual(await Promise.all(Array.from({ length: 6 }, (_, index) => saveColesBrowserState(file, state({ cookies: [cookie({ value: `state-${index}` })] })))), Array(6).fill(true));
  assert.equal((await readColesBrowserState(file)).cookies[0].value, "state-5");
  assert.deepEqual(await readdir(directory), ["state.json"]);
}));

test("separate service state roots retain independent complete snapshots across concurrent processes", async () => workspace(async (_file, directory) => {
  const production = path.join(directory, "production", "coles-state.json");
  const canary = path.join(directory, "canary-20261028-085054", "coles-state.json");
  const moduleUrl = new URL("../lib/coles-browser-state.mjs", import.meta.url).href;
  const child = promisify(execFile);
  const persist = async (filename, value) => {
    const source = `import { saveColesBrowserState } from ${JSON.stringify(moduleUrl)};\nconst [file,state]=process.argv.slice(1);\nif(!await saveColesBrowserState(file,JSON.parse(state)))process.exitCode=1;`;
    const result = await child(process.execPath, ["--input-type=module", "--eval", source, filename, JSON.stringify(state({ cookies: [cookie({ value })] }))], { windowsHide: true, timeout: 10_000 });
    assert.equal(result.stdout, ""); assert.equal(result.stderr, "");
  };
  await Promise.all([persist(production, "production-fixture"), persist(canary, "canary-fixture")]);
  assert.equal((await readColesBrowserState(production)).cookies[0].value, "production-fixture");
  assert.equal((await readColesBrowserState(canary)).cookies[0].value, "canary-fixture");
  const originalCanary = await readFile(canary);
  await persist(production, "production-replacement");
  assert.deepEqual(await readFile(canary), originalCanary, "production replacement cannot alter a separate canary snapshot");
  assert.equal((await readColesBrowserState(production)).cookies[0].value, "production-replacement");
  if (process.platform !== "win32") {
    for (const filename of [production, canary]) assert.equal((await lstat(filename)).mode & 0o777, 0o600);
  }
}));

test("symlink destinations cannot be read or replaced", async t => workspace(async (file, directory) => {
  const real = path.join(directory, "real.json");
  assert.equal(await saveColesBrowserState(real, state()), true);
  try { await symlink(real, file); }
  catch (error) { if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) { t.skip("Host does not permit creating test symlinks."); return; } throw error; }
  assert.equal(await readColesBrowserState(file), undefined);
  assert.equal(await saveColesBrowserState(file, state({ cookies: [cookie({ value: "must-not-overwrite" })] })), false);
  assert.equal((await readColesBrowserState(real)).cookies[0].value, "fixture-only");
}));

test("unsafe POSIX permissions are rejected without repairing an operator file", { skip: process.platform === "win32" }, async () => workspace(async file => {
  assert.equal(await saveColesBrowserState(file, state()), true);
  await chmod(file, 0o644);
  assert.equal(await readColesBrowserState(file), undefined);
  assert.equal(await saveColesBrowserState(file, state()), false);
  assert.equal((await lstat(file)).mode & 0o777, 0o644);
}));
