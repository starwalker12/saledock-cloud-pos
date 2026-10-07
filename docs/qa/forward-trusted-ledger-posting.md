# Forward-Trusted Ledger Posting

Task 22819 continues the stopped Task 59327 candidate. Base:
`f727ec1d7e085592c67cd5a9dbfc8d1f5d0ba683`.

**FORWARD TRUST ONLY - LEGACY HISTORY REMAINS UNTRUSTED.**

This is local qualification for a draft PR, not production delivery. No production
reads, migration, deployment, or business mutation were performed.

## Accounting Boundary

Exactly seven normal writers retain their current business bodies and signatures:

1. `pos_checkout`
2. `record_credit_payment`
3. `create_invoice_return`
4. `record_customer_write_off`
5. `create_supplier_purchase`
6. `record_supplier_payment`
7. `record_supplier_write_off`

Public functions remain `SECURITY INVOKER`. Private implementations run as
`ledger_posting_executor`, a NOLOGIN, NOSUPERUSER, NOBYPASSRLS role with scoped
grants and tenant RLS. Application, Authenticator, service, and import roles cannot
assume it. Functions use an empty fixed search path. The parsed `actor_id()` SQL
function resolves `auth.uid()` without granting the executor Auth-schema access.

The existing public RPC ACLs are preserved, including legacy PUBLIC/anon EXECUTE
on three RPCs. No anonymous private implementation access is granted; anonymous
calls to all seven public writers are tested to fail without mutation. This is not
a broader RPC-grant cleanup.

Two private BIGINT CACHE 1 sequences allocate separate customer/supplier posting
orders. Sequence gaps on rollback are allowed. Each account is locked before its
chain is validated and its sequence assigned. Customer debit increases debt;
supplier credit increases debt. The reverse directions decrease debt. The signed
movement must exactly equal the locked outstanding cache, and the database assigns
`balance_after`, version 1, and `posting_effective_at`.

Existing current outstanding is captured once in private anchors. No historical
ledger, balance, payment, purchase, or write-off is reconstructed or rewritten.
Existing ledger provenance remains NULL. `created_at` ties are not treated as
authoritative chronology. Future period foundations use the anchor, trusted
posting order, and effective time; periods beginning before `trusted_from` cannot
claim a verified closing chain.

## Account Lifecycle

The stopped candidate reproduced authenticated Owner DELETE -> customer cascade ->
lost trusted history and anchor. The generic postgres maintenance exception was
unsafe. The final migration denies ordinary account DELETE before child cascades,
including zero-history accounts and Owner/Admin callers.

Customers retain Archive/Unarchive (`is_archived`, `archived_at`). Suppliers retain
Deactivate/Reactivate (`is_active`). Neither operation changes outstanding,
anchors, ledger history, posting sequence, invoices, returns, purchases, or payments.
No lifecycle UI is added.

Final materially relevant account FKs:

| Account | Relation | ON DELETE |
| --- | --- | --- |
| Customer | customer ledger | RESTRICT |
| Customer | customer anchor | RESTRICT |
| Customer | credit payments, customer write-offs | CASCADE, unchanged |
| Customer | invoices, payments, returns, held bills | SET NULL, unchanged |
| Customer | repairs composite FK | SET NULL customer_id, unchanged |
| Supplier | supplier ledger, supplier anchor | RESTRICT |
| Supplier | supplier payments, supplier purchases | RESTRICT, unchanged |
| Supplier | supplier write-offs | CASCADE, unchanged |
| Supplier | products, stock lots | SET NULL, unchanged |
| Organization | both anchor tables | RESTRICT |

The account BEFORE DELETE barrier prevents the remaining legacy CASCADE/SET NULL
actions from being ordinary deletion pathways. Higher-parent deletion and a
postgres-owned definer callback cannot erase protected history. Ledger UPDATE is
denied for legacy and trusted rows. Account/ledger/anchor TRUNCATE is denied.
Tenant TRIGGER privileges are revoked on executor-written relations; cutover
rejects an existing unreviewed trigger callback before installing the new roles.

## Factory Reset

Only the checked private Factory Reset core runs as `ledger_reset_executor`
(NOLOGIN, NOSUPERUSER, NOBYPASSRLS). It explicitly deletes protected ledgers and
anchors before accounts, retaining the existing dependency cleanup/count result
and atomic-import identity-lock/epoch preparation. It cannot allocate trusted
posting sequences. Ordinary users cannot execute the core, assume its role, or
forge authority using a GUC, JWT role claim, boolean, or generic postgres identity.

The authenticated entry retains the existing Owner/organization authorization.
The existing platform service Reset capability is preserved by an explicit
service-only private function ACL, not a writable claim. Direct service account
DELETE and ledger DML remain denied. Admin/Manager/Cashier/Technician Reset denial
and injected mid-cleanup rollback are qualified.

## Import and Backup

The reviewed atomic importer remains separate and Owner-only. Its mutex, caps,
collision checks, explicit balance requirement, and receipt replay are unchanged.
New accounts receive set-based anchors equal to the accepted explicit current
balance. All imported historical provenance is stripped at source-adapter,
canonical normalization, and database INSERT boundaries. It never allocates a
trusted sequence or restores a source anchor as target authority.

Both first post-import customer and supplier payments become trusted. A native
21-relation backup envelope containing legacy and trusted history is restored with
all four historical postings untrusted, fresh anchors 80.00, and subsequent local
0.02 payments producing 79.98. This fixture resets the source first to free native
UUIDs and provisions matching branch/actor roots in the fresh target through local
QA. It does not claim a new UI cross-organization root-ID remapping feature.

Finalizer rollback, response-loss receipt recovery, collision/tamper/expiry,
concurrent finalizers, live identity races, and stale-job Reset are tested against
a schema-only clone of the final candidate. Existing restricted roles are not
recreated or dropped by that harness. Its independent-writer case uses an approved
financial RPC rather than the direct ledger/cache writes now intentionally denied.

The required final campaign is ledger-heavy 50k x1, sales-heavy 50k x1,
supplier-heavy 50k x1, and mixed 50k x3, with 10k existing accounts of each type.
Limits remain transaction <= 5 seconds and identity lock <= 3 seconds. The older
pre-importer baseline campaign and separate 22-run importer benchmark are not
substitutes for this six-run final-schema campaign.

## Cutover and Qualification

One new unapplied migration:
`20261006054703_forward_trusted_ledger_posting.sql`.

All affected relations are locked ACCESS EXCLUSIVE NOWAIT before anchor capture.
An active old writer aborts the entire migration before DDL. A queued old request
cannot write across the cutover; it either uses the new boundary or fails with full
rollback. Local injected pre-COMMIT failure proves roles, schema, columns, anchors,
and legacy data roll back together. Production delivery must drain traffic and
inspect callbacks before attempting this single-phase cutover. This PR does not
perform that delivery.

Local qualification includes all seven signed chains, five-role direct-write and
delete matrices, real authenticated Owner PostgREST DELETE denial, archive and
reactivation, Reset authorization/rollback, same-account serialization, unrelated
account/org concurrency, 14 financial fault boundaries, replay, import/restore,
period foundations, #364's 96-case matrix, and #374 decimal DB/browser controls.
The unchanged current Return/FIFO body is compared exactly; Return Math is not
corrected here. Demo create/remove remain retired and fail closed.

Complete serial Node, production-mode local browser tests (retries 0), lint,
typecheck, production build, diff check, local DB lint, and error-level security
advisors are recorded in independent continuation evidence. Test-only adaptations
seed explicit balances through task-isolated SQL and use checked Reset for
disposable accounting cleanup; they are not application service-role routing.

Evidence directory:
`/Users/sw12/Projects/saledock-local-evidence/ledger-forward-trust-lifecycle-continuation`.
Its `final-report.md`, validation logs, catalog comparisons, preservation proof,
and independently sealed `SHA256SUMS` are the detailed result. The prior stopped
seal remains unchanged.

Final local results: 666 Node passes, zero failures (six opt-in campaigns skipped
in that aggregate run); four importer safety tests separately pass. The six-run
50k final-schema campaign passes with maximum transaction 2610.015 ms and identity
lock 2609.572 ms. Decimal browser controls pass 3/3 and POS/held-bill controls 2/2,
retries 0. Lint has zero errors and two unchanged privacy-center hook warnings;
typecheck, production build, DB lint, and error-level security advisors pass.
The historical pre-importer reproduction and separate older 22-run benchmark were
not rerun; the current-schema safety and required six-run campaign are recorded
independently. All 122 unrelated worktrees and 119 prior seals are unchanged.

## Not Delivered

Return Math, Exchange, Invoice Correction, Supplier Statement UI, and Service V1
remain separate work. No eighth normal writer, historical trust reconstruction,
global permission redesign, or production hotfix is included.
