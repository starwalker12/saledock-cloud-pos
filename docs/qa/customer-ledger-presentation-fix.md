# Customer ledger reference and return presentation correction

## Status

`LIVE-CUSTOMER-LEDGER-001` is closed.

PR #323 was squash-merged as
`4b68e379ed5b4e60c9dbbef9e6fe53dd32c90266` and deployed to production as
`GuqL5ytTPBn93zHrXpxEsotPgX33`. Authenticated, read-only production
verification confirmed the corrected invoice route and the new Returns &
refunds history against the retained customer. No production row was mutated
during verification.

SaleDock remains `FINISHING ACCEPTED WITH LIMITED COVERAGE`, remains below
audit-ready, and is not MVP-live. The active register is P0 0, P1 0, P2 6, and
P3 5. Customer settlement client completion remains open. Canonical
documentation synchronization remains a separate, deferred task.

## Retained production finding

The authenticated finishing evidence is retained outside Git at:

`/Users/sw12/Projects/saledock-local-evidence/live-finishing-continuation-2026-07-26`

The 58-entry manifest has SHA-256:

`90f9cd57b810a29eb554a283b43a11281e0e1f6c5c7fab3f60bdb949eca34429`

The retained marker was `FINISHING-CONT-20260726-2022-2B42`. Sanitized
references relevant to this finding are:

- customer: `0dd1406a-ed51-4ff4-9f30-24a32b2d2ac4`;
- invoice: `INV-100361`;
- invoice ID: `d78ef3f5-7480-4e40-a330-38ec7791028b`;
- return: `RET-001006`;
- return ID: `a473366e-6617-468b-981c-668169b2282e`;
- Credit Payment ID: `921d213d-2b92-4b23-91be-8a6e3efc8dc9`.

The customer debt ledger was financially correct:

1. one `invoice_credit` debit of PKR 150 produced a balance of PKR 150;
2. one Credit Payment credit of PKR 150 produced a balance of PKR 0.

The rendered invoice label was `INV-100361`, but its href used customer ledger
entry ID `432d7aef-7214-41d7-ae05-0d04c228248e`. That route returned not found.
The expected href used invoice ID
`d78ef3f5-7480-4e40-a330-38ec7791028b` and opened the correct invoice.

The retained return and Card refund were truthful and independently
accessible, but the customer detail page exposed no returns/refunds history.
The final customer balance remained PKR 0 and duplicate financial mutations
were zero.

## Pre-fix read-only production confirmation

Codex Chrome computer use inspected the authenticated production customer
without submitting any form or changing any record.

The Ledger tab displayed the correct `INV-100361` label with the wrong
ledger-entry route. Opening that route in a separate tab produced not found.
Opening the retained invoice ID route displayed the correct invoice.

The customer page exposed the invoice and settlement histories, but no return
or refund history. The retained return route displayed `RET-001006`, its PKR
150 Card refund, and the correct related invoice. This confirmed a
presentation gap rather than missing return truth.

Sanitized screenshots are retained under:

`/Users/sw12/Projects/saledock-local-evidence/customer-ledger-presentation-fix/screenshots`

No production mutation occurred.

## Root cause

Two independent presentation causes were established.

### Invoice route

`listCustomerLedger` selected the ledger row ID and joined the invoice number,
but did not expose `customer_ledger_entries.invoice_id`. The customer page
therefore built the invoice href from the ledger-entry ID.

Classification:

`OUTCOME A - WRONG INVOICE ROUTE ID`

### Return history

The customer page read the debt ledger but had no customer returns source. The
existing return RPC creates a customer `refund` credit only when a return
reduces outstanding customer debt.

For a fully paid Card invoice, customer debt is already zero. Paying out the
refund does not reduce customer debt, so omitting a debt-ledger credit is
correct. The completed return remains authoritative in `returns`, but the
customer page did not present it.

Classification:

`OUTCOME B - FULLY PAID RETURN CORRECTLY HAS NO DEBT-LEDGER ENTRY`

No customer return accounting P1, duplicate balance source, tenant defect, or
permission defect was found.

## Local baseline

A production build used loopback Supabase values supplied in memory from
`supabase status --output json`. No `.env.local` or secret evidence file was
created. The browser used `Asia/Karachi`, fresh contexts, marker-owned
synthetic fixtures, and zero automatic retries.

Baseline marker `QA-LEDGER-BB8DEF42` reproduced both defects:

- the invoice label used `/invoices/<ledger-entry-id>` and did not open the
  invoice;
- the completed fully paid Card return existed in source truth but the
  customer page had no Returns & refunds tab.

The deterministic debt-affecting return retained exactly one legitimate PKR 50
`refund` credit, reducing its running balance from PKR 150 to PKR 100. The
fully paid Card return had no synthetic debt row. A foreign-organization
customer route remained unavailable.

The baseline server's intentional wrong-route navigation produced the expected
not-found response. All disposable fixtures were removed in `finally`, and all
21 safety signatures returned to their opening values.

## Source correction

The correction is limited to read-only customer data and presentation.

`src/lib/data/customers.ts` now:

- carries the real nullable `invoice_id` with each customer ledger row;
- adds a small customer return read model;
- reads returns by exact organization and customer;
- includes real return and invoice IDs and display values;
- sorts returns by descending creation time;
- performs no mutation or RPC.

`src/app/customers/[id]/page.tsx` now:

- builds ledger invoice routes from `invoice_id`;
- emits no invoice link when no relation exists;
- adds one clearly labelled `Returns & refunds` tab;
- links return numbers to `/returns/<return-id>`;
- links invoice numbers to `/invoices/<invoice-id>`;
- shows date, status, subtotal, refund paid, and refund method;
- renders readable desktop and mobile presentations.

The double-entry Ledger remains limited to balance-affecting entries. A
debt-affecting return may appear once as a real ledger credit and once as
return history, with different labels and meanings. A fully paid return
appears only in return history and does not acquire a fabricated balance.

No customer action, settlement form, Credit Payment or write-off RPC, return
RPC, payment allocation, FIFO, stock, Dashboard, Reports, Cash Drawer,
permission, RLS, migration, schema, package, or canonical document changed.

## Post-fix proof

The final focused production-mode run used marker `QA-LEDGER-B7C12FAB`.

It proved:

- the debt-ledger invoice href used the exact invoice ID;
- the invoice route returned HTTP 200 and rendered the expected invoice;
- the Returns & refunds tab rendered both the fully paid Card return and the
  debt-affecting return;
- the return route returned HTTP 200 and rendered the expected return;
- the return's invoice link returned HTTP 200 and rendered the expected
  invoice;
- the ledger contained exactly one PKR 150 debit and one legitimate PKR 50
  refund credit;
- the fully paid Card return created no ledger row;
- the foreign-organization customer remained inaccessible;
- owner and cashier read presentations passed;
- 390 x 844 and 320 x 568 viewports had no page-level horizontal overflow;
- page errors, unexpected console errors, request failures, and unexpected
  HTTP errors were zero.

Two discarded post-fix launches reached correct business and route truth but
reported the disclosed local Supabase Auth navigation-abort console message.
The test listener and zero-error assertion were retained. The harness was
corrected to wait for authenticated network activity before deliberate
navigation, after which the exact-source run passed 1/1 with zero automatic
retries.

## Tests and safety

Focused source contracts cover:

- real invoice ID selection and routing;
- no ledger-ID invoice route;
- organization- and customer-scoped return reads;
- real return and invoice routes;
- no synthetic debt or balance inference;
- preserved refund ledger types, direction, and running balance;
- no customer, settlement, write-off, or return mutation changes.

The focused E2E covers the retained accounting distinction, invoice and return
navigation, read access, tenant isolation, mobile rendering, exact cleanup, and
all 21 required table signatures.

Final local results and the complete regression matrix are recorded in:

`/Users/sw12/Projects/saledock-local-evidence/customer-ledger-presentation-fix/final-report.md`

Generated customers, ledger entries, invoices, payments, returns, return
items, and audits remaining were all zero. Cleanup retries and failures were
0/0. Cash Drawer, stock/FIFO, customer/supplier balances, and unrelated
signatures were unchanged.

## Source delivery

The reviewed source head
`c94390bfbb6286cdadb3f3a5d733c3ef95dd67e8` was delivered through PR #323:

- pull request: `https://github.com/starwalker12/saledock-cloud-pos/pull/323`;
- squash commit: `4b68e379ed5b4e60c9dbbef9e6fe53dd32c90266`;
- squash title: `fix: correct customer ledger references`;
- merge timestamp: `2026-07-29T11:10:44Z`;
- resulting main: `4b68e379ed5b4e60c9dbbef9e6fe53dd32c90266`;
- main CI run: `30446554461`, successful;
- production deployment: `GuqL5ytTPBn93zHrXpxEsotPgX33`, Ready and
  Current for the exact squash commit.

The delivered five-file scope contained only the focused read model,
presentation, regression tests, E2E, and this QA record. It included no
migration, schema, mutation, settlement, accounting, Cash Drawer, package,
workflow, configuration, or canonical-document change.

## Authenticated production verification

Codex Chrome computer use used the authenticated Fardan Aatir Owner session for
Star Shop, Main Branch, PKR, and Asia/Karachi. The verification was strictly
read-only and used retained customer
`0dd1406a-ed51-4ff4-9f30-24a32b2d2ac4`.

Evidence marker `LIVE-CUSTOMER-LEDGER-20260729-1615-C409` was metadata only. It
was not written to production.

### Invoice route

The Ledger tab retained the financially correct entries:

1. one PKR 150 `invoice_credit` debit with balance after PKR 150;
2. one PKR 150 Credit Payment credit with final balance PKR 0.

The rendered `INV-100361` href was:

`/invoices/d78ef3f5-7480-4e40-a330-38ec7791028b`

It did not contain the historical ledger-entry UUID
`432d7aef-7214-41d7-ae05-0d04c228248e`. Opening the link in a separate
authenticated tab rendered the correct retained invoice without a not-found
result.

### Returns and refunds

The Returns & refunds tab rendered one truthful row:

- return: `RET-001006`;
- return route: `/returns/a473366e-6617-468b-981c-668169b2282e`;
- status: completed;
- invoice: `INV-100361`;
- invoice route: `/invoices/d78ef3f5-7480-4e40-a330-38ec7791028b`;
- subtotal: PKR 150;
- refund paid: PKR 150;
- method: Card.

The return route opened the correct return, and the return's invoice route
opened the correct invoice. No duplicate return row appeared.

### Accounting and safety

The customer outstanding balance remained PKR 0. No synthetic fully paid
return debt row was added. Duplicate ledger rows and duplicate return rows
were zero.

Read-only before/after checks confirmed unchanged invoice, return, payment,
Customer Dues, Net Cash, Cash Drawer, stock/FIFO, supplier dues, and open-shift
truth. Cash-shift, customer-ledger, return, invoice, product, and FIFO
signatures matched before and after browser navigation. Production mutations
were zero.

### Mobile presentation

At both 390 x 844 and 320 x 568:

- the Returns & refunds tab was reachable;
- the return card, status, amount, and Card method were readable;
- the exact return and invoice links were visible;
- the Ledger invoice link remained reachable;
- page-level horizontal overflow was absent;
- hidden desktop rows did not appear alongside the mobile cards.

### Evidence

Sanitized evidence is retained at:

`/Users/sw12/Projects/saledock-local-evidence/customer-ledger-presentation-live-verification`

The 14-entry evidence manifest has SHA-256:

`85e4dbacd4f9fd9f6b753c655d45d0035e7db22c6cee7c9747f7bdb4fd5084ec`

The evidence and screenshots contain no credentials, cookies, tokens, keys,
authorization headers, browser-profile data, private customer contact values,
or unrelated customer records.

## Live result

`PASS - LIVE-CUSTOMER-LEDGER-001 FIXED`

The active P2 register reduces from seven to six. The remaining P2 findings
are:

1. `LIVE-REPAIR-OPTIONAL-001`;
2. `LIVE-INVOICE-FILTER-001`;
3. `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`;
4. customer-settlement client completion;
5. supplier-payment client settlement;
6. limited cashier coverage.

The five P3 observations remain unchanged. Customer settlement was not fixed,
canonical synchronization remains deferred, SaleDock is not audit-ready, and
SaleDock is not MVP-live.

## Rollback

Source rollback is:

`git revert 4b68e379ed5b4e60c9dbbef9e6fe53dd32c90266 && git push origin main`

Rollback does not require a migration or schema reversal. Production
financial history, canonical state, settlement behavior, and Cash Drawer
remain unchanged by the source or documentation delivery.
