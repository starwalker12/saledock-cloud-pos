# Expense Restore audit fix

## Finding

`LIVE-EXPENSE-RESTORE-AUDIT-001` was a P2 audit-integrity finding. An Expense Restore changed an archived money-bearing record back to active, but the action did not record a Restore audit.

PR #317 delivered the reviewed correction and the bounded authenticated production verification closed the finding.

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

The owner-review contract file passed 5/5 and the complete Node suite passed 271/271. Under a production server running with `TZ=UTC` and a browser using `Asia/Karachi`, the focused post-fix lifecycle passed 1/1. The existing mobile workflow, datetime workflow, and filter/mobile workflow each passed 1/1 with zero Playwright automatic retries. Lint, typecheck, and production build results are recorded in the pull request.

## Owner-review E2E correction

Owner review accepted the application correction and identified one test-only durability defect. The focused E2E had reused the retained July 26 evidence date as a fixed current-day fixture and required the entire local `expenses` table to be empty.

The E2E now captures one runtime instant before any business mutation and uses the existing reviewed Asia/Karachi datetime helpers to derive:

- the current Karachi `YYYY-MM-DD` business date;
- the matching `datetime-local` form value;
- the expected stored UTC instant;
- the Reports custom start and end date.

The same captured values drive the Expense form, database assertion, Dashboard current-day assertion, Reports range, and sanitized evidence JSON. A five-minute opening safeguard skips a run that begins too close to Karachi midnight instead of allowing a day rollover to create a misleading failure.

The global zero-expense prerequisite was replaced with a marker-specific precondition. The E2E still requires exactly one matching expense after creation, no duplicate marker expense, zero matching expenses and audits after cleanup, and exact equality for every available complete before/after safety signature.

The browser evidence also classifies only the repository's established loopback Supabase `getUser`/`useSession` abort signature during deliberate page navigation. These expected local navigation aborts are counted separately; page errors, unexpected console errors, request failures, framework overlays, dialogs, route loss, and business failures remain blocking. The final focused run counted two expected local Auth navigation aborts and zero unexpected browser errors.

The retained production evidence dates remain unchanged. The historical July 24 datetime-preservation range remains unchanged. No application source, business behavior, settlement, Reset, datetime source, Dashboard formula, Reports formula, Cash Drawer behavior, permission, RLS, schema, migration, package, lockfile, workflow, configuration, or canonical document changed during this owner-review correction.

The final correction commit and exact PR head are recorded in PR #317 metadata because a commit cannot contain its own SHA.

## Disclosed runs and warnings

- An initial production build attempt used an external `node_modules` symlink that Turbopack rejected. The symlink was removed and a clean lockfile install was used without changing package files.
- The first narrow baseline run used an incorrect cashier-banner phrase in the diagnostic and was corrected without changing application behavior.
- The local schema does not expose `cash_movements`; the E2E records that signature as explicitly unavailable instead of silently omitting it.
- Two diagnostic selector assumptions were corrected after business cleanup: the Reports StatCard scope and duplicate desktop/mobile Audit Log rendering.
- One complete baseline launch and three post-fix invocations were discarded after local Supabase Auth emitted `TypeError: Failed to fetch`; business cleanup succeeded. Separate bounded post-fix runs passed cleanly.
- The first mobile workflow regression correctly failed because its old audit total omitted Restore; its expected count was updated from three to four.
- The first datetime regression correctly failed because its old audit total omitted Restore. A subsequent run exposed a stale historical-date Dashboard expectation, which was corrected to current-day zero. One later run was discarded for the disclosed local Auth flake; the bounded rerun passed.
- During this owner-review correction, three focused E2E launches were discarded after loopback Auth requests were aborted by deliberate page navigation. The trace showed adjacent `/auth/v1/user` responses returning HTTP 200 and cleanup succeeding. The final run used the narrow established local-navigation classification and passed with zero unexpected browser errors.
- The first owner-review filter/mobile launch was discarded when its framework-error probe raced navigation and Playwright reported a destroyed execution context. The bounded rerun passed without changing that test.
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

The retained July 26 production evidence establishes the original live missing-audit finding. The branch tests establish the local root cause and correction. GitHub CI and Vercel Preview are hosted build and preview evidence only. The separate July 29 authenticated browser workflow below establishes the corrected production Restore behavior.

The local Audit Log screenshot and sanitized baseline/post-fix JSON are retained outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/expense-restore-audit-fix`

## Authenticated production verification

PR #317 was delivered from the original reviewed source head `afde45b53ddbe8c03956327dbaf7bd9427c8db2a` plus the owner-review test correction at `51137c4a749023ed3e2a5fa73d403a4590a1ad03`. The reviewed pull request was squash-merged as `c823af4552b4841d776533bdabb770c6abb93a00`.

Vercel production deployment `2HoXqm32LeSRZh89axEc6CDcr69h` reached Ready and was current for that exact main commit before the production workflow began. The authenticated Chrome session visibly confirmed Fardan Aatir, Owner, Star Shop, Main Branch, PKR, and the Asia/Karachi business context. No migration or schema change was required.

The live marker was:

`LIVE-EXP-RESTORE-AUDIT-20260729-0132-L8YQ`

The starting current-day values were:

- Dashboard Expenses: PKR 0
- Reports active Expenses: PKR 0
- Dashboard Net Cash: PKR 0
- Cash Drawer expected/count/difference: PKR 0 / PKR 0 / PKR 0
- Customer dues: PKR 405
- Supplier dues: PKR 0
- Stock valuation: PKR 325,340
- Marker expenses and audits: zero

One Utilities expense for PKR 75 was created through the production UI with Card payment, the marked vendor and notes, and local time `2026-07-29T01:34` in Asia/Karachi. It persisted as `2026-07-28T20:34:00Z`. The active expense increased Dashboard and Reports Expenses by PKR 75 while Dashboard Net Cash and physical Cash Drawer values remained unchanged. One `expenses.created` audit and no duplicate expense were recorded.

The expense was voided once. Its exact row became archived, `archived_at` and `archived_by` were populated, one `expenses.voided` audit was recorded, and current-day Dashboard and Reports Expenses returned to their starting values.

The same expense was restored once. The exact row returned to active, both archived fields cleared, and amount, category, Card method, vendor, notes, creator, organization, branch, and timestamp remained unchanged. Dashboard and Reports returned to baseline plus PKR 75. Dashboard Net Cash and Cash Drawer remained at PKR 0.

The Restore produced exactly one Audit Log entry with:

- module: `expenses`
- action: `expenses.restored`
- actor: Fardan Aatir
- organization: Star Shop
- branch: Main Branch
- details: the exact restored expense ID
- metadata: the exact expense ID, `previous_status: archived`, and `new_status: active`

The restored active row exposed no second Restore control. A fresh authenticated tab independently displayed the exact active row and no duplicate transition or Restore audit existed. The original Restore page settled normally in this run, so no reload recovery was needed. The retained Expense Restore client-settlement observation remains open as P3; it was neither reproduced nor changed.

For finalization, the marked expense was voided once more and retained as truthful archived financial history. The final state contained one expense, one create audit, two Void audits, and one Restore audit. Dashboard and Reports active Expenses returned to PKR 0. Net Cash, expected physical cash, customer dues, supplier dues, stock valuation, and open-shift state matched the captured baseline. Cleanup retries and failures were zero.

Sanitized live evidence is retained outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/expense-restore-audit-live-verification`

The evidence manifest SHA-256 is:

`94ed2ece32d3bf795a45aee61586b8909ade59dd635a545606c8da65dcc742c4`

Result:

`PASS — LIVE-EXPENSE-RESTORE-AUDIT-001 FIXED`

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

Expense Restore settlement is not fixed. Expense Reset presentation is not fixed. `LIVE-EXPENSE-RESTORE-AUDIT-001` is closed by the merged correction and authenticated production verification. The P2 count is reduced from nine to eight; all five P3 observations remain open. Finishing remains accepted with limited coverage. SaleDock remains below audit-ready and is not MVP-live. Canonical documents remain stale until a separate owner-reviewed synchronization.

## Delivery and rollback

The source correction was delivered through PR #317 and verified in production. This follow-up records evidence only.

If the source correction must be rolled back:

`git revert c823af4552b4841d776533bdabb770c6abb93a00 && git push origin main`
