import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import {
  isLocalPlaywrightRun,
  SEEDED_PHYSICAL_PRODUCT_ID,
} from "./helpers/local-supabase";

const OWNER_EMAIL = "owner@saledock.local";
const LOCAL_PASSWORD = "Password123!";
const ARTIFACT_DIR =
  process.env.SALEDOCK_PRINT_ARTIFACT_DIR || "/tmp/saledock-cookie-banner-print-output";
const SUPABASE_COOKIE_CHUNK_SIZE = 3180;

type LocalStatus = {
  ANON_KEY?: string;
  API_URL?: string;
  anonKey?: string;
  apiUrl?: string;
  anon_key?: string;
  api_url?: string;
};

function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function readLocalSupabaseStatus(): LocalStatus {
  const output = execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const jsonStart = output.indexOf("{");
  if (jsonStart < 0) throw new Error("Local Supabase status did not return JSON.");
  return JSON.parse(output.slice(jsonStart)) as LocalStatus;
}

function chunkCookieValue(key: string, value: string) {
  if (value.length <= SUPABASE_COOKIE_CHUNK_SIZE) {
    return [{ name: key, value }];
  }

  const chunks: Array<{ name: string; value: string }> = [];
  for (let i = 0; i < value.length; i += SUPABASE_COOKIE_CHUNK_SIZE) {
    chunks.push({
      name: `${key}.${chunks.length}`,
      value: value.slice(i, i + SUPABASE_COOKIE_CHUNK_SIZE),
    });
  }
  return chunks;
}

async function prepareLocalOwnerQaState() {
  try {
    // Local reset fixtures can miss REST grants; keep this strictly local so
    // the browser proof exercises the app without touching production.
    [
      "grant usage on schema public to authenticated, service_role;",
      "grant select, insert, update, delete on all tables in schema public to authenticated, service_role;",
      "grant usage, select, update on all sequences in schema public to authenticated, service_role;",
    ].forEach((statement) => {
      execFileSync("supabase", ["db", "query", "--local", statement], {
        stdio: "ignore",
      });
    });
    execFileSync(
      "supabase",
      [
        "db",
        "query",
        "--local",
        `
          delete from public.user_ui_preferences
          where user_id in (
            select id
            from public.profiles
            where role = 'owner'
            and full_name = 'Demo Owner'
          );
        `,
      ],
      { stdio: "ignore" },
    );
    execFileSync(
      "supabase",
      [
        "db",
        "query",
        "--local",
        `
          delete from public.onboarding_drafts
          where user_id in (
            select id
            from public.profiles
            where role = 'owner'
            and full_name = 'Demo Owner'
          );
        `,
      ],
      { stdio: "ignore" },
    );
  } catch {
    throw new Error("Local owner QA state could not be cleared for print QA.");
  }
}

async function loginWithLocalOwner(page: Page) {
  const status = readLocalSupabaseStatus();
  const supabaseUrl = status.API_URL ?? status.apiUrl ?? status.api_url ?? "";
  const anonKey = status.ANON_KEY ?? status.anonKey ?? status.anon_key ?? "";
  const appUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

  if (!isLocalUrl(supabaseUrl) || !isLocalUrl(appUrl) || !anonKey) {
    throw new Error("Local owner print QA requires local app and local Supabase URLs.");
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: OWNER_EMAIL,
    password: LOCAL_PASSWORD,
  });

  if (error || !data.session) {
    throw new Error("Local owner session could not be created for print QA.");
  }

  const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  const cookieValue =
    "base64-" + Buffer.from(JSON.stringify(data.session), "utf8").toString("base64url");

  await page.context().clearCookies();
  await page.context().addCookies(
    chunkCookieValue(storageKey, cookieValue).map((cookie) => ({
      ...cookie,
      url: appUrl,
      sameSite: "Lax" as const,
      httpOnly: false,
      secure: false,
    })),
  );

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 20_000 });
}

test("cookie consent banner is visible on screen but hidden in invoice print/PDF output", async ({
  page,
}) => {
  test.skip(!isLocalPlaywrightRun(), "Print consent QA only runs against localhost.");
  test.setTimeout(150_000);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await prepareLocalOwnerQaState();

  const nativeDialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    nativeDialogs.push(dialog.message());
    await dialog.dismiss();
  });

  await loginWithLocalOwner(page);
  await page.goto("/pos");
  await expect(page).toHaveURL(/\/pos(?:\?|$)/);

  await page
    .locator(`[data-testid="pos-product-btn"][data-product-id="${SEEDED_PHYSICAL_PRODUCT_ID}"]`)
    .click();
  await page.locator('[data-testid="pos-exact-tender-btn"]').click();
  await page
    .locator('[data-testid="pos-note-input"]')
    .fill(`QA cookie print ${Date.now()}`);
  await page.locator('[data-testid="pos-checkout-btn"]').click();
  await expect(page.getByText(/Sale recorded as INV-/)).toBeVisible({ timeout: 20_000 });

  const invoiceLink = page.getByRole("link", { name: /Open invoice/i });
  await expect(invoiceLink).toBeVisible();
  const invoiceHref = await invoiceLink.getAttribute("href");
  expect(invoiceHref).toBeTruthy();

  await page.goto(invoiceHref!);
  await expect(page.locator("#invoice-print")).toBeVisible();
  await page.evaluate(() => {
    localStorage.removeItem("analytics-consent");
    localStorage.removeItem("analytics-notice-dismissed");
    localStorage.removeItem("saledock-sidebar-preferences-v1");
    sessionStorage.clear();
  });
  await page.reload();

  const banner = page.getByTestId("cookie-consent-banner");
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await expect(banner.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
    "href",
    "/privacy",
  );

  await expect(page.locator("#invoice-print")).toContainText("Subtotal");
  await expect(page.locator("#invoice-print")).toContainText("Grand total");
  await expect(page.locator("#invoice-print")).toContainText("Paid");
  await expect(page.locator("#invoice-print")).toContainText("Payment");
  await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Build Error/i);

  await page.emulateMedia({ media: "print" });
  await expect(banner).toBeHidden();
  await expect(page.locator("#invoice-print").getByText("Subtotal").first()).toBeVisible();
  await expect(page.locator("#invoice-print").getByText("Grand total").first()).toBeVisible();
  await expect(page.locator("#invoice-print").getByText("Paid").first()).toBeVisible();
  await expect(page.locator("#invoice-print").getByText("Payment").first()).toBeVisible();
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "invoice-a4-print-media-after-fix.png"),
    fullPage: true,
  });
  await page.pdf({
    path: path.join(ARTIFACT_DIR, "invoice-a4-print-after-fix.pdf"),
    format: "A4",
    printBackground: true,
  });

  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
  });
  await page.emulateMedia({ media: "print", colorScheme: "dark" });
  await expect(banner).toBeHidden();
  await expect(page.locator("#invoice-print").getByText("Grand total").first()).toBeVisible();
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "invoice-a4-dark-print-media-after-fix.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
  });
  await page.emulateMedia({ media: "print", colorScheme: "light" });

  await page.evaluate(() => {
    document.body.dataset.printMode = "thermal";
  });
  await expect(banner).toBeHidden();
  await expect(page.locator(".thermal-print").first()).toBeVisible();
  await expect(page.locator(".thermal-print").first().getByText("Grand total")).toBeVisible();
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "invoice-thermal-print-media-after-fix.png"),
    fullPage: true,
  });
  await page.pdf({
    path: path.join(ARTIFACT_DIR, "invoice-thermal-print-after-fix.pdf"),
    width: "80mm",
    height: "220mm",
    printBackground: true,
  });
  await page.evaluate(() => {
    delete document.body.dataset.printMode;
  });

  await page.emulateMedia({ media: "screen" });
  await expect(banner).toBeVisible();

  expect(nativeDialogs).toEqual([]);
});
