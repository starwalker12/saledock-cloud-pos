# POS Checkout Database Permission Parity

## Task 68152 Refresh

Refreshed from current main `ea6fdf5043c1bac0d578d0c02b7f1bdd9689acc3`.
The original reviewed head `9696321157c5b24ed90a0b8c750650c463c4b418`
and its base `ed8b7784fead3815fa5325ad206e5d3cbe615a34` remain preserved.
The original worktree and evidence seal are unchanged.

Main advanced only through Repair settlement/modal changes. Its entire migration
inventory, POS source and permission engine match the original base byte-for-byte.
The actual local checkout body matches the same last effective migration,
`20260630000000_pos_checkout_service_total_charged.sql`. The refreshed permission
migration is byte-identical to the reviewed one (SHA-256
`c1053454909a9696aaf6e134059daf6da32cd4f1d5d8dc26f50fe702a1c62de3`).
Its filename remains unique. No checkout signature, owner, invoker mode,
search_path, EXECUTE grants, RLS, or non-permission business behavior has drifted.

Refreshed local proof:

- Focused Node: 6/6, including 93 SQL cases and 38 atomic denials.
- Five exact accounting snapshots still match before/after permission enforcement.
  The two-lot case **consumes/allocates 12 units at cost 760**; it leaves 8 units,
  not 12. Cash 100/tender 150/payment 100/change 50, credit 100 to 200, and
  service principal 1000/commission 50/charged 1050 are unchanged.
- Supplemental authenticated REST: 11 adversarial denials with identical protected
  signatures, plus denied-key reuse after explicit authorization and no-op replay.
- Production-mode Playwright: 2/2, retries 0. Existing assertions are retained;
  added read-only snapshots explicitly prove Hold and Resume do not change
  invoices, payments, customer ledger, products, FIFO lots or stock movements.
  One authorized Cashier invoice is created; denied checkout remains actionable.
- Complete Node: 456/456. Local DB lint and error-level security advisors pass.
  Lint, typecheck, production build and diff check pass.
- Focused SQL, REST and browser cleanup leaves all 45 protected relations equal.
  The full existing Node suite changes only seed auth login timestamps and profile
  updated_at. Normalized full-row signatures excluding those columns match;
  no timestamps are rewritten to conceal test activity.
- The actual original checkout definition/ACL and migration history are restored.
  No Repair or other application runtime source is changed.

No semantic change from reviewed PR #364: only base refresh, this QA record, and
stronger held-bill test observations. The original known local React hydration
#418 remains within the unchanged assertion; it is not claimed fixed here.
Broader Cashier/RLS security and ledger forward trust are not resumed.
Production access/mutations are zero. Existing PR #364 remains OPEN and DRAFT.

Refresh evidence:
`/Users/sw12/Projects/saledock-local-evidence/pos-checkout-database-permission-parity-refresh`.
The new exact head, hosted results and independent manifest are recorded in the
PR body and final refresh report. Historical proof below is retained unchanged.

## Original Review

Task 82951. Local-only prerequisite for ledger forward trust. Draft review only.

## Source and Scope

Starting main: `ed8b7784fead3815fa5325ad206e5d3cbe615a34`.
Branch: `fix/pos-checkout-database-permission-parity`.
Migration: `20260907110844_pos_checkout_database_permission_parity.sql`.

Only `public.pos_checkout(uuid,uuid,jsonb,numeric,public.payment_method,numeric,text,text,boolean,text)`
changes runtime behavior. The current effective body comes from migration
`20260630000000_pos_checkout_service_total_charged.sql`, verified against local
`pg_proc`. No application source, historical migration, RLS policy, table,
permission default, import workflow or ledger-trust object is changed.

The RPC remains SECURITY INVOKER with its existing owner, search_path, parameters,
return contract and organization-scoped RLS. No helper, new role, definer or
service-role checkout path is introduced. Authenticated and service_role EXECUTE
remain; PUBLIC and anon EXECUTE are denied. The actual local catalog has one
overload. Service-role execution still requires a real authenticated active
profile context; a service-role request without auth.uid() fails.

## Authority

The RPC reads only auth.uid()'s active profile and that profile/organization's
staff_permissions row through existing own-row SELECT policy. Owner/Admin always
have all three permissions, including when override rows contain false values.
Manager/Cashier default to sell/discount=true and staff loss=false; Technician
defaults to all three false. Absent rows and NULL inherit defaults; true/false
overrides are respected. Unsupported roles fail closed; the current role enum
also rejects unsupported values. No role or profile identity is accepted as input.

Sell and bill/line-discount checks precede business inserts. Physical below-list
price requires discount permission using the existing action's 0.001 tolerance.
Service prices retain their separate existing behavior; service line discounts
still require can_discount. The staff loss flag is now requested override AND
effective can_sell_at_loss (NULL request is false). The independent product-level
allow_sell_at_loss flag remains valid. Loss audit metadata describes effective,
not merely requested, staff authority.

Checkout's action always supplies profile.branch_id and has no branch picker.
The RPC now rejects a different requested branch, requires the assigned branch
to belong to the profile organization, and validates customer organization even
for fully paid sales. A null request still defaults to the assigned branch.
Existing product organization checks remain. No multi-branch permission model
or Owner/Admin branch bypass is invented.

## Local Proof

- 93 direct SQL role/override and adversarial cases pass; 38 denials have zero
  persisted mutation, checked using counts/digests of all 45 protected relations.
- The exact pre-fix no-override Technician credit-sale bypass reproduces; after
  migration the same authority fails with 42501. Explicit can_sell=true succeeds.
- TypeScript userCan/canSellNew/canDiscountNew/canSellAtLossNew are executed with
  controlled own-row lookups to derive the SQL matrix's expected answers.
- Bill, line and below-list discount denial/allow cases pass. Forged true and
  NULL loss requests fail without permission. Requested authorized overrides
  pass; product exemption still works and does not falsely log staff authority.
- Inactive/missing profile, unauthenticated/anon, cross-org product/customer,
  foreign/unassigned/missing branch and malformed assigned-branch contexts deny.
- Five before/after accounting snapshots match exactly: cash/change/idempotent
  replay, customer credit, two-lot FIFO, service explicit total and fallback total.
- Cash 100 with tender 150 records payment 100/change 50. Credit 100 raises debt
  100 to 200 with one debit ledger row. FIFO quantity 12 costs 760 across lots
  10 at 60 and 2 at 80. Service principal 1000/commission 50 records total 1050.
- Local production-mode Playwright: 2/2, retries 0. Authenticated REST directly
  proves Technician denial/override; actual Cashier UI holds/resumes/checks out
  once and returns an actionable denied-submit state after can_sell=false.
- Complete Node suite: 440/440 including the live local SQL matrix. Lint has
  zero errors and two unchanged privacy-center hook warnings. Typecheck/build
  pass. Local database lint and error-level security advisor checks pass.
- SQL tests roll back; browser synthetic users/accounts/business rows are removed.
  Original local RPC definition/ACL restored; all 45 relation signatures match
  across each focused browser run and each rollback-only SQL case.
  No migration-history entry is created during local iterative verification.

The complete legacy Node suite signs in the existing local seed users and briefly
changes/restores the manager's branch in an unrelated stock-opening regression.
A separately bracketed replay proves its only remaining differences are
auth.users last_sign_in_at/updated_at and profiles updated_at. All other 43
protected relations match. These local test timestamps are not restored or
misreported as whole-task raw-digest equality; no business data remains changed.

## Known Local UI Finding and Test Attempts

The unchanged-runtime, pre-migration Cashier flow emits one React hydration #418
error. The same single error occurs after migration; checkout and accounting
assertions pass in both. This is not claimed fixed or error-free. The focused
browser test records the known exact message, allows no increase over its one-error
baseline and rejects any other runtime error. No rendered application source is
changed. Root cause of that existing UI finding was not investigated in this task.

Initial SQL harness text/JSON concatenation and test-lint naming errors were fixed.
The initial browser attempt failed because its banner check ran before hydration;
the test now waits for and dismisses consent explicitly. Failed diagnostic runs
are retained and are not counted as accepted passes. All focused retries are zero.

## Reproduction and Evidence

With the existing isolated five-role local Supabase seed, run:

```sh
RUN_LOCAL_POS_PERMISSION_DB=1 node --test tests/pos-checkout-database-permission-parity.test.mjs
```

The SQL matrix includes migration application within BEGIN/ROLLBACK. The browser
test requires the reviewed migration temporarily applied to a local database and
a production-mode local Next server pointing only to that database. Do not run
these mutation fixtures against production. Browser traces/videos/auth exports
are disabled; credentials exist only in memory.

Evidence: `/Users/sw12/Projects/saledock-local-evidence/pos-checkout-database-permission-parity`.
The sealed manifest digest and exact reviewed commit are recorded in the draft
PR body. Prior Task 47206 evidence remains immutable.

Production access/mutations: zero. No merge or production deployment.
Ledger forward trust remains pending; import policy is settled but not implemented
here. Supplier Statement and customer period ledger remain pending. Exchange is
not started. Audit Log is deferred. Broader Cashier/security remains paused.
This closes only checkout's three permission checks, not all direct-table or
other-RPC financial authorization concerns.
