import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const appRoot = join(repositoryRoot, "src/app");
const slotRoot = join(appRoot, "@authenticatedShell", "(workspace)");

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function source(path) {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

function routeFor(path) {
  return dirname(relative(appRoot, path));
}

test("every AppShell route is mirrored by the persistent parallel slot", () => {
  const appShellRoutes = new Set(
    walk(appRoot)
      .filter(
        (path) =>
          !path.includes("/@authenticatedShell/") &&
          (path.endsWith("/page.tsx") || path.endsWith("/loading.tsx")) &&
          readFileSync(path, "utf8").includes("<AppShell"),
      )
      .map(routeFor),
  );

  assert.equal(appShellRoutes.size, 25);
  for (const route of appShellRoutes) {
    assert.equal(
      existsSync(join(slotRoot, route, "page.tsx")),
      true,
      `${route} has a persistent-shell slot marker`,
    );
  }

  const slotRoutes = walk(slotRoot)
    .filter((path) => path.endsWith("/page.tsx"))
    .map((path) => dirname(relative(slotRoot, path)));
  assert.deepEqual(new Set(slotRoutes), appShellRoutes);
});

test("the persistent shell owns real role-aware navigation exactly once", () => {
  const shellLayout = source(
    "src/app/@authenticatedShell/(workspace)/layout.tsx",
  );
  const appShell = source("src/components/layout/app-shell.tsx");
  const fallback = source("src/components/layout/app-shell-loading.tsx");

  assert.equal((shellLayout.match(/<Sidebar \/>/g) ?? []).length, 1);
  assert.equal((shellLayout.match(/<MobileDrawerWrapper \/>/g) ?? []).length, 1);
  assert.doesNotMatch(appShell, /<Sidebar|MobileDrawerWrapper|DrawerProvider/);
  assert.doesNotMatch(fallback, /SidebarLoading|<aside|w-72/);
});

test("public and authentication routes resolve to the empty shell slot", () => {
  const defaultSlot = source("src/app/@authenticatedShell/default.tsx");
  const frame = source(
    "src/components/layout/persistent-authenticated-frame.tsx",
  );

  assert.match(defaultSlot, /return null/);
  for (const publicPath of [
    "/",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/login",
    "/onboarding",
    "/setup",
    "/auth/confirm",
  ]) {
    assert.doesNotMatch(
      frame,
      new RegExp(`"${publicPath.replace("/", "\\/")}"`),
      `${publicPath} is not classified as workspace chrome`,
    );
  }
});

test("route content keeps existing title, print, loading, and mobile-tab contracts", () => {
  const appShell = source("src/components/layout/app-shell.tsx");
  const frame = source(
    "src/components/layout/persistent-authenticated-frame.tsx",
  );

  assert.match(appShell, /pageTitle\?: string/);
  assert.match(appShell, /printFullDocument\?: boolean/);
  assert.match(appShell, /data-print-full-document=/);
  assert.match(appShell, /data-app-shell-main/);
  assert.match(appShell, /aria-busy=\{isLoading \|\| undefined\}/);
  assert.match(appShell, /tabIndex=\{isLoading \? 0 : undefined\}/);
  assert.match(appShell, /\{showMobileTabBar && <MobileTabBar \/>\}/);
  assert.match(frame, /print:contents/);
});
