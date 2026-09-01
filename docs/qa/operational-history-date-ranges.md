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
explicit date range does not silently inherit that cap, so every matching return
is available. Focused browser proof includes 55 synthetic rows in one explicit
range, plus exact inclusion/exclusion checks at Karachi day boundaries.

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

## Daily Closing

Daily Closing now keeps four independent concepts explicit:

- `date` selects the operational closing day shown by the page;
- the current active shift remains an unconditional operational read;
- `history_from` and `history_to` filter historical daily-closing rows;
- the same history range filters completed shift-history rows.

Daily-closing history compares the SQL `DATE` column `closing_date` directly
with validated `YYYY-MM-DD` values. Shift history converts the range to Karachi
day boundaries and filters `cash_shifts.opened_at`. The existing 14-closing and
20-shift recent-history defaults remain when no range is supplied; explicit
ranges are not silently truncated.

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

## Validation

- focused pure contracts: 6/6 passed;
- operational-history Playwright: 8/8 passed, zero retries;
- Batch 1 loading, persistent-shell, and active-workspace Playwright: 16/16
  passed, zero retries;
- complete Node suite: 423/423 passed;
- product opening-stock/FIFO regression: 1/1 passed;
- return profit reconciliation: 1/1 passed;
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

Accepted evidence is stored outside Git at
`/Users/sw12/Projects/saledock-local-evidence/operational-history-date-ranges`.
