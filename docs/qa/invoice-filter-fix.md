# Invoice List Filter Fix

## Finding and status

- Finding: `LIVE-INVOICE-FILTER-001`.
- Canonical baseline: `ecf3fd92a1cfa2aaab3c3633259ca5c359c76e41`.
- Current classification: `FINISHING ACCEPTED WITH LIMITED COVERAGE`.
- Severity remains P0 0, P1 0, P2 5, and P3 5 during draft review.
- `LIVE-INVOICE-FILTER-001` is corrected only on the draft branch. Production and canonical documents are unchanged.
- Audit-ready: no. MVP-live: no.

## Baseline

The production-mode local baseline rendered the bounded Invoice List and its existing sortable desktop table, mobile cards, New sale link, and View links. It had no complete Search, From Date, To Date, Payment Method, Status, Apply Filters, or Reset controls.

`listInvoices(organizationId, limit = 100)` always selected the authenticated organization's newest 100 invoices before any filtering. It accepted no filter contract and did not resolve payment rows. This made any later client-side filter incomplete for matches outside the newest 100.

The read-only baseline was reproduced with an authenticated local owner on `/invoices`. No production system was accessed or mutated.

## Payment persistence model

The POS vocabulary is Cash, Card, Easypaisa, JazzCash, Bank Transfer, and Customer Credit. Durable checkout behavior is Payment Outcome B:

- Cash, Card, Easypaisa, JazzCash, and Bank Transfer can be represented by `payments.method` rows.
- Customer Credit requires zero amount paid and creates invoice debt/customer-ledger truth without a `payments` row.
- Later `credit_payments` are customer-level settlements and do not durably attribute an invoice checkout method.
- Multiple payment rows can belong to one invoice.

The Payment Method filter therefore means: any organization-owned `payments` row for the invoice uses the selected recorded method. Customer Credit is intentionally not offered because doing so would infer a method that is not durably recorded on the invoice.

## Root cause

Three source boundaries caused the missing behavior:

1. The Invoice page parsed only `sort` and `dir` and rendered no filter form.
2. `listInvoices` had no filter arguments and applied an unconditional newest-100 limit.
3. Invoice-list data did not reconcile recorded payment methods.

The E2E also found a new-form reconciliation issue during implementation: Reset changed the URL and result set, but uncontrolled selects retained their prior DOM values when React reused the form. Keying the GET form by the parsed filter/sort state makes Reset remount controls from the cleared server parameters.

## Correction

The page now accepts `q`, `from`, `to`, `payment`, `status`, `sort`, and `dir`. It renders a compact labelled GET form, Apply Filters, Reset, a safe inline validation error, and a distinct filtered-empty state.

Search trims outer whitespace and performs case-insensitive literal-contains matching against invoice number or customer name. Wildcards are escaped, no raw PostgREST `.or(...)` expression is built from input, and the two parameterized search branches are organization-scoped, unioned, deduplicated, date-sorted, and capped.

Dates must be real `YYYY-MM-DD` values. From uses the start of the Asia/Karachi day, To uses the end, both are inclusive, and a reversed range returns `From date cannot be after To date.` without issuing a misleading broad query.

Statuses are exact: Draft, Paid, Partial, Unpaid, and Void. Unknown status/payment values fail closed with an inline error. Active groups intersect with AND semantics; invoice-number/customer-name search uses OR semantics; any matching payment row qualifies the parent invoice once.

Every query path applies `organization_id`, date, status, recorded-payment, and search constraints before its branch limit. Search is correct beyond the default newest 100. Payment joins are inner and organization-scoped. The final list remains bounded at 100 and preserves newest-first default behavior.

Sortable headers receive the sanitized active filter parameters and retain them while changing `sort` and `dir`. Reset navigates to `/invoices`, remounts the keyed form with blank/All controls, and restores the default bounded newest-first list.

## Scope and impact

Changed product source is limited to:

- `src/app/invoices/page.tsx`
- `src/lib/data/invoices.ts`

The change is read-only. It does not alter invoice totals, payment amounts, `amount_paid`, `balance_due`, customer ledger, returns, settlements, Dashboard, Reports, Net Cash, Cash Drawer, stock/FIFO, status mutations, permissions, RLS, schema, or migrations.

Invoice detail and payment display passed from a filtered View link without source changes. The existing true-empty `No invoices yet` behavior remains; filtered no-match results show `No invoices match these filters` and Reset.

`LIVE-INVOICE-THERMAL-BLANK-PAGE-001` remains open. No thermal/A4 print source or behavior was changed or claimed fixed. Customer-settlement, supplier-payment settlement, and limited cashier coverage remain open P2 items.

## Local production-mode proof

The final loopback-Supabase run used a fresh Next production build, a UTC server process, an Asia/Karachi browser context, one local owner session per context, marker-owned fixtures, and zero Playwright automatic retries.

Passed proof:

- exact, partial/case-varied, customer-name, whitespace, and punctuation search;
- a target outside the default newest 100;
- From-only, To-only, same-day, multi-day, and PKT boundary behavior;
- Paid, Partial, and Unpaid status behavior;
- Cash and Card recorded-payment behavior;
- one multi-payment invoice matching either method and appearing once;
- five-way combined filter intersection;
- sort-parameter preservation;
- Reset URL, controls, bounded list, and newest-first restoration;
- filtered-empty state;
- foreign organization invoice/customer/payment exclusion;
- invoice detail, totals, customer, and payment display;
- desktop 1440x900, mobile 390x844, and mobile 320x568;
- no page-level horizontal overflow;
- zero page, workflow-time console, request, or HTTP errors;
- zero production requests or mutations.

Focused contracts: 7/7 passed. Focused E2E: 1/1 passed in 38.1 seconds. Cleanup retries/failures: 0/0. All 21 before/after safety signatures were equal. Marker invoices, payments, and customers remaining: 0/0/0.

The targeted affected Node group passed 125/125. The complete Node suite passed 321/321 with zero failures and zero skips after the complete loopback Supabase environment was supplied in memory. An earlier 319/321 launch was discarded because the two opening-stock-lot tests were started without the required local Supabase environment; both passed in the environment-correct complete run.

Affected browser coverage included passing invoice detail/print and customer-ledger presentation checks, plus a clean 1/1 return-profit rerun after one discarded local Auth-fetch launch. The legacy POS invoice/return/report file produced one passing navigation case and two pre-existing strict-locator failures before sale submission: `Clear` matched both a product action and the Clear button, and `Gross sales` matched four report elements. No sale or financial mutation occurred in those failed cases. The new focused E2E independently covers invoice filtering, detail navigation, payment presentation, tenant isolation, responsive rendering, and cleanup.

Final static validation passed with lint at zero errors and two pre-existing `privacy-center.tsx` hook-dependency warnings, typecheck passed, and the Next 16.2.6 production build completed successfully. `git diff --check`, exact file scope, package/migration/workflow exclusion, secret scanning, evidence-manifest verification, and protected-state comparison are required again at the exact commit head before draft review.

Discarded harness launches were not represented as clean first-pass results. They covered: an initial loading-state count, empty native-select interaction timeout, visibility-locator misuse, two fixture expectations that ignored the intentional final 100-row cap, native-select accessibility/actionability deadlocks, keyboard-select incompatibility, two strict detail-locator ambiguities, a mobile accessibility-locator issue, and a context-close fetch warning. Each launch used zero automatic retries and cleanup left zero marker rows before the next launch. The accepted run excludes only deliberate context-close diagnostics after all workflow assertions.

Warnings were limited to Playwright's `NO_COLOR`/`FORCE_COLOR` notice and the local Supabase CLI update notice. An initial build using a cross-project `node_modules` symlink was discarded after Turbopack rejected the external path; the worktree then used a local copy-on-write dependency clone without installing or changing package files.

## Financial and tenant safety

Filtering issued no business write. After marker cleanup, signatures matched for invoices, invoice items, payments, returns, return items, customers, customer ledger entries, credit payments, customer write-offs, shifts, daily closings, products, FIFO lots, stock movements, suppliers, purchases, supplier payments, audits, organizations, branches, and profiles.

Cash Drawer, stock/FIFO, customer balances, and supplier balances had zero effect. A synthetic foreign organization, branch, customer, invoice, and Card payment were not visible to the authenticated organization under any tested filter.

## Evidence

- Path: `/Users/sw12/Projects/saledock-local-evidence/invoice-filter-fix`
- Manifest: `6f9a1b0f58ea73185fc62bf6eaacd729231480840c6cbc49e710067fd3c34695`
- Manifest entries: 18, all verified.
- Screenshots: desktop 1440x900, mobile 390x844, and mobile 320x568.
- Secret/privacy scan: no credentials, cookies, tokens, keys, authorization headers, or production customer data retained.

## Delivery state

The branch must remain draft for owner review. Production verification, finding closure, P2 reduction, focused live documentation, and canonical synchronization are separate later tasks. Production remains unchanged, and no invoice, payment, return, settlement, or other financial row was mutated there.

## Rollback

Before merge, close the draft PR and delete the isolated branch/worktree if rejected. After a later squash merge, revert only that squash with `git revert <invoice-filter-squash-sha> && git push origin main`. No migration, schema rollback, or production data repair is required.
