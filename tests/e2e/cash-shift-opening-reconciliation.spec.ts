import { test, expect, type Page, type Request } from "@playwright/test";
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
const openForm = (page: Page) =>
  page.locator("form").filter({ has: page.locator("[name=starting_cash]") });
const closeForm = (page: Page) =>
  page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Close shift", exact: true }),
    });
const key = (page: Page) =>
  openForm(page).locator("[name=request_key]").inputValue();
const ready = (page: Page) =>
  expect(
    page.getByRole("button", { name: "Open shift", exact: true }),
  ).toBeEnabled();
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function record(name: string, facts: unknown) {
  if (!root) return;
  mkdirSync(root, { recursive: true });
  writeFileSync(
    root + "/reconciliation-" + name + ".json",
    JSON.stringify(
      { realBrowser: true, frameworkSubstitution: false, ...(facts as object) },
      null,
      2,
    ),
  );
}
async function setup(page: Page) {
  expect(new URL(process.env.PLAYWRIGHT_BASE_URL!).hostname).toMatch(
    /^(127\.0\.0\.1|localhost)$/,
  );
  const { data: owner, error } = await getLocalAdminClient()
    .from("profiles")
    .select("id,branch_id")
    .eq("organization_id", org)
    .eq("username", "qa61954-cash-light")
    .single();
  expect(error).toBeNull();
  expect(owner?.branch_id).toBeTruthy();
  const auth = `set local request.jwt.claim.sub='${owner!.id}';set local request.jwt.claim.role='authenticated';set local role authenticated;`;
  const execute = (statement: string) =>
    sql(`begin;${auth}${statement}commit;`);
  const reset = () =>
    execute(
      `select public.reset_organization_to_factory_defaults('${org}','${owner!.id}',false);`,
    );
  reset();
  await login(page, "cash-light@saledock.local");
  await ready(page);
  const shifts = () =>
    JSON.parse(
      sql(
        `select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'key',open_request_key,'starting_cash',starting_cash::text)),'[]') from public.cash_shifts where organization_id='${org}' and branch_id='${owner!.branch_id}' and accounting_version=2;`,
      ),
    ) as { id: string; status: string; key: string; starting_cash: string }[];
  return { branch: owner!.branch_id, execute, reset, shifts };
}
async function login(page: Page, email: string) {
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
  });
  await loginLocalOwnerDirectly(page, email);
  await page.goto("/daily-closing");
}
async function open(page: Page, amount: string) {
  await openForm(page).locator("[name=starting_cash]").fill(amount);
  await openForm(page)
    .getByRole("button", { name: "Open shift", exact: true })
    .click();
}
async function close(page: Page, amount: string) {
  await closeForm(page).locator("[name=counted_cash]").fill(amount);
  await closeForm(page)
    .getByRole("button", { name: "Close shift", exact: true })
    .click();
  await ready(page);
}
async function fenced(page: Page) {
  await expect(
    openForm(page).getByRole("button", {
      name: "Refreshing drawer…",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(openForm(page).locator("[name=starting_cash]")).toBeDisabled();
  await expect(openForm(page).locator("[name=notes]")).toBeDisabled();
  await expect(openForm(page).getByRole("status")).toContainText(
    "Please wait before opening another shift",
  );
  // Check submission itself, including keyboard/programmatic requestSubmit,
  // rather than relying solely on the disabled button's appearance.
  await openForm(page).evaluate((form: HTMLFormElement) =>
    form.requestSubmit(),
  );
}
async function cashSale(f: Awaited<ReturnType<typeof setup>>, shift: string) {
  const product = randomUUID();
  sql(
    `insert into public.products(id,organization_id,name,type,sale_price,purchase_price,stock_quantity,is_active) values('${product}','${org}','Synthetic reconciliation service','service',100,0,0,true);`,
  );
  f.execute(
    `select public.pos_checkout('${f.branch}',null,'[{"product_id":"${product}","quantity":1,"unit_price":100,"discount":0}]',0,'cash',100,null,null,false,'${randomUUID()}');`,
  );
  const payment = JSON.parse(
    sql(
      `select jsonb_build_object('invoice_shift',i.cash_shift_id,'payment_shift',p.cash_shift_id,'invoice_xid',i.cash_shift_assignment_xid::text,'payment_xid',p.cash_shift_assignment_xid::text) from public.payments p join public.invoices i on i.id=p.invoice_id where p.organization_id='${org}';`,
    ),
  );
  expect(payment.invoice_shift).toBe(shift);
  expect(payment.payment_shift).toBe(shift);
  expect(payment.invoice_xid).toBeTruthy();
  expect(payment.payment_xid).toBeTruthy();
  return payment;
}

for (const amount of ["100.00", "175.25"])
  for (const outcome of ["delivered", "lost"])
    test(`ACS-20261017-02 ${amount} / ${outcome}: older recovery cannot admit a newer opening`, async ({
      page,
      browser,
    }) => {
      test.setTimeout(90000);
      const f = await setup(page);
      const contextB = await browser.newContext({
        baseURL: process.env.PLAYWRIGHT_BASE_URL,
      });
      const actorB = await contextB.newPage();
      const oldReady = deferred(),
        releaseOld = deferred(),
        renderReady = deferred(),
        releaseRender = deferred(),
        secondDone = deferred();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      let posts = 0,
        held = false,
        openingRequest: Request | undefined;
      try {
        await login(actorB, "cash-dark@saledock.local");
        const k1 = await key(page);
        const actorBStored = await actorB.evaluate(() =>
          Object.fromEntries(Object.entries(sessionStorage)),
        );
        await page.route("**/daily-closing**", async (route) => {
          const request = route.request();
          if (request.method() === "POST" && request.headers()["next-action"]) {
            const ordinal = ++posts;
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            if (ordinal === 1) {
              oldReady.resolve();
              await releaseOld.promise;
            }
            if (ordinal === 2) {
              openingRequest = request;
              expect(
                f.shifts().filter((s) => s.status === "open"),
              ).toHaveLength(1);
              if (outcome === "lost") {
                await route.abort("failed");
                secondDone.resolve();
                return;
              }
            }
            await route.fulfill({ response });
            if (ordinal === 2) secondDone.resolve();
            return;
          }
          if (
            !held &&
            request.method() === "GET" &&
            request.headers().rsc &&
            request.url().includes("shiftstate=")
          ) {
            held = true;
            const response = await route.fetch(); // genuine pre-B render, not a fabricated Flight result
            expect(f.shifts()).toHaveLength(1);
            expect(f.shifts()[0].status).toBe("closed");
            renderReady.resolve();
            await releaseRender.promise;
            await route.fulfill({ response });
            return;
          }
          await route.continue();
        });
        await open(page, "100.00");
        await oldReady.promise;
        await actorB.reload();
        await expect(
          actorB.getByRole("button", { name: "Close shift", exact: true }),
        ).toBeEnabled();
        await close(actorB, "100.00");
        releaseOld.resolve();
        await renderReady.promise;
        const fencedKey = await key(page);
        expect(fencedKey).toBe(k1); // the settled form does not generate another usable business key
        await fenced(page);
        await page.waitForTimeout(4200); // the fence must outlive pending=false and ordinary navigation delays
        await fenced(page);
        expect(posts).toBe(1);
        expect(f.shifts()).toHaveLength(1);
        if (root)
          await page.screenshot({
            path: root + `/reconciliation-fence-${amount}-${outcome}.png`,
            fullPage: true,
          });
        releaseRender.resolve();
        await ready(page);
        const k2 = await key(page);
        expect(k2).not.toBe(k1);
        // Old settlement did not corrupt the other actor's browser persistence.
        const otherStorage = await actorB.evaluate(() =>
          Object.fromEntries(Object.entries(sessionStorage)),
        );
        for (const [name, value] of Object.entries(actorBStored))
          if (name.includes("shift-open"))
            expect(otherStorage[name]).toBe(value);
        await open(page, amount);
        await secondDone.promise;
        const b = f.shifts().find((s) => s.status === "open")!;
        expect(b.key).toBe(k2);
        expect(f.shifts()).toHaveLength(2);
        let payment: unknown = null;
        let replay: unknown = null;
        if (outcome === "delivered") {
          await expect(
            page.getByRole("button", { name: "Close shift", exact: true }),
          ).toBeEnabled();
          await expect(
            page.getByRole("button", { name: "Open shift", exact: true }),
          ).toHaveCount(0);
          payment = await cashSale(f, b.id);
          await page.reload();
          await expect(
            page.getByRole("button", { name: "Close shift", exact: true }),
          ).toBeEnabled();
          await close(page, amount === "100.00" ? "200.00" : "275.25");
        } else {
          expect(
            await page.evaluate(
              (k) => Object.values(sessionStorage).includes(k),
              k2,
            ),
          ).toBe(true);
          await actorB.reload();
          await expect(
            actorB.getByRole("button", { name: "Close shift", exact: true }),
          ).toBeEnabled();
          await close(actorB, amount);
          // Explicitly retry the exact captured browser request over actual HTTP.
          // The failed form may be in Next's error boundary; do not fabricate its action result.
          const original = openingRequest!;
          const response = await page.context().request.fetch(original.url(), {
            method: original.method(),
            headers: original.headers(),
            data: original.postDataBuffer()!,
          });
          const body = await response.text();
          expect(response.status()).toBe(200);
          expect(body).toContain("That opening is no longer the active shift");
          expect(f.shifts()).toHaveLength(2);
          expect(f.shifts().filter((s) => s.status === "open")).toHaveLength(0);
          replay = {
            sameCapturedRequestKey: k2,
            closedReceiptRejectedAsNewSuccess: true,
            thirdShiftCreated: false,
          };
          await page.reload(); // now authoritative state actually reconciles B, rather than an older A render
          await ready(page);
          expect(await key(page)).not.toBe(k2);
          expect(f.shifts()).toHaveLength(2);
        }
        record(`${amount}-${outcome}`, {
          k1,
          fencedKey,
          k2,
          blockedDuringHeldRender: true,
          postCountBeforeRelease: 1,
          startingCashDisabled: true,
          notesDisabled: true,
          requestSubmitBlocked: true,
          delayMs: 4200,
          secondShift: b,
          payment,
          replay,
          totalExactOpenings: f.shifts().length,
          errors,
        });
      } finally {
        releaseOld.resolve();
        releaseRender.resolve();
        await contextB.close();
      }
    });

test("PT409 refresh fences the stale form until the active shift render arrives", async ({
  page,
  browser,
}) => {
  const f = await setup(page),
    contextB = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL,
    }),
    other = await contextB.newPage();
  const renderReady = deferred(),
    release = deferred();
  let posts = 0,
    held = false;
  try {
    await login(other, "cash-dark@saledock.local");
    const originalKey = await key(page);
    await open(other, "100.00");
    await expect(
      other.getByRole("button", { name: "Close shift", exact: true }),
    ).toBeEnabled();
    await page.route("**/daily-closing**", async (route) => {
      const r = route.request();
      if (r.method() === "POST" && r.headers()["next-action"]) posts++;
      if (
        !held &&
        r.method() === "GET" &&
        r.headers().rsc &&
        r.url().includes("shiftstate=")
      ) {
        held = true;
        const response = await route.fetch();
        renderReady.resolve();
        await release.promise;
        await route.fulfill({ response });
      } else await route.continue();
    });
    await open(page, "175.25");
    await renderReady.promise;
    await fenced(page);
    await page.waitForTimeout(1500);
    await fenced(page);
    expect(posts).toBe(1);
    expect(await key(page)).toBe(originalKey);
    expect(f.shifts()).toHaveLength(1);
    release.resolve();
    await expect(
      page.getByRole("button", { name: "Close shift", exact: true }),
    ).toBeEnabled();
    await close(page, "100.00");
    record("pt409", {
      fenced: true,
      postsBeforeRelease: 1,
      noDuplicateOpening: f.shifts().length === 1,
    });
  } finally {
    release.resolve();
    await contextB.close();
  }
});

test("stalled reconciliation stays fenced; full manual reload recovers authoritative state", async ({
  page,
}) => {
  const f = await setup(page),
    held = deferred(),
    release = deferred();
  let captured = false,
    cancel = false,
    posts = 0;
  try {
    await page.route("**/daily-closing**", async (route) => {
      const r = route.request();
      if (r.method() === "POST" && r.headers()["next-action"]) posts++;
      if (
        !captured &&
        r.method() === "GET" &&
        r.headers().rsc &&
        r.url().includes("shiftstate=")
      ) {
        captured = true;
        const response = await route.fetch();
        held.resolve();
        await release.promise;
        if (cancel) await route.abort("failed");
        else await route.fulfill({ response });
      } else await route.continue();
    });
    await open(page, "100.00");
    await held.promise;
    await fenced(page);
    await page.waitForTimeout(4200);
    await fenced(page);
    expect(posts).toBe(1);
    cancel = true;
    const reload = page.reload();
    release.resolve();
    await reload;
    await expect(
      page.getByRole("button", { name: "Close shift", exact: true }),
    ).toBeEnabled();
    expect(f.shifts()).toHaveLength(1);
    await close(page, "100.00");
    record("manual-reload", {
      fencedForDelayMs: 4200,
      postsBeforeReload: 1,
      originalOpeningRecovered: true,
      exactOpenings: f.shifts().length,
    });
  } finally {
    release.resolve();
  }
});

for (const committed of [true, false])
  test(`Factory Reset ${committed ? "R1 committed" : "R3 uncommitted"} opening key remains safe`, async ({
    page,
  }) => {
    const f = await setup(page),
      loss = deferred();
    const original = await key(page);
    let once = false;
    await page.route("**/daily-closing**", async (route) => {
      const r = route.request();
      if (!once && r.method() === "POST" && r.headers()["next-action"]) {
        once = true;
        if (committed) expect((await route.fetch()).status()).toBe(200);
        await route.abort("failed");
        loss.resolve();
      } else await route.continue();
    });
    await open(page, "100.00");
    await loss.promise;
    if (committed)
      f.execute(
        `select public.close_cash_shift('${f.shifts()[0].id}','${randomUUID()}','100',null);`,
      );
    f.reset();
    await page.reload();
    await ready(page);
    expect(await key(page)).toBe(original);
    await open(page, "175.25");
    await expect(
      page.getByRole("button", { name: "Close shift", exact: true }),
    ).toBeEnabled();
    const shift = f.shifts()[0];
    expect(f.shifts()).toHaveLength(1);
    const payment = await cashSale(f, shift.id);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Close shift", exact: true }),
    ).toBeEnabled();
    await close(page, "275.25");
    record(committed ? "reset-r1" : "reset-r3", {
      originalKey: original,
      shift,
      payment,
      postResetOpeningCount: f.shifts().length,
    });
  });
