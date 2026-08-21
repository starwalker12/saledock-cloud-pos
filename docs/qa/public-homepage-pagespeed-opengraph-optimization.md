# Public Homepage PageSpeed and Social Preview Optimization

## Scope

- Task: `42673`
- Starting main: `b1c8b4cd737f13f2923f11dd59fc462591fe4644`
- Surface: unauthenticated public homepage only
- Production access or mutation: none
- Database, migration, RLS, authorization, accounting, stock/FIFO, and Cash Drawer changes: none
- Cashier coverage: remains open and was not resumed

The owner-provided 2026-08-21 PageSpeed results are Lighthouse lab data, not CrUX field data. Mobile reported Performance 82, Accessibility 94, Best Practices 96, SEO 100, FCP 1.2 s, LCP 4.7 s, TBT 0 ms, CLS 0, and Speed Index 3.1 s. Desktop reported 99, 94, 96, and 100 with FCP 0.3 s, LCP 0.9 s, TBT 0 ms, CLS 0, and Speed Index 0.5 s. Agentic Browsing was 2/2.

OpenGraph.xyz reported 0 errors, 3 warnings, and 10 passes. Its warnings concerned conversion text in the social image, the 145-character description, and a title it reported as 63 characters. The exact page-level source title was 59 Unicode characters.

## Comparable Baseline

The untouched starting main was built with Next.js 16.2.6 and measured through Lighthouse 13.4.1 in Chrome 151.0.7922.138. Three sequential runs were recorded for each form factor against the same local production server.

| Form factor    | Performance | Accessibility | Best Practices | SEO |    FCP |    LCP |   TBT |     CLS | Speed Index |
| -------------- | ----------: | ------------: | -------------: | --: | -----: | -----: | ----: | ------: | ----------: |
| Mobile median  |          78 |            98 |             92 | 100 | 1.36 s | 5.41 s | 75 ms |       0 |      1.65 s |
| Desktop median |          98 |            98 |             92 | 100 | 0.37 s | 1.17 s |  0 ms | 0.00013 |      0.38 s |

Six earlier launches without the loopback Supabase configuration were discarded because they measured a configuration-error screen rather than the homepage.

## Findings

### LCP

The baseline LCP element in all six comparable runs was the cookie-consent paragraph. The global consent client statically imported the Supabase browser client, waited for an account lookup, and delayed the anonymous banner. The homepage server component already resolves authenticated visitors before rendering the public page, so that account lookup was unnecessary for an anonymous homepage render.

The hero logo and headline also began at `opacity: 0` through entrance animation. That did not become the comparable baseline LCP only because the later consent paragraph was larger, but it kept core first-screen content from being immediately paintable.

### Render blocking and fonts

The baseline loaded two generated CSS resources totaling about 35 KiB and Lighthouse estimated roughly 390 ms of mobile render-blocking opportunity. A broad global stylesheet rewrite was not justified by this focused task.

The English homepage response also preloaded four font files. Geist and Syne were used immediately. Geist Mono (about 24 KiB) and Noto Nastaliq Urdu (about 240 KiB) were not needed for the initial English render.

### Unused JavaScript

The largest avoidable contributor was the statically imported Supabase client chunk: about 116.6 KiB transferred with about 95.7 KiB unused in the Lighthouse treemap. The remaining reported unused JavaScript is primarily shared Next.js runtime/polyfill code. Analytics, consent controls, language controls, and privacy behavior were retained.

### Motion

The exact non-composited animation was the light-mode hero gradient layer animating `background-position`. The final homepage uses a static layered gradient. No final Lighthouse non-composited-animation item remains.

### Accessibility

The homepage lacked a primary `main` landmark. Light-mode contrast failures affected six illustrative dashboard status values and the footer links, email, and copyright text. Dark-mode contrast already passed.

### Best Practices and DevTools Issues

The baseline DevTools/Lighthouse inspector issue was site-owned report-only CSP noise from the theme bootstrap and the eagerly loaded Supabase chunk. The request nonce is now passed to the theme provider, and the anonymous homepage no longer loads the Supabase chunk. The final Lighthouse `inspector-issues` audit passes.

Local Best Practices remains 96 only because Vercel Analytics and Speed Insights script endpoints return 404 under `next start`; production supplies those endpoints. A separate Chrome `DocumentCookie` performance advisory maps to the established language cookie fallback and is not the Lighthouse deduction. Its cross-request language behavior was not changed without a separate safe design.

## Correction

- Added one keyboard-visible skip link, a semantic public `header`/`nav`, and one `main#main-content`; the footer remains outside `main`.
- Replaced failing light-mode colors with WCAG AA-safe variants and strengthened footer contrast while retaining the dark palette.
- Made the LCP-critical logo, badge, heading, copy, CTA, and trust pills immediately paintable.
- Made the hero image eagerly discoverable with `fetchpriority="high"` and evidence-based responsive sizes.
- Removed the background-position animation while preserving the static branded hero treatment and reduced-motion behavior.
- Disabled eager preload for Geist Mono and Noto Nastaliq Urdu while retaining both font families for on-demand use.
- Deferred account-only Supabase consent code away from the anonymous homepage and preserved signed-in preference persistence on authenticated routes.
- Passed the request CSP nonce through the theme bootstrap provider.

## Metadata and Social Card

| Field              | Before                                                             | After                                                   |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------- |
| Document title     | `SaleDock Cloud POS — Free Retail POS & Inventory Management` (59) | `SaleDock Cloud POS — Free Retail POS & Inventory` (48) |
| Description        | 145-character platform description                                 | 122-character cloud POS description                     |
| Social title       | Same as the document title                                         | `Run your shop smarter with SaleDock` (35)              |
| Social description | Same as the old page description                                   | 103-character retail-focused description                |
| Social image       | `/og.png`                                                          | `/og-social-v2.png`                                     |

The versioned social card is a valid optimized 1200 x 630 PNG (59,817 bytes). It uses existing SaleDock brand assets, readable navy/teal contrast, the approved headline and supporting copy, `Free to start`, and `saledock.site`. Canonical URL, OpenGraph URL/type/locale, Twitter `summary_large_image`, indexing behavior, and structured data remain intact.

## Final Comparable Results

| Form factor    | Performance | Accessibility | Best Practices | SEO |    FCP |    LCP |  TBT |     CLS | Speed Index |
| -------------- | ----------: | ------------: | -------------: | --: | -----: | -----: | ---: | ------: | ----------: |
| Mobile median  |          88 |           100 |             96 | 100 | 1.36 s | 3.84 s | 6 ms |       0 |      1.36 s |
| Desktop median |         100 |           100 |             96 | 100 | 0.37 s | 0.81 s | 0 ms | 0.00013 |      0.37 s |

Mobile LCP improved by about 29% and Performance improved by 10 points in the comparable median. One of three exact-source mobile runs scored 91. The aspirational 2.5 s median was not reached in this local throttled environment, so the result is reported without score inflation. Desktop performance and LCP improved rather than regressed.

The final LCP is the SaleDock hero logo. Lighthouse confirms that it is discoverable in the initial document, eagerly loaded, and high priority. The median run's observed LCP phase values were about 42 ms TTFB, 5 ms resource delay, 8 ms resource load, and 123 ms element render delay before simulated throttling projection.

## Cloudflare Web Analytics Continuation

Task `73105` extends the same draft PR with Cloudflare Web Analytics for `saledock.site`. The public beacon token has one named configuration point in the root layout and is passed through the existing Analytics consent category. The Cloudflare module is rendered with the request nonce and `afterInteractive` only after Analytics acceptance. It remains absent before a decision, after Reject All, and when Marketing alone is accepted. Client navigation retains one script, and changing Analytics from accepted to rejected preserves the existing full-document reload so Cloudflare, GA4, and Clarity stop together.

Cloudflare Web Analytics is classified accurately as cookie-free. The consent UI now distinguishes Analytics tools from cookies, while Marketing and Meta Pixel remain separate. The focused Privacy Policy names Cloudflare as an aggregate website-usage and real-user-performance processor that SaleDock loads only after Analytics consent, and states that Cloudflare does not use client-side cookies or local storage for its measurement.

The report-only CSP keeps its nonce, `strict-dynamic`, report endpoint, and existing source list. It adds only:

- `https://static.cloudflareinsights.com` to `script-src`;
- `https://cloudflareinsights.com` to `connect-src`.

The Cloudflare script also uses `crossorigin="anonymous"`. Next.js preloads `afterInteractive` module scripts in the App Router; matching CORS mode on the preload and module load prevents a duplicate network transfer while retaining exactly one official beacon script. No GTM, SDK, custom event, manual page-view implementation, wildcard CSP source, or production environment requirement was added.

### Consent and Network Proof

The deterministic production-mode browser contract covers undecided, Reject All, Marketing-only, Analytics accepted, client navigation, and accepted-to-rejected states. It proves one module script with the exact configured token, no duplicate script/request, and absence after the rejection reload. External requests are intercepted in that contract so test success does not depend on Cloudflare availability.

A separate Chrome 151.0.7922.170 local production-mode profile used the real external module. Before consent it observed zero Cloudflare scripts and zero Cloudflare requests. After Analytics acceptance it observed one 31,612-byte beacon response, one Cloudflare RUM POST attempt, one GA4 script path, and one Clarity script path. The RUM request was rejected by Cloudflare's localhost CORS policy because the test origin included a nonstandard port; no backend success is claimed. There were zero page errors, zero CSP reports, one script after client navigation, and no Cloudflare-named cookie, local-storage key, or session-storage key. Production traffic was not used.

### Continuation Performance Check

The continuation was rebuilt with Next.js 16.2.6 and measured using Lighthouse 13.4.1 in Chrome 151.0.7922.170. Three sequential no-consent runs per form factor used the same local production-mode configuration as the accepted PR baseline.

| Form factor    | Performance | Accessibility | Best Practices | SEO |    FCP |    LCP |    TBT |     CLS | Speed Index | Cloudflare requests |
| -------------- | ----------: | ------------: | -------------: | --: | -----: | -----: | -----: | ------: | ----------: | ------------------: |
| Mobile median  |          88 |           100 |             96 | 100 | 1.35 s | 3.83 s | 2.5 ms |       0 |      1.35 s |                   0 |
| Desktop median |          99 |           100 |             96 | 100 | 0.36 s | 0.85 s |   0 ms | 0.00013 |      0.36 s |                   0 |

Mobile Performance remained 88 and LCP changed from 3.84 s to 3.83 s. Desktop Performance varied from 100 to 99 while LCP changed from 0.81 s to 0.85 s, with unchanged FCP, TBT, and CLS behavior. This is normal run variance rather than a material regression. All six no-consent runs made zero Cloudflare requests, so the new integration adds no anonymous first-load analytics dependency.

## Analytics Consent Withdrawal Durability Correction

Task `49163` starts from production source main `52649df432d55626e13ea4e6364e76d0a80f11f0`. The production homepage quality, metadata, social card, accessibility, CSP, and Cloudflare consent behavior remain accepted. The remaining production acceptance failure was limited to GA4 and Microsoft Clarity cookie durability after an already-accepted visitor withdrew Analytics consent.

The sealed production report at `/Users/sw12/Projects/saledock-local-evidence/public-homepage-quality-cloudflare-production-verification` recorded two independent withdrawal cycles. SaleDock removed `_ga` and `_clck`, and the rejected reload contained no optional analytics scripts, but `_ga_V75KZ49E54` and `_clsk` could remain or reappear. That evidence manifest remains `bff3c956b4711d3e480198a38ef9319ea23e12ccc1883352e811f4b47c3180ad` and was reverified without modification.

### Proven causes

The exact-main production-mode baseline reproduced the anonymous failure with a real Chromium cookie jar and deterministic running-vendor doubles. The old order persisted rejection, deleted cookies, left both vendor runtimes active for approximately 50 ms, and then reloaded. During that interval the GA double rewrote `_ga` and a dynamically named `_ga_TESTMEASUREMENT` cookie, while the Clarity double rewrote `_clck` and `_clsk`. All four survived into a rejected page that correctly contained zero GA, Clarity, or Cloudflare script elements. This proves a live-runtime rewrite race rather than a missing cookie-name list.

A separate loopback-only signed-in baseline proved a second race. The component wrote the rejected choice to local storage, but `saveSidebarPreferences` deferred the database update for one second while the page reloaded after roughly 50 ms. The old accepted database value therefore survived and replaced the local rejection after reload. The temporary local preference fixture was restored in `finally`.

The accepted local cookies use `Path=/`, `SameSite=Lax`, and the loopback `localhost` host. The retained production evidence reports the corresponding GA and Clarity cookies on `.saledock.site` with `Path=/` and `SameSite=Lax`. The existing cleanup remains deliberately limited to host-only, exact-hostname, and dot-hostname variants on `/`; no arbitrary parent-domain or path sweep was added.

### Correction

Withdrawal now follows this order:

1. Persist the SaleDock rejection synchronously in local storage.
2. Set `window["ga-disable-<measurement-id>"] = true` through the dynamic configured ID and send `gtag("consent", "update", { analytics_storage: "denied" })` when `gtag` exists.
3. Send Clarity Consent V2 denial with both `ad_Storage` and `analytics_Storage` set to `denied` when Clarity exists.
4. Clear `_ga`, every visible `_ga_*`, `_clck`, and `_clsk`, plus the independently selected Marketing cookies only when Marketing is rejected.
5. For a signed-in withdrawal, await one immediate update of the existing `user_ui_preferences.sidebar_preferences` value before permitting reload. If that update fails, SaleDock keeps the local rejection and vendor shutdown but skips reload rather than allowing the old account value to win.
6. On the next browser task, perform one deterministic analytics-cookie cleanup and reload immediately. The old arbitrary 50 ms race window is removed.
7. The rejected page renders no optional analytics scripts. A later fresh acceptance loads GA4, Clarity, and Cloudflare normally; the per-document GA disable flag does not leak into the new consented lifecycle.

The Google behavior follows the official Google tag consent-update and `ga-disable-<measurement-id>` controls. The Clarity behavior uses Microsoft's current recommended `consentv2` API. The older Clarity `consent(false)` erasure call was not added because Consent V2 shutdown followed by the existing narrow first-party cleanup passed deterministically.

### Local proof and boundaries

- New withdrawal E2E: 2/2, zero retries. Anonymous coverage proves the undecided, rejected, Marketing-only, accepted, withdrawn, and accepted-again matrix; shutdown calls precede deletion; no GA or Clarity mock network activity occurs after its shutdown point; all four test cookies are absent after reload; and Cloudflare stays isolated and cookie-free.
- Signed-in persistence: the loopback database contains `analyticsConsent: rejected` before reload completes, the rejected value remains after reload, all optional analytics scripts remain absent, and the temporary preference fixture is restored.
- Existing public-homepage and Cloudflare E2E: 3/3, zero retries.
- Cookie-banner/sidebar and print-output E2E: 3/3. The production-only CSP browser matrix was not rerun against production; its local launch skipped 11 production-target cases by design.
- Focused source and CSP contracts: 36/36.
- Complete Node suite: 389/389.
- Lint: zero errors; two pre-existing `privacy-center.tsx` hook-dependency warnings remain.
- Typecheck and production build: pass.
- PageSpeed, metadata, OpenGraph, social image, Privacy Policy, CSP destinations, Cloudflare implementation, POS, accounting, stock/FIFO, database schema, and production data: unchanged.
- Production access and production mutations in task `49163`: zero.
- Authenticated Cashier coverage remains open and was not resumed.

Continuation evidence is retained outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/analytics-consent-withdrawal-cookie-cleanup-fix`

Evidence manifest SHA-256: `eb10260a79fcfd348a4881bea356949ddf30175f25dc8f06eaa836bb10fb73a0`.

This correction is draft-only pending independent owner review. It is not merged or deployed, and production withdrawal acceptance has not been rerun.

## Validation

- Homepage source contracts: 8/8
- Cloudflare-extended homepage source contracts: 10/10
- CSP nonce-flow contracts: 19/19
- Focused production-mode E2E: 3/3, zero automatic retries
- Complete Node suite: 382/382 with the existing loopback environment
- First complete Node launch without environment loading: discarded; only two seed-stock tests lacked required local keys
- Axe WCAG 2 A/AA: zero violations in light and dark modes
- Lighthouse main landmark and color contrast: pass
- Non-composited animations: zero reported items
- Responsive visual review: 320x568, 390x844, 430x932, and 1440x900 in light and dark modes
- Horizontal overflow: none at all reviewed viewports
- Scroll-reveal sections: all six section headings visible after ordinary scrolling at every reviewed viewport
- Reduced motion: pass
- English and on-demand Urdu font behavior: pass
- Cloudflare consent lifecycle and client-navigation deduplication: pass
- Cloudflare cookies/client storage observed: none
- Browser page errors: zero
- Local-only expected request failures: Vercel Analytics/Speed Insights endpoints and cancelled Next link-prefetch requests
- Two earlier focused E2E launches were discarded after test-harness corrections for CSS `lab()` color parsing and theme initialization; neither exposed a product defect
- Two Cloudflare E2E baseline launches reproduced a duplicate module transfer caused by mismatched preload CORS mode; the source correction added matching anonymous CORS and the accepted rerun passed 3/3
- One external-network harness launch was discarded because it incorrectly waited for a nonvisual script element to become visible; the corrected attached-state harness passed
- Lint, typecheck, production build, hosted checks, and exact draft PR review: recorded in the final task report

## Evidence

Evidence is retained outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/public-homepage-pagespeed-opengraph-optimization`

The bundle contains owner baseline notes, discarded-run chronology, baseline and final Lighthouse JSON, LCP and network evidence, accessibility and DevTools findings, font and JavaScript evidence, responsive screenshots, metadata and image checks, test/build output, and the final report. It contains no credentials, cookies, authorization headers, private shop data, or production data.

Cloudflare continuation evidence is retained separately at:

`/Users/sw12/Projects/saledock-local-evidence/public-homepage-cloudflare-analytics-continuation`

It contains the starting PR/head, source and CSP proof, consent matrix, no-consent Lighthouse runs, real accepted-consent network observation, responsive/accessibility checks, validation output, hosted review, and the continuation final report. The client-visible Cloudflare site token appears only where required by the integration and tests; no Cloudflare account credential or private token is retained.

## Delivery Boundary

This branch is for a draft pull request only. It does not authorize merge or production deployment. Production access and production mutations are zero. Authenticated Cashier coverage remains open and was not resumed.
