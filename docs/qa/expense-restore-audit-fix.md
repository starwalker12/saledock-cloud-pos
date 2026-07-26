# Expense Restore audit fix

## Finding

`LIVE-EXPENSE-RESTORE-AUDIT-001` is a P2 audit-integrity finding. An Expense Restore changed an archived money-bearing record back to active, but the action did not record a Restore audit.

This correction is present only on the draft branch. Production remains unchanged.

## Retained production evidence

The authenticated production evidence is retained outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/live-finishing-continuation-2026-07-26`

The evidence marker is `FINISHING-CONT-20260726-2022-2B42`. The manifest SHA-256 is:

`90f9cd57b810a29eb554a283b43a11281e0e1f6c5c7fab3f60bdb949eca34429`

The manifest's 58 entries verified. The retained workflow recorded one expense create audit, five update audits, two Void audits, one successful Restore mutation, and zero Restore audits. The restored row retained its amount, category, Card payment method, timestamp, Dashboard total, Reports total, and zero Cash Drawer effect. Duplicate expense mutations were zero. The final expense was archived safely. No authenticated production action was performed during this source task.

## Local baseline

The production-mode local baseline reproduced the same missing audit:

- One Card expense for PKR 75 was created with one create audit.
- One Void produced one Void audit and removed PKR 75 from active Dashboard and Reports totals.
- One Restore returned the exact row to active and restored PKR 75 to those totals.
- Amount, category, payment method, timestamp, vendor, notes, and creator were unchanged.
- Cash Drawer signatures were unchanged.
- The Restore audit count remained zero.
- Repeated and invalid Restore probes did not create an audit.
- The fixture was voided once for finalization and removed with its matching audits in cleanup.

The sanitized baseline result is retained outside Git. Its SHA-256 is:

`baa7bff87be6b3d7b814daabf597a5a494b42a55566a3c361175440415b139b6`

## Root cause

`restoreExpenseAction` performed the organization-scoped archived-to-active update and requested page revalidation, but it never called `logAudit`. It also discarded the update result, so the action had no exact transition proof on which to base an audit.

No database trigger or RPC supplied the missing audit. Permission and RLS checks worked as designed. The defect was the absent Restore audit invocation in the Server Action.

## Correction

The Restore action now:

1. keeps the manager authorization gate;
2. updates only the requested organization-owned row while its current status is `archived`;
3. selects the transitioned row ID;
4. returns without an audit on an update error, denied access, missing ID, missing row, active row, or unmatched organization;
5. awaits one `logAudit` call only after a successful transition;
6. records module `expenses` and action `expenses.restored`;
7. records the expense ID plus `archived` to `active` transition metadata;
8. preserves the existing Expenses and Dashboard revalidation.

The authenticated actor, organization, and branch continue to come from the shared audit helper and authorized request context. No shared audit behavior changed.

The action does not alter amount, category, payment method, vendor, notes, timestamp, creator, organization, or branch data. It adds no accounting, settlement, Reset, Dashboard, Reports, or Cash Drawer behavior.

## Duplicate and no-op behavior

The archived-status precondition and returned-row check make the audit describe a genuine transition. A repeated Restore against an already active row, an invalid or missing ID, an unmatched row, a cashier-denied attempt, or an update error produces no Restore audit.

The local post-fix lifecycle recorded exactly one successful Restore transition and exactly one `expenses.restored` audit. Repeated, invalid, unmatched, and denied probes created no additional Restore audit. The audit details and metadata rendered in Audit Log, persisted after reload, and contained no duplicate.

## Regression coverage

Focused source contracts prove:

- organization and archived-state filters;
- exact update-result handling;
- stable module, action, details, and metadata;
- awaited audit ordering before revalidation;
- no additional expense mutation, RPC, or migration;
- unchanged business values and freshness calls.

The focused production-mode E2E proves:

- create, Void, Restore, persistence, and cleanup;
- one genuine Restore audit;
- exact actor, organization, branch, action, details, and metadata;
- cashier denial;
- repeated/active and invalid no-op behavior;
- timestamp and all business fields unchanged;
- Dashboard and Reports totals of PKR 75 active, PKR 0 archived, and PKR 75 restored;
- zero Card Cash Drawer effect;
- Audit Log rendering;
- zero duplicate mutation or audit;
- zero generated rows after cleanup;
- unchanged safety signatures.

Existing regression updates are intentionally narrow:

- the mobile create/edit/Void/Restore workflow now expects its truthful fourth audit;
- the datetime workflow now expects the Restore audit and correctly excludes its fixed July 24 fixture from the current-day Dashboard while retaining it in the July 24 report range;
- the reviewed Expenses action-source hash was updated without changing its mobile filter or summary assertions.

The complete Node suite passed 270/270. The existing mobile workflow, datetime workflow, and filter/mobile workflow passed with zero Playwright automatic retries. The focused post-fix lifecycle passed cleanly. Lint, typecheck, and production build results are recorded in the pull request.

## Disclosed runs and warnings

- An initial production build attempt used an external `node_modules` symlink that Turbopack rejected. The symlink was removed and a clean lockfile install was used without changing package files.
- The first narrow baseline run used an incorrect cashier-banner phrase in the diagnostic and was corrected without changing application behavior.
- The local schema does not expose `cash_movements`; the E2E records that signature as explicitly unavailable instead of silently omitting it.
- Two diagnostic selector assumptions were corrected after business cleanup: the Reports StatCard scope and duplicate desktop/mobile Audit Log rendering.
- One complete baseline launch and three post-fix invocations were discarded after local Supabase Auth emitted `TypeError: Failed to fetch`; business cleanup succeeded. Separate bounded post-fix runs passed cleanly.
- The first mobile workflow regression correctly failed because its old audit total omitted Restore; its expected count was updated from three to four.
- The first datetime regression correctly failed because its old audit total omitted Restore. A subsequent run exposed a stale historical-date Dashboard expectation, which was corrected to current-day zero. One later run was discarded for the disclosed local Auth flake; the bounded rerun passed.
- Playwright emitted the existing `NO_COLOR` warning. Node emitted existing module-type warnings. Supabase CLI reported its update notice. `npm ci` reported existing dependency audit notices; no dependency or lockfile change was made.

## Safety and cleanup

Local mutation was limited to one disposable expense and its matching audit rows. Cleanup ran in `finally`.

- Generated expenses remaining: 0
- Matching generated audits remaining: 0
- Cash signatures: unchanged
- Stock and FIFO signatures: unchanged
- Customer and supplier balance signatures: unchanged
- Other available safety signatures: equal
- Cleanup retries: 0
- Cleanup failures: 0
- Production requests or mutations: 0

No migration, schema, package, lockfile, workflow, configuration, shared audit-helper, settlement, Reset, datetime source, Dashboard formula, Reports formula, or Cash Drawer source changed.

## Evidence boundary

The retained production evidence establishes the live missing-audit finding. The branch tests establish the local root cause and correction. GitHub CI and Vercel Preview, when available, are hosted build and preview evidence only. They are not authenticated production Restore evidence.

The local Audit Log screenshot and sanitized baseline/post-fix JSON are retained outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/expense-restore-audit-fix`

## Remaining findings

The other eight P2 findings remain unchanged:

- `LIVE-CUSTOMER-LEDGER-001`
- `LIVE-CUSTOMER-AUDIT-001`
- `LIVE-REPAIR-OPTIONAL-001`
- `LIVE-INVOICE-FILTER-001`
- `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`
- customer-settlement client completion
- supplier-payment client settlement
- limited cashier coverage

The five P3 observations remain unchanged:

- Expenses original-page settlement delay
- Expense Restore client-settlement recovery
- Expenses Reset date-field presentation
- Daily Closing hydration/print-footer noise
- narrow mobile wrapping

Expense Restore settlement is not fixed. Expense Reset presentation is not fixed. `LIVE-EXPENSE-RESTORE-AUDIT-001` is corrected only on this draft branch. Finishing remains accepted with limited coverage. SaleDock remains below audit-ready and is not MVP-live. Canonical documents remain unchanged.

## Delivery and rollback

This change is review-first. The draft pull request must remain unmerged until the owner authorizes delivery and production verification separately.

If a later merged correction must be rolled back:

`git revert <expense-restore-audit-merge-sha> && git push origin main`
