import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as community from "../lib/community.ts";
import * as feedback from "../lib/meal-feedback.ts";
import * as paths from "../lib/public-path.ts";
import { generateMeal } from "../lib/meals.ts";

/* Exercise the production TSX component and its event handlers without a browser
 * dependency or any HTTP/ledger writes. This small hook host tests form behavior;
 * desktop browser QA remains responsible for layout and keyboard interaction. */
const source = readFileSync(new URL("../components/community-panel.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const require = createRequire(import.meta.url);
const recipe = () => generateMeal({ mainId: "chicken", methodId: "pan-fried", regionId: "thai", sideId: "rice-greens", servings: 2 });

function mount(currentRecipe = recipe(), initialLedger = { votes: [], whys: [], news: [] }) {
  const state = new Map();
  const storage = new Map();
  const requests = [];
  const savedBoards = [];
  let currentHook = null;
  let tree;
  let failNetwork = false;
  let ledger = initialLedger;
  const props = { recipe: currentRecipe, board: community.buildBoard(ledger), tried: false, onBoard(board) { savedBoards.push(board); props.board = board; }, onToggleTry() {} };
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const hooks = {
    useState(initial) {
      const { values } = currentHook;
      const slot = currentHook.slot++;
      if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
      return [values[slot], (value) => { values[slot] = typeof value === "function" ? value(values[slot]) : value; }];
    },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
  };
  const moduleRecord = { exports: {} };
  const context = vm.createContext({
    module: moduleRecord, exports: moduleRecord.exports,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "test-fragment" };
      if (name === "lucide-react") return { Bell: () => null };
      if (name === "@/lib/community") return community;
      if (name === "@/lib/meal-feedback") return feedback;
      if (name === "@/lib/public-path") return paths;
      return require(name);
    },
    localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, value); } },
    crypto: { randomUUID() { return "12345678-1234-1234-1234-123456789012"; } },
    async fetch(url, options) {
      const body = JSON.parse(options.body);
      requests.push({ url, ...options, body });
      if (failNetwork) throw new Error("Offline test");
      const result = community.submitVote(ledger, body, `2026-10-27T00:00:${String(requests.length).padStart(2, "0")}.000Z`, `ui-test-${requests.length}`);
      ledger = result.ledger;
      return { ok: !result.error, async json() { return result; } };
    },
  });
  new vm.Script(compiled, { filename: "community-panel.test-runtime.cjs" }).runInContext(context);

  function expand(element, path = "root") {
    if (element == null || typeof element === "boolean") return null;
    if (Array.isArray(element)) return element.map((child, index) => expand(child, `${path}.${index}`));
    if (typeof element !== "object") return element;
    if (typeof element.type === "function") {
      const identity = `${path}/${element.type.name}:${element.key ?? ""}`;
      const values = state.get(identity) || [];
      state.set(identity, values);
      const parent = currentHook;
      currentHook = { values, slot: 0 };
      const rendered = element.type(element.props);
      currentHook = parent;
      return expand(rendered, `${identity}/output`);
    }
    return { ...element, props: { ...element.props, children: expand(element.props.children, `${path}/children`) } };
  }
  function render() { tree = expand(jsx(moduleRecord.exports.CommunityDesk, props)); return tree; }
  function all(node = tree) {
    if (Array.isArray(node)) return node.flatMap((child) => all(child));
    if (!node || typeof node !== "object") return [];
    return [node, ...all(node.props.children)];
  }
  function text(node = tree) {
    if (Array.isArray(node)) return node.map((child) => text(child)).join("");
    if (node == null) return "";
    if (typeof node !== "object") return String(node);
    return text(node.props.children);
  }
  function find(type, label) { return all().find((node) => node.type === type && (node.props["aria-label"] === label || text(node).trim() === label)); }
  const flush = async () => { await new Promise((resolve) => setImmediate(resolve)); render(); };
  render();
  return {
    props, requests, savedBoards, text, all, find, ledger() { return ledger; },
    setRecipe(next) { props.recipe = next; render(); },
    offline(next) { failNetwork = next; },
    async click(label) { const button = find("button", label); assert.ok(button, `Button: ${label}`); assert.ok(!button.props.disabled); button.props.onClick(); await flush(); },
    async change(type, label, value) { const input = find(type, label); assert.ok(input, `Input: ${label}`); input.props.onChange({ target: { value } }); await flush(); },
    async submit() { const form = find("form", "Explain your feedback"); assert.ok(form); form.props.onSubmit({ preventDefault() {} }); await flush(); },
  };
}

test("a first impression cannot silently become a cooked star rating", async () => {
  const app = mount();
  assert.equal(app.find("button", "Rate 2 out of 5"), undefined);
  await app.click("Yes, I would try this");
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].body.action, "vote");
  assert.equal(app.requests[0].body.experience, "would-try");
  assert.equal(app.requests[0].body.want, "yes");
  assert.ok(!("stars" in app.requests[0].body) && !("again" in app.requests[0].body));
  assert.match(app.text(), /first impression was saved/);
});

test("two cooked stars open reasons and save the rating and category atomically without mandatory prose", async () => {
  const app = mount();
  await app.click("I cooked this version");
  await app.click("Rate 2 out of 5");
  assert.equal(app.requests.length, 0, "A low rating must not be sent before its reason.");
  await app.submit();
  assert.equal(app.requests.length, 0);
  assert.ok(app.all().some((node) => node.props.role === "alert"));
  await app.click("Too salty");
  await app.submit();
  assert.equal(app.requests.length, 1);
  const payload = app.requests[0].body;
  assert.equal(payload.action, "vote");
  assert.equal(payload.experience, "cooked");
  assert.equal(payload.stars, 2);
  assert.deepEqual(payload.feedback.categories, ["too-salty"]);
  assert.equal(payload.feedback.note, "");
  assert.equal(payload.feedback.recipeKey, feedback.feedbackRecipeKey(app.props.recipe));
  assert.equal(app.find("form", "Explain your feedback"), undefined);
  assert.match(app.text(), /feedback and reason were saved together/);
});

test("No and will-not-make-again both require a reason, including first impressions", async () => {
  const preview = mount();
  await preview.click("No, not for me");
  assert.equal(preview.requests.length, 0);
  await preview.click("Ingredient unavailable");
  await preview.submit();
  assert.equal(preview.requests[0].body.want, "no");
  assert.equal(preview.requests[0].body.experience, "would-try");
  assert.deepEqual(preview.requests[0].body.feedback.categories, ["unavailable"]);
  const cooked = mount();
  await cooked.click("I cooked this version");
  await cooked.click("I will not make this again");
  assert.equal(cooked.requests.length, 0);
  await cooked.click("Unclear steps");
  await cooked.submit();
  assert.equal(cooked.requests[0].body.again, "wont");
  assert.equal(cooked.requests[0].body.experience, "cooked");
});

test("Something else requires a useful note and can bind an exact ingredient and step", async () => {
  const app = mount();
  await app.click("I cooked this version");
  await app.click("Rate 0 out of 5");
  await app.click("Something else");
  await app.change("textarea", "Feedback detail", "   bad   ");
  await app.submit();
  assert.equal(app.requests.length, 0);
  await app.change("textarea", "Feedback detail", "The cooking liquid dried out.");
  const ingredient = app.props.recipe.ingredients[0];
  await app.change("select", "Ingredient involved", ingredient.id);
  await app.change("select", "Step involved", "2");
  await app.change("select", "How much did it affect the meal", "critical");
  await app.submit();
  assert.equal(app.requests.length, 1);
  const payload = app.requests[0].body;
  assert.equal(payload.feedback.ingredientId, ingredient.id);
  assert.equal(payload.feedback.stepIndex, 2);
  assert.equal(payload.feedback.severity, "critical");
  assert.equal(payload.plate.steps[2].detail, app.props.recipe.steps[2].detail);
});

test("network failure keeps the draft and an exact recipe change resets stale references", async () => {
  const app = mount();
  await app.click("I cooked this version");
  await app.click("Rate 1 out of 5");
  await app.click("Timing");
  await app.change("select", "Step involved", "1");
  app.offline(true);
  await app.submit();
  assert.match(app.text(), /Feedback was not saved/);
  assert.equal(app.find("button", "Timing").props["aria-pressed"], true);
  assert.equal(app.find("select", "Step involved").props.value, "1");
  assert.equal(app.savedBoards.length, 0);
  const changed = structuredClone(app.props.recipe);
  changed.steps[0].detail += " This is a different method version.";
  app.setRecipe(changed);
  assert.equal(app.find("form", "Explain your feedback"), undefined);
  assert.equal(app.find("button", "Rate 1 out of 5"), undefined, "New recipe returns to first impression.");
  assert.equal(app.find("button", "First impression").props["aria-pressed"], true);
  await app.click("No, not for me");
  assert.equal(app.find("select", "Step involved").props.value, "");
});

test("a fresh high rating clears an invisible earlier No and will-not-make-again choice", async () => {
  const current = recipe();
  const previous = community.submitVote({ votes: [], whys: [], news: [] }, {
    device: "12345678123412341234123456789012", plate: current, experience: "cooked", stars: 1, want: "no", again: "wont",
    feedback: { categories: ["timing"] },
  }, "2026-10-26T00:00:00.000Z", "old-report");
  assert.equal(previous.error, undefined);
  const app = mount(current, previous.ledger);
  await app.click("I cooked this version");
  await app.click("Rate 5 out of 5");
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].body.want, "");
  assert.equal(app.requests[0].body.again, "");
  const latest = app.ledger().votes.at(-1);
  assert.equal(latest.stars, 5);
  assert.equal(latest.want, "");
  assert.equal(latest.again, "");
  assert.equal(app.props.board.plates[0].feedbackSummary.lowCookedDevices, 0);
});

test("a doneness report prompts review and shows exact ingredient and step without claiming safety", async () => {
  const app = mount();
  await app.click("I cooked this version");
  await app.click("Rate 1 out of 5");
  await app.click("Cooking doneness concern");
  const ingredient = app.props.recipe.ingredients[0];
  await app.change("select", "Ingredient involved", ingredient.id);
  await app.change("select", "Step involved", "1");
  await app.submit();
  assert.equal(app.ledger().votes.length, 1);
  assert.equal(app.ledger().whys.length, 1);
  assert.match(app.text(), /It needs review; votes do not verify food safety/);
  assert.ok(app.text().includes(`Ingredient: ${ingredient.name}.`));
  assert.ok(app.text().includes(`Step 2: ${app.props.recipe.steps[1].title}.`));
  assert.match(app.text(), /1 cooked report, 0 first impressions/);
});

test("earlier unstructured reasons remain readable beside a current version", () => {
  const current = recipe();
  const legacy = { ...current };
  delete legacy.steps;
  const identity = community.plateIdentity(legacy);
  const earlier = {
    id: "legacy-vote", at: "2026-10-25T00:00:00.000Z", device: "oldbrowser00000001", plateKey: identity.key,
    title: identity.title, family: identity.family, kind: identity.kind, classicId: identity.classicId,
    regionId: identity.regionId, diet: identity.diet, spiceHeat: identity.spiceHeat, mainId: identity.mainId,
    methodId: identity.methodId, sideId: identity.sideId, ingredientIds: identity.ingredientIds, stars: 1, want: "no", again: "wont",
  };
  const oldReason = { id: "legacy-why", at: earlier.at, device: earlier.device, plateKey: identity.key, family: identity.family,
    title: identity.title, wrong: "The old sauce was salty", change: "Review the old soy amount", ingredientId: "", ingredientName: "", direction: "note" };
  const app = mount(current, { votes: [earlier], whys: [oldReason], news: [] });
  assert.match(app.text(), /Earlier report: The old sauce was salty/);
  assert.match(app.text(), /Review the old soy amount/);
  assert.match(app.text(), /No cooked reports or first impressions for this exact version yet/);
});
