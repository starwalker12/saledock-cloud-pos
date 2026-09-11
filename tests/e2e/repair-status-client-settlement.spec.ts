import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const proxy = process.env.REPAIR_STATUS_PROXY_URL;
const output = process.env.REPAIR_STATUS_EVIDENCE_DIR;
const baseline = process.env.REPAIR_STATUS_SOURCE_STATE === "baseline";
const WARNING =
  "The status was updated, but its audit record could not be confirmed. Do not submit it again. Refresh the page and contact an administrator.";
const SUCCESS = "Status updated successfully.";
const admin = () => getLocalAdminClient();
test.describe.configure({ mode: "serial", retries: 0 });
test.skip(
  !isLocalPlaywrightRun() || !proxy,
  "Requires the isolated loopback revalidation proxy.",
);
test.setTimeout(120_000);

async function control(command: string) {
  if (!proxy || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(proxy))
    throw new Error("Loopback proxy required");
  const response = await fetch(`${proxy}/__qa/${command}`, {
    method: command === "status" ? "GET" : "POST",
  });
  expect(response.ok).toBe(true);
  return response.json();
}
function sql(query: string) {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((n) => n.startsWith("supabase_db_"));
  expect(names).toHaveLength(1);
  return execFileSync(
    "docker",
    [
      "exec",
      names[0],
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      query,
    ],
    { encoding: "utf8" },
  ).trim();
}
function harnessCount() {
  return Number(
    sql(
      "select (select count(*) from pg_trigger where tgname='qa_repair_status_settlement' and not tgisinternal)+(select count(*) from pg_proc where proname='qa_repair_status_settlement')",
    ),
  );
}
function harness(id?: string) {
  if (!id) {
    sql(
      "drop trigger if exists qa_repair_status_settlement on public.audit_logs; drop function if exists public.qa_repair_status_settlement();",
    );
    return;
  }
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  sql(
    `create function public.qa_repair_status_settlement() returns trigger language plpgsql as $$ begin if new.action='repairs.status_changed' and new.metadata->>'repair_id'='${id}' then raise exception 'QA forced status audit'; end if; return new; end $$; create trigger qa_repair_status_settlement before insert on public.audit_logs for each row execute function public.qa_repair_status_settlement();`,
  );
}
async function fixture() {
  const { data: owner, error: ownerError } = await admin()
    .from("profiles")
    .select("id,branch_id")
    .eq("organization_id", LOCAL_QA_ORG_ID)
    .eq("role", "owner")
    .eq("is_active", true)
    .limit(1)
    .single();
  expect(ownerError).toBeNull();
  const id = randomUUID();
  const { error } = await admin()
    .from("repairs")
    .insert({
      id,
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: owner!.branch_id,
      created_by: owner!.id,
      job_no: `QA-${id.slice(0, 8)}`,
      customer_name: `QA-STATUS-SETTLEMENT-${id}`,
      device_type: "Mobile",
      problem_description: "Local nonfinancial settlement proof",
      status: "received",
      estimated_cost: 0,
      final_cost: 0,
      advance_paid: 0,
      payment_method: "cash",
    });
  expect(error).toBeNull();
  return { id, owner: owner! };
}
async function truth(id: string) {
  const repair = await admin()
    .from("repairs")
    .select(
      "id,status,estimated_cost,final_cost,advance_paid,customer_id,delivered_at",
    )
    .eq("id", id)
    .single();
  const histories = await admin()
    .from("repair_status_history")
    .select("id,old_status,new_status,note,changed_by")
    .eq("repair_id", id)
    .order("created_at");
  const audits = await admin()
    .from("audit_logs")
    .select("id,actor_id,organization_id,branch_id,action,details,metadata")
    .eq("action", "repairs.status_changed")
    .contains("metadata", { repair_id: id })
    .order("created_at");
  expect(repair.error).toBeNull();
  expect(histories.error).toBeNull();
  expect(audits.error).toBeNull();
  return {
    repair: repair.data!,
    histories: histories.data!,
    audits: audits.data!,
  };
}
async function cleanup(id: string) {
  await control("release");
  harness();
  for (const [table, key] of [
    ["audit_logs", "metadata"],
    ["repair_status_history", "repair_id"],
    ["repairs", "id"],
  ]) {
    const query = admin().from(table).delete();
    const result =
      key === "metadata"
        ? await query.contains(key, { repair_id: id })
        : await query.eq(key, id);
    expect(result.error).toBeNull();
  }
  expect(
    (await admin().from("repairs").select("id").eq("id", id)).data,
  ).toEqual([]);
  expect(harnessCount()).toBe(0);
  await control("reset");
}
const form = (page: Page) =>
  page
    .locator("form")
    .filter({ has: page.locator('input[name="old_status"]') });
async function open(page: Page, id: string) {
  await page.route("**/_vercel/**/script.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      "analytics-consent",
      JSON.stringify({
        value: "rejected",
        version: "repair-status-settlement",
        timestamp: new Date().toISOString(),
      }),
    ),
  );
  await loginLocalOwnerDirectly(page);
  await expect(page.locator("header h1").first()).toHaveText("Dashboard");
  await page.goto(`/repairs/${id}?q=retain-context`);
  await expect(
    form(page).getByRole("button", { name: "Log Status Change" }),
  ).toBeVisible();
}
async function select(page: Page, name: string) {
  await form(page)
    .getByRole("button", { name: "Update workflow status" })
    .click();
  await page.getByRole("option", { name, exact: true }).click();
}
function record(name: string, value: unknown) {
  if (!output) return;
  mkdirSync(output, { recursive: true });
  writeFileSync(
    `${output}/${name}.json`,
    JSON.stringify(value, null, 2) + "\n",
  );
}

for (const failure of [false, true]) {
  test(`${failure ? "audit warning" : "success"} settles before held repair reconciliation`, async ({
    page,
  }) => {
    await control("reset");
    expect(harnessCount()).toBe(0);
    const f = await fixture();
    const posts: number[] = [];
    const errors: string[] = [];
    let actionComplete = false;
    let responseText = "";
    let actionError: string | null = null;
    let finishResponse!: () => void;
    const response = new Promise<void>((resolve) => {
      finishResponse = resolve;
    });
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await open(page, f.id);
      if (failure) harness(f.id);
      await select(page, "In Progress (Repairing)");
      await form(page)
        .locator('[name="status_note"]')
        .fill("First intentional transition");
      page.on("request", (r) => {
        if (r.method() === "POST" && r.headers()["next-action"])
          posts.push(Date.now());
      });
      await page.route(`**/repairs/${f.id}?*`, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        try {
          const result = await route.fetch({ timeout: 0, maxRetries: 0 });
          expect(result.status()).toBe(200);
          const body = await result.body();
          responseText = body.toString();
          actionComplete = true;
          await route.fulfill({ response: result, body });
        } catch (error) {
          actionError = String(error);
          await route.abort();
        } finally {
          finishResponse();
        }
      });
      await control(`arm?repair=${f.id}`);
      await form(page)
        .getByRole("button", { name: "Log Status Change" })
        .click();
      await expect
        .poll(async () => (await control("status")).heldReads, {
          timeout: 30_000,
        })
        .toBeGreaterThan(0);
      const before = await truth(f.id);
      expect(before.repair.status).toBe("in_progress");
      expect(before.histories).toHaveLength(1);
      expect(before.audits).toHaveLength(failure ? 0 : 1);
      expect(before.histories[0]).toMatchObject({
        old_status: "received",
        new_status: "in_progress",
        changed_by: f.owner.id,
        note: "First intentional transition",
      });
      if (!failure)
        expect(before.audits[0]).toMatchObject({
          action: "repairs.status_changed",
          actor_id: f.owner.id,
          organization_id: LOCAL_QA_ORG_ID,
          branch_id: f.owner.branch_id,
          metadata: {
            repair_id: f.id,
            old_status: "received",
            new_status: "in_progress",
          },
        });
      expect(Number(before.repair.estimated_cost)).toBe(0);
      expect(Number(before.repair.final_cost)).toBe(0);
      expect(Number(before.repair.advance_paid)).toBe(0);
      const message = failure ? WARNING : SUCCESS;
      if (baseline) {
        await expect(
          form(page).getByRole("button", {
            name: "Updating status...",
            exact: true,
          }),
        ).toBeVisible();
        await expect(page.getByText(message, { exact: true })).toHaveCount(0);
      } else {
        await expect(page.getByText(message, { exact: true })).toBeVisible({
          timeout: 30_000,
        });
        await expect(form(page)).toHaveAttribute("aria-busy", "false");
        await expect(
          page.getByRole("button", { name: "Updating status...", exact: true }),
        ).toHaveCount(0);
        expect(actionComplete).toBe(true);
        expect(responseText).toContain(message);
        // A stale hidden old_status must not be resubmitted while fresh props are held.
        await form(page).evaluate((element: HTMLFormElement) => {
          element.requestSubmit();
          element.requestSubmit();
        });
      }
      expect(posts).toHaveLength(1);
      if (failure)
        await expect(page.getByText(SUCCESS, { exact: true })).toHaveCount(0);
      const held = await control("status");
      expect(held.blockReads).toBe(true);
      expect(held.updates).toBe(1);
      expect(held.histories).toBe(1);
      expect(held.auditAttempts).toBe(1);
      expect(held.audits).toBe(failure ? 0 : 1);
      if (output)
        await page.screenshot({
          path: `${output}/${failure ? "warning" : "success"}-held.png`,
          fullPage: true,
        });
      record(`${failure ? "warning" : "success"}-held`, {
        baseline,
        actionComplete,
        responseBytes: responseText.length,
        pending: await page
          .getByRole("button", { name: "Updating status...", exact: true })
          .isVisible(),
        messageVisible: await page
          .getByText(message, { exact: true })
          .isVisible(),
        posts: posts.length,
        held,
        truth: before,
      });
      await control("release");
      await response;
      expect(actionError).toBeNull();
      expect(actionComplete).toBe(true);
      expect(responseText).toContain(message);
      if (!baseline) {
        await expect(form(page).locator('[name="old_status"]')).toHaveValue(
          "in_progress",
          { timeout: 30_000 },
        );
        await expect(
          page.getByText("In Progress", { exact: true }).first(),
        ).toBeVisible();
        await expect(
          form(page).getByRole("button", { name: "Log Status Change" }),
        ).toBeEnabled();
        await expect(page).toHaveURL(/q=retain-context/);
        await expect(page.getByText(message, { exact: true })).toBeVisible();
        expect(posts).toHaveLength(1);
        if (!failure) {
          await control("reset");
          await select(page, "Ready for Delivery (Completed)");
          await form(page).locator('[name="final_cost"]').fill("125");
          await form(page)
            .locator('[name="status_note"]')
            .fill("Second intentional transition");
          await form(page)
            .getByRole("button", { name: "Log Status Change" })
            .click();
          await expect(form(page).locator('[name="old_status"]')).toHaveValue(
            "completed",
            { timeout: 30_000 },
          );
          await expect(
            page.getByText("Ready for Delivery", { exact: true }).first(),
          ).toBeVisible();
          const second = await truth(f.id);
          expect(second.histories).toHaveLength(2);
          expect(second.audits).toHaveLength(2);
          expect(posts).toHaveLength(2);
          expect(second.histories[1]).toMatchObject({
            old_status: "in_progress",
            new_status: "completed",
          });
          expect(Number(second.repair.final_cost)).toBe(125);
          expect(second.repair.delivered_at).toBeNull();
          record("later-transition", second);
        }
      }
      expect(errors).toEqual([]);
    } finally {
      await cleanup(f.id);
    }
  });
}

test("confirmed input and update errors settle without writes and permit correction", async ({
  page,
}) => {
  test.skip(
    baseline,
    "Causal baseline exercises the two held reconciliation cases only.",
  );
  await control("reset");
  const f = await fixture();
  let posts = 0;
  try {
    await open(page, f.id);
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"])
        posts++;
    });
    const initial = await truth(f.id);
    await form(page)
      .locator('[name="id"]')
      .evaluate((input: HTMLInputElement) => {
        input.value = "";
      });
    await form(page).getByRole("button", { name: "Log Status Change" }).click();
    await expect(
      page.getByText("Repair ID and status parameters are required.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      form(page).getByRole("button", { name: "Log Status Change" }),
    ).toBeEnabled();
    expect(await truth(f.id)).toEqual(initial);
    expect(posts).toBe(1);
    await form(page)
      .locator('[name="id"]')
      .evaluate((input: HTMLInputElement, id) => {
        input.value = id;
      }, f.id);
    await select(page, "In Progress (Repairing)");
    await control(`arm?repair=${f.id}&rejectUpdate=1`);
    await form(page).getByRole("button", { name: "Log Status Change" }).click();
    await expect(
      page.getByText(
        "We couldn't update the repair status. Please try again.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      form(page).getByRole("button", { name: "Log Status Change" }),
    ).toBeEnabled();
    expect(await truth(f.id)).toEqual(initial);
    expect(posts).toBe(2);
    await control("reset");
    await form(page).getByRole("button", { name: "Log Status Change" }).click();
    await expect(page.getByText(SUCCESS, { exact: true })).toBeVisible();
    await expect(form(page).locator('[name="old_status"]')).toHaveValue(
      "in_progress",
    );
    const corrected = await truth(f.id);
    expect(corrected.histories).toHaveLength(1);
    expect(corrected.audits).toHaveLength(1);
    expect(posts).toBe(3);
    record("confirmed-errors-and-correction", {
      ...corrected,
      posts,
      rejectedCalls: 2,
      successfulCalls: 1,
    });
  } finally {
    await cleanup(f.id);
  }
});
