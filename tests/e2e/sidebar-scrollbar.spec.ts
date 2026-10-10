import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getLocalAdminClient, isLocalPlaywrightRun, loginLocalOwnerDirectly } from "./helpers/local-supabase";

const asideSelector = "aside[data-sidebar-state]";
const navSelector = `${asideSelector} nav[aria-label="Main navigation"]`;
const evidenceDir = process.env.QA_EVIDENCE_DIR;
test.use({ contextOptions: { reducedMotion: "reduce" }, trace: "off", video: "off" });
const viewports = [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1440, height: 1080 },
];

async function resetPreferences() {
  const admin = getLocalAdminClient();
  const { data, error } = await admin.from("profiles").select("id").eq("role", "owner").eq("full_name", "Demo Owner").single();
  if (error || !data) throw new Error("Seeded local Owner is required.");
  const result = await admin.from("user_ui_preferences").delete().eq("user_id", data.id);
  if (result.error) throw new Error("Local sidebar preferences could not be reset.");
}

async function setCollapsed(page: Page, collapsed: boolean) {
  if ((await page.locator(asideSelector).getAttribute("data-sidebar-state")) !== (collapsed ? "collapsed" : "expanded")) {
    await page.getByRole("button", { name: collapsed ? "Collapse sidebar" : "Expand sidebar", exact: true }).click();
  }
  await expect(page.locator(asideSelector)).toHaveAttribute("data-sidebar-state", collapsed ? "collapsed" : "expanded");
  await expect.poll(() => page.locator(asideSelector).evaluate(el => el.getBoundingClientRect().width)).toBe(collapsed ? 96 : 288);
  await expectRemotePreferences(page);
}

async function expectRemotePreferences(page: Page) {
  const local = await page.evaluate(() => JSON.parse(localStorage.getItem("saledock-sidebar-preferences-v1") || "{}"));
  await expect.poll(async () => {
    const { data, error } = await getLocalAdminClient().from("user_ui_preferences").select("sidebar_preferences").limit(1).single();
    if (error) return null;
    return data.sidebar_preferences;
  }, { timeout: 10_000 }).toEqual(local);
}

async function dimensions(page: Page) {
  return page.locator(navSelector).evaluate(nav => {
    const css = getComputedStyle(nav);
    const aside = nav.closest("aside")!;
    const archived = aside.querySelector<HTMLButtonElement>('button[aria-controls="sidebar-archive-panel"]')!;
    const viewport = nav.getBoundingClientRect();
    const bottom = archived.getBoundingClientRect();
    return {
      clientWidth: nav.clientWidth, scrollWidth: nav.scrollWidth,
      clientHeight: nav.clientHeight, scrollHeight: nav.scrollHeight,
      scrollLeft: nav.scrollLeft, scrollTop: nav.scrollTop,
      overflowX: css.overflowX, overflowY: css.overflowY,
      scrollbarWidth: css.scrollbarWidth,
      webkitDisplay: getComputedStyle(nav, "::-webkit-scrollbar").display,
      scrollbarGutter: css.scrollbarGutter,
      documentWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      asideWidth: aside.getBoundingClientRect().width,
      asideHeight: aside.getBoundingClientRect().height,
      archivedTop: bottom.top, archivedBottom: bottom.bottom, navBottom: viewport.bottom,
      archivedOutsideNav: !nav.contains(archived),
    };
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const d = await dimensions(page);
  expect(d.scrollWidth).toBe(d.clientWidth);
  expect(d.scrollLeft).toBe(0);
  expect(d.documentScrollWidth).toBe(d.documentWidth);
  expect(d.overflowX).toBe("hidden");
  expect(d.overflowY).toBe("auto");
  expect(d.scrollbarWidth).toBe("none");
  expect(d.webkitDisplay).toBe("none");
  return d;
}

async function capture(page: Page, name: string, data: unknown) {
  if (!evidenceDir) return;
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, `${name}.json`), JSON.stringify(data, null, 2) + "\n");
  await page.screenshot({ path: join(evidenceDir, `${name}.png`) });
}

async function expectInsideNav(page: Page, selector: string) {
  await expect.poll(() => page.locator(selector).evaluate(el => {
    const rect = el.getBoundingClientRect();
    const nav = el.closest("nav")!.getBoundingClientRect();
    return rect.top >= nav.top && rect.bottom <= nav.bottom;
  })).toBe(true);
}

async function hrefs(page: Page) {
  return page.locator(`${navSelector} [data-sidebar-nav-href]`).evaluateAll(items => items.map(el => el.getAttribute("data-sidebar-nav-href")!));
}

test.describe("Sidebar scrollbar chrome", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!isLocalPlaywrightRun(), "Sidebar QA uses local synthetic accounts only.");
    await resetPreferences();
    await loginLocalOwnerDirectly(page);
    await page.goto("/products");
    await expect(page.locator(asideSelector)).toBeVisible();
    const reject = page.getByRole("button", { name: "Reject optional cookies", exact: true });
    if (await reject.isVisible()) await reject.click();
    await setCollapsed(page, false);
  });
  test.afterAll(async () => {
    if (isLocalPlaywrightRun()) await resetPreferences();
  });

  for (const viewport of viewports) {
    for (const collapsed of [false, true]) {
      const mode = collapsed ? "collapsed" : "expanded";
      test(`${mode} ${viewport.width}x${viewport.height}: no chrome or sideways range`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await setCollapsed(page, collapsed);
        const d = await expectNoHorizontalOverflow(page);
        expect(d.asideWidth).toBe(collapsed ? 96 : 288);
        expect(d.asideHeight).toBe(viewport.height);
        expect(d.archivedOutsideNav).toBe(true);
        expect(d.archivedTop).toBeGreaterThanOrEqual(d.navBottom);
        expect(d.archivedBottom).toBeLessThanOrEqual(viewport.height);
        if (viewport.height <= 900) expect(d.scrollHeight).toBeGreaterThan(d.clientHeight);
        await page.locator(navSelector).evaluate(nav => { nav.scrollLeft = 999; });
        expect((await dimensions(page)).scrollLeft).toBe(0);
        await page.locator(navSelector).hover();
        await page.keyboard.down("Shift");
        await page.mouse.wheel(500, 0);
        await page.mouse.wheel(0, 500);
        await page.keyboard.up("Shift");
        await expectNoHorizontalOverflow(page);
        await page.locator(navSelector).evaluate(nav => { nav.scrollTop = 0; });
        const links = page.locator(`${navSelector} li > a`);
        for (const link of await links.all()) {
          if (collapsed) {
            const label = await link.getAttribute("aria-label");
            expect(label).toBeTruthy();
            await expect(link).toHaveAttribute("title", label!);
            const offset = await link.evaluate(a => {
              const icon = a.querySelector("svg")!.getBoundingClientRect(), sidebar = a.closest("aside")!.getBoundingClientRect();
              return Math.abs(icon.x + icon.width / 2 - (sidebar.x + sidebar.width / 2));
            });
            expect(offset).toBeLessThanOrEqual(1);
          } else {
            await expect(link).not.toHaveAttribute("title");
          }
        }
        if (collapsed) {
          const offset = await page.getByRole("button", { name: "Archived", exact: true }).evaluate(b => {
            const i = b.querySelector("svg")!.getBoundingClientRect(), a = b.closest("aside")!.getBoundingClientRect();
            return Math.abs(i.x + i.width / 2 - (a.x + a.width / 2));
          });
          expect(offset).toBeLessThanOrEqual(1);
        }
        await capture(page, `after-${mode}-${viewport.width}x${viewport.height}`, d);
      });
    }
  }

  for (const collapsed of [false, true]) {
    const mode = collapsed ? "collapsed" : "expanded";
    test(`${mode}: wheel down/up and keyboard reach lower links with fixed Archived`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await setCollapsed(page, collapsed);
      const nav = page.locator(navSelector);
      await nav.evaluate(n => { n.scrollTop = 0; });
      const before = await dimensions(page);
      await nav.hover();
      await page.mouse.wheel(0, 2000);
      await expect.poll(() => nav.evaluate(n => n.scrollTop)).toBeGreaterThan(0);
      await expectInsideNav(page, `${navSelector} li:last-child > a`);
      expect((await dimensions(page)).archivedTop).toBe(before.archivedTop);
      await page.mouse.wheel(0, -2000);
      await expect.poll(() => nav.evaluate(n => n.scrollTop)).toBe(0);
      await page.locator(`${navSelector} li:first-child > a`).focus();
      const lower = page.locator(`${navSelector} li:last-child > a`);
      for (let i = 0; i < 64 && !(await lower.evaluate(a => a === document.activeElement)); i++) await page.keyboard.press("Tab");
      await expect(lower).toBeFocused();
      await expectInsideNav(page, `${navSelector} li:last-child > a`);
      expect(await lower.evaluate(a => a.matches(":focus-visible"))).toBe(true);
      expect(await lower.evaluate(a => getComputedStyle(a).boxShadow)).not.toBe("none");
      expect((await dimensions(page)).scrollTop).toBeGreaterThan(0);
      await expectNoHorizontalOverflow(page);
      await capture(page, `keyboard-${mode}`, await dimensions(page));
    });

    test(`${mode}: lower active route auto-scrolls vertically`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await setCollapsed(page, collapsed);
      await page.locator(navSelector).evaluate(n => { n.scrollTop = 0; });
      const lower = page.locator(`${navSelector} li:last-child > a`);
      const target = await lower.getAttribute("href");
      expect(await lower.evaluate(a => a.getBoundingClientRect().top >= a.closest("nav")!.getBoundingClientRect().bottom)).toBe(true);
      await page.goto(target!);
      await expect(page.locator(asideSelector)).toHaveAttribute("data-sidebar-state", mode);
      await expect(page.locator(`${navSelector} [data-sidebar-active="true"] > a`)).toHaveAttribute("href", target!);
      await setCollapsed(page, collapsed);
      await expectInsideNav(page, `${navSelector} [data-sidebar-active="true"] > a`);
      await expect.poll(async () => (await dimensions(page)).scrollTop).toBeGreaterThan(0);
      await expectNoHorizontalOverflow(page);
      await capture(page, `active-lower-${mode}`, await dimensions(page));
    });

    test(`${mode}: rearrange arrows, drag, Done, archive and unarchive retain no sideways range`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await setCollapsed(page, collapsed);
      const before = await hrefs(page);
      await page.getByRole("button", { name: "Rearrange items", exact: true }).click();
      await expect(page.locator(asideSelector)).toHaveAttribute("data-sidebar-state", "expanded");
      await expect(page.locator(asideSelector)).toHaveAttribute("data-sidebar-stored-collapsed", String(collapsed));
      await expect.poll(() => page.locator(asideSelector).evaluate(a => a.getBoundingClientRect().width)).toBe(288);
      await expectNoHorizontalOverflow(page);
      const earlier = page.locator('[data-sidebar-reorder-control="earlier"][data-sidebar-reorder-href="/customers"]');
      const later = page.locator('[data-sidebar-reorder-control="later"][data-sidebar-reorder-href="/customers"]');
      await earlier.click();
      expect((await hrefs(page)).indexOf("/customers")).toBe(before.indexOf("/customers") - 1);
      await later.click();
      expect(await hrefs(page)).toEqual(before);
      await expectRemotePreferences(page);
      const source = page.locator(`${navSelector} [data-sidebar-nav-href="/customers"]`);
      const handle = source.getByRole("button", { name: /^Drag to reorder:/ });
      const start = (await handle.boundingBox())!, end = (await page.locator(`${navSelector} [data-sidebar-nav-href="/products"]`).boundingBox())!;
      await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
      await page.mouse.down();
      await page.mouse.move(start.x + start.width / 2, end.y + end.height / 2 - 2, { steps: 8 });
      await page.mouse.up();
      expect((await hrefs(page)).indexOf("/customers")).toBe(before.indexOf("/customers") - 1);
      expect([...(await hrefs(page))].sort()).toEqual([...before].sort());
      await expectNoHorizontalOverflow(page);
      await page.getByRole("button", { name: "Done rearranging", exact: true }).click();
      await expect(page.locator(asideSelector)).toHaveAttribute("data-sidebar-state", mode);
      await setCollapsed(page, false);
      const archive = page.locator(`${navSelector} [data-sidebar-archive-href="/customers"]`);
      await archive.click();
      await expect(archive).toHaveAttribute("aria-pressed", "true");
      await archive.click();
      await expect(page.locator(`${navSelector} [data-sidebar-nav-href="/customers"]`)).toHaveCount(0);
      const archived = page.getByRole("button", { name: "Archived", exact: true });
      await expect(archived).toContainText("1");
      await setCollapsed(page, collapsed);
      await archived.click();
      await expect(page.locator("#sidebar-archive-panel")).toBeVisible();
      await expect(archived).toHaveAttribute("aria-expanded", "true");
      await expectNoHorizontalOverflow(page);
      await capture(page, `archive-panel-${mode}`, await dimensions(page));
      await page.getByRole("button", { name: "Unarchive: Customers", exact: true }).click();
      await expect(page.locator(`${navSelector} [data-sidebar-nav-href="/customers"]`)).toHaveCount(1);
      await archived.click();
      await setCollapsed(page, false);
      await expect(archived).toContainText("0");
      await setCollapsed(page, collapsed);
      await expectNoHorizontalOverflow(page);
      await capture(page, `rearrange-archive-${mode}`, { before, after: await hrefs(page), dimensions: await dimensions(page) });
    });
  }
});
