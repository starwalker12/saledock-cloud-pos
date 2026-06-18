# Remember — Key Facts for Future Work

This file captures durable facts that are NOT obvious from a quick read of the code.
Do not store secrets, tokens, OTPs, passwords, invite links, signed URLs, or env values here.

## Storage buckets
* `profile-pictures` is a **PRIVATE** bucket. Its stored value is a `/object/public/...`
  "public-format" URL, but that URL is NOT directly loadable. Display always needs a
  **signed URL** (`signProfilePictureUrl` server-side, or `resolveImagePreviewUrlAction`
  in the upload component). Never change the stored value to a signed URL — the signature expires.
* `public-branding` is a **PUBLIC** bucket. The logo URL is loadable as-is; no signing needed.

## Staff invitations
* Table `staff_invitations` has a **full unique index** on `(organization_id, lower(email))`
  (`uq_staff_invitations_org_email`). There is at most ONE invite row per email per shop.
  Re-inviting a revoked/declined/expired email must **reuse/refresh that same row**, never insert a new one.
* Invite status lifecycle: `pending → accepted | declined | revoked | expired`.
* New invited staff default to `onboarding_completed = false` until they accept. Accepting the
  invite (`acceptStaffInviteAction`) sets `onboarding_completed = true`, so accepted/active staff
  are NOT treated as "needs onboarding" and are not redirected into the owner onboarding wizard.
* Invite acceptance is **password-based** for fresh staff. Unfinished owner-signup accounts
  (verified email, no org, onboarding not complete) are allowed to accept and become staff
  without a new password; their onboarding draft is cleaned up only for that user.
* Server-side guard: if the signed-in session email differs from the invite email, acceptance is blocked.

## Invite eligibility rules (branch fix/staff-invite-rules-permissions-cache)
* Already staff in this shop / accepted invite → blocked: "This person is already in this shop. You can update their role from Staff accounts."
* Pending invite already exists → blocked: "This email already has a pending invite. Resend or revoke the existing invite." (use the Resend/Revoke buttons on the existing row)
* Revoked / declined / expired invite → allowed; the existing row is refreshed → "New invitation sent."
* Email belongs to a completed account in another shop → blocked: "This email cannot be invited to this shop. Ask the person to use a different email or contact support." (no multi-shop membership in this PR)
* Unfinished owner-signup account with no org → allowed (PR #238/#239 behavior).
* Fresh unknown email → allowed → "Invitation sent. ..."
* Invalid email → "Enter a valid email address." (from the zod schema)
* Too many attempts → "Too many invite attempts. Please wait a little before trying again."
* Unknown/unexpected error → "We could not send this invite right now. Please try again."
* Raw Supabase/Auth/Postgres errors are never shown in the UI.

## Permissions model (audited — sound)
* `src/lib/permissions.ts` = role-based helpers (owner/admin/manager/cashier/technician).
* `src/lib/staff-permissions.ts` = granular, profile-aware checks (e.g. `canViewReportsNew`).
* Every sensitive page (`users`, `reports`, `settings`, `daily-closing`, `audit-log`, etc.) enforces
  access **server-side** in the page component (redirect / role-gated render), not just by hiding UI.
* User-management server actions re-check `requireUserManager` (owner/admin), block self-role-change
  and self-deactivate, protect the last active owner/admin, and are org-scoped.
* Conclusion: typing a URL directly does not bypass access control. No gaps required fixing.

## Cache / Redis
* No Redis / Upstash / Vercel KV is configured in this project (no package, no env).
* `src/lib/cache/rate-limit.ts` is a safe abstraction: uses Upstash Redis REST via `fetch`
  ONLY if `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, otherwise an in-memory
  per-instance fallback. It **fails open** (cache errors never block actions) and is used ONLY for
  the invite cooldown — never for money, stock, permissions, auth, or any business data.
* To enable distributed rate-limiting later: provision an Upstash Redis (free tier exists) and set
  `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. No code change or package needed.

## Hard safety rules (do not violate)
* Never change checkout/payment math, invoice totals/paid/due, returns/refunds, customer balances/ledger,
  supplier dues/purchases/payments, stock/FIFO, repairs pricing, cash drawer/daily closing, reports/dashboard
  money values, or backup/restore/factory reset.
* Never cache money/stock/permissions/auth/OTP/passwords/invite tokens/service-role results.
* Never expose the service-role key, OTPs, passwords, invite tokens/links, access/refresh tokens, or Redis URL/token to the client or logs.
* Owner is non-technical: all user-facing PRs are review-first DRAFT PRs; never push to main directly.
