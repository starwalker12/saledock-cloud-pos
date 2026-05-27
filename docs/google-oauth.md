# OAuth Provider Setup (Google, Facebook)

This document describes how to configure OAuth providers for self-service signup.

## Common Supabase Dashboard Steps

For each provider:

1. Go to **Authentication → Providers** in Supabase Dashboard.
2. Find the provider card and enable it.
3. Enter the required credentials (Client ID, Client Secret, etc.).

The app calls `supabase.auth.signInWithOAuth({ provider })` with no
provider-specific code — all configuration is done through Supabase Dashboard.

No OAuth secrets are stored in the app code. Each provider is configured
entirely through Supabase Dashboard + the provider's developer console.

## Supabase Redirect URLs (all providers)

Under **Authentication → URL Configuration**:

- **Site URL:** `https://gadget-zone-online-pos.vercel.app`
- **Redirect URLs:**
  - `https://gadget-zone-online-pos.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback`

Supabase callback URL (add this to each provider's allowed redirect URIs):
`https://bvxyxrdskjryepwjmsvc.supabase.co/auth/v1/callback`

---

## Google

### Supabase Dashboard
- Enable **Google** provider
- OAuth 2.0 Client ID + Client Secret

### Google Cloud Console
1. Go to https://console.cloud.google.com/apis/credentials
2. Create an OAuth 2.0 Client ID (Web application).
3. Add Authorized redirect URI:
   - `https://bvxyxrdskjryepwjmsvc.supabase.co/auth/v1/callback`
   - (local dev) `http://localhost:54321/auth/v1/callback`

---

## Facebook

### Supabase Dashboard
- Enable **Facebook** provider
- App ID + App Secret (from Meta Developer app)

### Meta Developer Console
1. Go to https://developers.facebook.com/apps/
2. Create or select an app.
3. Add **Facebook Login** product.
4. Under **Facebook Login → Settings**:
   - Valid OAuth Redirect URIs: `https://bvxyxrdskjryepwjmsvc.supabase.co/auth/v1/callback`
5. Under **App Review**:
   - Make the app public (or add test users).
6. Required permissions: `public_profile`, `email`
   - The Supabase Facebook provider automatically requests `email`.
   - Keep **Allow users without email** OFF in Supabase provider settings.

---

## How OAuth Flow Works

1. User clicks "Continue with [Provider]" on `/login`.
2. Server action calls `supabase.auth.signInWithOAuth({ provider })`.
3. Supabase redirects to the provider's consent screen.
4. On success, the provider redirects to Supabase callback URL, which
   exchanges the code for a session and forwards to `/auth/callback?next=%2Fdashboard`.
5. The `/auth/callback` route checks if the user has an organization:
   - No org / onboarding incomplete → `/onboarding`
   - Completed → `/dashboard`

## Important Notes

- **Facebook** requires the `email` permission. Keep "Allow users without
  email" OFF in the Supabase Facebook provider settings.
- No OAuth secrets are hardcoded in the app. All provider configuration
  lives in Supabase Dashboard.
- The callback route (`/auth/callback`) is provider-agnostic — it works the
  same for Google, Facebook, and email confirmation links.

## Future Planned Providers

- **Apple / Sign in with Apple** — deferred. Adding Apple requires a paid
  Apple Developer Program membership ($99/year) and additional OAuth setup.
  The shared `oAuthAction` helper in `actions.ts` makes adding it
  straightforward when desired: add the button UI, add `"apple"` to the
  helper's union type, and configure credentials in Supabase Dashboard.
