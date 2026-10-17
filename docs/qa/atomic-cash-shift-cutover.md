# Atomic Cash Shift handover

This is a future supervised maintenance runbook. Task 61954 qualifies synthetic local data only. The migration and compatible application must ship together after owner review.

1. Pause financial writes at every application entry point and revoke old client writer access during the maintenance fence. Include checkout, customer collections, Return, write-off, expense mutations, repair intake/advance edits and workflow writers, supplier writers, backup finalization and Reset. Confirm the fence with a new connection.
2. Observe and drain committed producers. Abort idle or queued old transactions and disconnect old application pools; no old function body may resume after activation. A migration table lock alone is insufficient.
3. Identify every unresolved legacy open cash shift. Obtain a physical cash count from the operator. Reconcile the existing legacy timestamp interval with complete SQL over invoices, payments, completed Returns, active expenses, credit collections and write-offs. Preserve the existing formula: opening float + cash payments − cash refunds − cash expenses + cash credit collections. Write-offs and digital activity contribute no drawer cash. Save the operator count, difference, close actor/time and audit atomically. Do not use capped API rows.
4. Verify zero unresolved legacy open shifts and record the handover. Preserve historical closed values and source money. Do not assign historical membership.
5. Apply `20261014100309_atomic_cash_shift_boundary.sql`. Its NOWAIT catalog fence aborts the whole migration when a writer still holds a target relation; unresolved legacy open shifts also abort. Investigate an abort while writes remain paused.
6. Deploy the reviewed compatible application, replace old pools, verify exact public signatures/grants and protocol version 2. Open a new shift, record a synthetic controlled transaction and verify DB-assigned membership and same-key replay. Confirm imported open history remains passive.
7. Resume writes only after the supervisor verifies the fence/drain, reconciliation and protocol evidence. Rollout failure requires staying paused and owner review; this document authorizes no production action.

## Membership and locks

Invoices, payments, returns, expenses, credit_payments and customer_write_offs carry event assignment. The single Repair V1 advance receipt additionally carries `advance_cash_shift_id`, `advance_cash_shift_assignment_xid`, `advance_received_at` and `advance_received_by`; the repair job itself has no generic shift membership. `cash_shift_assignment_xid` distinguishes protected deliberate NULL from legacy NULL and ties creation to the database transaction. Same-checkout invoice/payment assignment is coherent. This evidence grants neither ledger trust nor Return entitlement.

All participating paths use organization Reset coordination M shared before branch boundary B or business locks. M is the existing advisory namespace `hashtextextended(org,24637)`; only Factory Reset takes it exclusive. Reset retains the existing 250ms busy boundary and returns a conflict if admitted work has not drained; it does not wait indefinitely or retry automatically. B is a permanent `(organization_id,branch_id)` row in private `cash_private.branch_boundaries` with an epoch. Normal writers use FOR SHARE; open/close use FOR UPDATE, with no lock upgrade. Admission survives until outer COMMIT/ROLLBACK and performs a fresh READ COMMITTED shift lookup. Unsupported transaction isolation fails closed. A waiting producer rechecks profile, organization/branch and Reset epoch after admission.

| Writer                               | Lock order after M                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Open / close                         | B exclusive → shift row → aggregate / snapshot / audit                                                                      |
| POS                                  | B shared → existing organization/counter → customer → inventory / FIFO                                                      |
| Customer collection / write-off      | B shared → customer → invoice allocation / trusted ledger                                                                   |
| Current Return                       | immutable invoice identity prelookup → B shared → organization/counter → customer → invoice → item / FIFO                   |
| Expense                              | immutable target-branch prelookup → B shared → expense row / revision                                                       |
| Supplier purchase                    | organization/counter → supplier → inventory                                                                                 |
| Supplier payment / write-off         | existing supplier / purchase order                                                                                          |
| Import finalizer / ancillary restore | identity exclusion boundary → existing import checks / mutations; no live B assignment                                      |
| Factory Reset                        | M exclusive → identity exclusion → organization → delete member children and headers before shifts → advance private epochs |

Currency guards retain their reviewed organization lock; no closer takes a late account, customer or product lock. Branch identity mutation is prohibited. Branch deletion callbacks use nonblocking M/B probes after the branch tuple and abort when busy, avoiding a waiting back-edge.

Existing producers that legitimately permit a missing branch retain that behavior: M shared protects Reset coordination, no branch is invented, and the source receives protected NULL membership. Expenses already require a branch in the authoritative schema; retain that requirement. Producers that already require a branch continue to require one.

Transactions remain allowed without an open shift. Their protected NULL assignment is permanent. Economic expense edits retain original membership; after an exact shift closes only existing notes may change. Closed exact displays use the saved versioned snapshot. Legacy/imported history remains unverified.

## Return Math refresh points

PR #380 remains frozen. A later refresh must reconcile POS checkout as well as the forward migration's `ledger_private.create_invoice_return`, `record_credit_payment`, importer normalization/finalizer/ancillary restore and Reset definitions; their public keyed receipts and application callers also overlap. Keep M → B before the reviewed Return V1 organization/customer/invoice order. Preserve Return V1 mathematics, source trust, allocation relations and the importer envelope. The refreshed Return V1 forward migration must run after the Cash Shift migration; its older unreleased timestamp must not result in Cash Shift definitions overwriting V1. Reconcile the later FIFO COGS correction together with early M/B admission. This task implements current-main Return only and no historical reconstruction.

## Qualification

Task-local SQL hooks and PostgreSQL log timing may profile acquisition, wait, held section and COMMIT; those hooks are never release migrations. Final qualification starts from a clean local database and checks catalog fingerprints after hook removal. The 19-run importer campaign uses ledger×3, sales×10, supplier×3 and mixed×3; every run retains the existing 50,000-row, 33,554,432-byte, 5,000ms transaction and 3,000ms identity-held limits, without retries or averaging.


## Repair V1 advance receipt correction (ACS-84216-01)

Positive advance creation and the first later zero-to-positive posting use the same M shared → B shared admission before business locks. The DB-authorized repair writer owns amount/method persistence, assignment, first financial actor/time, revision CAS, create request replay, initial history and audit. SQL job-number allocation uses the existing organization counter lock and complete SQL max; no API row scan or separate numbering system is introduced. Current create roles remain owner/admin/manager/cashier/technician; financial/detail edit remains owner/admin/manager. Safe status/diagnosis/notes/delivery updates retain their existing role semantics.

A zero-advance job has no receipt assignment. A first positive receipt gets current exact membership or protected permanent Outside-shift NULL. Open-shift amount/method edits retain the original assignment, receipt actor and time. Closing freezes advance amount/method and containment, while operational workflow remains editable. Legacy/imported positive advances remain unverified and cannot be financially rewritten; nonfinancial edits do not manufacture membership. Restore strips all new receipt authority and request/revision metadata; historical amounts and closed snapshots are untouched.

Exact SQL snapshots add repair advance total, cash total, method vector, dedicated receiving-staff breakdown and source count. Expected cash is starting cash + cash POS payments + cash repair advances − cash refunds − active cash expenses + cash credit collections. Digital advances contribute zero drawer cash. Repair deposits never become sales revenue, customer credit collections, payments, ledger/source trust or Return entitlement. Job creator is not guessed as receiver; first financial assignment records the actual authenticated receiver and timestamp, retained on edits.

FINAL REPAIR SETTLEMENT RECEIPT NOT MODELED IN CURRENT V1. Current delivery updates status/final work cost and delivery time, without an additional financial receipt. Additional later payments or refunds are DEFERRED — REQUIRES APPEND-ONLY REPAIR PAYMENT MODEL. No installment, final-settlement, repair ledger, or refund feature is added. The stopped Task 84216 review remains a stopped review; this correction requires a complete new independent owner re-review.

## Repair quick-customer replay correction (ACS-93642-01)

Task 93642 independently found that the application inserted a quick customer before durable Repair replay. An unchanged retry generated another customer UUID and then conflicted with the original repair payload. Task 70439 moves optional customer creation into the same protected Repair transaction, after M/B admission, existing organization coordination and the organization/request-key replay check. Canonical intent includes the quick-create flag, submitted customer identity and repair fields; it excludes all generated identities. The original resolved customer is stored separately from compared intent so a later authorized customer relink cannot change the original create receipt. A successful retry returns the original repair/customer/job identities without another customer, receipt assignment, history or audit. Selected-customer and unlinked intake remain separate paths; quick creation on edits or together with a selected customer fails closed. Independent operations with identical names/phones remain independent, without global deduplication.

The Task 93642 instruction attachment was truncated; no unseen requirement is claimed satisfied. This focused correction and its qualification still require another complete independent owner review before controlled delivery. PR381 remains Draft; PR380 remains frozen.
