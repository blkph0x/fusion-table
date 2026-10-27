import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as account from "../lib/account-client.ts";

// Run the production form, event handlers, effects and state transitions with a small hook host.
// The browser audit separately covers layout, focus movement and device widths.
const source = readFileSync(new URL("../components/account-panel.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const require = createRequire(import.meta.url);
const user = { id: "account-a", email: "cook@example.com", displayName: "Home cook" };
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });

function mount({ authenticated = false, serverData = { pantry: ["cloud rice"] }, returning = false, offline = false, blockedStorage = false } = {}) {
  const hooks = [], storage = new Map(), timers = new Map(), events = new Map(), requests = [], restored = [];
  let hookSlot = 0, pendingEffects = [], tree, timerId = 0, serverUser = authenticated ? user : null;
  let serverState = serverData === null ? null : { version: 1, data: serverData, updatedAt: 1_793_100_000_000 };
  let failNetwork = offline, failSaves = false;
  const browserGuest = { pantry: ["guest pasta"], preferences: { diet: "balanced" }, view: "studio" };
  const browserStore = { getItem(key) { if (blockedStorage) throw new Error("Blocked browser storage"); return storage.get(key) ?? null; }, setItem(key, value) { if (blockedStorage) throw new Error("Blocked browser storage"); storage.set(key, value); }, removeItem(key) { if (blockedStorage) throw new Error("Blocked browser storage"); storage.delete(key); } };
  storage.set(account.KITCHEN_STORAGE_KEY, JSON.stringify(browserGuest));
  if (returning) { storage.set(account.ACCOUNT_OWNER_KEY, user.id); storage.set(account.GUEST_KITCHEN_STORAGE_KEY, JSON.stringify(browserGuest)); }
  try { account.prepareGuestKitchen(browserStore); } catch { /* Parent reports unavailable browser persistence and continues. */ }
  const props = { snapshot: JSON.stringify(browserGuest), ready: true, onRestore(data) { restored.push(data); props.snapshot = JSON.stringify(data); try { account.persistKitchenStorage(browserStore, props.snapshot); } catch { /* Browser persistence is optional for SQL accounts. */ } }, onNotice() {} };
  const envelope = () => ({ available: true, user: serverUser, state: serverUser ? serverState : null, session: { persistent: false, expiresAt: Date.now() + 43_200_000, idleExpiresAt: Date.now() + 43_200_000 } });
  const request = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ url: String(url), method: init.method, body });
    if (failNetwork) throw new Error("Offline test");
    if (init.method === "GET") return response(envelope());
    if (String(url).endsWith("/state")) {
      if (!serverUser) return response({ error: "Your session has ended." }, 401);
      if (body.userId !== serverUser.id) return response({ error: "The account changed. Sign in again." }, 409);
      if (failSaves) return response({ error: "Saving is temporarily unavailable." }, 503);
      if (body.version !== (serverState?.version || 0)) return response({ error: "Your kitchen changed on another device.", state: serverState }, 409);
      serverState = { version: (serverState?.version || 0) + 1, data: body.data, updatedAt: 1_793_100_000_001 };
      return response({ state: serverState });
    }
    if (body.action === "logout" || body.action === "logout-all") { serverUser = null; return response({ ok: true }); }
    if (body.action === "signup" || body.action === "login") serverUser = user;
    return response(envelope());
  };
  const api = {
    ...account,
    readAccount() { return account.readAccount(request); },
    changeAccount(action, fields) { return account.changeAccount(action, fields, request); },
    saveAccountKitchen(version, value, userId) { return account.saveAccountKitchen(version, value, userId, request); },
  };
  const same = (a, b) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) { const slot = hookSlot++; if (!(slot in hooks)) hooks[slot] = { value: typeof initial === "function" ? initial() : initial }; return [hooks[slot].value, value => { hooks[slot].value = typeof value === "function" ? value(hooks[slot].value) : value; }]; },
    useRef(value) { const slot = hookSlot++; if (!(slot in hooks)) hooks[slot] = { current: value }; return hooks[slot]; },
    useCallback(fn, deps) { const slot = hookSlot++; if (!(slot in hooks) || !same(hooks[slot].deps, deps)) hooks[slot] = { fn, deps }; return hooks[slot].fn; },
    useEffect(fn, deps) { const slot = hookSlot++; if (!(slot in hooks) || !same(hooks[slot].deps, deps)) { const prior = hooks[slot]; hooks[slot] = { deps, cleanup: prior?.cleanup }; pendingEffects.push(() => { prior?.cleanup?.(); hooks[slot].cleanup = fn(); }); } },
  };
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const moduleRecord = { exports: {} };
  const context = vm.createContext({ module: moduleRecord, exports: moduleRecord.exports,
    require(name) { if (name === "react") return react; if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "test-fragment" }; if (name === "@/lib/account-client") return api; if (name.endsWith(".css")) return {}; return require(name); },
    localStorage: browserStore,
    window: { addEventListener(name, fn) { events.set(name, fn); }, removeEventListener(name) { events.delete(name); } },
    document: { visibilityState: "visible", activeElement: null, addEventListener() {}, removeEventListener() {} },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); }, console,
  });
  new vm.Script(compiled, { filename: "account-panel.test-runtime.cjs" }).runInContext(context);
  function render() { hookSlot = 0; tree = moduleRecord.exports.AccountPanel(props); const effects = pendingEffects; pendingEffects = []; effects.forEach(fn => fn()); return tree; }
  function all(node) { if (!arguments.length) node = tree; if (Array.isArray(node)) return node.flatMap(child => all(child)); if (!node || typeof node !== "object") return []; return [node, ...all(node.props.children)]; }
  function text(node) { if (!arguments.length) node = tree; if (Array.isArray(node)) return node.map(child => text(child)).join(""); if (node == null || typeof node === "boolean") return ""; if (typeof node !== "object") return String(node); return text(node.props.children); }
  const find = (type, label) => all().find(node => node.type === type && (node.props.id === label || node.props["aria-label"] === label || text(node).trim() === label));
  const flush = async () => { for (let i = 0; i < 5; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } };
  render();
  return {
    requests, restored, storage, props, text, find, flush,
    serverState: () => serverState, setServerState: state => { serverState = state; },
    async click(label) { const button = find("button", label); assert.ok(button, `Button: ${label}; UI ${text()}`); assert.ok(!button.props.disabled); await button.props.onClick(); await flush(); },
    async change(id, value) { const input = find("input", id); assert.ok(input, `Input ${id}`); input.props.onChange({ target: { value } }); await flush(); },
    async remember(value) { const input = all().find(node => node.type === "input" && node.props.type === "checkbox"); input.props.onChange({ target: { checked: value } }); await flush(); },
    async submit(label = "Sign in to Fusion Table") { const form = find("form", label); assert.ok(form); await form.props.onSubmit({ preventDefault() {} }); await flush(); },
    async edit(data) { props.snapshot = JSON.stringify(data); try { account.persistKitchenStorage(browserStore, props.snapshot); } catch { /* Continue with in-memory state. */ } await flush(); },
    async sync() { const ready = [...timers.entries()].filter(([, timer]) => timer.delay <= 1200); ready.forEach(([id, timer]) => { timers.delete(id); timer.fn(); }); await flush(); },
    saveOffline(value) { failSaves = value; }, offline(value) { failNetwork = value; },
    async expire() { serverUser = null; await events.get("focus")?.(); await flush(); },
    async expireAtDeadline() { serverUser = null; const entry = [...timers.entries()].find(([, timer]) => timer.delay > 1200); assert.ok(entry, "An expiry check is scheduled without polling."); timers.delete(entry[0]); entry[1].fn(); await flush(); },
    dispose() { hooks.forEach(hook => hook?.cleanup?.()); try { account.prepareGuestKitchen(browserStore); } catch { /* Reset still clears active account first. */ } },
  };
}

async function signIn(app) {
  await app.flush(); await app.click("My account");
  await app.change("account-email", user.email); await app.change("account-password", "a strong test password");
  await app.submit();
}

test("sign-in asks which kitchen to use before uploading any browser data", async () => {
  const app = mount(); await signIn(app);
  assert.match(app.text(), /Which kitchen would you like to use/);
  assert.equal(app.requests.filter(call => call.method === "PUT").length, 0);
  assert.equal(app.requests.find(call => call.body?.action === "login").body.remember, false);
  await app.click("Use saved account kitchen");
  assert.deepEqual(app.restored.at(-1), { pantry: ["cloud rice"] });
  assert.deepEqual(JSON.parse(app.storage.get(account.KITCHEN_STORAGE_KEY)).pantry, ["guest pasta"]);
  await app.sync(); assert.equal(app.requests.filter(call => call.method === "PUT").length, 0, "Opening cloud data is not an automatic browser upload.");
  app.dispose();
});

test("the production signup form validates password length and sends explicit persistent-session choice", async () => {
  const app = mount({ serverData: null }); await app.flush(); await app.click("My account"); await app.click("Create account");
  await app.change("account-name", "Home cook"); await app.change("account-email", user.email); await app.change("account-password", "short");
  await app.submit("Create Fusion Table account"); assert.match(app.text(), /15 to 128/); assert.equal(app.requests.filter(call => call.body?.action === "signup").length, 0);
  await app.change("account-password", "a strong test password"); await app.remember(true); await app.submit("Create Fusion Table account");
  assert.equal(app.requests.find(call => call.body?.action === "signup").body.remember, true);
  assert.equal(app.requests.filter(call => call.method === "PUT").length, 0);
  await app.click("Save this browser kitchen to my account");
  assert.deepEqual(app.serverState().data.pantry, ["guest pasta"]); assert.equal(app.serverState().data.view, undefined);
  app.dispose();
});

test("a returning session opens cloud content, coalesces edits and signs out back to its separate guest kitchen", async () => {
  const app = mount({ authenticated: true, returning: true }); await app.flush();
  assert.deepEqual(app.restored.at(-1), { pantry: ["cloud rice"] });
  await app.edit({ pantry: ["first edit"] }); await app.edit({ pantry: ["latest edit"] });
  await app.sync(); assert.equal(app.requests.filter(call => call.method === "PUT").length, 1); assert.deepEqual(app.serverState().data.pantry, ["latest edit"]);
  await app.click("Home cook"); await app.click("Sign out");
  assert.deepEqual(app.restored.at(-1).pantry, ["guest pasta"]); assert.equal(app.storage.get(account.ACCOUNT_OWNER_KEY), undefined);
  assert.deepEqual(app.serverState().data.pantry, ["latest edit"]);
  app.dispose();
});

test("conflicting changes require a choice and never overwrite the other device automatically", async () => {
  const app = mount({ authenticated: true, returning: true }); await app.flush(); await app.click("Home cook");
  await app.edit({ pantry: ["my edit"] }); app.setServerState({ version: 3, data: { pantry: ["other device"] }, updatedAt: 1_793_100_000_003 });
  await app.sync(); assert.match(app.text(), /Your kitchen changed on another device/); assert.deepEqual(app.serverState().data.pantry, ["other device"]);
  const calls = app.requests.length; await app.sync(); assert.equal(app.requests.length, calls);
  await app.click("Use the other saved kitchen"); assert.deepEqual(app.restored.at(-1).pantry, ["other device"]);
  await app.sync(); assert.equal(app.serverState().version, 3);
  app.dispose();
});

test("failed automatic saves pause without a request storm and can be retried explicitly", async () => {
  const app = mount({ authenticated: true, returning: true }); await app.flush(); await app.click("Home cook");
  app.saveOffline(true); await app.edit({ pantry: ["unsaved rice"] }); await app.sync();
  assert.match(app.text(), /Changes not saved/); const requests = app.requests.length;
  await app.sync(); await app.sync(); await app.sync(); assert.equal(app.requests.length, requests);
  app.saveOffline(false); await app.click("Save changes now"); await app.sync();
  assert.deepEqual(app.serverState().data.pantry, ["unsaved rice"]); assert.match(app.text(), /Saved to account/);
  app.dispose();
});

test("session expiry restores guest content instead of leaving a private account visible", async () => {
  const app = mount({ authenticated: true, returning: true }); await app.flush();
  await app.expire(); assert.deepEqual(app.restored.at(-1).pantry, ["guest pasta"]);
  await app.click("My account"); assert.match(app.text(), /signed out/); assert.equal(app.find("button", "Sign out"), undefined);
  app.dispose();
});

test("an offline account check leaves the guest kitchen usable without uploading it", async () => {
  const app = mount({ authenticated: true, returning: true, offline: true }); await app.flush();
  assert.equal(app.restored.length, 0); assert.deepEqual(JSON.parse(app.storage.get(account.KITCHEN_STORAGE_KEY)).pantry, ["guest pasta"]);
  await app.edit({ pantry: ["offline guest edit"] }); await app.sync(); assert.deepEqual(JSON.parse(app.storage.get(account.KITCHEN_STORAGE_KEY)).pantry, ["offline guest edit"]);
  assert.equal(app.requests.filter(call => call.method === "PUT").length, 0);
  app.dispose();
});

test("a tab left open checks the session deadline and clears expired private content without a keepalive loop", async () => {
  const app = mount({ authenticated: true, returning: true }); await app.flush();
  const calls = app.requests.length; await app.sync(); assert.equal(app.requests.length, calls, "Idle tabs do not periodically refresh their server session.");
  await app.expireAtDeadline(); assert.deepEqual(app.restored.at(-1).pantry, ["guest pasta"]);
  app.dispose();
});

test("an authenticated different browser must choose cloud or browser before either side changes", async () => {
  const app = mount({ authenticated: true }); await app.flush();
  assert.match(app.text(), /Which kitchen would you like to use/); assert.equal(app.restored.length, 0);
  assert.equal(app.requests.filter(call => call.method === "PUT").length, 0);
  await app.click("Replace account with this browser kitchen");
  assert.deepEqual(app.serverState().data.pantry, ["guest pasta"]); assert.equal(app.serverState().version, 2);
  app.dispose();
});

test("the explicit conflict choice can keep the current kitchen against the newest version", async () => {
  const app = mount({ authenticated: true, returning: true }); await app.flush(); await app.click("Home cook");
  await app.edit({ pantry: ["my newest edit"] }); app.setServerState({ version: 4, data: { pantry: ["other device"] }, updatedAt: Date.now() });
  await app.sync(); await app.click("Keep this kitchen");
  assert.equal(app.serverState().version, 5); assert.deepEqual(app.serverState().data.pantry, ["my newest edit"]);
  app.dispose();
});

test("signing out flushes the latest unscheduled edit and clears password form state", async () => {
  const app = mount({ authenticated: true, returning: true }); await app.flush(); await app.click("Home cook");
  await app.edit({ pantry: ["last-second edit"] }); await app.click("Sign out");
  assert.deepEqual(app.serverState().data.pantry, ["last-second edit"]);
  const mutations = app.requests.filter(call => call.method !== "GET"); assert.equal(mutations[0].method, "PUT"); assert.equal(mutations[1].body.action, "logout");
  assert.deepEqual(app.restored.at(-1).pantry, ["guest pasta"]); assert.equal(app.find("input", "account-password").props.value, "");
  app.dispose();
});

test("the account can save to SQL and restore its in-memory guest when all browser storage is blocked", async () => {
  const app = mount({ blockedStorage: true, serverData: null }); await signIn(app);
  await app.click("Save this browser kitchen to my account"); assert.deepEqual(app.serverState().data.pantry, ["guest pasta"]);
  await app.edit({ pantry: ["account soup"] }); await app.sync(); assert.deepEqual(app.serverState().data.pantry, ["account soup"]);
  await app.click("Sign out"); assert.deepEqual(app.restored.at(-1).pantry, ["guest pasta"]);
  app.dispose();
});

test("the production password form rotates credentials and clears its password inputs", async () => {
  const app = mount({ authenticated: true, returning: true }); await app.flush(); await app.click("Home cook"); await app.click("Change password");
  await app.change("account-current-password", "current strong password"); await app.change("account-new-password", "new strong password"); await app.submit("Change account password");
  const request = app.requests.find(call => call.body?.action === "password"); assert.equal(request.body.currentPassword, "current strong password"); assert.equal(request.body.newPassword, "new strong password");
  assert.match(app.text(), /other sessions were signed out/); assert.equal(app.find("input", "account-current-password"), undefined);
  app.dispose();
});
