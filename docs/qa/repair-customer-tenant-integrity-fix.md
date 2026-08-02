# Repair Customer Tenant Integrity Fix

## Status

`REPAIR-CUSTOMER-TENANT-INTEGRITY-001` is a P1 tenant-integrity finding corrected only on the draft branch. The P1 remains active until owner review, merge, production migration preflight/application, deployment, and authenticated production verification complete.

Operational state remains `FINISHING BLOCKED - ACTIVE P1 TENANT INTEGRITY`. SaleDock is not audit-ready and is not MVP-live.

## Discovery And Evidence

The paused `LIVE-REPAIR-OPTIONAL-001` investigation exposed an independent tenant boundary defect. Its retained synthetic local reproducer linked an organization-A repair to an organization-B customer through one ordinary repair intake.

- Inherited evidence: `/Users/sw12/Projects/saledock-local-evidence/repair-optional-fields-fix`
- Inherited manifest SHA-256: `bb3b253cf534e851ae8e595c3f97357d5c2c88d64af5232c49ce1edb53f3b047`
- Synthetic repair: `3728638c-dc92-4928-86a5-2e30e7ba1db2`
- Repair organization: `00000000-0000-4000-8000-000000000001`
- Synthetic foreign customer: `6ae3e7a4-d103-46b5-84b9-6be6531f72c4`

The inherited cleanup passed and its before/after signatures matched. These UUIDs are local synthetic fixtures, not production records.

Fresh baseline evidence is retained under `/Users/sw12/Projects/saledock-local-evidence/repair-customer-tenant-integrity-fix`.

## Root Cause

`saveRepairAction` accepted a syntactically valid `customer_id` and placed it directly into the shared create/edit payload. It did not check that the selected customer belonged to the authenticated organization.

Repair RLS correctly limits `repairs.organization_id` to the authenticated organization, and customer RLS hides foreign customer rows. Those independent policies do not assert equality between the repair and customer organization columns.

The database foreign key covered only `repairs.customer_id -> customers.id`. An authenticated direct repair INSERT or UPDATE could therefore bypass the action and persist the same mismatch.

## Baseline Matrix

The fresh production-mode local baseline proved:

- own-customer ordinary create succeeded;
- foreign-customer ordinary create succeeded;
- a missing valid customer UUID was rejected by the existing foreign key;
- own-to-foreign and null-to-foreign ordinary edits succeeded;
- authenticated direct foreign-link INSERT and UPDATE succeeded;
- same-organization and null direct writes succeeded;
- quick-created customer and repair remained in the authenticated organization;
- a foreign repair remained invisible and unmodifiable through RLS;
- deleting a linked customer set only `customer_id` to null;
- cleanup completed with complete signature equality.

## Write-Path Inventory

| Path | Organization source | Customer source | Result after correction |
| --- | --- | --- | --- |
| Repair create/edit action | Authenticated profile | Selected UUID or quick-create result | Selected UUID is checked by ID and organization before mutation |
| Quick customer | Authenticated profile | Exact returned insert ID | Same-organization link remains valid |
| Direct authenticated table write | RLS-authenticated organization | Submitted UUID | Composite foreign key rejects a mismatch |
| Backup/import RepairJobs | Authenticated organization/import job | Organization- and job-scoped customer mapping | Valid mapped links continue; absent mappings remain null |
| Demo creation | Authenticated organization | Customer ID created in the same demo run | Valid link continues |
| Demo/factory reset | Organization-scoped delete | No link creation | No adaptation required |

No SQL function, trigger, or RPC was found that creates or changes repair customer links.

## Correction

The action now selects only `customers.id`, filtered by the submitted customer ID and authenticated organization ID. Query failure, a missing customer, and a foreign customer all return:

`The selected customer is unavailable.`

This check runs before repair insert/update, status-history insertion, or repair audit. It loads and reveals no private customer fields. Quick customer creation still uses the exact ID returned by its organization-owned insert.

Migration `20260729133000_enforce_repair_customer_tenant_integrity.sql`:

1. counts existing non-null repair/customer organization mismatches;
2. raises SQLSTATE `23514` when any exist;
3. never detaches, rewrites, or deletes historical rows;
4. adds a unique `(organization_id, id)` customer index;
5. replaces the ID-only foreign key with a composite repair/customer organization foreign key;
6. uses `ON UPDATE RESTRICT`;
7. preserves customer deletion behavior with `ON DELETE SET NULL (customer_id)`.

Null customer relations and valid same-organization links remain supported. Cross-organization INSERT, UPDATE, and repair-organization changes retaining an incompatible customer are rejected independently of application code.

## Migration Safety

Production was not queried with an exploit and was not mutated. A production-wide mismatch check requires authorized privileged read access during delivery. The migration must not be applied until that preflight reports zero mismatches. A non-zero count requires a separate owner decision; the migration intentionally fails instead of changing data.

Expected lock scope is the customer index build plus brief `repairs` constraint replacement/validation locks. Delivery should schedule the reviewed migration accordingly.

Local migration proof completed:

- the shared loopback database had zero pre-existing mismatches;
- one synthetic mismatch caused explicit SQLSTATE `23514` failure and full transaction rollback;
- clean `supabase migration up --local` applied and recorded version `20260729133000`;
- same-organization and null inserts passed;
- cross-organization insert, customer update, and incompatible repair-organization update failed with `23503`;
- customer deletion retained the repair and cleared only `customer_id`;
- the rollback SQL below passed inside a transaction, after which rollback restored the composite constraint;
- a separate disposable full-stack reset reached historical migration `0024_storage_buckets.sql` and stopped because a standalone Postgres image did not provide the normal Supabase Storage `buckets.public` column. The new migration was not reached or implicated, and the disposable container was removed.

Supabase Preview remains a required draft-PR gate and must apply the full migration stack.

Rollback:

```sql
alter table public.repairs
  drop constraint repairs_organization_customer_id_fkey;

alter table public.repairs
  add constraint repairs_customer_id_fkey
  foreign key (customer_id)
  references public.customers (id)
  on delete set null;

drop index if exists public.customers_organization_id_id_key;
```

Rollback restores the previous ID-only relation and therefore reopens the tenant-integrity defect.

## Boundaries

- Existing create, edit, and status role lists are unchanged.
- Authorized roles cannot bypass the database tenant invariant.
- No foreign customer name, phone, organization, or existence is returned by the safe error.
- Backup/import customer mappings remain organization and import-job scoped.
- Demo and reset behavior require no source adaptation.
- Repair status logic is unchanged.
- Optional repair validation and form handling are unchanged.
- `LIVE-REPAIR-OPTIONAL-001` remains open and paused.
- Customer/supplier settlement findings remain open.
- No accounting, Dashboard, Reports, stock/FIFO, or Cash Drawer source changed.
- No production mutation occurred.
- Canonical documents remain unchanged.

## Validation

Final local results:

- focused source and migration contracts: 6/6;
- focused production-mode tenant E2E: 1/1, zero automatic retries;
- complete Node suite: 288/288;
- role authorization cases: 5/5;
- broader authentication/role smoke: 8/9, with only the unrelated wrong-password case blocked by local `Security check unavailable` from Turnstile;
- backup/import mapped, null, and corrupt-foreign mapping runtime matrix: passed;
- factory reset runtime matrix: passed with one synthetic repair/customer removed in the established order;
- repair create, own edit, quick customer, normal `received -> in_progress` status lifecycle, history, audit, numbering, RLS, and deletion regressions: passed in the focused E2E;
- lint: 0 errors and two pre-existing `privacy-center.tsx` hook warnings;
- typecheck: passed;
- production build: passed;
- complete before/after safety signatures: equal;
- cleanup retries/failures: 0/0;
- final loopback mismatch count: 0;
- production mutations: 0.

Discarded runs are retained honestly:

- three baseline diagnostic launches corrected test-only customer lookup, expected generic-error, and local REST console filtering assumptions;
- one Node launch omitted the required in-memory loopback variables and failed only the two seed database checks; the corrected run passed 288/288;
- one status-lifecycle launch filtered repair audits only by marker text and could not see the UUID-based status audit; its exact generated audit was removed, the helper was corrected, and the final run passed;
- the isolated full-stack reset limitation is recorded above.

Node emitted the existing module-type warnings for `src/lib/datetime.ts` and `src/lib/return-profit.ts`. Playwright emitted the existing `NO_COLOR`/`FORCE_COLOR` warning.

## Delivery Plan

The draft PR remains unmerged and not ready for review. Owner review is required before any merge. Delivery must then perform a privileged production mismatch preflight, apply the reviewed migration only when zero mismatches exist, verify the exact deployment, and run bounded authenticated tenant-isolation verification.

Current operational severity remains P0 0, P1 1, P2 6, and P3 5. `LIVE-REPAIR-OPTIONAL-001` remains the paused next source task only after this P1 is delivered and production-verified.
