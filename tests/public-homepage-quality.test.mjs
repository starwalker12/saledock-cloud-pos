import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(
  new URL("../src/app/page.tsx", import.meta.url),
  "utf8",
);
const layoutSource = readFileSync(
  new URL("../src/app/layout.tsx", import.meta.url),
  "utf8",
);
const analyticsSource = readFileSync(
  new URL("../src/components/analytics-notice.tsx", import.meta.url),
  "utf8",
);
const privacySource = readFileSync(
  new URL("../src/app/privacy/page.tsx", import.meta.url),
  "utf8",
);
const proxySource = readFileSync(
  new URL("../src/proxy.ts", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);
const socialImageUrl = new URL("../public/og-social-v2.png", import.meta.url);
const socialImage = readFileSync(socialImageUrl);

test("homepage metadata is concise and uses the versioned social card", () => {
  assert.match(
    pageSource,
    /title: "SaleDock Cloud POS — Free Retail POS & Inventory"/,
  );
  assert.match(
    pageSource,
    /description: "Cloud POS for retail shops to manage sales, inventory, repairs, invoices, expenses, and reports from one secure dashboard\."/,
  );
  assert.match(pageSource, /title: "Run your shop smarter with SaleDock"/);
  assert.match(
    pageSource,
    /url: "https:\/\/saledock\.site\/og-social-v2\.png"/,
  );
  assert.match(
    pageSource,
    /images: \["https:\/\/saledock\.site\/og-social-v2\.png"\]/,
  );
  assert.match(pageSource, /canonical: "https:\/\/saledock\.site"/);
});

test("social card is a valid optimized 1200 by 630 PNG", () => {
  assert.deepEqual(
    [...socialImage.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  assert.equal(socialImage.readUInt32BE(16), 1200);
  assert.equal(socialImage.readUInt32BE(20), 630);
  assert.ok(
    statSync(socialImageUrl).size < 150_000,
    "social image remains below 150 KB",
  );
});

test("homepage has one named primary landmark and a keyboard skip link", () => {
  assert.equal((pageSource.match(/<main\b/g) ?? []).length, 1);
  assert.match(pageSource, /<main id="main-content" tabIndex=\{-1\}>/);
  assert.match(pageSource, /href="#main-content"/);
  assert.match(pageSource, />\s*Skip to main content\s*<\/a>/);
  assert.match(pageSource, /<footer\b/);
});

test("LCP-critical homepage content is immediately paintable", () => {
  const heroStart = pageSource.indexOf("{/* ── LEFT: text column ── */}");
  const heroEnd = pageSource.indexOf("{/* ── RIGHT: 3-D dashboard", heroStart);
  const heroCopy = pageSource.slice(heroStart, heroEnd);

  assert.ok(
    heroStart > 0 && heroEnd > heroStart,
    "hero source boundary exists",
  );
  assert.doesNotMatch(heroCopy, /animate-fade-in-up/);
  assert.match(heroCopy, /sizes="\(min-width: 1280px\) 580px/);
  assert.match(heroCopy, /loading="eager"[\s\S]*?fetchPriority="high" \/>/);
});

test("homepage no longer animates background position", () => {
  assert.doesNotMatch(pageSource, /animate-gradient-shift/);
  assert.doesNotMatch(cssSource, /@keyframes gradient-shift/);
  assert.doesNotMatch(
    cssSource,
    /background-position:\s*(?:0|100|-200|200)%\s+50%/,
  );
});

test("non-English and monospace fonts remain available without English-page preload", () => {
  assert.match(
    layoutSource,
    /const geistMono = Geist_Mono\([\s\S]*?preload: false,[\s\S]*?\}\);/,
  );
  assert.match(
    layoutSource,
    /const notoNastaliqUrdu = Noto_Nastaliq_Urdu\([\s\S]*?preload: false,[\s\S]*?\}\);/,
  );
  assert.match(layoutSource, /\$\{geistMono\.variable\}/);
  assert.match(layoutSource, /\$\{notoNastaliqUrdu\.variable\}/);
});

test("public consent rendering defers account-only Supabase code", () => {
  assert.doesNotMatch(analyticsSource, /^import \{ createClient \}/m);
  assert.doesNotMatch(analyticsSource, /^import \{ saveSidebarPreferences \}/m);
  assert.match(analyticsSource, /const isPublicHomepage = pathname === "\/"/);
  assert.match(
    analyticsSource,
    /if \(isPublicHomepage\) \{[\s\S]*?setAuthLoading\(false\)/,
  );
  assert.match(analyticsSource, /import\("@\/lib\/supabase\/client"\)/);
  assert.match(analyticsSource, /if \(!clientReady \|\| authLoading/);
});

test("theme bootstrap uses the request CSP nonce", () => {
  assert.match(layoutSource, /<ThemeProvider[\s\S]*?nonce=\{nonce\}/);
});

test("Cloudflare Web Analytics has one public configuration point and follows Analytics consent", () => {
  const expectedToken = ["005f03e932214af4", "92eb1a1c68af3238"].join("");
  const tokenOccurrences = [
    pageSource,
    layoutSource,
    analyticsSource,
    privacySource,
    proxySource,
  ].reduce(
    (count, source) => count + (source.match(new RegExp(expectedToken, "g")) ?? []).length,
    0,
  );

  assert.equal(tokenOccurrences, 1, "the public beacon token is configured once");
  assert.match(
    layoutSource,
    new RegExp(
      `const CLOUDFLARE_WEB_ANALYTICS_TOKEN = "${expectedToken}";`,
    ),
  );
  assert.match(
    layoutSource,
    /cloudflareWebAnalyticsToken=\{CLOUDFLARE_WEB_ANALYTICS_TOKEN\}/,
  );
  assert.match(
    analyticsSource,
    /gaMeasurementId \|\| clarityProjectId \|\| cloudflareWebAnalyticsToken/,
  );
  assert.match(
    analyticsSource,
    /\{cloudflareWebAnalyticsToken && \([\s\S]*?id="cloudflare-web-analytics"[\s\S]*?type="module"[\s\S]*?strategy="afterInteractive"[\s\S]*?nonce=\{nonce\}[\s\S]*?src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js"[\s\S]*?crossOrigin="anonymous"[\s\S]*?data-cf-beacon=\{JSON\.stringify\(\{[\s\S]*?token: cloudflareWebAnalyticsToken/,
  );
  assert.match(
    analyticsSource,
    /analyticsAccepted && \([\s\S]*?<AnalyticsScripts/,
  );
  assert.match(analyticsSource, /cookie-free Cloudflare Web Analytics/);
  assert.match(analyticsSource, /aria-label="Analytics tools"/);
  assert.match(
    analyticsSource,
    /analyticsWasAccepted && nextAnalytics === "rejected"[\s\S]*?window\.location\.reload\(\)/,
  );
});

test("Cloudflare privacy copy and CSP destinations are focused and future-enforcement compatible", () => {
  assert.match(privacySource, /Last updated: August 2026/);
  assert.match(
    privacySource,
    /<strong>Cloudflare, Inc\.<\/strong> — privacy-first, cookie-free Web Analytics/,
  );
  assert.match(
    privacySource,
    /Cloudflare[\s\S]*?Web Analytics does not use client-side cookies or localStorage/,
  );
  assert.equal(
    (proxySource.match(/https:\/\/static\.cloudflareinsights\.com/g) ?? [])
      .length,
    1,
  );
  assert.equal(
    (proxySource.match(/https:\/\/cloudflareinsights\.com/g) ?? []).length,
    1,
  );
  assert.match(
    proxySource,
    /script-src 'self' 'nonce-\$\{nonce\}' 'strict-dynamic'/,
  );
  assert.doesNotMatch(proxySource, /https:\/\/\*\.cloudflare/);
  assert.match(proxySource, /Content-Security-Policy-Report-Only/);
  assert.match(proxySource, /report-uri \$\{reportUrl\}/);
});
