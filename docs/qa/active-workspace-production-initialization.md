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
