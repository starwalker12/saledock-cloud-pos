import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { getLocalAdminClient, isLocalPlaywrightRun, LOCAL_QA_ORG_ID, loginLocalOwnerDirectly } from "./helpers/local-supabase";

const proxy = process.env.REPAIR_SAVE_PROXY_URL;
const output = process.env.REPAIR_SAVE_EVIDENCE_DIR;
const baseline = process.env.REPAIR_SAVE_SOURCE_STATE === "baseline";
const serverOnly = process.env.REPAIR_SAVE_SOURCE_STATE === "server-only";
const AUDIT_WARNING = "The repair was saved, but its audit record could not be confirmed. Do not submit it again. Refresh the page and contact an administrator.";
const HISTORY_WARNING = "The repair was saved, but its initial status history could not be confirmed. Do not submit it again. Refresh the page and contact an administrator.";
const admin = () => getLocalAdminClient();
test.describe.configure({ mode: "serial", retries: 0 });
test.use({ trace: "off", video: "off", screenshot: "off" });
test.skip(!isLocalPlaywrightRun() || !proxy, "Requires isolated loopback save proxy");
test.setTimeout(90_000);

async function control(command: string) {
  if (!proxy || !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(proxy)) throw new Error("Loopback proxy required");
  const response = await fetch(`${proxy}/__qa/${command}`, { method: command === "status" ? "GET" : "POST" });
  expect(response.ok).toBe(true);
  return response.json();
}
function sql(query: string) {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" }).split("\n").filter(n => n.startsWith("supabase_db_"));
  expect(names).toHaveLength(1);
  return execFileSync("docker", ["exec", names[0], "psql", "-U", "postgres", "-d", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" }).trim();
}
function harnessCount() {
  return Number(sql("select (select count(*) from pg_trigger where tgname='qa_repair_save_settlement' and not tgisinternal)+(select count(*) from pg_proc where proname='qa_repair_save_settlement')"));
}
function removeHarness() {
  sql("drop trigger if exists qa_repair_save_settlement on public.audit_logs; drop trigger if exists qa_repair_save_settlement on public.repair_status_history; drop function if exists public.qa_repair_save_settlement();");
}
function failInsert(marker: string, history: boolean) {
  expect(marker).toMatch(/^QA-SAVE-[0-9a-f-]{36}$/);
  const table = history ? "repair_status_history" : "audit_logs";
  const condition = history ? `new.note='${marker}'` : `new.action in ('repairs.created','repairs.updated') and new.metadata->>'customer_name'='${marker}'`;
  sql(`create function public.qa_repair_save_settlement() returns trigger language plpgsql as $$ begin if ${condition} then raise exception 'QA forced save truth failure'; end if; return new; end $$; create trigger qa_repair_save_settlement before insert on public.${table} for each row execute function public.qa_repair_save_settlement();`);
}
async function fixture(edit: boolean) {
  const marker = `QA-SAVE-${randomUUID()}`, id = randomUUID(), customerId = randomUUID();
  const owner = await admin().from("profiles").select("id,branch_id").eq("organization_id", LOCAL_QA_ORG_ID).eq("role", "owner").eq("is_active", true).single();
  expect(owner.error).toBeNull();
  expect((await admin().from("customers").insert({ id: customerId, organization_id: LOCAL_QA_ORG_ID, name: marker })).error).toBeNull();
  if (edit) expect((await admin().from("repairs").insert({ id, organization_id: LOCAL_QA_ORG_ID, branch_id: owner.data!.branch_id, created_by: owner.data!.id,
    job_no: `QA-${id.slice(0, 8)}`, customer_id: customerId, customer_name: marker, device_type: "Mobile", problem_description: "Local save proof", status: "received", estimated_cost: 0, final_cost: 0, advance_paid: 0, payment_method: "cash" })).error).toBeNull();
  return { id: edit ? id : null, marker, customerId, owner: owner.data! };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function truth(f: Fixture) {
  const repairs = await admin().from("repairs").select("id,job_no,customer_id,customer_name,notes,status,estimated_cost,final_cost,advance_paid").eq("organization_id", LOCAL_QA_ORG_ID).eq("customer_name", f.marker);
  expect(repairs.error).toBeNull();
  const id = repairs.data?.[0]?.id;
  if (!id) return { repairs: [], histories: [], audits: [] };
  const histories = await admin().from("repair_status_history").select("id,old_status,new_status,note,changed_by").eq("repair_id", id);
  const audits = await admin().from("audit_logs").select("id,actor_id,organization_id,branch_id,action,details,metadata").contains("metadata", { repair_id: id });
  expect(histories.error).toBeNull(); expect(audits.error).toBeNull();
  return { repairs: repairs.data!, histories: histories.data!, audits: audits.data! };
}
async function cleanup(f: Fixture) {
  await control("release"); removeHarness();
  const rows = await truth(f);
  for (const repair of rows.repairs) {
    expect((await admin().from("audit_logs").delete().contains("metadata", { repair_id: repair.id })).error).toBeNull();
    expect((await admin().from("repair_status_history").delete().eq("repair_id", repair.id)).error).toBeNull();
    expect((await admin().from("repairs").delete().eq("id", repair.id)).error).toBeNull();
  }
  expect((await admin().from("customers").delete().eq("id", f.customerId)).error).toBeNull();
  expect((await truth(f)).repairs).toHaveLength(0);
  expect(harnessCount()).toBe(0);
  await control("reset");
}
const form = (page: Page) => page.locator("form").filter({ has: page.locator('[name="problem_description"]') });
async function open(page: Page, f: Fixture) {
  await page.route("**/_vercel/**/script.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.addInitScript(() => localStorage.setItem("analytics-consent", JSON.stringify({ value: "rejected", version: "repair-save-settlement", timestamp: new Date().toISOString() })));
  await loginLocalOwnerDirectly(page);
  await expect(page.locator("header h1").first()).toHaveText("Dashboard");
  await page.goto(f.id ? `/repairs?edit=${f.id}` : "/repairs?add=1");
  await expect(form(page).getByRole("button", { name: f.id ? "Update Details" : "Record Intake", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  if (!f.id) {
    await form(page).getByPlaceholder("Search by name or phone...").fill(f.marker);
    await form(page).getByRole("button", { name: f.marker, exact: true }).click();
    await form(page).locator('[name="problem_description"]').fill("Local save proof");
  }
  await form(page).locator('[name="notes"]').fill(f.marker);
}
function record(name: string, value: unknown) {
  if (!output) return;
  mkdirSync(output, { recursive: true });
  writeFileSync(`${output}/${name}.json`, JSON.stringify(value, null, 2) + "\n");
}

for (const edit of [false, true]) for (const failure of ["none", "audit", ...(edit ? [] : ["history"])]) {
  test(`${edit ? "edit" : "create"} ${failure === "none" ? "success" : failure + " warning"} settles before reconciliation`, async ({ page }) => {
    test.skip(baseline && failure !== "none", "Baseline causal proof covers successful create and edit");
    await control("reset"); expect(harnessCount()).toBe(0);
    const f = await fixture(edit);
    let posts = 0, savePosts = 0, closePosts = 0, actionComplete = false, responseText = "", actionError: string | null = null;
    let finish!: () => void;
    let warningRead: Promise<void> | undefined;
    const responseFinished = new Promise<void>(resolve => { finish = resolve; });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await open(page, f);
      if (failure !== "none") failInsert(f.marker, failure === "history");
      page.on("request", request => {
        if (request.method() !== "POST" || !request.headers()["next-action"]) return;
        posts++;
        if (request.headers()["content-type"]?.startsWith("multipart/form-data")) savePosts++; else closePosts++;
      });
      await page.route("**/repairs?*", async route => {
        const request = route.request();
        if (request.method() !== "POST" || !request.headers()["content-type"]?.startsWith("multipart/form-data")) return route.continue();
        try {
          const response = await route.fetch({ timeout: 0, maxRetries: 0 });
          expect(response.status()).toBe(200);
          const body = await response.body();
          responseText = body.toString(); actionComplete = true;
          await route.fulfill({ response, body });
        } catch (error) { actionError = String(error); await route.abort(); }
        finally { finish(); }
      });
      await control(`arm?marker=${f.marker}${f.id ? `&repair=${f.id}` : ""}`);
      await form(page).getByRole("button", { name: edit ? "Update Details" : "Record Intake", exact: true }).click();
      await expect.poll(async () => (await control("status")).blockReads).toBe(true);
      if (!baseline && !serverOnly && failure !== "none") {
        // Warnings deliberately stay open. Hold an independent, read-only RSC probe without navigating that form.
        const url = new URL(page.url());
        url.searchParams.set("saveproof", randomUUID());
        warningRead = page.request.get(url.toString(), { headers: { RSC: "1" }, timeout: 0 }).then(response => {
          expect(response.status()).toBe(200);
        });
        await expect.poll(async () => (await control("status")).heldReads).toBeGreaterThan(0);
      }
      if (baseline) await expect.poll(async () => (await control("status")).heldReads).toBeGreaterThan(0);
      const before = await truth(f);
      expect(before.repairs).toHaveLength(1);
      expect(before.histories).toHaveLength(edit || failure === "history" ? 0 : 1);
      expect(before.audits).toHaveLength(failure === "none" ? 1 : 0);
      expect(before.repairs[0]).toMatchObject({ customer_id: f.customerId, notes: f.marker, status: "received", estimated_cost: 0, final_cost: 0, advance_paid: 0 });
      if (!edit && failure !== "history") expect(before.histories[0]).toMatchObject({ old_status: null, new_status: "received", note: f.marker, changed_by: f.owner.id });
      if (failure === "none") expect(before.audits[0]).toMatchObject({ actor_id: f.owner.id, organization_id: LOCAL_QA_ORG_ID, branch_id: f.owner.branch_id,
        action: edit ? "repairs.updated" : "repairs.created", details: `${edit ? "Updated" : "Created"} repair: ${f.marker} - Mobile`,
        metadata: { repair_id: before.repairs[0].id, customer_name: f.marker, device_type: "Mobile" } });
      const message = failure === "history" ? HISTORY_WARNING : failure === "audit" ? AUDIT_WARNING : edit ? "Repair job updated." : "Repair job created.";
      if (baseline) {
        await expect(form(page).getByRole("button", { name: "Saving...", exact: true })).toBeDisabled();
        expect(actionComplete).toBe(false);
      } else {
        await expect.poll(() => actionComplete, { timeout: 10_000 }).toBe(true);
        expect(responseText).toContain(message);
        await expect(page.getByRole("button", { name: "Saving...", exact: true })).toHaveCount(0);
        if (failure !== "none" || !serverOnly) await expect(page.getByText(message, { exact: true })).toBeVisible();
        if (!serverOnly) expect(posts).toBe(1);
        if (!serverOnly) {
          await expect(form(page)).toHaveAttribute("aria-busy", "false");
          await expect(form(page).getByRole("button", { name: edit ? "Update Details" : "Record Intake", exact: true })).toBeDisabled();
          // Even a second submit event must not repeat an already committed save.
          await form(page).evaluate(element => (element as HTMLFormElement).requestSubmit());
          if (failure === "none") await expect.poll(async () => (await control("status")).heldReads).toBeGreaterThan(0);
        }
      }
      const held = await control("status");
      expect(held.blockReads).toBe(true);
      expect(held.inserts).toBe(edit ? 0 : 1); expect(held.updates).toBe(edit ? 1 : 0);
      expect(held.histories).toBe(edit || failure === "history" ? 0 : 1);
      expect(held.auditAttempts).toBe(failure === "history" ? 0 : 1);
      expect(held.audits).toBe(failure === "none" ? 1 : 0);
      expect(savePosts).toBe(1);
      if (failure !== "none") await expect(page.getByText(edit ? "Repair job updated." : "Repair job created.", { exact: true })).toHaveCount(0);
      if (output) await page.screenshot({ path: `${output}/${edit ? "edit" : "create"}-${failure}-held.png` });
      record(`${edit ? "edit" : "create"}-${failure}-held`, { baseline, serverOnly, warningReadProbe: Boolean(warningRead), actionComplete, posts, savePosts, closePosts, pending: await page.getByRole("button", { name: "Saving...", exact: true }).isVisible(), messageVisible: await page.getByText(message, { exact: true }).isVisible(), held, truth: before });
      await control("release"); await responseFinished;
      await warningRead;
      expect(actionError).toBeNull(); expect(actionComplete).toBe(true); expect(responseText).toContain(message);
      if (!baseline && !serverOnly && failure === "none") {
        await expect(form(page)).toHaveCount(0);
        await expect(page.getByText(before.repairs[0].job_no, { exact: true }).first()).toBeVisible();
      }
      if (!baseline && !serverOnly) expect(posts).toBe(1);
      expect(errors).toEqual([]);
    } finally { await control("release"); await warningRead; await cleanup(f); }
  });
}

for (const kind of ["validation", "customer", "insert", "update"]) {
  test(`${kind} error settles without writes and permits an intentional corrected retry`, async ({ page }) => {
    test.skip(baseline || serverOnly, "Final error-path acceptance");
    await control("reset"); expect(harnessCount()).toBe(0);
    const edit = kind === "update";
    const f = await fixture(edit);
    let posts = 0;
    try {
      await open(page, f);
      const original = await truth(f);
      if (kind === "validation") {
        await form(page).evaluate(element => { (element as HTMLFormElement).noValidate = true; });
        await form(page).locator('[name="problem_description"]').fill("");
      }
      if (kind === "customer") await form(page).locator('[name="customer_id"]').evaluate((element, id) => { (element as HTMLInputElement).value = id; }, randomUUID());
      await control(`arm?marker=${f.marker}${f.id ? `&repair=${f.id}` : ""}${kind === "insert" || edit ? "&rejectWrite=1" : ""}`);
      page.on("request", request => { if (request.method() === "POST" && request.headers()["next-action"]) posts++; });
      const submit = form(page).getByRole("button", { name: edit ? "Update Details" : "Record Intake", exact: true });
      await submit.click();
      const message = kind === "validation" ? "Problem description is required." : kind === "customer" ? "The selected customer is unavailable." : edit ? "We couldn't save this repair. Please try again." : "We couldn't save this repair job. Please try again.";
      await expect(form(page).getByRole("alert")).toHaveText(message);
      await expect(submit).toBeEnabled();
      await expect(form(page)).toHaveAttribute("aria-busy", "false");
      expect(await truth(f)).toEqual(original);
      expect(posts).toBe(1);
      const failed = await control("status");
      expect([failed.inserts, failed.updates, failed.histories, failed.audits]).toEqual([0, 0, 0, 0]);
      record(`${kind}-no-write`, { posts, pending: false, message, counts: failed, unchanged: true });
      // React resets uncontrolled inputs after an Action result; the operator corrects them explicitly.
      await form(page).locator('[name="problem_description"]').fill("Corrected local input");
      await form(page).locator('[name="notes"]').fill(f.marker);
      if (kind === "customer") await form(page).locator('[name="customer_id"]').evaluate((element, id) => { (element as HTMLInputElement).value = id; }, f.customerId);
      await control(`arm?marker=${f.marker}${f.id ? `&repair=${f.id}` : ""}`);
      await submit.click();
      await expect(form(page).getByRole("status")).toHaveText(edit ? "Repair job updated." : "Repair job created.");
      expect(posts).toBe(2);
      const saved = await truth(f);
      expect(saved.repairs).toHaveLength(1); expect(saved.audits).toHaveLength(1); expect(saved.histories).toHaveLength(edit ? 0 : 1);
      await control("release");
      await expect(form(page)).toHaveCount(0);
      expect(posts).toBe(2);
    } finally { await cleanup(f); }
  });
}
