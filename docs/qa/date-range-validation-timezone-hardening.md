# Date-Range Validation and Karachi Timezone Hardening

## Scope

This Batch 1 correction hardens the five existing date-range routes: Invoices,
Repairs, Expenses, Reports, and Supplier Purchases. It introduces no new date
filter, mutation, migration, accounting formula, or production activity.

The implementation starts from main
`8fb9819ab031f471da8e66f98b6a4fc06210c6c5` and the sealed inventory at
`/Users/sw12/Projects/saledock-local-evidence/date-range-filter-consistency-inventory-v2`
(`bed779c37c0d07689bb614e1cdfb76f4486675bff3bb2380c2c03f44d96cda1d`).

## Shared Contract

`src/lib/datetime.ts` now validates an exact, real Gregorian `YYYY-MM-DD`
before any calendar arithmetic. Empty range sides remain optional, valid
single-sided ranges remain accepted, and a From date after a To date is
rejected. Impossible dates such as `2026-02-31` no longer normalize into
March.

The existing Karachi boundary outputs are unchanged for valid input. For
`2026-09-01`, the inclusive range remains:

- start: `2026-08-31T19:00:00.000Z`
- end: `2026-09-01T18:59:59.999Z`

Boundary helpers throw a controlled `RangeError` only when called directly
with invalid input. Server pages validate ordinary query parameters first and
show an inline error rather than allowing a page crash or broad fallback query.

The shared formatter rules are explicit: business timestamps render in
`Asia/Karachi`, while SQL `DATE` values are formatted from their literal
calendar components in UTC so the stored day cannot shift.

## Route Results

- Invoices keeps its established filters, query semantics, sort preservation,
  and fail-closed enum behavior while delegating date validation to the shared
  strict helper. Invoice timestamps now format explicitly in Karachi.
- Repairs keeps Intake Date as the sole filter dimension. Invalid dates,
  reversed ranges, and invalid statuses are rejected before `listRepairs`.
  Intake timestamps render in Karachi. `Delivered (this month)` now compares
  delivery instants against the current Karachi month.
- Expenses keeps its search, category, method, archived, query, and summary
  mathematics. Invalid filters do not reach the list query or eager boundary
  conversion. `Latest expense` is relabelled `Latest this month` to match the
  existing fixed current-month query.
- Reports keeps Today, Yesterday, This Week, This Month, Last Month, and Custom
  definitions. Invalid presets and custom dates fall back visibly to the safe
  This Month range. Primary report mathematics is unchanged. Current customer,
  inventory, and supplier snapshots are now labelled as independent of the
  selected report range.
- Supplier Purchases keeps direct inclusive SQL `DATE` comparisons. Invalid
  dates, reversed ranges, and invalid statuses are rejected before the list
  query. `Purchases this month` uses Karachi month start and end calendar dates;
  current dues and supplier summaries remain fixed. Purchase dates display as
  the stored calendar day with no timestamp conversion.

Valid search, supplier, category, archived, payment, status, From, To, sort,
and direction parameters remain present in generated sort links. Invalid date
and enum values are not propagated by generated sorting controls.

## Accessibility and Responsive Behavior

Inline validation messages use `role="alert"`; date inputs expose
`aria-invalid`; labels remain associated with their native date controls.
Decorative or modal behavior was not introduced.

Authenticated production-mode browser checks at 320x568, 390x844, and 430x932
confirmed readable validation, reachable Apply/Reset controls, usable From/To
inputs, and no document-level horizontal overflow. Existing persistent shell,
loading, role-navigation, and active-workspace checks also remain green.

## Validation

- strict date, range, route parser, Karachi rollover, summary, and query-param
  contracts: passed
- focused date/expense/invoice/report contracts: 72/72 passed
- focused date-range Playwright: 4/4 passed, zero retries
- loading, persistent-shell, and active-workspace Playwright: 12/12 passed,
  zero retries
- complete Node suite: 424/424 passed
- lint: zero errors; two pre-existing `privacy-center.tsx` hook warnings
- typecheck: passed
- Next.js 16.2.6 production build: passed
- `git diff --check`: passed

The first build attempt using an external worktree `node_modules` symlink was
discarded after Turbopack rejected the out-of-root symlink. The accepted build
used a local copy-on-write dependency directory and completed successfully.

## Safety and Deferrals

Production access and production mutations were zero. Local browser checks
performed no sale, payment, settlement, supplier payment, stock adjustment,
expense mutation, return, repair status change, or daily closing.

Supplier/customer opening and closing balance work remains deferred to its
review-first accounting batch. Returns, Product Movement, and Daily Closing
range additions remain deferred. Audit Log date work and Cashier/security work
remain paused. The active-workspace feature remains closed and unchanged.

Accepted evidence is stored outside Git at
`/Users/sw12/Projects/saledock-local-evidence/date-range-validation-timezone-hardening`.

## Production Verification

PR #358 was independently reviewed at
`cc05bc9ff909a9bc417ea33fc3b131fd9674c8e5` and squash-merged at
`2026-09-01T00:35:25Z` as
`994b649d5a885c4c4e4ffd62483e73aac26b298a`. Main CI run `33455363970`
passed, and Vercel production deployment
`dpl_EqgpHSFkCQqD2PsFhs3N6F7NU1yK` became Ready for that exact source at
`2026-09-01T00:36:40.042Z`.

Authenticated read-only production verification under the approved Owner
session confirmed:

- impossible dates such as `2026-02-31` and reversed ranges fail closed with
  visible inline alerts and without list queries, propagated sort links, page
  crashes, or broad fallback data;
- `2026-09-01` retains the exact Karachi boundary
  `2026-08-31T19:00:00.000Z` through `2026-09-01T18:59:59.999Z`;
- Invoices preserve valid search, payment, status, date, and sort parameters,
  reject invalid ranges, and render timestamps in Karachi;
- Repairs preserve Intake Date filtering, reject invalid ranges, and reconcile
  `Delivered (this month)` exactly to the production Karachi-month query (`0`);
- Expenses preserve search, category, payment, archived, date, and sort
  parameters, reject invalid ranges and enums, and label the fixed summary
  `Latest this month`;
- Reports render all six presets, visibly fall back to This Month for invalid
  preset/custom input, preserve financial formulas, and distinguish current
  snapshot summaries from the selected report range;
- Supplier Purchases preserve valid supplier, status, search, date, and sort
  parameters, reject invalid ranges and enums, reconcile `Purchases this month`
  exactly to the production Karachi-month query (`PKR 0`), and display SQL
  `DATE` values as their literal stored calendar day without timezone shift;
- responsive checks at 320x568, 390x844, and 430x932 kept date controls and
  actions reachable without horizontal overflow; validation alerts and
  `aria-invalid` remained accessible;
- the persistent authenticated shell, Sidebar width/state, route loading, and
  active-workspace behavior remained stable;
- opening and closing signatures for 32 protected production relations were
  exactly equal. Production business-data mutations were zero.

The production browser invoked the report print control, but the system print
preview could not be retained through the browser tooling. No artifact was
saved or exported. The sealed exact-head local full-document, pagination, and
no-application-chrome print proof remains the accepted print evidence.

Production verification evidence is sealed outside Git at
`/Users/sw12/Projects/saledock-local-evidence/date-range-validation-timezone-production-verification`.
Its 20-entry manifest verifies successfully; the manifest file SHA-256 is
`4255a6d645db2e15bd10f83e7ddb0f6bf2f992f9800b92294333c6722abe5fb9`.

Batch 1 is production verified. Batch 2 remains pending. Supplier/customer
opening- and closing-balance accounting remains deferred for review-first work;
Audit Log date work is deferred; Cashier/security work remains paused. The
active-workspace feature remains closed and unchanged.
