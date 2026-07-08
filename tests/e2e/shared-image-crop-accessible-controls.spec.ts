import { Buffer } from "node:buffer";
import { expect, test, type Page } from "@playwright/test";
import type { Request } from "@playwright/test";
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

async function removeDevOverlay(page: Page): Promise<void> {
  // Next.js development overlay can intercept pointer events; remove it so tests
  // exercise the real app UI. This overlay does not exist in production builds.
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
  });
}

async function openProfilePictureCrop(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto("/settings");
  await removeDevOverlay(page);
  await expect(page.getByRole("heading", { name: "Profile Picture", exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("heading", { name: "Profile Picture", exact: true }).scrollIntoViewIfNeeded();
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Profile Picture", exact: true }) });
  await section.locator('input[type="file"]').setInputFiles(PNG_FIXTURE);
  await expect(page.getByTestId("crop-dialog")).toBeVisible({ timeout: 10_000 });
}

async function openInvoiceLogoCrop(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto("/settings");
  await removeDevOverlay(page);
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
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      urls.push(`${method} ${url}`);
    }
  };
  page.on("request", handler);
  return {
    urls,
    stop: () => page.off("request", handler),
  };
}

test("square crop (390x844) shows accessible nudge controls, keyboard focus, and reset", async ({ page }) => {
  test.setTimeout(120_000);
  skipUnlessLocal();

  await loginLocalOwnerDirectly(page);
  await dismissCookieBanner(page);
  await openProfilePictureCrop(page, { width: 390, height: 844 });

  await expect(page.getByRole("button", { name: "Move image up", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move image down", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move image left", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move image right", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset crop", exact: true })).toBeVisible();

  // Initial state.
  let status = await readCropStatus(page);
  expect(status).toEqual({ x: 50, y: 50, zoom: 1 });

  // Keyboard: Move image right via Enter.
  const rightButton = page.getByRole("button", { name: "Move image right", exact: true });
  await rightButton.focus();
  await page.keyboard.press("Enter");
  status = await readCropStatus(page);
  expect(status.x).toBe(45);
  expect(status.y).toBe(50);
  expect(status.zoom).toBe(1);

  // Keyboard: Move image left via Space.
  const leftButton = page.getByRole("button", { name: "Move image left", exact: true });
  await leftButton.focus();
  await page.keyboard.press("Space");
  status = await readCropStatus(page);
  expect(status.x).toBe(50);
  expect(status.y).toBe(50);

  // Keyboard: Move image up via Enter.
  const upButton = page.getByRole("button", { name: "Move image up", exact: true });
  await upButton.focus();
  await page.keyboard.press("Enter");
  status = await readCropStatus(page);
  expect(status.x).toBe(50);
  expect(status.y).toBe(55);

  // Keyboard: Move image down via Space.
  const downButton = page.getByRole("button", { name: "Move image down", exact: true });
  await downButton.focus();
  await page.keyboard.press("Space");
  status = await readCropStatus(page);
  expect(status.x).toBe(50);
  expect(status.y).toBe(50);

  // Keyboard: Reset crop.
  const resetButton = page.getByRole("button", { name: "Reset crop", exact: true });
  await resetButton.focus();
  await page.keyboard.press("Enter");
  status = await readCropStatus(page);
  expect(status).toEqual({ x: 50, y: 50, zoom: 1 });

  // Focus ring check: any focused new button has the outline style computed.
  await rightButton.focus();
  const outlineWidth = await rightButton.evaluate((el) => getComputedStyle(el).outlineWidth);
  expect(outlineWidth).not.toBe("0px");

  // Square mask shape.
  await expect(page.getByTestId("crop-mask")).toHaveClass(/rounded-full/);

  // Close via Escape.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("crop-dialog")).toHaveCount(0);
});

test("landscape crop (375x667) verifies drag and button directions match", async ({ page }) => {
  test.setTimeout(120_000);
  skipUnlessLocal();

  await loginLocalOwnerDirectly(page);
  await dismissCookieBanner(page);
  await openInvoiceLogoCrop(page, { width: 375, height: 667 });

  const requests = collectStorageRequests(page);

  // Initial state.
  let status = await readCropStatus(page);
  expect(status).toEqual({ x: 50, y: 50, zoom: 1 });

  // Drag right should decrease X.
  await dragPreview(page, 120, 0);
  const afterDragRight = await readCropStatus(page);
  expect(afterDragRight.x).toBeLessThan(50);
  expect(afterDragRight.y).toBe(50);

  // Reset and use Move image right; it should also decrease X.
  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  status = await readCropStatus(page);
  expect(status).toEqual({ x: 50, y: 50, zoom: 1 });
  await page.getByRole("button", { name: "Move image right", exact: true }).click();
  status = await readCropStatus(page);
  expect(status.x).toBe(45);
  expect(status.y).toBe(50);

  // Drag left should increase X.
  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  await dragPreview(page, -120, 0);
  const afterDragLeft = await readCropStatus(page);
  expect(afterDragLeft.x).toBeGreaterThan(50);
  expect(afterDragLeft.y).toBe(50);

  // Reset and Move image left should also increase X.
  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  await page.getByRole("button", { name: "Move image left", exact: true }).click();
  status = await readCropStatus(page);
  expect(status.x).toBe(55);
  expect(status.y).toBe(50);

  // Vertical contract.
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

  // Landscape mask shape.
  await expect(page.getByTestId("crop-mask")).toHaveClass(/rounded-2xl/);
  await expect(page.getByTestId("crop-mask")).not.toHaveClass(/rounded-full/);

  // Close via backdrop.
  await page.mouse.click(5, 5);
  await expect(page.getByTestId("crop-dialog")).toHaveCount(0);

  // No storage write should have occurred during any of the above interactions.
  requests.stop();
  const storageWrites = requests.urls.filter((url) => url.includes("/storage/v1/") || url.includes("/object/"));
  expect(storageWrites).toEqual([]);
});

test("zoom and reset behavior leave only the intended axis changed", async ({ page }) => {
  test.setTimeout(120_000);
  skipUnlessLocal();

  await loginLocalOwnerDirectly(page);
  await dismissCookieBanner(page);
  await openProfilePictureCrop(page, { width: 390, height: 844 });

  const status = await readCropStatus(page);
  expect(status).toEqual({ x: 50, y: 50, zoom: 1 });

  // Nudge one axis: only X changes.
  await page.getByRole("button", { name: "Move image right", exact: true }).click();
  let current = await readCropStatus(page);
  expect(current.x).toBe(45);
  expect(current.y).toBe(50);
  expect(current.zoom).toBe(1);

  // Change zoom to 2: X and Y unchanged, zoom changes.
  await page.getByTestId("crop-zoom").fill("2");
  current = await readCropStatus(page);
  expect(current.x).toBe(45);
  expect(current.y).toBe(50);
  expect(current.zoom).toBe(2);

  // Reset restores all three defaults.
  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  current = await readCropStatus(page);
  expect(current).toEqual({ x: 50, y: 50, zoom: 1 });

  // Dialog remains open and selected file remains present.
  await expect(page.getByTestId("crop-dialog")).toBeVisible();
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Profile Picture", exact: true }) });
  const inputHasFile = await section.locator('input[type="file"]').evaluate(
    (input) => (input as HTMLInputElement).files !== null && (input as HTMLInputElement).files!.length > 0,
  );
  expect(inputHasFile).toBe(true);

  await page.keyboard.press("Escape");
});

test("boundaries clamp and controls remain usable at 44px", async ({ page }) => {
  test.setTimeout(120_000);
  skipUnlessLocal();

  await loginLocalOwnerDirectly(page);
  await dismissCookieBanner(page);
  await openProfilePictureCrop(page, { width: 390, height: 844 });

  const right = page.getByRole("button", { name: "Move image right", exact: true });
  const left = page.getByRole("button", { name: "Move image left", exact: true });
  const up = page.getByRole("button", { name: "Move image up", exact: true });
  const down = page.getByRole("button", { name: "Move image down", exact: true });

  // Repeated right clamps X at 0.
  for (let i = 0; i < 25; i += 1) await right.click();
  let status = await readCropStatus(page);
  expect(status.x).toBe(0);
  expect(status.y).toBe(50);

  // Repeated left clamps X at 100.
  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  for (let i = 0; i < 25; i += 1) await left.click();
  status = await readCropStatus(page);
  expect(status.x).toBe(100);
  expect(status.y).toBe(50);

  // Repeated down clamps Y at 0.
  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  for (let i = 0; i < 25; i += 1) await down.click();
  status = await readCropStatus(page);
  expect(status.x).toBe(50);
  expect(status.y).toBe(0);

  // Repeated up clamps Y at 100.
  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  for (let i = 0; i < 25; i += 1) await up.click();
  status = await readCropStatus(page);
  expect(status.x).toBe(50);
  expect(status.y).toBe(100);

  // Rendered height is at least 44px for all five controls.
  for (const button of [right, left, up, down, page.getByRole("button", { name: "Reset crop", exact: true })]) {
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }

  // No horizontal overflow on page or dialog.
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
});

test("drag, cancel, and no-storage-write regression", async ({ page }) => {
  test.setTimeout(120_000);
  skipUnlessLocal();

  await loginLocalOwnerDirectly(page);
  await dismissCookieBanner(page);
  await openInvoiceLogoCrop(page, { width: 375, height: 667 });

  const requests = collectStorageRequests(page);

  // Drag still changes position.
  await dragPreview(page, 60, 30);
  const status = await readCropStatus(page);
  expect(status.x).not.toBe(50);
  expect(status.y).not.toBe(50);

  // Zoom range still works.
  await page.getByTestId("crop-zoom").fill("2.5");
  expect((await readCropStatus(page)).zoom).toBe(2.5);

  // Escape closes.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("crop-dialog")).toHaveCount(0);

  // Reopen and Cancel closes.
  await openInvoiceLogoCrop(page, { width: 375, height: 667 });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByTestId("crop-dialog")).toHaveCount(0);

  // Reopen and backdrop closes.
  await openInvoiceLogoCrop(page, { width: 375, height: 667 });
  await page.mouse.click(5, 5);
  await expect(page.getByTestId("crop-dialog")).toHaveCount(0);

  // No success state or framework error overlay.
  await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Build Error/i);
  await expect(page.locator("body")).not.toContainText(/saved successfully|uploaded successfully/i);

  requests.stop();
  const storageWrites = requests.urls.filter((url) => url.includes("/storage/v1/") || url.includes("/object/"));
  expect(storageWrites).toEqual([]);
});
