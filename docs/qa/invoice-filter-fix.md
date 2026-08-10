# Invoice List Filter Fix

## Finding and status

- Finding: `LIVE-INVOICE-FILTER-001`.
- Canonical baseline: `ecf3fd92a1cfa2aaab3c3633259ca5c359c76e41`.
- Current classification: `FINISHING ACCEPTED WITH LIMITED COVERAGE`.
- Source delivery and authenticated production acceptance are complete. Severity is P0 0, P1 0, P2 4, and P3 5.
- `LIVE-INVOICE-FILTER-001` is closed. Canonical documents remain stale at P2 5 until a separately authorized synchronization.
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

Focused contracts: 8/8 passed, including behavioral evidence-root isolation. The accepted replacement-evidence E2E passed 1/1 with zero automatic retries. Cleanup retries/failures: 0/0. All 21 before/after safety signatures were equal. Marker invoices, payments, and customers remaining: 0/0/0.

The previously reviewed targeted affected Node group passed 125/125. At the incident-correction head, the invoice-filter contracts passed 8/8 and the complete Node suite passed 322/322 with zero failures and zero skips after the complete loopback Supabase environment was supplied in memory. An earlier 319/321 launch was discarded because the two opening-stock-lot tests were started without the required local Supabase environment; both passed in the environment-correct complete run. A later 317/317 selection was also discarded because it omitted the four contracts under `tests/unit`; the corrected complete selection is the 322/322 result above.

Affected browser coverage included passing invoice detail/print and customer-ledger presentation checks, plus a clean 1/1 return-profit rerun after one discarded local Auth-fetch launch. The legacy POS invoice/return/report file produced one passing navigation case and two pre-existing strict-locator failures before sale submission: `Clear` matched both a product action and the Clear button, and `Gross sales` matched four report elements. No sale or financial mutation occurred in those failed cases. The new focused E2E independently covers invoice filtering, detail navigation, payment presentation, tenant isolation, responsive rendering, and cleanup.

Final static validation passed with lint at zero errors and two pre-existing `privacy-center.tsx` hook-dependency warnings, typecheck passed, and the Next 16.2.6 production build completed successfully. `git diff --check`, exact file scope, package/migration/workflow exclusion, secret scanning, evidence-manifest verification, and protected-state comparison also passed at the exact reviewed head before delivery.

Discarded harness launches were not represented as clean first-pass results. They covered: an initial loading-state count, empty native-select interaction timeout, visibility-locator misuse, two fixture expectations that ignored the intentional final 100-row cap, native-select accessibility/actionability deadlocks, keyboard-select incompatibility, two strict detail-locator ambiguities, a mobile accessibility-locator issue, and a context-close fetch warning. Each launch used zero automatic retries and cleanup left zero marker rows before the next launch. The accepted run excludes only deliberate context-close diagnostics after all workflow assertions.

Warnings were limited to Playwright's `NO_COLOR`/`FORCE_COLOR` notice and the local Supabase CLI update notice. An initial build using a cross-project `node_modules` symlink was discarded after Turbopack rejected the external path; the worktree then used a local copy-on-write dependency clone without installing or changing package files.

## Financial and tenant safety

Filtering issued no business write. After marker cleanup, signatures matched for invoices, invoice items, payments, returns, return items, customers, customer ledger entries, credit payments, customer write-offs, shifts, daily closings, products, FIFO lots, stock movements, suppliers, purchases, supplier payments, audits, organizations, branches, and profiles.

Cash Drawer, stock/FIFO, customer balances, and supplier balances had zero effect. A synthetic foreign organization, branch, customer, invoice, and Card payment were not visible to the authenticated organization under any tested filter.

## Evidence

- Historical original path: `/Users/sw12/Projects/saledock-local-evidence/invoice-filter-fix`
- Historical original seal: `6f9a1b0f58ea73185fc62bf6eaacd729231480840c6cbc49e710067fd3c34695`
- Frozen post-incident seal: `9a934e0ed2ce327caf798184ce4751750f8e92a218c5286021e4b106760db5fc`
- Fresh replacement path: `/Users/sw12/Projects/saledock-local-evidence/invoice-filter-fix-replacement-2026-08-10`
- Fresh replacement manifest: `11e2f3d6a681993794325f77ddcc28193038aa16f3b415acfc4975230eda4ba8`
- Replacement manifest entries: 18, all verified.
- Screenshots: desktop 1440x900, mobile 390x844, and mobile 320x568.
- Secret/privacy scan: no credentials, cookies, tokens, keys, authorization headers, or production customer data retained.

## Evidence protection incident

During the owner-authorized delivery confirmation, an ordinary focused E2E rerun unintentionally rewrote the previously sealed evidence directory. The original retained seal was `6f9a1b0f58ea73185fc62bf6eaacd729231480840c6cbc49e710067fd3c34695`; after the overwrite, the internally valid 18-entry directory sealed at `9a934e0ed2ce327caf798184ce4751750f8e92a218c5286021e4b106760db5fc`. No exact backup was found, no reconstruction was attempted, and delivery stopped before the PR was marked ready or merged.

The root cause was the focused E2E's hardcoded mutable evidence path. The harness now accepts `INVOICE_FILTER_EVIDENCE_ROOT`; an explicit path must not exist and is created exactly once, while an omitted variable creates a unique operating-system temporary directory. A pre-existing explicit target fails before local database access, fixture creation, screenshots, JSON, or manifest writes with `Refusing to overwrite existing invoice-filter evidence directory: <path>`. The test never cleans or reuses an evidence directory.

The old directory is frozen in its post-incident state. It is internally consistent but superseded for delivery evidence and is not represented as the original byte state. The fresh replacement directory did not exist before its single accepted run. That run passed 1/1 with zero retries, produced 18 verified entries and three screenshots, cleaned marker invoices/payments/customers to 0/0/0, and preserved all 21 safety signatures. Its manifest is `11e2f3d6a681993794325f77ddcc28193038aa16f3b415acfc4975230eda4ba8`.

A deliberate second invocation against the sealed replacement path failed at the pre-write guard. Its manifest hash was `11e2f3d6a681993794325f77ddcc28193038aa16f3b415acfc4975230eda4ba8` before and after the probe, and the complete tree fingerprint was also identical before and after. No fixture was created by the probe. Product source remained byte-for-byte unchanged from reviewed head `5e8b9f5484bd31de00ed2418a7acd95a0ea88d5d`, and production was not accessed or mutated.

## Source delivery

Owner review accepted exact head `cebc5ca0c20ff7d290c24b19402302ce5f8a86d3`. PR #336 was marked ready at `2026-08-10T21:26:39Z` and squash-merged at `2026-08-10T21:29:14Z` as `87be9a87557ac2e9a5aa97ad0cae69b7a4eb085e` with title `fix: add invoice list filters`.

Main CI run `31434072779` passed. Vercel production deployment `dpl_DMGEGYrh8TqpXY3j1iVoEca7wNsp` was Ready, current for the exact source squash, and serving `saledock.site` before production acceptance began. The source delivery contained no migration or schema change.

## Authenticated production verification

The read-only verification used Codex Chrome with the authenticated Fardan Aatir Owner session for Star Shop, Main Branch, PKR, and Asia/Karachi. No SaleDock business write was authorized or performed.

Production held 263 organization-owned invoices. Exact and lowercase invoice-number search found existing invoice `GZ-0138`, ranked 101 and therefore outside the default newest 100. This proved filter constraints are applied before the branch limit. Search returned one target and excluded unrelated latest invoices. Customer-name search passed with an existing retained synthetic QA customer, returned exactly `INV-100364` and `INV-100363`, and persisted no ordinary private customer name.

Using the target's 26 July 2026 Karachi date, From-only returned 82 visible invoices; To-only correctly returned the bounded newest 100 of 191 database matches; and the same-day range returned 10. The target remained visible in all three cases. The Paid filter returned the bounded 100 and every visible status reconciled. The Card filter returned seven invoices, including `INV-100363`, and every result reconciled to an organization-owned durable `payments.method = card` row. Customer Credit remained absent from the choices. Production had no existing multi-payment invoice, so the accepted local deduplication contract remains authoritative for that case.

The combined `INV-100363` + same-day + Card + Paid intersection returned exactly one invoice. Sorting by invoice number retained `q`, `from`, `to`, `payment`, and `status` together with `sort=invoice_no&dir=asc`. Reset returned to `/invoices`, cleared Search and both dates, selected All payment methods and All statuses, and restored the bounded newest-first 100 rows.

The impossible search rendered `No invoices match these filters` with Reset. Invalid 29 February 2026, reversed dates, invalid status, and invalid payment each returned the approved safe inline message, rendered no broad invoice table, and caused no server crash. View from the filtered target preserved invoice `INV-100363`, one item, one Card payment, PKR 150 total, PKR 150 paid, and PKR 0 due. Print was not invoked, and `LIVE-INVOICE-THERMAL-BLANK-PAGE-001` remains open.

At 390x844 and 320x568, Search, From, To, Payment Method, Status, Apply Filters, Reset, the result card, and View were reachable. Document width equalled viewport width at both sizes, with no page-level horizontal overflow. Browser error logs were empty.

Opening and closing hashes matched exactly for invoices, invoice items, payments, returns, customers, customer ledger entries, credit payments, write-offs, cash shifts, products, FIFO lots, stock movements, and supplier payments. Business mutation count was zero. Customer balances, supplier balances, Cash Drawer, stock/FIFO, returns, settlements, and tenant scope were unchanged.

Production evidence is sealed at `/Users/sw12/Projects/saledock-local-evidence/invoice-filter-live-verification`. Its 22-entry manifest SHA-256 is `337c629b8e08e71856f73bbc9e038e74a5a75db5f2cc4e06a2b5172b5df9270d`, with three reviewed screenshots and a clean privacy/secret scan. The frozen post-incident source evidence still verifies at `9a934e0ed2ce327caf798184ce4751750f8e92a218c5286021e4b106760db5fc`; accepted replacement evidence still verifies at `11e2f3d6a681993794325f77ddcc28193038aa16f3b415acfc4975230eda4ba8`. The lost historical original seal was not reconstructed.

Result: `PASS — LIVE-INVOICE-FILTER-001 FIXED`. P0 remains 0, P1 remains 0, P2 reduces from 5 to 4, and P3 remains 5. The remaining P2 findings are `LIVE-INVOICE-THERMAL-BLANK-PAGE-001`, customer-settlement client completion, supplier-payment client settlement, and limited cashier coverage. Finishing remains accepted with limited coverage. Audit-ready remains no, MVP-live remains no, and canonical synchronization is deferred to a separate owner-authorized task.

## Rollback

Revert source delivery with `git revert 87be9a87557ac2e9a5aa97ad0cae69b7a4eb085e && git push origin main`. Revert the focused live-documentation squash separately after its SHA is known. Do not reconstruct the historical original evidence; preserve the frozen incident evidence and accepted replacement evidence. No migration, schema rollback, or production data repair is required because production acceptance was read-only.
