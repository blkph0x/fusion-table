import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCOUNT_OWNER_KEY, GUEST_KITCHEN_STORAGE_KEY, KITCHEN_STORAGE_KEY, AccountRequestError, accountEnvelope, changeAccount, enterAccountKitchen, kitchenSnapshot, leaveAccountKitchen, parseKitchen, persistKitchenStorage, prepareGuestKitchen, readAccount, resilientAccountStorage, saveAccountKitchen } from "../lib/account-client.ts";

function storage() {
  const items = new Map<string, string>();
  return { getItem(key: string) { return items.get(key) ?? null; }, setItem(key: string, value: string) { items.set(key, value); }, removeItem(key: string) { items.delete(key); } };
}
const user = { id: "account-a", email: "cook@example.com", displayName: "Home cook" };
const state = { version: 1, data: { pantry: [{ name: "rice" }] }, updatedAt: 1_793_100_000_000 };
const envelope = { available: true, user, state, session: { persistent: false, expiresAt: 1_793_110_000_000 } };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

test("account snapshots include kitchen content but never navigation, passwords or unrecognized storage", () => {
  const data = parseKitchen(JSON.stringify({ view: "shops", pantry: ["rice"], preferences: { diet: "vegan" }, password: "private-password", session: "token", unrelated: "ignored" }));
  assert.deepEqual(data, { pantry: ["rice"], preferences: { diet: "vegan" } });
  assert.equal(kitchenSnapshot({ preferences: {}, pantry: [] }), kitchenSnapshot({ pantry: [], preferences: {} }));
  assert.deepEqual(parseKitchen("[1,2]"), {}); assert.deepEqual(parseKitchen("broken"), {});
});

test("guest storage stays separate while an account is active, including cross-tab logout races", () => {
  const store = storage(); prepareGuestKitchen(store);
  const guest = JSON.stringify({ pantry: ["guest rice"], view: "week" });
  assert.equal(persistKitchenStorage(store, guest), true);
  enterAccountKitchen(store, user.id, guest);
  assert.equal(persistKitchenStorage(store, JSON.stringify({ pantry: ["private account beef"] })), false);
  assert.equal(store.getItem(KITCHEN_STORAGE_KEY), guest);
  store.removeItem(ACCOUNT_OWNER_KEY); // Another tab signed out before this tab processes its event.
  assert.equal(persistKitchenStorage(store, JSON.stringify({ pantry: ["private account beef"] })), false);
  assert.deepEqual(leaveAccountKitchen(store), { pantry: ["guest rice"] });
  assert.equal(persistKitchenStorage(store, JSON.stringify({ pantry: ["guest noodles"] })), true);
  assert.deepEqual(JSON.parse(store.getItem(KITCHEN_STORAGE_KEY)!), { pantry: ["guest noodles"] });
});

test("a reload removes stale private mirrors before the page can hydrate and preserves the guest backup", () => {
  const store = storage(); store.setItem(ACCOUNT_OWNER_KEY, user.id);
  store.setItem(KITCHEN_STORAGE_KEY, JSON.stringify({ pantry: ["old private account"] }));
  store.setItem(GUEST_KITCHEN_STORAGE_KEY, JSON.stringify({ pantry: ["guest rice"] }));
  prepareGuestKitchen(store);
  assert.deepEqual(JSON.parse(store.getItem(KITCHEN_STORAGE_KEY)!), { pantry: ["guest rice"] });
  enterAccountKitchen(store, user.id, JSON.stringify({ pantry: ["guest edits after reload"] }));
  assert.deepEqual(leaveAccountKitchen(store), { pantry: ["guest edits after reload"] });
  assert.ok(store.getItem(GUEST_KITCHEN_STORAGE_KEY), "Guest recovery remains available to other signed-out tabs.");
});

test("missing or corrupt guest backup starts an empty guest instead of leaking account data", () => {
  const store = storage(); store.setItem(ACCOUNT_OWNER_KEY, user.id); store.setItem(KITCHEN_STORAGE_KEY, '{"pantry":["private"]}');
  prepareGuestKitchen(store); assert.equal(store.getItem(KITCHEN_STORAGE_KEY), null);
  store.setItem(GUEST_KITCHEN_STORAGE_KEY, "corrupt"); assert.deepEqual(leaveAccountKitchen(store), {});
});

test("account reads are same-origin, uncacheable and never store a bearer token in browser state", async () => {
  let called = false;
  const result = await readAccount(async (url, init) => {
    called = true; assert.match(String(url), /\/api\/account$/); assert.equal(init?.method, "GET");
    assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store");
    assert.equal(new Headers(init?.headers).get("X-Fusion-Request"), "account"); assert.equal(init?.body, undefined);
    return reply(envelope);
  });
  assert.ok(called); assert.deepEqual(result, envelope); assert.equal(accountEnvelope({ ...envelope, user: { id: 3 } }), false);
});

test("sign-in sends explicit long-session choice with the same-origin mutation header", async () => {
  await changeAccount("login", { email: user.email, password: "a strong test password", remember: true }, async (_url, init) => {
    assert.equal(init?.method, "POST"); assert.equal(new Headers(init?.headers).get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(init?.body as string), { email: user.email, password: "a strong test password", remember: true, action: "login" });
    return reply(envelope);
  });
});

test("optimistic saves bind account identity and strip unsynced fields before sending", async () => {
  const saved = await saveAccountKitchen(0, { pantry: ["rice"], view: "week", session: "not-a-token" }, user.id, async (_url, init) => {
    assert.deepEqual(JSON.parse(init?.body as string), { version: 0, data: { pantry: ["rice"] }, userId: user.id });
    return reply({ state });
  });
  assert.deepEqual(saved, state);
});

test("a version conflict carries the other saved kitchen without silently replacing either side", async () => {
  await assert.rejects(saveAccountKitchen(1, { pantry: ["my changes"] }, user.id, async () => reply({ error: "Your kitchen changed on another device.", state }, 409)), (error: unknown) => {
    assert.ok(error instanceof AccountRequestError); assert.equal(error.status, 409); assert.deepEqual(error.state, state); return true;
  });
});

test("oversized sync is refused before any request, while guest storage keeps its own browser capacity", async () => {
  let called = false; const huge = { dislikeText: "x".repeat(4_194_305) };
  await assert.rejects(saveAccountKitchen(0, huge, user.id, async () => { called = true; return reply({ state }); }), /too large to sync/);
  assert.equal(called, false);
  const store = storage(); prepareGuestKitchen(store); assert.equal(persistKitchenStorage(store, JSON.stringify(huge)), true);
});

test("unavailable and malformed services become understandable errors without exposing proxy HTML", async () => {
  await assert.rejects(readAccount(async () => reply({ error: "<script>proxy stack</script>" }, 503)), (error: unknown) => {
    assert.ok(error instanceof AccountRequestError); assert.doesNotMatch(error.message, /script|stack/); return true;
  });
  await assert.rejects(readAccount(async () => reply({ user: null })), /incomplete response/);
  await assert.rejects(readAccount(async () => new Response("<html>bad gateway</html>", { status: 502 })), /unreadable response/);
  await assert.rejects(readAccount(async () => { throw new Error("socket detail must not leak"); }), /could not reach your account/);
});

test("logout and password change require acknowledged server responses", async () => {
  assert.deepEqual(await changeAccount("logout-all", {}, async (_url, init) => { assert.equal(JSON.parse(init?.body as string).action, "logout-all"); return reply({ ok: true }); }), { ok: true });
  await assert.rejects(changeAccount("logout", {}, async () => reply({ ok: false })), /could not be confirmed/);
  const result = await changeAccount("password", { currentPassword: "current password here", newPassword: "new password here" }, async (_url, init) => {
    assert.equal(JSON.parse(init?.body as string).action, "password"); return reply(envelope);
  });
  assert.deepEqual(result, envelope);
});

test("blocked storage keeps a tab-local guest recovery without preventing SQL accounts", () => {
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  const store = resilientAccountStorage(blocked); prepareGuestKitchen(store);
  enterAccountKitchen(store, user.id, JSON.stringify({ pantry: ["guest rice"] }));
  assert.equal(persistKitchenStorage(store, '{"pantry":["private account"]}'), false);
  assert.deepEqual(leaveAccountKitchen(store), { pantry: ["guest rice"] });
  assert.equal(store.getItem(ACCOUNT_OWNER_KEY), null);
});

test("a full storage quota cannot leave a durable account marker without guest recovery", () => {
  const prior = storage(); prior.setItem(KITCHEN_STORAGE_KEY, '{"pantry":["guest rice"]}');
  const quota = { getItem: prior.getItem, removeItem: prior.removeItem, setItem(key: string, value: string) { if (key === GUEST_KITCHEN_STORAGE_KEY) throw new Error("quota"); prior.setItem(key, value); } };
  const store = resilientAccountStorage(quota); prepareGuestKitchen(store);
  enterAccountKitchen(store, user.id, '{"pantry":["guest rice"]}');
  assert.equal(prior.getItem(ACCOUNT_OWNER_KEY), null);
  assert.deepEqual(leaveAccountKitchen(store), { pantry: ["guest rice"] });
});
