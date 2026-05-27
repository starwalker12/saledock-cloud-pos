# v1.0.9 Offline Documentation Parity Notes

Reviewed: May 2026
Source: GadgetZonePOS_Full_Project_Documentation_v1.0.9.md

---

## Already Implemented Online

- Customer credit settlement accounting (daily closing captures collections)
- Supplier stock workflow with/without supplier selection
- Supplier purchase PDF generation (Stage 1)
- Profile name/photo refresh without restart
- Missing logo fallback to default
- Settings includes dynamic version from package.json
- New Bill UX with product row click-to-add
- Saved bill dialog actions (Open Invoice, Print, WhatsApp, Close)
- A4/80mm receipt selection
- Reports include service principal pass-through profit rule
- Settlement collections affect cash/digital collection but not sales revenue
- Write-offs reduce P&L as bad debt
- Cached summaries refresh after mutations

## Added in This PR (Stage 2 - SaaS Onboarding)

- Self-service email signup (full name, email, password, confirm)
- Google OAuth "Continue with Google" button
- `/auth/callback` routes users to `/onboarding` or `/dashboard`
- Multi-step onboarding wizard: profile → shop → branch → branding → confirm
- Organization theme customization (primary color, accent color, default theme)
- Logo URL field (file upload deferred)
- Avatar URL field (file upload deferred)
- Settings page includes Theme & Appearance section
- Public landing text: "Registration is open for new shops"
- Existing owner/admin accounts bypass onboarding (back-filled in migration 0018)
- Staff invite flow compatible with SaaS: invited users join existing org
- `/setup` route redirects to `/onboarding`

## Deferred to Next Parity PR

- **Customer settlement allocation** to oldest unpaid bills (currently lump-sum)
- **Write-off UI** in customer ledger (backend RPC exists, frontend planned)
- **Supplier purchase PDF** auto-save and in-app viewer
- **Stock batch table** alignment fix for sold/referenced batch deletion logic
- **Supabase Storage** file upload for organization logos and user avatars
  (currently using URL fields)
- **CAPTCHA / rate limiting** on public signup
- **Branch switcher** for multi-branch organizations (single branch per profile now)
- **Per-role RLS refinements** (cashier-only POS insert, technician repair writes)

## Recommended Next Parity PR After SaaS Onboarding

1. Customer settlement allocation UI + write-off UI
2. Supplier purchase PDF viewer
3. Supabase Storage setup for logos/avatars
4. Rate limiting / CAPTCHA for public endpoints
5. Branch switcher component
6. Role-based RLS policy refinements
