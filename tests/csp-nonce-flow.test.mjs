import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

function source(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function assertContains(source, substring, message) {
  assert.ok(
    source.includes(substring),
    message ?? `Expected source to contain: ${substring}`,
  );
}

const proxySource = source("src/proxy.ts");
const sessionUpdateSource = source("src/lib/supabase/session-update.ts");
const layoutSource = source("src/app/layout.tsx");
const pageSource = source("src/app/page.tsx");
const analyticsSource = source("src/components/analytics-notice.tsx");
const metaPixelSource = source("src/components/meta-pixel.tsx");

test("proxy generates nonce at request time using a UUID-derived value", () => {
  assertContains(
    proxySource,
    "const nonce = btoa(crypto.randomUUID())",
    "proxy must generate a nonce with btoa(crypto.randomUUID())",
  );
});

test("proxy CSP script-src contains a nonce source", () => {
  assertContains(
    proxySource,
    "script-src 'self' 'nonce-${nonce}'",
    "proxy CSP script-src must include a nonce source",
  );
});

test("proxy CSP contains strict-dynamic", () => {
  assertContains(
    proxySource,
    "'strict-dynamic'",
    "proxy CSP must include strict-dynamic",
  );
});

test("proxy unsafe-eval is development-only", () => {
  assertContains(
    proxySource,
    'isDev ? " \'unsafe-eval\'" : ""',
    "unsafe-eval must be conditional on development",
  );
  assertContains(
    proxySource,
    'const isDev = process.env.NODE_ENV === "development"',
    "isDev must be derived from NODE_ENV",
  );
});

test("proxy CSP is currently report-only", () => {
  assertContains(
    proxySource,
    "const headerName = isEnforced",
    "proxy must choose header name based on isEnforced",
  );
  assertContains(
    proxySource,
    '"Content-Security-Policy-Report-Only"',
    "report-only header name must be present",
  );
});

test("proxy isEnforced remains false", () => {
  assertContains(
    proxySource,
    "const isEnforced = false",
    "isEnforced must be false",
  );
});

test("proxy passes nonce and headers to updateSession", () => {
  assertContains(
    proxySource,
    "return await updateSession(request, {\n      name: headerName,\n      value: headerValue,\n      nonce,\n      reportingEndpoints: reportingEndpointsValue,\n    })",
    "proxy must pass the full CSP object to updateSession",
  );
});

test("session update sets x-nonce on forwarded request headers", () => {
  assertContains(
    sessionUpdateSource,
    'requestHeaders.set("x-nonce", csp.nonce)',
    "updateSession must set x-nonce on request headers",
  );
});

test("session update sets CSP on normal response", () => {
  assertContains(
    sessionUpdateSource,
    "response.headers.set(csp.name, csp.value)",
    "updateSession must set CSP on normal response",
  );
  assertContains(
    sessionUpdateSource,
    'response.headers.set("Reporting-Endpoints", csp.reportingEndpoints)',
    "updateSession must set Reporting-Endpoints on normal response",
  );
});

test("session update preserves CSP when the Supabase response is recreated", () => {
  assertContains(
    sessionUpdateSource,
    "response = NextResponse.next({\n            request: {\n              headers: requestHeaders,\n            },\n          })",
    "updateSession must recreate the response with the original request headers containing CSP",
  );
});

test("session update preserves CSP on protected-route redirects", () => {
  assertContains(
    sessionUpdateSource,
    "redirectResponse.headers.set(csp.name, csp.value)",
    "updateSession must set CSP on login redirect response",
  );
  assertContains(
    sessionUpdateSource,
    'redirectResponse.headers.set("Reporting-Endpoints", csp.reportingEndpoints)',
    "updateSession must set Reporting-Endpoints on login redirect response",
  );
});

test("root layout reads x-nonce", () => {
  assertContains(
    layoutSource,
    '(await headers()).get("x-nonce")',
    "root layout must read x-nonce",
  );
});

test("root layout applies nonce to the color-theme script", () => {
  assertContains(
    layoutSource,
    "<script nonce={nonce} dangerouslySetInnerHTML={{ __html: colorThemeInitScript }} />",
    "root layout must apply nonce to the color-theme script",
  );
});

test("root layout passes nonce to AnalyticsNotice", () => {
  assertContains(
    layoutSource,
    "<AnalyticsNotice\n          nonce={nonce}",
    "root layout must pass nonce to AnalyticsNotice",
  );
});

test("landing page reads x-nonce", () => {
  assertContains(
    pageSource,
    '(await headers()).get("x-nonce")',
    "landing page must read x-nonce",
  );
});

test("landing page passes nonce to MetaPixel", () => {
  assertContains(
    pageSource,
    "<MetaPixel nonce={nonce} />",
    "landing page must pass nonce to MetaPixel",
  );
});

test("AnalyticsNotice passes nonce to each configured Next Script", () => {
  const scriptCount = (analyticsSource.match(/nonce={nonce}/g) || []).length;
  assert.ok(
    scriptCount >= 2,
    `AnalyticsNotice must pass nonce to configured Next Script elements (found ${scriptCount})`,
  );
});

test("MetaPixel passes nonce to its Next Script", () => {
  assertContains(
    metaPixelSource,
    "nonce={nonce}",
    "MetaPixel must pass nonce to its Next Script",
  );
});

test("JSON-LD script state is recorded without judging presence or absence of an explicit nonce", (t) => {
  const jsonLdStart = pageSource.indexOf('type="application/ld+json"');
  assert.notEqual(
    jsonLdStart,
    -1,
    "landing page must contain a JSON-LD script",
  );
  const tagStart = pageSource.lastIndexOf("<script", jsonLdStart);
  const tagEnd = pageSource.indexOf(">", jsonLdStart);
  const tag = pageSource.slice(tagStart, tagEnd + 1);
  assert.ok(tag.includes("<script"), "JSON-LD marker must be on a script tag");
  const hasNonce = tag.includes("nonce=");
  t.diagnostic(`JSON-LD script explicit nonce present: ${hasNonce}`);
  assert.doesNotMatch(
    tag,
    /nonce=["'][A-Za-z0-9+/=_-]{10,}["']/,
    "JSON-LD script tag must not contain a raw nonce value in test output",
  );
});
