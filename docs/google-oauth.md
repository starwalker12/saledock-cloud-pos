# Google OAuth Setup

This document describes how to configure Google OAuth for self-service signup.

## Supabase Dashboard Configuration

1. Go to **Authentication → Providers** in Supabase Dashboard.
2. Click **Google** and enable it.
3. Enter the OAuth 2.0 Client ID and Client Secret from Google Cloud Console.
4. Set the redirect URL in Google Cloud Console to:
   `https://bvxyxrdskjryepwjmsvc.supabase.co/auth/v1/callback`

## Google Cloud Console Setup

1. Go to https://console.cloud.google.com/apis/credentials
2. Create an OAuth 2.0 Client ID (Web application).
3. Add Authorized redirect URIs:
   - `https://bvxyxrdskjryepwjmsvc.supabase.co/auth/v1/callback`
   - (for local dev) `http://localhost:54321/auth/v1/callback`

## Supabase Redirect URLs

Under **Authentication → URL Configuration**:

- **Site URL:** `https://gadget-zone-online-pos.vercel.app`
- **Redirect URLs:**
  - `https://gadget-zone-online-pos.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback`

## How it works

1. User clicks "Continue with Google" on `/login`.
2. Server action calls `supabase.auth.signInWithOAuth({ provider: 'google' })`.
3. Supabase redirects to Google consent screen.
4. On success, Google redirects to Supabase callback, which exchanges the code
   for a session and redirects to `/auth/callback?next=%2Fdashboard`.
5. The callback checks if the user has an organization. If not, redirects to
   `/onboarding`.

## Environment Variables

No Google-specific env vars in the app. Configured entirely through Supabase
Dashboard. The app calls `supabase.auth.signInWithOAuth({ provider: 'google' })`
which uses the Supabase project's Google configuration.
