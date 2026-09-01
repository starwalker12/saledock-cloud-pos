import { expect, test, type Page } from "@playwright/test";
import {
  isLocalPlaywrightRun,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(
    geometry.documentWidth,
    `${label}: ${JSON.stringify(geometry)}`,
  ).toBeLessThanOrEqual(geometry.viewport + 1);
}

test.describe("date-range validation and Karachi semantics", () => {
  test.describe.configure({ mode: "serial", retries: 0 });
  test.skip(
    !isLocalPlaywrightRun(),
    "Date-range route acceptance is intentionally local-only.",
  );

  test.beforeEach(async ({ page }) => {
    await loginLocalOwnerDirectly(page);
  });

  test("supplier purchases rejects impossible dates without losing usable filters", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(
      "/suppliers/purchases?from=2026-02-31&status=partial&q=qa&sort=purchase_date&dir=asc",
    );
    await expect(page.locator("p[role=alert]")).toHaveText(
      "Enter a valid From date.",
    );
    await expect(
      page.getByRole("button", { name: "Apply" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /reset/i })).toBeVisible();
    expect(pageErrors).toEqual([]);

    await page.goto(
      "/suppliers/purchases?from=2026-02-01&to=2026-02-28&status=partial&q=qa",
    );
    await expect(page.locator("p[role=alert]")).toHaveCount(0);
    await expect(page.locator('input[name="from"]').first()).toHaveValue(
      "2026-02-01",
    );
    await expect(page.locator('input[name="to"]').first()).toHaveValue(
      "2026-02-28",
    );
    expect(page.url()).toContain("status=partial");
  });

  test("repairs rejects impossible and reversed intake-date ranges", async ({
    page,
  }) => {
    await page.goto("/repairs?from=2026-04-31&status=received");
    await expect(page.locator("p[role=alert]")).toHaveText(
      "Enter a valid From date.",
    );

    await page.goto("/repairs?from=2026-04-30&to=2026-04-01");
    await expect(page.locator("p[role=alert]")).toHaveText(
      "From date cannot be after To date.",
    );

    await page.goto(
      "/repairs?from=2026-04-01&to=2026-04-30&status=received&sort=created_at&dir=asc",
    );
    await expect(page.locator("p[role=alert]")).toHaveCount(0);
    expect(page.url()).toContain("status=received");
    expect(page.url()).toContain("sort=created_at");
  });

  test("Invoices remains the strict regression control", async ({ page }) => {
    await page.goto("/invoices?from=2026-02-29&status=paid");
    await expect(page.locator("p[role=alert]")).toHaveText(
      "Enter a valid From date.",
    );

    await page.goto(
      "/invoices?from=2026-02-01&to=2026-02-28&status=paid&payment=card",
    );
    await expect(page.locator("p[role=alert]")).toHaveCount(0);
    await expect(page.locator('select[name="status"]')).toHaveValue("paid");
    await expect(page.locator('select[name="payment"]')).toHaveValue("card");
  });

  test("invalid filter feedback remains usable at mobile widths", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/expenses?from=2026-02-31&payment_method=card");
      await expect(page.locator("p[role=alert]")).toHaveText(
        "Enter a valid From date.",
      );
      await expect(
        page.getByRole("link", { name: /reset filters/i }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(
        page,
        `Expenses invalid range at ${viewport.width}px`,
      );

      await page.goto(
        "/reports?range=custom&startDate=2026-01-31&endDate=2026-01-01",
      );
      await expect(page.locator("p[role=alert]")).toContainText(
        "Start date cannot be after End date.",
      );
      await expect(
        page.getByRole("button", { name: "Apply Filter" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(
        page,
        `Reports invalid range at ${viewport.width}px`,
      );
    }
  });
});
