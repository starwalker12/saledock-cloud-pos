# Returns Thermal Centered Dynamic Page Fix

## Scope

- Base SHA: `2b24fcf7b88812987ed415426e5f5a715c6e6ea4`
- Branch: `fix/returns-thermal-centered-dynamic-page`
- Finding: `RET-PRINT-001`
- Amendment finding: `RET-PRINT-001-LIFECYCLE`
- Environment: local production build, loopback Supabase, Chromium, Poppler, and pdfplumber
- Production access: none

This is a print-presentation fix. It does not verify or change return accounting, refund calculations, stock or FIFO restoration, payments, balances, daily closing, reports formulas, authentication, permissions, or database behavior.

## Prior Evidence

- Original explicit-width baseline: 80mm page with 34.3% content span and miniature output.
- Invalid shared CSS rule: `size: 80mm auto` falls back to A4 when CSS page sizing is preferred.
- Valid-page-only proof: 80mm by 150mm and 86.4% span, but right-aligned content clipped.
- Valid-page-only bounds: 22.58 to 218.74 points, with 22.58 and 8.30 points of physical whitespace.
- Body-page and AppShell-context experiments did not resolve the defect.
- Successful centered-page proof: 72mm body/main/receipt context, 89.9% span, 11.25 to 215.34 point bounds, 0.45 point whitespace difference, and no clipping.

All six prior worktrees were frozen before implementation and are rechecked after validation.

## Source Design

Changed application files:

- `src/app/globals.css`
- `src/app/returns/[id]/print-button.tsx`

The implementation adds a Returns-specific page named `returnsThermalReceipt`. Its valid fallback is 80mm by 297mm with 4mm margins. The existing shared `thermalReceipt` page remains unchanged for unrelated print surfaces.

Returns thermal printing sets both `data-print-mode="thermal"` and `data-returns-thermal-print="true"`. CSS scoped to both markers gives body, main, and the Returns thermal receipt a 72mm content width with no additional horizontal margin. No AppShell selectors or source changes are required.

## Measurement And Readiness

The hidden receipt is temporarily marked with `data-returns-thermal-measuring="true"` and rendered at 72mm in an invisible fixed position outside the viewport. It cannot receive pointer events and does not expand document scroll width.

Preparation waits for:

- `document.fonts.ready` when available;
- all receipt images to be complete and decoded where supported;
- two animation frames after measurement mode is active.

Readiness is bounded to five seconds. Failures clean all temporary state and show a generic non-native role-alert message.

The algorithm measures `getBoundingClientRect().height`, converts CSS pixels with `25.4 / 96`, adds 8mm for physical margins and a 1mm upward allowance, then rounds upward to 0.1mm. Invalid, non-finite, implausibly small, or unreasonably large heights are rejected without calling `window.print()`.

The temporary style ID is `returns-thermal-page-size`. It contains two absolute page dimensions and is removed by afterprint, timeout fallback, failure cleanup, or component unmount. The lifecycle amendment verifies that cancellation invalidates the exact asynchronous preparation attempt before this cleanup occurs.

## Standard Receipt

- Artifact: `/tmp/saledock-returns-thermal-production-fix/fixed-thermal-standard.pdf`
- Render: `/tmp/saledock-returns-thermal-production-fix/fixed-thermal-standard-render.png`
- Generated page rule height: 132.3mm.
- Physical dimensions: 227.04 by 375.12 points, approximately 80mm by 132.3mm.
- Pages: 1.
- Overall span: 89.9%.
- Five structural row spans: 89.9% each.
- Overall bounds: 11.25 to 215.34 points.
- Left/right whitespace: 11.25 and 11.70 points.
- Whitespace difference: 0.45 points.
- Physical margin checks: PASS.
- Right/left clipping: none.

Visual inspection found readable centered text, complete identifiers and right-aligned strings, wrapped long item text, aligned quantities and totals, visible notes and footer, no application chrome, and no blank page.

## Long Receipt

- Artifact: `/tmp/saledock-returns-thermal-production-fix/fixed-thermal-long.pdf`
- Render: `/tmp/saledock-returns-thermal-production-fix/fixed-thermal-long-render.png`
- Generated page rule height: 164.5mm.
- Physical dimensions: 227.04 by 466.08 points, approximately 80mm by 164.4mm.
- Height increase from standard: approximately 32.1mm.
- Pages: 1.
- Overall span: 89.9%.
- Five structural row spans: 89.9% each.
- Overall bounds: 11.25 to 215.34 points.
- Left/right whitespace: 11.25 and 11.70 points.
- Clipping: none.

The longer synthetic notes increase physical page height while horizontal position, span, wrapping, totals, and footer remain stable. Neither fixture height is hardcoded in production.

## Print Controls And Cleanup

- Thermal `window.print()` calls per activation: 1.
- A4 `window.print()` calls per activation: 1.
- Measurement marker at print call: absent.
- Returns thermal body marker at print call: present.
- Dynamic style count during print: 1.
- Rapid repeated activation: one preparation and one print call.
- Afterprint cleanup: PASS.
- 1200ms timeout cleanup: PASS.
- Missing-receipt failure: no print call; generic role-alert shown.
- Native dialogs: 0.
- Navigation: unchanged.
- Browser business writes: 0.

Cleanup removes the print mode, Returns marker, measurement marker, dynamic style, listener, timer, and in-flight lock idempotently.

## Async Lifecycle Amendment

Review found that the original cleanup closure was one-shot but thermal preparation had no cancellation identity. If afterprint or component unmount ran while image readiness was held, the old async continuation could resume after cleanup. The deterministic pre-amendment regression against head `e160dc10ec53c124855a5fd690e2f92e0a569829` resumed into the failure path and displayed one false generic role-alert. That run produced zero print calls and did not recreate styles or body markers, but it proved that cleanup alone did not stop the stale continuation.

The amendment gives every accepted print activation a unique component-local attempt object. Cleanup marks that exact attempt cancelled before removing DOM state. It removes shared print state only when the cleanup still owns the active attempt, so an old cleanup cannot invalidate a newer attempt. Mounted state is tracked separately, and unmount invalidates and cleans the current attempt before pending preparation can resume.

Thermal preparation checks attempt identity and mounted state after receipt readiness, after both measurement animation frames, before measurement, before dynamic style creation and insertion, before body markers, after the final animation frame, and immediately before `window.print()`. Cancelled attempts return silently, do not set the preparation error, and cannot schedule timeout cleanup.

Deterministic local results:

- Cleanup-during-readiness regression: PASS.
- Client-navigation unmount regression: PASS.
- Print calls after cancellation: 0.
- Dynamic styles after cancellation: 0.
- Body print-mode markers after cancellation: 0.
- Returns thermal markers after cancellation: 0.
- Measurement markers after cancellation: 0.
- Cleanup fallback timers scheduled after cancellation: 0.
- Cancellation role-alert: absent.
- Page errors: 0.
- Console errors: 0.
- Native dialogs: 0.
- Browser business writes: 0.

The lifecycle amendment changes no page names, CSS selectors, page dimensions, margins, content width, height calculation, conversion constants, physical acceptance thresholds, A4 behavior, or Reports behavior.

## A4 And Screen Regression

- A4 artifact: `/tmp/saledock-returns-thermal-production-fix/fixed-a4.pdf`
- A4 render: `/tmp/saledock-returns-thermal-production-fix/fixed-a4-render.png`
- A4 dimensions: 595.92 by 842.88 points.
- A4 pages: 1.
- Required items, notes, summary, and footer: present.
- A4 clipping or visual defects: none.
- Mobile 390x844: PASS with controls visible and no overflow.
- Desktop 1440x900: PASS with table and controls visible and no overflow.

## Fixture And Error Safety

- Allowed direct fixture inserts: invoices, invoice_items, returns, and return_items.
- Application RPCs: none.
- Forbidden stock, payment, balance, closing, customer, expense, and audit writes: 0.
- Generated rows remaining after every run: 0.
- Safety signatures before/after: equal.
- Page errors: 0.
- Console errors: 0.
- Visible framework overlays: 0.
- Native dialogs: 0.
- Unexpected request failures: 0.
- Cleanup failures: 0.
- Measurement failures in accepted runs: 0.
- PDF or screenshot failures in accepted runs: 0.

## Reports And Shared Regression

- Source contracts: PASS, 50/50 total.
- New Returns source contract: PASS, 21/21.
- Existing print, Reports pagination, and Reports label contracts: PASS, 29/29.
- Deterministic print-control E2E: PASS, 1/1.
- Reports pagination runs: 3 isolated processes.
- Consecutive Reports passes: 3/3.
- Reports retries, skips, timeouts, and console errors: 0.
- Local Reports PDF: 5 A4 pages.
- Final report section: present.
- Screen scrolling: retained.
- Reports source changes: none.

## Validation

- `git diff --check`: PASS.
- `npm run lint`: PASS with 0 errors and 2 pre-existing warnings.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- Standard Returns production E2E: PASS, 1/1.
- Long Returns production E2E: PASS, 1/1.
- Cleanup-during-readiness E2E: PASS, 1/1.
- Client-navigation unmount E2E: PASS, 1/1.
- Print-control E2E: PASS, 1/1.
- Reports pagination E2E: PASS, 3/3.
- Automatic retries, skips, timeouts, and flakes in accepted runs: 0.
- Expected pre-source baseline failures: invalid CSS page fallback and clipped valid-page-only output reproduced.
- Expected pre-amendment lifecycle failure: stale continuation displayed one false role-alert after afterprint cleanup; print calls and stale styles/markers were 0 in that held-readiness path.
- Test-harness correction: the first production run reached the final safe-error assertion but used a broad role-alert locator that also matched Next.js's route announcer; the locator was narrowed and the complete standard run then passed cleanly.

## Limitations

- Local-only authenticated verification with disposable synthetic data.
- No authenticated production Returns print was generated.
- Financial and refund correctness remain outside this presentation test.
- GitHub CI does not independently perform local fixture or visual PDF inspection.

## Classification

**A. FIX VERIFIED LOCALLY**

## Recommended Next Action

Continue review on draft PR #299. Do not update the main audit until this focused fix is separately reviewed and merged.
