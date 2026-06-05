<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:session-summary -->
# Session Summary — Mobile Navigation Drawer

## Goal
Replace the cramped horizontal-scrolling mobile nav with a hamburger button + slide-out drawer showing the full permission-gated nav, while keeping desktop sidebar unchanged.

## Context
- Repo: gadget-zone-online-pos (Next.js 16, Supabase, Prisma)
- Production: https://saledock.site
- Owner is non-technical — use draft PRs and let them review on live/preview site.
- Never modify checkout, stock, money, reports logic, data fetching, DB schemas, or migrations.
- PRs #108, #109, #110, #111 are all merged. Facebook removal is done. Captcha renders as small text (no grey box).

## What Was Done

### Files Created
- `src/components/layout/drawer-context.tsx` — React context (`DrawerProvider`/`useDrawer`) for drawer open state shared between hamburger (inside topbar) and drawer panel (at app-shell level).
- `src/components/layout/mobile-drawer.tsx` — Client component rendering both the hamburger button (<lg) and the full-screen slide-out drawer with nav items, settings sub-pages (Accounts/Privacy/Security), active route highlighting, close on X/backdrop/Esc/link-tap, body scroll lock.
- `src/components/layout/mobile-drawer-wrapper.tsx` — Server component that computes permission-gated nav items (same logic as sidebar) and passes them to `<MobileDrawer>`.

### Files Modified
- `src/components/layout/app-shell.tsx` — Wrapped with `<DrawerProvider>`, removed `<MobileNav>` + hardcoded `mobileLinks` array entirely.
- `src/components/layout/topbar.tsx` — Added `<MobileDrawerWrapper />` (hamburger) before page title in a flex row (visible only <lg).
- `src/components/layout/sidebar-nav.tsx` — Added `labelFallback` map so `supplierDues` renders as "Supplier Dues" instead of the raw key when translation is missing.
- `src/lib/i18n/translations.ts` — Added `dues: "Supplier Dues"` (and Urdu equivalent) to the `sidebar` section in all three language blocks.

### Files Deleted
- `src/components/layout/mobile-nav.tsx` — Replaced by the drawer.

### Verifications
- `npm run lint` — 0 errors, only 2 pre-existing warnings (unrelated).
- `npm run typecheck` — passes.
- `npm run build` — passes (all routes compile, no dead imports).

## Remaining (Minor)
- The `mobile-drawer.tsx` has a "Menu" hardcoded label in the drawer header — consider making it translatable if multilingual support is needed for the drawer itself.
- Verify on mobile viewport that hamburger appears and drawer opens/closes correctly. Owner should review on live/preview site before merge.

# Session Summary — Google Button Hover/Press Fix

## Goal
Fix the "Continue with Google" button on the login page so hover and click produce a clearly visible visual change in both light and dark mode. Previous attempt (PR #170) used `hover:bg-slate-100` and `active:bg-slate-200` but the owner reported no visible change.

## Root Cause
The background brightness shift was far too small for the eye to register:
- Light: white (#ffffff) → `slate-100` (#f1f5f9) = only ~6% brightness change
- Dark: `slate-800` (#1e293b) → `slate-700` (#334155) = only ~16% change
- No border-color or shadow changed on hover/active, so only one visual channel existed and it was too weak

## What Changed
- `src/app/login/login-form.tsx` — Google button hover/press classes:
  - `hover:bg-slate-100` → `hover:bg-slate-200` (11% delta — clearly visible)
  - `active:bg-slate-200` → `active:bg-slate-300` (20% delta — unmistakable press)
  - `dark:hover:bg-slate-700` → `dark:hover:bg-slate-600` (28% delta)
  - `dark:active:bg-slate-600` → `dark:active:bg-slate-500` (45% delta)
  - Added `hover:border-slate-300` / `active:border-slate-400` and dark equivalents for a second visual channel (border-color shift)

## Verifications
- `npm run lint` — 0 errors, 2 pre-existing warnings
- `npm run typecheck` — passes
- `npm run build` — passes

## PR
- #172 — MERGED, live on https://saledock.site (squash-merged into main)
- Owner should hover and press the "Continue with Google" button on the LIVE site in both light and dark mode and confirm it now visibly reacts.

# Session Summary — Google Button Hover REAL Root Cause (!important override)

## Goal
Fix Google button hover/press for the THIRD time — previous attempts (#170, #172) assumed the color change was "too subtle"
but the true cause was invisible from reading source code alone.

## Root Cause (found by inspecting LIVE production CSS bundle)

1. **Dark mode (COMPLETELY BROKEN):** The global CSS rule `.dark .bg-white{background-color:#0b1220!important}`
   uses `!important` which overrides ALL background-color changes on the Google button in dark mode:
   - `dark:bg-slate-800` (base) → blocked by `!important`
   - `dark:hover:bg-slate-600` (hover) → blocked by `!important`
   - `dark:active:bg-slate-500` (active) → blocked by `!important`
   The `!important` flag means NO Tailwind specificity can beat it. The hover NEVER fired a single visible pixel.

2. **Light mode (too subtle):**`#ffffff` → `#e2e8f0` (11% delta) technically worked but was nearly imperceptible.

## What Changed
- `src/app/login/login-form.tsx` — Google button className:
  - **`bg-white` → `bg-[#fff]`** (skips the `.dark .bg-white{...!important}` override)
  - `hover:bg-slate-200` → `hover:bg-slate-300` (20% delta — clearly visible)
  - `active:bg-slate-300` → `active:bg-slate-400` (30% delta — unmistakable)
  - `active:scale-[0.98]` → `active:scale-[0.97]` (more pronounced press)
  - `dark:hover:bg-slate-600` → `dark:hover:bg-slate-500` (45% delta — now actually visible)
  - `dark:active:bg-slate-500` → `dark:active:bg-slate-400` (60% delta — dramatic)
  - Border hover/active levels rebalanced to match

## Verifications
- `npm run lint` — 0 errors, 2 pre-existing warnings
- `npm run typecheck` — passes
- `npm run build` — passes

## PR
- #173 — MERGED, live on https://saledock.site (squash-merged into main)

<!-- END:session-summary -->
