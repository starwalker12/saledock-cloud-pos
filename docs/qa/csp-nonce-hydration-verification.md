# QA Verification: CSP Nonce Hydration (MN-007)

**Status:** In Progress — DRAFT PR only  
**Branch:** `qa/csp-nonce-hydration-verification`  
**Base commit:** `12cddabc28bf49d58af5e30fbb8d4f7f04a42af1` (origin/main)  
**Goal:** Verify whether the CSP nonce hydration warning (MN-007) is reproducible across local dev, local production, Vercel preview, and production `https://saledock.site`, without changing any CSP behavior.

## Scope & Safety Rules

- Test-and-documentation only; no CSP, middleware, auth, database, or production config changes.
- Public routes only: `/`, `/login`, `/privacy`, `/terms`, `/auth/invite?error=otp_expired`.
- No login, no production mutation, no checkout/stock/money/report logic touched.
- CSP report endpoint (`/api/csp-report`) is blocked in preview and production tests.
- All nonce values are redacted in this document and in test output.

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
7. Console warnings and page errors are captured and classified for hydration / nonce mismatch content.

## Environment Matrix

| Environment | Base URL | Status | Hydration Warning | Notes |
|-------------|----------|--------|-------------------|-------|
| Local dev   | `http://localhost:3000` | Pass (observed) | **Yes** — color-theme script nonce mismatch | Full details below |
| Local production | `http://localhost:3001` | Pass | No | Full details below |
| Vercel preview | TBD | Pending | TBD | URL will be added after Vercel deploys the branch |
| Production `https://saledock.site` | TBD | Pending | TBD | Will run after preview verification |

## Local Dev Results

- `Content-Security-Policy-Report-Only` header present on every route.
- `unsafe-eval` present (expected for dev).
- Nonces are unique per request.
- No `x-nonce` response header leak.
- The color-theme inline script and Next.js root inline scripts carry a matching nonce.
- **A React hydration warning is emitted on every route.** After redaction, the warning matches the pattern for a server/client attribute mismatch on the color-theme `<script>` tag. The server-rendered nonce value and the client-rendered nonce value differ, which is exactly the MN-007 symptom.
- No page errors, no dialogs, no non-trivial request failures.

## Local Production Results

- `Content-Security-Policy-Report-Only` header present on every route.
- `unsafe-eval` absent (expected for production builds).
- Nonces are unique per request.
- No `x-nonce` response header leak.
- The color-theme inline script and Next.js root inline scripts carry a matching nonce.
- **No hydration warning is observed.**
- Some external `_next` scripts do not carry a nonce attribute (recorded in test annotations). This does not trigger a hydration warning because those scripts are loaded via `src` and are covered by the bootstrap script’s `strict-dynamic` trust propagation.
- `net::ERR_ABORTED` requests for `_rsc` (React Server Components) and Vercel analytics scripts were observed during context teardown and are filtered out as noise.

## Files Added

- `tests/csp-nonce-flow.test.mjs` — source-contract tests that verify nonce generation, CSP construction, header forwarding, and component-level nonce propagation without launching a browser.
- `tests/e2e/csp-nonce-hydration-verification.spec.ts` — Playwright E2E spec that runs the environment matrix and classifies hydration warnings.
- `docs/qa/csp-nonce-hydration-verification.md` — this report.

## Source-Contract Test Summary

All 19 assertions in `tests/csp-nonce-flow.test.mjs` pass:

- `src/proxy.ts` generates a per-request nonce and includes it in the CSP `script-src` directive.
- CSP is report-only and uses `strict-dynamic`.
- `unsafe-eval` is added only in dev.
- `src/lib/supabase/session-update.ts` forwards the `x-nonce` header and CSP headers through Supabase SSR responses.
- `src/app/layout.tsx` applies the nonce to the color-theme script and passes it to `AnalyticsNotice`.
- `src/app/page.tsx` passes the nonce to `MetaPixel`.
- The JSON-LD script on the landing page is present and intentionally has no explicit nonce.

## Classification

- **Dev:** MN-007 is reproducible. The color-theme script hydration warning appears because the server and client render different nonce values for the same inline script. This is consistent with a per-request nonce that the client cannot deterministically recompute.
- **Local production:** MN-007 is **not** reproducible in the static production build under the tested routes. The server-rendered inline scripts hydrate cleanly.
- **Preview / production:** Pending.

## Next Steps

1. Push this branch and open a DRAFT PR.
2. Wait for the Vercel preview URL.
3. Run the E2E spec against the preview URL with `CSP_TEST_ENV=preview`.
4. Run the E2E spec against `https://saledock.site` with `CSP_TEST_ENV=production`.
5. Update this document with the preview and production results.
6. Request review from the owner before marking the PR ready or merging.
