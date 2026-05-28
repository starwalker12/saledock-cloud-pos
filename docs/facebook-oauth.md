# Facebook OAuth Setup — SaleDock Cloud POS

## Meta App Configuration

| Field | Value |
|-------|-------|
| App name | SaleDock Cloud POS |
| App domains | `saledock-cloud-pos.vercel.app` |
| Privacy Policy URL | `https://saledock-cloud-pos.vercel.app/privacy` |
| Terms of Service URL | `https://saledock-cloud-pos.vercel.app/terms` |
| User Data Deletion URL | `https://saledock-cloud-pos.vercel.app/data-deletion` |
| Category | Business and pages |
| Namespace | `saledockcloudpos` (leave blank if not required) |

### Facebook Login — Valid OAuth Redirect URI

```
https://bvxyxrdskjryepwjmsvc.supabase.co/auth/v1/callback
```

## Supabase Configuration

**Authentication → Sign In / Providers → Facebook**

| Setting | Value |
|---------|-------|
| Facebook client ID | Meta App ID |
| Facebook secret | Meta App Secret |
| Allow users without an email | OFF |

## Required Permissions

- `public_profile`
- `email`

## Troubleshooting

### "Invalid Scopes: email"

If Facebook returns `Invalid Scopes: email`:

1. Go to **Meta Developer Dashboard → [App] → Use cases → Authentication → Facebook Login → Permissions and features**
2. Find **email** in the list
3. Click **Add** if not present
4. Ensure both `public_profile` and `email` show **Ready for testing** (green badge)
5. In **App Settings → Advanced**, verify **App Secret** is valid

**Why this happens:** Supabase Auth requests the `email` scope by default for Facebook OAuth. If the Meta app does not have `email` permission enabled (even in Development mode), Facebook rejects the request.

See `docs/oauth-account-linking.md` for account linking documentation.

### Facebook Development Mode

- In Development mode, only app admins, developers, and testers can sign in with Facebook
- Logged-in test users see: *"The app is in development mode and can only be used by people with access"*
- **Fix:** Add test users in **Meta Dashboard → App Roles → Test Users**, or switch the app to Live mode (requires Meta review)

### "User already registered" / Email conflict

If a Facebook user tries to sign up with an email that already exists for an email/password account:

- Show friendly message: *"This email is already used by another sign-in method. Sign in with your original method first, then link this provider from Profile Settings."*
- The user should sign in with their existing method, go to **Settings → Connected Accounts**, and click **Link Facebook Account**

### Existing email/password user wants Facebook

1. Sign in with email/password first
2. Go to **Settings → Connected Accounts**
3. Click **Link Facebook Account**

## Notes

- The User Data Deletion URL must point to a working endpoint. SaleDock provides a dedicated instructions page; actual deletion is handled manually via email request.
- If Meta enforces a namespace, use `saledockcloudpos`.
- The app icon issue on the Meta dashboard should be resolved with a valid square PNG icon.
- Do not turn on **Allow users without an email** (OFF) unless we intentionally support email-less accounts.
