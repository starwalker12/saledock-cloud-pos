# Daily Closing

The Daily Closing module lives at `/daily-closing`. It lets owners/admins/managers reconcile each business day for their assigned branch: live computed sales / refunds / expenses / cash, a counted-cash entry, and a close (and reopen) action.

## Schema reused

`public.daily_closings` from migration 0001 is reused as-is, plus one additive column in migration 0007:

| Column | Source | Purpose |
|---|---|---|
| organization_id, branch_id, closing_date | 0001 | Org/branch scope + day key (unique constraint already present). |
| bills_count | 0001 | Snapshot of invoices for the day at close time. |
| cash_sales | 0001 | Snapshot of cash payments received that day. |
| digital_payments | 0001 | Snapshot of card + EasyPaisa + JazzCash + bank_transfer payments. |
| credit_pending | 0001 | Snapshot of balance_due totals on invoices created that day. |
| expenses_total | 0001 | Snapshot of active (non-voided) expenses for the day. |
| refunds_total | 0001 | Snapshot of refund amounts from completed returns for the day. |
| expected_closing_cash | 0001 | Snapshot of `cash payments − cash refunds − cash expenses`. |
| actual_closing_cash | 0001 | Counted cash entered by the closer. |
| cash_difference | 0001 | `actual − expected`. |
| notes | 0001 | Free text. |
| finalized_by | 0001 | profiles FK — closer. |
| **finalized_at** | **0007 (new)** | Close timestamp; powers the "Closed at" display + reports. |

RLS unchanged (`for all` org-scoped policy from 0001). Unique index on `(organization_id, branch_id, closing_date)` already present — guarantees one closing row per branch per day.

## Permissions

`src/lib/permissions.ts`:
- `canCloseDay(role)` → owner / admin / manager.
- `canReopenDay(role)` → **owner / admin only** (managers can close but cannot undo a closed day).

Server actions enforce both. The proxy guards `/daily-closing` so unauthenticated requests get a 307.

## Validation

`src/lib/validation/daily-closing.ts` (zod):
- `closing_date` must be `YYYY-MM-DD` and a valid date.
- `counted_cash` coerced number, `>= 0`.
- `notes` optional, max 500 chars.

## Data layer (`src/lib/data/daily-closing.ts`)

- `getDayActivity(orgId, branchId, date)` — **always computed server-side, every render**. Reads:
  - invoices for the day (gross sales, count, credit pending)
  - payments for the day grouped by method (cash / card / EasyPaisa / JazzCash / bank_transfer / customer_credit)
  - completed returns for the day grouped by refund_method
  - active expenses for the day grouped by category
  Then derives `expectedCash = paymentsByMethod.cash − refundsByMethod.cash − cash expenses`.
- `getClosing(orgId, branchId, date)` — the persisted `daily_closings` row (or null).
- `listRecentClosings(orgId, branchId, limit)` — last N days for the branch.
- `todayLocalDate()` — local-tz `YYYY-MM-DD` helper.

## Server actions (`src/app/daily-closing/actions.ts`)

- `closeDayAction(prev, formData)` — re-runs `getDayActivity` server-side **at the moment of closing**, then `upsert`s the daily_closings row keyed by `(org, branch, date)` with all snapshots + counted cash + difference + `finalized_by` + `finalized_at`. Browser-provided totals are never trusted.
- `reopenDayAction(prev, formData)` — sets `finalized_by = null`, `finalized_at = null`. Snapshots are kept (so historical numbers remain visible until the day is re-closed). Only owner/admin.

Both revalidate `/daily-closing` and `/dashboard`.

## UI (`src/app/daily-closing/page.tsx`)

- **Date picker** (default today; max = today; can browse past closings).
- **Status banner** — Open / Closed with `finalized_by` + `finalized_at`. If closed and the viewer can reopen, a Reopen button appears.
- **6 stat cards**: Gross sales, Refunds, Expenses, Cash payments, Digital payments, Credit pending.
- **Payment method breakdown** — table per method: Received / Refunded / Net.
- **Expense breakdown** — totals by category.
- **Cash reconciliation form** — counted cash input with live expected/counted/difference display, notes, Close (or Re-save closing) button.
- **Recent closings table** — last 14 days for the branch, with Bills / Cash sales / Expected / Counted / Difference and an Open link.
- `loading.tsx` skeleton matching other modules.

## Navigation

- Sidebar: **Daily Closing** (CalendarCheck icon) sits between Expenses and Reports.
- Mobile nav: **Closing** chip.
- Proxy: `/daily-closing` added to `protectedPrefixes`.

## Dashboard integration

The dashboard now has a 4-card row (was 3) including a **Today closing** card:
- Today expenses
- Net today
- **Today closing** — Open / Closed, with expected cash (open) or cash difference (closed)
- Month expenses

A small contextual link "Open daily closing →" / "Review today's closing →" sits below the row.

## How closing interacts with other modules

- **POS / Invoices**: invoices created later in the day continue to fill in the live activity. When the day is closed, the snapshot is taken from the state at that exact moment.
- **Expenses**: only `status='active'` expenses count. Voided expenses are excluded — so voiding an expense after closing won't change the snapshot, but it will show up as a discrepancy if you reopen + recompute.
- **Returns**: only `status='completed'` returns count. Refunds with `refund_method='cash'` reduce expected cash; non-cash refunds appear in the method breakdown but don't reduce cash.
- **Customer credit**: payments with `method='customer_credit'` are tracked in the method table but treated as non-cash (they reduce customer ledger, not cash drawer).

## Future tasks

- Reports module will read closed days as the authoritative day-cut.
- Printable daily-closing receipt (A4 + 80mm).
- Per-cashier shift sub-closings.
- Drawer-open/cash-in/cash-out movements (`cash_movements`).
- Audit-log entry on close / reopen.
- Multi-branch viewer for owners with access to several branches (today: one branch per profile).
