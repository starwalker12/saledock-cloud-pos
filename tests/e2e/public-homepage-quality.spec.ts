import { expect, test, type Locator, type Page } from "@playwright/test";

const title = "SaleDock Cloud POS — Free Retail POS & Inventory";
const description =
  "Cloud POS for retail shops to manage sales, inventory, repairs, invoices, expenses, and reports from one secure dashboard.";
const cloudflareWebAnalyticsToken = [
  "005f03e932214af4",
  "92eb1a1c68af3238",
].join("");

type RGB = { r: number; g: number; b: number; a: number };

function luminance({ r, g, b }: RGB) {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground: RGB, background: RGB) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

async function computedContrast(locator: Locator) {
  const colors = await locator.evaluate((element) => {
    const toRgb = (color: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas context unavailable");
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: alpha / 255 };
    };

    const foreground = toRgb(getComputedStyle(element).color);
    let current: Element | null = element;
    let background = "rgba(0, 0, 0, 0)";
    while (current) {
      background = getComputedStyle(current).backgroundColor;
      if (!background.endsWith(", 0)") && background !== "transparent") break;
      current = current.parentElement;
    }
    return { foreground, background: toRgb(background) };
  });
  return contrastRatio(colors.foreground, colors.background);
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem("theme", selectedTheme);
    localStorage.removeItem("analytics-consent");
    localStorage.removeItem("saledock-sidebar-preferences-v1");
  }, theme);
}

test("homepage metadata, landmark, consent timing, and light/dark contrast are durable", async ({
  page,
}) => {
  await setTheme(page, "light");
  const authRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/auth/v1/")) authRequests.push(request.url());
  });

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(title);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    description,
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Run your shop smarter with SaleDock",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://saledock.site/og-social-v2.png",
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://saledock.site",
  );

  await expect(page.locator("main#main-content")).toHaveCount(1);
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();

  await expect(page.getByTestId("cookie-consent-banner")).toBeVisible({
    timeout: 1_500,
  });
  expect(authRequests).toEqual([]);

  const responseLinkHeader = response?.headers()["link"] ?? "";
  expect(
    (responseLinkHeader.match(/rel=preload; as="font"/g) ?? []).length,
  ).toBe(2);

  const lightTargets = [
    page.getByText("+12%", { exact: true }).filter({ visible: true }),
    page.getByText("low stock", { exact: true }).filter({ visible: true }),
    page.getByText("2 due today", { exact: true }).filter({ visible: true }),
    page.getByText("4 customers", { exact: true }).filter({ visible: true }),
    page.getByText("Rs 7,280", { exact: true }).filter({ visible: true }),
    page.getByText("3 left", { exact: true }).filter({ visible: true }),
    page.locator("footer a").first(),
    page.locator("footer p").last(),
  ];

  for (const target of lightTargets) {
    await expect(target).toBeVisible();
    expect(await computedContrast(target)).toBeGreaterThanOrEqual(4.5);
  }

  const backgroundPositionAnimations = await page.evaluate(
    () =>
      document.getAnimations().filter((animation) => {
        if (!(animation.effect instanceof KeyframeEffect)) return false;
        return animation.effect
          .getKeyframes()
          .some((frame) =>
            Object.keys(frame).some((key) =>
              key.startsWith("backgroundPosition"),
            ),
          );
      }).length,
  );
  expect(backgroundPositionAnimations).toBe(0);

  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  for (const target of [
    page.locator("footer a").first(),
    page.locator("footer p").last(),
  ]) {
    expect(await computedContrast(target)).toBeGreaterThanOrEqual(4.5);
  }
});

test("reduced motion and Urdu font remain available on demand", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
    localStorage.setItem("analytics-consent", "rejected");
    localStorage.setItem(
      "saledock-sidebar-preferences-v1",
      JSON.stringify({ marketingConsent: "rejected" }),
    );
  });

  await page.goto("/", { waitUntil: "networkidle" });
  expect(
    await page
      .locator(".animate-logo-shimmer")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");

  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/_next/static/media/") &&
      request.url().endsWith(".woff2")
    ) {
      fontRequests.push(request.url());
    }
  });
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("button", { name: "اردو" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ur");
  await expect(page.locator("html")).toHaveAttribute("data-lang", "ur");
  await expect(page.locator("body")).toHaveCSS(
    "font-family",
    /Noto Nastaliq Urdu/,
  );
  await expect.poll(() => fontRequests.length).toBeGreaterThan(0);

  await context.close();
});

test("Cloudflare Web Analytics loads once only after Analytics consent and is removed after rejection", async ({
  page,
}) => {
  await setTheme(page, "light");
  const cloudflareScriptRequests: string[] = [];
  const cloudflareRumRequests: string[] = [];

  await page.route(
    "https://static.cloudflareinsights.com/beacon.min.js*",
    async (route) => {
      cloudflareScriptRequests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        headers: {
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=3600",
        },
        body: "window.__saledockCloudflareBeaconLoaded = (window.__saledockCloudflareBeaconLoaded || 0) + 1;",
      });
    },
  );
  page.on("request", (request) => {
    if (
      request.url().includes("cloudflareinsights.com/cdn-cgi/rum") ||
      request.url().includes("/cdn-cgi/rum")
    ) {
      cloudflareRumRequests.push(request.url());
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const banner = page.getByTestId("cookie-consent-banner");
  const cloudflareScript = page.locator("script#cloudflare-web-analytics");
  await expect(banner).toBeVisible();
  await expect(cloudflareScript).toHaveCount(0);
  expect(cloudflareScriptRequests).toEqual([]);

  await page.getByRole("button", { name: "Reject optional cookies" }).click();
  await expect(banner).not.toBeVisible();
  await expect(cloudflareScript).toHaveCount(0);
  expect(cloudflareScriptRequests).toEqual([]);

  await page.evaluate(() =>
    window.dispatchEvent(new Event("saledock:open-cookie-settings")),
  );
  await expect(banner).toBeVisible();
  await page.getByRole("checkbox", { name: "Marketing and advertising cookies" }).check();
  await page.getByRole("button", { name: "Save cookie choices" }).click();
  await expect(banner).not.toBeVisible();
  await expect(cloudflareScript).toHaveCount(0);
  expect(cloudflareScriptRequests).toEqual([]);

  await page.evaluate(() =>
    window.dispatchEvent(new Event("saledock:open-cookie-settings")),
  );
  await page.getByRole("checkbox", { name: "Analytics tools" }).check();
  await page.getByRole("button", { name: "Save cookie choices" }).click();
  await expect(cloudflareScript).toHaveCount(1);
  await expect(cloudflareScript).toHaveAttribute("type", "module");
  await expect(cloudflareScript).toHaveAttribute(
    "src",
    "https://static.cloudflareinsights.com/beacon.min.js",
  );
  expect(
    JSON.parse((await cloudflareScript.getAttribute("data-cf-beacon")) ?? "{}"),
  ).toEqual({ token: cloudflareWebAnalyticsToken });
  await expect.poll(() => cloudflareScriptRequests.length).toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & {
          __saledockCloudflareBeaconLoaded?: number;
        }).__saledockCloudflareBeaconLoaded,
    ),
  ).toBe(1);

  await page.locator('footer a[href="/privacy"]').click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(cloudflareScript).toHaveCount(1);
  expect(cloudflareScriptRequests).toHaveLength(1);

  await page.evaluate(() =>
    window.dispatchEvent(new Event("saledock:open-cookie-settings")),
  );
  await page.getByRole("checkbox", { name: "Analytics tools" }).uncheck();
  const reloaded = page.waitForEvent("load");
  await page.getByRole("button", { name: "Save cookie choices" }).click();
  await reloaded;
  await expect(cloudflareScript).toHaveCount(0);
  expect(cloudflareScriptRequests).toHaveLength(1);
  expect(cloudflareRumRequests).toEqual([]);

  const cloudflareStorage = await page.evaluate(() => ({
    local: Object.keys(localStorage).filter((key) => /cloudflare|cf_/i.test(key)),
    session: Object.keys(sessionStorage).filter((key) => /cloudflare|cf_/i.test(key)),
    cookies: document.cookie
      .split(";")
      .map((cookie) => cookie.split("=")[0]?.trim())
      .filter((name) => /cloudflare|^cf_/i.test(name ?? "")),
  }));
  expect(cloudflareStorage).toEqual({ local: [], session: [], cookies: [] });
});
