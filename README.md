# SaleDock Cloud POS

SaleDock is a multi-tenant cloud POS platform. It is inspired by the existing
desktop Gadget Zone POS, but is a separate codebase and repository.

This project does not modify the desktop POS app, the Vercel download website, or any released portable app folders.

## Current Status

SaleDock is a working cloud POS with the following modules live:

- **Next.js 16** App Router app with TypeScript (uses `proxy.ts`, the renamed `middleware.ts`)
- **Tailwind CSS** UI with sidebar/topbar app shell, dark/light/system theme modes
- **Supabase** client (browser), server, and admin (service-role) helpers
- **Authentication**: email/password signup + Google OAuth via Supabase Auth. Self-service signup is currently **closed** — the first owner exists and invites staff via the Users page.
- **Onboarding**: multi-step shop setup at `/onboarding` — creates organization, branch, owner profile, and app settings
- **Dashboard**: 8-stat-card overview with today profit, gross sales, returns, expenses, low-stock count, pending repairs, supplier dues, customer dues, plus weekly/monthly sales charts, top-selling products table, and recent activity feed
- **POS Checkout**: server-validated atomic checkout via `pos_checkout` Postgres function — browser cart values are hints only; totals are recomputed server-side inside a single transaction that also decrements stock
- **FIFO Stock Tracking**: inventory tracked by stock lots with FIFO lot allocation on sale, weighted-average cost calculation per line item
- **Products & Categories**: full CRUD with reactive filtering, pagination, stock adjustment logs, service product configuration (provider/account/reference flags, commission amounts)
- **Customers & Supplier Purchases**: customer ledger and credit tracking, supplier purchases with payment tracking and ledger entries
- **Returns & Refunds**: tracked return receipts with inventory restock policies, partial returns and refunds (cancellation, exchanges, and return receipts remain future milestones)
- **Repairs Management**: full status progression board with payment tracking, problem description, and tracking numbers
- **Expenses**: daily expense tracking with category breakdowns
- **Daily Closing & Cash Shifts**: end-of-day reconciliation with expected vs counted cash difference logging; intra-day shift system (open/close) for cashier handovers
- **Reports**: sales by day, profit summary (service commission only — never the principal), by-supplier purchases, service transaction breakdown by provider/direction, loss prevention section tracking below-cost override sales
- **Audit Log**: scoped, searchable actor log tracking checkout, inventory adjustments, and seeding
- **Global Quick Search**: permission-aware unified search across all entities
- **Loss Prevention**: below-cost sale blocking enforced at checkout (both line-item and whole-bill discounts), product-save guard, owner/admin-only override with required reason, logged to `loss_prevention_events` table via trigger
- **Service Transactions**: service principal (pass-through) vs commission (shop income) split captured per line; commission is the only profit contribution, principal is never counted as profit
- **Demo Seeder**: owner/admin seeder inside Settings with double-confirmation typing
- **Database Backups & Factory Reset**: ZIP backup download/upload with manifest, JSON/CSV exports; full cascading RLS-scoped factory reset
- **Inventory Replenishment Center**: `/purchases/replenishment` — scans low-stock products, groups suggestions by supplier with estimated costs (using purchase price, not sale price), links to create purchase orders; permission-gated to owner/admin/manager
- **Print & Share**: invoices, repairs, returns, and daily closing support A4 browser print, 80mm receipt view, and WhatsApp Web share links (direct ESC/POS hardware printing is a future milestone)
- **Settings**: business profile, branch profile, invoice/receipt branding, print notes, currency, timezone, security checklist, theme customization (primary/accent color, default theme)
- **User Management**: staff invites, role assignment (owner/admin/manager/cashier/technician), activation controls, last-owner/admin safety checks
- **Platform Admin**: `/platform` developer console for tenant monitoring and platform-wide settings
- **Privacy**: privacy center, data deletion requests, connected accounts management
- **CI**: GitHub Actions workflow runs lint, typecheck, and build on every push to `main` and on pull requests

**Still planned / deferred:**
- Direct ESC/POS hardware printing
- Desktop SQLite data import (backup ZIP preview is live, imports remain disabled)
- File upload for logos/avatars (URL fields used currently)
- Cancellation, exchanges, and dedicated return receipts

## Tech Stack

- Next.js 16
- TypeScript
- Tailwind CSS
- Supabase Auth and Postgres
- Vercel
- npm

## Local Setup

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Environment Variables

Copy `.env.example` to `.env.local` when Supabase credentials are available.

Required values:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_NAME=Gadget Zone Online POS
```

Important:

- `.env.local` must never be committed.
- `SUPABASE_SERVICE_ROLE_KEY` must only be used on the server.
- Browser code must only use `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `PLATFORM_ADMIN_EMAILS` — comma-separated list of emails that can access `/platform` (fallback if `platform_admins` table empty).

## Production

- **Canonical site:** https://saledock.site (also reachable at https://saledock-cloud-pos.vercel.app)
- **Supabase auth callback:** `https://saledock-cloud-pos.vercel.app/auth/callback`
- **Smoke-test URL:** `https://gadget-zone-online-pos.vercel.app` (used by `scripts/qa-smoke.mjs`, not the main site)
- First owner exists. Public registration is now **closed** — see `docs/auth-onboarding.md`.

## Offline → Online parity

The online app is being built module-by-module against the offline desktop spec (`GadgetZonePOS_Full_Project_Documentation.md`). The current status of every module is tracked in [`docs/offline-feature-parity.md`](docs/offline-feature-parity.md). Almost every module is now **Fully Aligned** — see the parity doc for the detailed matrix.

Two rules that must never regress as parity grows:
- **Service profit = commission only.** Never subtract the principal. Enforced by forcing `purchase_price = 0` on every service product.
- **POS totals are recomputed server-side.** The browser cart is hints only; the `pos_checkout` Postgres function re-fetches and re-totals.

## Authentication and First-Owner Setup

See `docs/auth-onboarding.md` for the full flow. Short version:

1. Visit the app — unauthenticated visitors land on `/login`.
2. On `/login`, switch to the **Sign up** tab to create the first account.
3. After sign-up you are sent to `/setup`. Confirm your full name, organization name (default *Gadget Zone*), and first branch (default *Main Branch*).
4. You become the **owner** and are redirected to `/dashboard`.
5. While at least one organization exists, the `/setup` page is locked — additional staff must be invited via the Users page.

The first-owner setup uses the **service role** key on the server only, in `src/app/setup/actions.ts`. It is never exposed to the browser.

## Supabase Project Setup

The Supabase CLI is used to link this repo to a real project and to push migrations.

```bash
# One-time, browser login (you must do this)
supabase login

# Link this folder to the project (asks for project-ref and DB password)
supabase link --project-ref <project-ref>

# Push the schema migration
supabase db push
```

After linking, copy the **Project URL**, **anon key**, and **service role key** from the Supabase dashboard (Project Settings → API) into `.env.local`.

## Supabase Setup

The schema foundation lives in:

```text
supabase/migrations/0001_initial_schema.sql
supabase/seed.sql
supabase/config.toml
```

All 28 migrations (0001–0028) build on each other. The first migration creates:

- organizations
- branches
- profiles
- product categories
- products and services
- customers
- suppliers
- invoices and invoice items
- payments
- repairs and repair status history
- expenses
- daily closings
- app settings
- audit logs

It also enables Row Level Security and adds organization-scoped policies for authenticated users. Every table added in later migrations follows the same org-scoped RLS pattern.

## Vercel Deployment

This app is intended for Vercel. Configure the same environment variables in Vercel before production deployment.

The CI workflow runs:

```bash
npm ci
npm run lint
npm run typecheck
npm run build
```

## Development Phases

1. Foundation and audit: complete.
2. Supabase project connection and authentication.
3. Organization onboarding and staff roles.
4. Product, category, supplier, and inventory CRUD.
5. POS checkout with invoices, payments, discounts, and customer credit.
6. Repairs workflow.
7. Expenses, daily closing, and reports.
8. Settings, branding, and print profile management.
9. PDF/receipt generation and print workflows.

Most phases are now live. Remaining work is tracked in [`docs/offline-feature-parity.md`](docs/offline-feature-parity.md).

## Audit Docs

See:

- `docs/desktop-audit.md`
- `docs/feature-map.md`
- `docs/settings-branding.md`
- `docs/user-management.md`
- `docs/business-rules.md`
- `docs/mvp-scope.md`
- `docs/architecture.md`
