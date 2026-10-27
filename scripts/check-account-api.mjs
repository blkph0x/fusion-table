import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const option = (key, fallback) => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };
const base = option("--url", "http://127.0.0.1:8793/fusion").replace(/\/$/, "");
const origin = option("--origin", process.env.FUSION_AUTH_ORIGIN || new URL(base).origin);
const out = option("--out", "");
if (process.env.FUSION_AUTH_API_TEST !== "1") throw new Error("Set FUSION_AUTH_API_TEST=1 and use an isolated test deployment/database.");
const run = randomUUID();
const password = `Private-test-${randomBytes(24).toString("base64url")}`;
const replacement = `Replacement-${randomBytes(24).toString("base64url")}`;
const accounts = [];
const outcomes = [];
const record = (name) => outcomes.push({ name, passed: true });

async function call(path = "", { method = "GET", cookie = "", body, headers = {} } = {}) {
  const response = await fetch(`${base}/api/account${path}`, { method, redirect: "manual", headers: { ...(cookie ? { cookie } : {}), ...(method !== "GET" ? { origin, "x-fusion-request": "account", "content-type": "application/json" } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  assert.doesNotMatch(JSON.stringify(data), /passwordHash|tokenHash|password_hash|SELECT .+ FROM|ER_ACCESS_DENIED/i);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  return { status: response.status, data, cookie: response.headers.get("set-cookie") || "" };
}
const pair = (cookie) => cookie.split(";")[0];
let report;

try {
  const guest = await call();
  assert.equal(guest.status, 200);
  assert.equal(guest.data.available, true);
  assert.equal(guest.data.user, null);
  const denied = await call("/state", { method: "PUT", body: { version: 0, data: {} } });
  assert.equal(denied.status, 401);
  record("guest mode is available and private state requires authentication");

  for (const headers of [{ origin: "https://attacker.invalid" }, { "x-fusion-request": "" }, { "content-type": "text/plain" }, { "sec-fetch-site": "cross-site" }]) {
    const result = await call("", { method: "POST", body: { action: "logout" }, headers });
    assert.ok([403, 415].includes(result.status));
  }
  record("strict origin, custom request header, JSON and fetch-site CSRF checks");

  const signup = async (suffix, remember) => {
    const email = `audit-${run}-${suffix}@example.invalid`;
    const result = await call("", { method: "POST", body: { action: "signup", email, password, displayName: "Audit cook", remember } });
    assert.equal(result.status, 200);
    assert.equal(result.data.user.email, email);
    assert.equal(result.data.state, null);
    assert.match(result.cookie, /HttpOnly/);
    assert.match(result.cookie, /SameSite=Lax/);
    if (origin.startsWith("https:")) assert.match(result.cookie, /; Secure/);
    if (remember) assert.match(result.cookie, /Max-Age=2592000/); else assert.doesNotMatch(result.cookie, /Max-Age/);
    accounts.push({ id: result.data.user.id, email });
    return { ...result, pair: pair(result.cookie), email, id: result.data.user.id };
  };
  const a = await signup("a", true);
  const b = await signup("b", false);
  assert.notEqual(a.id, b.id);
  record("independent SQL accounts issue secure remembered or browser-only cookies");

  const kitchen = { saved: [{ title: "Private Thai bowl" }], preferences: { servings: 4 }, pantry: "rice" };
  const saved = await call("/state", { method: "PUT", cookie: a.pair, body: { userId: a.id, version: 0, data: kitchen } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.state.version, 1);
  assert.deepEqual((await call("/state", { cookie: a.pair })).data.state.data, kitchen);
  assert.equal((await call("/state", { cookie: b.pair })).data.state, null);
  const stale = await call("/state", { method: "PUT", cookie: a.pair, body: { userId: a.id, version: 0, data: { overwritten: true } } });
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.data.state.data, kitchen);
  const switched = await call("/state", { method: "PUT", cookie: b.pair, body: { userId: a.id, version: 0, data: kitchen } });
  assert.equal(switched.status, 409);
  assert.equal((await call("/state", { cookie: b.pair })).data.state, null);
  record("private state, stale-version conflict and cross-tab account identity checks");

  const races = await Promise.all(Array.from({ length: 4 }, (_, index) => call("/state", { method: "PUT", cookie: a.pair, body: { userId: a.id, version: 1, data: { ...kitchen, index } } })));
  assert.equal(races.filter((row) => row.status === 200).length, 1);
  assert.equal(races.filter((row) => row.status === 409).length, 3);
  assert.equal((await call("/state", { cookie: a.pair })).data.state.version, 2);
  record("concurrent HTTP writes allow exactly one winner without lost updates");

  for (const email of [a.email, `missing-${run}@example.invalid`]) {
    const rejected = await call("", { method: "POST", body: { action: "login", email, password: "wrong" } });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.data.error, "The email or password did not match.");
  }
  const secondary = await call("", { method: "POST", body: { action: "login", email: a.email, password } });
  assert.equal(secondary.status, 200);
  assert.notEqual(pair(secondary.cookie), a.pair);
  record("login checks real password hashes and rotates opaque session tokens");

  const badPassword = await call("", { method: "POST", cookie: a.pair, body: { action: "password", currentPassword: "wrong", newPassword: replacement } });
  assert.equal(badPassword.status, 401);
  const changed = await call("", { method: "POST", cookie: a.pair, body: { action: "password", currentPassword: password, newPassword: replacement } });
  assert.equal(changed.status, 200);
  assert.equal((await call("", { cookie: a.pair })).data.user, null);
  assert.equal((await call("", { cookie: pair(secondary.cookie) })).data.user, null);
  const active = pair(changed.cookie);
  assert.equal((await call("", { cookie: active })).data.user.id, a.id);
  record("password change rotates current session and invalidates all old sessions");

  const logoutAll = await call("", { method: "POST", cookie: active, body: { action: "logout-all" } });
  assert.equal(logoutAll.status, 200);
  assert.match(logoutAll.cookie, /Max-Age=0/);
  assert.equal((await call("/state", { cookie: active })).status, 401);
  const relogged = await call("", { method: "POST", body: { action: "login", email: a.email, password: replacement } });
  assert.equal(relogged.status, 200);
  assert.equal(relogged.data.state.version, 2);
  const logout = await call("", { method: "POST", cookie: pair(relogged.cookie), body: { action: "logout" } });
  assert.equal(logout.status, 200);
  assert.equal((await call("", { cookie: pair(relogged.cookie) })).data.user, null);
  record("logout, revoke-all and later sign-in preserve private saved kitchen");

  report = { checkedAt: new Date().toISOString(), url: base, outcomes, passed: outcomes.length, testAccountsForExactSqlCleanup: accounts };
  if (out) await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (out) await writeFile(out, `${JSON.stringify({ checkedAt: new Date().toISOString(), outcomes, testAccountsForExactSqlCleanup: accounts, failed: error.message }, null, 2)}\n`, { mode: 0o600 });
  throw error;
}
