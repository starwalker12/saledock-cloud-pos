# QA — testing previews vs production

## TL;DR

| Surface | URL | Public unauthenticated curl OK? | Owner browser login OK? |
|---|---|---|---|
| Production | https://saledock-cloud-pos.vercel.app | ✅ public app routes | ✅ |
| Vercel Preview deploy | `https://gadget-zone-online-<hash>-<team>.vercel.app` | ❌ blocked by Vercel SSO | ✅ after Vercel login |
| Local dev (`npm run dev`) | http://localhost:3000 | ✅ | ✅ |

Vercel's Hobby plan protects all preview deployments behind Vercel SSO by default. This is **good for security** (PR previews aren't crawlable) but it does mean:

- `curl https://gadget-zone-online-<hash>...vercel.app/login` returns **HTTP 401** with a Vercel auth page, not a 200 with the SaleDock login.
- Smoke tests scripted against a preview URL **will all fail** unless you authenticate first.

This isn't a bug in the app. Don't disable SSO just to make smoke-tests work — that exposes every preview to crawlers and reduces the security posture.

## What to do instead

1. **Smoke-test production with curl** — that's what `scripts/qa-smoke.mjs` does. Production has the right balance: app auth gates protected routes, public routes (login) return real HTTP 200, and SSO is not in the way.
2. **Visual-test previews in your browser** — open the preview URL in the browser where you're signed in to Vercel as `starwalker12`. The team logo is the give-away that you've passed SSO.
3. **Develop locally** with `npm run dev` against your `.env.local` (which points at the production Supabase project). Same auth, same RLS, fast iteration.

## scripts/qa-smoke.mjs

Run:

```bash
node scripts/qa-smoke.mjs                          # default = production URL
node scripts/qa-smoke.mjs https://your-preview-url # to point at a preview
```

Output is a small report of:
- `/login` response (expect 200 + no "Supabase is not configured" warning),
- protected routes (expect 307 to `/login?next=…`).

The script exits non-zero if any check fails. It does **not** require Supabase auth — only the public anonymous surface is checked.

## Multi-viewport visual testing

For now this is a manual checklist; we have not added a Playwright dependency to keep the bundle/budget tight. Use the browser's responsive devtools:

| Profile | Viewport | What to check |
|---|---|---|
| Mobile S | 320 × 812 | Mobile chip nav scrolls, no horizontal overflow |
| Mobile M | 375 × 812 | Stat cards stack, dashboard hero readable |
| Mobile L | 430 × 932 | POS tabs swap cleanly |
| Tablet portrait | 768 × 1024 | Same mobile flow (sidebar appears at lg = 1024px) |
| Laptop | 1024 × 768 | Sidebar visible, topbar pinned, main scrolls |
| Desktop | 1440 × 900 | POS cart sticky on right, products scroll separately |

If we later want headless multi-viewport smoke screenshots, add Playwright as a `devDependency` and a single `tests/smoke.spec.ts` that snapshots the seven core routes at the six viewports. That's intentionally deferred.

## What is intentionally NOT in this PR
- Bypassing Vercel SSO on previews (security trade-off).
- Adding Playwright (bundle / CI cost; manual checklist is enough today).
- Automated screenshot diffs.
