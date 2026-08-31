# Active Workspace Production Initialization Diagnosis

## Scope

- Task: 10673
- Starting main: `f044bed1896fa2efba71acfa62dca841e1180c45`
- Production deployment inspected: `dpl_BkiKD6Luyw5qiCiMYLn7LMAt2kcG`
- This correction is limited to browser Supabase initialization and sanitized active-workspace failure staging.
- The lease migration, RPCs, grants, RLS, coordination rules, auth roles, and all business logic remain unchanged.

## Proven Production Failure

The authenticated server-rendered workspace remained valid, but the mounted browser Supabase client was configured with the local fallback URL and fallback key. Its auth storage key was therefore derived from `127`, while the valid browser-readable production auth cookie used the production project reference.

The mounted client returned:

- `auth.getSession()`: successful call, no session;
- `auth.getUser()`: `AuthSessionMissingError`, status 400;
- workspace RPCs reached: zero;
- lease rows created: zero.

The production auth cookie was present, contiguous across three chunks, browser-readable, base64url-decodable, valid JSON, and contained the expected session/user shape. Disposable localStorage, sessionStorage, secure UUID, BroadcastChannel, and storage-event fallback probes all passed. Anonymous `get_active_workspace()` discovery returned PostgreSQL `42501`, proving PostgREST already exposed the RPC; no schema-cache reload was used.

## Root Cause

`src/lib/env.ts` validates the dynamic `process.env` object. Next.js only inlines browser-visible public variables when code references `process.env.NEXT_PUBLIC_*` statically; dynamic process-env lookups are not inlined. The server had the production environment, while the browser bundle fell back to `http://127.0.0.1:54321` and `supabase-anon-key-not-configured`.

An exact-main production build reproduced the defect even when explicit public Supabase values were supplied: the active browser chunk contained the fallback pair and omitted the supplied values.

## Correction

The central browser Supabase client now references `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` directly, allowing Next.js to inline the configured public values at build time. Server Supabase configuration is unchanged.

Active-workspace initialization now records one sanitized internal stage and code for failures across auth, device/tab storage, coordination channel, lease read/claim, and lease parsing. The user-facing fail-closed message is unchanged. Logs redact bearer values, JWT-shaped values, and Supabase session-key material and never include a user ID, email, cookie, token, or authorization header.

## Safety

- Production business-data mutation: zero.
- Production coordination-state mutation: zero.
- Migration/schema/history changes: zero.
- PostgREST cache reload: not used.
- The one-active-workspace guard remains fail closed until ownership is established.
- Date-range and Cashier/security work remain paused.

## Correction Delivery And Production Acceptance

- Correction PR: `#356`
- Reviewed head: `9755bbfbed66fbb8dab9ec0e99c376571984da2e`
- Source squash: `4855c910d4feacee982ac590181a6129baa7ffa8`
- Merge timestamp: `2026-08-31T07:26:43Z`
- Main CI: GitHub Actions run `33368403753`, successful.
- Production deployment: `dpl_7E9MNQMXKKt6ahtyjsVTeRXzpyRW`, Ready/Current/Production for the exact source squash.
- Production availability: root and login returned HTTP 200.
- Migration history remained 53 local / 53 remote / 0 pending. `20260830052210_single_active_role_account_workspace` remained present exactly once; no migration apply or schema-cache reload occurred.
- The deployed browser bundle contained the production Supabase hostname and no localhost fallback hostname. No anon-key value was recorded.
- `auth.getSession()` classification: valid authenticated browser session; no session material retained.
- `auth.getUser()` classification: the approved authenticated Owner was recognized; `AuthSessionMissingError` was absent.
- Initial guard claim reached PostgREST, succeeded, created exactly one lease row at generation 1, and made the shell interactive without `Session check unavailable` or retry loops.
- Same-user production tab coordination passed: newest workspace won, the displaced tab remained authenticated and paused, and repeated `Use Here` transfers produced one winner and monotonic generation changes.
- Active reload remained active with generation 6 unchanged. Paused reload remained paused with generation 6 unchanged and did not steal the winner.
- Production Duplicate Tab was not exercised because the available Chrome automation lacked a true Duplicate Tab operation; exact-head local proof is retained.
- Cross-device production acceptance was not exercised because no second already-approved authenticated context was available; exact-head local proof is retained.
- Accepted local proof continues to cover different-account independence for every supported role pair, stale generation/release, sign-out release, offline/reconnect, and in-flight-request behavior.
- The paused dialog passed focus trap, inert/assistive-technology blocking, Escape, no-close-button, and action reachability checks at 390×844 and 1440×900. Exact-head local proof covers 320×568, 430×932, light/dark, and reduced motion.
- Dashboard → Invoices → Products retained one expanded 288px Sidebar and one guard, with no SidebarLoading, width jump, or route-triggered claim.
- The active lease heartbeat followed the five-second cadence; no duplicate poller, sub-second loop, failed-RPC loop, hydration error, or auth refresh loop was observed.
- Profile authorization containment remained unchanged: anon and authenticated table-wide profile UPDATE denied; authenticated `profile_picture_url` UPDATE retained; all other profile-column UPDATE denied.
- All protected public business/profile relation counts and digests matched before and after. Production business-data mutation: zero.
- Expected production coordination state only: one lease row for the approved account, heartbeat updates, and bounded generation increments ending at generation 8.
- Evidence path: `/Users/sw12/Projects/saledock-local-evidence/active-workspace-initialization-production-verification`
- Evidence manifest SHA-256: `e7251e8a5e4b90278df68e299100ed5e999bedaad4a62e724ebaac6ff83e1f68`
- Single-active-role-account workspace status: **CLOSED / VERIFIED IN PRODUCTION**.
- Date-range and Cashier/security work remain paused.
