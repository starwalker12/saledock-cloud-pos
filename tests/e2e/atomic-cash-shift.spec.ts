import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  getLocalAdminClient,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const LOCAL_QA_ORG_ID = "00000000-0000-4000-8000-000000000003";
const root = process.env.CASH_SHIFT_BROWSER_EVIDENCE;
test.beforeEach(async ({ page }) => {
  await page.addLocatorHandler(
    page.getByTestId("cookie-consent-banner").filter({
      has: page.getByRole("button", {
        name: "Reject optional cookies",
        exact: true,
      }),
    }),
    async (banner) => {
      await banner
        .getByRole("button", { name: "Reject optional cookies", exact: true })
        .click();
    },
  );
});
function sql(query: string) {
  const container = process.env.LOCAL_SUPABASE_DB_CONTAINER ?? "";
  if (!/^supabase_db_qa[0-9]+-[a-z0-9-]+$/.test(container))
    throw Error("Task-local database required");
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-XqAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ],
    { input: query, encoding: "utf8" },
  ).trim();
}
for (const theme of ["light", "dark"])
  test(
    "atomic cash shift " +
      theme +
      " at 390px, outside expense, 1001 receipts, freeze and rollover",
    async ({ page }) => {
      test.setTimeout(120000);
      expect(new URL(process.env.PLAYWRIGHT_BASE_URL!).hostname).toMatch(
        /^(127\.0\.0\.1|localhost)$/,
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript(
        (value) => localStorage.setItem("theme", value),
        theme,
      );
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const admin = getLocalAdminClient();
      const { data: owner, error } = await admin
        .from("profiles")
        .select("id,branch_id")
        .eq("organization_id", LOCAL_QA_ORG_ID)
        .eq("role", "owner")
        .eq("username", "qa61954-cash-" + theme)
        .single();
      expect(error).toBeNull();
      expect(owner?.branch_id).toBeTruthy();
      const actor = owner!.id,
        branch = owner!.branch_id,
        marker = "QA61954-" + theme + "-" + randomUUID().slice(0, 8);
      const auth =
        "set local request.jwt.claim.sub='" +
        actor +
        "';set local request.jwt.claim.role='authenticated';set local role authenticated;";
      sql(
        "begin;" +
          auth +
          "select public.reset_organization_to_factory_defaults('" +
          LOCAL_QA_ORG_ID +
          "','" +
          actor +
          "',false);commit;",
      );
      await loginLocalOwnerDirectly(page, "cash-" + theme + "@saledock.local");
      await page.goto("/expenses");
      await expect(
        page.getByText("Loading SaleDock...", { exact: true }),
      ).toHaveCount(0);
      const addOutsideExpense = page
        .locator("summary:visible:not([inert] *)")
        .filter({ hasText: /^Add a new expense$/ });
      await expect(addOutsideExpense).toHaveCount(1);
      await addOutsideExpense.click();
      const form = page.locator("form").filter({
        has: page.getByRole("button", { name: "Add expense", exact: true }),
      });
      await expect(
        form.getByRole("button", { name: "Add expense", exact: true }),
      ).toBeEnabled();
      await form.locator("[name=category]").fill(marker + " outside");
      await form.locator("[name=amount]").fill("5");
      await form
        .getByRole("button", { name: "Add expense", exact: true })
        .click();
      await expect(
        page.getByText("Expense recorded.", { exact: true }),
      ).toBeVisible();
      await page.goto("/daily-closing");
      await expect(
        page.getByRole("button", { name: "Open shift", exact: true }),
      ).toBeEnabled();
      await page
        .locator("form")
        .filter({
          has: page.getByRole("button", { name: "Open shift", exact: true }),
        })
        .locator("[name=starting_cash]")
        .fill("50");
      await page
        .getByRole("button", { name: "Open shift", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Close shift", exact: true }),
      ).toBeVisible();
      const shift = sql(
        "select id from public.cash_shifts where organization_id='" +
          LOCAL_QA_ORG_ID +
          "' and branch_id='" +
          branch +
          "' and accounting_version=2 and status='open'",
      );
      expect(shift).toMatch(/^[a-f0-9-]{36}$/);
      const product = randomUUID();
      sql(
        "insert into public.products(id,organization_id,name,type,sale_price,purchase_price,stock_quantity,is_active) values('" +
          product +
          "','" +
          LOCAL_QA_ORG_ID +
          "','" +
          marker +
          " service','service',100,0,0,true);",
      );
      sql(
        "begin;" +
          auth +
          "do $$ declare n int; begin for n in 1..1001 loop perform public.pos_checkout('" +
          branch +
          "',null,jsonb_build_array(jsonb_build_object('product_id','" +
          product +
          "','quantity',1,'unit_price',case when n=1001 then 1000000 else 100 end,'discount',0)),0,'cash',case when n=1001 then 1000000 else 100 end,null,null,false,gen_random_uuid()::text);end loop;end $$;commit;",
      );
      await page.reload();
      const closeForm = page.locator("form").filter({
        has: page.getByRole("button", { name: "Close shift", exact: true }),
      });
      await expect(
        closeForm
          .getByText("Expected cash (drawer)", { exact: true })
          .locator("..")
          .getByText(/1,100,050/),
      ).toBeVisible();
      await closeForm.locator("[name=counted_cash]").fill("1100050");
      await page.evaluate(() => {
        document.documentElement.classList.toggle(
          "dark",
          localStorage.getItem("theme") === "dark",
        );
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      if (root) {
        mkdirSync(root, { recursive: true });
        await page.screenshot({
          path: root + "/" + theme + "-open-390.png",
          fullPage: true,
        });
        await closeForm
          .getByRole("button", { name: "Close shift", exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: root + "/" + theme + "-close-preview-390.png",
        });
        await page.evaluate(() => {
          window.print = () => {};
          // Keep the mocked native dialog open through PDF capture. A real
          // window.print blocks this fallback timer until the dialog closes.
          const schedule = window.setTimeout.bind(window);
          window.setTimeout = ((
            handler: TimerHandler,
            delay?: number,
            ...args: unknown[]
          ) =>
            schedule(
              handler,
              delay === 1200 ? 60000 : delay,
              ...args,
            )) as typeof window.setTimeout;
        });
        await page
          .getByRole("button", { name: "Print shift report", exact: true })
          .click();
        await expect(page.locator("body")).toHaveAttribute(
          "data-print-mode",
          "shift-thermal",
        );
        await page.emulateMedia({ media: "print" });
        const thermalLayout = await page
          .locator(".shift-thermal-print")
          .evaluate((node) => {
            const rect = node.getBoundingClientRect();
            return {
              width: rect.width,
              top: rect.top,
              display: getComputedStyle(node).display,
              bodyBackground: getComputedStyle(document.body).backgroundColor,
              filterVisible:
                getComputedStyle(document.querySelector("main form")!)
                  .display !== "none",
            };
          });
        expect(thermalLayout.width).toBeCloseTo((72 * 96) / 25.4, 0);
        expect(thermalLayout.top).toBeLessThan(30);
        expect(thermalLayout.display).toBe("block");
        expect(thermalLayout.bodyBackground).toBe("rgb(255, 255, 255)");
        expect(thermalLayout.filterVisible).toBe(false);
        await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
        await page.pdf({
          path: root + "/" + theme + "-shift-80mm.pdf",
          preferCSSPageSize: true,
          width: "80mm",
          height: "300mm",
          printBackground: true,
        });
        await page.emulateMedia({ media: "screen" });
        await page.evaluate(() => {
          delete document.body.dataset.printMode;
          delete document.body.dataset.cashDrawerPrint;
        });
        await page
          .getByRole("button", { name: "Print A4", exact: true })
          .click();
        await expect(page.locator("body")).toHaveAttribute(
          "data-print-mode",
          "a4",
        );
        await page.emulateMedia({ media: "print" });
        await expect(page.locator("[data-app-shell-root]")).toHaveCSS(
          "overflow",
          "visible",
        );
        await expect(page.locator("body")).toHaveCSS(
          "background-color",
          "rgb(255, 255, 255)",
        );
        await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
        const darkPrintSurfaces = await page
          .locator(".a4-print")
          .evaluate((node) =>
            [...node.querySelectorAll("*")]
              .filter((element) => {
                const style = getComputedStyle(element);
                return (
                  style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
                  style.backgroundColor !== "rgb(255, 255, 255)"
                );
              })
              .map((element) => ({
                tag: element.tagName,
                className: element.className,
                background: getComputedStyle(element).backgroundColor,
                display: getComputedStyle(element).display,
                visible: element.checkVisibility(),
              })),
          );
        expect(darkPrintSurfaces).toEqual([]);
        await page.pdf({
          path: root + "/" + theme + "-daily-A4.pdf",
          format: "A4",
          printBackground: true,
        });
        await page.emulateMedia({ media: "screen" });
        await page.evaluate(() => {
          delete document.body.dataset.printMode;
          delete document.body.dataset.cashDrawerPrint;
        });
      }
      await closeForm
        .getByRole("button", { name: "Close shift", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Open shift", exact: true }),
      ).toBeVisible();
      const proof = JSON.parse(
        sql(
          "select jsonb_build_object('expected',expected_cash::text,'difference',cash_difference::text,'snapshot',close_snapshot,'audits',(select count(*) from public.audit_logs a where a.id=s.close_audit_id)) from public.cash_shifts s where id='" +
            shift +
            "'",
        ),
      );
      expect(proof.expected).toBe("1100050.00");
      expect(proof.difference).toBe("0.00");
      expect(proof.snapshot.sourceCounts.payments).toBe("1001");
      expect(proof.snapshot.sourceCounts.expenses).toBe("0");
      expect(proof.audits).toBe(1);
      // A confirmed open unmounts its form. A later intentional open must receive a fresh key.
      await expect(
        page.getByRole("button", { name: "Open shift", exact: true }),
      ).toBeEnabled();
      await page
        .locator("form")
        .filter({
          has: page.getByRole("button", { name: "Open shift", exact: true }),
        })
        .locator("[name=starting_cash]")
        .fill("0");
      await page
        .getByRole("button", { name: "Open shift", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Close shift", exact: true }),
      ).toBeVisible();
      const next = sql(
        "select id from public.cash_shifts where organization_id='" +
          LOCAL_QA_ORG_ID +
          "' and status='open' and accounting_version=2",
      );
      expect(next).not.toBe(shift);
      await page.goto("/expenses");
      await expect(
        page.getByText("Loading SaleDock...", { exact: true }),
      ).toHaveCount(0);
      const addInsideExpense = page
        .locator("summary:visible:not([inert] *)")
        .filter({ hasText: /^Add a new expense$/ });
      await expect(addInsideExpense).toHaveCount(1);
      await addInsideExpense.click();
      const expenseForm = page.locator("form").filter({
        has: page.getByRole("button", { name: "Add expense", exact: true }),
      });
      await expect(
        expenseForm.getByRole("button", { name: "Add expense", exact: true }),
      ).toBeEnabled();
      await expenseForm.locator("[name=category]").fill(marker + " inside");
      await expenseForm.locator("[name=amount]").fill("25");
      await expenseForm
        .getByRole("button", { name: "Add expense", exact: true })
        .click();
      await expect(
        page.getByText("Expense recorded.", { exact: true }),
      ).toBeVisible();
      const expense = sql(
        "select id from public.expenses where organization_id='" +
          LOCAL_QA_ORG_ID +
          "' and category='" +
          marker +
          " inside'",
      );
      await page.goto("/daily-closing");
      await expect(
        page.getByRole("button", { name: "Close shift", exact: true }),
      ).toBeEnabled();
      await page
        .locator("form")
        .filter({
          has: page.getByRole("button", { name: "Close shift", exact: true }),
        })
        .locator("[name=counted_cash]")
        .fill("0");
      await page
        .getByRole("button", { name: "Close shift", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Open shift", exact: true }),
      ).toBeVisible();
      await page.goto("/expenses?edit=" + expense);
      const editForm = page.locator("form").filter({
        has: page.getByRole("button", {
          name: "Update expense",
          exact: true,
        }),
      });
      await editForm.locator("[name=amount]").fill("26");
      await editForm
        .getByRole("button", { name: "Update expense", exact: true })
        .click();
      await expect(
        page.getByRole("alert").filter({ hasText: "closed cash shift" }),
      ).toBeVisible();
      if (root)
        await page.screenshot({
          path: root + "/" + theme + "-closed-expense-rejection-390.png",
          fullPage: true,
        });
      await editForm.locator("[name=amount]").fill("25");
      await editForm
        .locator("[name=notes]")
        .fill("Existing nonfinancial annotation");
      await editForm
        .getByRole("button", { name: "Update expense", exact: true })
        .click();
      await expect(
        page.getByText("Expense updated.", { exact: true }),
      ).toBeVisible();
      expect(
        sql(
          "select expected_cash::text from public.cash_shifts where id='" +
            next +
            "'",
        ),
      ).toBe("-25.00");
      if (root) {
        await page.screenshot({
          path: root + "/" + theme + "-expense-freeze-390.png",
          fullPage: true,
        });
        writeFileSync(
          root + "/" + theme + "-result.json",
          JSON.stringify(
            {
              theme,
              viewport: 390,
              livePayments: 1001,
              expected: proof.expected,
              variance: proof.difference,
              outsideExcluded: true,
              rollover: true,
              closedExpenseFrozen: true,
              notesAllowed: true,
              pageErrors: errors,
            },
            null,
            2,
          ),
        );
      }
      expect(errors).toEqual([]);
    },
  );

test("keyed customer collection, forgiveness and current Return forms retain real producer semantics", async ({
  page,
}) => {
  test.setTimeout(90000);
  const admin = getLocalAdminClient();
  const { data: owner } = await admin
    .from("profiles")
    .select("id,branch_id")
    .eq("username", "qa61954-cash-light")
    .single();
  expect(owner).toBeTruthy();
  const auth =
    "set local request.jwt.claim.sub='" +
    owner!.id +
    "';set local request.jwt.claim.role='authenticated';set local role authenticated;";
  sql(
    "begin;" +
      auth +
      "select public.reset_organization_to_factory_defaults('" +
      LOCAL_QA_ORG_ID +
      "','" +
      owner!.id +
      "',false);commit;",
  );
  const customer = randomUUID(),
    product = randomUUID();
  sql(
    "insert into public.customers(id,organization_id,branch_id,name,outstanding_balance) values('" +
      customer +
      "','" +
      LOCAL_QA_ORG_ID +
      "','" +
      owner!.branch_id +
      "','QA61954 UI credit customer',100);insert into public.products(id,organization_id,name,type,sale_price,purchase_price,stock_quantity,is_active) values('" +
      product +
      "','" +
      LOCAL_QA_ORG_ID +
      "','QA61954 UI return service','service',100,0,0,true);",
  );
  const receipt = sql(
    "begin;" +
      auth +
      "select row_to_json(p) from public.pos_checkout('" +
      owner!.branch_id +
      '\',null,\'[{"product_id":"' +
      product +
      '","quantity":1,"unit_price":100,"discount":0}]\',0,\'cash\',100,null,null,false,\'' +
      randomUUID() +
      "')p;commit;",
  );
  const invoice = JSON.parse(
    receipt.split("\n").find((line) => line.startsWith("{"))!,
  ).invoice_id;
  await loginLocalOwnerDirectly(page, "cash-light@saledock.local");
  await page.goto("/customers/" + customer);
  await expect(
    page.getByText("Loading SaleDock...", { exact: true }),
  ).toHaveCount(0);
  await page.getByText("Receive Settlement Payment", { exact: true }).click();
  const settlement = page.locator("form").filter({
    has: page.getByRole("button", { name: /Confirm & Save Settlement/i }),
  });
  await expect(
    settlement.getByRole("button", { name: /Confirm & Save Settlement/i }),
  ).toBeEnabled();
  await settlement.locator("[name=amount]").fill("10");
  await settlement
    .getByRole("button", { name: /Confirm & Save Settlement/i })
    .click();
  await expect(
    page.getByText("Credit payment recorded successfully.", { exact: true }),
  ).toBeVisible();
  await page.goto("/customers/" + customer);
  await expect(
    page.getByText("Loading SaleDock...", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByText("Write Off Uncollectible Credit", { exact: true })
    .click();
  const writeoff = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: /Confirm Write-Off/i }) });
  await expect(
    writeoff.getByRole("button", { name: /Confirm Write-Off/i }),
  ).toBeEnabled();
  await writeoff.locator("[name=amount]").fill("5");
  await writeoff.locator("[name=reason]").fill("Synthetic owner qualification");
  await writeoff.getByRole("button", { name: /Confirm Write-Off/i }).click();
  await expect(
    page.getByText("Credit write-off recorded successfully.", { exact: true }),
  ).toBeVisible();
  expect(
    sql(
      "select outstanding_balance::text from public.customers where id='" +
        customer +
        "'",
    ),
  ).toBe("85.00");
  await page.goto("/invoices/" + invoice);
  await expect(
    page.getByText("Loading SaleDock...", { exact: true }),
  ).toHaveCount(0);
  const returnForm = page.locator("form").filter({
    has: page.getByRole("button", {
      name: /Process Return|Submit Return|Create Return/i,
    }),
  });
  await expect(returnForm).toBeVisible();
  await expect(returnForm.locator("[name=request_key]")).toHaveValue(
    /[a-f0-9-]{36}/,
  );
  const quantity = returnForm.locator("[name=quantity]").first();
  await quantity.fill("1");
  const refund = returnForm.locator("[name=refund_amount]");
  await refund.fill("100");
  await returnForm
    .getByRole("button", { name: "Refund method", exact: true })
    .click();
  await page.getByRole("option", { name: "Cash", exact: true }).click();
  const submit = returnForm.getByRole("button", {
    name: /Process Return|Submit Return|Create Return/i,
  });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText(/Return .*processed\./)).toBeVisible();
  expect(
    sql(
      "select count(*) from public.returns where invoice_id='" +
        invoice +
        "' and cash_shift_id is null and cash_shift_assignment_xid is not null",
    ),
  ).toBe("1");
  if (root)
    writeFileSync(
      root + "/financial-forms-result.json",
      JSON.stringify({
        creditCollection: "10.00",
        forgiveness: "5.00",
        balance: "85.00",
        currentReturnOnly: true,
        returnOutsideShift: true,
        oneReturn: true,
      }),
    );
});
