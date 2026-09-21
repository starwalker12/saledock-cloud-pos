import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

const read = path => fs.readFileSync(path, 'utf8');
const controller = read('src/app/repairs/repair-modal-controller.tsx');
const form = read('src/app/repairs/repair-form.tsx');
const page = read('src/app/repairs/page.tsx');

test('intake and empty-state triggers use one local controller without server navigation', () => {
  assert.match(page, /<RepairModalController customers=\{customers\} editing=\{editing\}>/);
  assert.match(page, /canWrite && <RepairIntakeButton/);
  assert.match(page, /<RepairEmptyState/);
  assert.doesNotMatch(page, /href="\/repairs\?add=1"|"use server"|onClose=\{async/);
  assert.doesNotMatch(controller, /router\.(push|replace|refresh)|fetch\(|setTimeout|use server/);
  assert.match(controller, /params\.get\("add"\) === "1"/);
});

test('form reuses body portal and keeps action, submit, pending and validation inside the form', () => {
  assert.match(form, /<FormModal/);
  assert.doesNotMatch(form, /fixed inset-0|z-50|animate-scale-in/);
  const start = form.indexOf('<form');
  assert.ok(start > 0);
  assert.ok(form.indexOf('type="submit"', start) < form.indexOf('</form>', start));
  assert.match(form, /useActionState\(saveRepairAction, defaultState\)/);
  assert.match(form, /disabled=\{isPending\}/);
  assert.match(form, /Saving\.\.\./);
  assert.match(form, /state\.success[\s\S]*?router\.replace\(/);
  assert.equal((form.match(/router\.replace\(/g) ?? []).length, 1);
  assert.match(form, /disabled=\{isPending \|\| committed\}/);
  assert.match(form, /closeDisabled=\{isPending\}/);
  assert.match(form, /submitLocked.current \|\| isPending \|\| committed/);
  assert.match(form, /state\.error &&[\s\S]*?role="alert"/);
  assert.match(form, /overflow-y-auto/);
  assert.match(form, /safe-area-inset-bottom/);
  const shared = read('src/components/ui/form-modal.tsx');
  assert.match(shared, /createPortal\(children, document\.body\)/);
  assert.match(shared, /role="dialog"/);
  assert.match(shared, /aria-modal="true"/);
});

test('actual controller history handlers preserve filters/hash and remove only modal flags', () => {
  let url = new URL('https://local.invalid/repairs?q=phone&status=received&from=2026-09-01&to=2026-09-30&sort=job_no&dir=desc#history');
  const calls = []; let focused = 0;
  class Element { isConnected = true; focus() { focused++; } }
  const trigger = new Element();
  const imports = {
    react: { createContext: () => ({ Provider: 'provider' }), useCallback: fn => fn, useContext: () => null, useRef: () => ({ current: null }) },
    'react/jsx-runtime': jsx, 'next/navigation': { useSearchParams: () => url.searchParams },
    'lucide-react': { Plus: 'plus' }, '@/components/ui/empty-state': { EmptyState: 'empty' }, './repair-form': { RepairForm: 'repair-form' },
  };
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(controller, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module: loaded, exports: loaded.exports, require: name => { assert.ok(name in imports); return imports[name]; }, URL, HTMLElement: Element,
    document: { activeElement: trigger, querySelector: () => trigger },
    window: { location: { get href() { return url.href; } }, history: Object.fromEntries(['pushState','replaceState'].map(method => [method, (state, title, next) => { calls.push(method); url = new URL(next); }])) },
  });
  const original = url.href;
  const output = loaded.exports.RepairModalController({ customers: [], children: null });
  output.props.value();
  assert.equal(url.searchParams.get('add'), '1');
  assert.equal(url.hash, '#history');
  const opened = loaded.exports.RepairModalController({ customers: [], children: null });
  const modal = opened.props.children[1];
  assert.ok(modal);
  modal.props.onClose();
  assert.equal(url.href, original);
  assert.deepEqual(calls, ['replaceState','replaceState']);
  assert.equal(focused, 1);
});

test('shared modal focuses on portal commit and traps Tab without hidden inputs', () => {
  const source = read('src/components/ui/form-modal.tsx');
  let keydown;
  const first = { getClientRects: () => [1], focus() { document.activeElement = first; } };
  const hidden = { getClientRects: () => [], focus() { assert.fail('Hidden field received focus'); } };
  const last = { getClientRects: () => [1], focus() { document.activeElement = last; } };
  const heading = { focus() { document.activeElement = heading; } };
  const document = { body: { style: { overflow: '' } }, activeElement: null };
  const loaded = { exports: {} };
  const imports = {
    react: { useCallback: fn => fn, useEffect: fn => fn(), useId: () => 'heading',
      useRef: () => ({ current: { querySelectorAll: () => [first, hidden, last] } }) },
    'react/jsx-runtime': jsx, 'react-dom': {}, 'lucide-react': { X: 'x' },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module: loaded, exports: loaded.exports, require: name => imports[name], document,
    window: { addEventListener: (name, fn) => { if (name === 'keydown') keydown = fn; } },
  });
  const tree = loaded.exports.FormModal({ open: true, onClose() {}, title: 'Intake' });
  function findHeading(node) {
    if (node?.type === 'h2') return node;
    return (Array.isArray(node?.props?.children) ? node.props.children : [node?.props?.children]).filter(Boolean).map(child => typeof child === 'object' ? findHeading(child) : undefined).find(Boolean);
  }
  findHeading(tree).props.ref(heading);
  assert.equal(document.activeElement, heading);
  keydown({ key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.equal(document.activeElement, last);
  keydown({ key: 'Tab', shiftKey: false, preventDefault() {} });
  assert.equal(document.activeElement, first);
  keydown({ key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.equal(document.activeElement, last);
  assert.doesNotMatch(source, /focusTimer/);
});

test('shared modal preserves dismissal, external footer and body-scroll contracts for existing consumers', () => {
  const source = read('src/components/ui/form-modal.tsx');
  for (const preventDismiss of [false, true]) for (const closeDisabled of [false, true]) {
    let listener, cleanup, closes = 0, expanded = false;
    const document = { body: { style: { overflow: 'auto' } } };
    const loaded = { exports: {} };
    const imports = {
      react: { useCallback: fn => fn, useEffect: fn => { cleanup = fn(); }, useId: () => 'title',
        useRef: () => ({ current: { querySelector: () => expanded ? {} : null } }) },
      'react/jsx-runtime': jsx, 'react-dom': {}, 'lucide-react': { X: 'x' },
    };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      module: loaded, exports: loaded.exports, require: name => imports[name], document,
      window: { addEventListener: (_name, fn) => { listener = fn; }, removeEventListener: (_name, fn) => assert.equal(fn, listener) },
    });
    const footer = jsx.jsx('button', { type: 'submit', form: 'category-form', disabled: true });
    const tree = loaded.exports.FormModal({ open: true, onClose() { closes++; }, title: 'Shared', footer, preventDismiss, closeDisabled, zIndexClass: 'z-[300]' });
    assert.equal(document.body.style.overflow, 'hidden');
    const overlay = tree.props.children;
    const section = overlay.props.children;
    assert.equal(section.props.children[0].props.children[1].props.disabled, closeDisabled);
    assert.match(overlay.props.className, /z-\[300\]/);
    assert.equal(section.props.children[2].props.children, footer);
    assert.equal(footer.props.form, 'category-form');
    expanded = true;
    listener({ key: 'Escape', preventDefault() {} });
    assert.equal(closes, 0, 'expanded select consumes Escape');
    expanded = false;
    listener({ key: 'Escape', preventDefault() {} });
    assert.equal(closes, preventDismiss || closeDisabled ? 0 : 1);
    const backdrop = {};
    overlay.props.onMouseDown({ target: {}, currentTarget: backdrop });
    assert.equal(closes, preventDismiss || closeDisabled ? 0 : 1, 'content click does not dismiss');
    overlay.props.onMouseDown({ target: backdrop, currentTarget: backdrop });
    assert.equal(closes, preventDismiss || closeDisabled ? 0 : 2);
    cleanup();
    assert.equal(document.body.style.overflow, 'auto');
    assert.equal(loaded.exports.FormModal({ open: false, onClose() {}, title: 'Closed' }), null);
  }
});
