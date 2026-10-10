# GitHub README Showcase

Task 38624 continues the stopped Task 97531 on main
`d1469fcc2a448bdb75dc21da0cdb634085a5cf92`.

## Scope

- Product-first README, eight showcase/branding PNGs, this QA note, and package MIT metadata only.
- Existing root LICENSE is byte-identical to main and matches standard MIT wording with `Copyright (c) 2026 Muhammad Fardan Aatir`.
- `package.json` retains its name, dependencies, scripts and `private: true`; only `license: MIT` is added.
- No runtime, database, migration, RLS, permission, money, deployment, or repository-settings changes.

## Capture Lineage

All six product views were freshly captured from the unchanged local production-mode app in an isolated disposable Supabase stack. The fictional business is Northline Studio & Supply. Screens contain no private contacts, credentials, production identifiers, browser chrome, or developer tools.

The synthetic Owner used the existing Dashboard UI: Edit layout, board Gradient, visible widget Auto/Inherit fill, Auto text, existing semantic colors, and Done. Local preference persistence and computed gradient backgrounds were verified. No widget or preference default was edited. Before/after captures and preference proof are retained outside the repository.

Dashboard, POS, Products/Inventory, Repairs and Reports are 1600x900. The complete invoice is 896x757. Social preview is 1280x640 and uses the new Gradient Dashboard. The official unmodified wordmark is placed on a white 488x178 background for theme-safe contrast. Each asset is below 1.5 MB.

Local fixtures were removed through the checked local reset path; the exact synthetic auth user and organization were then removed. No other local stack or data was cleaned. No production access was used.

## Qualification

- All final assets visually inspected and OCR/secret scanned; no private data found.
- MIT/license-link, package JSON, image paths, relative documentation links and README anchors pass.
- Six restrained badges; non-production badge and reference URLs checked successfully. Live App URL is syntax/reference checked only to respect the no-production-access boundary.
- Official GitHub GFM render passes; desktop and 390px light/dark previews have no page overflow, broken images or raw HTML leakage. Technical details expand normally.
- Lint passes with only the two existing privacy-center hook warnings. Typecheck, local production build and `git diff --check` pass.
- Existing functionality is presented without claiming new Return Math, Exchange, Invoice Correction or Service V1. No fake adoption metrics, certifications or testimonials.

After opening the Draft PR, its exact-head README is also checked on GitHub in desktop/narrow light/dark rendering. Actual-render evidence is retained in the continuation evidence, not claimed from the local preview alone.

## Owner Follow-Up

After review, manually upload `docs/assets/readme/github-social-preview.png` under repository Settings -> Social preview. No remote Settings changes are part of this PR.

Suggested About text: Modern cloud POS for retail, service and repair businesses: sales, inventory, invoices, customers, suppliers, repairs and reporting.

Suggested topics: point-of-sale, pos, retail, inventory, nextjs, supabase, typescript, tailwindcss, saas, multi-tenant, repair-management, business-management, open-source, mit-license.

The preserved stopped worktree and original evidence remain unchanged. New evidence:
`/Users/sw12/Projects/saledock-local-evidence/github-readme-showcase-continuation`.
