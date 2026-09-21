import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../src/app/repairs/repair-form.tsx", import.meta.url), "utf8");

function harness() {
  const refs = [], effects = [], routes = [];
  let index = 0, result = { error: null, success: null }, pending = false, closes = 0;
  const action = () => { throw Error("Rendering must never dispatch a save"); };
  const jsx = (type, props) => ({ type, props });
  const router = { replace: (...args) => routes.push(args) };
  const dependencies = {
    react: {
      useActionState: (actual) => { assert.equal(actual, action); return [result, action, pending]; },
      useEffect: callback => effects.push(callback),
      useRef: value => refs[index++] ?? (refs[index - 1] = { current: value }),
      useState: value => [value, () => {}],
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "next/navigation": { useRouter: () => router },
    "lucide-react": { X: "X", Search: "Search", Loader2: "Loader2" },
    "./actions": { saveRepairAction: action },
    "@/components/ui/app-select": { AppSelect: "AppSelect" },
    "@/components/ui/form-modal": { FormModal: "FormModal" },
  };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", "window", "crypto", compiled)(id => {
    assert.ok(id in dependencies, id); return dependencies[id];
  }, compiledModule, compiledModule.exports, { location: { href: "http://localhost/repairs?q=phone&status=received&from=2026-09-01&sort=job_no&dir=asc&add=1&edit=old#list" } }, { randomUUID: () => "save-generation" });
  const render = (next = result, isPending = false) => {
    result = next; pending = isPending; index = 0; effects.length = 0;
    return compiledModule.exports.RepairForm({ customers: [], onClose: () => closes++ });
  };
  return { render, effects, routes, closes: () => closes };
}
function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const match = find(child, predicate); if (match) return match;
  }
  return null;
}
const form = tree => find(tree, node => node.type === "form");
const submit = tree => find(tree, node => node.type === "button" && node.props.type === "submit");

test("confirmed success is rendered before one client-only reconciliation preserving unrelated URL state", () => {
  const h = harness();
  const tree = h.render({ success: "Repair job created.", error: null, id: "saved-id" });
  assert.equal(find(tree, n => n.props?.role === "status").props.children, "Repair job created.");
  assert.equal(form(tree).props["aria-busy"], false);
  assert.equal(submit(tree).props.disabled, true);
  assert.deepEqual(h.routes, []);
  h.effects.forEach(effect => effect());
  assert.deepEqual(h.routes, [["/repairs?q=phone&status=received&from=2026-09-01&sort=job_no&dir=asc&repairsavestate=save-generation#list", { scroll: false }]]);
  h.render({ success: "Repair job created.", error: null, id: "saved-id" });
  h.effects.forEach(effect => effect());
  assert.equal(h.routes.length, 1); assert.equal(h.closes(), 0);
});

test("same-tick and pending submits are blocked, but a no-write error unlocks intentional retry", () => {
  const h = harness(); let blocked = 0;
  const event = { preventDefault: () => blocked++ };
  let tree = h.render();
  h.effects.forEach(effect => effect());
  form(tree).props.onSubmit(event); form(tree).props.onSubmit(event);
  assert.equal(blocked, 1);
  tree = h.render({ error: null, success: null }, true);
  assert.equal(form(tree).props["aria-busy"], true); assert.equal(submit(tree).props.disabled, true);
  assert.equal(tree.props.closeDisabled, true);
  assert.equal(find(tree, n => n.type === "button" && n.props.children === "Cancel").props.disabled, true);
  form(tree).props.onSubmit(event); assert.equal(blocked, 2);
  tree = h.render({ error: "Invalid input", success: null });
  h.effects.forEach(effect => effect());
  assert.equal(find(tree, n => n.props?.role === "alert").props.children, "Invalid input");
  assert.equal(submit(tree).props.disabled, false);
  form(tree).props.onSubmit(event); assert.equal(blocked, 2);
});

test("committed warnings stay visible and cannot repeat a mutation or navigate as success", () => {
  for (const error of ["The repair was saved, but its initial status history could not be confirmed. Do not submit it again. Refresh the page and contact an administrator.", "The repair was saved, but its audit record could not be confirmed. Do not submit it again. Refresh the page and contact an administrator."]) {
    const h = harness();
    const tree = h.render({ error, success: null, id: "saved-id" });
    h.effects.forEach(effect => effect());
    assert.equal(find(tree, n => n.props?.role === "alert").props.children, error);
    assert.equal(find(tree, n => n.props?.role === "status"), null);
    assert.equal(submit(tree).props.disabled, true);
    assert.equal(form(tree).props["aria-busy"], false);
    let blocked = false; form(tree).props.onSubmit({ preventDefault: () => { blocked = true; } });
    assert.equal(blocked, true); assert.deepEqual(h.routes, []); assert.equal(h.closes(), 0);
  }
});

test("manual dismissal stays separate from save settlement in the shared modal", () => {
  const h = harness(); const tree = h.render();
  const cancel = find(tree, n => n.type === "button" && n.props.children === "Cancel");
  cancel.props.onClick(); assert.equal(h.closes(), 1);
  assert.match(source, /<FormModal/);
  assert.doesNotMatch(source, /createPortal|repair-modal-controller|setTimeout|location.reload|router.refresh|catch\s*\(/);
  assert.equal((source.match(/useActionState\(saveRepairAction/g) ?? []).length, 1);
});

test("the server correction preserves all mutation/history/audit code and the exact delivered status action", () => {
  const action = readFileSync(new URL("../src/app/repairs/actions.ts", import.meta.url), "utf8");
  const hash = value => createHash("sha256").update(value).digest("hex");
  const boundary = action.indexOf("export async function updateRepairStatusAction");
  assert.ok(boundary > 0);
  assert.equal(hash(action.slice(boundary)), "f6e95deb746420a2e0b54e9ca44d8e6372059dadb31629ec499d81c9a8f78537");
  const save = action.slice(0, boundary);
  const deferred = save.match(/  \/\/ Settle the required save\/history\/audit result before route reconciliation\.\n  after\(\(\) => \{[\s\S]*?\n  \}\);\n\n/)?.[0];
  assert.ok(deferred);
  assert.equal((deferred.match(/revalidatePath\(/g) ?? []).length, 3);
  assert.doesNotMatch(deferred, /supabase|\.insert\(|\.update\(|logAudit/);
  assert.doesNotMatch(save.replace(deferred, ""), /revalidatePath\(/);
  // Original main save body with only its inline invalidation block removed.
  assert.equal(hash(save.replace(deferred, "")), "32383f6454b84219b5c0da1ead4cd59585a1f1bf5e2647db21bbcdeec8f8460a");
});
