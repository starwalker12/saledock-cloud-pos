# Repair Customer Tenant Integrity Fix

## Status

`REPAIR-CUSTOMER-TENANT-INTEGRITY-001` is closed. PR #326 delivered the reviewed application and database correction, and bounded production verification passed on 2 August 2026.

Live result: `PASS - REPAIR-CUSTOMER-TENANT-INTEGRITY-001 FIXED`.

Operational state returned to `FINISHING ACCEPTED WITH LIMITED COVERAGE`. P0 is 0, P1 reduced from 1 to 0, P2 remains 6, and P3 remains 5. SaleDock is not audit-ready and is not MVP-live.

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

Before merge, the authorized privileged production preflight found three repairs, all three customer-linked, and zero cross-organization mismatches. PostgreSQL was `17.6` (`server_version_num` 170006). The legacy `repairs_customer_id_fkey` existed once, the new composite constraint was absent, and no supporting-index object conflict existed. No row details were read.

The equivalent migration delivery preflight passed locally. A full Supabase shadow database replayed the complete migration chain, including Storage migration `0024` and `20260729133000_enforce_repair_customer_tenant_integrity`, and `supabase db diff --local --schema public` reported no schema differences.

After PR #326 merged, the exact reviewed migration appeared in production migration history once before any manual apply command was issued. The delivery was therefore treated as automatic post-merge migration delivery, and no duplicate `apply_migration` call was made. Available migration history does not expose an application timestamp; the retained delivery window is bounded by the source merge at `2026-08-02T08:06:23Z` and the first retained post-merge metadata verification at `2026-08-02T08:11:18.427156Z`.

- Migration version: `20260729133000`
- Migration name: `enforce_repair_customer_tenant_integrity`
- Stored statement count: 4
- Stored statement SHA-256: `384e679dffb3eefaf1efcc6b3f5bb82440d834a452a620a9fb3fe69709d0bb80`
- Local and production migration-history statement hashes: equal
- Later production migrations present at verification: none
- Manual migration command issued: no
- Duplicate migration attempt: no

Production metadata after delivery showed:

- `repairs_customer_id_fkey`: absent;
- `repairs_organization_customer_id_fkey`: present once and validated;
- exact definition: `FOREIGN KEY (organization_id, customer_id) REFERENCES customers(organization_id, id) ON UPDATE RESTRICT ON DELETE SET NULL (customer_id)`;
- `customers_organization_id_id_key`: present once as a unique `(organization_id, id)` index;
- `repairs.customer_id`: nullable;
- repair/customer organization mismatches: 0.

The authorized production probe ran in one explicit transaction. It selected one existing linked repair and one cross-organization customer internally without returning IDs or private fields. The attempted reassignment was rejected with SQLSTATE `23503`; the original customer link remained unchanged; the transaction rolled back; total and linked repair counts remained 3; and the mismatch count remained 0. No production fixture or persistent row delta was created.

Local migration proof completed:

- the shared loopback database had zero pre-existing mismatches;
- one synthetic mismatch caused explicit SQLSTATE `23514` failure and full transaction rollback;
- clean `supabase migration up --local` applied and recorded version `20260729133000`;
- same-organization and null inserts passed;
- cross-organization insert, customer update, and incompatible repair-organization update failed with `23503`;
- customer deletion retained the repair and cleared only `customer_id`;
- the rollback SQL below passed inside a transaction, after which rollback restored the composite constraint;
- a final full Supabase shadow replay completed the entire migration chain and reported no schema differences.

Supabase Preview was skipped by the hosted PR integration. It was not represented as passed. The equivalent full-chain Supabase shadow preflight above passed before merge.

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
- The only production write attempt was the owner-authorized cross-tenant update inside a transaction that fully rolled back; no persistent production mutation occurred.
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
- production persistent mutations: 0.

Discarded runs are retained honestly:

- three baseline diagnostic launches corrected test-only customer lookup, expected generic-error, and local REST console filtering assumptions;
- one Node launch omitted the required in-memory loopback variables and failed only the two seed database checks; the corrected run passed 288/288;
- one status-lifecycle launch filtered repair audits only by marker text and could not see the UUID-based status audit; its exact generated audit was removed, the helper was corrected, and the final run passed;
- the isolated full-stack reset limitation is recorded above.

Node emitted the existing module-type warnings for `src/lib/datetime.ts` and `src/lib/return-profit.ts`. Playwright emitted the existing `NO_COLOR`/`FORCE_COLOR` warning.

## Source Delivery

- Source PR: #326
- Reviewed source head: `446d08e7c88f981e418391103abe03a2dc4b7eae`
- Merge method: squash
- Source squash: `12de0dd189d0c41895e4da5ca06bd880d17ee98b`
- Merge timestamp: `2026-08-02T08:06:23Z`
- Main CI: run `30739122912`, successful
- Production deployment: `dpl_5VkXkjFCx1vwqdA2ukK639jrUVur`
- Deployment state: Ready, Production, Latest, exact source squash
- Deployment ready timestamp: `2026-08-02T08:07:33.268Z`

The source PR contained exactly the reviewed five files. It changed no optional-field validation, repair status behavior, accounting, settlement, stock/FIFO, Cash Drawer, package, lockfile, workflow, or unrelated migration.

## Authenticated Production Verification

Codex Chrome computer use verified the current production deployment and authenticated context:

- Fardan Aatir;
- Owner;
- Star Shop;
- Main Branch;
- PKR;
- Asia/Karachi.

The Repairs page rendered its three existing same-organization customer links. Repair Intake rendered at `/repairs?add=1`; its registered-customer search returned only the organization-visible match. An existing repair detail and status history rendered unchanged. No Repair Intake form was submitted, no production Server Action was forged, and no foreign customer data was exposed.

The marker `LIVE-REPAIR-TENANT-20260802-1306-AE5C` exists only in evidence metadata. No production row was created for it.

Evidence is retained under `/Users/sw12/Projects/saledock-local-evidence/repair-customer-tenant-integrity-live-verification`.

- Evidence manifest SHA-256: `934124226da08ebd09c410570188840571c50205d6e379f8ccddac1a854dae0e`
- Manifest entries: 10
- Retained screenshot: sanitized Vercel production deployment only
- Secret/privacy scan: passed

## Current Boundary

`REPAIR-CUSTOMER-TENANT-INTEGRITY-001` is fixed and the P1 is closed. P0 is 0, P1 is 0, P2 remains 6, and P3 remains 5. Classification is `FINISHING ACCEPTED WITH LIMITED COVERAGE`.

`LIVE-REPAIR-OPTIONAL-001` remains open and paused pending canonical synchronization. Customer- and supplier-settlement client-completion findings remain open. Audit-ready remains no, MVP-live remains no, and canonical synchronization is deferred to a separate owner-reviewed task.
