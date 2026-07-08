import { expect, test, type Page } from "@playwright/test";
import { loginWithCredentials } from "./helpers/auth";
import { getLocalAdminClient, isLocalPlaywrightRun } from "./helpers/local-supabase";

const SIDEBAR_KEY = "saledock-sidebar-preferences-v1";
const SIDEBAR_EVENT = "saledock-sidebar-preferences-changed";
const OWNER_EMAIL = "owner@saledock.local";
const LOCAL_PASSWORD = "Password123!";

type SidebarPreferences = {
  version: 1;
  collapsed: boolean;
  order: string[];
  archived: string[];
  updatedAt: string;
  analyticsConsent?: "accepted" | "rejected";
  marketingConsent?: "accepted" | "rejected";
  futurePreference?: string;
};

function skipUnlessLocal(): void {
  test.skip(!isLocalPlaywrightRun(), "Sidebar reorder QA is restricted to localhost.");
}

async function localOwnerId() {
  const admin = getLocalAdminClient();
  const { data: owners, error } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "owner")
    .eq("full_name", "Demo Owner")
    .limit(1);

  if (error) {
    throw new Error("Local owner profile could not be found for sidebar preferences.");
  }

  return owners?.[0]?.id ?? null;
}

async function resetLocalSidebarPreferences() {
  const ownerId = await localOwnerId();
  if (!ownerId) return;

  const { error } = await getLocalAdminClient()
    .from("user_ui_preferences")
    .delete()
    .eq("user_id", ownerId);

  if (error) {
    throw new Error("Local sidebar preferences could not be reset.");
  }
}

async function writeRemoteSidebarPreferences(preferences: SidebarPreferences) {
  const ownerId = await localOwnerId();
  if (!ownerId) throw new Error("Local owner profile is missing.");

  const { error } = await getLocalAdminClient()
    .from("user_ui_preferences")
    .upsert(
      {
        user_id: ownerId,
        sidebar_preferences: preferences,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    throw new Error("Local sidebar preferences could not be seeded.");
  }
}

async function remoteSidebarPreferences(): Promise<SidebarPreferences | null> {
  const ownerId = await localOwnerId();
  if (!ownerId) return null;

  const { data, error } = await getLocalAdminClient()
    .from("user_ui_preferences")
    .select("sidebar_preferences")
    .eq("user_id", ownerId)
    .limit(1);

  if (error) return null;
  return (data?.[0]?.sidebar_preferences as SidebarPreferences | null | undefined) ?? null;
}

async function expectRemoteSidebarOrder(page: Page) {
  const expected = await storedSidebarPreferences(page);
  await expect
    .poll(async () => (await remoteSidebarPreferences())?.order?.join("|") ?? "", { timeout: 10_000 })
    .toBe(expected.order.join("|"));
}

async function loginOwner(page: Page) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  expect(await loginWithCredentials(page, OWNER_EMAIL, LOCAL_PASSWORD)).toBe(true);
  await waitForSidebar(page);

  const rejectCookies = page.getByRole("button", { name: "Reject optional cookies", exact: true });
  if (await rejectCookies.isVisible().catch(() => false)) {
    await rejectCookies.click();
  }
}

async function waitForSidebar(page: Page) {
  await expect(page.locator("aside[data-sidebar-state] [data-sidebar-nav-href]").first()).toBeVisible({ timeout: 30_000 });
}

async function reloadDashboard(page: Page) {
  await page.reload({ waitUntil: "domcontentloaded" }).catch(async () => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  });
  await waitForSidebar(page);
}

async function retryAfterNavigation<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/Execution context was destroyed|frame was detached|net::ERR_ABORTED/i.test(message)) {
        throw error;
      }
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}

async function visibleSidebarHrefs(page: Page) {
  return retryAfterNavigation(async () => {
    await waitForSidebar(page);
    return page.locator("aside[data-sidebar-state] [data-sidebar-nav-href]").evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("data-sidebar-nav-href"))
        .filter((href): href is string => Boolean(href)),
    );
  });
}

async function storedSidebarPreferences(page: Page): Promise<SidebarPreferences> {
  return retryAfterNavigation(() =>
    page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "{}"), SIDEBAR_KEY),
  );
}

async function seedSidebarPreferences(page: Page, next: SidebarPreferences) {
  await writeRemoteSidebarPreferences(next);
  await retryAfterNavigation(() =>
    page.evaluate(
      ({ key, eventName, preferences }) => {
        window.localStorage.setItem(key, JSON.stringify(preferences));
        window.dispatchEvent(new Event(eventName));
      },
      { key: SIDEBAR_KEY, eventName: SIDEBAR_EVENT, preferences: next },
    ),
  );
}

async function enterRearrangeMode(page: Page) {
  const rearrange = page.getByRole("button", { name: "Rearrange items", exact: true });
  await expect(rearrange).toBeVisible({ timeout: 15_000 });
  await rearrange.click();
  await expect(page.getByRole("button", { name: "Done rearranging", exact: true })).toBeVisible();
}

async function exitRearrangeMode(page: Page) {
  await page.getByRole("button", { name: "Done rearranging", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rearrange items", exact: true })).toBeVisible();
}

async function expectNoDuplicateHrefs(page: Page) {
  const hrefs = await visibleSidebarHrefs(page);
  expect(new Set(hrefs).size).toBe(hrefs.length);
}

function moveButton(page: Page, direction: "earlier" | "later", href: string) {
  return page.locator(
    `[data-sidebar-reorder-control="${direction}"][data-sidebar-reorder-href="${href}"]`,
  );
}

function archivedHrefFrom(order: string[]) {
  return order.find((href) => href === "/repairs") ??
    order.find((href) => !["/dashboard", "/pos", "/products"].includes(href)) ??
    null;
}

function sourceHrefFrom(order: string[], archivedHref: string | null) {
  return order.find((href, index) =>
    index > 2 &&
    href !== archivedHref &&
    href !== "/dashboard" &&
    href !== "/pos" &&
    href !== "/products"
  ) ?? order[3];
}

function expectSameMembers(before: string[], after: string[]) {
  expect([...after].sort()).toEqual([...before].sort());
}

async function assertTouchTarget(locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(39);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(39);
}

test.describe("desktop sidebar accessible reorder controls", () => {
  test.beforeEach(skipUnlessLocal);

  test("mouse and keyboard reorder one visible item while preserving archived and consent preferences", async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });

    const nativeDialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      nativeDialogs.push(dialog.message());
      await dialog.dismiss();
    });

    await resetLocalSidebarPreferences();
    await loginOwner(page);

    const initialOrder = await visibleSidebarHrefs(page);
    expect(initialOrder.length).toBeGreaterThan(4);
    const archivedHref = archivedHrefFrom(initialOrder);
    expect(archivedHref).toBeTruthy();
    const sourceHref = sourceHrefFrom(initialOrder, archivedHref);
    expect(sourceHref).toBeTruthy();

    await seedSidebarPreferences(page, {
      version: 1,
      collapsed: false,
      order: initialOrder,
      archived: archivedHref ? [archivedHref] : [],
      analyticsConsent: "accepted",
      marketingConsent: "rejected",
      futurePreference: "keep-this-value",
      updatedAt: "2026-07-08T00:00:00.000Z",
    });

    await reloadDashboard(page);
    const visibleBefore = await visibleSidebarHrefs(page);
    expect(visibleBefore).not.toContain(archivedHref);
    const sourceIndex = visibleBefore.indexOf(sourceHref);
    expect(sourceIndex).toBeGreaterThan(0);

    await enterRearrangeMode(page);
    await expect(page.getByLabel(/^Drag to reorder:/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Move earlier:/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Move later:/ }).first()).toBeVisible();

    const sourceLabel = await page.locator(`aside[data-sidebar-state] [data-sidebar-nav-href="${sourceHref}"] a`).innerText();
    await expect(page.getByRole("button", { name: `Move earlier: ${sourceLabel}`, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Move later: ${sourceLabel}`, exact: true })).toBeVisible();

    await assertTouchTarget(moveButton(page, "earlier", sourceHref));
    await assertTouchTarget(moveButton(page, "later", sourceHref));
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(moveButton(page, "earlier", sourceHref)).toBeVisible();
    await expect(moveButton(page, "later", sourceHref)).toBeVisible();
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    const firstHref = visibleBefore[0];
    const lastHref = visibleBefore.at(-1) as string;
    await expect(moveButton(page, "earlier", firstHref)).toBeDisabled();
    await expect(moveButton(page, "later", lastHref)).toBeDisabled();

    await moveButton(page, "earlier", sourceHref).click();
    const visibleAfterEarlier = await visibleSidebarHrefs(page);
    expect(visibleAfterEarlier.indexOf(sourceHref)).toBe(sourceIndex - 1);
    expectSameMembers(visibleBefore, visibleAfterEarlier);
    await expectNoDuplicateHrefs(page);

    let prefs = await storedSidebarPreferences(page);
    expect(prefs.archived).toContain(archivedHref);
    expect(prefs.analyticsConsent).toBe("accepted");
    expect(prefs.marketingConsent).toBe("rejected");
    expect(prefs.futurePreference).toBe("keep-this-value");

    await moveButton(page, "later", sourceHref).click();
    const visibleAfterLater = await visibleSidebarHrefs(page);
    expect(visibleAfterLater.indexOf(sourceHref)).toBe(sourceIndex);
    expectSameMembers(visibleBefore, visibleAfterLater);
    await expectNoDuplicateHrefs(page);

    await moveButton(page, "earlier", sourceHref).focus();
    await expect(moveButton(page, "earlier", sourceHref)).toBeFocused();
    await page.keyboard.press("Enter");
    const visibleAfterKeyboard = await visibleSidebarHrefs(page);
    expect(visibleAfterKeyboard.indexOf(sourceHref)).toBe(sourceIndex - 1);

    await moveButton(page, "later", sourceHref).focus();
    await page.keyboard.press("Space");
    expect((await visibleSidebarHrefs(page)).indexOf(sourceHref)).toBe(sourceIndex);

    await moveButton(page, "earlier", sourceHref).click();
    expect((await visibleSidebarHrefs(page)).indexOf(sourceHref)).toBe(sourceIndex - 1);
    await expectRemoteSidebarOrder(page);

    await reloadDashboard(page);
    expect((await visibleSidebarHrefs(page)).indexOf(sourceHref)).toBe(sourceIndex - 1);
    prefs = await storedSidebarPreferences(page);
    expect(prefs.archived).toContain(archivedHref);
    expect(prefs.analyticsConsent).toBe("accepted");
    expect(prefs.marketingConsent).toBe("rejected");
    expect(prefs.futurePreference).toBe("keep-this-value");

    await enterRearrangeMode(page);
    await expect(page.locator('aside[data-sidebar-state] [data-sidebar-archive-href="/dashboard"]')).toHaveCount(0);
    await expect(page.locator('aside[data-sidebar-state] [data-sidebar-archive-href="/pos"]')).toHaveCount(0);
    await expect(page.getByLabel(/^Drag to reorder:/).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Build Error|Hydration failed/i);
    await expectNoDuplicateHrefs(page);
    expect(nativeDialogs).toEqual([]);
  });

  test("stored-collapsed sidebar temporarily expands during rearrange and keeps collapsed preference after reload", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await resetLocalSidebarPreferences();
    await loginOwner(page);

    const initialOrder = await visibleSidebarHrefs(page);
    const archivedHref = archivedHrefFrom(initialOrder);
    const sourceHref = sourceHrefFrom(initialOrder, archivedHref);

    await seedSidebarPreferences(page, {
      version: 1,
      collapsed: true,
      order: initialOrder,
      archived: archivedHref ? [archivedHref] : [],
      analyticsConsent: "accepted",
      marketingConsent: "rejected",
      updatedAt: "2026-07-08T00:00:00.000Z",
    });

    await reloadDashboard(page);
    await expect(page.locator("aside[data-sidebar-state='collapsed']")).toBeVisible();
    await expect(page.locator("aside[data-sidebar-stored-collapsed='true']")).toBeVisible();
    const before = await visibleSidebarHrefs(page);
    const sourceIndex = before.indexOf(sourceHref);
    expect(sourceIndex).toBeGreaterThan(0);

    await enterRearrangeMode(page);
    await expect(page.locator("aside[data-sidebar-state='expanded'][data-sidebar-stored-collapsed='true']")).toBeVisible();
    await expect(moveButton(page, "earlier", sourceHref)).toBeVisible();
    await moveButton(page, "earlier", sourceHref).click();
    expect((await visibleSidebarHrefs(page)).indexOf(sourceHref)).toBe(sourceIndex - 1);
    await expectRemoteSidebarOrder(page);

    await exitRearrangeMode(page);
    await expect(page.locator("aside[data-sidebar-state='collapsed'][data-sidebar-stored-collapsed='true']")).toBeVisible();

    await reloadDashboard(page);
    await expect(page.locator("aside[data-sidebar-state='collapsed'][data-sidebar-stored-collapsed='true']")).toBeVisible();
    expect((await visibleSidebarHrefs(page)).indexOf(sourceHref)).toBe(sourceIndex - 1);
  });

  test("localized reorder labels follow the active language", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await resetLocalSidebarPreferences();
    await loginOwner(page);

    for (const [language, labelPattern] of [
      ["ur", /\u067E\u06C1\u0644\u06D2 \u0644\u06D2 \u062C\u0627\u0626\u06CC\u06BA:/],
      ["ur-roman", /Pehle le jayein:/],
    ] as const) {
      await page.evaluate(
        ({ lang }) => {
          window.localStorage.setItem("saledock_lang", lang);
          document.cookie = `saledock_lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
        },
        { lang: language },
      );
      await reloadDashboard(page);
      await enterRearrangeMode(page);
      await expect(page.getByRole("button", { name: labelPattern }).first()).toBeVisible();
      await exitRearrangeMode(page);
    }
  });
});
