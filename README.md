# Gadget Zone Online POS

Gadget Zone Online POS is a new cloud POS project for Gadget Zone. It is inspired by the existing desktop Gadget Zone POS, but it is a separate codebase and a separate GitHub repository.

This project does not modify the desktop POS app, the Vercel download website, or any released portable app folders.

## Current Status

The project foundation plus the first usable authentication and onboarding milestone are in place:

- Next.js 16 App Router app with TypeScript (uses `proxy.ts`, the renamed `middleware.ts`)
- Tailwind CSS UI foundation, sidebar/topbar app shell
- Supabase client (browser), server, and admin (service-role) helpers
- Real email/password authentication via Supabase Auth
- First-owner onboarding flow at `/setup` — creates organization, branch, and owner profile
- Protected routes for `/dashboard`, `/pos`, `/products`, `/customers`, `/invoices`, `/repairs`, `/reports`, `/settings`
- Dashboard reads the current organization, branch, profile, and per-org counts from Supabase
- Initial Supabase schema migration with RLS policies scoped by organization
- Safe demo seed data (do not run against production unless explicitly desired)
- CI workflow for lint, typecheck, and build
- Desktop app audit and MVP planning docs

The full cashier POS checkout flow is the next milestone.

## Tech Stack

- Next.js
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

## Production

- App URL: https://gadget-zone-online-pos.vercel.app
- Supabase auth callback: `https://gadget-zone-online-pos.vercel.app/auth/callback`
- First owner exists. Public registration is now **closed** — see `docs/auth-onboarding.md`.

## Authentication and First-Owner Setup

See `docs/auth-onboarding.md` for the full flow. Short version:

1. Visit the app — unauthenticated visitors land on `/login`.
2. On `/login`, switch to the **Sign up** tab to create the first account.
3. After sign-up you are sent to `/setup`. Confirm your full name, organization name (default *Gadget Zone*), and first branch (default *Main Branch*).
4. You become the **owner** and are redirected to `/dashboard`.
5. While at least one organization exists, the `/setup` page is locked — additional staff must be invited (invite flow is a future milestone).

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

The first migration creates:

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

It also enables Row Level Security and adds organization-scoped policies for authenticated users.

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

1. Foundation and audit: complete in this milestone.
2. Supabase project connection and authentication.
3. Organization onboarding and staff roles.
4. Product, category, supplier, and inventory CRUD.
5. POS checkout with invoices, payments, discounts, and customer credit.
6. Repairs workflow.
7. Expenses, daily closing, and reports.
8. PDF/receipt generation and print workflows.

## Audit Docs

See:

- `docs/desktop-audit.md`
- `docs/feature-map.md`
- `docs/business-rules.md`
- `docs/mvp-scope.md`
- `docs/architecture.md`

