import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as pantry from "../lib/pantry.ts";

const compiled = ts.transpileModule(readFileSync(new URL("../components/kitchen-desk.tsx", import.meta.url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function mount(ingredients = [{ id: "cheese", name: "Halloumi", amount: 200, unit: "g" }], stock = []) {
  const state = [], changes = [], shopping = []; let slot = 0, tree;
  const props = { ingredients, pantry: stock, verdict: "", stars: 0, onPantry(next) { changes.push(next); props.pantry = next; }, onShopping(lines) { shopping.push(lines); }, onVerdict() {}, onStars() {} };
  const hooks = {
    useState(initial) { const id = slot++; if (!(id in state)) state[id] = typeof initial === "function" ? initial() : initial; return [state[id], next => { state[id] = typeof next === "function" ? next(state[id]) : next; }]; },
    useRef(initial) { const id = slot++; if (!(id in state)) state[id] = { current: initial }; return state[id]; },
    useMemo(fn) { slot++; return fn(); },
  };
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const record = { exports: {} };
  const context = vm.createContext({ module: record, exports: record.exports, require(name) { if (name === "react") return hooks; if (name === "react/jsx-runtime") return { jsx, jsxs: jsx }; if (name === "lucide-react") return { Star: () => null }; if (name === "@/lib/pantry") return pantry; throw new Error(name); } });
  new vm.Script(compiled).runInContext(context);
  function render() { slot = 0; tree = record.exports.KitchenDesk(props); }
  function all(node) { if (!arguments.length) node = tree; if (Array.isArray(node)) return node.flatMap(child => all(child)); if (!node || typeof node !== "object") return []; return [node, ...all(node.props.children)]; }
  function text(node) { if (!arguments.length) node = tree; if (Array.isArray(node)) return node.map(child => text(child)).join(""); if (node == null || typeof node === "boolean") return ""; return typeof node === "object" ? text(node.props.children) : String(node); }
  function button(label) { return all().find(node => node.type === "button" && text(node).trim() === label); }
  render();
  return { props, changes, shopping, text, button,
    toggle(name) { const label = all().find(node => node.type === "label" && text(node).includes(name)); const input = all(label).find(node => node.type === "input"); assert.ok(input); input.props.onChange(); render(); },
    checked(name) { const label = all().find(node => node.type === "label" && text(node).includes(name)); return all(label).find(node => node.type === "input").props.checked; },
    click(label) { const action = button(label); assert.ok(action, label); assert.ok(!action.props.disabled); action.props.onClick(); render(); },
    needs() { return pantry.weekNeeds(props.pantry, props.ingredients); },
    setStock(next) { props.pantry = next; render(); },
  };
}

test("the production pantry checkbox immediately updates the same shortfall used by automatic recipe costs", () => {
  const app = mount(); assert.equal(app.needs().length, 1);
  app.toggle("Halloumi"); assert.equal(app.changes.length, 1); assert.equal(app.checked("Halloumi"), true);
  assert.equal(app.needs().length, 0); assert.equal(pantry.pantryOnHand(app.props.pantry, "Halloumi", "g"), 200);
  assert.equal(app.shopping.length, 0, "No shopping button is needed to update pantry-dependent prices.");
  app.toggle("Halloumi"); assert.equal(app.checked("Halloumi"), false); assert.equal(app.needs()[0].amount, 200);
});

test("reversing a new tick restores known partial stock and repeat toggles never inflate it", () => {
  const app = mount(undefined, [{ key: "halloumi", name: "Halloumi", unit: "g", onHand: 75 }]);
  assert.equal(app.needs()[0].amount, 125);
  for (let i = 0; i < 3; i++) { app.toggle("Halloumi"); assert.equal(app.needs().length, 0); app.toggle("Halloumi"); assert.equal(app.needs()[0].amount, 125); }
  assert.equal(pantry.pantryOnHand(app.props.pantry, "Halloumi", "g"), 75);
});

test("finished cooking consumes declarations once and undo restores them without changing a newer declaration", () => {
  const app = mount(); app.toggle("Halloumi"); app.click("Finished cooking");
  assert.equal(pantry.pantryOnHand(app.props.pantry, "Halloumi", "g"), 0);
  app.click("Undo pantry use"); assert.equal(pantry.pantryOnHand(app.props.pantry, "Halloumi", "g"), 200);
  app.click("Finished cooking"); app.toggle("Halloumi");
  assert.equal(pantry.pantryOnHand(app.props.pantry, "Halloumi", "g"), 200);
  assert.equal(app.button("Undo pantry use").props.disabled, true);
});

test("an external stock correction is preserved instead of restoring an obsolete checkbox baseline", () => {
  const app = mount(undefined, [{ key: "halloumi", name: "Halloumi", unit: "g", onHand: 75 }]);
  app.toggle("Halloumi"); app.setStock([{ key: "halloumi", name: "Halloumi", unit: "g", onHand: 300 }]);
  app.toggle("Halloumi"); assert.equal(pantry.pantryOnHand(app.props.pantry, "Halloumi", "g"), 0);
});

test("duplicate ingredient checkboxes retain the selected use and do not both claim the same stock", () => {
  const app = mount([{ id: "main", name: "Garlic", amount: 50, unit: "g" }, { id: "side", name: "Garlic", amount: 70, unit: "g" }], [{ key: "garlic", name: "Garlic", unit: "g", onHand: 75 }]);
  assert.equal(app.checked("Garlic50"), true); assert.equal(app.checked("Garlic70"), false);
  app.toggle("Garlic70"); assert.equal(app.checked("Garlic70"), true); assert.equal(app.needs().length, 0);
  assert.equal(pantry.pantryOnHand(app.props.pantry, "Garlic", "g"), 120);
  app.toggle("Garlic70"); assert.equal(app.checked("Garlic50"), true); assert.equal(app.checked("Garlic70"), false);
  assert.equal(pantry.pantryOnHand(app.props.pantry, "Garlic", "g"), 75); assert.equal(app.needs()[0].amount, 45);
});

test("reversing several new duplicate-use declarations restores partial stock once", () => {
  const app = mount([{ id: "main", name: "Garlic", amount: 50, unit: "g" }, { id: "side", name: "Garlic", amount: 70, unit: "g" }], [{ key: "garlic", name: "Garlic", unit: "g", onHand: 10 }]);
  app.toggle("Garlic50"); app.toggle("Garlic70"); assert.equal(pantry.pantryOnHand(app.props.pantry, "Garlic", "g"), 120);
  app.toggle("Garlic50"); assert.equal(pantry.pantryOnHand(app.props.pantry, "Garlic", "g"), 70);
  app.toggle("Garlic70"); assert.equal(pantry.pantryOnHand(app.props.pantry, "Garlic", "g"), 10);
});
