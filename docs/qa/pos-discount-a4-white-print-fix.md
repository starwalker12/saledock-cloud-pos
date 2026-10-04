# POS discount editing and white A4 invoice paper

Task 36149. Local-only implementation from
`be90e5151f45b66935c6d0c7bb8c316528d97749`.

## Baseline and correction

Unchanged-main production-mode Chromium retained the prefilled zero at the caret:
line/Cart Discount and zero service Unit price reproduced `0200`. A center click
also reproduced `2000` in Cart Discount. Immediate numeric coercion did not provide
a reliable lexical editing model.

`PosMoneyInput` keeps a focused decimal draft while updating the existing numeric
cart state immediately. Exactly-zero focus starts empty, nonzero digits remain
normally editable, `0.5`/`2.50` work, invalid/negative/non-finite drafts are rejected,
and an empty draft represents numeric zero. Blur restores canonical numeric text.
The component is scoped to line Discount, Cart Discount and Unit price; bill IDs
reset drafts on tab changes. Tendered and service-detail string inputs are untouched.

Held-bill validation exposed a separate pre-existing defect: Cart Discount was
not stored or restored. The owner explicitly authorized its narrow persistence
correction during this task. The existing JSON totals snapshot now carries an
optional nonnegative numeric `discount_total`; resume restores it. Old snapshots
without the field retain their previous zero fallback. No historic discount is
inferred from totals. No held-bill schema or checkout calculation changes.

Print computed styles identified the actual grey painter as the viewport-height
AppShell root, not the already-white invoice article or the display-contents
persistent frame. A4 invoice print CSS now makes the printable shell ancestors
white. The body's existing dark-to-white 200ms transition is disabled only while
printing an A4 invoice. Invoice uses the existing `printFullDocument` shell option
for natural multi-page flow; no fixed/minimum invoice height or background rectangle.
Existing print markers, cleanup, actions and thermal rules remain unchanged.

## Accepted local proof

All browser tests use the production build/server and loopback-only synthetic data,
with automatic retries zero.

| Gate | Result |
| --- | --- |
| Focused POS/held/permission/print Node contracts | 64 passed, 1 opt-in skip |
| Separate opt-in permission SQL suite | 6 passed; 93 RPC cases, 38 denials |
| Complete serial Node suite | 522 passed, 7 opt-in skips, zero failures |
| New POS browser suite | 6 passed, desktop 1440 and touch/mobile 390 |
| A4 white-paper browser suite | 3 passed |
| Existing held-bill browser suite | 2 passed |
| Existing #364 permission browser suite | 2 passed |
| Existing thermal artifact/lifecycle browser suite | Passed |
| Existing invoice Print/Save PDF wording suite | Passed |
| Lint | Zero errors; two existing Privacy Center hook warnings |
| Typecheck, production build, whitespace diff | Passed |

Checkout evidence: `999 x 5 = 4,995`; numeric Cart Discount `2` produces `4,993`,
and `200` produces `4,795`. Line Discount `200` persists as item discount `200`
with line total `4,795`. Decimal line `0.5` and cart `2.5` persist numerically and
produce `996` for one unit. Empty discounts submit numeric zero. Each checkout is
one Action POST. Decimal discounts survive tab switching and hold/resume.

Short A4 light/dark PDFs have one page and RGB white unused lower paper, including
with background graphics disabled. The long invoice prints all 80 items exactly
once across five populated pages; the final footer follows the final item, without
clipping, overlap or an extra blank page. Print cleanup restores the screen theme.
Thermal remains one correctly sized 80mm page for short/long receipts.

## Harness and safety

Discarded setup/diagnostic runs are retained, not counted as passes. They exposed
an out-of-root dependency symlink rejected by Turbopack, incomplete optional fixture
columns, duplicate responsive buttons, broad raster globbing, mobile Cart navigation
and asynchronous cookie-consent initialization. Final selectors/setup reflect the
real UI without forced clicks or increased pending thresholds.

The older held-bill test now selects the known seeded physical item rather than a
catalog ordinal that could select a required-detail money-transfer service. Its
invoice ordering and FIFO assertions remain intact. Thermal QA separates existing
workspace-coordination traffic from business writes, isolates the external analytics
beacon locally and waits for consent persistence/reload. All console/error and
business-signature assertions remain intact. Chrome 151's version-pinned suite is
not relabelled: the installed browser is Chrome 154, with a separate current-browser
thermal run recorded in evidence.

The SQL regression's historical function is installed only temporarily in the new
disposable local database, then its exact current-main definition and catalog are
restored. No database function, migration, permission, accounting or financial writer
source changes. Checkout, idempotency, quantity, service and customer mutation
functions are independently pinned to exact-main bodies by focused contracts.

Evidence: `/Users/sw12/Projects/saledock-local-evidence/pos-discount-a4-white-print-fix`.
The independent `SHA256SUMS` seal and draft PR record are in the final evidence report.
All 115 prior worktrees, 107 prior evidence seals and the original local database's
45 protected relation signatures are checked independently. Task-created fixtures
and stack are cleaned only within this task's disposable environment. Production
access/mutations, migrations and financial RPC source changes are zero. Demo-data
retirement, ledger trust, importer and Service V1 remain untouched.
