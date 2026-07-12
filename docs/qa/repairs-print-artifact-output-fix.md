# Repairs Print Artifact Output Fix

## Result

- Date: 2026-07-12
- Base SHA: `c651a7f6a5477f29b083c72aca06147d5b14559a`
- Branch: `fix/repairs-print-artifact-output`
- Finding: `REP-PRINT-001`
- Classification: **A. FIX VERIFIED LOCALLY**
- Scope: Repairs A4 and 80mm presentation only
- Production access: none

This fix does not claim repair accounting, advance, balance, payment, customer, stock, FIFO, authentication, permission, database, or production correctness.

## Original Defects

The clean-main baseline reproduced both confirmed failures with a disposable local fixture:

- A4: 595.92 x 842.88 points, one page, with the physical footer omitted.
- Thermal: 227.04 x 841.92 points, one page, with content bounds of 8.82 to 86.65 points and only 34.3% horizontal span.
- Thermal whitespace: 8.82 points left and 140.39 points right.
- The original thermal artifact was a miniature left-side receipt despite being physically 80mm wide.

Baseline artifacts:

- `/tmp/saledock-repairs-print-fix/baseline-a4.pdf`
- `/tmp/saledock-repairs-print-fix/baseline-a4-render.png`
- `/tmp/saledock-repairs-print-fix/baseline-thermal.pdf`
- `/tmp/saledock-repairs-print-fix/baseline-thermal-render.png`

## Mandatory Test-Only Proofs

### A4 proof

Playwright-only CSS reproduced the existing AppShell `printFullDocument` constraint release using the stable AppShell data attributes. It released fixed viewport height, hidden overflow, column constraints, the main internal scroll boundary, and content overflow without editing source.

- Dimensions: 595.92 x 842.88 points
- Pages: 2
- Page text lengths: 1197 and 38 characters
- Footer: present on the final page
- Required content: present
- Blank final page: no; the final page contains the receipt footer
- Chrome/privacy overlay: absent
- Result: existing `printFullDocument` behavior is sufficient; no AppShell source change or additional Repairs A4 CSS is required.

### Thermal proof

Playwright injected a Repairs-only `repairsThermalReceipt` page at 80mm x 200mm with 4mm margins, a Repairs body marker, and a 72mm body/main/receipt context.

- Dimensions: 227.04 x 567.12 points
- Pages: 1
- Overall span: 89.9%
- Bounds: 11.25 to 215.34 points
- Whitespace: 11.25 points left and 11.70 points right
- Repair job, Status, Estimate, Advance, Balance, Payment row spans: 89.9%
- Clipping: none
- Terms/footer: present
- Result: the independent Repairs proof confirms the same 72mm printable geometry without assuming the Returns implementation.

## Proven Causes

- A4 retained AppShell viewport-height, hidden-overflow, and internal-scroll constraints because Repairs did not opt into the existing full-document print contract.
- Thermal used the shared `thermalReceipt` context, whose 80mm body/main layout was scaled into an explicit 80mm PDF while the receipt itself remained a centered 72mm child. The result consumed only 34.3% of the physical page.
- The shared thermal contract remains unchanged because other print surfaces still use it.

## Source Design

- Repairs now passes `printFullDocument` to the existing AppShell. AppShell source is unchanged.
- Repairs uses a dedicated named page: `repairsThermalReceipt`.
- Valid fallback: 80mm x 297mm with 4mm margins.
- Repairs-only print marker: `data-repairs-thermal-print="true"`.
- Repairs-only measurement marker: `data-repairs-thermal-measuring="true"`.
- Dynamic style ID: `repairs-thermal-page-size`.
- Printable body, main, and receipt width: 72mm with zero internal receipt margin.
- The hidden receipt is measured off-screen after fonts and images are ready and after two animation frames.
- Pixel conversion: 25.4 / 96.
- Page height: measured content plus 8mm physical margins plus 1mm allowance, rounded upward to 0.1mm.
- No transform, scale, zoom, negative margin, AppShell edit, shared helper extraction, or shared thermal-page change.

## Final A4 Evidence

- Dimensions: 595.92 x 842.88 points
- Pages: 2
- Page text lengths: 1197 and 38 characters
- Required sections: present
- Footer: present on the final page
- Clipping: none
- Blank pages: none
- App chrome/privacy/framework overlay: absent
- Visual result: readable and complete; pagination is honest rather than scaled to force one page.

Artifacts:

- `/tmp/saledock-repairs-print-fix/fixed-a4.pdf`
- `/tmp/saledock-repairs-print-fix/fixed-a4-render.png`
- `/tmp/saledock-repairs-print-fix/fixed-a4-render-final.png`

## Final Thermal Evidence

| Variant | Physical dimensions | Pages | Span | Bounds | Whitespace |
| --- | --- | --- | --- | --- | --- |
| Standard | 227.04 x 508.08 points, approximately 80mm x 179.2mm | 1 | 89.9% | 11.25 to 215.34 points | 11.25 left / 11.70 right |
| Long | 227.04 x 666.00 points, approximately 80mm x 235.0mm | 1 | 89.9% | 11.25 to 215.34 points | 11.25 left / 11.70 right |

For both variants:

- Repair job, Status, Estimate, Advance, Balance, and Payment rows span 89.9%.
- Long problem and accessory text wraps naturally.
- Right-aligned values remain complete.
- Terms and footer remain present.
- No left/right clipping, miniature column, excessive one-sided whitespace, or blank page was observed.
- The longer fixture produces a larger physical page height without a hardcoded fixture height.

Artifacts:

- `/tmp/saledock-repairs-print-fix/fixed-thermal-standard.pdf`
- `/tmp/saledock-repairs-print-fix/fixed-thermal-standard-render.png`
- `/tmp/saledock-repairs-print-fix/fixed-thermal-long.pdf`
- `/tmp/saledock-repairs-print-fix/fixed-thermal-long-render.png`

## Lifecycle And Controls

- Every accepted print owns a unique component-local attempt identity.
- Cleanup cancels the exact attempt before removing owned state.
- Mounted state and active-attempt ownership prevent stale cleanup from affecting a newer attempt.
- Cancellation is checked after readiness and animation frames and before measurement, style insertion, body markers, printing, and timeout scheduling.
- A4 remains synchronous and prints once.
- Thermal prints once per accepted activation; duplicate activation is ignored while preparation is active.
- Afterprint and timeout cleanup both remove mode, marker, measurement state, style, listener, timer, and in-flight ownership.
- Held-readiness cancellation: 0 print calls, 0 styles, 0 body markers, 0 measurement markers, 0 fallback timers, and no false alert.
- Client-navigation unmount: 0 print calls, no stale state, and no false alert.
- Missing-receipt preparation shows only the generic role alert and does not print.

## Screen, Fixture, And Safety

- Mobile 390x844: pass; no overflow or clipping.
- Desktop 1440x900: pass; no overflow or clipping.
- Labels and control text remain unchanged; controls remain at least 44px.
- Fixture tables: `repairs`, `repair_status_history` only.
- RPCs: 0.
- Browser business writes: 0.
- Cleanup succeeded after every standard, long, cancellation, and unmount variant.
- Generated rows remaining: 0.
- Product, stock-lot, stock-movement, invoice, payment, customer-balance, ledger, expense, daily-closing, cash-shift, and audit-log safety signatures matched before and after.

## Errors

- Page errors: 0
- Unexpected console errors: 0
- Visible framework overlays: 0
- Native dialogs: 0
- Unexpected request failures: 0
- Browser business writes: 0
- Cleanup failures: 0
- Measurement failures: 0
- PDF failures: 0
- Screenshot failures: 0

Known local Vercel Analytics and Speed Insights 404/MIME console events are classified separately as unavailable local instrumentation, not application errors.

## Validation

- Diff and approved six-file scope: pass
- Lint: pass with 0 errors and 2 pre-existing hook warnings
- Typecheck: pass
- Production build: pass
- Combined source contracts: 91/91 pass
- New Repairs source contract: 41/41 pass
- Focused Repairs E2E: 4/4 pass
- Deterministic print-control E2E: 1/1 pass
- Returns standard process: 3/3 pass
- Returns long process: 3/3 pass
- Reports pagination: 3/3 consecutive isolated passes
- Reports PDF: 5 A4 pages with the final section present and screen scrolling retained
- Automatic retries: 0
- Skips: 0
- Timeouts: 0
- Flakes: 0

## Limitations

- Local authenticated evidence only
- No production login, production Repair, production PDF, or physical printer-hardware test
- No accounting, payment, balance, customer, stock, or FIFO correctness claim
- The broader audit remains unchanged until a later documentation-only refresh after review and merge

## Recommended Next Action

Review the draft PR. After it is approved and merged, refresh the main audit in a separate documentation-only task. Do not begin another coverage area in this PR.
