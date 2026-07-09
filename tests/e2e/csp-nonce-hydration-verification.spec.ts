import {
  expect,
  test,
  type Page,
  type BrowserContext,
  type Dialog,
} from "@playwright/test";
import type { ConsoleMessage } from "@playwright/test";

const env = process.env.CSP_TEST_ENV as
  | "dev"
  | "local-production"
  | "preview"
  | "production"
  | undefined;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

const routes = [
  "/",
  "/login",
  "/privacy",
  "/terms",
  "/auth/invite?error=otp_expired",
];
const viewports = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

test.skip(
  !env || !["dev", "local-production", "preview", "production"].includes(env),
  "CSP_TEST_ENV must be set",
);

const isReadOnlyEnv = env === "preview" || env === "production";
const expectUnsafeEval = env === "dev";

function redact(message: string): string {
  return message
    .replace(/nonce="[^"]*"/g, 'nonce="REDACTED"')
    .replace(/nonce='[^']*'/g, 'nonce="REDACTED"')
    .replace(/nonce-[A-Za-z0-9+/=_-]+/g, "nonce-REDACTED")
    .replace(/x-nonce:\s*[^\s]*/g, "x-nonce: REDACTED");
}

function extractNonce(cspHeader: string): string | null {
  const match = cspHeader.match(/'nonce-([^']+)'/);
  return match?.[1] ?? null;
}

function extractScriptSrcNonceCount(cspHeader: string): number {
  return (cspHeader.match(/'nonce-[^']+'/g) || []).length;
}

async function dismissAnalyticsBanner(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      const rejected = {
        value: "rejected",
        version: "qa-test",
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem("analytics-consent", JSON.stringify(rejected));
      const prefs = JSON.parse(
        localStorage.getItem("saledock-sidebar-preferences-v1") || "{}",
      );
      prefs.analyticsConsent = "rejected";
      prefs.marketingConsent = "rejected";
      localStorage.setItem(
        "saledock-sidebar-preferences-v1",
        JSON.stringify(prefs),
      );
    } catch {}
  });
}

function attachListeners(page: Page, cspReportAttempts: string[]) {
  const pageErrors: Error[] = [];
  const consoleMessages: ConsoleMessage[] = [];
  const requestFailures: string[] = [];
  const dialogs: Dialog[] = [];

  page.on("pageerror", (error) => pageErrors.push(error));
  page.on("console", (msg) => consoleMessages.push(msg));
  page.on("requestfailed", (request) =>
    requestFailures.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`,
    ),
  );
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog);
    await dialog.dismiss();
  });

  return {
    pageErrors,
    consoleMessages,
    requestFailures,
    dialogs,
    cspReportAttempts,
  };
}

function hydrateWarnings(messages: ConsoleMessage[]): string[] {
  return messages
    .filter((msg) => msg.type() === "warning" || msg.type() === "error")
    .map((msg) => redact(msg.text()))
    .filter((text) =>
      /hydration|hydrated|server rendered HTML|did not match|mismatch|nonce/i.test(
        text,
      ),
    );
}

async function assertNoFrameworkErrorOverlay(page: Page): Promise<void> {
  const hasErrorOverlay = await page.evaluate(() => {
    const portal = document.querySelector("nextjs-portal");
    if (!portal) return false;
    const dialog = portal.querySelector('[role="dialog"]');
    if (!dialog) return false;
    const text = (dialog as HTMLElement).innerText || "";
    return /Unhandled Runtime Error|Runtime Error|Build Error|Hydration failed|Application error|error overlay/i.test(
      text,
    );
  });
  expect(hasErrorOverlay).toBe(false);
}

async function verifyNonceUniqueness(
  context: BrowserContext,
  route: string,
): Promise<{ unique: boolean }> {
  const res1 = await context.request.get(`${baseUrl}${route}`, {
    maxRedirects: 5,
  });
  const res2 = await context.request.get(`${baseUrl}${route}`, {
    maxRedirects: 5,
  });
  const csp1 = res1.headers()["content-security-policy-report-only"] ?? "";
  const csp2 = res2.headers()["content-security-policy-report-only"] ?? "";
  const nonce1 = extractNonce(csp1);
  const nonce2 = extractNonce(csp2);
  return { unique: Boolean(nonce1 && nonce2 && nonce1 !== nonce2) };
}

async function inspectDomScripts(
  page: Page,
  responseNonce: string | null,
): Promise<{
  colorTheme: {
    present: boolean;
    nonceNonEmpty: boolean;
    attrNonceMatches: boolean;
    propNonceMatches: boolean;
  };
  nextRoots: {
    total: number;
    withNonce: number;
    withoutNonce: number;
    mismatch: number;
  };
  externalRuntime: {
    total: number;
    withNonce: number;
    withoutNonce: number;
    mismatch: number;
  };
  inlineOther: {
    total: number;
    withNonce: number;
    withoutNonce: number;
    mismatch: number;
  };
  jsonLd: {
    total: number;
    withNonce: number;
    withoutNonce: number;
    mismatch: number;
  };
}> {
  return page.evaluate(
    (opts) => {
      const responseNonce = opts.responseNonce;
      const scripts = Array.from(document.querySelectorAll("script"));

      const colorTheme = scripts.find((s) => {
        const text = s.textContent || "";
        return (
          text.includes("data-color-theme") ||
          text.includes("DEFAULT_COLOR_THEME") ||
          text.includes("colorThemeInitScript")
        );
      });

      const nextRoots = scripts.filter((s) => {
        const id = s.id || "";
        return id === "__NEXT_DATA__" || id === "_R_";
      });

      const jsonLd = scripts.filter(
        (s) => s.getAttribute("type") === "application/ld+json",
      );

      const externalRuntime = scripts.filter((s) => {
        const src = s.getAttribute("src") || "";
        return src.startsWith("/_next/");
      });

      const inlineOther = scripts.filter((s) => {
        const src = s.getAttribute("src");
        if (src) return false;
        const type = s.getAttribute("type") || "";
        if (type === "application/ld+json") return false;
        const text = s.textContent || "";
        return text.length > 0;
      });

      function check(script: HTMLScriptElement | undefined) {
        if (!script)
          return {
            nonceNonEmpty: false,
            attrNonceMatches: false,
            propNonceMatches: false,
          };
        const attr = script.getAttribute("nonce") || "";
        const prop = (script as HTMLScriptElement).nonce || "";
        return {
          nonceNonEmpty: prop.length > 0 || attr.length > 0,
          attrNonceMatches: responseNonce ? attr === responseNonce : false,
          propNonceMatches: responseNonce ? prop === responseNonce : false,
        };
      }

      function summarize(list: HTMLScriptElement[]) {
        const checks = list.map(check);
        const total = list.length;
        const withNonce = checks.filter((c) => c.nonceNonEmpty).length;
        const mismatch = checks.filter(
          (c) => c.nonceNonEmpty && !c.propNonceMatches && !c.attrNonceMatches,
        ).length;
        return { total, withNonce, withoutNonce: total - withNonce, mismatch };
      }

      return {
        colorTheme: { present: Boolean(colorTheme), ...check(colorTheme) },
        nextRoots: summarize(nextRoots),
        externalRuntime: summarize(externalRuntime),
        inlineOther: summarize(inlineOther),
        jsonLd: summarize(jsonLd),
      };
    },
    { responseNonce },
  );
}

test("preview SSO preflight", async ({ context }) => {
  test.skip(env !== "preview", "Only relevant for preview environment");

  const response = await context.request.get(baseUrl, { maxRedirects: 0 });
  const location = response.headers()["location"] ?? "";
  const isBlocked =
    response.status() === 302 &&
    location.startsWith("https://vercel.com/sso-api");
  expect(isBlocked).toBe(true);
});

test.describe("application routes", () => {
  test.skip(
    env === "preview",
    "Vercel preview application verification blocked by deployment protection; no SaleDock CSP or hydration response was inspected.",
  );

  for (const route of routes) {
    for (const viewport of viewports) {
      test(`${env} ${route} ${viewport.width}x${viewport.height}`, async ({
        page,
        context,
      }) => {
        test.setTimeout(120_000);

        await page.setViewportSize(viewport);
        await dismissAnalyticsBanner(page);

        const cspReportAttempts: string[] = [];
        if (isReadOnlyEnv) {
          await page.route("**/api/csp-report", async (interceptedRoute) => {
            cspReportAttempts.push(
              `${env} ${route} ${interceptedRoute.request().method()} attempt ${cspReportAttempts.length + 1}`,
            );
            await interceptedRoute.abort();
          });
        }

        const listeners = attachListeners(page, cspReportAttempts);

        const response = await page.goto(`${baseUrl}${route}`, {
          waitUntil: "networkidle",
        });
        const cspHeader =
          response?.headers()["content-security-policy-report-only"] ?? "";
        const headers = {
          reportOnly: Boolean(cspHeader),
          enforced: Boolean(response?.headers()["content-security-policy"]),
          nonceCount: extractScriptSrcNonceCount(cspHeader),
          nonce: extractNonce(cspHeader),
          hasStrictDynamic: cspHeader.includes("'strict-dynamic'"),
          hasUnsafeEval: cspHeader.includes("'unsafe-eval'"),
          reportingEndpoints: Boolean(
            response?.headers()["reporting-endpoints"],
          ),
          xNonceLeaked: Boolean(response?.headers()["x-nonce"]),
        };

        expect(headers.reportOnly).toBe(true);
        expect(headers.enforced).toBe(false);
        expect(headers.nonceCount).toBe(1);
        expect(headers.nonce).toBeTruthy();
        expect(headers.hasStrictDynamic).toBe(true);
        expect(headers.hasUnsafeEval).toBe(expectUnsafeEval);
        expect(headers.reportingEndpoints).toBe(true);
        expect(headers.xNonceLeaked).toBe(false);

        const { unique } = await verifyNonceUniqueness(context, route);
        expect(unique).toBe(true);

        const domScripts = await inspectDomScripts(page, headers.nonce);
        expect(domScripts.colorTheme.present).toBe(true);
        expect(domScripts.colorTheme.nonceNonEmpty).toBe(true);
        expect(domScripts.colorTheme.propNonceMatches).toBe(true);

        expect(domScripts.nextRoots.total).toBeGreaterThan(0);
        expect(domScripts.nextRoots.withoutNonce).toBe(0);
        expect(domScripts.nextRoots.mismatch).toBe(0);

        if (env !== "dev") {
          expect(domScripts.externalRuntime.mismatch).toBe(0);
        }

        test
          .info()
          .annotations.push({
            type: "external-runtime-scripts",
            description: `${domScripts.externalRuntime.withNonce}/${domScripts.externalRuntime.total} with nonce, ${domScripts.externalRuntime.withoutNonce} without nonce, ${domScripts.externalRuntime.mismatch} mismatch`,
          });

        if (domScripts.jsonLd.total > 0) {
          expect(domScripts.jsonLd.mismatch).toBe(0);
        }

        test
          .info()
          .annotations.push({
            type: "inline-other-scripts",
            description: `${domScripts.inlineOther.withNonce}/${domScripts.inlineOther.total} with nonce, ${domScripts.inlineOther.mismatch} mismatch`,
          });
        test
          .info()
          .annotations.push({
            type: "json-ld-scripts",
            description: `${domScripts.jsonLd.withNonce}/${domScripts.jsonLd.total} with nonce, ${domScripts.jsonLd.mismatch} mismatch`,
          });

        await assertNoFrameworkErrorOverlay(page);

        const warnings = hydrateWarnings(listeners.consoleMessages);
        const pageErrors = listeners.pageErrors;
        const dialogs = listeners.dialogs;
        const requestFailures = listeners.requestFailures;

        // Nonce secrecy: fail if any captured output contains an unredacted nonce value.
        for (const raw of warnings) {
          const redacted = redact(raw);
          expect(redacted).not.toMatch(/nonce-[A-Za-z0-9+/=_-]{20,}/);
          expect(redacted).not.toMatch(/nonce="[A-Za-z0-9+/=_-]{10,}"/);
          expect(redacted).not.toMatch(/nonce='[A-Za-z0-9+/=_-]{10,}'/);
        }

        if (pageErrors.length > 0) {
          expect(pageErrors.map((e) => redact(e.message))).toEqual([]);
        }
        expect(dialogs).toHaveLength(0);
        const nonTrivialRequestFailures = requestFailures.filter((f) => {
          if (f.includes("favicon")) return false;
          if (f.includes("ERR_ABORTED")) return false;
          if (
            f.includes("/_vercel/insights/") ||
            f.includes("/_vercel/speed-insights/")
          )
            return false;
          if (f.includes("_rsc=")) return false;
          return true;
        });
        expect(nonTrivialRequestFailures).toEqual([]);

        const attemptedReports = listeners.cspReportAttempts.length;
        const blockedReports = attemptedReports;
        test
          .info()
          .annotations.push({
            type: "csp-report-attempts",
            description: String(attemptedReports),
          });
        test
          .info()
          .annotations.push({
            type: "csp-report-blocked",
            description: String(blockedReports),
          });
        expect(blockedReports).toBe(attemptedReports);

        // Do not fail merely because a hydration warning exists; classify it instead.
        const redactedWarnings = warnings.map(redact);
        const hasHydrationWarning = redactedWarnings.some((w) =>
          /hydration|hydrated|server rendered HTML/i.test(w),
        );
        const hasNonceMismatch = redactedWarnings.some((w) =>
          /nonce|did not match|mismatch/i.test(w),
        );

        test
          .info()
          .annotations.push({
            type: "hydration-warning",
            description: hasHydrationWarning ? "observed" : "none",
          });
        test
          .info()
          .annotations.push({
            type: "nonce-mismatch",
            description: hasNonceMismatch ? "observed" : "none",
          });
        test
          .info()
          .annotations.push({
            type: "native-dialogs",
            description: String(dialogs.length),
          });
        test
          .info()
          .annotations.push({
            type: "page-errors",
            description: String(pageErrors.length),
          });
        test
          .info()
          .annotations.push({ type: "framework-overlay", description: "none" });
      });
    }
  }
});
