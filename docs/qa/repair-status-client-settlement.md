# Repair status client settlement

Task: 77412. Local review-first correction; no production access or deployment.
Starting main: `ed8b7784fead3815fa5325ad206e5d3cbe615a34`.
Branch: `fix/repair-status-client-settlement`.

## Cause and boundary

The status update, history insertion, and required audit already completed on
unchanged main, but `useActionState` could remain on `Updating status...`.
Three inline `revalidatePath` calls coupled the Action response to current-route
Server Component reconciliation. Holding those server reads deterministically
prevented the connected client from receiving its settled ActionState.

This is the same application-level settlement boundary documented in
[Return settlement](return-success-pending-settlement.md) and
[Supplier payment settlement](supplier-payment-client-settlement-fix.md).
It is not a failed database update and is not fixed by retrying a mutation.

Only `updateRepairStatusAction` settlement and its client form change:

- Status update, history, and audit remain awaited in their original order.
- Audit success is required for `Status updated successfully.`
- Returned or thrown audit failure retains the exact committed-warning result:

  > The status was updated, but its audit record could not be confirmed. Do not submit it again. Refresh the page and contact an administrator.

- The three existing paths are invalidated in supported Next.js `after(...)`
  work. The callback contains no mutation, history insertion, or audit insertion.
- After ActionState settles, the client issues one separate `router.replace`
  with a unique `repairstatusstate` value. Existing query parameters, hash, and
  scroll are preserved. There is no timer, native resubmit, automatic retry,
  forced reload, or private framework API.
- The form announces the settled result while fresh route props load. The
  submit button then says `Refreshing repair...`, with Action `aria-busy=false`.
  A same-tick lock and reconciliation lock prevent stale `old_status` submission.
  It becomes available for a later intentional change only after fresh props arrive.
- Login/setup redirects propagate normally; the client does not catch and swallow
  framework redirects. Confirmed pre-mutation errors remain correctable.

Intake save, edit save, notes save, status meanings, permissions, final-cost
parsing, delivery timestamps, history payloads, and audit payloads are unchanged.
The existing history-insert-failure result is also unchanged.

## Deterministic production-mode proof

Local Next.js 16.2.6, React 19.2.4, Node 25.1.0, Playwright 1.60.0,
bundled Chromium 148.0.7778.96. Automatic retries: zero.

`tests/e2e/helpers/repair-status-revalidation-proxy.mjs` listens only on loopback.
It forwards to local Supabase and arms for one synthetic repair UUID. After that
repair's audit attempt finishes, it holds server-origin PostgREST reads used by
route reconciliation (observed first at profile/context reads). Independent
local admin reads still verify durable database truth. The test releases the
reads explicitly. No credentials, request headers, or raw RSC bodies are saved.

| Runtime state | Success while reads held | Audit warning while reads held |
| --- | --- | --- |
| Exact main (`baseline2`) | Pending; no message | Pending; no message |
| Fix (`fix2`) | Settled; exact success visible | Settled; exact warning visible |
| Exact runtime revert (`revert`) | Pending; no message | Pending; no message |
| Identical reapply (`reapply`) | Settled; exact success visible | Settled; exact warning visible |

The baseline/revert runtime hashes match exactly; fix/reapply hashes also match
exactly. Only the two task-owned runtime files were reverted and reapplied.
The held baseline response cannot finish until reads are released; the earlier
sealed natural-delay diagnostic separately proved completed HTTP 200 responses
with the correct ActionState and a still-pending connected client.

For every held successful invocation: one Action POST, one status update to
`in_progress`, one `received -> in_progress` history row, and one exact
`repairs.status_changed` audit. For every forced-audit invocation: the same
single status/history writes, zero successful status audits, and the exact warning.
The fixed HTTP 200 bodies finished before release (159 bytes success; 296 warning).
Repeated `requestSubmit()` attempts while reconciliation was held caused no
additional POST or write. Releasing reads delivered fresh status props.

A second intentional `in_progress -> completed` transition used fresh
`old_status`, produced only one additional history/audit, and retained final cost
125. Delivered/final-cost/diagnosis/timestamp payload behavior is also covered by
the Node contracts. Missing input and an injected no-write update failure settle
without history/audit writes, and a corrected intentional submission succeeds once.

## Regression setup finding

The existing optional-fields browser test could hard-navigate away from Dashboard
while a bootstrap `/auth/v1/user` request was still in flight. A temporary
observer recorded `net::ERR_ABORTED`, the matching Supabase `Failed to fetch`
console message, and document navigation in the same millisecond.

Waiting only for the heading, or only the active guard, did not reliably drain
subsequent auth lookups. Its local setup now waits for the active guard and
bootstrap network idle before the test's hard navigation. This is a test-only
readiness wait, not an application delay or a settlement workaround. All original
error, audit, tenant, mutation-count, and cleanup assertions remain enabled.
The observed corrected control had 42 auth requests, 42 completions, zero aborted
auth requests, and zero matching console errors. The temporary observer is not
part of runtime source or the permanent test suite.

## Validation and limitations

Accepted command outputs and browser results are recorded under the evidence
directory below. Focused Repair Node contracts: 72/72; complete Node suite:
437/437. Lint has zero errors and two existing `privacy-center.tsx` hook warnings.
Typecheck, production build, and `git diff --check` pass.

The final combined Repair browser run (`validation4`) passes 4/4 with zero
retries. The status-audit browser suite retains its original exact messages, audit
assertions, and 30-second threshold. The additional held-read suite does not
replace that original suite. Regression coverage includes create-audit durability,
optional fields, customer tenant integrity, status lifecycle, and mobile status
messages at 390x844 and 320x568. The unrelated intake success-settlement behavior
reported by the existing create suite remains outside this branch; no modal
candidate has been imported to make a regression test pass.

Earlier unsuccessful runs are retained and excluded from accepted passes:
the first observer used an unsuitable CDP streaming-body read; the first candidate
build caught a client-state type inference error; the first complete Node run
needed the loading suite's reviewed Repairs action hash updated; initial combined
browser runs exposed the optional-fields bootstrap-navigation race above.

Task fixtures, status history, audits, and test-only audit trigger/functions are
cleaned after each run. Held-read runs preserve all 43 protected business-relation
signatures. The complete Node suite additionally runs an existing stock fixture
that temporarily changes/restores the local manager branch, advancing only profile
`updated_at`; per-column signatures prove the other 13 profile columns unchanged.
Auth login metadata and workspace lease metadata are separately reported. No
historical signatures or timestamps were reconstructed or rewritten.

All 95 pre-existing worktrees were compared by HEAD, dirty/untracked inventory,
and file hashes. The modal worktree's eleven uncommitted files remain exact.
PR #364 and ledger-hardening work remain untouched. There is no migration,
schema/RLS/permission change, accounting change, or production access/mutation.

## Evidence

`/Users/sw12/Projects/saledock-local-evidence/repair-status-client-settlement`

The final accepted evidence is sealed by its single `SHA256SUMS` manifest;
the final report and draft PR identify the manifest SHA-256.
The prior sealed diagnostic directory is unchanged:
`/Users/sw12/Projects/saledock-local-evidence/repair-status-audit-diagnostic`.

Reproduction requires local seeded Supabase only. Build/start Next in production
mode with its Supabase URL pointing at the loopback proxy, then run
`tests/e2e/repair-status-client-settlement.spec.ts` with `REPAIR_STATUS_PROXY_URL`
set to that proxy and `--retries=0`. Set `REPAIR_STATUS_EVIDENCE_DIR` to a new
directory to retain sanitized results. The optional `REPAIR_STATUS_SOURCE_STATE=baseline`
mode asserts the known failure solely for an exact-main/revert causal control;
it is never an acceptance pass for the fixed application.
