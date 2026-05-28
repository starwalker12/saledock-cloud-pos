# OAuth Account Linking — SaleDock Cloud POS

## Duplicate Signup Handling

### Email/password sign-up

If a user tries to sign up with an email that already exists:

- **Server action** (`signUpAction`) catches `user already registered` / `email already exists` / `already in use` / `duplicate` errors
- **Friendly message displayed:** *"An account may already exist for this email. Sign in to continue setup, or use password reset if you forgot your password."*
- **Actions shown:** "Go to sign in" and "Reset password" buttons
- Messages are **neutral** — we do not confirm whether an email exists before authentication (preventing account enumeration)

### OAuth callback conflicts

If OAuth returns an identity/email conflict error:

- **Callback route** detects `email already registered`, `email already exists`, `identity conflict`, or `already linked` in the error
- **Redirect:** To `/settings?tab=accounts&link=conflict`
- **Friendly message:** *"This email is already used by another sign-in method. Sign in with your original method first, then link this provider from Profile Settings."*

## Account Linking (Manual)

### Available actions

| Action | Server action | Supabase API |
|--------|---------------|-------------|
| Link Google | `linkGoogleAccountAction` | `supabase.auth.linkIdentity({ provider: 'google' })` |
| Link Facebook | `linkFacebookAccountAction` | `supabase.auth.linkIdentity({ provider: 'facebook' })` |
| Unlink any | `unlinkIdentityAction` | `supabase.auth.unlinkIdentity(identity)` |

### Flow

1. User signs in with their existing method
2. User goes to **Settings → Connected Accounts**
3. User clicks **Link Google Account** or **Link Facebook Account**
4. User is redirected to the OAuth provider consent screen
5. After granting permission, user is redirected back to `/auth/callback?linking=1`
6. Callback exchanges code, links identity, redirects to `/settings?tab=accounts&link=success`

### Safety rules

- **User must be signed in** before linking; otherwise `linkIdentity()` returns an error
- **Cannot link an already-linked identity:** If the provider is already linked, `linkIdentity()` fails
- **Cannot unlink the last method:** At least one sign-in method must remain
- **No service-role key in browser:** All linking uses the anon-key client bound by auth
- **No tokens/codes/secrets logged:** Developer diagnostics log only provider name and redirect URL in development mode
- **No account enumeration:** Unauthenticated sign-up attempts do not reveal whether an email exists

### Supabase dashboard requirement

For manual identity linking to work, the following Supabase Auth setting must be enabled:

**Authentication → Settings → Manual Linking → Allow manual linking**

If this is disabled, `linkIdentity()` will fail with an error about manual linking not being supported. In that case:

1. Go to **Supabase Dashboard → Authentication → Settings**
2. Scroll to **Manual Linking**
3. Toggle **Allow manual linking** ON
4. Click **Save**

If manual linking is not enabled, the UI shows "*Linking {provider} is not available yet. The {provider} provider must be enabled in Supabase Dashboard first.*"

## Connected Accounts UI

**Location:** Settings → Connected Accounts tab (`/settings?tab=accounts`)

**Shows:**
- Email / Password — connected status
- Google — connected status + link/unlink
- Facebook — connected status + link/unlink

**Help text:** *"Link Google or Facebook so you can sign in using either provider. For security, sign in with your existing account first before linking a new provider."*

## Unlink Safety

- Unlink is only allowed if at least **2 identities** remain after removal
- If only 1 identity remains, the unlink button is hidden and "Required" is shown instead
- `unlinkIdentityAction` server-side verifies the count before proceeding

## Known Facebook Development Mode Limitation

Facebook apps in Development mode only allow admins, developers, and testers to sign in. If a non-tester tries Facebook OAuth:

- Facebook may return an error, or
- The user sees: *"The app is in development mode..."*

**To test:** Add test users in **Meta Dashboard → App Roles → Test Users**, or switch the app to Live mode (requires Meta review).

## Testing Steps

### Test 1: New email signup → onboarding
1. Go to `/login`
2. Fill in a new email, password, full name
3. Click "Create account"
4. Should redirect to `/onboarding`

### Test 2: Existing completed user signs in
1. Go to `/login`
2. Sign in with existing email/password
3. Should redirect to `/dashboard`

### Test 3: Existing incomplete user signs in
1. Sign up an email but don't complete onboarding
2. Go to `/login` again
3. Should show **"Your shop setup is not complete"** card
4. "Continue setup" → `/onboarding`
5. "Restart setup" → resets profile, redirects to `/onboarding`

### Test 4: Duplicate email sign-up
1. Try signing up with an existing email
2. Should see friendly message with "Go to sign in" and "Reset password"

### Test 5: OAuth same email → recovery
1. If Google/Facebook email matches an existing email/password account
2. Should handle gracefully (redirect with conflict message)

### Test 6: Link Google/Facebook
1. Sign in with email/password
2. Go to Settings → Connected Accounts
3. Click "Link Google Account"
4. Complete OAuth consent
5. Should see "Account linked successfully."
6. Provider shows as connected
7. Can unlink

## Docs

- `docs/facebook-oauth.md` — Facebook-specific setup and troubleshooting
