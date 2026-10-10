# Posted Sale And Receipt Evidence Protection

Task 64185. Local implementation; draft review only. Base:
`53fd2b4c629f49f7a5a4192036c32a14ba40ad0b`.

**FORWARD SOURCE TRUST ONLY - LEGACY SALE/RECEIPT HISTORY IS NOT RETROACTIVELY AUTHENTICATED.**

## Boundary

Protected relations: `invoices`, `invoice_items`, `payments`, `credit_payments`,
`customer_write_offs`, `invoice_item_stock_allocations`.

Ordinary authenticated Owner/Admin/Manager/Cashier/Technician and service-role
table clients cannot insert, update, delete, truncate, install triggers, or use
independent column write grants. Same-organization SELECT policies remain;
cross-organization rows are not exposed. This does not redesign unrelated RLS.

All six relations have nullable `source_trust_version` (smallint),
`source_effective_at` (timestamptz), and `source_transaction_id` (xid8). Either all
are NULL, or version is explicitly 1 and both other fields are non-NULL. There
is no trusted default and no historical UPDATE/backfill.

The private SECURITY INVOKER trigger uses the executing database role, not
user-editable metadata. Approved private producers execute as the existing
restricted `ledger_posting_executor`. No new role, membership, public trust
parameter, ledger sequence, or broad SECURITY DEFINER helper is introduced.

The actual source writer inventory contains only checkout, customer payment,
customer write-off, the restricted atomic snapshot inserter, and Factory Reset.
Legacy accounting branches in backup Server Actions are unreachable under their
existing accounting-table guard. Admin clients have no supported raw posted-sale
business writer. All seven financial function bodies and public signatures are
unchanged, including #364 permission parity and #374/#375 money/ledger behavior.

## Producer And Immutability Rules

Checkout's invoice is stamped by the database. Its items, checkout payment, and
original FIFO allocations must reference that same organization and creating
transaction; they inherit the invoice effective marker. Receipt customer/branch
and FIFO item/product identities must match their parent. Customer credit-payment
and write-off records receive their own database-generated source markers.

`source_transaction_id` is a top-level transaction identity, **not** a ledger
posting sequence or business chronology. POS currently inserts a physical item
before completing its FIFO cost and loss snapshots. Column grants plus the
trigger permit only those initialization fields, and only in that item's
creating transaction. Later even the private executor cannot rewrite them.

Original invoice identity/economics are immutable. Only the private financial
executor can update `amount_paid`, `balance_due`, and `status`; its normal
timestamp trigger can refresh `updated_at`. Customer payment's FIFO settlement
still works. Future reviewed Return may use these same cache privileges without
permission to change original sale facts. Original FIFO allocation UPDATE is
always rejected; its pre-existing quantity privilege is retained solely because
the current Return uses SELECT FOR UPDATE.

Only the existing checked `ledger_reset_executor` may delete protected rows.
Generic Owner/Admin deletion, FK cascade rewriting, and TRUNCATE are not a
correction mechanism. Supported catalog/account UI paths archive/deactivate
rather than hard-delete posted references. Database-root/schema administration
can alter enforcement and is outside this threat model; this is not cryptographic
proof against a database administrator.

**POSTED INVOICES ARE NOT EDITED IN PLACE.** Future correction must append a
reviewed reversal/replacement/reclassification event. No correction feature is
implemented here.

## Restore And Legacy

Adapter and typed database normalizer independently strip all three source
fields. Snapshot insertion also forces them NULL under the restricted importer
role. Missing fields in old backups are valid legacy history. New or forged
incoming source metadata cannot transfer local producer authority. Explicit
balances, existing numeric validation, and the 21-relation atomic cluster remain
unchanged; ledger provenance/anchors keep #375 semantics.

Pre-cutover invoice/item/payment/FIFO economics remain byte-for-byte unchanged
after excluding the new NULL columns. Replaying an old checkout does not promote
it to trusted source. Legacy invoices remain viewable, printable, reportable,
and exportable; this PR does not hide history.

## Future Read Predicate

```sql
select id, source_trust_version, source_effective_at
from public.invoices
where source_trust_version = 1
  and source_effective_at is not null
  and source_transaction_id is not null;
```

The same predicate identifies protected payment/credit-payment/write-off rows.
It authenticates the producer boundary, **not refund entitlement**. Return Math
must separately prove original net-value allocation, paid entitlement, relevant
credit-payment allocation, write-off constraints, and previous returns. Legacy
source may not be authenticated from created_at, matching totals, descriptions,
audits, or current-balance reconciliation. The effective marker is diagnostic
database time, not a commit timestamp or a substitute for ledger posting order.

Existing Return behavior is unchanged. Return Math continuation must fail closed
where protected source entitlement cannot be proved. Write-off remains forgiveness,
not payment, and receives no invoice allocation/refund entitlement here.

## Cutover And Local Proof

One forward migration, one transaction, ACCESS EXCLUSIVE NOWAIT locks before
DDL/ACL changes, and callback-owner review. A checkout held open on old source
causes the complete cutover to abort with no source columns added. After traffic
drains, normal migration replay succeeds; there is no multiple-phase rollout.

Fresh isolated PostgreSQL/Supabase replay reproduced the baseline attack:
ordinary same-org Cashier changed invoice/item/payment 1000 to 2000. Baseline
probe rolled back. After protection, invoice/payment economics stay 1000 and
all direct attacks fail, including invoice customer, receipt reassignment/time,
write-off time, and FIFO lot/quantity/cost/delete.

Local database coverage includes 126 direct write denials (anonymous, five
application roles, service role), 30 populated same/cross-org read checks,
producer source identity, settlement caches, replay, private post-commit cost
denial, actual non-superuser role-escalation denial, six fault rollback boundaries,
and old/new/forged native restore for every protected relation. Factory Reset and
stale importer invalidation are exercised. #364 full role/override/money/FIFO
matrix, #374 exact money chains, and #375 all seven writers remain covered.

The POS regression fixture excludes only nondeterministic source metadata from
its economic comparison; it retains all financial assertions. It selects an
actual five-role seed organization instead of accidentally selecting unrelated
legacy probe owners. Database suites run serially because shared QA fault-trigger
tests intentionally acquire global DDL locks. Automatic browser retries are 0.

Local gates: 61 focused Node contracts; 30 serial database regressions; four
atomic-import correctness/race tests; and 19 successful 50,000-row qualification
runs. Qualification covered all four existing shapes and ten runs of the worst
shape: HTTP commit upper bounds were 1.421-1.922 seconds, under the existing
five-second budget, with database identity holds under three seconds.

Production-mode browser coverage: posted-source reads/tamper denial 2/2, POS
permission/held-bill 2/2, decimal money 3/3, and atomic importer 6/6. Protected
and legacy A4 invoices remain printable, report/export reads remain available,
and evidence economics are unchanged. Complete Node: 682 tests, 651 passed,
31 intentionally gated skips, zero failures. Browser retries are zero.

Final lint/typecheck/build, catalog/advisor results, fixture cleanup, preservation
checks, and independent evidence seal are recorded in the task's final report.
Initial local fixture/configuration/test-harness failures are retained in the
evidence and distinguished from final green gates. Production access/mutations
are zero.

Not delivered: Return Math, legacy entitlement reconstruction, Exchange, Invoice
Correction, write-off allocation/recovery, Supplier Statement, or Service V1.
