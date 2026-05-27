# Google Brand Verification

Google requires brand verification when your OAuth consent screen displays
your app name and logo to users. This document describes the fields and
steps needed.

## Exact Values for Google Cloud Console

### OAuth Consent Screen

| Field | Value |
|---|---|
| Application name | SaleDock Cloud POS |
| Application home page | `https://gadget-zone-online-pos.vercel.app` |
| Privacy policy | `https://gadget-zone-online-pos.vercel.app/privacy` |
| Terms of service | `https://gadget-zone-online-pos.vercel.app/terms` |
| Authorized domain | `gadget-zone-online-pos.vercel.app` (no `https://` prefix) |
| Application logo | Square 512×512 SaleDock mark (`saledock-logo-mark.svg`) |

### OAuth 2.0 Client ID (Web application)

| Field | Value |
|---|---|
| Authorized JavaScript origins | `https://gadget-zone-online-pos.vercel.app` |
| Authorized redirect URIs | `https://bvxyxrdskjryepwjmsvc.supabase.co/auth/v1/callback` |

## Brand Verification Checklist

1. **Home page must be public.**
   The root URL (`/`) must be accessible without login and show the
   SaleDock brand. Google will crawl this URL to verify brand consistency.

2. **Privacy policy must be public.**
   `/privacy` must return 200 without authentication.

3. **Terms of service must be public.**
   `/terms` must return 200 without authentication.

4. **Logo must match brand.**
   The logo uploaded to Google Cloud Console must match the logo shown on
   the home page and login page. Use the SaleDock wordmark or square mark.
   Do not use a generic receipt/cart icon.

5. **Domain ownership (if prompted).**
   If Google Search Console requires ownership verification:
   - Add a `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` env var in Vercel with the
     meta tag content value from Google.
   - Or place the verification HTML file in `/public/` so it serves at
     `https://gadget-zone-online-pos.vercel.app/<filename>.html`.

6. **Scopes**
   The app requests only `openid`, `email`, and `profile` — these are
   non-sensitive scopes. Brand verification may still be required for the
   app name/logo to display.

## Google Search Console Verification

### Option A — Meta tag (recommended)

1. Go to https://search.google.com/search-console
2. Add a **URL-prefix** property: `https://gadget-zone-online-pos.vercel.app`
3. Choose **HTML tag** verification method.
4. Copy the meta tag content value.
5. Set it as a Vercel environment variable:
   ```
   NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=<content_value>
   ```
6. Deploy. The meta tag will be rendered in the `<head>` of every page.
7. Click **Verify** in Search Console.

### Option B — HTML file

1. Download the verification HTML file from Google Search Console
   (e.g. `google1234567890abcdef.html`).
2. Place it in `/public/` of this project.
3. Deploy. It will be served at:
   `https://gadget-zone-online-pos.vercel.app/google1234567890abcdef.html`
4. Click **Verify** in Search Console.

## After Verification

1. Return to **Google Cloud Console → APIs & Services → OAuth consent screen**.
2. Click **Edit App** → **Save and Continue** through all sections.
3. If Google still shows pending verification, submit for verification.
4. Once verified, the app name and logo will display on the OAuth consent
   screen instead of "Unverified app".
