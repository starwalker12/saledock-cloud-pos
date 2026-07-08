import { Buffer } from "node:buffer";
import { expect, test, type Dialog, type Locator, type Page, type Request } from "@playwright/test";
import { isLocalPlaywrightRun, loginLocalOwnerDirectly } from "./helpers/local-supabase";
import { crc32, deflateSync } from "node:zlib";

function skipUnlessLocal(): void {
  test.skip(!isLocalPlaywrightRun(), "Shared image crop QA is restricted to localhost.");
}

function writeUint32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value >>> 0, 0);
  return buf;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const crc = crc32(Buffer.concat([typeBuf, data]));
  return Buffer.concat([writeUint32(data.length), typeBuf, data, writeUint32(crc)]);
}

function createAsymmetricPngFixture(): { name: string; mimeType: string; buffer: Buffer } {
  // 20x20 RGBA image: left half red, right half blue, bottom edge green, top edge transparent.
  // This makes left/right and up/down movement visually distinguishable.
  const width = 20;
  const height = 20;
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);

  const red = [0xff, 0x00, 0x00, 0xff];
  const blue = [0x00, 0x00, 0xff, 0xff];
  const green = [0x00, 0xff, 0x00, 0xff];
  const transparent = [0x00, 0x00, 0x00, 0x00];

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0; // filter byte: none
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 4;
      let color = x < width / 2 ? red : blue;
      if (y === 0) color = transparent;
      if (y === height - 1) color = green;
      raw[pixelOffset] = color[0];
      raw[pixelOffset + 1] = color[1];
      raw[pixelOffset + 2] = color[2];
      raw[pixelOffset + 3] = color[3];
    }
  }

  const ihdr = Buffer.concat([
    writeUint32(width),
    writeUint32(height),
    Buffer.from([8, 6, 0, 0, 0]), // 8-bit RGBA, deflate, no filter, no interlace
  ]);

  const idat = pngChunk("IDAT", deflateSync(raw, { level: 9 }));
  const iend = pngChunk("IEND", Buffer.alloc(0));
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return {
    name: "qa-asymmetric.png",
    mimeType: "image/png",
    buffer: Buffer.concat([signature, pngChunk("IHDR", ihdr), idat, iend]),
  };
}

const PNG_FIXTURE = createAsymmetricPngFixture();

async function dismissCookieBanner(page: Page): Promise<void> {
  await page.evaluate(() => {
    const acceptButton = document.querySelector('[aria-label="Accept all cookies"]') as HTMLElement | null;
    acceptButton?.click();
  });
}

async function openProfilePictureCrop(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Profile Picture", exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("heading", { name: "Profile Picture", exact: true }).scrollIntoViewIfNeeded();
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Profile Picture", exact: true }) });
  await section.locator('input[type="file"]').setInputFiles(PNG_FIXTURE);
  await expect(page.getByTestId("crop-dialog")).toBeVisible({ timeout: 10_000 });
}

async function openInvoiceLogoCrop(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Invoice & Receipt Branding", exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("heading", { name: "Invoice & Receipt Branding", exact: true }).scrollIntoViewIfNeeded();
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Invoice & Receipt Branding", exact: true }) });
  await section.locator('input[type="file"]').setInputFiles(PNG_FIXTURE);
  await expect(page.getByTestId("crop-dialog")).toBeVisible({ timeout: 10_000 });
}

async function readCropStatus(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  const text = await page.getByTestId("crop-status").textContent();
  const match = text?.match(/X\s+(\d+)%\s+·\s+Y\s+(\d+)%\s+·\s+Zoom\s+([\d.]+)×/);
  expect(match).toBeTruthy();
  return {
    x: Number(match![1]),
    y: Number(match![2]),
    zoom: Number(match![3]),
  };
}

async function dragPreview(page: Page, deltaX: number, deltaY: number): Promise<void> {
  const preview = page.getByTestId("crop-preview-area");
  await preview.waitFor({ state: "visible" });
  const box = await preview.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 10 });
  await page.mouse.up();
}

function collectStorageRequests(page: Page): { urls: string[]; stop: () => void } {
  const urls: string[] = [];
  const handler = (request: Request) => {
    const method = request.method();
    const url = request.url();
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
      (url.includes("/storage/v1/object") || url.includes("/storage/v1/s3"))
    ) {
      urls.push(`${method} ${url}`);
    }
  };
  page.on("request", handler);
  return {
    urls,
    stop: () => page.off("request", handler),
  };
}

function collectPageErrors(page: Page): { errors: Error[]; stop: () => void } {
  const errors: Error[] = [];
  const handler = (error: Error) => errors.push(error);
  page.on("pageerror", handler);
  return {
    errors,
    stop: () => page.off("pageerror", handler),
  };
}

function collectNativeDialogs(page: Page): { dialogs: Dialog[]; stop: () => void } {
  const dialogs: Dialog[] = [];
  const handler = async (dialog: Dialog) => {
    dialogs.push(dialog);
    await dialog.dismiss();
  };
  page.on("dialog", handler);
  return {
    dialogs,
    stop: () => page.off("dialog", handler),
  };
}

async function assertNoFrameworkErrors(page: Page, pageErrors: { errors: Error[] }): Promise<void> {
  expect(pageErrors.errors).toHaveLength(0);
  await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Build Error|Hydration failed|Application error|Runtime Error/i);
  const hasVisibleErrorOverlay = await page.evaluate(() => {
    const portal = document.querySelector("nextjs-portal");
    if (!portal) return false;
    const errorDialog = portal.querySelector('[role="dialog"]');
    if (errorDialog) {
      const text = (errorDialog as HTMLElement).innerText;
      return /Unhandled Runtime Error|Build Error|Hydration failed|Application error|Runtime Error/i.test(text);
    }
    return false;
  });
  expect(hasVisibleErrorOverlay).toBe(false);
}

function assertNoStorageWrites(storageRequests: { urls: string[] }): void {
  expect(storageRequests.urls).toEqual([]);
}

async function assertControlUsable(page: Page, button: Locator, dialog: Locator): Promise<void> {
  await expect(button).toBeEnabled();
  const box = await button.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThan(0);

  const scrollMetrics = await button.evaluate((el) => ({
    label: (el as HTMLElement).innerText.trim(),
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(scrollMetrics.label.length).toBeGreaterThan(0);
  expect(scrollMetrics.scrollWidth).toBeLessThanOrEqual(scrollMetrics.clientWidth);
  expect(scrollMetrics.scrollHeight).toBeLessThanOrEqual(scrollMetrics.clientHeight);

  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(dialogBox!.x - 1);
  expect(box!.y).toBeGreaterThanOrEqual(dialogBox!.y - 1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(dialogBox!.y + dialogBox!.height + 1);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);

  const centerIsButton = await button.evaluate((el, point) => {
    const topElement = document.elementFromPoint(point.x, point.y);
    return topElement !== null && (topElement === el || el.contains(topElement));
  }, {
    x: Math.round(box!.x + box!.width / 2),
    y: Math.round(box!.y + box!.height / 2),
  });
  expect(centerIsButton).toBe(true);
}

async function verifyPortalStacking(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Invoice & Receipt Branding", exact: true })).toBeVisible({ timeout: 20_000 });
  const mobileTabBar = page.locator("nav.fixed.bottom-0");
  await expect(mobileTabBar).toBeVisible();

  const section = page.locator("section", { has: page.getByRole("heading", { name: "Invoice & Receipt Branding", exact: true }) });
  await section.locator('input[type="file"]').setInputFiles(PNG_FIXTURE);
  await expect(page.getByTestId("crop-dialog")).toBeVisible({ timeout: 10_000 });

  const stacking = await page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="crop-overlay"]');
    const tabBar = document.querySelector("nav.fixed.bottom-0");
    if (!overlay || !tabBar) {
      return {
        overlayZ: null,
        tabBarZ: null,
        isDirectChildOfBody: false,
        overlayContainsTabBarPoint: false,
        tabBarPointTag: null,
      };
    }
    const overlayZ = overlay ? getComputedStyle(overlay).zIndex : null;
    const tabBarZ = tabBar ? getComputedStyle(tabBar).zIndex : null;
    const parent = overlay?.parentElement;
    const isDirectChildOfBody = parent === document.body;
    const tabBarPoint = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 10);
    const overlayContainsTabBarPoint = tabBarPoint
      ? (overlay === tabBarPoint || overlay.contains(tabBarPoint))
      : false;
    return {
      overlayZ,
      tabBarZ,
      isDirectChildOfBody,
      overlayContainsTabBarPoint,
      tabBarPointTag: tabBarPoint?.tagName ?? null,
    };
  });

  expect(stacking.isDirectChildOfBody).toBe(true);
  expect(Number(stacking.overlayZ)).toBeGreaterThan(Number(stacking.tabBarZ));
  expect(stacking.overlayContainsTabBarPoint).toBe(true);

  await page.getByRole("button", { name: "Move image up", exact: true }).click();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("crop-dialog")).toHaveCount(0);

  const tabBarAfterClose = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 10);
    return el?.closest("nav.fixed.bottom-0") !== null;
  });
  expect(tabBarAfterClose).toBe(true);

  await mobileTabBar.getByRole("link", { name: /^Products$/ }).click();
  await expect(page).toHaveURL(/\/products(?:\?|$)/);
}

test("portal renders crop overlay above mobile tab bar at both viewports", async ({ page }) => {
  test.setTimeout(120_000);
  skipUnlessLocal();

  await loginLocalOwnerDirectly(page);
  await dismissCookieBanner(page);
  const pageErrors = collectPageErrors(page);
  const nativeDialogs = collectNativeDialogs(page);
  const storageRequests = collectStorageRequests(page);

  for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
    await verifyPortalStacking(page, viewport);
    await assertNoFrameworkErrors(page, pageErrors);
  }

  await assertNoStorageWrites(storageRequests);
  expect(nativeDialogs.dialogs).toHaveLength(0);

  pageErrors.stop();
  nativeDialogs.stop();
  storageRequests.stop();
});

test("square crop (390x844) shows accessible nudge controls, keyboard focus, and reset", async ({ page }) => {
  test.setTimeout(120_000);
  skipUnlessLocal();

  await loginLocalOwnerDirectly(page);
  await dismissCookieBanner(page);
  const pageErrors = collectPageErrors(page);
  const nativeDialogs = collectNativeDialogs(page);
  const storageRequests = collectStorageRequests(page);

  await openProfilePictureCrop(page, { width: 390, height: 844 });
  await assertNoFrameworkErrors(page, pageErrors);

  await expect(page.getByRole("button", { name: "Move image up", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move image down", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move image left", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move image right", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset crop", exact: true })).toBeVisible();

  let status = await readCropStatus(page);
  expect(status).toEqual({ x: 50, y: 50, zoom: 1 });

  const rightButton = page.getByRole("button", { name: "Move image right", exact: true });
  await rightButton.focus();
  await page.keyboard.press("Enter");
  status = await readCropStatus(page);
  expect(status.x).toBe(45);
  expect(status.y).toBe(50);
  expect(status.zoom).toBe(1);

  const leftButton = page.getByRole("button", { name: "Move image left", exact: true });
  await leftButton.focus();
  await page.keyboard.press("Space");
  status = await readCropStatus(page);
  expect(status.x).toBe(50);
  expect(status.y).toBe(50);

  const upButton = page.getByRole("button", { name: "Move image up", exact: true });
  await upButton.focus();
  await page.keyboard.press("Enter");
  status = await readCropStatus(page);
  expect(status.x).toBe(50);
  expect(status.y).toBe(55);

  const downButton = page.getByRole("button", { name: "Move image down", exact: true });
  await downButton.focus();
  await page.keyboard.press("Space");
  status = await readCropStatus(page);
  expect(status.x).toBe(50);
  expect(status.y).toBe(50);

  const resetButton = page.getByRole("button", { name: "Reset crop", exact: true });
  await resetButton.focus();
  await page.keyboard.press("Enter");
  status = await readCropStatus(page);
  expect(status).toEqual({ x: 50, y: 50, zoom: 1 });

  await page.getByTestId("crop-zoom").focus();
  let upButtonFocused = false;
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
    upButtonFocused = await upButton.evaluate((el) => document.activeElement === el);
    if (upButtonFocused) break;
  }
  expect(upButtonFocused).toBe(true);
  const boxShadow = await upButton.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(boxShadow).not.toBe("none");
  const focusVisible = await upButton.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const dialog = document.querySelector('[data-testid="crop-dialog"]')?.getBoundingClientRect();
    return Boolean(
      dialog &&
      box.top >= dialog.top &&
      box.bottom <= dialog.bottom &&
      box.left >= dialog.left &&
      box.right <= dialog.right &&
      box.top >= 0 &&
      box.left >= 0 &&
      box.bottom <= window.innerHeight &&
      box.right <= window.innerWidth,
    );
  });
  expect(focusVisible).toBe(true);

  const dialog = page.getByTestId("crop-dialog");
  for (const button of [rightButton, leftButton, upButton, downButton, resetButton]) {
    await assertControlUsable(page, button, dialog);
  }

  await expect(page.getByTestId("crop-mask")).toHaveClass(/rounded-full/);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("crop-dialog")).toHaveCount(0);

  await assertNoFrameworkErrors(page, pageErrors);
  await assertNoStorageWrites(storageRequests);
  expect(nativeDialogs.dialogs).toHaveLength(0);

  pageErrors.stop();
  nativeDialogs.stop();
  storageRequests.stop();
});

test("landscape crop (375x667) verifies drag and button directions match", async ({ page }) => {
  test.setTimeout(120_000);
  skipUnlessLocal();

  await loginLocalOwnerDirectly(page);
  await dismissCookieBanner(page);
  const pageErrors = collectPageErrors(page);
  const nativeDialogs = collectNativeDialogs(page);
  const storageRequests = collectStorageRequests(page);

  await openInvoiceLogoCrop(page, { width: 375, height: 667 });
  await assertNoFrameworkErrors(page, pageErrors);

  let status = await readCropStatus(page);
  expect(status).toEqual({ x: 50, y: 50, zoom: 1 });

  await dragPreview(page, 120, 0);
  const afterDragRight = await readCropStatus(page);
  expect(afterDragRight.x).toBeLessThan(50);
  expect(afterDragRight.y).toBe(50);

  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  status = await readCropStatus(page);
  expect(status).toEqual({ x: 50, y: 50, zoom: 1 });
  await page.getByRole("button", { name: "Move image right", exact: true }).click();
  status = await readCropStatus(page);
  expect(status.x).toBe(45);
  expect(status.y).toBe(50);

  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  await dragPreview(page, -120, 0);
  const afterDragLeft = await readCropStatus(page);
  expect(afterDragLeft.x).toBeGreaterThan(50);
  expect(afterDragLeft.y).toBe(50);

  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  await page.getByRole("button", { name: "Move image left", exact: true }).click();
  status = await readCropStatus(page);
  expect(status.x).toBe(55);
  expect(status.y).toBe(50);

  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  await dragPreview(page, 0, 120);
  const afterDragDown = await readCropStatus(page);
  expect(afterDragDown.y).toBeLessThan(50);
  expect(afterDragDown.x).toBe(50);

  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  await page.getByRole("button", { name: "Move image down", exact: true }).click();
  status = await readCropStatus(page);
  expect(status.y).toBe(45);
  expect(status.x).toBe(50);

  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  await dragPreview(page, 0, -120);
  const afterDragUp = await readCropStatus(page);
  expect(afterDragUp.y).toBeGreaterThan(50);
  expect(afterDragUp.x).toBe(50);

  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  await page.getByRole("button", { name: "Move image up", exact: true }).click();
  status = await readCropStatus(page);
  expect(status.y).toBe(55);
  expect(status.x).toBe(50);

  await expect(page.getByTestId("crop-mask")).toHaveClass(/rounded-2xl/);
  await expect(page.getByTestId("crop-mask")).not.toHaveClass(/rounded-full/);

  const dialog = page.getByTestId("crop-dialog");
  for (const button of [
    page.getByRole("button", { name: "Move image right", exact: true }),
    page.getByRole("button", { name: "Move image left", exact: true }),
    page.getByRole("button", { name: "Move image up", exact: true }),
    page.getByRole("button", { name: "Move image down", exact: true }),
    page.getByRole("button", { name: "Reset crop", exact: true }),
  ]) {
    await assertControlUsable(page, button, dialog);
  }

  await page.mouse.click(5, 5);
  await expect(page.getByTestId("crop-dialog")).toHaveCount(0);

  await assertNoFrameworkErrors(page, pageErrors);
  await assertNoStorageWrites(storageRequests);
  expect(nativeDialogs.dialogs).toHaveLength(0);

  pageErrors.stop();
  nativeDialogs.stop();
  storageRequests.stop();
});

test("zoom and reset behavior leave only the intended axis changed", async ({ page }) => {
  test.setTimeout(120_000);
  skipUnlessLocal();

  await loginLocalOwnerDirectly(page);
  await dismissCookieBanner(page);
  const pageErrors = collectPageErrors(page);
  const nativeDialogs = collectNativeDialogs(page);
  const storageRequests = collectStorageRequests(page);

  await openProfilePictureCrop(page, { width: 390, height: 844 });
  await assertNoFrameworkErrors(page, pageErrors);

  const status = await readCropStatus(page);
  expect(status).toEqual({ x: 50, y: 50, zoom: 1 });

  await page.getByRole("button", { name: "Move image right", exact: true }).click();
  let current = await readCropStatus(page);
  expect(current.x).toBe(45);
  expect(current.y).toBe(50);
  expect(current.zoom).toBe(1);

  await page.getByTestId("crop-zoom").fill("2");
  current = await readCropStatus(page);
  expect(current.x).toBe(45);
  expect(current.y).toBe(50);
  expect(current.zoom).toBe(2);

  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  current = await readCropStatus(page);
  expect(current).toEqual({ x: 50, y: 50, zoom: 1 });

  await expect(page.getByTestId("crop-dialog")).toBeVisible();
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Profile Picture", exact: true }) });
  const inputHasFile = await section.locator('input[type="file"]').evaluate(
    (input) => (input as HTMLInputElement).files !== null && (input as HTMLInputElement).files!.length > 0,
  );
  expect(inputHasFile).toBe(true);

  await page.keyboard.press("Escape");
  await assertNoFrameworkErrors(page, pageErrors);
  await assertNoStorageWrites(storageRequests);
  expect(nativeDialogs.dialogs).toHaveLength(0);

  pageErrors.stop();
  nativeDialogs.stop();
  storageRequests.stop();
});

test("boundaries clamp and controls remain usable at 44px", async ({ page }) => {
  test.setTimeout(120_000);
  skipUnlessLocal();

  await loginLocalOwnerDirectly(page);
  await dismissCookieBanner(page);
  const pageErrors = collectPageErrors(page);
  const nativeDialogs = collectNativeDialogs(page);
  const storageRequests = collectStorageRequests(page);

  await openProfilePictureCrop(page, { width: 390, height: 844 });
  await assertNoFrameworkErrors(page, pageErrors);

  const right = page.getByRole("button", { name: "Move image right", exact: true });
  const left = page.getByRole("button", { name: "Move image left", exact: true });
  const up = page.getByRole("button", { name: "Move image up", exact: true });
  const down = page.getByRole("button", { name: "Move image down", exact: true });
  const reset = page.getByRole("button", { name: "Reset crop", exact: true });
  const dialog = page.getByTestId("crop-dialog");

  for (let i = 0; i < 25; i += 1) await right.click();
  let status = await readCropStatus(page);
  expect(status.x).toBe(0);
  expect(status.y).toBe(50);

  await reset.click();
  for (let i = 0; i < 25; i += 1) await left.click();
  status = await readCropStatus(page);
  expect(status.x).toBe(100);
  expect(status.y).toBe(50);

  await reset.click();
  for (let i = 0; i < 25; i += 1) await down.click();
  status = await readCropStatus(page);
  expect(status.x).toBe(50);
  expect(status.y).toBe(0);

  await reset.click();
  for (let i = 0; i < 25; i += 1) await up.click();
  status = await readCropStatus(page);
  expect(status.x).toBe(50);
  expect(status.y).toBe(100);

  for (const button of [right, left, up, down, reset]) {
    await assertControlUsable(page, button, dialog);
  }

  const pageOverflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(pageOverflow.documentWidth).toBeLessThanOrEqual(pageOverflow.viewportWidth);

  const dialogOverflow = await page.evaluate(() => {
    const dialog = document.querySelector('[data-testid="crop-dialog"]') as HTMLElement | null;
    return dialog ? dialog.scrollWidth <= dialog.clientWidth : true;
  });
  expect(dialogOverflow).toBe(true);

  await page.keyboard.press("Escape");
  await assertNoFrameworkErrors(page, pageErrors);
  await assertNoStorageWrites(storageRequests);
  expect(nativeDialogs.dialogs).toHaveLength(0);

  pageErrors.stop();
  nativeDialogs.stop();
  storageRequests.stop();
});

test("drag, cancel, and no-storage-write regression", async ({ page }) => {
  test.setTimeout(120_000);
  skipUnlessLocal();

  await loginLocalOwnerDirectly(page);
  await dismissCookieBanner(page);
  const pageErrors = collectPageErrors(page);
  const nativeDialogs = collectNativeDialogs(page);
  const storageRequests = collectStorageRequests(page);

  await openInvoiceLogoCrop(page, { width: 375, height: 667 });
  await assertNoFrameworkErrors(page, pageErrors);

  await dragPreview(page, 60, 30);
  const status = await readCropStatus(page);
  expect(status.x).not.toBe(50);
  expect(status.y).not.toBe(50);

  await page.getByTestId("crop-zoom").fill("2.5");
  expect((await readCropStatus(page)).zoom).toBe(2.5);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("crop-dialog")).toHaveCount(0);
  await assertNoFrameworkErrors(page, pageErrors);

  await openInvoiceLogoCrop(page, { width: 375, height: 667 });
  await page.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("crop-dialog")).toHaveCount(0);
  await assertNoFrameworkErrors(page, pageErrors);

  await openInvoiceLogoCrop(page, { width: 375, height: 667 });
  await page.mouse.click(5, 5);
  await expect(page.getByTestId("crop-dialog")).toHaveCount(0);
  await assertNoFrameworkErrors(page, pageErrors);

  await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Build Error|saved successfully|uploaded successfully/i);

  await assertNoStorageWrites(storageRequests);
  expect(nativeDialogs.dialogs).toHaveLength(0);

  pageErrors.stop();
  nativeDialogs.stop();
  storageRequests.stop();
});
