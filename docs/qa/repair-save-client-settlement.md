# Repair Save Client Settlement

Task 91347. Local-only, review-first correction based on main
`77c46879a323aa9391922927df97a54ff53884e4` (PR #365).
Branch: `fix/repair-save-client-settlement`.

## Pre-existing Defect and Causal Proof

The earlier `repair-create-audit-durability-fix.md` already recorded that a successful
connected create form did not settle. This predates both uncommitted modal candidates.
On exact main, `saveRepairAction` invalidated routes inside the Action response.
The repair, required history, and audit could finish while the connected form remained
on `Saving...` waiting for that response's reconciliation reads.

Production-mode local tests used a loopback proxy that begins holding server reads
only after the required audit outcome (or initial-history failure) is known. It does
not hold the mutation before its durable result. No production service was contacted.

| Runtime state | Create | Edit |
| --- | --- | --- |
| Exact main | One durable save; response and pending remain held | One durable update; response and pending remain held |
| Server-only correction | Response completes and pending clears | Response completes and pending clears |
| Complete correction | Success visible, pending false, one POST with actual reconciliation held | Success visible, pending false, one POST with actual reconciliation held |
| Exact server revert, client correction retained | Pending defect returns | Pending defect returns |
| Identical server reapply | Pass | Pass |

The server-only diagnostic also measured a second Action POST from the legacy
success effect calling the server-backed `onClose`. It was not another save, but
was unnecessary and prevented a one-Action handoff. The minimal client correction
removes that success-only server call. Manual Cancel/X and all modal infrastructure
remain unchanged for the separate modal task.

## Runtime Boundary

- CREATE still awaits Repair insert, initial received history, and `repairs.created` audit.
- EDIT still awaits Repair update and `repairs.updated` audit; it adds no status history.
- Required audit returned errors and thrown errors still produce the existing exact warning with the saved Repair ID.
- Initial-history failure still returns its exact committed warning immediately, with no create audit and no new invalidation behavior.
- Only existing `/repairs`, conditional `/customers/{customerId}`, and `/dashboard` invalidation moves into `after(...)`, after audit outcome is known.
- `useActionState(saveRepairAction, ...)` still receives the truthful result. Success/error regions and `aria-busy` expose it.
- Confirmed success triggers one client `router.replace` removing only `add`/`edit`, preserving unrelated query/hash state. It neither calls `onClose` nor submits again.
- Same-tick duplicates and committed-result resubmission are locked. Confirmed no-write errors unlock an intentional corrected submission.
- No timer, optimistic success, automatic retry, full reload, private Next API, package, or custom routing system is added.

All save mutation/history/audit source is byte-identical after excluding the moved
invalidation block. The complete status Action and subsequent Actions are byte-identical
to #365. Form fields, validation, permissions, numbering, amounts, customer behavior,
database schema, migrations, and RLS are unchanged.

## Deterministic Acceptance

| Case | Repair writes | Initial history | Required audit | Pending/message before reads released |
| --- | --- | --- | --- | --- |
| Create success | 1 insert | 1 | 1 created | False / Repair job created. |
| Edit success | 1 update | 0 | 1 updated | False / Repair job updated. |
| Create audit failure | 1 insert | 1 | 0 | False / exact audit warning |
| Edit audit failure | 1 update | 0 | 0 | False / exact audit warning |
| Create history failure | 1 insert | 0 | 0 | False / exact history warning |

Each row has exactly one Action POST and zero duplicate writes. Successful forms
reconcile to the saved job after reads are released. Warnings intentionally stay open;
their held-read proof uses an independent read-only RSC probe, not automatic navigation
or another mutation. Warning controls cannot resubmit the committed save.

Validation, unavailable selected customer, injected insert failure, and injected update
failure each settle with zero writes and then permit one explicitly corrected attempt.
Permission denial is covered by executed Action contracts. Tests retain metadata,
organization/customer linkage, zero-valued financial fields, and job-number assertions.

## Validation

- Focused save production-mode browser matrix: 9/9, retries 0; repeated after exact reapply.
- #365 unchanged held status-settlement suite: 3/3, retries 0, including subsequent `old_status` transition.
- Complete Node suite: 445/445, zero skips.
- Focused Repair/loading Node contracts: 50/50.
- Direct status-audit, create-audit, optional-fields, and customer-tenant browser suites: each 1/1, independently run with retries 0.
- Lint: zero errors, two pre-existing `privacy-center.tsx` dependency warnings.
- Typecheck, production build, and `git diff --check`: pass.
- Local cleanup: all 42 non-auth/profile/lease relation signatures match across 45 inspected relations; zero QA trigger/functions remain. Auth/profile/lease row counts are unchanged. Local login/coordination metadata changed; profile content excluding `updated_at` matches. No task Repair/customer/history/audit fixture remains.
- All 97 pre-existing worktrees compare exactly to their opening HEAD/status/dirty-file hashes, including both eleven-file modal candidates.
- Earlier discarded setup runs are retained separately: an ActionState type annotation, a test-only `module` naming lint issue, and restoring uncontrolled required fields before the intentional retry. They are not counted as acceptance passes.

## Preservation and Evidence

Both eleven-file modal candidates remain uncommitted and untouched, including v2.
No modal controller, FormModal, portal, open/close responsiveness patch, or route-page
change is included. PR #364 and ledger work remain separate. No production access,
deployment, migration, accounting change, permission change, or status-business change.

Evidence: `/Users/sw12/Projects/saledock-local-evidence/repair-save-client-settlement`.
It contains source/protected-worktree hashes, causal controls, sanitized local counts,
held-response screenshots, regression results, and cleanup. The independently sealed
`SHA256SUMS` manifest and its SHA-256 are recorded in the draft PR and final report.
