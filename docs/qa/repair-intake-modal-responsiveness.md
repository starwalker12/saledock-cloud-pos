# Repair Intake/Edit Modal Responsiveness

Task 89204. Local implementation and draft review only. Starting main:
`4602badfd48b84a7de02cf05b99bb3e3a408ae77` (PR #366).

## Source lineage and scope

The original and v2 modal worktrees were read-only references. A fresh
`fix/repair-intake-modal-responsiveness-v3` worktree was created from current main.
The v2 page/controller/portal intent was integrated around current RepairForm,
not copied over the newer #366 implementation. All 99 pre-existing worktrees
retained their HEAD, status and dirty/untracked file hashes. Six previous evidence
manifests, including both modal candidates and #365/#366 implementation/delivery,
were independently rechecked without modification.

`src/app/repairs/actions.ts` and `src/app/repairs/[id]/status-form.tsx` are unchanged.
Both held-reconciliation browser suites and the create/status audit Node contracts
are byte-identical to main. No mutation, accounting, permission, migration, schema
or RLS changes are included. PR #364 and ledger work are untouched.

## Correction

The old Intake link navigated the Server Component before displaying the form.
Cancel/X called a server-backed redirect. The old fixed overlay lived beneath the
persistent shell's stacking context.

- A small client controller opens Intake and dismisses Intake/Edit using native
  History `replaceState`, integrated with `useSearchParams`. No router call, Action
  or data fetch is used for these local interactions.
- Only `add` and `edit` are removed on close. Filters, sorting and hash survive;
  toggling does not append history entries. Direct `?add=1` and `?edit=<id>` remain
  supported. Edit deep-link loading still obtains its existing server-provided data.
- RepairForm uses the existing body-portaled FormModal at its established overlay
  layer. The backdrop covers navbar/sidebar/mobile chrome, fields scroll internally,
  and the header and form-associated actions remain accessible.
- FormModal focuses the heading on portal commit and traps focus among visible
  controls. Its optional `closeDisabled=false` preserves existing consumers' default
  behavior; Repair passes actual pending state. Cancel/X/Escape/backdrop cannot
  dismiss an in-flight save. Existing `preventDismiss` semantics remain separate.

## Save settlement remains authoritative

Current-main `useActionState`, same-tick submit lock, committed-result lock,
`aria-busy`, alerts/status and success-only reconciliation are preserved. Required
repair/history/audit writes and server-side post-response invalidation are untouched.

RepairForm remains the sole success-navigation owner. It removes modal flags and
performs one `router.replace` with a fresh `repairsavestate` UUID, retaining unrelated
URL context. The marker is necessary because an initially attempted marker-free
return after local History opening reused the cached list despite a confirmed save.
It follows the existing settlement-marker convention; there is no additional
refresh, server-close Action, retry or optimistic success.

Committed audit/history warnings remain visible and cannot be resubmitted or
mistaken for success. Correctable no-write validation errors remain open and permit
an intentional corrected save. Save requests keep the existing `Saving...` feedback.

## Browser acceptance

Production-mode Next.js, loopback Supabase only, Chromium, automatic retries **0**.

| Check | Result |
| --- | --- |
| Three mouse-triggered Intake opens | 73 / 70 / 59 ms; zero Repairs Action/RSC/document requests |
| Manual close in that run | Cancel 25 ms; X 31 ms; Escape 4 ms; zero Repairs requests |
| Final keyboard-enhanced run | Mouse opens 70 / 67 ms; keyboard open 31 ms; Cancel/X/Escape 26 / 34 / 5 ms |
| Portal/stacking | Body-level portal; navbar hit intercepted by backdrop; heading visible |
| Desktop and mobile | 1440x900, 320x568, 390x844, 430x932; no horizontal overflow |
| Themes/motion | Light/dark screenshots; reduced-motion open/close pass |
| Accessibility | Labelled modal, focus trap/return, keyboard open/submit/close, body scroll lock/restoration |
| Context | Direct add/edit, Back/Forward, no history growth, filters/sorting and same sidebar DOM retained |
| Customer selection | Search, select and clear pass |
| Correctable validation | Native validation sends no request; server validation writes nothing; corrected retry succeeds |
| Create | One save POST, one Repair, one initial history, one create audit; truthful success, one fresh reconciliation |
| Edit, three independent fixtures | Each: one POST/update/audit; zero new history/duplicates; success visible before held reconciliation |
| Edit final state | Exact `Repair job updated.`; modal closes after settlement; reviewed model visible after one reconciliation |
| In-flight dismissal | Cancel/X disabled; Escape/backdrop guarded; repeated submit event cannot duplicate mutation |
| Shared consumers | Product/category/supplier focus, dirty-dismissal, scroll and external-footer association pass |

Timings are observations, not brittle CI thresholds. The architectural assertion is
zero network dependency for local open/manual close. All recorded runs are retained.

## Validation

| Suite/check | Result |
| --- | --- |
| Modal browser suite | 9/9 |
| Unchanged #366 save held-reconciliation | 9/9, including create/edit audit warnings and initial-history warning |
| Unchanged #365 status held-reconciliation | 3/3 |
| Create-audit durability | 1/1 |
| Status-audit durability | 1/1 |
| Optional fields | 1/1 |
| Customer tenant integrity | 1/1 |
| Focused Node, including date-range/loading contracts | 64/64 |
| Complete Node | 450/450, no skips |
| Lint | 0 errors; two existing privacy-center hook warnings |
| Typecheck | Pass |
| Production build | Pass, including dedicated save/status proxy builds |
| Diff check | Pass |

The legacy suites were run separately. Task-owned execution copies changed only
artifact destinations/helper import paths and awaited real workspace readiness plus
initial network idle before hard-navigation setup. Original assertions were retained.
One earlier create-audit run passed its durable outcomes but failed clean-console
checking on an aborted auth read during setup; that failed run is retained, not counted
as acceptance. An earlier modal response-observer race was replaced by deterministic
response capture before fulfillment, retaining the success/body and database checks.
Initial Docker/CLI/dependency setup failures are also retained, not reported as passes.

## Cleanup and evidence

Task fixtures and QA triggers/functions were removed. All 45 relation counts match
the opening snapshot. Forty-two relation digests are identical. The only differing
digests are existing local auth login metadata, profile `updated_at` and workspace
coordination metadata; profiles excluding `updated_at` match exactly. QA harness
function count returned from zero to zero. Task-owned app/proxy processes were stopped.

Evidence: `/Users/sw12/Projects/saledock-local-evidence/repair-intake-modal-responsiveness-v3`.
Its independently sealed `SHA256SUMS` and final report are external artifacts; the
manifest hash is recorded in the draft PR and delivery response to avoid a self-reference.

Production access/mutations: zero. No merge or deployment performed. This is a draft
UI review, not authorization to resume any security, accounting or other paused work.
