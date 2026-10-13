import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { formatCurrency } from "@/lib/formatters";
import { loginLocalOwnerDirectly, isLocalPlaywrightRun } from "./helpers/local-supabase";
import { returnFixture, returnSql } from "./helpers/return-math-fixture";

test.describe.configure({ mode: "serial", retries: 0 });
test.skip(!isLocalPlaywrightRun(), "Synthetic local sale-cost tests only");

for (const restock of [3, 0, 2]) test(`390px protected mixed-cost sale and Return, restock ${restock}: Dashboard/Reports agree`, async ({ page }) => {
  test.setTimeout(90000);
  const fixture = await returnFixture({ quantity: 3, price: 1000, cost: 600, paid: 3000,
    lots: [{ quantity: 2, cost: 600 }, { quantity: 1, cost: 600.01 }] });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const expected = JSON.parse(returnSql(`select jsonb_build_object('restored',sum(least(greatest(${restock}-used,0),quantity)*unit_cost),
    'combined',sum(least(greatest(${restock}-used,0),quantity)*unit_cost)-1800.01) from
    (select quantity,unit_cost,coalesce(sum(quantity)over(order by created_at,id rows between unbounded preceding and 1 preceding),0)used
    from public.invoice_item_stock_allocations where invoice_id='${fixture.invoice}') a;`));
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginLocalOwnerDirectly(page, fixture.email, fixture.password);
    await page.goto(`/invoices/${fixture.invoice}`);
    await page.getByRole("button", { name: "Reject optional cookies", exact: true }).click();
    await expect(page.getByText("Total cost", { exact: true }).locator("..")).toContainText(formatCurrency(1800.01, "PKR"));
    await expect(page.getByText("Gross profit", { exact: true }).locator("..")).toContainText(formatCurrency(1199.99, "PKR"));
    await page.goto("/dashboard");
    await expect(page.getByText("Today's Net Profit", { exact: true }).locator('xpath=ancestor::*[@data-widget-id][1]')).toContainText(formatCurrency(1199.99, "PKR"));
    await page.goto("/reports");
    await expect(page.getByText("Product Cost of Sales", { exact: true }).locator("..")).toContainText(formatCurrency(1800.01, "PKR"));
    await expect(page.getByText("Estimated Net Profit", { exact: true }).first().locator("../..")).toContainText(formatCurrency(1199.99, "PKR"));
    await page.goto(`/invoices/${fixture.invoice}`);
    await page.getByRole("spinbutton", { name: "Return quantity for Synthetic product", exact: true }).fill("3");
    if (restock === 0) await page.getByRole("button", { name: "None", exact: true }).click();
    if (restock === 2) {
      await page.getByRole("button", { name: "Custom", exact: true }).click();
      await page.getByRole("spinbutton", { name: "Sellable stock quantity for Synthetic product", exact: true }).fill("2");
    }
    await page.getByRole("button", { name: "Refund method", exact: true }).click();
    await page.getByRole("option", { name: "Cash", exact: true }).click();
    await page.getByRole("button", { name: "Process return", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Return processed", exact: true })).toBeVisible();
    expect(fixture.state().consumed).toBe(3); expect(fixture.state().restocked).toBe(restock);
    await page.goto("/dashboard");
    await expect(page.getByText("Today's Net Profit", { exact: true }).locator('xpath=ancestor::*[@data-widget-id][1]')).toContainText(formatCurrency(expected.combined, "PKR"));
    if (process.env.QA_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.QA_EVIDENCE_DIR}/cogs-dashboard-restock-${restock}-390.png`, fullPage: true });
    await page.goto("/reports");
    await expect(page.getByText("Estimated Net Profit", { exact: true }).first().locator("../..")).toContainText(formatCurrency(expected.combined, "PKR"));
    await expect(page.getByText("Product Cost of Sales", { exact: true }).locator("..")).toContainText(formatCurrency(1800.01, "PKR"));
    if (restock > 0) await expect(page.getByText("Restocked Product Cost (Original FIFO)", { exact: true }).locator("..")).toContainText(formatCurrency(expected.restored, "PKR"));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    if (process.env.QA_EVIDENCE_DIR) {
      await page.screenshot({ path: `${process.env.QA_EVIDENCE_DIR}/cogs-reports-restock-${restock}-390.png`, fullPage: true });
      fs.writeFileSync(`${process.env.QA_EVIDENCE_DIR}/cogs-browser-restock-${restock}.json`, JSON.stringify({ restock, expected, state: fixture.state(), passed: true }, null, 2));
    }
  } finally { await fixture.cleanup(); }
});
