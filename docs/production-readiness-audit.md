# SaleDock Cloud POS — Production Readiness Audit

**Date:** 2026-06-20
**Scope:** Source-level audit of money, stock, POS, permissions, cash drawer, reports, auth, data safety, and deployment. **Audit only — no application code was changed.**
**Stack:** Next.js App Router + TypeScript + Supabase + Vercel · Currency PKR · Intended timezone Asia/Karachi · Deploys from `main`.

---

## 1. Executive summary

SaleDock is built on a **sound, money-safe foundation**. Every money/stock mutation (sale, return, supplier purchase, supplier payment, customer ledger) is performed by an **atomic PostgreSQL function (RPC)** — the database is the single source of truth, so totals, stock, and balances are computed transactionally rather than in JavaScript. Server actions consistently re-check permissions, validate input with Zod, and revalidate caches; sensitive pages guard server-side; the service-role client is `server-only`; and there is no cross-request caching of money/stock/report values.

The audit found **no Critical defect** in the reviewed source. The most important issue is a **business-date timezone mismatch** (the app buckets "today" by **UTC**, not Asia/Karachi), which mainly affects post‑midnight transactions in daily cash closing and "today" widgets/reports. The second is the **absence of server-side checkout idempotency** (double-submit is only prevented in the browser). Both are addressable and are recommended as small, reviewed PRs before heavy real-world use.

**Important caveat:** the correctness of totals/paid/due/FIFO/overpayment/negative-stock ultimately lives inside Postgres RPCs (`pos_checkout`, `create_invoice_return`, supplier FIFO allocation, customer ledger — migrations 0004–0031). This audit reviewed the **application code paths and their guards**, not a line-by-line proof of each RPC. A dedicated DB-function review with test cases is recommended (see §11).

---

## 2. Overall readiness rating

> **Mostly ready** — safe to pilot with real data after addressing the High timezone item and confirming checkout idempotency. Not "Ready" only because of the timezone business-date behavior and the lack of a server-side duplicate-sale guard.

---

## 3. Risk table

| # | Area | Severity | Risk | Evidence | Why it matters for a shop | Recommended fix | Fix type |
|---|------|----------|------|----------|---------------------------|-----------------|----------|
| R1 | Reports / cash drawer / dashboard — timezone | **High** | "Today" and daily boundaries are computed in **server-local = UTC** time, not Asia/Karachi. The business day rolls over at **05:00 PKT**, so transactions between 00:00–05:00 PKT are attributed to the **previous** business day. | `src/lib/data/daily-closing.ts:357‑361` (`todayLocalDate` uses `getTimezoneOffset()`), `src/lib/data/dashboard.ts:24‑29` (`todayBounds`), `get_sales_by_day` RPC (`TO_CHAR(invoice_date,'YYYY-MM-DD')`). No `vercel.json`, no `TZ` env → Vercel runs UTC. | Daily cash reconciliation and "today's sales" can disagree with the owner's real day for late-night/after-midnight sales — exactly the screens used to check money. | Set `TZ=Asia/Karachi` in Vercel env **or** make the date helpers use an explicit Asia/Karachi offset. Review-first; verify daily-closing totals before/after. | Manual (env) + code |
| R2 | POS checkout | **Medium** | No **server-side idempotency**. Double-submit is prevented only by disabling the button while `pending`. A network retry, double-tap race, browser back/forward, or two devices could re-run `pos_checkout` → **duplicate invoice + double stock deduction**. | `src/app/pos/actions.ts:30‑112` (no idempotency key), `src/app/pos/pos-client.tsx:813` (`disabled={... || pending}`). | A duplicated sale corrupts stock and the customer/cash totals and is tedious to unwind. | Generate a client idempotency key, pass it to `pos_checkout`, and have the RPC dedupe within a short window (or a unique constraint). Review-first (touches RPC → DB). | Code + DB |
| R3 | Error handling (POS, returns, closing) | **Medium** | Raw database error strings are returned to the user. | `src/app/pos/actions.ts:91`, `src/app/invoices/[id]/returns/actions.ts:71`, `src/app/daily-closing/actions.ts:77`. | Confusing/scary messages for shop staff; possible internal detail leakage. | Map RPC/DB errors to friendly, localized messages; log the raw error server-side only. | Code (low risk) |
| R4 | Database / multi-tenant | **Medium** | `createAdminClient()` (service role, **bypasses RLS**) is used in ~14 server files. Safety relies on **every** such query manually filtering `organization_id`. Spot-checks pass, but one missed filter = cross-shop data leak. | `src/lib/supabase/admin.ts`, used in `lib/data/users.ts`, `settings.ts`, `staff-permissions-data.ts`, `platform/*`, `setup/actions.ts`, `users/invite-actions.ts`, `dashboard/page.tsx`, `sidebar.tsx`. | A missing tenant filter could expose another shop's staff/settings/data. | Explicitly review each admin-client query for an `organization_id` filter; prefer the RLS user-session client wherever the service role isn't strictly required; add a test. | Code + process |
| R5 | Money correctness (RPC internals) | **Medium** | Totals/paid/due/FIFO/overpayment/negative-stock live inside Postgres RPCs not line-audited here. | migrations `0005_stock_lots_fifo`, `0006_returns_refunds`, `0009/0030 loss_prevention`, `0031 supplier_payment_fifo_allocation`, `0004 customer_ledger`. | These functions are the literal money/stock engine; an edge case (e.g., overpay, partial-return over-restock, rounding) would be high-impact. | Dedicated DB-function review + a test suite covering partial payment, overpayment, full/partial return, zero/negative stock, discount + loss override. | DB review + tests |
| R6 | Data recovery / destructive actions | **Medium** | Factory reset / restore exists; recoverability of an accidental reset depends on a prior backup. | `src/app/settings/backup-tab.tsx`, `backup-actions.ts`, migration `20260610…factory_reset_coverage_and_owner_guard`. | An accidental factory reset without a backup is unrecoverable for a shop. | Confirm reset is owner-only + themed-confirm (appears to be), force/recommend an export immediately before reset, and document Supabase PITR/backup expectations. | Process + docs |
| R7 | Auth / staff permissions | **Low** | Enforcement is strong server-side; risk is only if any new feature relies on client-only checks. | Server guards present: `pos/actions.ts:34`, `returns/actions.ts:33`, `daily-closing/actions.ts:27,98`, page guards in `users/settings/reports/daily-closing/page.tsx`. | Client-only gating could let a determined staff member call an action directly. | Keep the "check on the server action, not just the UI" rule; add it to PR review checklist. | Process |
| R8 | Deployment / environment | **Low** | Required env vars and the Asia/Karachi assumption are not centrally documented for go-live. | `.env.example` exists; no `vercel.json`; Meta Pixel is env+consent gated (dormant). | A missing env var or wrong TZ at deploy time causes subtle money/date bugs. | Add a go-live env checklist (incl. `TZ`, service-role key server-only, Pixel off unless configured). | Docs |

---

## 4. Money safety findings

**Good (verified in source):**
- Sales go through a single atomic RPC `pos_checkout` — totals, stock, invoice, payment, and customer ledger are computed in one DB transaction, not in JS (`src/app/pos/actions.ts:78`).
- Returns/refunds go through `create_invoice_return` (atomic) with quantity/refund handled in the DB (`src/app/invoices/[id]/returns/actions.ts:62`).
- Discounts require `can_discount` permission; below-list-price sales are blocked for staff without it; "sell at loss" is an explicit, permissioned RPC parameter (`pos/actions.ts:46‑88`).
- Every money mutation calls `revalidatePath` for `/pos`, `/invoices`, `/dashboard`, `/products`, `/customers` → no stale money values after a sale/return.

**Risks:** R1 (timezone day-bucketing), R2 (no idempotency), R3 (raw errors), R5 (RPC internals unverified here).

---

## 5. Stock safety findings

**Good:** Stock decrement on sale and restore on return are performed inside the atomic RPCs alongside the money changes (same transaction), so stock can't drift out of sync with the invoice. FIFO/batch stock lots exist (`0005_stock_lots_fifo`). Low-stock counts are derived from `stock_quantity`/`minimum_stock` at read time (no cached value). Supplier→product assignment is permission-gated and updates only `supplier_id` (`purchases/replenishment/supplier-actions.ts`).

**Risks:** Negative-stock and over-restock prevention depend on the RPCs (R5) — recommend explicit tests. A duplicated checkout (R2) would double-deduct stock.

---

## 6. Permissions / auth findings

**Good:** Two-layer permission model (`lib/permissions.ts` roles + `lib/staff-permissions.ts` granular). Every audited mutation re-checks permission **server-side** before acting (`canSellNew`, `canDiscountNew`, `canReturnNew`, `canCloseDay`, `canReopenDay`) and logs `permission.denied` attempts. Sensitive pages guard with `getCurrentContext` + `redirect` + `canX`. Service-role client is `server-only` (`lib/supabase/admin.ts:1`) so it cannot leak into the browser bundle.

**Risks:** R4 (admin-client tenant scoping), R7 (keep enforcement server-side for future features).

---

## 7. Cash drawer findings

**Good:** Expected cash is computed server-side from `getDayActivity` (not trusted from the client). **Double-close is prevented** by an upsert with `onConflict: organization_id,branch_id,closing_date` (`daily-closing/actions.ts:52‑77`). Reopening a day is restricted to owner/admin (`canReopenDay`) and audit-logged.

**Risk:** R1 — the `closing_date`/day boundary is UTC-based, so a shop transacting after midnight PKT could see cash attributed to the wrong business day.

---

## 8. Reports / dashboard consistency findings

**Good:** Reports and dashboard both read fresh per request through the RLS user-session client; there is **no `unstable_cache` / `use cache` / `revalidate` caching of money/stock/report values**. Dashboard analytics reuse the same trusted columns/RPC as reports (`get_sales_by_day`), and chart widgets only render existing server-computed numbers (no client-side recomputation).

**Risk:** R1 — reports/dashboard "today" and sales-by-day are UTC-bucketed; they are internally **consistent with each other** but offset from Asia/Karachi.

---

## 9. Data recovery / backup findings

- Audit logging (`logAudit`) covers sensitive actions (checkout, returns, day close/reopen, supplier assignment, permission denials).
- A backup/export + factory-reset flow exists in Settings with an owner guard migration.
- **Gap:** recoverability of an accidental destructive action depends on a recent backup; this isn't documented. Confirm Supabase point-in-time-recovery/backup retention and require an export before reset (R6).

---

## 10. Quick wins (low risk, high value)

1. **Set `TZ=Asia/Karachi`** in Vercel project env (addresses most of R1 without code changes) — then verify daily closing totals.
2. **Friendly error mapping** for POS/returns/closing instead of raw DB strings (R3).
3. **Go-live env + tz checklist** in docs (R8).
4. **Document backup-before-reset** and PITR expectations (R6).

---

## 11. Fixes that must be separate, reviewed PRs

- **PR A — Timezone correctness (R1):** set `TZ` and/or move date helpers to explicit Asia/Karachi; add a couple of around-midnight test cases for daily closing and "today" widgets. *Review-first (money dates).*
- **PR B — Checkout idempotency (R2):** client idempotency key + RPC dedupe / unique guard. *Review-first (touches the checkout RPC → DB).*
- **PR C — DB function review + tests (R5) and admin-client tenant audit (R4):** prove totals/FIFO/overpayment/negative-stock and verify every service-role query is org-scoped. *Review-first.*

---

## 12. Things that look safe / good

- Atomic, DB-authoritative money/stock mutations via RPCs (no JS money math on the write path).
- Consistent server-side permission checks + Zod validation on every action.
- No stale cross-request cache of money/stock/balance/report values; `revalidatePath` after each mutation.
- Double-close prevention; owner/admin-gated, audited reopen.
- `server-only` service-role client; org-scoped admin-client queries (spot-checked).
- Below-list-price + loss-override permission guards on POS.
- Broad audit logging including denied-permission attempts.
- Meta Pixel dormant unless explicitly configured (env + consent gated).
- Mobile/tablet POS, lists, dashboard, and modals are responsive and safe-area aware (recent PRs #249–#259).

---

## 13. Production go-live checklist for Fardan

**Before go-live (config/process):**
- [ ] Set **`TZ=Asia/Karachi`** in Vercel Production env, redeploy, and confirm a late-evening test sale shows in the correct day's closing and dashboard.
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is set **server-side only** (never `NEXT_PUBLIC_`).
- [ ] Confirm Meta Pixel env var is **unset** (Pixel stays off) unless you intend to enable it.
- [ ] Verify Supabase backups / point-in-time recovery is enabled and note the retention window.
- [ ] Take a manual export/backup and store it off-platform before any factory reset.

**Manual money/stock tests with real-ish data (do these on a staging/pilot shop):**
- [ ] **Sale:** ring up a multi-item sale (product + service), confirm total, stock decrement, and customer balance for a credit sale.
- [ ] **Double-tap test:** tap "Checkout" rapidly / retry on a flaky connection → confirm only **one** invoice and one stock deduction (this probes R2).
- [ ] **Partial payment & overpayment:** pay less than total (due updates), then attempt to overpay → confirm it's handled sensibly.
- [ ] **Return:** full and partial return of a sale → confirm refund amount, stock restore, and customer/cash impact; try to return more than was sold → confirm it's blocked.
- [ ] **Discount permissions:** as a non-discount staff role, try a discounted/below-price sale → confirm it's blocked.
- [ ] **After-midnight sale (around 00:30–04:30 PKT):** confirm it lands in the expected business day for closing/dashboard (this probes R1; should be correct after setting `TZ`).
- [ ] **Daily close:** open day, ring sales/expenses/a payment, close with counted cash → check expected vs counted; try to close twice → confirm it doesn't duplicate; reopen as owner → confirm gated + logged.
- [ ] **Supplier purchase + payment:** record a purchase and a partial supplier payment → confirm supplier due updates and FIFO allocation looks right.
- [ ] **Reports vs dashboard:** confirm "today's sales" on the dashboard matches the Reports page for the same period.
- [ ] **Permissions:** log in as each staff role and confirm they cannot reach money/admin/settings they shouldn't.

---

*Prepared as an audit deliverable. No application code, database, RLS, RPC, queries, or business logic were modified by this audit.*
