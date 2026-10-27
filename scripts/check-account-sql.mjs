// Run with Node --experimental-strip-types and the isolated test DB environment.
// Never targets a production database; removes only its own random test rows.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createPool } from "mysql2/promise";
import { SqlAccountStore } from "../lib/auth-store.ts";
import { sessionHash } from "../lib/auth-crypto.ts";

const env = process.env;
if (env.FUSION_AUTH_SQL_TEST !== "1" || !/^fusion_accounts_[a-z0-9_]*test$/.test(env.FUSION_AUTH_DB_NAME || "")) throw new Error("Use the isolated fusion_accounts_*test database and FUSION_AUTH_SQL_TEST=1.");
const pool = createPool({ host: env.FUSION_AUTH_DB_HOST || "127.0.0.1", port: Number(env.FUSION_AUTH_DB_PORT || 3306), user: env.FUSION_AUTH_DB_USER, password: env.FUSION_AUTH_DB_PASSWORD, database: env.FUSION_AUTH_DB_NAME, connectionLimit: 4, queueLimit: 16, multipleStatements: false });
const store = new SqlAccountStore(pool);
const id = randomUUID();
const email = `audit-${id}@example.invalid`;
const rateKey = sessionHash(randomBytes(32).toString("hex"));
const now = Date.now();
const outcomes = [];
const record = (name) => outcomes.push({ name, passed: true });

try {
  await store.ping();
  const value = { id, email, displayName: "Cook'); DROP TABLE account_users; --", passwordHash: "test-only-opaque-hash", authVersion: 0 };
  const created = await Promise.all([store.createUser(value, now), store.createUser({ ...value, id: randomUUID() }, now)]);
  assert.equal(created.filter(Boolean).length, 1);
  const actual = await store.userByEmail(email);
  assert.ok(actual);
  // Which concurrent insert wins is deliberately unspecified.
  value.id = actual.id;
  assert.equal(actual.displayName, value.displayName);
  assert.equal(await store.userByEmail("' OR 1=1 --@example.invalid"), null);
  record("prepared parameters and concurrent unique-email transaction");

  const kitchen = { pantry: "rice", saved: [{ title: "A private meal" }] };
  const competing = await Promise.all(Array.from({ length: 8 }, (_, index) => store.saveState(value.id, 0, { ...kitchen, index }, now)));
  assert.equal(competing.filter((result) => result.saved).length, 1);
  assert.equal((await store.readState(value.id)).version, 1);
  const stale = await store.saveState(value.id, 0, { lost: "overwrite" }, now);
  assert.equal(stale.saved, false);
  assert.equal(stale.state.version, 1);
  record("concurrent saved-kitchen compare-and-swap prevents lost updates");

  const tokens = [];
  for (let index = 0; index < 14; index++) {
    const tokenHash = sessionHash(`${id}-${index}`);
    tokens.push(tokenHash);
    await store.putSession({ tokenHash, userId: value.id, authVersion: 0, persistent: true, createdAt: now, lastSeenAt: now, expiresAt: now + 86_400_000 });
    assert.ok(await store.sessionByHash(tokenHash), "new session must survive equal-timestamp cap pruning");
  }
  const [sessionCount] = await pool.execute("SELECT COUNT(*) AS total FROM account_sessions WHERE user_id=?", [value.id]);
  assert.equal(Number(sessionCount[0].total), 10);
  record("session cap retains the newly-issued token with equal timestamps");

  let permitted = 0;
  for (let batch = 0; batch < 3; batch++) {
    const results = await Promise.all(Array.from({ length: 8 }, () => store.takeRate(rateKey, now, 60_000, 10)));
    permitted += results.filter(Boolean).length;
  }
  assert.equal(permitted, 10);
  assert.equal(await store.takeRate(rateKey, now + 60_000, 60_000, 10), true);
  record("SQL-backed rate counters remain atomic under concurrent requests");

  assert.equal(await store.changePassword(value.id, "wrong-old-hash", "replacement-hash"), false);
  assert.equal(await store.changePassword(value.id, value.passwordHash, "replacement-hash"), true);
  assert.equal((await store.userByEmail(email)).authVersion, 1);
  for (const hash of tokens) assert.equal(await store.sessionByHash(hash), null);
  record("password update uses compare-and-swap and revokes all sessions");

  const tokenHash = sessionHash(`${id}-after-password`);
  await store.putSession({ tokenHash, userId: value.id, authVersion: 1, persistent: false, createdAt: now, lastSeenAt: now, expiresAt: now + 1000 });
  await store.revokeSessions(value.id);
  assert.equal(await store.sessionByHash(tokenHash), null);
  assert.equal((await store.userByEmail(email)).authVersion, 2);
  record("revoke-all advances the generation and removes sessions");

  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), driver: "mysql2", outcomes, passed: outcomes.length }, null, 2));
} finally {
  // Exact random email and rate key only; foreign keys remove this run's state
  // and sessions. No broad table truncation or production account operation.
  await pool.execute("DELETE FROM account_users WHERE email=?", [email]);
  await pool.execute("DELETE FROM account_rate_limits WHERE rate_key=?", [rateKey]);
  await pool.end();
}
