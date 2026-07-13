# 02 — Current State (LIVING — keep this updated)
*Last updated: 14 July 2026, after PR #303 merged and the Expenses handoff/audit synchronization was prepared.*

## ▶️ WHERE THE NEXT CHAT PICKS UP

Latest behavior-changing production baseline:

`1a71a12ab5e00570fb66830570e80b8175f4fef4`

This is PR #303's application-behavior merge commit. GitHub `main` must always be verified live. After documentation PR #304 merges, the current repository `main` will be PR #304's actual merge commit even though the latest application-behavior baseline remains PR #303's merge commit. Do not guess or reuse a provisional merge SHA.

Latest merged work:

- **PR #303 — improve Expenses mobile actions and Void guidance**
- Reviewed head: `f8478a7daf1df16acdf5726e5b75be3ee469c196`
- Squash merge: `1a71a12ab5e00570fb66830570e80b8175f4fef4`
- Merged at: `2026-07-13T20:09:40Z` (`2026-07-14 01:09:40` Asia/Karachi).
- Seven-file scope: four presentation source files, one source contract, one focused Expenses E2E, and one QA report.
- PR-head CI and main-commit CI passed lint, typecheck, and build.
- Vercel production deployment succeeded for the exact merge commit.
- The canonical and Vercel public aliases returned HTTP 200. These checks prove availability only.
- No migration, schema, RLS, production login, or production Expenses mutation occurred.

## 📊 MERGED AUDIT POSITION

The synchronized audit in this documentation branch records:

- P0 active: **0**
- P1 active: **0**
- P2 active: **0**
- P3 active: **1**
- Active tracked findings: **1** (`EXP-MOBILE-003`)
- Fixed findings: **15**
- Verified development-only findings: **1** (`MN-007`)
- Total tracked findings: **17**
- Dispositioned findings: **16**
- Blocked/not-tested areas: **5**

The five synchronized-audit gaps are:

1. Expenses mobile workflow.
2. Cash Drawer close/print workflow.
3. Forms/mobile keyboard behavior.
4. Loading/success/error-state coverage.
5. Dark-mode matrix.

Expenses remains in blocked/partial coverage because `EXP-MOBILE-003` is still open and the complete post-fix workflow has not yet been rerun after all three findings are fixed.

## 🔴 CURRENT EXPENSES QA FINDINGS

The local Expenses mobile workflow verification completed the real local create/edit/filter/void/restore flow and originally classified:

**C. DEFECT FOUND**

Current finding position:

### EXP-MOBILE-001 — FIXED ON MAIN — VERIFIED LOCALLY

Nine important controls were originally measured below the project's roughly 44px mobile target. PR #303 raised every listed control to 44px at 320x568, 390x844, and 430x932. Ordinary center hit-testing passed, labels were not clipped, and no horizontal overflow or bottom-navigation obstruction appeared.

- Add a new expense disclosure: 20px high.
- Add expense: 40px.
- Update expense: 40px.
- Apply: 40px.
- Edit: 36px.
- Void: 36px.
- Restore: 36px.
- Confirmation Cancel: about 37.53px.
- Confirmation Void expense: about 35.55px.

The payment-method selector measured 44px and passed.

### EXP-MOBILE-002 — FIXED ON MAIN — VERIFIED LOCALLY

PR #303 replaced the stale irreversible warning with guidance that Void archives the expense, hides it from normal lists and reports, and allows Restore through Show voided. Archive/Restore action contracts remain unchanged.

### EXP-MOBILE-003 — OPEN, P3

- The payment-method filter option became unstable/non-visible during a normal mobile tap at 390x844.
- Three summary headings were ellipsized at 320x568.
- `Top category (month)` remained ellipsized at 390x844.

PR #303 did not change AppSelect, payment-filter behavior, StatCard, or Expenses summary-label behavior. This remains a separate root-cause task.

## 🎯 IMMEDIATE NEXT TASK

After this documentation-only synchronization is reviewed and merged, create the separate review-first `EXP-MOBILE-003` source PR:

The next task must use the actual PR #304 merge SHA reported by GitHub as its exact base/main. Do not reuse `1a71a12ab5e00570fb66830570e80b8175f4fef4` as the expected repository HEAD after PR #304 merges.

- Branch: `fix/expenses-mobile-filter-and-summary-labels`.
- Deterministically reproduce the ordinary mobile payment-filter tap failure.
- Determine whether the root cause is Expenses-only or shared.
- Audit affected AppSelect and StatCard consumers before any shared change.
- Fix payment-filter stability and summary-label readability without changing expense actions, filter meanings, accounting, reports, permissions, auth, or database behavior.

After `EXP-MOBILE-003` is fixed and merged:

1. Rerun the complete Expenses owner/cashier workflow.
2. Verify all three Expenses finding dispositions and exactly four action submissions.
3. Create another documentation-only audit synchronization.
4. Remove Expenses from blocked coverage only if the complete rerun passes.
5. Only then begin Cash Drawer.

Do not begin Cash Drawer until Expenses is fixed and synchronized in the audit.

## 🧪 EXPENSES VERIFICATION EVIDENCE

Worktree:

`/Users/sw12/Projects/saledock-expenses-mobile-verification`

Branch:

`qa/expenses-mobile-workflow-verification`

Base/HEAD:

`756631a1d8e0b1506030207f631b1265a95d2f34`

Expected uncommitted files:

- `tests/e2e/expenses-mobile-workflow-verification.spec.ts`
- `docs/qa/expenses-mobile-workflow-verification.md`

Verification facts:

- Local Supabase: loopback-only and healthy.
- Authorized role: owner.
- Read-only role: cashier.
- Viewports: 320x568, 390x844, 430x932, 1440x900.
- One disposable expense created through the real UI.
- Four expected action submissions: create, update, void, restore.
- Four observed and successful.
- Matching audit rows created: 3.
- Cleanup removed the expense row and all matching audit rows.
- Expense rows remaining: 0.
- Audit rows remaining: 0.
- Unexpected browser writes: 0.
- Unrelated safety signatures: equal.
- PR #303 retained exactly four expected and four observed submissions: create, update, void, restore.
- PR #303 cleanup left zero generated expense rows and zero matching audit rows.
- PR #303 shared sign-out confirmation regression passed.
- No production authentication or mutation.
- No accounting/payment/balance/report/stock/FIFO correctness claim.

Uploaded QA document SHA-256 in this handoff package:

`7dc4dafc10c834aee01e71ea36b42b67c73b308270016c5e999bc2309f78c8b7`

Protected evidence test SHA-256:

`760f480c4794488146c80183f1f30e2128272c7c1376c55f895c02c40a8bc469`

PR #303 source worktree:

- Path: `/Users/sw12/Projects/saledock-expenses-mobile-touch-and-void-copy`
- Branch: `fix/expenses-mobile-touch-and-void-copy`
- Reviewed head: `f8478a7daf1df16acdf5726e5b75be3ee469c196`

The actual worktree test and document hashes must be calculated before another agent touches any worktree.

## ✅ RECENT COMPLETED WORK

### PR #303 — Expenses mobile touch targets and Void guidance

- Merge: `1a71a12ab5e00570fb66830570e80b8175f4fef4`
- Findings: `EXP-MOBILE-001`, `EXP-MOBILE-002`.
- Nine important controls measured 44px at all three phone viewports.
- Shared ConfirmDialog actions now have a 44px minimum without callback, focus, keyboard, ordering, or action-contract changes.
- Void guidance accurately describes archive and Restore behavior.
- Owner/cashier workflow, four expected submissions, cleanup, and unrelated signatures passed locally.
- `EXP-MOBILE-003` remains open; Cash Drawer has not begun.

### PR #302 — Repairs audit synchronization

- Merge: `756631a1d8e0b1506030207f631b1265a95d2f34`
- Documentation-only.
- Merged audit now records:
  - 13 fixed findings;
  - one development-only finding;
  - 14/14 findings dispositioned;
  - five blocked/not-tested areas.
- Repairs is recorded as fixed on main with local A4 and 80mm evidence.

### PR #301 — Repairs A4 and thermal output

- Merge: `a9ddb9bc1c905089604e559856c1aff9d392e62e`
- Finding: `REP-PRINT-001`
- A4 changed from one page with a missing footer to two complete A4 pages.
- Standard thermal: approximately 80mm x 179.2mm, one page, 89.9% span.
- Long thermal: approximately 80mm x 235.0mm, one page, 89.9% span.
- Repairs uses content-derived page height and a Repairs-only page contract.
- AppShell source, Returns source, and Reports source remained unchanged.
- Exact-attempt cancellation, unmount cleanup, duplicate activation, and timeout cleanup passed.

### PR #300 — Returns audit synchronization

- Merge: `c651a7f6a5477f29b083c72aca06147d5b14559a`
- Documentation-only.
- Returns removed from blocked coverage.

### PR #299 — Returns A4, thermal geometry, and lifecycle

- Merge: `09e1df96ccb571872ba0c3f46bd457723bfdae53`
- Findings:
  - `RET-PRINT-001`
  - `RET-PRINT-001-LIFECYCLE`
- Standard thermal: approximately 80mm x 132.3mm, one page.
- Long thermal: approximately 80mm x 164.4mm, one page.
- Horizontal span: 89.9%.
- No clipping.
- Cancellation and unmount paths passed.
- No financial/refund/stock/FIFO correctness claim.

### Reports work

- PR #295 — complete Reports A4 pagination.
- PR #297 — Reports mobile label wrapping.
- PR #298 — final Reports audit synchronization.
- Reports local PDF remains five A4 pages.
- No report formula or query changes were made by the presentation fixes.

### Earlier durable fixes

- PR #294 — CSP nonce hydration classified development-only in tested environments.
- PR #293 — shared image crop directional/reset controls.
- PR #292 — 44px print/share touch targets.
- PR #291 — accessible desktop sidebar reorder controls.
- PR #290 — accurate invoice Print / Save as PDF wording.
- PR #289 — touch-friendly Dashboard reorder controls.
- PR #288 — mobile drawer duplicate-dialog/close behavior.
- PR #287 — privacy banner hidden from invoice print/PDF output.
- PR #285 — customer settlement optional blank-field handling.
- PR #284 — service-sale total-charged fallback.

## 🧭 WHOLE-APP GOAL

Fardan now wants a genuine professional audit of every page and every user-facing function, followed by focused fixes.

The audit must cover:

- every public/authenticated/platform route;
- every role and permission boundary;
- create/read/update/archive/restore/delete workflows;
- mobile, tablet, desktop, dark mode, loading, success, empty and error states;
- touch targets, keyboard access, focus, dialogs, drawers, tables, filters and forms;
- print, PDF, download, upload, export and share surfaces;
- money, stock, FIFO, balances, reports and closing invariants;
- tenant isolation and direct-URL access;
- browser/network errors and duplicate submissions;
- local cleanup and unrelated-data signatures;
- Chromium first, then authenticated WebKit/Firefox where practical;
- 125% zoom and real-device checks as explicit manual gates.

Do not attempt to fix the entire app in one giant PR. Use one reusable master program prompt, a durable finding register, and one focused review-first PR per root-cause cluster.

## 🟠 WHAT REMAINS BEFORE AN AUDIT-READY MVP

Immediate known work:

1. Fix `EXP-MOBILE-003` in its separate review-first PR.
2. Reverify the complete Expenses workflow and synchronize the audit.
3. Cash Drawer close/print workflow.
4. Forms/mobile-keyboard coverage.
5. Loading/success/error-state coverage.
6. Dark-mode matrix.
7. Full all-pages/all-functions professional audit.
8. Final cross-module regression, recovery/backup readiness review, and production read-only smoke.

Other valuable incomplete coverage:

- real phone/device verification;
- authenticated WebKit and Firefox;
- 125% browser zoom;
- product image upload persistence;
- customers list/detail mobile interaction;
- settings panels/modals/role-specific behavior;
- responsive tables with realistic disposable data;
- Daily Closing and Supplier Statement physical artifacts;
- backup export and recovery readiness without destructive production import.

## ⏱️ MVP READINESS

Two definitions matter:

### Functional MVP

The functional MVP already exists and is live. Authentication, onboarding, POS, products, customers, invoices, returns, repairs, expenses, reports, daily closing, users/settings and audit surfaces are present.

### Audit-ready MVP

The audit-ready MVP is **not ready yet** because:

- one Expenses mobile defect remains open;
- five blocked/not-tested areas remain, including Expenses;
- the newly requested every-page/every-function audit is broader than the current mobile/print audit;
- recovery, cross-browser authenticated coverage and real-device checks are incomplete.

Planning estimate, not a promise:

- Earliest responsible target: **2–3 weeks** if the Expenses fixes are straightforward and the remaining audits find no serious money/auth/data defects.
- More realistic target for the expanded whole-app audit: **4–6 weeks** at the current review-first pace.
- It will take longer if the all-functions audit finds P0/P1 financial, tenant-isolation, authentication, migration or recovery defects.

MVP release should be gated by evidence, not a calendar date.

## 🗂️ PROTECTED WORKTREES

Treat all existing worktrees as evidence. Never blindly reset, clean, stash, delete, overwrite or switch them.

The 18 protected pre-task worktrees include Reports, Returns, Repairs, and Expenses evidence/fix/audit worktrees plus the existing release-blocker QA worktree. Always enumerate current worktrees instead of relying only on this summary. The active uncommitted Expenses evidence remains at `/Users/sw12/Projects/saledock-expenses-mobile-verification`; the clean PR #303 source worktree remains at `/Users/sw12/Projects/saledock-expenses-mobile-touch-and-void-copy`.

Known evidence hashes:

Reports evidence:

- test: `9777cee8cc68832ab99105b82d8b25e14f54e5ffe620b7d4dec7322da383832e`
- document: `69a12b830dff17e5e32fc51e5b2e246afe756d3a714062dcc23e9799a2aa7f5a`

Original Returns evidence:

- test: `f8bfc3bed3b60a247c1ed37e216b71814ea814a74721465e8d5b311e1aacf888`
- document: `84de4bd66815578a8ac11f0e9c9a08667573057da1df943ead2c973dfdb663b0`

Repairs evidence:

- test: `af21811292c93691bfa6a8157efa2877b706172ca5a40ccfc62f7f9bfeaeb803`
- document: `aedfa5ae81b28cb55cbef835a5bf3b7e90e97084102a831cb57e0accd6cff032`

For every other dirty evidence file, use the full locally recorded hash. Do not invent missing values.

## 🧪 EVIDENCE BOUNDARIES

- GitHub CI normally proves lint, typecheck and build only.
- Local Playwright, screenshots, print media, PDFs, coordinates and fixture tests remain local evidence unless a workflow explicitly runs them.
- HTTP 200 proves availability only.
- A presentation test does not prove accounting or formula correctness.
- Local fake roles do not prove production account state.
- Production stays read-only unless an explicit review-first transaction is approved.
- A passing test after retry is a reported flake, not a clean pass.
- Do not hide local instrumentation failures; classify them separately.

## 🔐 MUST-KEEP CAUTIONS

- One main task at a time.
- Money/auth/database/migration/permission/stock/checkout/customer-balance/cash-drawer/report work is review-first.
- Verify exact main, branch, base/head, file scope, CI, Vercel, mergeability and review threads before merge.
- Use expected-head protection.
- No native `alert`, `confirm` or `prompt`.
- No stale cache for money, stock, balances, reports, cash drawer, auth or permissions.
- Never expose secrets.
- Every mutation task needs exact allowed writes, forbidden writes, before/after safety signatures and cleanup.
- End major tasks with “Risk closed because…” or “Risk remains open because…”.

## ↩️ REVERT POINTS — newest first

- `1a71a12ab5e00570fb66830570e80b8175f4fef4` — PR #303 Expenses mobile touch targets and Void guidance.
- `756631a1d8e0b1506030207f631b1265a95d2f34` — PR #302 Repairs audit synchronization.
- `a9ddb9bc1c905089604e559856c1aff9d392e62e` — PR #301 Repairs print fix.
- `c651a7f6a5477f29b083c72aca06147d5b14559a` — PR #300 Returns audit synchronization.
- `09e1df96ccb571872ba0c3f46bd457723bfdae53` — PR #299 Returns print and lifecycle fix.
- `2b24fcf7b88812987ed415426e5f5a715c6e6ea4` — PR #298 Reports final audit sync.
- `0e85a47561b073236c5297d629927c8684fcc889` — PR #297 Reports mobile labels.
- `30400475202eeb2bbeb126abe3e5a281efebb95d` — PR #295 Reports pagination.

Rollback latest merge:

`git revert 1a71a12ab5e00570fb66830570e80b8175f4fef4 && git push origin main`
