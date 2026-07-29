# Customer ledger reference and return presentation correction

## Status

`LIVE-CUSTOMER-LEDGER-001` is corrected only on the draft branch
`fix/customer-ledger-presentation`.

Production remains unchanged. Customer financial source truth was not changed,
and no debt-ledger entry was fabricated for a fully paid return. Customer
settlement client completion is not fixed. Customer lifecycle auditing remains
fixed. Canonical documents remain unchanged.

SaleDock remains `FINISHING ACCEPTED WITH LIMITED COVERAGE`, remains below
audit-ready, and is not MVP-live. The active register remains P0 0, P1 0, P2 7,
and P3 5 until a separately authorized production delivery and canonical
synchronization close this finding.

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

## Read-only production confirmation

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

## Delivery plan

The focused branch may be committed and published only as a draft pull
request. The draft must remain unmerged and not ready for review until owner
delivery authorization.

After a separately authorized successful production delivery,
`LIVE-CUSTOMER-LEDGER-001` may close and the active P2 register may reduce from
seven to six. The five P3 observations remain unchanged.

## Rollback

Before merge, rollback is to close the draft pull request and delete the
isolated branch/worktree after evidence is retained.

After a later authorized squash merge, rollback is:

`git revert <customer-ledger-presentation-squash-sha> && git push origin main`

Rollback does not require a migration or schema reversal. Production
financial history, canonical state, settlement behavior, and Cash Drawer
remain unchanged by this draft investigation.
