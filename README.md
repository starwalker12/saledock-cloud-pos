# SaleDock Cloud POS

SaleDock Cloud POS is a multi-tenant web point-of-sale system for retail and repair shops. It manages sales, stock, invoices, returns, repairs, customers, suppliers, expenses, daily closing, and reporting from a browser-based dashboard.

The app is built for shops that operate with organizations, branches, staff profiles, role-based permissions, PKR currency defaults, and the Asia/Karachi timezone.

## Key Features

- Dashboard with sales, profit, returns, expenses, low-stock, repair, supplier-dues, and customer-dues summaries.
- POS checkout at `/pos` with cart management, customer selection, discounts, payment method capture, and invoice creation.
- Server-side checkout RPC that recomputes totals, handles FIFO stock allocation, records payments, and keeps stock changes atomic.
- Product catalog with categories, suppliers, barcode scanning support, inventory adjustments, low-stock thresholds, and service products.
- Customer management with customer detail pages, ledger-oriented settlement/write-off flows, and outstanding balance tracking.
- Invoice list and printable invoice detail pages.
- Invoice-linked returns/refunds with return detail and print views.
- Repair job tracking with status updates, notes, payment tracking, and printable repair detail pages.
- Expenses, daily closing, and cash-shift workflows.
- Reports for sales, profit, supplier purchases, service transactions, losses/overrides, inventory value, and related operational summaries.
- Supplier purchase, supplier dues, supplier ledger/statement, and replenishment workflows.
- Staff user management with roles: owner, admin, manager, cashier, and technician.
- Staff permission controls for operational capabilities such as selling, discounts, returns, reports, stock, and settings.
- Audit log for sensitive operational events.
- Settings area for shop profile, branch/profile details, invoice/receipt branding, theme appearance, connected accounts, privacy center, security, demo data, backup/restore, and factory reset tools.
- Platform admin console for authorized platform administrators.
- Public privacy, terms, and data-deletion pages.
- English, Urdu, and Roman-Urdu UI language support.
- Light/dark/system appearance mode plus separate sidebar/accent color themes.
- Consent-gated Google Analytics 4 and Microsoft Clarity scripts.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase Auth, Postgres, Storage, RLS, and server/admin clients
- Zod validation
- date-fns
- JSZip and sql.js for backup/import tooling
- ZXing browser libraries for barcode scanning
- next-themes for light/dark/system mode
- Vercel hosting
- npm

## Architecture Notes

- Multi-tenancy is based on `organizations`, `branches`, and `profiles`.
- Business data is scoped by `organization_id`; branch-aware data also uses `branch_id`.
- Supabase Row Level Security protects organization-scoped tables. App code also applies organization filters where needed.
- Auth uses Supabase email/password and Google OAuth flows.
- Staff invites are sent through Supabase Auth admin invite APIs.
- reCAPTCHA v2 protects public auth forms when configured.
- The server-only Supabase service-role client is guarded by `server-only` and must never be imported into client components.
- Next.js 16 uses `src/proxy.ts` instead of the older `middleware.ts` convention. This proxy calls `src/lib/supabase/session-update.ts` to refresh Supabase sessions and redirect unauthenticated users away from protected routes.
- The core checkout RPC is defined in Supabase migrations and is intentionally server-side so browser cart values are treated as hints, not trusted totals.
- Static public assets receive long-lived cache headers in `next.config.ts`; dynamic app pages and business data are not cached this way.

## Getting Started

### Prerequisites

- Node.js 20 is recommended. The GitHub Actions CI workflow uses Node 20.
- npm.
- A Supabase project with the migrations in `supabase/migrations` applied.
- Supabase Auth providers configured as needed in the Supabase Dashboard.

### Install

```bash
npm install
```

### Environment Setup

Create `.env.local` for local development. `.env.example` contains the core Supabase variable names; add optional variables as needed.

Never commit real `.env.local`, Vercel environment values, keys, tokens, service-role keys, or Supabase project refs.

```bash
cp .env.example .env.local
```

Fill `.env.local` with your own project values, then start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

### Build

```bash
npm run build
```

Optional local checks:

```bash
npm run lint
npm run typecheck
```

## Environment Variables

These are the environment variable names read by the current codebase. Do not put secret values in the README, issues, commits, or logs.

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL used by browser and server Supabase clients. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase anon key used by browser and server Supabase clients. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service-role key for trusted admin/bootstrap workflows. |
| `NEXT_PUBLIC_APP_NAME` | Public app name used by environment parsing; defaults to SaleDock Cloud POS in code. |
| `PLATFORM_ADMIN_EMAILS` | Optional comma-separated fallback list for platform admin access. |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | Optional Google site verification meta value. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Public Google reCAPTCHA v2 site key for auth pages. |
| `RECAPTCHA_SECRET_KEY` | Server-only Google reCAPTCHA secret used to verify auth form tokens. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional Google Analytics 4 measurement ID, loaded only after analytics consent is accepted. |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Optional Microsoft Clarity project ID, loaded only after analytics consent is accepted. |
| `NODE_ENV` | Runtime mode used by Next.js and development-only safeguards; normally set by the runtime. |

Google OAuth client secrets are configured in Supabase Auth provider settings, not in this repository.

## Available npm Scripts

| Script | Command | Description |
| --- | --- | --- |
| `dev` | `next dev` | Start the development server. |
| `build` | `next build` | Build the production app. |
| `start` | `next start` | Start a production build locally. |
| `lint` | `eslint` | Run ESLint. |
| `typecheck` | `tsc --noEmit` | Run TypeScript type checking. |
| `format` | `prettier --write .` | Format files with Prettier. |

## Project Structure

```text
src/app/                         Next.js App Router routes and server actions
src/app/pos/                     POS checkout UI and checkout actions
src/app/dashboard/               Dashboard page and draggable stat-card layout
src/app/settings/                Settings, backup/restore, privacy, security, demo data
src/components/layout/           App shell, sidebar, topbar, mobile drawer
src/components/ui/               Reusable UI components such as stat cards
src/components/auth/             reCAPTCHA client component
src/lib/auth/                    Session, identity, captcha-pass, rate-limit helpers
src/lib/data/                    Server-side data access modules
src/lib/supabase/                Browser, server, admin, and session-update Supabase clients
src/lib/validation/              Zod schemas for business workflows
src/lib/i18n/                    English, Urdu, and Roman-Urdu dictionaries/providers
supabase/migrations/             Postgres schema, RLS, RPCs, and business-rule migrations
supabase/seed.sql                Seed data
public/                          Static assets served by the app
docs/                            Project notes and feature/security documentation
.github/workflows/ci.yml         Lint, typecheck, and build CI workflow
```

## Deployment

The production app is hosted on Vercel. The default branch is `main`, and pushes to `main` auto-deploy to production.

Production URLs:

- `https://saledock.site`
- `https://saledock-cloud-pos.vercel.app`

The GitHub Actions workflow runs on pull requests and pushes to `main`:

```bash
npm ci
npm run lint
npm run typecheck
npm run build
```

Configure the same environment variable names in Vercel. Store real secret values only in the Vercel dashboard, local `.env.local`, or the appropriate provider dashboard.

## Database and Migrations

Database schema changes live in `supabase/migrations`. The migrations define the tenant model, business tables, RLS policies, checkout RPCs, stock/FIFO behavior, customer/supplier ledgers, returns/refunds, repairs, privacy requests, shifts, staff permissions, login rate limiting, and reporting RPCs.

Apply migrations through your normal Supabase workflow. Do not run migrations against production without review.

## Important Business Rules

- POS totals are recomputed server-side.
- Stock changes are transactional and use FIFO stock lots for product cost allocation.
- Service principal is pass-through money; service commission is the profit.
- Supplier payments are money movement, not an additional product cost.
- Customer balances are tracked through ledger-style entries and explicit direction/type semantics.
- Historical invoices and reports should remain stable after later catalog or cost changes.
- Tenant isolation by `organization_id` must not regress.

## Notes

- This repository is public, but `package.json` is marked private to prevent accidental npm publishing.
- No license file is currently included in the repository.
- Keep secrets out of source control. Environment variable names are safe to document; values are not.
