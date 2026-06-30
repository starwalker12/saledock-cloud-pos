# MVP Part 1 Automated Safety QA

Date: 2026-06-30

Production main baseline: `860a13941a3d7824d16a5ed5beba5e474753fb6e`

Branch: `qa/mvp-part-1-physical-held-bills-and-role-tests`

## Scope

This review-first change adds local-only safety coverage before the Part 2 manual MVP checklist. Testing used the disposable local Supabase stack at `127.0.0.1`; production data, migrations, credentials, and URLs were not used.

## Local QA roles

The idempotent local setup script now creates or updates one fake user for every existing SaleDock role and links each profile to the seeded Gadget Zone organization and branch:

| Role | Local-only email |
| --- | --- |
| Owner | `owner@saledock.local` |
| Admin | `admin@saledock.local` |
| Manager | `manager@saledock.local` |
| Cashier | `cashier@saledock.local` |
| Technician | `technician@saledock.local` |

All accounts use the documented fake local password. The script refuses non-local Supabase URLs, does not enable signup, and no longer prints local Supabase keys. A second run updated all five users without creating duplicates.

## Automated coverage added

### Physical-product held bills

The Playwright flow uses the seeded `iPhone 15 Pro Max Clear Case`, which starts with 20 units in both the product row and FIFO lots.

- Customer A product bill was held with no invoice and no stock/FIFO change.
- Customer B checked out first and received `INV-000003`.
- Customer A resumed with the same product, quantity, and price, then received `INV-000004`.
- Product stock and FIFO lot quantity both moved 20 -> 19 -> 18 only during the two final checkouts.
- Each invoice had exactly one invoice item and one payment row.
- The held row became `completed`, linked to Customer A's invoice, and disappeared from the active Held Bills drawer.
- The cart was empty after final checkout, with no duplicate invoice or duplicate stock deduction.

The earlier service held-bill test was also adjusted to keep Customer A held until Customer B checks out. It no longer creates a second held lifecycle by resuming and re-holding the same cart.

### Authentication smoke

- Logged-out `/dashboard` and `/pos` redirect to login.
- Owner and cashier browser login pass.
- Owner session survives refresh.
- Logout ends the session and protected navigation returns to login.
- Wrong credentials show only `Invalid email or password.`; no raw Supabase or backend error is rendered.

### Role authorization smoke

The route matrix reflects the existing permission code; no permissions were changed.

| Role | Dashboard | POS | Products | Users | Settings |
| --- | --- | --- | --- | --- | --- |
| Owner | Allowed | Allowed | Read/write | Manage | Editable |
| Admin | Allowed | Allowed | Read/write | Manage | Editable |
| Manager | Allowed | Allowed | Read/write | Restricted message | Read-only |
| Cashier | Allowed | Allowed | Read-only | Restricted message | Read-only |
| Technician | Allowed | Redirects to dashboard | Read-only | Restricted message | Read-only |

Restricted Users pages did not expose the staff invitation form or seeded owner email.

## Commands and results

- `npm run lint`: pass, 0 errors; 2 known Privacy Center hook warnings.
- `npm run typecheck`: pass.
- `npm run build`: pass on Next.js 16.2.6.
- `git diff --check`: clean.
- `node --env-file=.env.local --test tests/seed-stock-lots.test.mjs tests/pos-held-bills.test.mjs tests/catalog-validation.test.mjs tests/karachi-business-day.test.mjs`: 26 tests passed.
- Physical and existing held-bill Playwright suite: 2 passed.
- New local auth and five-role Playwright suite: 9 passed.
- Existing cookie/sidebar regression plus core navigation smoke: 3 passed.
- Local QA setup idempotency rerun: pass; five users updated, no duplicates created.

## Cross-organization status

Automated second-organization isolation was deferred to Part 2. It requires a separate tenant fixture and read assertions across products, customers, invoices, held bills, users, and reports. Keeping it separate avoids making this test-only PR difficult to review and avoids accidentally encoding incomplete tenant assumptions.

## Part 2 gaps

- Run the controlled manual MVP checklist across major shop workflows and responsive layouts.
- Add a dedicated disposable second-organization isolation suite.
- Manually verify production-domain reCAPTCHA, Google OAuth, email OTP, and invite email delivery.
- Exercise detailed role-specific mutations only with clearly marked QA records.
- Keep factory reset, import/restore, and all destructive production actions out of automated pilot QA.

## Recommendation

READY FOR PART 2 MANUAL MVP QA

The Part 1 local safety suite passes. No checkout formula, invoice numbering, stock/FIFO logic, customer balance, cash drawer, report, authentication rule, RLS policy, or production data was changed.
