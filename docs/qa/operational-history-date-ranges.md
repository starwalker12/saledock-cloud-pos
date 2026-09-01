# Operational History Date Ranges

## Scope

This Batch 2 change adds read-only date ranges to three operational histories:
Returns, the per-product Movement ledger, and Daily Closing history. It starts
from main `918d5f11e50316779d64d79e9d95715541831d7e` and the sealed inventory at
`/Users/sw12/Projects/saledock-local-evidence/date-range-filter-consistency-inventory-v2`
(`bed779c37c0d07689bb614e1cdfb76f4486675bff3bb2380c2c03f44d96cda1d`).

No mutation, accounting formula, stock/FIFO behavior, permission, database
schema, RLS policy, RPC, or production data is changed.

## Returns

Returns use `returns.created_at` as the business history dimension. From and To
values are validated with the Batch 1 strict `YYYY-MM-DD` contract and converted
to inclusive `Asia/Karachi` day boundaries before the server query applies
`gte`/`lte` filters.

The unfiltered page preserves the existing recent-history limit of 50 rows. An
explicit date range first obtains an exact organization- and range-scoped count.
Ranges of 1,000 rows or fewer are then fetched completely. Larger ranges do not
render a partial table; they show the exact matching count and ask the user to
narrow the range. Focused browser proof includes the retained 55-row case and a
1,001-row overflow case, plus exact inclusion/exclusion checks at Karachi day
boundaries.

Today, Yesterday, This week, This month, and Last month presets use the shared
Karachi preset calculation. Sorting preserves valid range parameters. Invalid
or reversed ranges fail closed before the list query and are not propagated by
generated sort links. Empty states distinguish no return history from no match
for the selected range.

## Product Movement

The product Inventory and FIFO modal adds From and To controls only to the
Movement ledger. The server applies inclusive Karachi timestamp boundaries to
`stock_movements.created_at` through the existing organization-scoped,
product-scoped reader path.

The read boundary still requires the same product-management or stock-management
permission as the existing inventory reader. No role gains a new stock or
catalog capability. Active lots, FIFO quantities, valuation summaries, opening
stock, restock, and manual-adjustment mutations are unchanged.

Invalid movement ranges do not query broad history and do not disable the other
modal tabs or forms. A successful restock or adjustment refreshes the currently
selected movement range instead of resetting it.

Movement history has no deliberate small default. Both the default and explicit
range paths therefore use an exact organization- and product-scoped count. A
result above 1,000 rows shows a transparent request to select or narrow a date
range instead of presenting PostgREST's first 1,000 rows as complete. Active
Lots, FIFO summaries, restock, and Manual Audit remain independently available.

## Daily Closing

Daily Closing now keeps four independent concepts explicit:

- `date` selects the operational closing day shown by the page;
- the current active shift remains an unconditional operational read;
- `history_from` and `history_to` filter historical daily-closing rows;
- the same history range filters Shift History by shift opened date.

Daily-closing history compares the SQL `DATE` column `closing_date` directly
with validated `YYYY-MM-DD` values. Shift history converts the range to Karachi
day boundaries and filters `cash_shifts.opened_at`; it does not add a new
closed-status condition. The Daily Closing page keeps its existing 14-closing
and 10-shift recent-history defaults when no range is supplied. Explicit ranges
use exact counts and either render every row at or below 1,000 or show an
independent narrow-range message for the overflowing history section.

An invalid history range suppresses only both historical queries and shows an
inline alert. It does not suppress the selected-day record, active shift, or
current operational summaries. Sorting and opening a historical closing retain
the selected operational date and valid history range. Reset clears the history
range only.

## Accessibility and Responsive Behavior

The range inputs keep native labels, expose `aria-invalid` on validation failure,
and pair errors with `role="alert"`. Read-only loading regions retain the existing
accessible pending treatment. No decorative placeholder becomes interactive.

Production-mode browser checks at 320x568, 390x844, 430x932, and 1440x900 found
no document-level horizontal overflow. Returns and Daily Closing controls stack
cleanly on mobile, the product Movement modal remains usable, and light/dark
axe checks reported no A/AA violations in the new filter regions.

## PostgREST Row-Limit Correction

Local `supabase/config.toml` retains `api.max_rows = 1000`. Deterministic local
proof created 1,001 safe synthetic Return history rows: an exact filtered count
reported 1,001 while the ordinary PostgREST data query returned 1,000. This
proves that omitting an application `.limit()` does not create an unlimited
history query.

`OPERATIONAL_HISTORY_MAX_ROWS` is fixed at 1,000 and protected by a source
contract against the current Supabase setting. Explicit ranges issue one exact
HEAD count and, only when the count is safe, one data query with the same tenant,
branch/product, and date predicates. Overflow issues the count only. The
deliberate Returns, closing, and shift defaults add no count query. Count failure
fails closed and does not expose raw Supabase errors or fall through to a data
query. The normal count/fetch race remains ordinary read-refresh behavior; no
snapshot-isolation claim is made.

## Validation

- focused pure contracts: 9/9 passed;
- focused PostgREST-limit Playwright: 4/4 passed, zero retries;
- operational-history Playwright: 8/8 passed, zero retries;
- combined regression Playwright: 25 passed, 6 skipped, and one inherited
  return-profit console/pending-state failure reproduced on the untouched prior
  PR head;
- complete Node suite: 426/426 passed;
- product opening-stock/FIFO regression: 1/1 passed;
- return-profit business reconciliation completed in the correctly configured
  development run; its final console-cleanliness assertion observed existing
  Next development nonce hydration and transient Supabase fetch noise. The
  production-mode return submission pending-state failure reproduced identically
  on prior head `94e72d6b726aeff37d060bb1c628bff12db613de` and is not changed here;
- lint: zero errors; two pre-existing `privacy-center.tsx` hook warnings;
- typecheck: passed;
- Next.js 16.2.6 production build: passed;
- `git diff --check`: passed.

The return-profit fixture cleanup now removes task-owned return rows before its
invoice cleanup. This is test-only hygiene required by the existing foreign-key
ordering and does not change runtime return behavior.

## Safety and Deferrals

All acceptance used isolated local fixtures. Fixture cleanup completed and no
production system, account, or data was accessed. Production access and
mutations were zero.

Supplier and customer ledger opening/closing-balance ranges remain deferred to
their accounting-sensitive, review-first batch. Audit Log date work remains
deferred while its authorization track is paused. Cashier/security work remains
paused. Batch 1 remains closed, and the active-workspace feature remains closed
and unchanged.

The sealed original Batch 2 evidence remains unchanged at
`/Users/sw12/Projects/saledock-local-evidence/operational-history-date-ranges`.
PostgREST-limit correction evidence is stored separately at
`/Users/sw12/Projects/saledock-local-evidence/operational-history-date-ranges-postgrest-limit-correction`.
