# Single Active Role-Account Workspace

## Scope

- Task: 53847
- Starting main: `e5e1a359c03254360d9799bf8e7955ec7d4b7e09`
- Branch: `fix/single-active-role-account-workspace`
- Exactly one normal SaleDock application workspace may be active for each authenticated `auth.uid()`.
- The same mechanism applies to `owner`, `admin`, `manager`, `cashier`, and `technician` accounts.
- The lease is not keyed by organization, branch, or role. Distinct accounts remain independent, including two Cashiers in one organization.
- No payment, settlement, accounting, stock, FIFO, supplier, Expense, Cash Drawer, permission, or other business mutation logic changed.
- Production access, migration, deployment, and mutation: zero.

## Coordination Model

`public.user_active_workspace_leases` stores one opaque coordination row per authenticated user. It contains only the user foreign key, random browser-context and tab UUIDs, a monotonic generation, and claim/heartbeat timestamps. It stores no email, role, organization, branch, IP address, user agent, token, cookie, or device fingerprint.

Four public SECURITY INVOKER RPC wrappers expose private SECURITY DEFINER implementations:

- `claim_active_workspace(uuid, uuid)`
- `get_active_workspace()`
- `heartbeat_active_workspace(uuid, uuid, bigint)`
- `release_active_workspace(uuid, uuid, bigint)`

Every private implementation derives the account exclusively from `auth.uid()`, requires an active supported profile, uses `search_path = ''`, resolves trusted objects explicitly, and has no dynamic SQL. `anon` and `PUBLIC` execution are revoked. `authenticated` can execute the narrow RPCs but has no direct lease-table privilege. The private functions and table are owned by `postgres`; `service_role` retains explicit table access for trusted administration and fixture cleanup.

Claim uses one atomic `INSERT ... ON CONFLICT DO UPDATE`. A different device/tab pair increments generation; re-confirming the same pair preserves generation. Heartbeat and release require an exact user, device, tab, and generation match, so a displaced workspace cannot refresh or remove the winner.

## Browser Identities

- Browser storage context: a random UUID in `localStorage`.
- Tab: a random UUID plus status/generation in `sessionStorage`.
- Randomness: `crypto.randomUUID()` with a `crypto.getRandomValues()` UUIDv4 fallback.
- Ordinary active-tab reload reads and confirms the existing lease without incrementing generation.
- An already paused tab reload remains paused and does not claim.
- A genuinely new tab creates a new tab UUID and claims automatically.
- A duplicated tab initially inherits session storage, detects the live duplicate, replaces the cloned tab UUID, and then claims as a new workspace.

BroadcastChannel provides immediate account-scoped same-browser notification. A browser-native `storage` event channel is the fallback when BroadcastChannel is unavailable. Messages contain only a collision probe/response or a request to re-read the authoritative lease. The database lease, not either local channel, remains authoritative.

## User Experience

The guard mounts once around authenticated workspace routes in the persistent authenticated frame. It does not run on public marketing, login, signup, password-reset, callback, onboarding, setup, legal, or platform routes.

A new workspace wins automatically. The displaced workspace remains authenticated and retains its mounted page state, but the underlying shell and content become inert and hidden from assistive technology. One modal dialog traps focus, cannot be dismissed with Escape or a close button, and offers only:

- `Use Here`, which performs and confirms an atomic claim before resuming interaction;
- `Sign out`, which makes a bounded best-effort exact-generation release before the existing sign-out action.

Takeover never destroys the Supabase session and does not reload the displaced page. An already submitted request is neither cancelled nor retried; after it settles once, the displaced workspace remains paused.

Active and paused instances check the authoritative lease every five seconds. Focus and visible-tab resume trigger an additional check. Three consecutive coordination failures show a non-destructive reconnecting status; one failed heartbeat never signs out or pauses the current owner, and a paused workspace never promotes itself because of a network failure.

## Enforcement Boundary

This is reliable operator/workspace exclusivity in the normal SaleDock application. A browser tab identity is not represented in a Supabase access token, and same-browser tabs can share authentication cookies. A malicious authenticated caller can manually invoke unrelated Data APIs or Server Actions without presenting the application tab UUID. Strong per-tab server enforcement for every business mutation would require threading and validating workspace identity through those business boundaries; that broader authorization change is intentionally outside this task.

The UI guard therefore does not claim cryptographic prevention of malicious manual API calls. It does prevent normal clicks, keyboard activation, form submission, and route navigation in a displaced workspace while leaving already-sent work untouched.

## Local Acceptance

- All six task-owned accounts used one common mechanism: Owner A, Admin B, Manager E, Cashier C, Cashier D, and Technician F.
- Different-account pairs in the same organization stayed active simultaneously: Owner/Admin, Owner/Cashier, Cashier/Cashier, and Manager/Technician.
- Same-account tabs and isolated browser contexts transferred control repeatedly without auth loss or reload loops.
- Cross-context takeover was observed within the bounded five-second poll window.
- Active reload preserved tab and generation; paused reload remained paused without a generation increment.
- A cloned session-storage tab received a fresh tab UUID and became the single winner.
- Stale heartbeat and release attempts could not affect the current generation.
- A stale paused-context sign-out did not release the winner.
- A harmless intercepted request submitted before takeover completed exactly once after the sender paused.
- BroadcastChannel-disabled testing passed through the native storage-event fallback.
- One active page generated approximately one heartbeat request per five-second interval, about 12 requests per minute. No route navigation created another guard, interval, or channel.
- Paused-dialog checks passed at 320x568, 390x844, 430x932, and 1440x900, in light/dark and reduced-motion conditions, with no WCAG 2 A/AA axe violations.
- The persistent Sidebar DOM and guard DOM survived client navigation; existing role-restricted links did not flash into Cashier/Technician navigation.

## Security And Cleanup

- Anonymous claim/read/heartbeat/release: denied.
- Inactive-profile claim: denied with PostgreSQL `42501`.
- Authenticated direct lease table SELECT/INSERT/UPDATE/DELETE: denied.
- Cross-account lease read/mutation through the public contract: impossible because no RPC accepts `user_id`.
- Concurrent same-user claims leave one authoritative final winner.
- Function owner, SECURITY DEFINER/INVOKER classification, `search_path`, execute grants, table RLS/grants, and absence of direct policies are verified from the deployed local catalog.
- Local migration reset passed from a clean database.
- Task-owned leases, profiles, auth users, organization/branch fixtures, and preferences are removed by focused tests; opening and closing lease counts match.

## Validation

Focused SQL/RPC, browser identity, persistent-shell, dialog, role/account, concurrency, reload, duplicate-tab, sign-out, offline, in-flight-request, accessibility, and fallback contracts are recorded in the sealed local evidence. Complete Node, lint, typecheck, production build, database lint/advisors, and relevant existing auth/persistent-shell/loading regressions are required before the draft PR is eligible for owner review.

## Paused Work

- Date-range/filter work remains paused.
- Cashier, RLS, POS trusted-write, and Audit Log security work remain paused and untouched.
