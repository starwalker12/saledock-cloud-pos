# Customer lifecycle audit correction

## Status

`LIVE-CUSTOMER-AUDIT-001` is corrected only on the draft branch
`fix/customer-lifecycle-audit`. Production remains unchanged until a separately
authorized review and merge.

SaleDock remains in `FINISHING ACCEPTED WITH LIMITED COVERAGE`. It is below
audit-ready and is not MVP-live.

## Retained production evidence

The retained July 26 finishing evidence is stored outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/live-finishing-continuation-2026-07-26`

Its 58-entry evidence manifest has SHA-256:

`90f9cd57b810a29eb554a283b43a11281e0e1f6c5c7fab3f60bdb949eca34429`

The retained customer audit reconciliation showed one available
`customer.credit_payment` audit, but zero lifecycle audits for the observed
customer create, update, and archive mutations. The retained transaction
history remained truthful: the marked customers were archived, their balances
were PKR 0, and duplicate financial mutations were zero.

No private retained customer contact values were copied into this document or
the new local test evidence.

## Local baseline

The exact main source was built in production mode against loopback Supabase.
One synthetic, nonfinancial owner customer was created, updated from credit
limit PKR 500 to PKR 600 with a notes change, archived, restored, and archived
again through the ordinary Customers UI.

All mutations committed, the customer remained in the authenticated
organization and branch, and its outstanding balance remained PKR 0. The
baseline lifecycle audit counts were:

- `customers.created`: 0
- `customers.updated`: 0
- `customers.archived`: 0
- `customers.restored`: 0

Restore is an active Customers UI action in the same action module, under the
same permissions and organization boundary. Its missing audit therefore has
the same bounded root cause and is included in this correction.

No sale, invoice, payment, credit settlement, write-off, return, shift, or Cash
Drawer mutation was performed. The disposable customer was deleted, matching
audits were removed, and all measured table counts returned to baseline.

Two discarded pre-mutation browser launches are retained in the execution
record: the first lacked a Playwright base URL and the second correctly found
the collapsed create panel but did not open it. Neither created a customer.

## Root cause

`saveCustomerAction`, `archiveCustomerAction`, and `restoreCustomerAction`
performed customer mutations without lifecycle calls to `logAudit`.

The archive and Restore paths first checked that a customer existed, but their
updates did not require the expected current state or inspect a returned row.
That meant they also lacked a reliable exact-transition result on which a
truthful audit could be based. Updates did not distinguish a genuine profile
change from an identical submission.

This is classified as:

`OUTCOME A — LIFECYCLE ACTIONS MUTATE WITHOUT AUDIT`

The existing customer financial audit actions were not involved and remain
unchanged:

- `customer.credit_payment`
- `customer.write_off`
- `permission.denied`

## Lifecycle contract

The stable lifecycle actions are:

- module `customers`, action `customers.created`
- module `customers`, action `customers.updated`
- module `customers`, action `customers.archived`
- module `customers`, action `customers.restored`

Each audit is awaited after one confirmed organization-scoped mutation and
before route revalidation.

Create selects the inserted customer ID. Update selects the exact updated ID.
Archive requires `is_archived = false`; Restore requires
`is_archived = true`. Error, no-match, foreign-organization, repeated
transition, invalid, and denied paths cannot emit a lifecycle audit.

Identical update submissions now return the existing success state without a
database update or a false second audit. Genuine update metadata records only
safe changed field names. Lifecycle details and metadata identify the customer
ID and transition, but do not include raw phone, email, address, notes, or
other private profile values.

The shared audit helper continues to supply the actor, organization, and
branch. Its global failure policy was not changed.

## Correction

Only `src/app/customers/actions.ts` changes application behavior:

- create returns the exact inserted ID before one awaited create audit;
- update compares normalized persisted and submitted values, skips no-ops,
  confirms one exact organization-scoped row, and emits one awaited update
  audit with safe changed-field names;
- archive confirms one active-to-archived transition before one audit;
- Restore confirms one archived-to-active transition before one audit;
- existing route revalidation remains after audit completion.

Customer balances, credit-payment and write-off RPCs, customer ledger,
invoices, payments, Dashboard, Reports, Cash Drawer, permissions, RLS, schema,
and migrations are unchanged.

## Verification

Focused source contracts cover exact row confirmation, organization and state
guards, stable action names, no-op suppression, privacy, and the unchanged
financial audit/RPC contracts.

The production-mode local E2E uses one marker-owned synthetic customer and
proves create, genuine update, identical update, archive, Restore, denied UI
roles, reload persistence, exact actor/organization/branch attribution,
privacy, zero financial rows, zero balance, duplicate protection, and exact
cleanup. It uses zero Playwright retries.

Final results:

- focused lifecycle source contracts: 6/6;
- complete Node suite: 281/281, zero failures and zero skips;
- production-mode lifecycle E2E: 1/1, zero automatic retries;
- owner/admin/manager/cashier/technician role authorization: 5/5;
- mobile reports/administration route matrix: 1/1;
- Customers dark-mode smoke: pass;
- lint: zero errors and two pre-existing `privacy-center.tsx` hook warnings;
- typecheck: pass;
- production build with `TZ=UTC`: pass.

The focused E2E initially had three discarded post-business assertion runs:
the archived customer was hidden by the active-only query, duplicate
desktop/mobile Audit Log labels made a locator strict, and local Vercel
analytics 404 messages lacked their source URL in the text. Each run completed
its marker cleanup. The harness was narrowed without weakening mutation,
audit, privacy, financial, or signature assertions; the final run passed.

The pre-existing `Customers Section Smoke Test` remains non-hermetic with
Playwright strict mode because its locator combines two simultaneously visible
elements (`Total customers` and `Customer Management`). The route rendered
correctly, the adjacent dark-mode smoke passed, and the dedicated lifecycle
E2E exercised the complete Customers workflow. This unrelated legacy test was
not changed because the authorized source scope is four focused files.

The direct Chrome local-login review reached the SaleDock login page, but the
local CAPTCHA/security service reported `Security check unavailable`. No
credentials left the local test environment and no browser mutation followed.
Deterministic Playwright supplied the authenticated local workflow evidence.

## Boundaries and remaining risk

No migration is required. No production mutation is performed by this draft
task. Canonical documents remain unchanged.

`LIVE-CUSTOMER-LEDGER-001` is not fixed. The customer-settlement
client-completion P2 is not fixed. Customer balances and accounting are not
changed.

The current finding inventory remains P0 0, P1 0, P2 8, and P3 5 until a
separately authorized production verification closes this finding.

## Delivery and rollback

The delivery endpoint for this task is one focused draft pull request. It must
remain draft and unmerged for owner review.

Rollback after a later merge would be:

`git revert <customer-lifecycle-audit-squash-sha> && git push origin main`
