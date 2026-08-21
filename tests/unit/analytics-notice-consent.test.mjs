// Unit tests for analytics-notice consent persistence helpers.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(__dirname, "../../src/components/analytics-notice.tsx"),
  "utf-8",
);

describe("analytics-notice consent helpers", () => {
  it("has hasStoredConsentDecision helper", () => {
    assert.ok(
      source.includes("function hasStoredConsentDecision"),
      "helper exists",
    );
  });

  it("initial banner state reads from persisted consent", () => {
    assert.match(
      source,
      /useState\(\s*\(\) => !hasStoredConsentDecision\(\),?\s*\)/,
      "banner open initializes from stored consent",
    );
  });

  it("keeps open-cookie-settings event separate from sidebar events", () => {
    assert.ok(
      source.includes("saledock:open-cookie-settings"),
      "settings event still used",
    );
  });

  it("hides the consent banner from printed documents", () => {
    assert.ok(
      source.includes('data-testid="cookie-consent-banner"'),
      "banner has stable test marker",
    );
    assert.ok(
      source.includes("print-hidden"),
      "banner uses shared print-hidden convention",
    );
    assert.ok(
      source.includes("print:hidden"),
      "banner uses Tailwind print hidden utility",
    );
  });

  it("uses vendor shutdown APIs before first-party analytics cookie cleanup", () => {
    assert.match(
      source,
      /Reflect\.set\(analyticsWindow, `ga-disable-\$\{gaMeasurementId\}`, true\)/,
    );
    assert.match(
      source,
      /analyticsWindow\.gtag\?\.\("consent", "update", \{\s*analytics_storage: "denied"/,
    );
    assert.match(
      source,
      /analyticsWindow\.clarity\?\.\("consentv2", \{\s*ad_Storage: "denied",\s*analytics_Storage: "denied"/,
    );

    const applyChoices = source.slice(
      source.indexOf("async function applyChoices"),
      source.indexOf("function handleAcceptAll"),
    );
    const shutdownIndex = applyChoices.indexOf("shutdownAnalyticsTracking");
    const cleanupIndex = applyChoices.indexOf("clearTrackingCookies");
    assert.ok(shutdownIndex >= 0, "withdrawal invokes vendor shutdown");
    assert.ok(
      cleanupIndex > shutdownIndex,
      "first cookie cleanup follows vendor shutdown",
    );
  });

  it("keeps dynamic GA and Clarity cleanup narrow and deterministic", () => {
    assert.match(source, /name\.startsWith\("_ga_"\)/);
    assert.match(source, /namesToClear\.add\("_clck"\)/);
    assert.match(source, /namesToClear\.add\("_clsk"\)/);
    assert.match(
      source,
      /window\.setTimeout\(\(\) => \{\s*clearTrackingCookies\(\{ analytics: true, marketing: false \}\);\s*window\.location\.reload\(\);\s*\}, 0\)/,
    );
    assert.doesNotMatch(source, /window\.location\.reload\(\), 50/);
  });

  it("awaits signed-in withdrawal persistence before reloading", () => {
    assert.match(
      source,
      /async function persistAccountConsentBeforeReload\(userId: string\)[\s\S]*?from\("user_ui_preferences"\)\.upsert/,
    );
    const applyChoices = source.slice(
      source.indexOf("async function applyChoices"),
      source.indexOf("function handleAcceptAll"),
    );
    const persistenceIndex = applyChoices.indexOf(
      "await persistAccountConsentBeforeReload(user.id)",
    );
    const reloadIndex = applyChoices.indexOf("window.location.reload()");
    assert.ok(persistenceIndex >= 0, "signed-in persistence is awaited");
    assert.ok(
      reloadIndex > persistenceIndex,
      "reload follows durable account persistence",
    );
    assert.match(applyChoices, /reload skipped/);
  });
});
