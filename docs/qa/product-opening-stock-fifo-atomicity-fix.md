# Product Opening Stock / FIFO Atomicity Fix

Date: 2026-07-20

Finding: P1 opening-stock/FIFO integrity blocker

Branch: `fix/product-opening-stock-fifo-atomicity`

Base: `852c72c22e9a486d1dda59860fc6ad260b1c28ba`

## User-visible symptom

Creating a physical product with opening stock 10 wrote 10 to
`products.stock_quantity` but created no FIFO lot and no opening-stock movement.
Products and POS displayed 10 while FIFO displayed zero remaining stock and zero
active lots. A one-unit checkout therefore failed with "Not enough stock
available" and created no invoice, payment, or stock deduction.

## Root cause

The product action inserted the submitted stock quantity directly into
`products`. The independent FIFO lot and movement writes required by checkout
were absent. The same form also exposed stock quantity during ordinary catalog
editing, allowing a metadata update to bypass supported FIFO stock workflows.

The product row, opening lot, and opening movement are one inventory invariant.
They must commit or roll back together because checkout consumes active lots and
then reconciles the aggregate product quantity.

## Correction

Migration `20260720093639_product_opening_stock_fifo_atomicity.sql` adds the
`security invoker` function `create_product_with_opening_stock` with
`search_path = public`. Execute is revoked from `public`, `anon`, and
`service_role`, and granted only to `authenticated`.

The function validates the active profile, owner/admin/manager permission,
active organization branch, product type, prices, stock settings, loss override,
category, supplier, and barcode. It inserts one product and, only for a physical
product with positive opening stock, exactly one active FIFO lot and one
`opening_stock` movement. Product, lot, and movement use the same organization,
branch, product, quantity, and unit cost.

The create action now calls that RPC once. A failed RPC removes any newly
uploaded product image. Existing audit logging and Products, POS, and Dashboard
revalidation remain unchanged.

Ordinary edits no longer submit or update `stock_quantity`. Existing physical
stock is displayed read-only and directs the user to Inventory Restock or Stock
Adjustment. A physical product with stock or inventory history cannot be
converted to a service. A service converted to a physical product starts at
zero and must use a supported stock workflow. Service creation remains
stock-free.

No trigger, legacy repair, mass update, destructive statement, service-role
secret, AppShell change, checkout change, supplier-purchase change, import
change, demo-data change, package change, or canonical audit-document change is
included.

## Baseline reproduction

The focused local browser test first ran against the unmodified source. Product
stock and POS displayed 10, while FIFO lots and opening movements were both
zero. One-unit checkout failed with the expected insufficient-stock error.
Invoice, invoice-item, payment, and cash-shift movement counts remained
unchanged, and exact cleanup restored all measured table counts.

Two earlier baseline launches were discarded for harness-only filtering of
unavailable local Vercel instrumentation. The accepted baseline itself required
no application retry and reproduced the business defect once.

## Atomicity and authorization evidence

The local RPC matrix passed for:

- physical opening stock 10: one product, one lot, and one movement;
- physical opening stock 0: product only;
- service stock 0: service only;
- service nonzero stock: rejected;
- manager caller: permitted under the existing catalog policy;
- cashier caller: rejected;
- foreign category, supplier, and branch: rejected;
- duplicate organization barcode: rejected;
- exact organization, branch, creator, quantity, and cost propagation;
- no second increment of `products.stock_quantity`.

A transaction-local test trigger forced the opening movement insert to fail.
The RPC raised the forced error and neither the product nor its FIFO lot
survived, proving all-or-nothing rollback. The first rollback-test launch found
that host `psql` was unavailable; the harness was corrected to use the running
local Supabase Postgres container, after which the proof passed without changing
application behavior.

## Browser regression

The accepted local production-mode browser run covered normal UI creation with
opening stock 10, one exact opening lot and movement, read-only edit stock,
metadata editing with a forged stock field ignored, and a fully paid Card sale.
After the one-unit sale, product stock, POS stock, and FIFO remaining quantity
were all 9. The run created exactly one invoice item, payment, FIFO allocation,
and sale movement; purchase cost remained 100. Products, FIFO, and POS all
rendered the same remaining quantity. Exact teardown restored all measured
table counts.

After a full local database reset and QA-user setup, two discarded browser runs
identified only missing optional `user_ui_preferences` rows as local HTTP 406
console noise. The filter was narrowed to that exact loopback endpoint. The
accepted post-reset run passed with zero page errors, unexpected console errors,
request failures, overlays, native dialogs, retries, duplicate writes, or
cleanup failures.

## Validation

- focused source/database contracts: 6/6 passed;
- complete Node source-contract suite: 205/205 passed;
- relevant catalog, POS, FIFO, Returns, and service subset: 53/53 passed;
- focused product-create/edit/checkout browser flow: 1/1 passed;
- full local database reset and migration replay: passed;
- lint: passed with two pre-existing privacy-center hook warnings;
- typecheck: passed;
- production build: passed;
- diff check: passed;
- package and lock files: unchanged;
- generated product, lot, movement, invoice, payment, allocation, and audit rows
  remaining after focused runs: zero.

`supabase db lint --local --level error` reported the pre-existing ambiguous
`purchase_no` reference in `public.create_supplier_purchase`. The new migration
applied successfully and introduced no new lint finding; the unrelated existing
function is outside this focused change.

## Business and permission impact

Opening stock now has one truthful atomic source across product summary, FIFO,
and checkout. Existing accounting formulas, checkout allocation logic, payments,
returns, supplier purchases, restock, stock adjustment, authentication, RLS,
and organization/branch permissions are unchanged. This work does not repair
historical mismatches and does not certify unrelated inventory paths.

## Deployment and live verification boundary

At source-review time, GitHub merge, production migration, Vercel production
deployment, and authenticated live blocker verification are pending. The
reviewed additive migration must be the only pending production migration and
must be applied only after the focused source PR is merged. Public HTTP success
alone is not live stock/FIFO evidence.

## Rollback

Application rollback after merge: revert the squash commit through a reviewed
PR. The migration is additive; leave the unused function in place unless a
separately reviewed migration revokes and drops its exact signature. Do not
attempt to rewrite product, lot, or movement history during rollback.
