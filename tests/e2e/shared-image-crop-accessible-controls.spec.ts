import { expect, test, type Page } from "@playwright/test";
import { isLocalPlaywrightRun, loginLocalOwnerDirectly } from "./helpers/local-supabase";

function skipUnlessLocal(): void {
  test.skip(!isLocalPlaywrightRun(), "Shared image crop QA is restricted to localhost.");
}

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

function pngFixture(): { name: string; mimeType: string; buffer: Buffer } {
  return {
    name: "qa-tiny.png",
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  };
}

async function dismissCookieBanner(page: Page): Promise<void> {
  await page.evaluate(() => {
    const acceptButton = document.querySelector('[aria-label="Accept all cookies"]') as HTMLElement | null;
    acceptButton?.click();
  });
}

async function openProfilePictureCrop(page: Page) {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Profile Picture", exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("heading", { name: "Profile Picture", exact: true }).scrollIntoViewIfNeeded();
  // Profile picture is the square ImageUpload inside the Profile Picture section.
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Profile Picture", exact: true }) });
  const fileInput = section.locator('input[type="file"]');
  await fileInput.setInputFiles(pngFixture());
  await expect(page.getByRole("dialog", { name: "Crop image" })).toBeVisible({ timeout: 10_000 });
}

async function openInvoiceLogoCrop(page: Page) {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Invoice & Receipt Branding", exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("heading", { name: "Invoice & Receipt Branding", exact: true }).scrollIntoViewIfNeeded();
  // Invoice logo is the landscape ImageUpload inside the Invoice & Receipt Branding section.
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Invoice & Receipt Branding", exact: true }) });
  const fileInput = section.locator('input[type="file"]');
  await fileInput.setInputFiles(pngFixture());
  await expect(page.getByRole("dialog", { name: "Crop image" })).toBeVisible({ timeout: 10_000 });
}

test("square crop shows accessible nudge controls and resets to defaults", async ({ page }) => {
  test.setTimeout(120_000);
  skipUnlessLocal();

  await loginLocalOwnerDirectly(page);
  await dismissCookieBanner(page);
  await openProfilePictureCrop(page);

  await expect(page.getByRole("button", { name: "Move image up", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move image down", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move image left", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move image right", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset crop", exact: true })).toBeVisible();

  const status = page.locator('text=/X \\d+% · Y \\d+% · Zoom \\d+\\.\\d+×/');
  await expect(status).toHaveText("X 50% · Y 50% · Zoom 1.00×");

  await page.getByRole("button", { name: "Move image right", exact: true }).click();
  await expect(status).toHaveText("X 55% · Y 50% · Zoom 1.00×");

  await page.getByRole("button", { name: "Move image down", exact: true }).click();
  await expect(status).toHaveText("X 55% · Y 55% · Zoom 1.00×");

  await page.getByRole("button", { name: "Move image left", exact: true }).click();
  await expect(status).toHaveText("X 50% · Y 55% · Zoom 1.00×");

  await page.getByRole("button", { name: "Move image up", exact: true }).click();
  await expect(status).toHaveText("X 50% · Y 50% · Zoom 1.00×");

  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  await expect(status).toHaveText("X 50% · Y 50% · Zoom 1.00×");

  // Confirm the square crop frame uses the circular mask.
  await expect(page.getByTestId("crop-mask")).toHaveClass(/rounded-full/);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Crop image" })).toHaveCount(0);
});

test("landscape crop shows accessible nudge controls and clamped boundaries", async ({ page }) => {
  test.setTimeout(120_000);
  skipUnlessLocal();

  await loginLocalOwnerDirectly(page);
  await dismissCookieBanner(page);
  await openInvoiceLogoCrop(page);

  await expect(page.getByRole("button", { name: "Move image up", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move image right", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset crop", exact: true })).toBeVisible();

  const status = page.locator('text=/X \\d+% · Y \\d+% · Zoom \\d+\\.\\d+×/');
  await expect(status).toHaveText("X 50% · Y 50% · Zoom 1.00×");

  // Push the crop to the bottom-right corner by repeatedly nudging right/down.
  const right = page.getByRole("button", { name: "Move image right", exact: true });
  const down = page.getByRole("button", { name: "Move image down", exact: true });
  for (let i = 0; i < 25; i += 1) {
    await right.click();
  }
  for (let i = 0; i < 25; i += 1) {
    await down.click();
  }
  await expect(status).toHaveText("X 100% · Y 100% · Zoom 1.00×");

  // Reset must bring the crop back to center.
  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  await expect(status).toHaveText("X 50% · Y 50% · Zoom 1.00×");

  // Confirm the landscape crop frame uses the rounded rectangle mask.
  await expect(page.getByTestId("crop-mask")).toHaveClass(/rounded-2xl/);
  await expect(page.getByTestId("crop-mask")).not.toHaveClass(/rounded-full/);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Crop image" })).toHaveCount(0);
});
