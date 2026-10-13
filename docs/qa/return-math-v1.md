# Return Math V1

## Scope

Exact future Returns use protected SaleDock invoice, item, receipt and FIFO
source evidence. Legacy and imported evidence is never upgraded. The original
invoice economics, customer identity, date, items and sale allocations remain
unchanged. Only settlement caches change through the existing financial writer.

This is not Exchange, Invoice Correction, store credit, write-off allocation or
recovery, Service V1, or Supplier Statement.

## Three Independent Values

- Economic return credit reverses the original net sale value.
- Settlement splits that credit into invoice-specific debt relief and an actual
  refund backed by protected invoice-specific payments.
- Inventory restoration records a separate integer quantity at original FIFO
  cost, including source consumption for units that are not restocked.

All entitlement arithmetic uses integer paisa / exact PostgreSQL NUMERIC. For
posted line values `L_i`, `S = sum(L_i)` and `C = S - grand_total`, cart-discount
shares use largest remainders, with immutable invoice-item ID ascending as the
tie-break. Shares total `C`; net item values total the original grand total.
Unsupported economics, including a nonzero customer-credit-applied snapshot,
fail closed rather than guessing attribution.

For item net value `N`, sold quantity `Q`, and previously returned quantity `k`,
`F(k) = floor(N * k / Q)`. The next `q` units receive `F(k + q) - F(k)`.
Five paisa over three separate one-unit Returns produces 1, 2, 2 paisa.

## Settlement And Write-Offs

Checkout receipts plus new `invoice_payment_allocations` establish actual paid
entitlement. `record_credit_payment` retains its current oldest-unpaid-invoice
FIFO behavior and persists only future actual-payment allocations. Historical
unallocated credit payments are not inferred or backfilled.

Return relieves remaining debt on the same invoice first, then refunds remaining
proven paid entitlement. A partially paid 1,000 sale with 400 paid and an 800
return credit produces 600 debt relief and a 200 refund. A fully paid target
invoice does not relieve unrelated customer debt. Walk-ins create no customer
ledger posting; fully paid Returns create no debt-relief posting.

Write-offs remain forgiveness, not payment. A protected invoice created after an
old write-off, or provably fully settled before a later unrelated write-off, can
qualify. An invoice open when an unallocated write-off occurred is blocked even
if a later payment makes its cache look settled. Proven effective timestamps,
not creating-transaction tokens, determine this eligibility.

## Stock And Services

Physical restock quantity is between zero and returned quantity. All/None/Custom
controls never accept a cost. `return_item_source_allocations` records every
returned unit, including non-sellable units, against original sale allocations.
Source order is immutable sale-allocation `created_at, id`; previous source
consumption reduces availability. Only selected restocked slots restore stock
and their exact original cost. Tied creation timestamps are ordered by ID, not
by a newly inferred chronology or an averaged cost.

Principal-zero services can be returned without stock. Pass-through-principal
services are blocked; this workflow cannot prove external principal recovery.

## Authority, Atomicity And Lock Order

The normal financial-writer inventory remains seven. The existing
`create_invoice_return` evolves; quote RPC is read-only. Public wrappers remain
SECURITY INVOKER and use restricted private financial authority. Effective
Owner/Admin/Manager Return policy, active profile, organization, assigned branch,
and product/source containment are independently checked in the database.
Cashier and Technician cannot obtain Return authority through an override.

All business writes, refund persistence, debt posting, stock, audit and request
receipt commit together. The client supplies a required UUID idempotency key,
but cannot choose refund amount. Same key and canonical request replay the
committed result; different details conflict. The former six-argument call still
resolves through a defaulted seventh argument but fails safely without a key.

Live customer writers acquire a shared Reset-only advisory barrier. Return then
locks organization with FOR NO KEY UPDATE, customer, invoice, items, products
and lots in deterministic order. This serializes Returns without blocking the
KEY SHARE foreign-key checks of a payment holding the customer lock. Payment
and write-off retain account-level ordering and independent-account concurrency.
Factory Reset takes the exclusive advisory barrier before its existing identity
boundary and denies a busy operation before mutation. Importer keeps its reviewed
exclusive identity boundary, but existing-account financial writes remain allowed
during finalization; imported records cannot bind to those existing accounts.

The single forward migration uses ACCESS EXCLUSIVE NOWAIT for cutover and
rejects unreviewed callback ownership. A busy cutover aborts without partial DDL.
There are no historical row updates or trust backfills.

## Presentation, Reports And Recovery

The form shows computed credit, debt relief and refund, with refund method only
when needed. It saves the exact request before sending. Storage failure prevents
submission. Lost responses preserve an explicit identical retry across refresh;
successful replay does not duplicate effects or reopen the form.

V1 revenue/profit uses economic credit, cash views use actual cash-method refund,
A/R uses debt relief, and restored COGS uses actual restock allocations. Full
restock of a 1,000 sale with 600 cost leaves combined profit zero; no restock
leaves a 600 loss. Legacy reporting interpretation remains unchanged and is
labelled legacy. Return adjustments occur on processing day; original invoice
dates, past closings and shifts are not rewritten. Currency display uses the
existing shared shop formatter without conversion or precision changes.

Read-only profit summaries also reconcile posted cart discounts and service
income (excluding pass-through principal). Reports no longer clamp original
gross losses to zero, which would make an approved below-cost sale falsely
profitable after a full restock Return. No stored sale, cost or balance changes.

## Backup And Reset

The atomic importer includes both new business relations (23 total) and nullable
V1 fields. Old snapshots remain legacy. New snapshots retain economic values,
quantities, allocation links and request identity, while source/ledger authority
is stripped by both normalization and restricted database insertion. Restored
history is not authoritative for new Return entitlement.

Factory Reset deletes new allocation children before their parents. Import
limits remain 50,000 rows, 33,554,432 canonical bytes, a five-second transaction
and a three-second identity-lock budget. Schema changes require the full
19-successful-run importer qualification campaign.

## Qualification

Focused tests cover generated paisa conservation, generated database source
caps, all canonical settlement/service/write-off cases, role/branch containment,
raw DML closure and read isolation, replay, injected rollback boundaries and
real two-session races (including a mid-payment foreign-key interleaving).
Native backup round trip and reset verify all new business fields and removal
of trust authority. Desktop and 390px light/dark production-mode Playwright
tests use zero retries, including lost committed-response and storage failure.
Existing POS permission, decimal money, ledger/source trust, currency lock,
importer correctness/race/performance and complete Node gates remain required.

Evidence is local synthetic data only. No production access, merge or deployment
is authorized by this implementation task.

## Task 65784 continuation qualification

Return plans have no fixed 200-line business ceiling. A plan may contain at most
one entry per actual source invoice item; the database verifies uniqueness,
invoice membership, organization, branch, remaining quantity and original FIFO
source consumption again under the Return locks. The existing Next.js Server
Action body limit remains in place; no Return-specific transport limit is added.
Protected producer-origin 201-, 250- and 500-line invoices are included in local
DB, browser and overlapping-request qualification.

All authoritative sale, Return, allocation, lot and product-stock quantities are
PostgreSQL INTEGER. Lexical whole-number validation precedes conversion and
permits the actual range through 2,147,483,647. Zero remains available for an
unselected preview line; a submitted Return needs a positive selected quantity.
Original source and remaining-return caps still apply. Scientific notation,
decimals, signs and non-finite values are rejected. Existing leading-zero input
compatibility is retained. Financial products and division remain exact.

Performance qualification uses 50,000 normalized rows in each of 19 fresh
isolated databases: ledger x3, sales x10, supplier x3 and mixed x3. Every run emits
request total, transaction through COMMIT, identity-lock wait, acquisition and
COMMIT-completion timestamps, identity-held duration, all 23 relation counts,
canonical bytes, phase timings and commit result before assertions. Disposable
SQL markers exist only in test databases. COMMIT log precision is bounded
conservatively by adding one millisecond. The acceptance limits remain 50,000
rows, 33,554,432 canonical bytes, 5,000 ms transaction and 3,000 ms identity held.
The previous failed HTTP upper-bound result remains preserved; its exact lock
measurement was never emitted and cannot be reconstructed.

Large-plan qualification also exercises a single materialization of the unchanged
largest-remainder invoice basis per plan. Recalculating the entire invoice basis
for each item caused a 500-line preview to hit the existing database statement
timeout; the lookup now uses the immutable invoice_item.id. Source and settlement
checks remain under the same Return locks, and the importer lock order is unchanged.

### Exact sale COGS correction (RM-78326-01)

Reports, Dashboard and the invoice profit summary share one server-side product
sale-cost helper. For #376 protected future items, cost is the exact sum of the
original FIFO allocation quantity times unit cost. Organization, invoice, item,
product, source version, original effective timestamp and creating transaction
must match, and allocated quantity must equal sold quantity. Inconsistent trusted
evidence raises “Original sale cost cannot be verified.” It never falls back to
the rounded purchase_price cache. Source-untrusted legacy/imported items retain
their existing cache-based reporting interpretation without trust promotion.

The focused matrix includes 2 units at 600.00 plus 1 at 600.01: sale COGS 1800.01,
sale profit 1199.99, full-restock Return adjustment -1199.99 and combined profit
exactly zero. No-restock combined profit is -1800.01; partial restock uses the
unchanged source-consumption order. Additional cases cover averages rounded up
and down, product/service separation, expenses, current-period Return adjustments,
legacy/imported fallback, corrupt trusted input, and paginated source reads.
Profit addition/subtraction uses the existing exact money helpers. Checkout,
stored purchase_price, Return settlement/restoration and all migrations stay
unchanged by this correction.
