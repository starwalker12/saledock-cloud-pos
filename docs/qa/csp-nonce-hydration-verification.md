# QA Verification: CSP Nonce Hydration (MN-007)

**Status:** COMPLETE WITH PREVIEW ACCESS LIMITATION — DRAFT PR only  
**Branch:** `qa/csp-nonce-hydration-verification`  
**Base commit:** `12cddabc28bf49d58af5e30fbb8d4f7f04a42af1` (origin/main)  
**Goal:** Verify whether the CSP nonce hydration warning (MN-007) is reproducible across local dev, local production, Vercel preview, and production `https://saledock.site`, without changing any CSP behavior.

## Scope & Safety Rules

- Test-and-documentation only; no CSP, middleware, auth, database, or production config changes.
- Public routes only: `/`, `/login`, `/privacy`, `/terms`, `/auth/invite?error=otp_expired`.
- No login, no production mutation, no checkout/stock/money/report logic touched.
- CSP report endpoint (`/api/csp-report`) is intercepted and aborted in preview and production tests; no report bodies are recorded.
- All nonce values are redacted in this document and in test output.
- Preview protection is retained; no Vercel protection-bypass token was requested, stored, or used.

## Redaction Method

Test output is passed through a `redact()` helper that replaces nonce values with the literal tokens `nonce="REDACTED"`, `nonce-REDACTED`, and `x-nonce: REDACTED`. Assertions then verify that no raw base64-like nonce tokens remain in captured logs.

## What We Checked

For every route and viewport (mobile 390x844 and desktop 1440x900) we verify:

1. The response has a `Content-Security-Policy-Report-Only` header with exactly one nonce in `script-src`.
2. `strict-dynamic` is present; `unsafe-eval` is present only in dev.
3. No `x-nonce` response header leaks the nonce.
4. Two fresh requests produce different nonces (per-request uniqueness).
5. The color-theme inline script and the Next.js root inline scripts (`_R_` / `__NEXT_DATA__`) have a non-empty nonce that matches the response header nonce.
6. External `_next` scripts are counted and recorded, but not treated as a hard failure if they lack a nonce.
7. Console warnings, page errors, native dialogs, and framework error overlays are captured and classified.
8. CSP report attempts are intercepted, counted, and blocked.

## Environment Matrix

| Environment                        | Base URL                                                                             | Status                    | Hydration Warning                           | Notes                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------ | ------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Local dev                          | `http://localhost:3000`                                                              | **Reproduced**            | **Yes** — color-theme script nonce mismatch | Full details below                                                                             |
| Local production                   | `http://localhost:3001`                                                              | Not reproduced            | No                                          | Tested through `next build` plus `next start`                                                  |
| Vercel preview                     | `https://saledock-cloud-pos-git-qa-csp-non-e4e51f-fardan-aatirs-projects.vercel.app` | **Blocked / Inconclusive** | N/A                                         | Deployment Ready; browser application access protected by Vercel SSO; no bypass token requested |
| Production `https://saledock.site` | `https://saledock.site`                                                              | Not reproduced            | No                                          | Public read-only routes; no login or mutation                                                  |

## Local Dev Results

- `Content-Security-Policy-Report-Only` header present on every route.
- `unsafe-eval` present (expected for dev).
- Nonces are unique per request.
- No `x-nonce` response header leak.
- The color-theme inline script and Next.js root inline scripts carry a matching nonce.
- **A React hydration warning is emitted on every route.** After redaction, the warning matches the pattern for a server/client attribute mismatch on the color-theme `<script>` tag. The server-rendered nonce value and the client-rendered nonce value differ, which is exactly the MN-007 symptom.
- No framework error overlays detected.
- No page errors, no dialogs, no non-trivial request failures.
- Zero CSP report attempts observed.

## Local Production Results

- `Content-Security-Policy-Report-Only` header present on every route.
- `unsafe-eval` absent (expected for production builds).
- Nonces are unique per request.
- No `x-nonce` response header leak.
- The color-theme inline script and Next.js root inline scripts carry a matching nonce.
- **No hydration warning is observed.**
- No framework error overlays detected.
- Some external `_next` scripts do not carry a nonce attribute (recorded in test annotations). This does not trigger a hydration warning because those scripts are loaded via `src` and are covered by the bootstrap script’s `strict-dynamic` trust propagation.
- `net::ERR_ABORTED` requests for `_rsc` (React Server Components) and Vercel analytics scripts were observed during context teardown and are filtered out as noise.
- Zero CSP report attempts observed.

## Vercel Preview Results

- **Preview URL:** `https://saledock-cloud-pos-git-qa-csp-non-e4e51f-fardan-aatirs-projects.vercel.app`
- **Deployment status:** Ready on Vercel.
- **Application access status:** Blocked by deployment protection. Any unauthenticated request to the preview URL returns `HTTP 302` to `https://vercel.com/sso-api`.
- **Decision:** Keep the preview protected. No Vercel protection-bypass token was requested, stored, or used.
- **Impact:** Vercel preview application verification is blocked by deployment protection; no SaleDock CSP or hydration response was inspected.
- **Skipped tests:** 10 (all route/viewport combinations).
- No CSP nonce or hydration data was collected from this environment.

## Production Results

- `Content-Security-Policy-Report-Only` header present on every route.
- `unsafe-eval` absent (expected for production builds).
- Nonces are unique per request.
- No `x-nonce` response header leak.
- The color-theme inline script and Next.js root inline scripts carry a matching nonce.
- **No hydration warning is observed.**
- No framework error overlays detected.
- Some external `_next` scripts do not carry a nonce attribute (recorded in test annotations); no mismatch observed.
- `/api/csp-report` POSTs were intercepted, counted, and blocked by the test harness. Zero attempts observed.

## Evidence Corrections Applied

1. **Real framework-overlay check:** Added `assertNoFrameworkErrorOverlay` which inspects the `nextjs-portal` for a visible dialog containing error text (Unhandled Runtime Error, Runtime Error, Build Error, Hydration failed, Application error, error overlay). It does not hide or remove the portal; it only asserts that an error overlay is not present.
2. **CSP report attempt tracking:** The read-only E2E routes now intercept `**/api/csp-report`, record the environment, route under test, HTTP method, and attempt number, then abort the request. Attempted and blocked counts are annotated per test. No report bodies are recorded.
3. **Preview SSO preflight:** For `CSP_TEST_ENV=preview`, a dedicated preflight test verifies the Vercel SSO redirect and skips all application-route assertions with a precise reason.
4. **JSON-LD source honesty:** The source-contract test no longer asserts that the JSON-LD script lacks a nonce. It asserts the script exists, records whether an explicit nonce is present via a diagnostic message, and does not fail on either state.

## Files Added

- `tests/csp-nonce-flow.test.mjs` — source-contract tests that verify nonce generation, CSP construction, header forwarding, and component-level nonce propagation without launching a browser.
- `tests/e2e/csp-nonce-hydration-verification.spec.ts` — Playwright E2E spec that runs the environment matrix, classifies hydration warnings, checks framework overlays, and tracks CSP report attempts.
- `docs/qa/csp-nonce-hydration-verification.md` — this report.

## Source-Contract Test Summary

All 19 assertions in `tests/csp-nonce-flow.test.mjs` pass:

- `src/proxy.ts` generates a per-request nonce and includes it in the CSP `script-src` directive.
- CSP is report-only and uses `strict-dynamic`.
- `unsafe-eval` is added only in dev.
- `src/lib/supabase/session-update.ts` forwards the `x-nonce` header and CSP headers through Supabase SSR responses.
- `src/app/layout.tsx` applies the nonce to the color-theme script and passes it to `AnalyticsNotice`.
- `src/app/page.tsx` passes the nonce to `MetaPixel`.
- The JSON-LD script on the landing page is present; the diagnostic records whether an explicit nonce is present.

## Classification

- **Dev:** MN-007 is reproducible. The color-theme script hydration warning appears because the server and client render different nonce values for the same inline script. This is consistent with a per-request nonce that the client cannot deterministically recompute.
- **Local production:** MN-007 is **not** reproducible when tested through `next build` plus `next start` under the tested routes.
- **Vercel preview:** MN-007 verification is **blocked / inconclusive** because Vercel preview application access is protected by SSO. The deployment is Ready, but no SaleDock CSP or hydration response was inspected.
- **Production:** MN-007 is **not** reproducible on `https://saledock.site`. The server-rendered inline scripts hydrate cleanly and no nonce-mismatch warnings are emitted.

## Confidence and Limitation

**Confidence:** High that there is no currently observed production impact.

**Limitation:** Not absolute across preview because preview application rendering was inaccessible. The classification covers all environments that were successfully tested (local dev, local production, production) and honestly records the preview limitation.

## Recommended Action

- Do not change CSP source.
- Do not change nonce propagation.
- Do not weaken security or preview protection.
- Keep the dev-only warning documented.
- Revisit only if the warning appears under `next start`, production, an accessible preview, or a future framework upgrade changes behavior.
- No speculative source fix is justified by the current production-like evidence.

## Next Steps

1. Keep this PR in DRAFT state.
2. Keep Vercel preview protection enabled.
3. Preserve the preview environment as blocked / inconclusive in the report and PR body.
4. Review the test-only evidence.
5. Request review from the owner before marking the PR ready or merging.

## Known Limitations

- The Vercel preview URL discovered in this PR is protected by SSO, so the environment matrix is incomplete for that specific deployment. The limitation is documented; no bypass was attempted.
- The test does not fix the underlying nonce mismatch; it only records and classifies it.

## Validation Summary

- `npm run lint`: passes (0 errors, only pre-existing warnings).
- `npm run typecheck`: passes.
- `npm run build`: passes.
- `node --test tests/csp-nonce-flow.test.mjs`: 19 passed.
- Local dev E2E: 10 passed, 1 skipped (preview preflight).
- Local production E2E: 10 passed, 1 skipped (preview preflight).
- Preview E2E: 1 passed (SSO preflight), 10 skipped (application routes blocked by SSO).
- Production E2E: 10 passed, 1 skipped (preview preflight).
- No raw nonce values appear in output.
- No CSP reports were stored.
- PR #286 remains unchanged.
