# Demo Data Retirement Prerequisite

Task: 31574. Starting main: `094359c431f50498ea0588aa417d1c3a7b8b0105`.

DEMO MAINTENANCE RETIRED - EXISTING DATA LEFT UNTOUCHED

## Why

The legacy demo actions performed many independent Supabase business writes and
deletes. Creation included a customer with outstanding balance 360, direct customer
ledger entries, invoices, payments, stock lots/movements, returns, expenses and
repairs. Removal issued separate deletes. Neither path provided atomic accounting
maintenance, and both conflicted with the planned forward-trust boundary.

This change removes that implementation entirely rather than leaving unreachable
mutation code. It does not redesign demo maintenance or clean existing records.

## Action Boundary

`loadDemoDataAction` and `removeDemoDataAction` retain their exported async names,
`DemoActionState | null` / `FormData` parameters and `Promise<DemoActionState>`
results. Both resolve `getCurrentContext()` before returning:

| Caller | Create | Remove |
| --- | --- | --- |
| No user/profile | Existing authentication denial | Existing authentication denial |
| Owner/Admin | Deterministic retired response | Deterministic retired response |
| Manager/Cashier/Technician | Existing permission denial | Existing permission denial |
| Unsupported role | Permission denial | Permission denial |
| Context failure | Safe access-verification error | Safe access-verification error |

Owner/Admin responses are exactly:

> Demo data creation is temporarily unavailable while SaleDock protects accounting history. Existing shop data was not changed.

> Demo data removal is temporarily unavailable while SaleDock protects accounting history. Existing demo and shop data were left unchanged.

Confirmation fields and previous ActionState are not read. Old exact confirmation
phrases cannot revive mutations. `demo_data_enabled` is retained in platform
settings but is not consulted by either action, whether true, false or unavailable.
The fail-open setting helper and privileged client imports are removed.

The existing lower-role permission-denied `logAudit` calls are preserved. These may
write an audit through the existing audit subsystem; this is not a claim of zero
database writes for every authorization denial. Owner/Admin retired calls add no
audit requirement. Demo business queries, mutations, RPCs and invalidations are zero.

## Proof

`tests/demo-data-retirement.test.mjs` directly invokes the compiled exported server
functions with mocked authenticated context, independently of Settings visibility.
It covers both actions across six requested roles, missing/wrong/old confirmations,
three platform-flag conditions, forged stale-client state, missing profiles, context
errors and unsupported roles. Strict dependency spies reject client creation,
business-table access, insert/update/upsert/delete/RPC, platform lookup and cache
invalidation. A pre-existing-record model across 18 business relations, including
the nonzero customer balance, remains exactly unchanged.

The AST guard rejects direct business-query/mutation calls and unexpected privileged
dependencies without depending on comments or formatting. Export contracts remain
compatible. Settings still has `SHOW_DEMO_TAB = false`, with both navigation and
content gated. No visible Demo tab was manufactured for browser testing.

The local production build also registers both exported actions. Eight direct HTTP
Server Action POSTs using synthetic Owner/Admin sessions, missing/old exact
confirmations and forged client state return the exact retired ActionState without
using the hidden Demo UI. All 45 protected local relation signatures remain exact
before/after these calls. Authentication setup precedes that signature bracket.
No passwords, tokens, cookies or raw response bodies are retained in evidence.

These requests use the current build's Action IDs, not obsolete cross-build IDs.
The framework's deployment handling is unchanged; recognizing arbitrary obsolete
hashed Action IDs is not claimed.

## Scope And Validation

Runtime scope is only `src/app/settings/demo-actions.ts`. The platform-console
documentation only clarifies the retained flag. Factory Reset, the atomic importer,
Settings layout, accounting RPCs and migrations are unchanged. No balances,
historical rows, stock or existing demo records are modified by retirement.

Two legacy source contracts previously required demo expense timestamps and demo
repair-customer provenance. Their demo-specific assertions now require that the
retired source cannot write expenses/repairs; all existing import, Cash Drawer and
repair tenant-integrity assertions remain intact. The initial full-suite run caught
these obsolete expectations and is retained in evidence, not counted as a pass.

Focused retirement tests: 65 passed; with the two adapted legacy regression files,
84 passed. Relevant Settings/auth/action contracts: 42 passed. Complete Node:
612 tests, 605 passed, 7 pre-existing opt-in database checks skipped, 0 failed.
Lint passed with only 2 pre-existing privacy-center warnings. Typecheck, Next.js
16.2.6 production build and diff check passed. Detailed logs are recorded in the
separate task evidence. No production access or production mutation is performed.
Browser tests are not required for this server-only refusal and unchanged hidden UI.

Evidence: `/Users/sw12/Projects/saledock-local-evidence/demo-data-retirement-prerequisite`.
Its independent `SHA256SUMS` seals the source inventory, role/confirmation/flag
matrices, spy observations, test logs, preservation checks and final report.

Not delivered: atomic demo replacement, demo cleanup, ledger sequence/trust/anchors,
restricted ledger executor, direct-ledger-DML closure, outstanding-balance
protection, Supplier Statement or Service V1. The PR remains draft for owner review.
