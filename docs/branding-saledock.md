# SaleDock Branding Guide

## Platform Name

The platform/app is **SaleDock** (not Gadget Zone).

- **Short name**: SaleDock
- **Full name**: SaleDock Cloud POS
- **Tagline**: SaleDock Cloud POS (or SaleDock Retail OS for longer contexts)

## Logo

`/public/saledock-logo.svg` — a deep navy (#0b2f6f) rounded rectangle with white text and
a teal (#00b8b0) accent mark.

## Default Colors

| Role | Hex | Usage |
|---|---|---|
| Primary | `#0b2f6f` | Buttons, headers, progress bar, active states |
| Accent | `#00b8b0` | Highlights, badges, step indicators, toggle active |

## Where SaleDock Appears

- Login page header / title
- Onboarding page header
- Sidebar branding
- Browser tab title & metadata
- `NEXT_PUBLIC_APP_NAME` env var

## Where Gadget Zone Still Appears

- **Existing shop data** — orgs created before the rebrand still have "Gadget Zone"
  as their shop name. This is tenant data, not platform branding.
- **Old invoice/repair records** — printed documents from before the rebrand.
- **Backup files** — filenames containing "gadget-zone" are historical archives.

Do NOT rename tenant data. Do NOT change repo name or package.json.

## Shop Names vs Platform

- Multiple shops can have the same name.
- The platform is always SaleDock.
- "Gadget Zone" is only a shop/tenant name, not the platform.
