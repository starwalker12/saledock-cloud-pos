# Bounded atomic accounting import

Task 77126. Starting main: `039759db3ec465eafa373d938afac1f588422e13`.
Local-only implementation, subject to Owner review. No production access, merge,
deployment, ledger authorization cutover, or forward-trust claim.

## Delivered boundary

Supported accounting restores upload disposable private staging first. One
authenticated Owner finalizer commits the entire accounting/inventory snapshot,
its source mappings, durable receipt, and accounting-completed state together.
A required insertion failure rolls back that entire finalization transaction.
Ordinary business writers are not replayed to restore historical snapshots.

The approved 21-relation parent-before-child order is:

1. product_categories
2. suppliers
3. customers
4. products
5. invoices
6. credit_payments
7. customer_write_offs
8. supplier_purchases
9. supplier_write_offs
10. product_stock_lots
11. invoice_items
12. payments
13. returns
14. supplier_payments
15. customer_ledger_entries
16. supplier_ledger_entries
17. invoice_item_stock_allocations
18. stock_movements
19. supplier_purchase_items
20. return_items
21. return_stock_allocations

This is snapshot dependency ordering, not accounting posting chronology. No
trusted sequences, trust columns, or anchors are introduced. Incoming historical
trust markers are stripped; unknown fields fail validation. Explicit supplied
customer/supplier current outstanding is preserved using database NUMERIC, even
when it differs from historical ledger `balance_after`. Zero and negative values
are valid; missing balances never become zero or get inferred from history.

## Identity boundary

`backup_private.organization_identity_locks` has one row per organization and a
reset epoch. The migration provisions existing organizations; an organization
INSERT trigger provisions new ones. A missing row fails closed.

Customer/supplier INSERT and actual identity UPDATE participate automatically,
including direct authenticated REST writes and existing application writers.
Customer identity includes ID, organization, name, phone and email; supplier
identity includes ID, organization and name. There is no new global uniqueness
constraint. Final collision checks include archived/inactive targets and reject
native UUID, natural-identity and ambiguous-source collisions instead of merging,
skipping, overwriting, or mapping to an existing account.

The lock order is organization mutex, job/reset work, then root/dependent rows.
This follows the approved Task 60872 order rather than the contradictory later
job-first conceptual example. Identity UPDATE can already own its account tuple,
so its mutex acquisition is NOWAIT. The finalizer has a 250ms lock-acquisition
budget. Busy conflicts are retryable HTTP 409, with no business mutation. The
mutex stays held through transaction COMMIT/ROLLBACK, not merely validation.
Balance-only updates return before lock acquisition; another organization's
identity writes do not use the same mutex.

Factory Reset retains its existing authorization, grants, delete behavior and
audit payload. Its only body change is the private pre-delete hook: acquire the
same mutex, advance epoch, cancel jobs and purge staged payload. A pre-reset job
cannot finalize after reset commits. Imported accounts are MVCC-invisible until
the finalization transaction commits.

## Roles and exposure

Three restricted roles are NOLOGIN, NOSUPERUSER and NOBYPASSRLS:
`backup_import_executor`, `backup_identity_executor`, `backup_collision_reader`.
Application roles have no membership, private schema USAGE, or private table
DML. The collision reader has only the fixed lookup capabilities needed to
reject conflicts, including globally conflicting native IDs.

Nine authenticated-only public SQL SECURITY INVOKER wrappers bind to fixed
private entry points. PUBLIC/anon execution is revoked. Private privileged
functions use empty search paths, static identifiers and no dynamic SQL. Every
job operation rechecks `auth.uid()`, active Owner profile, target organization,
and that the caller owns that job. Admin cannot finalize another Owner's job.
No supplied user, role or organization selects authority.

`actor_id()` binds `auth.uid()` using a SQL `BEGIN ATOMIC` body parsed at creation;
this avoids granting access to Supabase's restricted Auth schema. The public
wrappers also use fixed parsed dependencies. This is consistent with
[PostgreSQL SQL-body binding](https://www.postgresql.org/docs/15/sql-createfunction.html)
and the [Supabase Auth schema restriction](https://supabase.com/changelog/34270-restricting-access-on-auth-storage-and-realtime-schemas-on-april-21-2025).

## Capacity and validation

- Compressed ZIP ceiling stays 50 MiB.
- Core target rows must be <=50,000 AND normalized bytes <=33,554,432.
- Bytes are the database sum of `octet_length(normalized_payload::text)` using
  canonical JSONB, not ZIP size, manifest/browser counts or TOAST storage.
- Application and database RPC requests enforce 1,048,576 bytes. Chunks target
  524,288 bytes and at most 1,000 rows, including envelope overhead plus a 1KiB
  margin. One larger individual row is accepted only below the enforced ceiling.
- Over-limit staging rejects the complete offending chunk, marks the job
  ineligible, and writes no ordinary business rows. Earlier private staging is
  disposable; it is not a partial restore.

Sealing requires exact server-generated counts/digests, contiguous chunk indexes,
and all 21 manifest entries including empty tables. Sealed payload cannot be
uploaded, reordered or replaced. Finalization rechecks the seal, counters,
references, Owner authorization, reset epoch and collisions under its mutex.
An invalid snapshot never proceeds via per-row catch-and-continue.

## Source capability and legacy retirement

The existing native JSON ZIP and desktop SQLite ZIP wizard remain. Native
SchemaVersion 1 / BackupVersion 2 or 3 and desktop SchemaVersion 1 are checked
row-by-row; a version label alone is not a capability guarantee. Desktop IDs are
mapped within this upload only; no cross-job account mappings or existing-account
lookups are used. Desktop actors/branches use the current Owner/assigned branch;
native actor/branch references must already belong to the current organization.
Branding and staff login credentials are not restored by this accounting path.

Fail closed on missing explicit balances, conflicting aliases/source IDs,
unresolved references, unsupported columns/relations, legacy flattened supplier
purchase records lacking explicit headers, and older physical invoice exports
that omitted invoice stock allocations. The supplier error is:
"This backup does not contain the current supplier balance required for a safe restore."
The native exporter now includes invoice stock allocations. Existing unrelated
export query row limits are not redesigned here: this is not a guarantee that
every old export is a complete backup, nor a full backup completeness project.

Both legacy desktop/native core Server Actions reject core and unknown names
before context lookup, mapping, empty-success handling or business writes. Only
the explicit ancillary allowlist remains. Legacy RepairJobs may look up an
existing customer but does not transitively create a core customer.

## States, receipts and recovery

Durable states distinguish staging, sealed, ready, ineligible, validation_failed,
accounting_completed, ancillary_pending, ancillary_failed, completed, cancelled
and expired. Validation is one request/transaction; no misleading committed
finalizing state exists. A receipt is written in the same transaction as the
core snapshot. Same job/digest retry returns that receipt without repeating
business insertion. Receipt timestamps are not represented as post-COMMIT clock
measurements; full HTTP completion brackets COMMIT for performance qualification.

The wizard stores only the job ID in sessionStorage and provides a read-only
saved-status check. A ready job can be explicitly finalized by the Owner; reload
does not automatically retry. Uncommitted uploads can be discarded. Lost response
after COMMIT is resolved from the durable receipt, not by replaying the file.

Staged payload has a 24-hour TTL. Owner start/get operations purge expired payload;
there is no new background cleanup scheduler. Job metadata, mappings and receipts
survive completed-payload cleanup. The reset epoch still invalidates old receipts.
Deleting an Owner profile removes only that Owner's private job artifacts via a
metadata FK cascade; it does not delete restored business rows. This prevents a
retained job from introducing a new account-deletion blocker. Local acceptance
deleted a disposable Auth user and proved its receipt was removed while its
committed restored customer remained.

Seven ancillary relations are restored separately after the core receipt:
cash_shifts, expenses, repairs, daily_closings, staff_permissions,
loss_prevention_events and audit_logs. Their individual chunks are atomic and
idempotent; only exact declared counts permit full completed state. Failure
retains the committed core and reports ancillary_failed, never compensation-
deletes it. This is NOT whole-backup all-or-nothing atomicity. Recovery of an
unfinished ancillary upload is reported truthfully; no automatic whole-file retry
or general reconciliation wizard is introduced.

The existing `pos.loss_sale_completed` audit insertion trigger creates a loss
event. Such optional imported audit snapshots are rejected, rather than duplicating
that companion event or suppressing live triggers. Ordinary optional audits remain
supported. All core target triggers were reviewed and exact row counts verified.

## Retained authority

**FORWARD TRUST BLOCKER - DEFERRED TO LEDGER CUTOVER.** Direct authenticated
customer/supplier ledger DML and outstanding-balance mutation remain baseline-
possible. This prerequisite does not close global raw Data API accounting access,
make ledgers tamper-proof, protect current outstanding globally, establish trusted
posting order, or implement forward ledger trust. Independent direct writes may
commit or make a finalizer fail, but cannot partially commit that transaction.

## Local validation

All database fixtures use disposable schema-only clones or the task-owned local
Supabase stack. No original business/auth rows are copied. Every clone/temporary
role is removed in finally cleanup. Run Node database suites sequentially because
the restricted role names are shared within the cloned PostgreSQL cluster.

```sh
node --test tests/atomic-accounting-import.test.mjs
RUN_LOCAL_ATOMIC_IMPORT_DB=1 ATOMIC_IMPORT_BASELINE_CONTAINER=supabase_db_YOUR_LOCAL_STACK node --test --test-concurrency=1 tests/atomic-accounting-import-db.test.mjs tests/atomic-accounting-import-races.test.mjs tests/atomic-accounting-import-baseline.test.mjs
RUN_LOCAL_ATOMIC_IMPORT_QUALIFY=1 ATOMIC_IMPORT_BASELINE_CONTAINER=supabase_db_YOUR_LOCAL_STACK node --test tests/atomic-accounting-import-qualification.test.mjs
npx playwright test tests/e2e/atomic-accounting-import.spec.ts --workers=1 --retries=0
```

The accepted migration hash is
`1bb96d51f669c1699f282201cdfcf56776da5997fc0eda7b5012b1901f5d5554`.
After the metadata-lifecycle correction, the final frozen campaign passed all 19
full 50k authenticated finalizations: four shapes x3, then mixed-heavy x10 total.
Maximum complete-RPC/COMMIT upper bound was 2.348817s, which also conservatively
bounds mutex hold. Both hard limits passed, with three recorded >2s warnings.
Earlier campaigns are retained as superseded observations, not counted as final
acceptance. No campaign lowered the envelope. This is local PG15/PostgREST proof,
not a hosted performance promise.

Evidence includes actual catalog/ACL/security, direct REST mutex and cross-org
proof, seven normal writer regressions, unchanged POS permission/accounting
matrix, actual Reset epoch proof, 13 injected rollback points, baseline partial-
commit comparison, chunk/row/byte boundaries, ancillary failures and receipts,
browser wizard/recovery/Owner-only proof, full Node/static validation, original
protected signatures, preserved worktrees and prior seals.

Local DB lint has no errors. Warning-only findings are the existing unused
`create_invoice_return.v_branch_id` and `cancel_job.j` whose initializer intentionally
performs ownership authorization. Error-level security advisors are clean.
No warnings are hidden or treated as fixed by widening privileges.

Final accepted gates:

| Gate | Result |
| --- | --- |
| Focused source/adapter/workflow contracts | 8/8 passed |
| Configured atomicity/security/race/baseline Node database suites | 5/5 passed |
| Final frozen full-envelope qualification | 19/19 passed; mixed shape ten times |
| Production-mode importer plus unchanged Repair tenant-integrity Playwright | 7/7 passed; retries 0 |
| Complete Node suite | 470 total; 463 passed, 7 opt-in skips, 0 failed/cancelled |
| Skipped database, qualification and POS gates | Passed separately with their opt-in configuration |
| Existing POS SQL permission/accounting suite | 93 cases, including 38 denials and five money/FIFO/service snapshots |
| Lint | 0 errors; two pre-existing privacy-center Hook warnings |
| Typecheck / production build | Passed |
| Database lint / error-level security advisors | No errors / no issues |
| Preservation | 106 pre-existing worktrees, 45 protected local relations, 11 earlier seals unchanged |

Discarded setup/development attempts remain separately classified in evidence.
An earlier complete Node run cancelled an unchanged supplier test because repeated
CLI-container startup exhausted its deadline. A bounded in-memory copy of freshly
observed local configuration removed that setup overhead without changing its
database calls or assertions. A later temporary npx installation failed before
typecheck started; the pinned official CLI/binary was installed once in task-only
tooling and the remaining gates passed. Neither discarded attempt counts as a pass.

Evidence directory:
`/Users/sw12/Projects/saledock-local-evidence/atomic-import-narrow-identity-implementation`.
Its independent SHA-256 manifest and accepted validation results are recorded in
the draft PR. Earlier importer/ledger/POS evidence remains sealed and untouched.
