import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const appRoot = join(repositoryRoot, "src/app");

function source(path) {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function sha256(path) {
  return createHash("sha256").update(source(path)).digest("hex");
}

test("all 39 page routes have an exact loading boundary", () => {
  const pages = walk(appRoot).filter((path) => path.endsWith("/page.tsx"));
  assert.equal(pages.length, 39);

  const missing = pages
    .filter((page) => !existsSync(join(dirname(page), "loading.tsx")))
    .map((page) => relative(appRoot, page));

  assert.deepEqual(missing, []);
});

test("authenticated route skeletons expose one busy page region", () => {
  const loadingFiles = walk(appRoot).filter((path) =>
    path.endsWith("/loading.tsx"),
  );
  const appShellLoaders = loadingFiles.filter((path) =>
    readFileSync(path, "utf8").includes("<AppShell"),
  );

  assert.equal(appShellLoaders.length, 25);
  for (const path of appShellLoaders) {
    assert.match(
      readFileSync(path, "utf8"),
      /<AppShell\b[^>]*\bisLoading\b/,
      `${relative(repositoryRoot, path)} marks its destination region busy`,
    );
  }
});

test("the app shell streams static chrome while async shell data resolves", () => {
  const appShell = source("src/components/layout/app-shell.tsx");
  const fallbacks = source("src/components/layout/app-shell-loading.tsx");

  assert.match(
    appShell,
    /<Suspense fallback=\{<SidebarLoading \/>\}>[\s\S]*?<Sidebar \/>[\s\S]*?<\/Suspense>/,
  );
  assert.match(
    appShell,
    /<Suspense fallback=\{<TopbarLoading pageTitle=\{pageTitle\} \/>\}>[\s\S]*?<Topbar pageTitle=\{pageTitle\} \/>[\s\S]*?<\/Suspense>/,
  );
  assert.match(
    appShell,
    /<Suspense fallback=\{null\}>[\s\S]*?<MobileDrawerWrapper \/>[\s\S]*?<\/Suspense>/,
  );
  assert.match(appShell, /aria-busy=\{isLoading \|\| undefined\}/);
  assert.match(appShell, /role="status" aria-live="polite"/);
  assert.doesNotMatch(
    fallbacks,
    /getCurrentContext|createClient|supabase|await\s/,
  );
  assert.equal((fallbacks.match(/aria-hidden="true"/g) ?? []).length, 2);
});

test("generic loading feedback is quiet, accessible, and reduced-motion safe", () => {
  const loading = source("src/components/loading/saledock-loading.tsx");
  const skeleton = source("src/components/ui/skeleton.tsx");

  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-live="polite"/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /motion-reduce:animate-none/);
  assert.doesNotMatch(loading, /shadow-2xl|rounded-\[2rem\]|size-16|size-20/);
  assert.match(skeleton, /aria-hidden="true"/);
  assert.match(skeleton, /motion-reduce:animate-none/);
  assert.match(skeleton, /pointer-events-none/);
});

test("supplier purchase detail and new routes use destination-shaped skeletons", () => {
  const detail = source("src/app/suppliers/purchases/[id]/loading.tsx");
  const create = source("src/app/suppliers/purchases/new/loading.tsx");

  assert.match(detail, /pageTitle="Purchase details" isLoading/);
  assert.match(detail, /lg:grid-cols-\[minmax\(0,1fr\)_360px\]/);
  assert.match(detail, /<aside className="space-y-5">/);
  assert.doesNotMatch(detail, /RecordPaymentForm|Payment recorded|fake|PKR/);

  assert.match(create, /pageTitle="Record purchase" isLoading/);
  assert.match(create, /lg:grid-cols-\[minmax\(0,1fr\)_360px\]/);
  assert.match(create, /<Field wide \/>/);
  assert.doesNotMatch(
    create,
    /createSupplierPurchaseAction|Record purchase<|PKR/,
  );
});

test("unexpected route failures have a safe retry boundary", () => {
  const errorBoundary = source("src/app/error.tsx");

  assert.match(errorBoundary, /^"use client";/);
  assert.match(errorBoundary, /unstable_retry: \(\) => void/);
  assert.match(errorBoundary, /onClick=\{\(\) => unstable_retry\(\)\}/);
  assert.match(errorBoundary, /role="alert"/);
  assert.match(errorBoundary, /This page could not load/);
  assert.doesNotMatch(
    errorBoundary,
    /\{error\.message\}|dangerouslySetInnerHTML/,
  );
});

test("confirmed actions stay locked until the actual action settles", () => {
  const confirmForm = source("src/components/ui/confirm-form.tsx");

  assert.match(confirmForm, /await action\(formData\)/);
  assert.match(
    confirmForm,
    /try \{[\s\S]*?await action\(formData\);[\s\S]*?\} finally \{/,
  );
  assert.match(confirmForm, /submissionLockRef\.current = true/);
  assert.match(confirmForm, /submissionLockRef\.current = false/);
  assert.match(confirmForm, /form\.checkValidity\(\)/);
  assert.match(
    confirmForm,
    /<fieldset disabled=\{isConfirming \|\| isSubmitting\}/,
  );
  assert.doesNotMatch(confirmForm, /setTimeout|1000/);
});

test("pending submit content disables duplicates and preserves button width", () => {
  const button = source("src/components/ui/pending-submit-button.tsx");

  assert.match(button, /useFormStatus\(\)/);
  assert.match(button, /disabled=\{disabled \|\| pending\}/);
  assert.match(button, /aria-busy=\{pending \|\| undefined\}/);
  assert.match(button, /grid place-items-center/);
  assert.equal((button.match(/col-start-1 row-start-1/g) ?? []).length, 2);
  assert.match(button, /motion-reduce:animate-none/);
});

test("catalog and customer archive/restore surfaces use action-specific pending labels", () => {
  const files = [
    "src/app/products/categories-tab.tsx",
    "src/app/products/suppliers-tab.tsx",
    "src/app/products/products-tab.tsx",
    "src/app/customers/page.tsx",
    "src/app/customers/[id]/page.tsx",
  ];

  for (const path of files) {
    const file = source(path);
    assert.match(file, /PendingSubmitButton/);
    assert.match(file, /pendingLabel="Archiving\.\.\."/);
    assert.match(file, /pendingLabel="Restoring\.\.\."/);
  }

  for (const path of files.slice(0, 3)) {
    const file = source(path);
    assert.match(file, /async function handleArchive\(formData: FormData\)/);
    assert.match(
      file,
      /await archive(?:Product|Category|Supplier)Action\(formData\)/,
    );
    assert.match(file, /async function handleUnarchive\(formData: FormData\)/);
  }
});

test("reviewed high-risk mutation and pending paths remain byte-for-byte unchanged", () => {
  const expected = {
    "src/app/pos/actions.ts":
      "fb02ef6726f2af3dd38792aacc4c98643ce1ae3b5f9f0665c837bb379d5e03fe",
    "src/app/pos/pos-client.tsx":
      "8016996f179a475f5268c9016f7fe0275d15d45b309d3d8915385b5148176a51",
    "src/app/customers/[id]/settlement-form.tsx":
      "67aa6a41e22a7e79ad02873c18c64012296a3bcaf0ff4a299f287e60be3657ad",
    "src/app/customers/[id]/write-off-form.tsx":
      "0ee6ad406160bec9e9f22c2ca3d376c5740bb255768e92e134232ed316779a7f",
    "src/app/suppliers/purchases/[id]/record-payment-form.tsx":
      "06e7f9d02c88eba383faa03cfe4bfa90d3bf6d35c05a94ae1473defbcf8f189c",
    "src/app/suppliers/purchases/actions.ts":
      "afef34ca3b70a863179d90e65536f86986a3ebca61e10a4f14af66c5d6b4bbbe",
    "src/app/suppliers/purchases/new/new-purchase-form.tsx":
      "1338271bea0fb40c7bc9d2c12756eb56082536d946a29cf9ad954d2a0f6f3b9b",
    "src/app/expenses/actions.ts":
      "48490a436d7a46bca149489c204af3366ca76bab747c4301ae86c790d7b82cd1",
    "src/app/expenses/expense-form.tsx":
      "38465cfce320c4ffac76e24d5c5c64da23278fb8212b0ef948efcad7c70b6278",
    "src/app/expenses/void-expense-form.tsx":
      "24c63d1a5c27e5eba71996c88e6b392bb259b17a50d529527e69682d9c80d62c",
    "src/app/daily-closing/actions.ts":
      "949485fcd1480932369232ef99b188590ca0fa292f2bf7257fdf9d530da1c12d",
    "src/app/daily-closing/closing-form.tsx":
      "5278c124bd5a9e9836ade5c445b23ae094d7cf732b8d8872a3ac6c1eef76d1f9",
    "src/app/products/inventory-actions.ts":
      "d101c12b70842ae0e9df9b2b5d028a5fe8f4a2c6b3d1d646f7af0a4abfeb9c95",
    "src/app/products/inventory-section.tsx":
      "7c229195242668db59260077207499389bd69781373449ba256331b8dc2495dc",
    "src/app/repairs/actions.ts":
      "65c848bcd998c4290be93fb56048175312915265eb9b278630e1098b669e99bc",
    "src/app/repairs/repair-form.tsx":
      "fa7e4affa5e29cc16c84069bdf5446bb4dcb819133b8abaea2d566846bb22959",
  };

  for (const [path, hash] of Object.entries(expected)) {
    assert.equal(sha256(path), hash, `${path} remains unchanged`);
  }
});
