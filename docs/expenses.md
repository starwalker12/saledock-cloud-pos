# Expenses

The Expenses module lives at `/expenses` and reuses the existing `public.expenses` table from migration `0001_initial_schema.sql`. **No new migration was required.**

## Schema reused

`public.expenses` columns:
- `id, organization_id, branch_id`
- `category` (free text, default `'Miscellaneous'`)
- `amount` (`numeric(12,2)`, check `>= 0`; the app enforces `> 0`)
- `payment_method` (`public.payment_method` enum)
- `vendor_name`, `notes`
- `status` (`public.expense_status` enum: `active` | `archived`)
- `spent_at` (timestamptz, defaults to now)
- `created_by` → profiles
- `archived_at`, `archived_by`
- `created_at`, `updated_at` (auto-updated by trigger)

RLS is enabled and uses the org-scoped `for all` policy from migration 0001. No changes to RLS.

## Permissions

`src/lib/permissions.ts` exposes `canManageExpenses(role)` → `owner`, `admin`, `manager`. Other roles can view but cannot create / edit / void / restore. Server actions enforce this server-side.

## Validation

`src/lib/validation/expenses.ts` (zod):
- `category` required, max 80 chars (free text — the UI offers a suggested-categories `<datalist>` plus existing-category options).
- `amount` coerced to number, must be `> 0`.
- `payment_method` must be one of: `cash`, `card`, `easypaisa`, `jazzcash`, `bank_transfer` (intentionally omits `customer_credit` — expenses aren't taken from customer credit).
- `vendor_name`, `notes` optional.
- `spent_at` optional (defaults to "now" on insert).

## Server actions

`src/app/expenses/actions.ts`:
- `saveExpenseAction(prev, formData)` — insert or update. Sets `created_by`, `branch_id`, `organization_id` from the server-side current context; the browser cannot spoof these.
- `voidExpenseAction(formData)` — sets `status='archived'`, `archived_at`, `archived_by`. **No hard delete.**
- `restoreExpenseAction(formData)` — un-voids (sets `status='active'`).

All mutating actions call `revalidatePath('/expenses')` and `revalidatePath('/dashboard')`.

## Data layer

`src/lib/data/expenses.ts`:
- `listExpenses(orgId, filters)` — supports `search` (category / vendor / notes), `category`, `payment_method`, `from` / `to` date range, `includeArchived` toggle. Joins `profiles` for the "created by" column.
- `getExpense(orgId, id)`
- `listExpenseCategories(orgId)` — distinct categories used so the form/filter pulls real values.
- `expenseCounts(orgId)` — today total + count, this-month total + count, top category this month, latest expense. Powers the stat cards on `/expenses` and `/dashboard`.

## UI

`src/app/expenses/page.tsx`:
- Stat cards: Today expenses · This month · Top category (month) · Latest expense.
- Filters: search, category, payment method, from-date, to-date, "Show voided" toggle.
- Add/edit form inside a collapsible `<details>` block (auto-opens when `?edit=<id>` is present).
- Responsive: desktop table, mobile cards.
- Status pill: **Active** (emerald) or **Voided** (slate).
- Per-row actions: **Edit**, **Void** (active rows), **Restore** (voided rows).
- Read-only banner shown when the user's role can't manage expenses.

`src/app/expenses/loading.tsx` shows skeletons while the page loads, matching the style of other modules.

## Navigation

Sidebar and mobile nav now include **Expenses** (icon: `Wallet`).

Proxy / route protection: `/expenses` is included in `src/lib/supabase/proxy.ts`'s `protectedPrefixes`, so unauthenticated requests get an immediate 307 to `/login?next=/expenses`.

## Dashboard integration

New row on `/dashboard` (3 cards):
- **Today expenses** — total + count.
- **Net today** — today sales − today expenses. (Refund/return effects are a follow-up: returns reverse stock and may create customer credit/cash refund; once the refund-payment ledger is added in the returns hardening milestone, this card will subtract those too. For now the label says "refund effects pending".)
- **Month expenses** — total + count.

## Daily-closing / reports interaction (future)

The offline app feeds `expenses_total` into `daily_closings` for each branch/day. The online schema already has `daily_closings.expenses_total` (migration 0001), so when the Daily Closing UI is built it can sum active expenses (`status='active'`) where `spent_at` falls in the closing day. Reports will likewise sum month-to-date / range expenses and break down by category and payment method. Expense voids are reversible and never delete history, which is what the closing logic needs.

## Intentionally deferred

- Receipts/attachments upload for expense documents.
- Recurring expenses (e.g. monthly rent automation).
- Approval workflow.
- Per-category budget caps with alerts.
- Voiding a closed-day expense should require a reason and audit-log entry — to be wired when the audit-log module lands.
- A dedicated `reference_number` column. For now, reference numbers can live inside `notes`. If we want a dedicated indexed column later, that's an additive migration `0007_expense_reference.sql`.
