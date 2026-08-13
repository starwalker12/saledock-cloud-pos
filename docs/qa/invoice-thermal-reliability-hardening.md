# Invoice Thermal Reliability Hardening

## Scope

This record covers the owner-authorized Invoice-only thermal-print reliability correction based on `9afca739633ec078231f32248bf75124307b0fdc`.

The correction changes only the Invoice print lifecycle and Invoice-scoped print CSS. It does not change the Invoice receipt source, invoice data, Returns, Repairs, Daily Closing, Reports, accounting, settlement, permissions, schema, or migrations. Production was not accessed or modified during this source task.

## Historical symptom

The retained prior production evidence showed an 80mm preview with a blank trailing second page.

Frozen baseline evidence:

- Path: `/Users/sw12/Projects/saledock-local-evidence/invoice-thermal-blank-page-fix`
- Manifest SHA-256: `c9cccc84261dba8e52cc508fb4c2b85899ad5ebad551d636f824ec31d8fa7723`
- Entries verified read-only: 15

## Current reproduction result

The exact second-page symptom could not be reproduced on Chromium `148.0.7778.96`.

The historical two-page symptom remains real retained evidence, but its exact historical root cause was not reproducible on current Chromium. The correction below addresses independently proven current thermal-print defects that can produce invalid or inconsistent thermal output.

`LIVE-INVOICE-THERMAL-BLANK-PAGE-001` therefore remains open during this draft source task.

## Deterministic current defects

1. The shared `@page thermalReceipt { size: 80mm auto; }` rule was invalid or unreliable for current Chromium. The Invoice thermal path could fall back to an approximately A4-sized `594.96 x 841.92` point page.
2. A valid 80mm simulation exposed inconsistent geometry: an 80mm body/main was placed inside an 80mm physical page with 4mm left and right margins, clipping the 72mm receipt at the right edge.
3. Invoice print state was removed by an unconditional 1200ms timer even when Chrome was still preparing preview. Two otherwise equivalent attempts diverged between thermal and A4/screen-like output.

The frozen investigation classified the exact historical two-page reproduction as `OUTCOME G - EXACT HISTORICAL TWO-PAGE SYMPTOM NOT REPRODUCED` while independently proving all three current defects above.

## Correction

The correction hardens the current Invoice thermal-print path against independently proven page-sizing, width, and lifecycle defects. The historical blank-page root cause remains unproven.

- Adds the Invoice-only body marker `data-invoice-thermal-print="true"`.
- Adds the Invoice-only measurement marker `data-invoice-thermal-measuring="true"`.
- Adds the Invoice-only named page `invoiceThermalReceipt` without changing the shared, Returns, or Repairs named pages.
- Measures the existing `.thermal-print` receipt off-screen at the real 72mm printable width.
- Waits for `document.fonts.ready`, receipt images, image decode, and stable animation frames.
- Converts CSS pixels with `25.4 / 96`, adds 8mm physical vertical margins and a 1mm allowance, and rounds upward to 0.1mm.
- Rejects non-finite, less-than-20mm, or greater-than-5000mm measurements with an inline retryable error.
- Generates one valid absolute `80mm x <measured-height>mm` page rule with 4mm margins.
- Keeps Invoice body, main, and receipt geometry at 72mm with no additional layout margin.
- Removes the unconditional 1200ms teardown.
- Owns cleanup through `afterprint`, print-media transitions, and a bounded post-dialog focus fallback.
- Uses one component-local attempt identity, synchronous in-flight locking, cancellation checks, and unmount cleanup.
- Keeps A4 separate from all Invoice thermal markers and dynamic styles.
- Leaves the WhatsApp text, phone normalization, image generation, modal, Copy Text, and download behavior intact.

The 5000mm maximum is a tested current-Chromium/PDF safety bound, not a printer capability claim. Oversize content fails before `window.print()`.

## Current artifacts

The accepted disposable production-mode run used the actual Invoice page, actual hidden thermal receipt, loopback Supabase, Playwright `1.60.0`, and Chromium `148.0.7778.96` with zero automatic retries.

Standard thermal:

- Pages: 1
- Physical dimensions: `227.04 x 347.04` points
- Physical width: approximately 80mm
- Measured height: 122.4mm
- Left/right whitespace: `11.25 / 11.70` points
- Clipping: none
- Blank trailing page: none
- Header, invoice identity, date, customer, cashier, item, totals, payment, note, and footer: complete

Long thermal:

- Pages: 1
- Physical dimensions: `227.04 x 1173.12` points
- Physical width: approximately 80mm
- Measured height: 413.9mm
- Height increase over standard: 291.5mm
- Left/right whitespace: `11.25 / 11.70` points
- Nineteen long wrapped product names, totals, payment, repeated note, and footer: complete
- Clipping: none
- Blank trailing page: none

A4:

- Pages: 1
- Physical dimensions: `595.92 x 842.88` points
- Invoice thermal marker: absent
- Invoice thermal dynamic style: absent
- Content: complete and unclipped

## Lifecycle proof

- A 1600ms held preview retained `data-print-mode="thermal"`, the Invoice marker, and exactly one dynamic page style. The old 1200ms timer would already have removed that state.
- Five deterministic thermal cycles each produced exactly one print call with the Invoice marker and valid named-page rule.
- Two same-tick thermal activations produced one preparation, one style, and one print call.
- Navigation/unmount during held image decode produced zero later print calls, recreated styles, recreated markers, or false error messages.
- Invalid oversize measurement produced no print, removed temporary state, displayed the inline error, and permitted a later fresh attempt.
- Final fixture cleanup had zero retries and zero failures.

## Shared regressions

- Invoice direct contracts: 16/16.
- Combined focused print/data contracts: 107/107.
- Invoice reliability E2E: 1/1, zero Playwright retries.
- Invoice filters, Invoice print wording, and print touch targets: passed.
- Returns standard: 3/3.
- Returns long: 3/3.
- Repairs standard/long/lifecycle: 4/4.
- Reports full-document pagination: 1/1.
- Cookie banner print hiding: 1/1 after rebuilding with the test's documented dummy analytics configuration.
- Complete Node suite: 352/352.
- Typecheck: passed.
- Production build: passed.

The first combined cookie-print launch was discarded because the local build omitted an analytics identifier, so the consent component correctly did not mount. The first complete Node launch was discarded at 349/351 because the two loopback seed-lot checks were invoked without their required local Supabase keys. Both commands passed after their documented local environment was supplied. Earlier Invoice E2E harness-development launches were also discarded for test-only expectation and instrumentation classification corrections; all disposable fixture cleanups succeeded.

Three retained-root launches were also discarded without overwriting evidence: Playwright discovery exposed module-level evidence-directory acquisition, the analytics-enabled consent setup produced one UI-preference POST after observation began, and a later read returned 200 instead of the previously observed optional 406. The first produced only an empty directory and performed no Supabase access; the latter two completed zero-retry fixture cleanup with equal business signatures. Each unsealed attempt was preserved under a distinct `invoice-thermal-reliability-hardening-discarded-*` path before the required retained path was acquired once by the accepted worker run.

## Business safety

- Production access or mutation: none.
- Accepted Invoice reliability fixture cleanup: marker invoices 0, invoice items 0, payments 0, customers 0, suppliers 0.
- Stock changes: 0.
- FIFO changes: 0.
- Cash Drawer changes: 0.
- Before/after business signatures: equal.
- Migrations and schema: unchanged.
- Financial and settlement sources: unchanged.

## Evidence

New fail-closed evidence is retained at:

`/Users/sw12/Projects/saledock-local-evidence/invoice-thermal-reliability-hardening`

The retained directory contains the standard, long, and A4 PDFs and renders; width measurements; lifecycle, cancellation, rapid-click, screen, cleanup, and shared-regression records; a final report; and one sealed SHA-256 manifest. It references but does not copy or alter the frozen baseline.

- Manifest entries: 25
- Manifest SHA-256: `7f694bad2ee195b6c3c486ae438ca9f4277b21267c630783307e2209136e2424`

## Current status

- Classification: draft source correction pending owner review.
- P0: 0.
- P1: 0.
- P2: 2.
- P3: 5.
- `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`: open pending owner review, delivery, exact production deployment, and authenticated saved-artifact inspection.
- `ACCEPTED WITH LIMITED CASHIER COVERAGE - P2`: open.
- Canonical synchronization: deferred.
- Audit-ready: no.
- MVP-live: no.

## Rollback

Close the draft PR if the correction is rejected. No production rollback applies because production was not accessed or modified. Preserve both the frozen baseline and the new reliability evidence directories.
