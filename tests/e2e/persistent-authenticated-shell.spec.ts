import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const axePath = path.join(process.cwd(), "node_modules/axe-core/axe.min.js");
const password = "Password123!";
const runId = `${process.pid}-${Date.now()}`;
const roles = ["owner", "admin", "manager", "cashier", "technician"] as const;
type Role = (typeof roles)[number];

type TestUser = { id: string; email: string; role: Role };
type AxeResult = { violations: Array<{ id: string; nodes: unknown[] }> };

let authAdmin: SupabaseClient;
let branchId = "";
const users = new Map<Role, TestUser>();

function localServiceClient() {
  const output = execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const status = JSON.parse(output.slice(output.indexOf("{"))) as {
    API_URL?: string;
    SERVICE_ROLE_KEY?: string;
  };
  if (!status.API_URL?.startsWith("http://127.0.0.1:") || !status.SERVICE_ROLE_KEY) {
    throw new Error("Loopback Supabase is required for persistent-shell E2E.");
  }
  return createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function localDatabaseContainer() {
  const containers = execFileSync(
    "docker",
    ["ps", "--format", "{{.Names}}", "--filter", "name=supabase_db_"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  if (containers.length !== 1) {
    throw new Error(`Expected one local database container, found ${containers.length}.`);
  }
  return containers[0];
}

async function holdTableLock(table: "customers" | "invoices" | "products") {
  const process = spawn(
    "docker",
    [
      "exec",
      "-i",
      localDatabaseContainer(),
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { stdio: "pipe" },
  );
  let output = "";
  let errorOutput = "";
  process.stderr.on("data", (chunk) => {
    errorOutput += chunk.toString();
  });

  const locked = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out acquiring ${table} lock: ${errorOutput}`));
    }, 10_000);
    process.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.split("\n").includes("LOCKED")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    process.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Lock process exited with ${code}: ${errorOutput}`));
    });
  });

  process.stdin.write(
    `BEGIN; LOCK TABLE public.${table} IN ACCESS EXCLUSIVE MODE; SELECT 'LOCKED';\n`,
  );
  await locked;

  return async () => {
    process.stdin.end("ROLLBACK;\n\\q\n");
    await once(process, "exit");
  };
}

async function rejectOptionalCookies(page: Page) {
  const reject = page.getByRole("button", {
    name: "Reject optional cookies",
    exact: true,
  });
  if (await reject.isVisible().catch(() => false)) await reject.click();
}

async function loginRole(page: Page, role: Role) {
  const user = users.get(role);
  if (!user) throw new Error(`Missing ${role} fixture.`);
  await loginLocalOwnerDirectly(page, user.email, password);
  await rejectOptionalCookies(page);
}

function preferences(collapsed: boolean) {
  return {
    version: 1,
    collapsed,
    order: ["/products", "/dashboard", "/pos", "/invoices", "/customers"],
    archived: ["/returns"],
    updatedAt: new Date().toISOString(),
  };
}

async function setPreferences(page: Page, role: Role, collapsed: boolean) {
  const user = users.get(role);
  if (!user) throw new Error(`Missing ${role} fixture.`);
  const next = preferences(collapsed);
  const { error } = await getLocalAdminClient()
    .from("user_ui_preferences")
    .upsert(
      { user_id: user.id, sidebar_preferences: next },
      { onConflict: "user_id" },
    );
  if (error) throw error;
  await page.evaluate((value) => {
    localStorage.setItem("saledock-sidebar-preferences-v1", JSON.stringify(value));
  }, next);
  await page.reload();
  await expect(page.locator('[data-sidebar-state]:visible')).toHaveAttribute(
    "data-sidebar-state",
    collapsed ? "collapsed" : "expanded",
    { timeout: 20_000 },
  );
  await expect
    .poll(() =>
      page
        .locator('[data-sidebar-state]:visible')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(collapsed ? 96 : 288);
}

async function blockTargetPrefetches(page: Page) {
  const targets = [
    "/dashboard",
    "/invoices",
    "/products",
    "/customers",
    "/reports",
  ];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isTarget = targets.includes(url.pathname);
    const headers = request.headers();
    if (
      isTarget &&
      (headers["next-router-prefetch"] === "1" || headers.purpose === "prefetch")
    ) {
      await route.abort();
      return;
    }
    await route.continue();
  });
}

function visibleSidebar(page: Page) {
  return page.locator('[data-sidebar-state]:visible');
}

async function runAxe(page: Page, region: Locator): Promise<AxeResult> {
  await page.addScriptTag({ path: axePath });
  return region.evaluate(async (element) =>
    (
      window as typeof window & {
        axe: { run: (context: Element, options: unknown) => Promise<AxeResult> };
      }
    ).axe.run(element, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    }),
  );
}

async function slowNavigate(
  page: Page,
  options: {
    href: string;
    loadingTitle: string;
    lockTable: "customers" | "invoices" | "products";
    expectedWidth: number;
    expectedState: "collapsed" | "expanded";
  },
) {
  const sidebar = visibleSidebar(page);
  const marker = `persist-${Math.random().toString(36).slice(2)}`;
  await sidebar.evaluate((element, value) => {
    element.dataset.persistentShellTest = value;
  }, marker);
  const beforeContentX = await page
    .locator('[data-app-shell-root]:visible')
    .evaluate((element) => element.getBoundingClientRect().x);

  const releaseLock = await holdTableLock(options.lockTable);
  let navigation: Promise<unknown> | undefined;
  try {
    navigation = page.locator(`a[href="${options.href}"]:visible`).first().click();
    const busyMain = page.locator('[data-app-shell-main][aria-busy="true"]:visible');
    await expect(busyMain).toBeVisible();
    await expect(busyMain.getByRole("status")).toHaveText(
      `Loading ${options.loadingTitle}.`,
    );
    await expect(visibleSidebar(page)).toHaveAttribute(
      "data-sidebar-state",
      options.expectedState,
    );
    await expect(page.locator(`[data-persistent-shell-test="${marker}"]:visible`)).toHaveCount(1);
    await expect(
      page.locator('[data-persistent-authenticated-frame] > aside[aria-hidden="true"]'),
    ).toHaveCount(0);

    const widths = await sidebar.evaluate(async (element) => {
      const values: number[] = [];
      for (let index = 0; index < 12; index += 1) {
        await new Promise(requestAnimationFrame);
        values.push(element.getBoundingClientRect().width);
      }
      return values;
    });
    expect(new Set(widths)).toEqual(new Set([options.expectedWidth]));
    const duringContentX = await page
      .locator('[data-app-shell-root]:visible')
      .evaluate((element) => element.getBoundingClientRect().x);
    expect(duringContentX).toBe(beforeContentX);
  } finally {
    await releaseLock();
  }

  await navigation;
  await page.waitForURL(new RegExp(`${options.href.replaceAll("/", "\\/")}(?:\\?|$)`));
  await expect(page.locator('[data-app-shell-main][aria-busy="true"]:visible')).toHaveCount(0);
  await expect(page.locator(`[data-persistent-shell-test="${marker}"]:visible`)).toHaveCount(1);
  await expect(visibleSidebar(page)).toHaveAttribute(
    "data-sidebar-state",
    options.expectedState,
  );
  await expect
    .poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().width))
    .toBe(options.expectedWidth);
}

test.describe("persistent authenticated shell", () => {
  test.describe.configure({ mode: "serial", retries: 0 });
  test.skip(!isLocalPlaywrightRun(), "Persistent-shell E2E is restricted to loopback.");

  test.beforeAll(async () => {
    authAdmin = localServiceClient();
    const admin = getLocalAdminClient();
    const { data: branch, error: branchError } = await admin
      .from("branches")
      .select("id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .limit(1)
      .single();
    if (branchError || !branch?.id) throw new Error("Local QA branch is unavailable.");
    branchId = branch.id;

    for (const role of roles) {
      const email = `persistent-shell-${role}-${runId}@saledock.local`;
      const { data, error } = await authAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`Could not create ${role}: ${error?.message}`);
      const user = { id: data.user.id, email, role };
      users.set(role, user);
      const { error: profileError } = await admin.from("profiles").insert({
        id: user.id,
        organization_id: LOCAL_QA_ORG_ID,
        branch_id: branchId,
        full_name: `Persistent Shell ${role}`,
        role,
        is_active: true,
        onboarding_completed: true,
      });
      if (profileError) throw new Error(`Could not create ${role} profile: ${profileError.message}`);
    }
  });

  test.afterAll(async () => {
    const admin = getLocalAdminClient();
    const ids = [...users.values()].map((user) => user.id);
    if (ids.length > 0) {
      await admin.from("user_ui_preferences").delete().in("user_id", ids);
      await admin.from("profiles").delete().in("id", ids);
    }
    for (const user of users.values()) {
      await authAdmin.auth.admin.deleteUser(user.id);
    }
  });

  test("collapsed sidebar and custom preferences persist across three slow sibling routes", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await blockTargetPrefetches(page);
    await loginRole(page, "owner");
    await setPreferences(page, "owner", true);

    const navHrefs = await visibleSidebar(page)
      .locator("[data-sidebar-nav-href]")
      .evaluateAll((items) => items.map((item) => item.getAttribute("data-sidebar-nav-href")));
    expect(navHrefs.slice(0, 5)).toEqual([
      "/products",
      "/dashboard",
      "/pos",
      "/invoices",
      "/customers",
    ]);
    expect(navHrefs).not.toContain("/returns");

    await slowNavigate(page, {
      href: "/invoices",
      loadingTitle: "Invoices",
      lockTable: "invoices",
      expectedWidth: 96,
      expectedState: "collapsed",
    });
    await slowNavigate(page, {
      href: "/products",
      loadingTitle: "Products",
      lockTable: "products",
      expectedWidth: 96,
      expectedState: "collapsed",
    });
    await slowNavigate(page, {
      href: "/customers",
      loadingTitle: "Customers",
      lockTable: "customers",
      expectedWidth: 96,
      expectedState: "collapsed",
    });

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("saledock-sidebar-preferences-v1") ?? "{}"),
    );
    expect(stored.collapsed).toBe(true);
    expect(stored.order.slice(0, 5)).toEqual(preferences(true).order);
    expect(stored.archived).toEqual(["/returns"]);
    expect(await runAxe(page, visibleSidebar(page))).toMatchObject({ violations: [] });
  });

  test("expanded dark-mode sidebar remains the same real DOM node during loading", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
    await blockTargetPrefetches(page);
    await loginRole(page, "admin");
    await setPreferences(page, "admin", false);
    await page.evaluate(() => document.documentElement.classList.add("dark"));

    await slowNavigate(page, {
      href: "/reports",
      loadingTitle: "Reports",
      lockTable: "invoices",
      expectedWidth: 288,
      expectedState: "expanded",
    });
    await expect(visibleSidebar(page).getByRole("link", { name: "Audit Log" })).toBeVisible();
    await page.emulateMedia({ media: "print", colorScheme: "dark" });
    await expect(page.locator("[data-persistent-authenticated-frame]")).toHaveCSS(
      "display",
      "contents",
    );
    await expect(page.locator('[data-app-shell-root][data-print-full-document="true"]')).toHaveCSS(
      "overflow",
      "visible",
    );
  });

  test("all five roles retain their exact navigation matrix during a slow transition", async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await blockTargetPrefetches(page);

    const expected = {
      owner: { audit: 1, users: 1, purchases: 1, replenishment: 1 },
      admin: { audit: 1, users: 1, purchases: 1, replenishment: 1 },
      manager: { audit: 0, users: 0, purchases: 1, replenishment: 1 },
      cashier: { audit: 0, users: 0, purchases: 0, replenishment: 0 },
      technician: { audit: 0, users: 0, purchases: 0, replenishment: 0 },
    } satisfies Record<Role, Record<string, number>>;

    for (const role of roles) {
      await loginRole(page, role);
      await setPreferences(page, role, false);
      const sidebar = visibleSidebar(page);
      const assertRoleLinks = async () => {
        await expect(sidebar.locator('a[href="/audit-log"]')).toHaveCount(expected[role].audit);
        await expect(sidebar.locator('a[href="/users"]')).toHaveCount(expected[role].users);
        await expect(sidebar.locator('a[href="/suppliers/purchases"]')).toHaveCount(
          expected[role].purchases,
        );
        await expect(sidebar.locator('a[href="/purchases/replenishment"]')).toHaveCount(
          expected[role].replenishment,
        );
      };
      await assertRoleLinks();

      const releaseLock = await holdTableLock("invoices");
      let navigation: Promise<unknown> | undefined;
      try {
        navigation = page.locator('a[href="/invoices"]:visible').first().click();
        await expect(page.locator('[data-app-shell-main][aria-busy="true"]:visible')).toBeVisible();
        await assertRoleLinks();
      } finally {
        await releaseLock();
      }
      await navigation;
      await page.waitForURL(/\/invoices(?:\?|$)/);
      await assertRoleLinks();
    }
  });

  test("mobile route loading keeps one mobile chrome set without desktop-sidebar leakage", async ({ page }) => {
    test.setTimeout(150_000);
    await blockTargetPrefetches(page);
    await loginRole(page, "owner");

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/dashboard");
      await expect(page.getByText("Loading SaleDock...", { exact: true })).toHaveCount(0);
      await expect(visibleSidebar(page)).toHaveCount(0);
      await expect(page.locator("nav.fixed.bottom-0:visible")).toHaveCount(1);

      const releaseLock = await holdTableLock("invoices");
      let navigation: Promise<unknown> | undefined;
      try {
        navigation = page.locator('nav.fixed.bottom-0 a[href="/invoices"]:visible').click();
        const busyMain = page.locator('[data-app-shell-main][aria-busy="true"]:visible');
        await expect(busyMain).toBeVisible();
        await expect(page.getByText("Loading SaleDock...", { exact: true })).toHaveCount(0);
        await expect(visibleSidebar(page)).toHaveCount(0);
        await expect(page.locator("nav.fixed.bottom-0:visible")).toHaveCount(1);
        await expect(page.locator('[role="dialog"][aria-label="Navigation menu"]')).toHaveCount(1);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        expect(await runAxe(page, busyMain)).toMatchObject({ violations: [] });
      } finally {
        await releaseLock();
      }
      await navigation;
      await page.waitForURL(/\/invoices(?:\?|$)/);
    }
  });
});
