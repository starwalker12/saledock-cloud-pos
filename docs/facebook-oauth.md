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

## Notes

- The User Data Deletion URL must point to a working endpoint. SaleDock provides a dedicated instructions page; actual deletion is handled manually via email request.
- If Meta enforces a namespace, use `saledockcloudpos`.
- The app icon issue on the Meta dashboard should be resolved with a valid square PNG icon.
