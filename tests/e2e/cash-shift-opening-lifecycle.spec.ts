import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  getLocalAdminClient,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const org = "00000000-0000-4000-8000-000000000003";
const root = process.env.CASH_SHIFT_BROWSER_EVIDENCE;
function sql(query: string) {
  const container = process.env.LOCAL_SUPABASE_DB_CONTAINER ?? "";
  if (!/^supabase_db_qa[0-9]+-[a-z0-9-]+$/.test(container))
    throw Error("Local task database required");
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
async function setup(page: Page) {
  expect(new URL(process.env.PLAYWRIGHT_BASE_URL!).hostname).toMatch(
    /^(127\.0\.0\.1|localhost)$/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "analytics-consent",
      JSON.stringify({
        value: "rejected",
        version: "2026-06-analytics-v1",
        timestamp: new Date().toISOString(),
      }),
    );
    localStorage.setItem(
      "saledock-sidebar-preferences-v1",
      JSON.stringify({
        analyticsConsent: "rejected",
        marketingConsent: "rejected",
      }),
    );
  });
  const { data: owner, error } = await getLocalAdminClient()
    .from("profiles")
    .select("id,branch_id")
    .eq("organization_id", org)
    .eq("username", "qa61954-cash-light")
    .single();
  expect(error).toBeNull();
  expect(owner?.branch_id).toBeTruthy();
  const auth = `set local request.jwt.claim.sub='${owner!.id}';set local request.jwt.claim.role='authenticated';set local role authenticated;`;
  sql(
    `begin;${auth}select public.reset_organization_to_factory_defaults('${org}','${owner!.id}',false);commit;`,
  );
  await loginLocalOwnerDirectly(page, "cash-light@saledock.local");
  await page.goto("/daily-closing");
  await expect(
    page.getByRole("button", { name: "Open shift", exact: true }),
  ).toBeEnabled();
  return { auth, branch: owner!.branch_id };
}
const openForm = (page: Page) =>
  page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Open shift", exact: true }),
    });
const closeForm = (page: Page) =>
  page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Close shift", exact: true }),
    });
const current = (branch: string) =>
  JSON.parse(
    sql(
      `select coalesce(jsonb_agg(jsonb_build_object('id',id,'starting_cash',starting_cash::text,'status',status)),'[]') from public.cash_shifts where organization_id='${org}' and branch_id='${branch}' and status='open' and accounting_version=2;`,
    ),
  );
async function close(page: Page, cash: string) {
  await closeForm(page).locator("[name=counted_cash]").fill(cash);
  await closeForm(page)
    .getByRole("button", { name: "Close shift", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open shift", exact: true }),
  ).toBeEnabled();
}

for (const secondFloat of ["100.00", "175.25"])
  test(
    "ACS-20261017-01 real lost opening response, authoritative recovery and next float " +
      secondFloat,
    async ({ page }) => {
      test.setTimeout(90000);
      const { auth, branch } = await setup(page);
      const k1 = await openForm(page)
        .locator("[name=request_key]")
        .inputValue();
      const oldStorageKey = await page.evaluate(
        (k) =>
          Object.keys(sessionStorage).find(
            (name) => sessionStorage.getItem(name) === k,
          ),
        k1,
      );
      expect(oldStorageKey).toBeTruthy();
      let intercepted = false;
      let committed: ReturnType<typeof current>;
      let finishLoss!: () => void;
      const loss = new Promise<void>((resolve) => {
        finishLoss = resolve;
      });
      const transportErrors: string[] = [];
      page.on("pageerror", (e) => transportErrors.push(e.message));
      await page.route("**/daily-closing**", async (route) => {
        if (
          intercepted ||
          route.request().method() !== "POST" ||
          !route.request().headers()["next-action"]
        )
          return route.continue();
        intercepted = true;
        // Execute the actual local HTTP Server Action and wait for its DB commit.
        // Deliver none of that response to the browser; no framework substitution.
        const upstream = await route.fetch();
        expect(upstream.status()).toBe(200);
        committed = current(branch);
        expect(committed).toHaveLength(1);
        await route.abort("failed");
        finishLoss();
      });
      await openForm(page).locator("[name=starting_cash]").fill("100.00");
      await openForm(page)
        .getByRole("button", { name: "Open shift", exact: true })
        .click();
      await loss;
      expect(
        await page.evaluate(
          (name) => sessionStorage.getItem(name!),
          oldStorageKey,
        ),
      ).toBe(k1);
      await page.goto("/daily-closing");
      await expect(
        page.getByRole("button", { name: "Close shift", exact: true }),
      ).toBeEnabled();
      const a = current(branch)[0];
      expect(a.id).toBe(committed![0].id);
      await close(page, "100.00");
      const k2 = await openForm(page)
        .locator("[name=request_key]")
        .inputValue();
      expect(k2).not.toBe(k1);
      const newStorageKey = await page.evaluate(
        (k) =>
          Object.keys(sessionStorage).find(
            (name) => sessionStorage.getItem(name) === k,
          ),
        k2,
      );
      expect(newStorageKey).not.toBe(oldStorageKey);
      await openForm(page).locator("[name=starting_cash]").fill(secondFloat);
      await openForm(page)
        .getByRole("button", { name: "Open shift", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Close shift", exact: true }),
      ).toBeEnabled();
      const b = current(branch);
      expect(b).toHaveLength(1);
      expect(b[0].id).not.toBe(a.id);
      expect(Number(b[0].starting_cash)).toBe(Number(secondFloat));
      const product = randomUUID();
      sql(
        `insert into public.products(id,organization_id,name,type,sale_price,purchase_price,stock_quantity,is_active) values('${product}','${org}','Synthetic ACS lifecycle service','service',100,0,0,true);`,
      );
      sql(
        `begin;${auth}select public.pos_checkout('${branch}',null,'[{"product_id":"${product}","quantity":1,"unit_price":100,"discount":0}]',0,'cash',100,null,null,false,'${randomUUID()}');commit;`,
      );
      const payment = JSON.parse(
        sql(
          `select jsonb_build_object('payment_id',p.id,'cash_shift_id',p.cash_shift_id,'assignment_xid',p.cash_shift_assignment_xid::text,'invoice_shift',i.cash_shift_id,'amount',p.amount::text) from public.payments p join public.invoices i on i.id=p.invoice_id where p.organization_id='${org}';`,
        ),
      );
      expect(payment.cash_shift_id).toBe(b[0].id);
      expect(payment.invoice_shift).toBe(b[0].id);
      expect(payment.assignment_xid).toBeTruthy();
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Close shift", exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByText("Checking session...", { exact: true }),
      ).toBeHidden();
      await expect(
        page.getByText("Loading SaleDock...", { exact: true }),
      ).toBeHidden();
      const expected = secondFloat === "100.00" ? "200.00" : "275.25";
      if (root) {
        mkdirSync(root, { recursive: true });
        await page.screenshot({
          path: root + "/opening-recovered-" + secondFloat + "-390.png",
          fullPage: true,
        });
      }
      await close(page, expected);
      const snapshot = JSON.parse(
        sql(
          `select jsonb_build_object('expected',expected_cash::text,'counted',counted_cash::text,'variance',cash_difference::text) from public.cash_shifts where id='${b[0].id}';`,
        ),
      );
      expect(Number(snapshot.expected)).toBe(Number(expected));
      expect(Number(snapshot.variance)).toBe(0);
      if (root)
        writeFileSync(
          root + "/opening-recovered-" + secondFloat + ".json",
          JSON.stringify(
            {
              realBrowser: true,
              frameworkSubstitution: false,
              firstResponseDelivered: false,
              k1,
              k2,
              oldStorageKey,
              newStorageKey,
              firstShift: a,
              secondShift: b[0],
              payment,
              snapshot,
              transportErrors,
            },
            null,
            2,
          ),
        );
    },
  );

test("uncommitted unknown opening survives a real page remount with its original key", async ({
  page,
}) => {
  const { branch } = await setup(page);
  const key = await openForm(page).locator("[name=request_key]").inputValue();
  let blocked = false;
  let finish!: () => void;
  const loss = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**/daily-closing**", async (route) => {
    if (
      !blocked &&
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      blocked = true;
      await route.abort("failed");
      finish();
    } else await route.continue();
  });
  await openForm(page)
    .getByRole("button", { name: "Open shift", exact: true })
    .click();
  await loss;
  expect(current(branch)).toHaveLength(0);
  await page.goto("/daily-closing");
  await expect(
    page.getByRole("button", { name: "Open shift", exact: true }),
  ).toBeEnabled();
  expect(await openForm(page).locator("[name=request_key]").inputValue()).toBe(
    key,
  );
  await openForm(page)
    .getByRole("button", { name: "Open shift", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Close shift", exact: true }),
  ).toBeEnabled();
  expect(current(branch)).toHaveLength(1);
  await close(page, "0");
  if (root)
    writeFileSync(
      root + "/opening-unresolved-remount.json",
      JSON.stringify(
        {
          key,
          retainedAfterUnknownAndRemount: true,
          committedOpenings: 1,
          realBrowser: true,
          frameworkSubstitution: false,
        },
        null,
        2,
      ),
    );
});
