# Supabase Database Hardening Documentation

This document explains the security vulnerabilities identified by the Supabase Security Advisor and the corresponding hardening measures implemented in the `0010_security_hardening.sql` database migration.

---

## Vulnerabilities Identified & Resolved

### 1. Function Search Path Mutable for `public.set_updated_at`
- **Risk:** Without a specific search path, PostgreSQL functions are executed utilizing the caller's search path. A malicious actor could create a dummy table or helper in their own schema that intercepts function calls, leading to SQL injection or privilege escalation exploits.
- **Hardening Applied:** Modified the function signature to specify a strict `search_path`:
  ```sql
  alter function public.set_updated_at() set search_path = public, pg_temp;
  ```
  This forces the function to search only inside `public` and standard temporary workspaces, rendering mutable path injections impossible.

### 2. Definer Functions Executable by Public
- **Risk:** Definer functions (`SECURITY DEFINER`) run with the privileges of the user who created them (typically the database administrator or service role). In standard setups, functions like `current_organization_id()` and `current_user_role()` were executable by any anonymous or public caller.
- **Hardening Applied:** Revoked public execution rights and explicitly bound execution to authenticated clients:
  ```sql
  -- Restrict search path
  alter function public.current_organization_id() set search_path = public, pg_temp;
  alter function public.current_user_role() set search_path = public, pg_temp;

  -- Revoke access from PUBLIC
  revoke all on function public.current_organization_id() from public;
  revoke all on function public.current_user_role() from public;

  -- Grant exclusive access to authenticated clients
  grant execute on function public.current_organization_id() to authenticated;
  grant execute on function public.current_user_role() to authenticated;
  ```

### 3. Factory Reset RPC Shielding & Access Tightening
- **Risk:** High-risk definitive functions executing deletes on core business tables could be targets for mutable path hijacks or unauthorized public sweeps.
- **Hardening Applied:** Bound the Postgres RPC function `reset_organization_to_factory_defaults` with strict security constraints:
  1. Revoked all execute rights from `PUBLIC`, `anon`, or unauthenticated roles.
  2. Granted execute permissions exclusively to `authenticated` users.
  3. Specifying a strict, immutable `search_path`:
     ```sql
     alter function public.reset_organization_to_factory_defaults(...) set search_path = public, pg_temp;
     ```
  4. Server-side password validation requires re-authenticating the caller's login password directly against the Supabase Auth module (`supabase.auth.signInWithPassword`).
  5. The function enforces that the executing user's profile role is strictly `owner` or `admin`.

---

## Leaked Password Protection (Dashboard Action Required)

The advisor warned about "Leaked Password Protection" being disabled.
- **Recommendation:** This is a Supabase Auth Dashboard settings configuration, not controllable safely via SQL code migrations.
- **Remediation Steps:**
  1. Log into your **Supabase Dashboard**.
  2. Navigate to **Authentication** > **Providers** > **Email**.
  3. Turn on the toggle for **Leaked Password Protection** (which utilizes HaveIBeenPwned API checking during user sign-ups or credentials changes).

---

## Running Hardening Checklist

### Done in code
- [x] **RLS enabled** on every business table (migrations 0001, 0006, 0013).
- [x] **`search_path` hardened** on `set_updated_at`, `current_organization_id`, `current_user_role` (0010).
- [x] **RPC EXECUTE grants tightened** (0012) — `pos_checkout`, `record_credit_payment`, `add_stock_lot`, `adjust_stock`, `create_invoice_return` no longer expose EXECUTE to `PUBLIC` or `anon`.
- [x] **Service role** is `import "server-only"` and never reaches the browser bundle.
- [x] **POS atomicity** — `pos_checkout` is a single transaction, security invoker, server-side total recompute, walk-in fully-paid rule, FIFO allocation, loss-prevention check.
- [x] **Strict service required fields** (0013) — `pos_checkout` enforces `requires_provider`, `requires_account_number`, `requires_reference` per-product at the database layer.
- [x] **Loss-prevention events table** (0013) — durable structured record populated by a trigger on `audit_logs`.
- [x] **Factory Reset RPC Protection** (0015) — definitive transaction `reset_organization_to_factory_defaults` enforces strict `search_path`, limits execute to authenticated, validates owner/admin role, and requires password re-authentication via Supabase Auth server-side.

### Manual dashboard actions (owner-only)
- [ ] **Leaked password protection** — see steps above.
- [ ] **(Optional) Disable open email sign-ups** in Supabase Auth — belt-and-braces alongside the app's `signUpAction` lock.
- [ ] **(Optional) Configure email templates** — required for staff invites from `/users` to land in inboxes.

### Future code hardening (not blockers)
- Audit-log entries for invite sent, role changed, user deactivated, login failure spike.
- Per-org rate limiting on `pos_checkout` and `record_credit_payment`.
- Field-level RLS for service `account_number` / `receiver_account` (currently visible to all org members; consider redacting for `cashier` role on closed days).
