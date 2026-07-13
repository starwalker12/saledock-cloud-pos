# 03 — Remember For The Future — SaleDock Cloud POS
*Durable memory. Last updated: 14 July 2026, after PR #303 fixed EXP-MOBILE-001 and EXP-MOBILE-002 while EXP-MOBILE-003 remained open.*

## 👤 Who Fardan is

- Fardan is a non-technical shop owner, product director and final product decision-maker.
- He uses ChatGPT as his AI handoff manager, reviewer and safety gate.
- He pastes prompts into Codex/Claude/Gemini and returns their reports for review.
- Explain technical matters in plain English and practical shop terms.
- Do not assume he can inspect code, Git diffs, Supabase rows or CI details himself.
- Give exact copy/paste prompts for coding agents.
- Keep one main task at a time.
- Do not say “done” without evidence and a clear production/live-site boundary.

## 🧠 How we work

- Begin from the real shop workflow and user intent.
- Verify confident agent claims independently where possible.
- Use separate branches, worktrees and draft PRs.
- Keep audits, source fixes and audit-document refreshes separate.
- Review exact main SHA, PR head, file list, CI, Vercel, mergeability, draft status and review threads before merge.
- Use expected-head protection for merges.
- When a coding agent sees existing dirty/untracked work, it must stop and preserve it.
- Never blindly clean, reset, stash, delete, overwrite or switch a protected worktree.
- Every meaningful session refreshes `02_CURRENT_STATE.md`.
- Durable truths and major history updates go in this file.

## 🏗️ Product and architecture facts

- Product: SaleDock Cloud POS.
- Repo: `github.com/starwalker12/saledock-cloud-pos`.
- Production: `https://saledock.site`.
- Vercel alias: `https://saledock-cloud-pos.vercel.app`.
- Stack: Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase, Vercel.
- Next.js 16 uses `src/proxy.ts`, not `middleware.ts`.
- Currency/timezone: PKR / Asia-Karachi.
- Main auto-deploys.
- Supported languages: English, Urdu and Roman Urdu.
- Mobile should feel like a dedicated app, not a shrunken desktop.
- Dark mode uses the white logo.
- True white surfaces may need `bg-[#fff]` because broad dark rules can override `bg-white`.
- Harmless UI preferences generally belong in existing JSON preference storage instead of new columns.

## 💰 Business truths that must not drift

- Tenant isolation uses `organization_id`.
- Product cost uses FIFO stock lots.
- Stock changes must be atomic.
- Service principal is pass-through, not profit.
- Service commission is profit.
- Customer pays total charged.
- Customer credit means debt; there is no stored customer-advance/deposit feature.
- Overpayment is change given, not additional revenue.
- POS totals are recomputed server-side.
- Old invoices and reports must remain historically stable.
- Supplier payment is money movement, not a second cost.
- Real invoice numbers use `INV-*`; prefix changes require separate reviewed migration.
- Below-cost live sales are blocked and overrides logged.

## 🧾 Held Bills

- Held bills are not invoices.
- They must not consume invoice numbers.
- They must not deduct or reserve stock.
- They must not create payments, customer-ledger entries, cash-drawer changes, daily-closing effects, report effects or completed sales.
- All business effects happen only at final checkout.

## 🧾 Service sales

- Blank, null or zero service `unit_price` means missing and must fall back to `service_total_charged` or principal plus commission.
- Principal stays pass-through.
- Commission stays profit.
- PR #284 fixed the zero-value service invoice/payment defect.

## ⚡ Cache and speed rules

Never serve stale-sensitive data for:

- checkout and payment calculations;
- invoice totals, paid and due;
- returns and refunds;
- customer balances and ledger;
- supplier dues, purchases and payments;
- stock and FIFO;
- repairs pricing and payment;
- expenses where stale values affect daily operations;
- cash drawer and daily closing;
- reports and Dashboard money values;
- authentication and permissions;
- OTP, password and invite tokens;
- service-role results.

Optional Redis/Upstash support is invite-cooldown-only, server-side, fail-open and stores hashed keys/counters only.

## 🔐 Auth and staff facts

- Owner/admin can invite staff.
- Staff choose their own password; the owner never sees it.
- The wrong signed-in email is blocked server-side from accepting an invite.
- Same-shop staff and duplicate pending invites are protected.
- Completed accounts must not be silently overwritten or moved.
- Fardan uses Google OAuth; password/reset/factory-reset changes require extra care.
- Canonical owner email for verification before destructive work: `fardan.aatir@outlook.com`.
- Never ask Fardan to paste secrets into chat.

## 📱 UI and accessibility rules

- Do not use native `alert`, `confirm` or `prompt`.
- Use in-app dialogs and role-alerts.
- Important mobile controls should generally be about 44px high.
- Respect reduced motion.
- Touch, keyboard and focus behavior must be verified, not inferred from CSS alone.
- A shared component fix requires consumer regression testing.
- Mobile summary labels must be readable; truncation must be intentional and justified.

## 🧾 Durable Expenses facts

- Expense Void is an archive operation, not hard delete; Show voided exposes Restore.
- PR #303 merged as `1a71a12ab5e00570fb66830570e80b8175f4fef4`.
- Important Expenses mobile controls now meet the approximately 44px guideline at the three tested phone widths.
- Shared ConfirmDialog Cancel/Confirm actions now have a 44px minimum.
- PR #303 did not change confirmation callbacks, focus behavior, keyboard behavior, action ordering, expense actions, or archive/Restore contracts.
- Void guidance now states that the expense is hidden from normal lists/reports and can be restored through Show voided.
- `EXP-MOBILE-003` remains open for payment-filter stability and narrow summary-label readability.
- Expenses remains incomplete in the whole-app audit until EXP-MOBILE-003 is fixed, the complete workflow is rerun, and a later audit synchronization passes.
- Cash Drawer must not begin before Expenses is fixed and synchronized.

## 🖨️ Durable print facts

### Reports

- `RPT-PRINT-001`: one-page PDF truncation.
- PR #295 fixed it using optional `AppShell.printFullDocument`.
- The option defaults off and Reports opts in.
- Local output changed to five complete A4 pages.
- Screen scrolling stayed intact.
- `RPT-MOBILE-001`: Reports label truncation.
- PR #297 added `StatCard.wrapLabel?: boolean`.
- Default is false; only selected Reports cards opt in.

### Returns

- `RET-PRINT-001`: miniature/clipped 80mm output.
- `RET-PRINT-001-LIFECYCLE`: stale asynchronous preparation.
- PR #299 fixed both.
- Returns uses a Returns-only named page, 72mm printable context and content-derived height.
- Standard and long local receipts are one page, centered and unclipped.
- Cancellation and unmount cannot print, show false errors or recreate stale state.

### Repairs

- `REP-PRINT-001`: missing A4 footer and miniature thermal output.
- PR #301 fixed both.
- Repairs opts into existing full-document A4 behavior; AppShell source was not changed.
- Fixed A4 is two complete pages with footer on the final page.
- Repairs uses a Repairs-only thermal page and content-derived height.
- Standard and long local receipts are centered, unclipped and single-page.
- Exact-attempt cancellation and unmount cleanup pass.

Presentation verification does not prove financial calculations, refund logic, repair balances, stock or FIFO correctness.

## 📋 Audit state — official versus newest QA

Latest application-behavior production commit before the documentation synchronization:

`1a71a12ab5e00570fb66830570e80b8175f4fef4`

This is PR #303's application-behavior merge commit. GitHub `main` must always be verified live. After documentation PR #304 merges, the current repository `main` will be PR #304's actual merge commit even though the latest application-behavior baseline remains PR #303's merge commit. Do not guess or reuse a provisional merge SHA.

The next coding task must use the actual PR #304 merge SHA reported by GitHub as its exact base/main. Do not reuse `1a71a12ab5e00570fb66830570e80b8175f4fef4` as the expected repository HEAD after PR #304 merges.

Synchronized audit state after PR #303:

- 15 fixed findings.
- 1 development-only finding (`MN-007`).
- 17 total tracked findings.
- 16 dispositioned findings.
- 1 active P3 finding (`EXP-MOBILE-003`).
- 5 blocked/not-tested areas.

Expenses finding state:

- `EXP-MOBILE-001`: FIXED ON MAIN — VERIFIED LOCALLY through PR #303.
- `EXP-MOBILE-002`: FIXED ON MAIN — VERIFIED LOCALLY through PR #303.
- `EXP-MOBILE-003`: OPEN, P3.
- Expenses remains partial/blocked pending the separate EXP-MOBILE-003 fix and a complete post-fix workflow rerun.

Do not say the project has zero known open defects or that Expenses is complete. `EXP-MOBILE-003` remains active, and Cash Drawer has not begun.

## 🧪 Expenses verification facts

- Worktree: `/Users/sw12/Projects/saledock-expenses-mobile-verification`.
- Branch: `qa/expenses-mobile-workflow-verification`.
- Base/HEAD: `756631a1d8e0b1506030207f631b1265a95d2f34`.
- Uncommitted files:
  - `tests/e2e/expenses-mobile-workflow-verification.spec.ts`
  - `docs/qa/expenses-mobile-workflow-verification.md`
- Classification: `C. DEFECT FOUND`.
- One synthetic expense went through create, update, void and restore through the real UI.
- Four expected submissions; four successful.
- Three matching audit rows observed.
- Owner management and cashier read-only behavior passed.
- Cleanup left zero matching expense rows and zero matching audit rows.
- Unrelated signatures remained equal.
- No production access.
- No financial/payment/report/stock/FIFO correctness claim.
- Uploaded QA-document hash in this handoff: `7dc4dafc10c834aee01e71ea36b42b67c73b308270016c5e999bc2309f78c8b7`.
- Protected evidence-test hash: `760f480c4794488146c80183f1f30e2128272c7c1376c55f895c02c40a8bc469`.
- PR #303 reviewed head: `f8478a7daf1df16acdf5726e5b75be3ee469c196`.
- PR #303 repeated the workflow with exactly four successful create/update/void/restore submissions.
- Nine controls measured 44px at 320x568, 390x844, and 430x932; center hit-testing, clipping, overflow, and bottom-nav checks passed.
- Cleanup left zero generated expense rows and zero matching audit rows; unrelated signatures remained equal.
- No authenticated production Expenses workflow was run.

## 🛡️ CSP/hydration

- CSP is report-only.
- `MN-007` reproduced in local `next dev`.
- It did not reproduce in local `next start` or the tested production path.
- Classification: development-only/no production impact observed in tested environments.
- No speculative CSP weakening was justified.
- Future enforced-CSP compatibility is not certified.

## 🗂️ Protected worktree rule

There were 18 protected worktrees before the PR #303 handoff synchronization began. Always enumerate them from Git rather than relying on a stale fixed list. Especially protect:

- `/Users/sw12/Projects/saledock-expenses-mobile-verification` — uncommitted original Expenses evidence.
- `/Users/sw12/Projects/saledock-expenses-mobile-touch-and-void-copy` — clean PR #303 source worktree at reviewed head `f8478a7daf1df16acdf5726e5b75be3ee469c196`.

Before another task:

- enumerate every worktree;
- record branch and HEAD;
- record dirty/untracked scope;
- calculate SHA-256 for dirty/untracked files;
- compare after the task.

Known full evidence hashes:

Reports:
- `9777cee8cc68832ab99105b82d8b25e14f54e5ffe620b7d4dec7322da383832e`
- `69a12b830dff17e5e32fc51e5b2e246afe756d3a714062dcc23e9799a2aa7f5a`

Original Returns:
- `f8bfc3bed3b60a247c1ed37e216b71814ea814a74721465e8d5b311e1aacf888`
- `84de4bd66815578a8ac11f0e9c9a08667573057da1df943ead2c973dfdb663b0`

Repairs:
- `af21811292c93691bfa6a8157efa2877b706172ca5a40ccfc62f7f9bfeaeb803`
- `aedfa5ae81b28cb55cbef835a5bf3b7e90e97084102a831cb57e0accd6cff032`

Never invent a missing hash.

## ✅ Evidence reality

- GitHub CI normally covers lint, typecheck and build.
- Local browser, screenshot, PDF, coordinate, fixture and lifecycle results remain local evidence.
- HTTP 200 is availability only.
- Vercel Ready is deployment status, not authenticated workflow proof.
- Production remains read-only unless a specific reviewed transaction is approved.
- Real-device, authenticated WebKit/Firefox and 125% zoom remain explicit gaps.
- A pass after retry is a flake and must be reported.
- Local analytics/instrumentation failures must be recorded separately, not hidden.

## 🎯 Whole-app audit standard

Fardan wants every page and user-facing function audited like a genuine shop user and an experienced principal engineer.

The program must:

- inventory every route, server action, route handler, form, dialog, table, print/export/upload/share surface and permission;
- test roles and direct URLs;
- use disposable local data and exact mutation boundaries;
- verify mobile/tablet/desktop, dark mode, loading, empty, success and error states;
- verify duplicate submissions, cleanup, tenant isolation, business invariants, accessibility, keyboard and touch;
- create a durable finding register and function matrix;
- fix one root-cause cluster per focused review-first PR;
- never put all fixes in one giant PR;
- keep a continuation checkpoint so the same master prompt can resume.

## ⏱️ MVP meaning and timing

- Functional MVP: live now.
- Audit-ready MVP: not ready.
- Earliest responsible target: 2–3 weeks if remaining work is straightforward.
- Realistic expanded whole-app audit target: 4–6 weeks.
- These are planning estimates, not promises.
- Release is evidence-gated, not date-gated.

## ☎️ Canonical public contact details

Email `fardan.aatir@outlook.com` · WhatsApp/Call/SMS `+92 310 4666026` · IG `fardan.aatir` · LinkedIn `fardanaatir` · X `FardanAatir` · GitHub `starwalker12` · FB `fardan.aatir` · Linktree `linktr.ee/Fardan.Aatir` · Location: BNU, Lahore.

## 🗒️ Remember log — newest first

- **14 Jul 2026** — PR #303 merged as `1a71a12ab5e00570fb66830570e80b8175f4fef4`: `EXP-MOBILE-001` and `EXP-MOBILE-002` fixed on main and verified locally; shared dialog action minimum is 44px; `EXP-MOBILE-003` remains open; Expenses remains incomplete; Cash Drawer has not begun.
- **12 Jul 2026** — PR #302 merged at `756631a1d8e0b1506030207f631b1265a95d2f34`: Repairs audit synchronized; merged audit records 14/14 dispositions and five blocked areas.
- **12 Jul 2026** — Expenses local workflow reproduced `EXP-MOBILE-001`, `EXP-MOBILE-002` and `EXP-MOBILE-003`; no source fix or PR.
- **12 Jul 2026** — PR #301 merged at `a9ddb9bc1c905089604e559856c1aff9d392e62e`: Repairs A4 and thermal output fixed.
- **12 Jul 2026** — PR #300 merged at `c651a7f6a5477f29b083c72aca06147d5b14559a`: Returns audit synchronized.
- **11 Jul 2026** — PR #299 merged at `09e1df96ccb571872ba0c3f46bd457723bfdae53`: Returns thermal geometry and lifecycle fixed.
- **11 Jul 2026** — PR #298 merged at `2b24fcf7b88812987ed415426e5f5a715c6e6ea4`: Reports audit synchronized.
- **10 Jul 2026** — PR #297 merged at `0e85a47561b073236c5297d629927c8684fcc889`: Reports mobile labels fixed.
- **10 Jul 2026** — PR #295 merged at `30400475202eeb2bbeb126abe3e5a281efebb95d`: Reports pagination fixed.
- **9 Jul 2026** — PR #294 merged at `6ccca9b7f9e1127a848890fe2918ee54501f6507`: CSP warning classified development-only.
- **8–9 Jul 2026** — PRs #287–#293 merged.
- **30 Jun 2026** — PR #284 merged: service total-charged fallback.
