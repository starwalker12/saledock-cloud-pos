# Customer Invoice Document Redesign

Task 85041. Local implementation and draft review only. Starting main:
`06341af29e079d62a857a563a4fd176dec8da371`.

## Scope And Truth

The invoice is now a white, customer-facing document with restrained branding,
clear issuer/document identity, a stable five-column items table, compact payments,
and a balanced closing message/location QR. Mobile uses unframed item rows rather
than shrinking the table. Paid invoices emphasize grand total; unpaid/partial
invoices show one prominent balance due in the header, without a duplicate below.

Only presentation changes. Existing invoice queries, permissions, stored amounts,
profit calculations, payment rows, checkout, returns mutations, financial RPCs and
database schema are unchanged. No Service V1 or ledger-trust work is included.

Internal purchase costs, profitability and return management remain available to
their existing roles, but outside `#invoice-print`. Sharing receives an explicit
customer-only projection, never purchase cost/profit. Thermal markup and the
`beginPrint`, `printA4` and `printThermal` lifecycle functions are byte-identical to
starting main, protected by source/AST contracts.

## Deliberate Design Decisions

- Keep the business name visible with or without a configured logo. Square,
  wide and tall logos are contained, not stretched.
- Accept only six-digit hex accent colors; otherwise use the restrained fallback.
  Color appears as a thin rule, never a filled invoice card.
- Retain a deterministic Discount column. Zero discounts use an em dash;
  nonzero discounts retain their stored value. Remove the generic Product label.
- Preserve existing provider/principal/commission/reference snapshots; show
  customer-facing service notes where present. No accounting reinterpretation.
- Render subtotal, discounts, grand total, paid, change and due directly from
  stored values with the existing currency formatter.
- Keep invoice note and configured invoice footer distinct. `receiptTerms` was
  not used on A4 previously and is not silently repurposed.
- Suppress the legacy `Mobile & Accessories Hub` subtitle on this customer
  document only. No branding setting is rewritten; other configured subtitles
  remain visible. A deliberately configured identical phrase is also suppressed.
- Use a 112px QR with its quiet zone and meaningful alt text. Footer/contact
  information no longer consumes a standalone location panel.
- Keep the customer paper white in dark mode. Export the same article: desktop
  edition on desktop and phone edition on mobile. Remove outer margin/shadow
  only on the capture clone, never by changing the live page or theme.
- Reuse the existing body-portaled FormModal for WhatsApp sharing, including its
  focus trap/Escape/scroll behavior. Copy Text and the existing WhatsApp URL remain.

## Visual Review

### Short A4 Page Balance Continuation (Task 41928)

Owner feedback identified accidental whitespace below the closing block on short
A4 invoices. Only this closing composition is refined in the existing draft #372.
The customer document, stored amounts, invoice queries and thermal markup remain
byte-identical to reviewed head `01088670ca0ca01d60112388f6389aa644398265`.

Within an owned A4 print attempt, `beforeprint` and print-media entry measure the
complete natural document after print styles apply. A temporary measuring marker
sets the 186mm A4 content width, then is removed in `finally`. Natural height must
fit within 262mm: the 273mm printable area minus 9mm footer clearance and a 2mm
safety allowance. There is no item-count/status classification.

Only `data-invoice-a4-short="true"` enables a print-only 264mm minimum-height
column with an automatic footer top margin. Its children cannot shrink. Long
documents immediately regain their original natural-width/block layout; no
unconditional page fill, fixed/absolute footer, extra terms or stretched rows.
Owned cleanup removes both markers on afterprint, media exit, cancellation/focus
fallback, exceptions, unmount and the next attempt. Thermal cannot enable them.

Baseline/footer-content clearance for paid/unpaid/partial one-item fixtures was
68.85/53.24/38.42mm. Final Chromium PDFs retain exactly one page and measure
10.11mm below footer content and 14.34mm below the QR image. QR-off/default-footer
clearance is 10.37mm. Accepted PDF bounds are 6-15mm. Custom/default footer, QR
on/off, notes absent/present, one/two payments, custom/no logo, long address,
mobile print and dark application mode are covered. Installed Chrome
154.0.8037.93 also exercises the browser's actual PDF print lifecycle without
synthetic events or prior media emulation.

Before/after screen and mobile document geometry is exact. Download Image remains
natural height. Financial/header word coordinates differ by less than 1pt, with
no content stretching. Long 10/40/80-item fixtures retain exactly 2/4/7 pages,
all items once, repeated table headers, and one final footer. PDF rasters were
visually reviewed: breathing room now sits above the grounded closing block.

Continuation evidence is separate from the original immutable seal:
`/Users/sw12/Projects/saledock-local-evidence/world-class-invoice-redesign-a4-balance`.
The full numbered report, logs, PDF/PNG geometry, privacy scan and independent
`SHA256SUMS` manifest are stored there. No production access, schema/financial RPC
change, merge or deployment is part of this continuation.

Pass 1 reviewed issuer/invoice identity, three-second due scan, all four states,
mobile flow and long pagination. This moved the single due figure upfront and
removed a redundant payment-status row.

Pass 2 reviewed spacing, column alignment, logo sizing, QR/footer balance, long
names/references, large amounts, grayscale contrast, and actual PNG exports.
Quantity received 7% table width, and export outer margin was removed to make
left/right document spacing equal. Final screenshots and PDF rasters were inspected.

## Local Acceptance

Production-mode Next.js 16.2.6, isolated Supabase project `qa85041-pos-print`,
synthetic accounts/invoices only. Playwright automatic retries: **0**.

- Focused Node: **59/59**.
- Complete Node, serial database configuration: **532 passed, 7 opt-in skips,
  0 failures**, out of 539. Importer benchmark/race suites require their separate
  explicit opt-in; the complete-suite skips are not claimed as executed.
- Customer document browser suite: **3/3**. Ten invoice/amount/state variants,
  desktop 1440x900, mobile 390x844, six branding variants, light/dark, PDF geometry,
  image capture, WhatsApp payload/clipboard, focus handling and role privacy.
- Existing A4 white-paper, wording and cookie-print isolation gates pass.
- Invoice thermal reliability/lifecycle passes; shared/Returns/Repairs thermal
  Node contracts remain unchanged.
- Installed native Chrome **154.0.8037.93** passes the exact thermal behavior
  harness through a task-local version adapter: three standard receipts and the
  long receipt each remain one page, short A4 is one page, long A4 is two pages.
  Chrome 151 is not installed, so a native Chrome 151 execution is not claimed;
  the repository's exact-151 guard and source contracts remain intact.
- Returns print/cancellation: **3/3** through a task-local observer adapter.
  No Returns source changes. The adapter waits for login reads, permits only the
  existing workspace coordination RPCs, and classifies aborted fetch/font reads.
  All PDF, lifecycle, no-business-write and protected-data assertions remain.
- Lint: zero errors, two pre-existing privacy-center hook warnings.
- Typecheck, production build and `git diff --check`: pass.

Short invoices/branding variations fit one A4 page. The mixed long fixtures
paginate naturally: 10 items = 2 pages, 40 = 4, 80 = 7. Every item appears once;
totals/footer appear once; no blank trailing page, clipped images/text, overlapping
summary amounts or grey lower region. The QR bitmap decodes and has a quiet zone.

Owner/Admin/Manager PDF and actual image OCR contain no cost sentinel, internal
costs, profitability or return controls. WhatsApp payloads preserve stored amounts,
omit unnecessary zero discount/due lines and use the existing normalized phone URL.
Fixture invoice/item/payment/customer snapshots remain exact before/after capture.

## Harness Notes

Discarded setup/tooling runs are retained, not counted as passes: initial branding
fixture constraint/consent setup, a print quantity-heading geometry defect corrected
before acceptance, local OCR hardware failure (CPU revision used instead), parallel
SQL signature interference, and the legacy cookie fixture's broad local table grants.
Only the disposable QA lease grants were restored from the delivered migration after
the cookie harness's local `GRANT ... ON ALL TABLES`; there is
no migration/source change for that setup correction.

The existing native thermal browser test had assumed a long 20-item A4 invoice
would always fit one page. Its A4 checks now explicitly preserve one-page short
output while verifying natural long pagination, exact-once item coverage and page
geometry. PDF item/identity columns are extracted independently to avoid wrapping
interleaving with adjacent numeric columns. Thermal one-page assertions are not
weakened. Its write observer recognizes only established workspace coordination
RPCs; business-write detection remains enforced.

The existing Invoice thermal reliability setup now awaits login network-idle before
moving to the fixture, so a pending auth read is not aborted by the test itself.
Its strict console/network/print assertions remain unchanged. Cookie-banner
isolation runs with undecided consent; lifecycle runs with rejected consent. These
are distinct task-local seeded UI preconditions, not production preference changes.

## Evidence And Limits

Evidence: `/Users/sw12/Projects/saledock-local-evidence/world-class-invoice-redesign`.
The independent `SHA256SUMS` digest is recorded in the final report/PR after sealing.
Before/after screenshots, PDFs/rasters, PNG/OCR, WhatsApp text, fixture signatures,
exact diff, test logs, visual critique, cleanup and worktree/seal preservation are
retained there. Privacy scan precedes sealing.

No production access or mutations. No merge or deployment. No database/schema/RLS,
accounting, Service V1 or ledger-trust changes. Existing worktrees and prior evidence
are preserved; only task-owned local seed/fixture data and generated traces are
removed during cleanup.
