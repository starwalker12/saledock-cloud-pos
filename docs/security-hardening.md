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

---

## Leaked Password Protection (Dashboard Action Required)

The advisor warned about "Leaked Password Protection" being disabled.
- **Recommendation:** This is a Supabase Auth Dashboard settings configuration, not controllable safely via SQL code migrations.
- **Remediation Steps:**
  1. Log into your **Supabase Dashboard**.
  2. Navigate to **Authentication** > **Providers** > **Email**.
  3. Turn on the toggle for **Leaked Password Protection** (which utilizes HaveIBeenPwned API checking during user sign-ups or credentials changes).
