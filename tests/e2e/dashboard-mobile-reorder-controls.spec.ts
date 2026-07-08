import { expect, test, type Page } from "@playwright/test";
import { loginWithCredentials } from "./helpers/auth";
import { getLocalAdminClient, isLocalPlaywrightRun } from "./helpers/local-supabase";

const OWNER_EMAIL = "owner@saledock.local";
const LOCAL_PASSWORD = "Password123!";
const DASHBOARD_EVENT = "saledock-dashboard-layout-changed";
const DASHBOARD_KEY = "saledock-dashboard-layout-v1";

type ViewportCase = {
  label: string;
  width: number;
  height: number;
};

const VIEWPORTS: ViewportCase[] = [
  { label: "320x568", width: 320, height: 568 },
  { label: "390x844", width: 390, height: 844 },
  { label: "430x932", width: 430, height: 932 },
  { label: "820x1180", width: 820, height: 1180 },
  { label: "1024x768", width: 1024, height: 768 },
  { label: "1366x768", width: 1366, height: 768 },
];

type StoredWidget = {
  id: string;
  type: string;
  size: string;
  color: string;
  fillStyle?: string;
  textColor?: string;
  chartType?: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

const MOBILE_CUSTOM_WIDGETS: StoredWidget[] = [
  {
    id: "widget-today-profit",
    type: "today-profit",
    size: "S",
    color: "success",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  },
  {
    id: "widget-gross-sales",
    type: "gross-sales",
    size: "M",
    color: "info",
    fillStyle: "gradient",
    textColor: "black",
    x: 1,
    y: 0,
    w: 3,
    h: 1,
  },
  {
    id: "widget-returns",
    type: "returns",
    size: "S",
    color: "danger",
    x: 0,
    y: 1,
    w: 1,
    h: 1,
  },
];

const WIDE_CUSTOM_WIDGETS: StoredWidget[] = [
  {
    id: "widget-today-profit",
    type: "today-profit",
    size: "M",
    color: "success",
    x: 0,
    y: 0,
    w: 2,
    h: 1,
  },
  {
    id: "widget-gross-sales",
    type: "gross-sales",
    size: "M",
    color: "info",
    fillStyle: "solid",
    textColor: "white",
    x: 2,
    y: 0,
    w: 3,
    h: 1,
  },
  {
    id: "widget-returns",
    type: "returns",
    size: "M",
    color: "danger",
    x: 5,
    y: 0,
    w: 3,
    h: 2,
  },
];

function skipUnlessLocal(): void {
  test.skip(!isLocalPlaywrightRun(), "Dashboard reorder QA is restricted to localhost.");
}

async function localOwnerId() {
  const admin = getLocalAdminClient();
  const { data: owners, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "owner")
    .eq("full_name", "Demo Owner")
    .limit(1);

  if (profileError) {
    throw new Error("Local dashboard owner profile could not be found.");
  }

  const ownerId = owners?.[0]?.id;
  return ownerId ?? null;
}

async function resetLocalDashboardPreferences() {
  const admin = getLocalAdminClient();
  const ownerId = await localOwnerId();
  if (!ownerId) return;

  const { error } = await admin
    .from("user_ui_preferences")
    .delete()
    .eq("user_id", ownerId);

  if (error) {
    throw new Error("Local dashboard preferences could not be reset.");
  }
}

async function remoteDashboardWidgets() {
  const admin = getLocalAdminClient();
  const ownerId = await localOwnerId();
  if (!ownerId) return [];

  const { data, error } = await admin
    .from("user_ui_preferences")
    .select("dashboard_layout")
    .eq("user_id", ownerId)
    .limit(1);

  if (error) return [];
  const layout = data?.[0]?.dashboard_layout as { widgets?: StoredWidget[] } | null | undefined;
  return Array.isArray(layout?.widgets) ? layout.widgets : [];
}

async function expectRemoteFirstWidget(widgetId: string) {
  await expect
    .poll(async () => (await remoteDashboardWidgets())[0]?.id ?? null, { timeout: 10_000 })
    .toBe(widgetId);
}

async function expectRemoteWidget(widgetId: string, expected: Partial<StoredWidget>) {
  await expect
    .poll(async () => {
      const widget = (await remoteDashboardWidgets()).find((item) => item.id === widgetId);
      if (!widget) return null;
      return Object.fromEntries(
        Object.keys(expected).map((key) => [
          key,
          widget[key as keyof StoredWidget],
        ]),
      );
    }, { timeout: 10_000 })
    .toEqual(expected);
}

async function clearDashboardLocalStorage(page: Page) {
  await page.evaluate(
    ({ key, eventName }) => {
      window.localStorage.removeItem(key);
      window.dispatchEvent(new Event(eventName));
    },
    { key: DASHBOARD_KEY, eventName: DASHBOARD_EVENT },
  );
}

async function setStoredDashboardWidgets(page: Page, widgets: StoredWidget[]) {
  await page.evaluate(
    ({ key, eventName, nextWidgets }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          widgets: nextWidgets,
          fillStyle: "solid",
        }),
      );
      window.dispatchEvent(new Event(eventName));
    },
    { key: DASHBOARD_KEY, eventName: DASHBOARD_EVENT, nextWidgets: widgets },
  );
}

async function storedDashboardWidgets(page: Page) {
  return page.evaluate((key) => {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "{}");
    return Array.isArray(parsed.widgets) ? parsed.widgets : [];
  }, DASHBOARD_KEY) as Promise<StoredWidget[]>;
}

async function storedWidget(page: Page, widgetId: string) {
  const widgets = await storedDashboardWidgets(page);
  return widgets.find((widget) => widget.id === widgetId);
}

function maxStoredRight(widgets: StoredWidget[]) {
  return Math.max(...widgets.map((widget) => widget.x + widget.w));
}

async function loginOwner(page: Page) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());

  expect(await loginWithCredentials(page, OWNER_EMAIL, LOCAL_PASSWORD)).toBe(true);
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 15_000 });
  await page.waitForLoadState("networkidle");

  const rejectCookies = page.getByRole("button", { name: "Reject optional cookies", exact: true });
  if (await rejectCookies.isVisible().catch(() => false)) {
    await rejectCookies.click();
  }
}

async function enterEditMode(page: Page) {
  const editButton = page.getByRole("button", { name: "Edit layout", exact: true });
  await expect(editButton).toBeVisible({ timeout: 15_000 });
  await editButton.click();
  await expect(page.getByRole("button", { name: "Reset to default", exact: true })).toBeVisible();
}

async function openWidgetSettings(page: Page, widgetId: string, widgetName: string) {
  const moveEarlier = page.getByRole("button", { name: `Move ${widgetName} earlier`, exact: true });
  if (await moveEarlier.isVisible().catch(() => false)) {
    return page.locator(`[data-widget-id="${widgetId}"]`);
  }

  const widget = page.locator(`[data-widget-id="${widgetId}"]`);
  await expect(widget).toBeVisible({ timeout: 15_000 });
  await widget.getByRole("button", { name: `Open ${widgetName} widget settings`, exact: true }).click();
  await expect(moveEarlier).toBeVisible();
  return widget;
}

async function visualWidgetOrder(page: Page) {
  return page.locator("[data-widget-id]").evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.getAttribute("data-widget-id") || "",
          top: Math.round(rect.top),
          left: Math.round(rect.left),
        };
      })
      .sort((a, b) => a.top - b.top || a.left - b.left)
      .map((item) => item.id),
  );
}

async function expectNoDuplicateWidgets(page: Page) {
  const ids = await page.locator("[data-widget-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-widget-id")).filter(Boolean),
  );
  expect(new Set(ids).size).toBe(ids.length);
}

async function expectFirstWidget(page: Page, widgetId: string) {
  await expect
    .poll(async () => (await visualWidgetOrder(page))[0])
    .toBe(widgetId);
}

async function resetDashboardThroughUi(page: Page) {
  const settingsDialog = page.locator('[role="dialog"][data-widget-settings-root]');
  if (await settingsDialog.isVisible().catch(() => false)) {
    await settingsDialog.getByRole("button", { name: "Done", exact: true }).click();
    await expect(settingsDialog).toHaveCount(0);
  }

  await page.getByRole("button", { name: "Reset to default", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Restore default dashboard?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Reset dashboard", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expectFirstWidget(page, "widget-today-profit");
}

test.describe("dashboard widget reorder controls", () => {
  test.beforeEach(skipUnlessLocal);

  test("mobile owner can move widgets earlier/later without dragging while exact dimensions persist", async ({ page }) => {
    test.setTimeout(150_000);
    await resetLocalDashboardPreferences();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });

    const nativeDialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      nativeDialogs.push(dialog.message());
      await dialog.dismiss();
    });

    await loginOwner(page);
    await clearDashboardLocalStorage(page);
    await setStoredDashboardWidgets(page, MOBILE_CUSTOM_WIDGETS);
    await expectFirstWidget(page, "widget-today-profit");
    await expect(storedWidget(page, "widget-gross-sales")).resolves.toMatchObject({
      w: 3,
      h: 1,
    });

    await enterEditMode(page);
    await openWidgetSettings(page, "widget-gross-sales", "Gross Sales");

    const moveEarlier = page.getByRole("button", { name: "Move Gross Sales earlier", exact: true });
    const moveEarlierBox = await moveEarlier.boundingBox();
    expect(moveEarlierBox?.height ?? 0).toBeGreaterThanOrEqual(43);
    expect(moveEarlierBox?.width ?? 0).toBeGreaterThanOrEqual(43);

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(moveEarlier).toBeVisible();
    await expect(page.getByRole("button", { name: "Move Gross Sales later", exact: true })).toBeVisible();
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    await moveEarlier.click();
    await expectFirstWidget(page, "widget-gross-sales");
    await expect(storedWidget(page, "widget-gross-sales")).resolves.toMatchObject({
      x: 0,
      y: 0,
      w: 3,
      h: 1,
      size: "M",
      color: "info",
      fillStyle: "gradient",
      textColor: "black",
    });
    await expectRemoteFirstWidget("widget-gross-sales");
    await expectRemoteWidget("widget-gross-sales", { x: 0, y: 0, w: 3, h: 1 });
    await expect(moveEarlier).toBeDisabled();
    await expect(page.getByRole("button", { name: "Move Gross Sales later", exact: true })).toBeEnabled();
    await expectNoDuplicateWidgets(page);
    await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Build Error|Hydration failed/i);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expectFirstWidget(page, "widget-gross-sales");
    await expect(storedWidget(page, "widget-gross-sales")).resolves.toMatchObject({
      w: 3,
      h: 1,
    });

    await enterEditMode(page);
    await openWidgetSettings(page, "widget-gross-sales", "Gross Sales");
    await page.getByRole("button", { name: "Move Gross Sales later", exact: true }).click();
    await expectFirstWidget(page, "widget-today-profit");
    await expect(storedWidget(page, "widget-gross-sales")).resolves.toMatchObject({
      w: 3,
      h: 1,
    });
    await expectRemoteFirstWidget("widget-today-profit");
    await expectRemoteWidget("widget-gross-sales", { w: 3, h: 1 });
    await expectNoDuplicateWidgets(page);

    await openWidgetSettings(page, "widget-gross-sales", "Gross Sales");
    await page.getByRole("button", { name: "Move Gross Sales later", exact: true }).click();
    await expectNoDuplicateWidgets(page);
    await expect(page.getByRole("button", { name: "Move Gross Sales later", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Move Gross Sales earlier", exact: true })).toBeEnabled();

    await resetDashboardThroughUi(page);
    await expect(nativeDialogs).toEqual([]);
  });

  test("wide desktop reorder keeps an eight-column layout and custom dimensions after reload", async ({ page }) => {
    test.setTimeout(120_000);
    await resetLocalDashboardPreferences();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await loginOwner(page);
    await clearDashboardLocalStorage(page);
    await setStoredDashboardWidgets(page, WIDE_CUSTOM_WIDGETS);

    await expect(storedDashboardWidgets(page)).resolves.toHaveLength(3);
    await expect(storedWidget(page, "widget-gross-sales")).resolves.toMatchObject({
      x: 2,
      w: 3,
      h: 1,
    });
    expect(maxStoredRight(await storedDashboardWidgets(page))).toBe(8);

    await enterEditMode(page);
    await openWidgetSettings(page, "widget-gross-sales", "Gross Sales");
    await page.getByRole("button", { name: "Move Gross Sales later", exact: true }).click();

    const storedAfterMove = await storedDashboardWidgets(page);
    const movedGrossSales = storedAfterMove.find((widget) => widget.id === "widget-gross-sales");
    expect(maxStoredRight(storedAfterMove)).toBe(8);
    expect(movedGrossSales).toMatchObject({
      x: 5,
      y: 0,
      w: 3,
      h: 1,
      size: "M",
      color: "info",
      fillStyle: "solid",
      textColor: "white",
    });
    await expectNoDuplicateWidgets(page);
    await expectRemoteFirstWidget("widget-today-profit");
    await expectRemoteWidget("widget-gross-sales", { x: 5, y: 0, w: 3, h: 1 });

    await page.reload();
    await page.waitForLoadState("networkidle");
    const storedAfterReload = await storedDashboardWidgets(page);
    expect(maxStoredRight(storedAfterReload)).toBe(8);
    expect(storedAfterReload.find((widget) => widget.id === "widget-gross-sales")).toMatchObject({
      x: 5,
      w: 3,
      h: 1,
    });
  });

  test("order controls are reachable across the required viewport matrix", async ({ page }) => {
    test.setTimeout(180_000);
    await resetLocalDashboardPreferences();
    await loginOwner(page);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/dashboard");
      await clearDashboardLocalStorage(page);
      await page.reload();
      await page.waitForLoadState("networkidle");
      await enterEditMode(page);
      await openWidgetSettings(page, "widget-gross-sales", "Gross Sales");

      const moveEarlier = page.getByRole("button", { name: "Move Gross Sales earlier", exact: true });
      const moveLater = page.getByRole("button", { name: "Move Gross Sales later", exact: true });
      await expect(moveEarlier, `${viewport.label} Move Earlier`).toBeVisible();
      await expect(moveLater, `${viewport.label} Move Later`).toBeVisible();
      const earlierBox = await moveEarlier.boundingBox();
      const laterBox = await moveLater.boundingBox();
      const expectedMinHeight = viewport.width <= 430 ? 43 : 32;
      expect(
        earlierBox?.height ?? 0,
        `${viewport.label} Move Earlier touch target height`,
      ).toBeGreaterThanOrEqual(expectedMinHeight);
      expect(
        laterBox?.height ?? 0,
        `${viewport.label} Move Later touch target height`,
      ).toBeGreaterThanOrEqual(expectedMinHeight);
      await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Build Error|Hydration failed/i);
      await page.keyboard.press("Escape");
    }
  });
});
