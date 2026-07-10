# Reports Full-Document Print Pagination Verification

## Scope

- Finding: `RPT-PRINT-001`
- Base SHA: `82db6ecca5f13439cf6bb624556dd921c1dcd5d3`
- Branch: `fix/reports-print-full-document-pagination`
- Route: `/reports?range=this_month`
- Browser: Chromium against a production-mode localhost server
- Viewport: 1440x900
- Data boundary: disposable local Supabase data only; no business-data writes
- Formula boundary: report calculations, values, and data queries were not changed or reinterpreted

## Diagnosis

The AppShell root used a fixed dynamic-viewport height with hidden overflow, while its main element was an internal vertical scroll container. The Reports print CSS hid application chrome and adjusted the main element's spacing, but it did not release those shell constraints. Chromium therefore printed only the height represented by the clipped AppShell viewport instead of allowing the complete report to flow across physical pages.

## Fix

AppShell now exposes an optional `printFullDocument` contract that defaults to `false`. When enabled, static print-only classes make the root, content column, main element, and content wrapper content-driven with visible overflow. Screen classes remain unchanged.

Reports is the only page opting into this contract. Other AppShell pages retain their existing behavior. Stable, non-sensitive AppShell data attributes support focused print-layout assertions.

Changed source files:

- `src/components/layout/app-shell.tsx`
- `src/app/reports/page.tsx`

No report formula, query, authentication, permission, or business-data code changed.

## Screen-Mode Result

| Check | Result |
| --- | --- |
| Reports loaded at 1440x900 | PASS |
| Main remained the vertical screen scroll container | PASS |
| Content exceeded the viewport and scrolled normally | PASS |
| Final required section was reachable by scrolling | PASS |
| Horizontal page overflow | None observed |
| Screen values altered by print setup | No; in-memory screen/print signatures matched |

## Print-DOM Result

| Check | Result |
| --- | --- |
| AppShell root expanded with visible overflow | PASS |
| AppShell content column expanded | PASS |
| Main stopped acting as an internal print scrollbar | PASS |
| Content wrapper expanded through the final section | PASS |
| Corporate letterhead visible | PASS |
| Application navigation and header hidden | PASS |
| Print button and date filters hidden | PASS |
| Cookie/privacy banner hidden | PASS |
| Print-hidden report explanation hidden | PASS |
| Payment Methods Breakdown present | PASS |
| Operating Expenses Breakdown present | PASS |
| Returns & Refunds Summary present | PASS |
| Customer Outstanding Ledger present | PASS |

## PDF Evidence

- Temporary PDF: `/tmp/saledock-reports-pagination-fix/reports-this-month-a4.pdf`
- Temporary rendered pages: `/tmp/saledock-reports-pagination-fix/rendered/page-1.png` through `page-5.png`
- PDF signature: PASS
- PDF size: non-trivial (approximately 430 KiB)
- Page count before fix: 1
- Page count after fix: 5
- Page size: A4 on all five pages
- Later required section labels found in extracted PDF text: PASS
- Visual inspection: all five rendered pages inspected
- Blank unexpected pages: none
- Horizontal clipping or overlap: none observed
- Missing or cut-off required headings: none observed
- Final report content: present and readable

Long report cards can continue naturally across a physical page boundary. The inspected output retained their content and borders without losing required headings or values.

`pdfinfo` and `pdftoppm` were unavailable. Existing local `pdfplumber` support supplied supplemental page-count, A4-dimension, text-presence, and rendered-page evidence. GitHub CI does not depend on Python or external PDF utilities; the Playwright test uses a built-in validation of Chromium's PDF page objects and requires at least two pages.

## Error And Write Guard

| Evidence | Result |
| --- | --- |
| Page errors | 0 |
| Unexpected console errors | 0 |
| Visible framework overlays | 0 |
| Native browser dialogs | 0 |
| Unexpected request failures | 0 |
| Unexpected business-data writes after login | 0 |

Only sanitized request methods and paths were eligible for collection. No request bodies, credentials, report values, or business identifiers were recorded.

## Validation

- `git diff --check`: PASS
- `npm run lint`: PASS (0 errors; 2 pre-existing warnings in `privacy-center.tsx`)
- `npm run typecheck`: PASS
- `npm run build`: PASS
- Reports pagination source contract: PASS (8/8)
- Existing print touch-target source contract: PASS
- Focused Reports pagination E2E: PASS (1/1; no retry, skip, timeout, or flake)
- Existing deterministic print-control E2E: PASS (1/1; no retry, skip, timeout, or flake)

The first isolated-worktree build attempt used a `node_modules` symlink outside Turbopack's filesystem root and failed before compilation. The worktree was given its own dependency install with `npm ci`; no manifest or lockfile changed, and the final production build passed.

The first focused E2E attempt exposed an overly strict test locator for a heading that includes tooltip content. The locator was corrected to match the existing heading without changing application behavior. The completed regression then passed without retry, timeout, skip, or browser flake.

## Separate Open Defect

`RPT-MOBILE-001` remains open. Mobile StatCard labels including Net Sales (Revenue), Gross Profit Margin, and Service Revenue / Profit remain ellipsized. `src/components/ui/stat-card.tsx`, its `truncate` behavior, and the Reports card grid were not changed.

Suggested future branch: `fix/reports-mobile-card-label-wrapping`

## Classification

**A. FIX VERIFIED LOCALLY**

The complete Reports document now paginates across multiple A4 pages in the production-like local environment. Normal screen scrolling remains intact, the final report sections are included, and the focused test observed no unexpected browser error or business-data write.

## Recommended Next Action

Review this focused draft PR independently. Address `RPT-MOBILE-001` only in a separate review-first change after this print fix is reviewed.
