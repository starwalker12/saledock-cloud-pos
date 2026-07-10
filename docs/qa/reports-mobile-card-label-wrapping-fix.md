# Reports Mobile Card Label Wrapping Fix

## Scope

- Base SHA: `a2802af15703a2c8f420b18d4ab1900f656c2dca`
- Branch: `fix/reports-mobile-card-label-wrapping`
- Finding: `RPT-MOBILE-001`
- Original viewport: `390x844`
- Authentication and data: disposable local SaleDock QA environment only
- Classification: **A. FIX VERIFIED LOCALLY**

This verification covers presentation only. It does not verify or change report formulas, report queries, financial values, authentication, permissions, or business data.

## Original Defect

The shared `StatCard` placed `truncate` directly on every label. At mobile width, the following Reports labels were visually shortened with ellipses:

- Net Sales (Revenue)
- Gross Profit Margin
- Service Revenue / Profit

The complete strings existed in the DOM, but the shared one-line presentation hid part of the visible text.

## Implementation

`StatCard` now exposes a typed `wrapLabel?: boolean` option that defaults to `false`.

- Default mode retains the existing one-line `truncate` presentation.
- Wrap mode uses a flex-safe, normal-white-space label area with word wrapping and readable line height.
- The tooltip remains in a separate `shrink-0` region.
- Reports opts all five shared StatCards into wrapping for a consistent card layout.
- Other StatCard consumers do not opt in and retain their prior behavior.
- No label, value, detail, icon, formula, or query was changed.

The custom Estimated Net Profit card was not changed because it is not part of the shared StatCard defect.

## Browser Verification

| Mode | Result |
| --- | --- |
| Mobile `320x568` | PASS: complete labels, no tooltip/value overlap, no horizontal overflow |
| Mobile `390x844` | PASS: all three affected labels use multiple readable lines with no ellipsis |
| Mobile `430x932` | PASS: complete labels, clean wrapping, no horizontal overflow |
| Desktop `1440x900` | PASS: all five cards render, screen scrolling reaches the final section |
| Print media `390x844` | PASS: affected labels remain complete, chrome and filters remain hidden, final section remains present |

All five Reports StatCards retained visible labels, values, details, and tooltip icons. Card geometry checks found no label clipping, internal overflow, tooltip overlap, value overlap, card overflow, or page-level horizontal overflow.

Temporary screenshots were generated and visually inspected at:

- `/tmp/saledock-reports-mobile-label-fix/reports-labels-320.png`
- `/tmp/saledock-reports-mobile-label-fix/reports-labels-390.png`
- `/tmp/saledock-reports-mobile-label-fix/reports-labels-430.png`
- `/tmp/saledock-reports-mobile-label-fix/reports-labels-desktop.png`
- `/tmp/saledock-reports-mobile-label-fix/reports-labels-print-390.png`

The screenshots contain disposable local QA data only and are not committed or uploaded.

## Print Pagination Regression

- Existing full-document pagination E2E: PASS (`1/1`)
- A4 PDF generated: PASS
- Local page count after the label fix: `5`
- A4 dimensions: confirmed
- Required later sections: present
- Final Supplier Dues & Purchases Snapshot section: present
- Screen scrolling after print emulation: retained
- Truncation regression: not observed
- Unexpected business-data writes: `0`

The durable pagination assertion requires at least two pages rather than an exact count. The local result remained five pages after label wrapping.

## Error And Safety Evidence

- Page errors: `0`
- Unexpected console errors: `0`
- Visible framework overlays: `0`
- Native dialogs: `0`
- Unexpected request failures: `0`
- Unexpected write requests: `0`
- Screenshot-generation failures: `0`
- PDF-generation failures: `0`

Request monitoring began after local authentication and before Reports navigation. It recorded only sanitized methods and paths and did not expose request bodies, credentials, report values, or business identifiers.

## Validation

- `git diff --check`: PASS
- `npm run lint`: PASS with two pre-existing `privacy-center.tsx` hook dependency warnings and zero errors
- `npm run typecheck`: PASS
- `npm run build`: PASS
- New wrapping source contract: PASS (`8/8`)
- Existing pagination source contract: PASS (`8/8`)
- Existing print touch-target source contract: PASS (`13/13`)
- Focused label E2E: PASS (`5/5`)
- Pagination E2E: PASS (`1/1`)
- Existing deterministic print-control E2E: PASS (`1/1`)
- Retries, skips, timeouts, and flakes: `0`

## Limitations

- Verification was performed against the local production build and local Supabase, not authenticated production.
- Financial formula correctness was not tested.
- Unrelated StatCard consumers are protected by the default/source contract but were not all visually revisited in this focused task.
- The main mobile/native audit document is intentionally unchanged; it should be refreshed only after this fix is reviewed and merged.

## Recommended Next Action

Review the draft PR for the Reports-only opt-in and local evidence. After merge, update the audit in a separate documentation-only task to mark `RPT-MOBILE-001` fixed.
