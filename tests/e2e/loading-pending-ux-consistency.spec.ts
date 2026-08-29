import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getLocalAdminClient,
  isLocalPlaywrightRun,
  LOCAL_QA_ORG_ID,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const axePath = path.join(process.cwd(), "node_modules/axe-core/axe.min.js");
const password = "Password123!";
const ownerEmail = `loading-ux-${process.pid}@saledock.local`;

type AxeResult = {
  violations: Array<{
    id: string;
    impact: string | null;
    nodes: Array<{ target: unknown }>;
  }>;
};

let authAdmin: SupabaseClient;
let ownerId = "";

function localServiceClient() {
  const output = execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const status = JSON.parse(output.slice(output.indexOf("{"))) as {
    API_URL?: string;
    SERVICE_ROLE_KEY?: string;
  };
  if (
    !status.API_URL?.startsWith("http://127.0.0.1:") ||
    !status.SERVICE_ROLE_KEY
  ) {
    throw new Error("Loopback Supabase is required for loading UX E2E.");
  }
  return createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function localPostgrestContainer() {
  const containers = execFileSync(
    "docker",
    ["ps", "--format", "{{.Names}}", "--filter", "name=supabase_rest_"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);

  if (containers.length !== 1) {
    throw new Error(
      `Expected one loopback PostgREST container, found ${containers.length}.`,
    );
  }

  return containers[0];
}

async function runAxe(page: Page, region: Locator): Promise<AxeResult> {
  await page.addScriptTag({ path: axePath });
  return region.evaluate(async (element) => {
    return (
      window as typeof window & {
        axe: {
          run: (context: Element, options: unknown) => Promise<AxeResult>;
        };
      }
    ).axe.run(element, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
  });
}

async function rejectOptionalCookies(page: Page) {
  const reject = page.getByRole("button", {
    name: "Reject optional cookies",
    exact: true,
  });
  if (await reject.isVisible().catch(() => false)) await reject.click();
}

test.describe("loading and pending UX consistency", () => {
  test.describe.configure({ mode: "serial", retries: 0 });
  test.skip(
    !isLocalPlaywrightRun(),
    "Loading UX E2E is restricted to loopback environments.",
  );

  test.beforeAll(async () => {
    authAdmin = localServiceClient();
    const { data: auth, error: authError } =
      await authAdmin.auth.admin.createUser({
        email: ownerEmail,
        password,
        email_confirm: true,
      });
    if (authError || !auth.user)
      throw new Error(
        `Could not create local loading UX owner: ${authError?.message}`,
      );
    ownerId = auth.user.id;

    const admin = getLocalAdminClient();
    const { data: branch, error: branchError } = await admin
      .from("branches")
      .select("id")
      .eq("organization_id", LOCAL_QA_ORG_ID)
      .limit(1)
      .single();
    if (branchError || !branch?.id)
      throw new Error("Local loading UX branch fixture is unavailable.");

    const { error: profileError } = await admin.from("profiles").insert({
      id: ownerId,
      organization_id: LOCAL_QA_ORG_ID,
      branch_id: branch.id,
      full_name: "Loading UX Owner",
      role: "owner",
      is_active: true,
      onboarding_completed: true,
    });
    if (profileError)
      throw new Error(
        `Could not create local loading UX profile: ${profileError.message}`,
      );
  });

  test.afterAll(async () => {
    if (!ownerId) return;
    const admin = getLocalAdminClient();
    await admin.from("profiles").delete().eq("id", ownerId);
    await authAdmin.auth.admin.deleteUser(ownerId);
  });

  test("destination skeleton streams immediately and stays accessible", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await loginLocalOwnerDirectly(page, ownerEmail, password);
    await rejectOptionalCookies(page);

    await page.goto("/suppliers/purchases");
    const postgrestContainer = localPostgrestContainer();
    execFileSync("docker", ["pause", postgrestContainer]);

    let navigation: Promise<unknown> | undefined;
    try {
      navigation = page.goto(
        `/suppliers/purchases/new?loading_ux=${randomUUID()}`,
      );

      const busyMain = page
        .getByText("Loading Record purchase.", { exact: true })
        .locator("xpath=ancestor::main");
      await expect(busyMain).toBeVisible();
      await expect(busyMain.getByRole("status")).toHaveText(
        "Loading Record purchase.",
      );
      await expect(
        busyMain.locator('[aria-hidden="true"]').first(),
      ).toBeVisible();
      expect(
        await busyMain.locator("button, a, input, select, textarea").count(),
      ).toBe(0);

      const animationNames = await busyMain
        .locator(".animate-pulse")
        .evaluateAll((elements) =>
          elements.map((element) => getComputedStyle(element).animationName),
        );
      expect(new Set(animationNames)).toEqual(new Set(["none"]));

      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await page.evaluate(
          (dark) => document.documentElement.classList.toggle("dark", dark),
          colorScheme === "dark",
        );
        const loadingAxe = await runAxe(page, busyMain);
        expect(loadingAxe.violations).toEqual([]);
      }
    } finally {
      execFileSync("docker", ["unpause", postgrestContainer]);
    }

    await navigation;
    await page.waitForURL(/\/suppliers\/purchases\/new(?:\?|$)/);
    await expect(
      page.getByRole("heading", { name: "Record purchase" }),
    ).toBeVisible();
  });

  test("archive pending state blocks duplicates and clears after a no-op response", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginLocalOwnerDirectly(page, ownerEmail, password);
    await rejectOptionalCookies(page);
    await page.goto("/products?tab=products");

    const productName = "iPhone 15 Pro Max Clear Case";
    const row = page.locator("tr").filter({ hasText: productName }).first();
    await expect(row).toBeVisible();
    const form = row
      .locator('input[name="id"]')
      .last()
      .locator("xpath=ancestor::form");
    const archiveButton = form.getByRole("button", {
      name: "Archive",
      exact: true,
    });
    await form.locator('input[name="id"]').evaluate((input, id) => {
      (input as HTMLInputElement).value = id;
    }, randomUUID());

    let posts = 0;
    let releaseResponse = () => {};
    let markPostSeen = () => {};
    const postSeen = new Promise<void>((resolve) => {
      markPostSeen = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });

    await page.route("**/products**", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts += 1;
      const response = await route.fetch();
      markPostSeen();
      await release;
      await route.fulfill({ response });
    });

    await archiveButton.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await postSeen;

    const pendingButton = form.getByRole("button", {
      name: "Archiving...",
      exact: true,
    });
    await expect(pendingButton).toBeVisible();
    await expect(pendingButton).toBeDisabled();
    await pendingButton.evaluate((button) =>
      (button as HTMLButtonElement).click(),
    );
    expect(posts).toBe(1);

    releaseResponse();
    await expect(archiveButton).toBeVisible();
    await expect(archiveButton).toBeEnabled();
    expect(posts).toBe(1);

    const admin = getLocalAdminClient();
    const { data: product, error } = await admin
      .from("products")
      .select("is_active")
      .eq("id", "00000000-0000-4000-8000-000000003001")
      .single();
    if (error)
      throw new Error(`Seed product safety check failed: ${error.message}`);
    expect(product?.is_active).toBe(true);
  });

  test("responsive light and dark views remain overflow-free", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginLocalOwnerDirectly(page, ownerEmail, password);
    await rejectOptionalCookies(page);
    await page.goto("/suppliers/purchases/new");
    await expect(
      page.getByRole("heading", { name: "Record purchase" }),
    ).toBeVisible();

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
    }

    const themeBackgrounds: string[] = [];
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        colorScheme === "dark",
      );
      await expect(page.locator("html")).toHaveClass(
        colorScheme === "dark" ? /dark/ : /^(?!.*\bdark\b)/,
      );
      themeBackgrounds.push(
        await page
          .locator("[data-app-shell-root]")
          .evaluate((element) => getComputedStyle(element).backgroundColor),
      );
    }
    expect(new Set(themeBackgrounds).size).toBe(2);
  });
});
