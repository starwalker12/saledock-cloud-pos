# Shop currency selector

## Scope

Organization base-currency selection and presentation, not FX or multi-currency accounting.
Starting main: `7bf265e7538996cc6e61682495c7e66f3cf77a52`.
Existing `organizations.currency_code` remains the only stored currency identity.
The ten new-selection currencies all use the existing two-decimal money boundary:

| Code | Name | Display symbol |
| --- | --- | --- |
| PKR | Pakistani Rupee | ₨ |
| INR | Indian Rupee | ₹ |
| USD | US Dollar | $ |
| GBP | British Pound | £ |
| EUR | Euro | € |
| AUD | Australian Dollar | A$ |
| CAD | Canadian Dollar | C$ |
| AED | UAE Dirham | Preferred U+20C3 UAE DIRHAM SIGN; portable display AED |
| SAR | Saudi Riyal | Preferred U+20C1 SAUDI RIYAL SIGN; portable display SAR |
| QAR | Qatari Riyal | QAR |

`src/lib/currency.ts` supplies Settings, onboarding, location defaults and display symbols.
Unknown existing codes remain unchanged and display as `CODE amount`; they are not offered as
new selections. Existing onboarding offered KWD and OMR despite three-decimal currency needs.
KWD/JOD/BHD/OMR and other three-decimal currencies are deferred to a separate precision design.

## Financial-history boundary

A UI-only check or a one-time `EXISTS` query is insufficient: raw API updates and a concurrent
first posting could otherwise relabel history. The single forward migration adds monotonic
`organizations.currency_locked_at` safety metadata, one private organization guard and private
statement-level first-activity triggers. It does not add another currency column or change any
financial RPC, precision, RLS policy, existing table privilege, or business formula.

The following 21 relations lock on any posted row, including zero-valued records:

- invoices, invoice_items, payments, credit_payments, customer_write_offs, customer_ledger_entries
- returns, return_items, return_stock_allocations, invoice_item_stock_allocations
- product_stock_lots, stock_movements
- supplier_purchases, supplier_purchase_items, supplier_payments, supplier_write_offs, supplier_ledger_entries
- expenses, daily_closings, cash_shifts, loss_prevention_events

Six additional relation guards capture material initial/current values:

- customers and suppliers: nonzero outstanding balance
- products: physical stock quantity greater than zero (legacy stock without lot history included)
- repairs: nonzero estimate, advance or final amount
- ledger_private.customer_anchors and supplier_anchors: nonzero anchor balance

Zero-balance accounts, prices/credit limits, categories, staff, draft held bills, staged imports and
zero-financial repair intake do not constitute posted financial activity. Staging cannot lock until
its normal business writes commit. Existing financial facts are inspected at cutover to set only
organization safety metadata. No historical amounts, balances or trust fields are rewritten.

The lock survives later deletion and Factory Reset: these are not currency-conversion authority.
Changing an eligible empty shop updates currency metadata only (plus existing Settings audit,
timestamp and regional preferences); no product prices, invoice/payment economics, stock valuation
or account amounts are converted.

## Authority and races

Existing Settings Action authorization and Owner/Admin organization UPDATE RLS stay intact.
The database denial also applies to authorized Owner/Admin and service-role raw writes. Callers
cannot supply/remove the safety timestamp. A private, non-exposed, fixed-search-path, trigger-only
function has no app-role EXECUTE and can only pin that timestamp, never currency or money.

First financial activity updates the organization row in its own transaction. Currency updates
and first activity therefore serialize on that row. Activity-first denies the change;
currency-first commits the new code before the first posting. A stale REPEATABLE READ attempt
fails serialization. Rollback rolls back the timestamp too. Once locked, later statements do not
rewrite the organization row, avoiding an ongoing hot organization lock.

Migration installation takes NOWAIT cutover locks; a busy cutover aborts, never weakens its lock set.
Apply the reviewed migration before delivering application code that reads the metadata. This task
does not apply anything to production. The migration file is
`20261010221542_lock_shop_currency_after_financial_activity.sql`.

## Display and UI

Settings uses AppSelect with name/code/symbol, a controlled saved selection, ordinary dirty/save
handling and the history-lock explanation. Onboarding uses the same options and compatible timezone
defaults. Supported symbol prefixes replace ISO prefixes without changing the existing finite-value
fallback, en-PK grouping or 0-to-2 display decimal behavior. The registry preserves the exact
official AED/SAR signs using Unicode escapes; it does not substitute letters or the generic Rial
sign. Existing screen, selector, invoice, print/PDF, thermal and shared-image surfaces use device
fonts rather than a controlled currency font. They therefore use deterministic AED/SAR ISO
fallbacks on every device, even when that device happens to render one of the new signs. QAR
intentionally uses its ISO code. Selector labels omit a redundant parenthesized code.

No runtime canvas/font detection, hydration-dependent marker switch, remote font or font asset
is introduced. Local Chromium rendered SAR U+20C1 but AED U+20C3 matched the missing-glyph control;
that diagnostic is evidence, not a detection algorithm shipped to users. Official signs can be
enabled on a future surface only when its complete screen/print/image font pipeline is guaranteed.
Arabic-script-specific regexes and direction controls are removed from the formatter. Monetary
invoice cells still stay on one line across shared-image capture; nonfinancial details retain
wrapping. This affects presentation only, never stored currency or money.

Dashboard activity, search results, daily closing, POS cost warnings, supplier form limits and new
audit display text now use the shared formatter. Currency-specific PKR input labels are removed.
Existing invoice/A4/thermal/image, return, repair, report, customer and supplier views already use
the shared formatter. Anonymous marketing sample figures and old QA history remain illustrative
PKR examples, not shop financial values. ISO labels in structured purchase exports remain explicit
currency identity. No existing audit text is rewritten.

## Qualification

- Registry/symbol/fallback/timezone and actual Settings/onboarding Action validation contracts.
- Isolated local SQL and authenticated/API empty-shop, active-shop, lock-tamper and race tests.
- Pre-cutover legacy KWD/history metadata backfill and unchanged function/ACL/RLS/business snapshots.
- Existing POS permission/FIFO, decimal-money, trusted ledger, posted source and importer suites.
- Production-mode Chromium desktop and 390px light/dark Settings, all ten currency markers,
  AED/SAR/QAR invoice/A4/thermal/shared-image artifacts; automatic retries zero.
- Complete Node, lint, typecheck, production build, diff check, local DB lint and error-level advisors.

Independent synthetic local evidence: `shop-currency-selector` under the owner's local evidence root.
Presentation refinement evidence: `shop-currency-symbol-refinement`; the original seal is unchanged.
No production access, historical conversion, money formula change, Return Math, Exchange or
Invoice Correction. Draft review only; no merge or deployment.
