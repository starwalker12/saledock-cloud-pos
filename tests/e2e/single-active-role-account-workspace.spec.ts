import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
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
const workspaceStateKey = "saledock-workspace-tab-state-v1";

type Role = "owner" | "admin" | "manager" | "cashier" | "technician";
type UserKey =
  | "owner"
  | "admin"
  | "manager"
  | "cashierOne"
  | "cashierTwo"
  | "technician";
type TestUser = { id: string; email: string; role: Role };
type StoredWorkspaceState = {
  userId: string;
  tabId: string;
  status: "active" | "paused" | "new";
  generation: number | null;
};
type LeaseRow = {
  user_id: string;
  device_id: string;
  tab_id: string;
  generation: number;
};
type AxeResult = { violations: Array<{ id: string; nodes: unknown[] }> };

let service: SupabaseClient;
let branchId = "";
const users = new Map<UserKey, TestUser>();

function localServiceClient() {
  const output = execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const status = JSON.parse(output.slice(output.indexOf("{"))) as {
    API_URL?: string;
    SERVICE_ROLE_KEY?: string;
  };
  if (
    !status.API_URL?.startsWith("http://127.0.0.1:") ||
    !status.SERVICE_ROLE_KEY
  ) {
    throw new Error("Loopback Supabase is required for workspace E2E.");
  }
  return createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function user(key: UserKey) {
  const fixture = users.get(key);
  if (!fixture) throw new Error(`Missing ${key} workspace fixture.`);
  return fixture;
}

function guard(page: Page) {
  return page.locator("[data-active-workspace-guard]");
}

function pausedDialog(page: Page) {
  return page.locator("[data-active-workspace-paused-dialog]");
}

async function expectWorkspaceState(
  page: Page,
  state: "active" | "paused",
  timeout = 10_000,
) {
  await expect(guard(page)).toHaveAttribute("data-active-workspace-state", state, {
    timeout,
  });
  await expect(pausedDialog(page)).toHaveCount(state === "paused" ? 1 : 0);
}

async function rejectOptionalCookies(page: Page) {
  const reject = page.getByRole("button", {
    name: "Reject optional cookies",
    exact: true,
  });
  if (await reject.isVisible().catch(() => false)) await reject.click();
}

async function login(page: Page, key: UserKey) {
  const fixture = user(key);
  await loginLocalOwnerDirectly(page, fixture.email, password);
  await expectWorkspaceState(page, "active");
  await rejectOptionalCookies(page);
}

async function storedState(page: Page): Promise<StoredWorkspaceState> {
  return page.evaluate((key) => {
    const raw = sessionStorage.getItem(key);
    if (!raw) throw new Error("Workspace tab state is missing.");
    return JSON.parse(raw) as StoredWorkspaceState;
  }, workspaceStateKey);
}

async function leaseFor(key: UserKey): Promise<LeaseRow> {
  const { data, error } = await service
    .from("user_active_workspace_leases")
    .select("user_id,device_id,tab_id,generation")
    .eq("user_id", user(key).id)
    .single();
  if (error || !data) throw new Error(`Lease read failed: ${error?.message}`);
  return data as LeaseRow;
}

async function useHere(page: Page) {
  const button = pausedDialog(page).getByRole("button", {
    name: "Use Here",
    exact: true,
  });
  await expect(button).toBeEnabled();
  await button.click();
  await expectWorkspaceState(page, "active");
}

async function runAxe(page: Page): Promise<AxeResult> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () =>
    (
      window as typeof window & {
        axe: { run: (context: Element, options: unknown) => Promise<AxeResult> };
      }
    ).axe.run(document.querySelector("[data-active-workspace-paused-dialog]")!, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    }),
  );
}

async function newLoggedInContext(
  browser: Browser,
  key: UserKey,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await login(page, key);
  return { context, page };
}

test.describe("single active role-account workspace", () => {
  test.describe.configure({ mode: "serial", retries: 0 });
  test.skip(!isLocalPlaywrightRun(), "Workspace E2E is restricted to loopback.");

  test.beforeAll(async () => {
    service = localServiceClient();
    const admin = getLocalAdminClient();
    const { data: branch, error: branchError } = await admin
      .from("branches")
      .select("id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .limit(1)
      .single();
    if (branchError || !branch?.id) throw new Error("Local QA branch is unavailable.");
    branchId = branch.id;

    const fixtures: Array<[UserKey, Role]> = [
      ["owner", "owner"],
      ["admin", "admin"],
      ["manager", "manager"],
      ["cashierOne", "cashier"],
      ["cashierTwo", "cashier"],
      ["technician", "technician"],
    ];

    for (const [key, role] of fixtures) {
      const email = `active-workspace-${key}-${runId}@saledock.local`;
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) {
        throw new Error(`Could not create ${key}: ${error?.message}`);
      }
      const fixture = { id: data.user.id, email, role };
      users.set(key, fixture);
      const { error: profileError } = await admin.from("profiles").insert({
        id: fixture.id,
        organization_id: LOCAL_QA_ORG_ID,
        branch_id: branchId,
        full_name: `Active Workspace ${key}`,
        role,
        is_active: true,
        onboarding_completed: true,
      });
      if (profileError) {
        throw new Error(`Could not create ${key} profile: ${profileError.message}`);
      }
    }
  });

  test.afterAll(async () => {
    const ids = [...users.values()].map((fixture) => fixture.id);
    if (ids.length > 0) {
      await service.from("user_active_workspace_leases").delete().in("user_id", ids);
      await service.from("user_ui_preferences").delete().in("user_id", ids);
      await service.from("profiles").delete().in("id", ids);
    }
    for (const fixture of users.values()) {
      await service.auth.admin.deleteUser(fixture.id);
    }
  });

  test("newest same-browser tab wins, Use Here reverses control, and in-flight work settles once", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await login(page, "owner");

    const sidebar = page.locator('[data-sidebar-state]:visible');
    await expect(sidebar).toBeVisible();
    await sidebar.evaluate((element) => {
      element.setAttribute("data-workspace-shell-marker", "owner-shell");
    });

    const second = await page.context().newPage();
    await second.goto("/dashboard");
    await expectWorkspaceState(second, "active");
    await expectWorkspaceState(page, "paused");
    await expect(page.locator('[data-workspace-shell-marker="owner-shell"]')).toHaveCount(1);

    await useHere(page);
    await expectWorkspaceState(second, "paused");
    await useHere(second);
    await expectWorkspaceState(page, "paused");
    await useHere(page);
    await expectWorkspaceState(second, "paused");

    const shellState = await storedState(page);
    const guardMarker = `guard-${runId}`;
    await guard(page).evaluate((element, marker) => {
      element.setAttribute("data-workspace-guard-marker", marker);
    }, guardMarker);
    await page.locator('a[href="/invoices"]:visible').first().click();
    await page.waitForURL(/\/invoices(?:\?|$)/);
    await expectWorkspaceState(page, "active");
    await expect(
      page.locator(`[data-workspace-guard-marker="${guardMarker}"]`),
    ).toHaveCount(1);
    expect((await storedState(page)).tabId).toBe(shellState.tabId);

    let delayedRequests = 0;
    let releaseRequest: (() => void) | undefined;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await page.route("**/__workspace_test_delay", async (route) => {
      delayedRequests += 1;
      await requestGate;
      await route.fulfill({ status: 200, body: "settled-once" });
    });
    const inFlight = page.evaluate(() =>
      fetch("/__workspace_test_delay").then((response) => response.text()),
    );
    await expect.poll(() => delayedRequests).toBe(1);
    await useHere(second);
    await expectWorkspaceState(page, "paused");
    releaseRequest?.();
    await expect(inFlight).resolves.toBe("settled-once");
    expect(delayedRequests).toBe(1);
    await expectWorkspaceState(page, "paused");

    const content = page.locator("[data-active-workspace-content]");
    await expect(content).toHaveAttribute("inert", "");
    await expect(content).toHaveAttribute("aria-hidden", "true");
    const dialog = pausedDialog(page);
    await expect(dialog).toHaveAttribute("role", "dialog");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.getByRole("button", { name: "Use Here" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    expect((await runAxe(page)).violations).toEqual([]);

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(dialog).toBeVisible();
  });

  test("active reload, paused reload, duplicate-tab repair, polling cost, and reconnect are safe", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page, "admin");
    const beforeReload = await storedState(page);
    const beforeLease = await leaseFor("admin");
    await page.reload();
    await expectWorkspaceState(page, "active");
    const afterReload = await storedState(page);
    const afterReloadLease = await leaseFor("admin");
    expect(afterReload.tabId).toBe(beforeReload.tabId);
    expect(afterReloadLease.generation).toBe(beforeLease.generation);

    const duplicate = await page.context().newPage();
    await duplicate.goto("/");
    await duplicate.evaluate(
      ({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)),
      { key: workspaceStateKey, value: afterReload },
    );
    await duplicate.goto("/dashboard");
    await expectWorkspaceState(duplicate, "active");
    await expectWorkspaceState(page, "paused");
    const duplicateState = await storedState(duplicate);
    expect(duplicateState.tabId).not.toBe(afterReload.tabId);

    const winnerLease = await leaseFor("admin");
    await page.reload();
    await expectWorkspaceState(page, "paused");
    expect((await leaseFor("admin")).generation).toBe(winnerLease.generation);

    let heartbeatRequests = 0;
    duplicate.on("request", (request) => {
      if (request.url().includes("/rpc/heartbeat_active_workspace")) {
        heartbeatRequests += 1;
      }
    });
    await duplicate.waitForTimeout(10_600);
    expect(heartbeatRequests).toBeGreaterThanOrEqual(1);
    expect(heartbeatRequests).toBeLessThanOrEqual(3);

    await duplicate.route("**/rest/v1/rpc/heartbeat_active_workspace", (route) =>
      route.abort("failed"),
    );
    await expect(
      duplicate.getByText(
        "Session coordination is reconnecting. Your sign-in remains active.",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 17_000 });
    await expectWorkspaceState(duplicate, "active");
    await duplicate.unroute("**/rest/v1/rpc/heartbeat_active_workspace");
    await duplicate.bringToFront();
    await expect(
      duplicate.getByText(
        "Session coordination is reconnecting. Your sign-in remains active.",
        { exact: true },
      ),
    ).toHaveCount(0, { timeout: 8_000 });
    await expectWorkspaceState(duplicate, "active");
  });

  test("cross-device takeover is bounded and a stale sign-out cannot release the winner", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const first = await newLoggedInContext(browser, "manager");
    const second = await newLoggedInContext(browser, "manager");
    try {
      await expectWorkspaceState(second.page, "active");
      await expectWorkspaceState(first.page, "paused", 8_000);

      await useHere(first.page);
      await expectWorkspaceState(second.page, "paused", 8_000);
      const winner = await leaseFor("manager");

      await second.page.route("**/rest/v1/rpc/get_active_workspace", (route) =>
        route.abort("failed"),
      );
      await second.page.waitForTimeout(5_500);
      await expectWorkspaceState(second.page, "paused");
      await second.page.unroute("**/rest/v1/rpc/get_active_workspace");
      await second.page.bringToFront();
      await expectWorkspaceState(second.page, "paused");

      await pausedDialog(second.page)
        .getByRole("button", { name: "Sign out", exact: true })
        .click();
      await expect(second.page).toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });
      await expectWorkspaceState(first.page, "active");
      expect(await leaseFor("manager")).toMatchObject(winner);
    } finally {
      await first.context.close();
      await second.context.close();
    }
  });

  test("different accounts in the same shop never pause each other, including two Cashiers", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const pairs: Array<[UserKey, UserKey]> = [
      ["owner", "admin"],
      ["owner", "cashierOne"],
      ["cashierOne", "cashierTwo"],
      ["manager", "technician"],
    ];

    for (const [leftKey, rightKey] of pairs) {
      const left = await newLoggedInContext(browser, leftKey);
      const right = await newLoggedInContext(browser, rightKey);
      try {
        await expectWorkspaceState(left.page, "active");
        await expectWorkspaceState(right.page, "active");
        await left.page.waitForTimeout(5_300);
        await expectWorkspaceState(left.page, "active");
        await expectWorkspaceState(right.page, "active");
        expect((await leaseFor(leftKey)).user_id).toBe(user(leftKey).id);
        expect((await leaseFor(rightKey)).user_id).toBe(user(rightKey).id);

        if (leftKey === "cashierOne" || rightKey === "technician") {
          const restricted = leftKey === "cashierOne" ? left.page : right.page;
          await expect(restricted.locator('a[href="/users"]:visible')).toHaveCount(0);
          await expect(restricted.locator('a[href="/audit-log"]:visible')).toHaveCount(0);
        }
      } finally {
        await left.context.close();
        await right.context.close();
      }
    }
  });

  test("native storage-event fallback preserves newest-tab behavior", async ({ browser }) => {
    test.setTimeout(60_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => {
      Object.defineProperty(window, "BroadcastChannel", {
        configurable: true,
        value: undefined,
      });
    });
    const first = await context.newPage();
    try {
      await login(first, "technician");
      const second = await context.newPage();
      await second.goto("/dashboard");
      await expectWorkspaceState(second, "active");
      await expectWorkspaceState(first, "paused");
    } finally {
      await context.close();
    }
  });
});
