# SaleDock Cloud POS — Continuation Brief
*Use this in a new ChatGPT project chat. Updated 14 July 2026.*

## Who I am

I am **Fardan Aatir**, a non-technical shop owner and the product director for SaleDock Cloud POS.

I use ChatGPT as:

- my AI handoff manager;
- a reviewer of Codex/Claude/Gemini reports;
- a safety gate for money, stock, auth, database and production work;
- the person who writes exact copy/paste prompts for coding agents.

Please use plain English. Do not assume I can inspect code or database rows myself.

## Project

Repo:
`github.com/starwalker12/saledock-cloud-pos`

Production:
`https://saledock.site`

Vercel alias:
`https://saledock-cloud-pos.vercel.app`

Latest behavior-changing production baseline:
`1a71a12ab5e00570fb66830570e80b8175f4fef4`

This is PR #303's application-behavior merge commit. GitHub `main` must always be verified live. After documentation PR #304 merges, the current repository `main` will be PR #304's actual merge commit even though the latest application-behavior baseline remains PR #303's merge commit. Do not guess or reuse a provisional merge SHA.

Stack:
Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase, Vercel.

Currency/timezone:
PKR / Asia-Karachi.

Next.js fact:
use `src/proxy.ts`, not `middleware.ts`.

## Current merged audit

After PR #303 and this documentation synchronization:

- fixed: 15;
- development-only: 1 (`MN-007`);
- active: 1 (`EXP-MOBILE-003`);
- tracked: 17;
- dispositioned: 16;
- blocked/not-tested: 5.

Blocked areas in the merged audit:

1. Expenses mobile workflow.
2. Cash Drawer close/print workflow.
3. Forms/mobile keyboard.
4. Loading/success/error states.
5. Dark mode.

## Latest merged work

PR #303 — `fix: improve Expenses mobile actions and void guidance`

- Reviewed head: `f8478a7daf1df16acdf5726e5b75be3ee469c196`.
- Squash merge: `1a71a12ab5e00570fb66830570e80b8175f4fef4`.
- Merged at: `2026-07-13T20:09:40Z` / `2026-07-14 01:09:40` Asia/Karachi.
- `EXP-MOBILE-001` and `EXP-MOBILE-002` are fixed on main and verified locally.
- PR-head and main-commit CI succeeded; the exact merge commit deployed successfully on Vercel.
- Public HTTP 200 checks prove availability only. No authenticated production Expenses workflow ran.
- No migration, schema, RLS, accounting, query, auth, permission, or database behavior changed.

## Current Expenses position

Expenses mobile workflow verification originally found three defects. PR #303 fixed two; one remains open.

Worktree:
`/Users/sw12/Projects/saledock-expenses-mobile-verification`

Branch:
`qa/expenses-mobile-workflow-verification`

Base/HEAD:
`756631a1d8e0b1506030207f631b1265a95d2f34`

Uncommitted files:

- `tests/e2e/expenses-mobile-workflow-verification.spec.ts`
- `docs/qa/expenses-mobile-workflow-verification.md`

Classification:
`C. DEFECT FOUND`

Finding dispositions:

- `EXP-MOBILE-001`: FIXED ON MAIN — VERIFIED LOCALLY. Nine important controls now measure 44px at 320x568, 390x844, and 430x932.
- `EXP-MOBILE-002`: FIXED ON MAIN — VERIFIED LOCALLY. Void guidance now accurately describes archive, normal-list/report visibility, and Restore through Show voided.
- `EXP-MOBILE-003`: OPEN, P3. Mobile payment-method filter option instability and truncated summary headings remain.

The PR #303 create/update/void/restore workflow retained exactly four successful submissions. Owner/cashier behavior passed locally, cleanup left zero generated expense and matching audit rows, unexpected writes were zero, and unrelated signatures remained equal.

Safety:

- one disposable local expense;
- owner authorized and cashier read-only;
- four expected action submissions and four observed;
- three matching audit rows;
- zero unexpected writes;
- cleanup left zero matching expense and audit rows;
- unrelated signatures equal;
- no production login or mutation;
- no accounting/payment/report/stock/FIFO correctness claim.

Expenses is still partial. The full post-merge completion rerun and final audit closure must wait for `EXP-MOBILE-003`.

## Immediate next action

After this documentation-only PR is reviewed and merged, create one separate review-first source PR:

The next task must use the actual PR #304 merge SHA reported by GitHub as its exact base/main. Do not reuse `1a71a12ab5e00570fb66830570e80b8175f4fef4` as the expected repository HEAD after PR #304 merges.

`fix/expenses-mobile-filter-and-summary-labels`

Scope it only to:

- deterministic payment-filter stability through an ordinary mobile tap;
- readable Expenses summary labels at narrow widths.

Keep AppSelect and StatCard consumer review explicit. Do not combine all whole-app work into one PR.

After `EXP-MOBILE-003` merges, rerun the complete Expenses workflow, verify all three finding dispositions, and perform another documentation-only audit synchronization. Remove Expenses from blocked coverage only after that rerun passes. Cash Drawer has not begun and must remain blocked until then.

## Whole-app objective

I want every page and every function audited and debugged.

Use the attached reusable master Codex program.

It must:

- inventory every route/action/function;
- test genuine user workflows;
- test roles, direct URLs and tenant boundaries;
- test mobile/tablet/desktop, dark mode, loading/success/error, touch and keyboard;
- use disposable local data with cleanup and safety signatures;
- create a finding report;
- fix one root-cause cluster per review-first draft PR;
- maintain a finding register and continuation checkpoint;
- never create one giant all-fixes PR.

## MVP status

The functional MVP is already live.

The audit-ready MVP is not ready.

Planning estimate:

- earliest 2–3 weeks if remaining work is straightforward;
- realistic 4–6 weeks for the expanded all-pages/all-functions audit;
- longer if serious money/auth/tenant/data defects appear.

This is an evidence-gated estimate, not a promise.

## Standing safety rules

- One main task at a time.
- Review-first for money, stock, FIFO, checkout, payment, balances, expenses, cash drawer, reports, auth, permissions, database and migrations.
- No production mutation unless separately approved.
- No secrets in chat.
- No native alert/confirm/prompt.
- Verify exact main/base/head/file scope/CI/Vercel/reviews before merge.
- Use expected-head protection.
- Preserve all dirty worktrees.
- Distinguish local, CI, Vercel and production evidence.
- End major work with “Risk closed because…” or “Risk remains open because…”.

## Files to attach in the new chat

Required:

- `SALEDOCK_MASTER_CONTEXT.md`
- `02_CURRENT_STATE.md`
- `03_REMEMBER.md`
- `CHATGPT_CONTINUATION_BRIEF.md`
- `expenses-mobile-workflow-verification.md`

Useful:

- `UI:UX guide.md`
- `CODEX_WHOLE_APP_AUDIT_AND_FIX_PROGRAM.md`
- `HOW_TO_CONTINUE_IN_NEW_CHAT.md`
