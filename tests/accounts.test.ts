import assert from "node:assert/strict";
import { test } from "node:test";
import { HashBusyError, newSessionToken, passwordHash, rateHash, sessionHash, verifyPassword } from "../lib/auth-crypto.ts";
import { AccountError, accountConfig, accountCookieName, assertAccountMutation, checkedDisplayName, checkedPassword, checkedState, MAX_ACCOUNT_STATE_BYTES, normalizedEmail, readAccountJson, readSessionToken, REMEMBER_AGE_MS, REMEMBER_IDLE_MS, SESSION_AGE_MS, sessionCookie } from "../lib/auth-security.ts";
import { AccountService } from "../lib/auth-service.ts";
import type { AccountConfig, AccountSession, AccountState, AccountStore, PrivateAccountUser } from "../lib/auth-types.ts";

const config: AccountConfig = { origin: "https://fusion.example", path: "/fusion/", secure: true, rateSecret: "a-private-test-secret-with-32-characters" };
const password = "A long private test passphrase!";
const http = (cookie = "") => new Request("https://fusion.example/fusion/api/account", { headers: { cookie } });
const cookiePair = (cookie: string) => cookie.split(";")[0];
type SessionResult = { available: boolean; user: { id: string; email: string; displayName: string } | null; state: AccountState | null; session?: { persistent: boolean; expiresAt: number; idleExpiresAt: number } };

class MemoryStore implements AccountStore {
  users = new Map<string, PrivateAccountUser>();
  sessions = new Map<string, AccountSession>();
  states = new Map<string, AccountState>();
  rates = new Map<string, { bucket: number; hits: number }>();
  async ping() {}
  async userByEmail(email: string) { return [...this.users.values()].find((user) => user.email === email) || null; }
  async createUser(user: PrivateAccountUser, now: number) {
    if (await this.userByEmail(user.email)) return false;
    this.users.set(user.id, { ...user });
    this.states.set(user.id, { version: 0, data: {}, updatedAt: now });
    return true;
  }
  async putSession(session: AccountSession) { this.sessions.set(session.tokenHash, { ...session }); }
  async sessionByHash(hash: string) {
    const session = this.sessions.get(hash);
    const user = session && this.users.get(session.userId);
    return session && user ? { session: { ...session }, user: { ...user } } : null;
  }
  async touchSession(hash: string, now: number) { const session = this.sessions.get(hash); if (session) session.lastSeenAt = Math.max(session.lastSeenAt, now); }
  async deleteSession(hash: string) { this.sessions.delete(hash); }
  async revokeSessions(userId: string) {
    this.users.get(userId)!.authVersion++;
    for (const [key, session] of this.sessions) if (session.userId === userId) this.sessions.delete(key);
  }
  async changePassword(userId: string, oldHash: string, newHash: string) {
    const user = this.users.get(userId)!;
    if (user.passwordHash !== oldHash) return false;
    user.passwordHash = newHash;
    await this.revokeSessions(userId);
    return true;
  }
  async takeRate(key: string, now: number, windowMs: number, maximum: number) {
    const bucket = Math.floor(now / windowMs) * windowMs;
    const current = this.rates.get(key);
    const next = { bucket, hits: current?.bucket === bucket ? current.hits + 1 : 1 };
    this.rates.set(key, next);
    return next.hits <= maximum;
  }
  async readState(userId: string) { return structuredClone(this.states.get(userId)!); }
  async saveState(userId: string, version: number, data: Record<string, unknown>, now: number) {
    const old = this.states.get(userId)!;
    if (old.version !== version) return { saved: false, state: structuredClone(old) };
    const state = { version: version + 1, data: structuredClone(data), updatedAt: now };
    this.states.set(userId, state);
    return { saved: true, state: structuredClone(state) };
  }
}

function fixture() {
  const store = new MemoryStore();
  let now = 1_800_000_000_000;
  const service = new AccountService(store, config, () => now);
  return { store, service, advance: (ms: number) => { now += ms; }, now: () => now };
}

async function signup(service: AccountService, email = "cook@example.com", remember = false) {
  const result = await service.action(http(), { action: "signup", email, password, displayName: "Home cook", remember });
  return { ...result, body: result.body as SessionResult, request: http(cookiePair(result.cookie!)) };
}

test("account config fails closed for missing secrets and untrusted remote origins", () => {
  assert.equal(accountConfig({}), null);
  assert.equal(accountConfig({ FUSION_AUTH_ORIGIN: "https://fusion.example/", FUSION_AUTH_RATE_SECRET: "x".repeat(32) }), null);
  assert.equal(accountConfig({ FUSION_AUTH_ORIGIN: "http://public.example", FUSION_AUTH_RATE_SECRET: "x".repeat(32) }), null);
  assert.equal(accountConfig({ FUSION_AUTH_ORIGIN: "https://fusion.example", FUSION_AUTH_RATE_SECRET: "x".repeat(32), NEXT_PUBLIC_BASE_PATH: "/fusion;bad" }), null);
  assert.deepEqual(accountConfig({ FUSION_AUTH_ORIGIN: "http://127.0.0.1:5173", FUSION_AUTH_RATE_SECRET: "x".repeat(32), NEXT_PUBLIC_BASE_PATH: "/fusion" }), { origin: "http://127.0.0.1:5173", path: "/fusion/", secure: false, rateSecret: "x".repeat(32) });
});

test("account writes reject cross-site origins, missing custom headers and simple forms", () => {
  const request = (headers: Record<string, string>) => new Request("http://internal.invalid/api/account", { method: "POST", headers });
  const valid = { origin: config.origin, "x-fusion-request": "account", "content-type": "application/json", "sec-fetch-site": "same-origin" };
  assert.doesNotThrow(() => assertAccountMutation(request(valid), config));
  for (const change of [{ origin: "https://evil.example" }, { origin: "null" }, { "x-fusion-request": "" }, { "content-type": "text/plain" }, { "content-type": "application/jsonx" }, { "sec-fetch-site": "same-site" }]) assert.throws(() => assertAccountMutation(request({ ...valid, ...change }), config), AccountError);
  assert.throws(() => assertAccountMutation(request({ ...valid, origin: "https://evil.example", "x-forwarded-host": "fusion.example" }), config), AccountError);
});

test("cookies are HttpOnly secure path-scoped and persistence is explicit", () => {
  const token = newSessionToken();
  const ordinary = sessionCookie(config, token, false);
  assert.match(ordinary, /^__Secure-fusion_session=/);
  assert.match(ordinary, /Path=\/fusion\/; HttpOnly; SameSite=Lax; Secure$/);
  assert.doesNotMatch(ordinary, /Max-Age|Domain/);
  assert.match(sessionCookie(config, token, true), /Max-Age=2592000$/);
  assert.match(sessionCookie(config, "", false, true), /Max-Age=0$/);
  assert.equal(accountCookieName({ ...config, secure: false }), "fusion_session");
});

test("session parser ignores malformed and duplicate cookies", () => {
  const token = newSessionToken();
  const pair = cookiePair(sessionCookie(config, token, true));
  assert.equal(readSessionToken(http(`other=hello; ${pair}`), config), token);
  assert.equal(readSessionToken(http(`${pair}; ${pair}`), config), null);
  assert.equal(readSessionToken(http("__Secure-fusion_session=../../file"), config), null);
  assert.equal(readSessionToken(http(`fusion_session=${token}`), config), null);
  assert.equal(readSessionToken(http(), config), null);
});

test("identity input validation preserves passwords and safely normalizes emails", () => {
  assert.equal(normalizedEmail(" COOK+DINNER@Example.COM "), "cook+dinner@example.com");
  assert.equal(checkedPassword(`  ${password}  `, true), `  ${password}  `);
  assert.equal(checkedDisplayName("  Garden cook  "), "Garden cook");
  for (const email of ["a@example", "bad\n@example.com", "x@-host.example", "é@example.com", "x".repeat(260) + "@example.com"]) assert.throws(() => normalizedEmail(email), AccountError);
  for (const value of ["short", "x".repeat(129), "x".repeat(16) + "\0"]) assert.throws(() => checkedPassword(value, true), AccountError);
  for (const value of ["", "x".repeat(61), "a\nb"]) assert.throws(() => checkedDisplayName(value), AccountError);
});

test("state validation bounds bytes, recursion and prototype keys without truncating", () => {
  const source = { preferences: { servings: 4 }, saved: [{ title: "Thai bowl" }] };
  assert.deepEqual(checkedState(source), source);
  assert.notEqual(checkedState(source), source);
  assert.throws(() => checkedState({ text: "x".repeat(MAX_ACCOUNT_STATE_BYTES) }), (error: unknown) => error instanceof AccountError && error.status === 413);
  assert.throws(() => checkedState(JSON.parse('{"__proto__":{"polluted":true}}')), AccountError);
  assert.throws(() => checkedState({ count: Infinity }), AccountError);
  const deep: Record<string, unknown> = {};
  let current = deep;
  for (let i = 0; i < 42; i++) { current.next = {}; current = current.next as Record<string, unknown>; }
  assert.throws(() => checkedState(deep), AccountError);
  assert.throws(() => checkedState([]), AccountError);
});

test("JSON body limits apply both to advertised and streamed actual bytes", async () => {
  await assert.rejects(readAccountJson(new Request(config.origin, { method: "POST", body: '{"a":1}', headers: { "content-length": "900" } }), 20), (error: unknown) => error instanceof AccountError && error.status === 413);
  await assert.rejects(readAccountJson(new Request(config.origin, { method: "POST", body: JSON.stringify({ data: "x".repeat(64) }) }), 20), (error: unknown) => error instanceof AccountError && error.status === 413);
  await assert.rejects(readAccountJson(new Request(config.origin, { method: "POST", body: "[]" })), AccountError);
  await assert.rejects(readAccountJson(new Request(config.origin, { method: "POST", body: "broken" })), AccountError);
  assert.deepEqual(await readAccountJson(new Request(config.origin, { method: "POST", body: '{"a":1}' })), { a: 1 });
  let fragments = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { if (++fragments <= 16_385) controller.enqueue(new Uint8Array([32])); else controller.close(); } });
  const request = new Request(config.origin, { method: "POST", body: stream, duplex: "half" } as RequestInit & { duplex: "half" });
  await assert.rejects(readAccountJson(request, 20_000), (error: unknown) => error instanceof AccountError && error.status === 413 && /parts/.test(error.message));
});

test("password hashes use independent salts and fixed validated scrypt work", async () => {
  const a = await passwordHash(password);
  const b = await passwordHash(password);
  assert.notEqual(a, b);
  assert.match(a, /^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword("incorrect passphrase", a), false);
  assert.equal(await verifyPassword(password, a.replace("$32768$", "$999999999$")), false);
  assert.equal(await verifyPassword(password), false);
});

test("password hashing has an immediate concurrency ceiling", async () => {
  const results = await Promise.allSettled([passwordHash(password), passwordHash(password), passwordHash(password)]);
  assert.equal(results.filter((value) => value.status === "fulfilled").length, 2);
  const rejected = results.find((value) => value.status === "rejected") as PromiseRejectedResult;
  assert.ok(rejected.reason instanceof HashBusyError);
});

test("session tokens have 256 random bits and only hashes identify stored sessions", () => {
  const tokens = new Set(Array.from({ length: 64 }, newSessionToken));
  assert.equal(tokens.size, 64);
  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.match(sessionHash(token), /^[a-f0-9]{64}$/);
    assert.notEqual(sessionHash(token), token);
  }
  assert.notEqual(rateHash("secret-a", "email", "cook@example.com"), rateHash("secret-b", "email", "cook@example.com"));
  assert.notEqual(rateHash("secret", "client", "value"), rateHash("secret", "email", "value"));
});

test("sign up creates a private account and browser-session login without sharing kitchen data", async () => {
  const { store, service, now } = fixture();
  assert.deepEqual(await service.current(http()), { available: true, user: null, state: null });
  const signed = await signup(service);
  assert.equal(signed.body.user?.email, "cook@example.com");
  assert.equal(signed.body.state, null);
  assert.equal(signed.body.session?.expiresAt, now() + SESSION_AGE_MS);
  assert.equal(signed.body.session?.persistent, false);
  assert.doesNotMatch(JSON.stringify(signed.body), /passwordHash|tokenHash|scrypt/);
  assert.equal(store.users.size, 1);
  assert.equal(store.sessions.size, 1);
  assert.deepEqual((await service.current(signed.request)).user, signed.body.user);
  assert.equal((await service.current(http())).user, null);
});

test("remembered login has thirty-day absolute life and seven-day idle expiry", async () => {
  const { service, advance, now } = fixture();
  const signed = await signup(service, "remember@example.com", true);
  assert.equal(signed.body.session?.expiresAt, now() + REMEMBER_AGE_MS);
  assert.equal(signed.body.session?.idleExpiresAt, now() + REMEMBER_IDLE_MS);
  assert.match(signed.cookie!, /Max-Age=2592000/);
  advance(REMEMBER_IDLE_MS);
  assert.equal((await service.current(signed.request)).user, null);
});

test("active remembered sessions refresh idle time but never extend absolute expiry", async () => {
  const { service, advance, now } = fixture();
  const signed = await signup(service, "active@example.com", true);
  for (let day = 0; day < 29; day++) {
    advance(24 * 60 * 60_000);
    const current = await service.current(signed.request);
    assert.equal(current.user?.email, "active@example.com");
    assert.ok("session" in current);
    assert.equal(current.session.idleExpiresAt, Math.min(signed.body.session!.expiresAt, now() + REMEMBER_IDLE_MS));
  }
  advance(24 * 60 * 60_000);
  assert.equal((await service.current(signed.request)).user, null);
});

test("ordinary sessions expire after twelve hours and cannot be revived by activity", async () => {
  const { service, advance } = fixture();
  const signed = await signup(service);
  advance(SESSION_AGE_MS - 1);
  assert.ok((await service.current(signed.request)).user);
  advance(1);
  assert.equal((await service.current(signed.request)).user, null);
});

test("login rotates an old session and rejects incorrect or unknown credentials equally", async () => {
  const { store, service } = fixture();
  const signed = await signup(service);
  for (const email of ["cook@example.com", "missing@example.com"]) await assert.rejects(service.action(http(), { action: "login", email, password: "wrong" }), (error: unknown) => error instanceof AccountError && error.status === 401 && error.message === "The email or password did not match.");
  const logged = await service.action(signed.request, { action: "login", email: " COOK@EXAMPLE.COM ", password, remember: true });
  assert.notEqual(logged.cookie, signed.cookie);
  assert.equal(store.sessions.size, 1);
  assert.equal((await service.current(signed.request)).user, null);
  assert.ok((await service.current(http(cookiePair(logged.cookie!)))).user);
});

test("sign-up duplicate never returns an existing account session or plaintext secrets", async () => {
  const { store, service } = fixture();
  await signup(service);
  await assert.rejects(signup(service, "COOK@EXAMPLE.COM"), (error: unknown) => error instanceof AccountError && error.status === 409 && !error.message.includes("SQL"));
  assert.equal(store.users.size, 1);
  assert.equal(store.sessions.size, 1);
});

test("saved kitchens are private to the authenticated account and use atomic version checks", async () => {
  const { service } = fixture();
  const a = await signup(service, "a@example.com");
  const b = await signup(service, "b@example.com");
  const id = a.body.user!.id;
  assert.deepEqual(await service.readState(a.request), { state: null });
  assert.deepEqual(await service.writeState(a.request, { userId: id, version: 0, data: { saved: ["Thai bowl"] } }).then((value) => ({ saved: value.saved, version: value.state?.version })), { saved: true, version: 1 });
  const stale = await service.writeState(a.request, { userId: id, version: 0, data: { saved: ["stale overwrite"] } });
  assert.equal(stale.saved, false);
  assert.deepEqual(stale.state?.data, { saved: ["Thai bowl"] });
  assert.deepEqual(await service.readState(b.request), { state: null });
  await assert.rejects(service.readState(http()), (error: unknown) => error instanceof AccountError && error.status === 401);
});

test("cross-tab cookie changes cannot save an old account's kitchen into another account", async () => {
  const { service } = fixture();
  const a = await signup(service, "first@example.com");
  const b = await signup(service, "second@example.com");
  await assert.rejects(service.writeState(b.request, { userId: a.body.user!.id, version: 0, data: { saved: ["first private kitchen"] } }), (error: unknown) => error instanceof AccountError && error.status === 409);
  assert.deepEqual(await service.readState(b.request), { state: null });
});

test("state version and content are validated before changing any stored data", async () => {
  const { service } = fixture();
  const signed = await signup(service);
  for (const version of [-1, 0.5, "0", 4_000_000_000]) await assert.rejects(service.writeState(signed.request, { userId: signed.body.user!.id, version, data: {} }), AccountError);
  await assert.rejects(service.writeState(signed.request, { userId: signed.body.user!.id, version: 0, data: [] }), AccountError);
  assert.deepEqual(await service.readState(signed.request), { state: null });
});

test("logout invalidates the SQL session and clears the cookie without deleting saved data", async () => {
  const { service } = fixture();
  const signed = await signup(service);
  await service.writeState(signed.request, { userId: signed.body.user!.id, version: 0, data: { pantry: "rice" } });
  const result = await service.action(signed.request, { action: "logout" });
  assert.deepEqual(result.body, { ok: true });
  assert.match(result.cookie!, /Max-Age=0/);
  assert.equal((await service.current(signed.request)).user, null);
  const relogged = await service.action(http(), { action: "login", email: "cook@example.com", password });
  assert.deepEqual((relogged.body as SessionResult).state?.data, { pantry: "rice" });
});

test("logout-all revokes every session even when a stale session row survives cleanup", async () => {
  const { store, service } = fixture();
  const signed = await signup(service);
  const second = await service.action(http(), { action: "login", email: "cook@example.com", password });
  const stale = structuredClone([...store.sessions.values()][0]);
  await service.action(signed.request, { action: "logout-all" });
  store.sessions.set(stale.tokenHash, stale);
  assert.equal((await service.current(signed.request)).user, null);
  assert.equal((await service.current(http(cookiePair(second.cookie!)))).user, null);
});

test("password changes verify the current password, revoke old sessions and issue a new one", async () => {
  const { store, service } = fixture();
  const signed = await signup(service, "password@example.com", true);
  const other = await service.action(http(), { action: "login", email: "password@example.com", password });
  await assert.rejects(service.action(signed.request, { action: "password", currentPassword: "wrong", newPassword: "A different long secret phrase!" }), AccountError);
  assert.equal(store.sessions.size, 2);
  const changed = await service.action(signed.request, { action: "password", currentPassword: password, newPassword: "A different long secret phrase!" });
  assert.equal((changed.body as SessionResult).session?.persistent, true);
  assert.equal((await service.current(signed.request)).user, null);
  assert.equal((await service.current(http(cookiePair(other.cookie!)))).user, null);
  assert.ok((await service.current(http(cookiePair(changed.cookie!)))).user);
  await assert.rejects(service.action(http(), { action: "login", email: "password@example.com", password }), AccountError);
  assert.ok((await service.action(http(), { action: "login", email: "password@example.com", password: "A different long secret phrase!" })).cookie);
});

test("persistent per-email throttling precedes password hashing and resets at the next window", async () => {
  const { store, service, advance } = fixture();
  const email = "throttle@example.com";
  for (let i = 0; i < 12; i++) assert.equal(await store.takeRate(rateHash(config.rateSecret, "email", email), 1_800_000_000_000, 15 * 60_000, 12), true);
  await assert.rejects(service.action(http(), { action: "login", email, password }), (error: unknown) => error instanceof AccountError && error.status === 429);
  advance(15 * 60_000);
  await assert.rejects(service.action(http(), { action: "login", email, password }), (error: unknown) => error instanceof AccountError && error.status === 401);
});
