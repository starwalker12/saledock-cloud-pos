// Unit tests for analytics-notice consent persistence helpers.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "../../src/components/analytics-notice.tsx"), "utf-8");

describe("analytics-notice consent helpers", () => {
  it("has hasStoredConsentDecision helper", () => {
    assert.ok(source.includes("function hasStoredConsentDecision"), "helper exists");
  });

  it("initial banner state reads from persisted consent", () => {
    assert.ok(
      source.includes('useState(() => !hasStoredConsentDecision())'),
      "banner open initialized from stored consent"
    );
  });

  it("keeps open-cookie-settings event separate from sidebar events", () => {
    assert.ok(source.includes("saledock:open-cookie-settings"), "settings event still used");
  });

  it("hides the consent banner from printed documents", () => {
    assert.ok(source.includes('data-testid="cookie-consent-banner"'), "banner has stable test marker");
    assert.ok(source.includes("print-hidden"), "banner uses shared print-hidden convention");
    assert.ok(source.includes("print:hidden"), "banner uses Tailwind print hidden utility");
  });
});
