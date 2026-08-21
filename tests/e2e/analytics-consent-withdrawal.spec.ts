import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  isLocalPlaywrightRun,
  loginLocalOwnerDirectly,
} from "./helpers/local-supabase";

const GA_MEASUREMENT_ID = "G-TESTMEASUREMENT";

type VendorEvent = {
  type: string;
  value?: string;
};

function requireLocalRun() {
  if (!isLocalPlaywrightRun()) {
    throw new Error("Analytics withdrawal QA is restricted to local SaleDock.");
  }
}

async function installAnalyticsMocks(page: Page) {
  const cloudflareRequests: string[] = [];
  const gaScriptRequests: string[] = [];
  const clarityScriptRequests: string[] = [];
  const gaCompletedSequences: number[] = [];
  const clarityCompletedSequences: number[] = [];

  await page.addInitScript((measurementId) => {
    const runtime = window as typeof window & {
      __recordAnalyticsEvent?: (event: VendorEvent) => number;
    };
    const record = (event: VendorEvent) => {
      const events = JSON.parse(
        localStorage.getItem("__analyticsVendorEvents") || "[]",
      ) as VendorEvent[];
      events.push(event);
      localStorage.setItem("__analyticsVendorEvents", JSON.stringify(events));
      return events.length - 1;
    };
    runtime.__recordAnalyticsEvent = record;

    let disabled = false;
    Object.defineProperty(window, `ga-disable-${measurementId}`, {
      configurable: true,
      get: () => disabled,
      set: (value) => {
        disabled = value === true;
        record({ type: "ga-disable", value: String(disabled) });
      },
    });

    const descriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "cookie",
    );
    if (!descriptor?.get || !descriptor?.set) return;
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get() {
        return descriptor.get?.call(document) ?? "";
      },
      set(value) {
        record({ type: "cookie-write", value });
        descriptor.set?.call(document, value);
      },
    });
  }, GA_MEASUREMENT_ID);

  await page.route(
    "https://www.googletagmanager.com/gtag/js*",
    async (route) => {
      gaScriptRequests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `
        (function () {
          var record = window.__recordAnalyticsEvent;
          var denied = false;
          var dataLayer = window.dataLayer = window.dataLayer || [];
          var nativePush = dataLayer.push.bind(dataLayer);
          function process(entry) {
            var args = Array.from(entry || []);
            if (args[0] === "consent" && args[1] === "update" && args[2] && args[2].analytics_storage === "denied") {
              denied = true;
              record({ type: "ga-consent-denied" });
            }
          }
          dataLayer.forEach(process);
          dataLayer.push = function () {
            Array.from(arguments).forEach(process);
            return nativePush.apply(dataLayer, arguments);
          };
          record({ type: "ga-loaded" });
          window.__gaMockTimer = setInterval(function () {
            if (window["ga-disable-${GA_MEASUREMENT_ID}"] === true || denied) return;
            document.cookie = "_ga=GA1.1.local; Path=/; SameSite=Lax";
            document.cookie = "_ga_TESTMEASUREMENT=GS1.1.local; Path=/; SameSite=Lax";
            var sequence = record({ type: "ga-network" });
            fetch("/__analytics-test/ga-hit?sequence=" + sequence);
          }, 10);
        })();
      `,
      });
    },
  );

  await page.route("https://www.clarity.ms/tag/*", async (route) => {
    clarityScriptRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        (function () {
          var record = window.__recordAnalyticsEvent;
          var queued = (window.clarity && window.clarity.q) || [];
          var denied = false;
          window.clarity = function () {
            var args = Array.from(arguments);
            if (args[0] === "consentv2" && args[1] && args[1].ad_Storage === "denied" && args[1].analytics_Storage === "denied") {
              denied = true;
              record({ type: "clarity-consent-denied" });
            }
          };
          queued.forEach(function (args) { window.clarity.apply(window, args); });
          record({ type: "clarity-loaded" });
          window.__clarityMockTimer = setInterval(function () {
            if (denied) return;
            document.cookie = "_clck=local; Path=/; SameSite=Lax";
            document.cookie = "_clsk=local; Path=/; SameSite=Lax";
            var sequence = record({ type: "clarity-network" });
            fetch("/__analytics-test/clarity-hit?sequence=" + sequence);
          }, 10);
        })();
      `,
    });
  });

  await page.route(
    "https://static.cloudflareinsights.com/beacon.min.js*",
    async (route) => {
      cloudflareRequests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        headers: { "access-control-allow-origin": "*" },
        body: "window.__cloudflareAnalyticsLoads = (window.__cloudflareAnalyticsLoads || 0) + 1;",
      });
    },
  );

  await page.route("**/__analytics-test/ga-hit*", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
  await page.route("**/__analytics-test/clarity-hit*", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
  page.on("response", (response) => {
    const url = new URL(response.url());
    const sequence = Number(url.searchParams.get("sequence"));
    if (!Number.isInteger(sequence) || response.status() !== 204) return;
    if (url.pathname === "/__analytics-test/ga-hit") {
      gaCompletedSequences.push(sequence);
    }
    if (url.pathname === "/__analytics-test/clarity-hit") {
      clarityCompletedSequences.push(sequence);
    }
  });

  return {
    cloudflareRequests,
    gaScriptRequests,
    clarityScriptRequests,
    gaCompletedSequences,
    clarityCompletedSequences,
  };
}

function analyticsCookieNames(context: BrowserContext) {
  return context.cookies().then((cookies) =>
    cookies
      .filter(
        ({ name }) =>
          name === "_ga" ||
          name.startsWith("_ga_") ||
          name === "_clck" ||
          name === "_clsk",
      )
      .map(({ name, domain, path, secure, sameSite }) => ({
        name,
        domain,
        path,
        secure,
        sameSite,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
}

async function vendorEvents(page: Page): Promise<VendorEvent[]> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("__analyticsVendorEvents") || "[]"),
  );
}

function firstEventIndex(events: VendorEvent[], type: string) {
  return events.findIndex((event) => event.type === type);
}

function firstCookieDeletionIndex(
  events: VendorEvent[],
  name: string,
  startIndex = 0,
) {
  const relativeIndex = events
    .slice(startIndex)
    .findIndex(
      ({ type, value }) =>
        type === "cookie-write" &&
        value?.startsWith(`${name}=`) &&
        value.includes("Max-Age=0"),
    );
  return relativeIndex < 0 ? -1 : startIndex + relativeIndex;
}

test.beforeEach(() => {
  requireLocalRun();
});

test("GA4, Clarity, and Cloudflare follow durable anonymous Analytics consent", async ({
  page,
  context,
}) => {
  const requests = await installAnalyticsMocks(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const banner = page.getByTestId("cookie-consent-banner");
  await expect(banner).toBeVisible();
  await expect(page.locator('script[id^="google-analytics"]')).toHaveCount(0);
  await expect(page.locator("script#microsoft-clarity")).toHaveCount(0);
  await expect(page.locator("script#cloudflare-web-analytics")).toHaveCount(0);

  await page.getByRole("button", { name: "Reject optional cookies" }).click();
  await expect(banner).not.toBeVisible();
  expect(requests.gaScriptRequests).toEqual([]);
  expect(requests.clarityScriptRequests).toEqual([]);
  expect(requests.cloudflareRequests).toEqual([]);

  await page.evaluate(() =>
    window.dispatchEvent(new Event("saledock:open-cookie-settings")),
  );
  await page
    .getByRole("checkbox", { name: "Marketing and advertising cookies" })
    .check();
  await page.getByRole("button", { name: "Save cookie choices" }).click();
  expect(requests.gaScriptRequests).toEqual([]);
  expect(requests.clarityScriptRequests).toEqual([]);
  expect(requests.cloudflareRequests).toEqual([]);

  await page.evaluate(() =>
    window.dispatchEvent(new Event("saledock:open-cookie-settings")),
  );
  await page.getByRole("checkbox", { name: "Analytics tools" }).check();
  await page.getByRole("button", { name: "Save cookie choices" }).click();
  await expect.poll(() => requests.gaScriptRequests.length).toBe(1);
  await expect.poll(() => requests.clarityScriptRequests.length).toBe(1);
  await expect.poll(() => requests.cloudflareRequests.length).toBe(1);
  await expect
    .poll(async () => (await analyticsCookieNames(context)).length)
    .toBe(4);

  const acceptedCookies = await analyticsCookieNames(context);
  expect(acceptedCookies.map(({ name }) => name)).toEqual([
    "_clck",
    "_clsk",
    "_ga",
    "_ga_TESTMEASUREMENT",
  ]);
  for (const cookie of acceptedCookies) {
    expect(cookie.domain).toBe("localhost");
    expect(cookie.path).toBe("/");
    expect(cookie.secure).toBe(false);
    expect(cookie.sameSite).toBe("Lax");
  }

  await page.locator('footer a[href="/privacy"]').click();
  await expect(page).toHaveURL(/\/privacy$/);
  expect(requests.gaScriptRequests).toHaveLength(1);
  expect(requests.clarityScriptRequests).toHaveLength(1);
  expect(requests.cloudflareRequests).toHaveLength(1);

  await page.evaluate(() =>
    window.dispatchEvent(new Event("saledock:open-cookie-settings")),
  );
  await page.getByRole("checkbox", { name: "Analytics tools" }).uncheck();
  const reloaded = page.waitForEvent("load");
  await page.getByRole("button", { name: "Save cookie choices" }).click();
  await reloaded;

  await expect(page.locator('script[id^="google-analytics"]')).toHaveCount(0);
  await expect(page.locator("script#microsoft-clarity")).toHaveCount(0);
  await expect(page.locator("script#cloudflare-web-analytics")).toHaveCount(0);
  expect(await analyticsCookieNames(context)).toEqual([]);

  const withdrawnEvents = await vendorEvents(page);
  const gaDisableIndex = firstEventIndex(withdrawnEvents, "ga-disable");
  const gaDeniedIndex = firstEventIndex(withdrawnEvents, "ga-consent-denied");
  const clarityDeniedIndex = firstEventIndex(
    withdrawnEvents,
    "clarity-consent-denied",
  );
  expect(gaDisableIndex).toBeGreaterThan(-1);
  expect(gaDeniedIndex).toBeGreaterThan(gaDisableIndex);
  expect(clarityDeniedIndex).toBeGreaterThan(gaDeniedIndex);
  for (const cookieName of ["_ga", "_ga_TESTMEASUREMENT", "_clck", "_clsk"]) {
    expect(
      firstCookieDeletionIndex(
        withdrawnEvents,
        cookieName,
        clarityDeniedIndex + 1,
      ),
    ).toBeGreaterThan(clarityDeniedIndex);
  }
  expect(
    withdrawnEvents
      .slice(gaDisableIndex + 1)
      .filter(({ type }) => type === "ga-network"),
  ).toEqual([]);
  expect(
    withdrawnEvents
      .slice(clarityDeniedIndex + 1)
      .filter(({ type }) => type === "clarity-network"),
  ).toEqual([]);
  expect(requests.gaCompletedSequences.length).toBeGreaterThan(0);
  expect(requests.clarityCompletedSequences.length).toBeGreaterThan(0);
  expect(
    requests.gaCompletedSequences.every(
      (sequence) => sequence < gaDisableIndex,
    ),
  ).toBe(true);
  expect(
    requests.clarityCompletedSequences.every(
      (sequence) => sequence < clarityDeniedIndex,
    ),
  ).toBe(true);

  await page.evaluate(() =>
    window.dispatchEvent(new Event("saledock:open-cookie-settings")),
  );
  await page.getByRole("checkbox", { name: "Analytics tools" }).check();
  await page.getByRole("button", { name: "Save cookie choices" }).click();
  await expect.poll(() => requests.gaScriptRequests.length).toBe(2);
  await expect.poll(() => requests.clarityScriptRequests.length).toBe(2);
  await expect.poll(() => requests.cloudflareRequests.length).toBe(2);
  await expect
    .poll(async () => (await analyticsCookieNames(context)).length)
    .toBe(4);

  const cloudflareStorage = await page.evaluate(() => ({
    local: Object.keys(localStorage).filter((key) =>
      /cloudflare|cf_/i.test(key),
    ),
    session: Object.keys(sessionStorage).filter((key) =>
      /cloudflare|cf_/i.test(key),
    ),
    cookies: document.cookie
      .split(";")
      .map((cookie) => cookie.split("=")[0]?.trim())
      .filter((name) => /cloudflare|^cf_/i.test(name ?? "")),
  }));
  expect(cloudflareStorage).toEqual({ local: [], session: [], cookies: [] });
});

test("signed-in Analytics withdrawal reaches account storage before reload", async ({
  page,
  context,
}) => {
  const statusOutput = execFileSync(
    "supabase",
    ["status", "--output", "json"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const status = JSON.parse(statusOutput.slice(statusOutput.indexOf("{"))) as {
    API_URL: string;
    SERVICE_ROLE_KEY: string;
  };
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data: users, error: usersError } = await service.auth.admin.listUsers(
    {
      page: 1,
      perPage: 1000,
    },
  );
  if (usersError) throw usersError;
  const owner = users.users.find(
    ({ email }) => email === "owner@saledock.local",
  );
  if (!owner) throw new Error("Seeded local owner is required.");

  const { data: originalRow, error: originalError } = await service
    .from("user_ui_preferences")
    .select("*")
    .eq("user_id", owner.id)
    .maybeSingle();
  if (originalError) throw originalError;

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("organization_id")
    .eq("id", owner.id)
    .single();
  if (profileError || !profile?.organization_id) {
    throw new Error("Seeded local owner profile is required.");
  }

  const acceptedPreferences = {
    ...(originalRow?.sidebar_preferences || {}),
    analyticsConsent: "accepted",
    marketingConsent: "rejected",
    updatedAt: new Date().toISOString(),
  };
  const { error: seedError } = await service.from("user_ui_preferences").upsert(
    {
      user_id: owner.id,
      organization_id: profile.organization_id,
      dashboard_layout: originalRow?.dashboard_layout ?? null,
      sidebar_preferences: acceptedPreferences,
    },
    { onConflict: "user_id" },
  );
  if (seedError) throw seedError;

  await installAnalyticsMocks(page);
  try {
    await loginLocalOwnerDirectly(page);
    await page.evaluate((preferences) => {
      localStorage.setItem(
        "saledock-sidebar-preferences-v1",
        JSON.stringify(preferences),
      );
      window.dispatchEvent(new Event("saledock-sidebar-preferences-changed"));
    }, acceptedPreferences);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('script[id^="google-analytics"]')).toHaveCount(2);
    await expect
      .poll(async () => (await analyticsCookieNames(context)).length)
      .toBe(4);

    await page.evaluate(() =>
      window.dispatchEvent(new Event("saledock:open-cookie-settings")),
    );
    await page.getByRole("checkbox", { name: "Analytics tools" }).uncheck();
    const reloaded = page.waitForEvent("load");
    await page.getByRole("button", { name: "Save cookie choices" }).click();
    await reloaded;

    const { data: persisted, error: persistedError } = await service
      .from("user_ui_preferences")
      .select("sidebar_preferences")
      .eq("user_id", owner.id)
      .single();
    if (persistedError) throw persistedError;
    expect(persisted.sidebar_preferences?.analyticsConsent).toBe("rejected");
    expect(
      await page.evaluate(() => {
        const raw = localStorage.getItem("saledock-sidebar-preferences-v1");
        return raw ? JSON.parse(raw).analyticsConsent : null;
      }),
    ).toBe("rejected");
    await expect(page.locator('script[id^="google-analytics"]')).toHaveCount(0);
    await expect(page.locator("script#microsoft-clarity")).toHaveCount(0);
    await expect(page.locator("script#cloudflare-web-analytics")).toHaveCount(
      0,
    );
    expect(await analyticsCookieNames(context)).toEqual([]);
  } finally {
    await service.from("user_ui_preferences").delete().eq("user_id", owner.id);
    if (originalRow) {
      const { error: restoreError } = await service
        .from("user_ui_preferences")
        .insert(originalRow);
      if (restoreError) throw restoreError;
    }
  }
});
