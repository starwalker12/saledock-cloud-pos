# Supabase Storage — Image Uploads

## Buckets

| Bucket | Public | File size limit | Allowed MIME types | Purpose |
|--------|--------|-----------------|--------------------|---------|
| `profile-pictures` | ✅ Yes | 2 MB | `image/png`, `image/jpeg`, `image/webp` | User profile photos |
| `public-branding` | ✅ Yes | 2 MB | `image/png`, `image/jpeg`, `image/webp` | Shop logos / org branding |

## Path Convention

```
profile-pictures / users / {user_id} / profile-picture / {uuid}.{ext}
public-branding  / orgs  / {org_id}      / logo           / {uuid}.{ext}
public-branding  / temp  / {user_id}     / logo           / {uuid}.{ext}   (onboarding only)
```

- Filenames are `crypto.randomUUID()` + safe extension.
- The original filename is never trusted.
- SVG is rejected at the application layer and by bucket `allowed_mime_types`.

## RLS / Storage Policy Summary

All policies are on the `storage.objects` table.

### `profile-pictures`
- **SELECT**: public (anyone can view profile pictures)
- **INSERT**: authenticated users only into `users/{auth.uid()}/profile-picture/`
- **UPDATE**: authenticated users only for their own path
- **DELETE**: authenticated users only for their own path

### `public-branding`
- **SELECT**: public (anyone can view logos)
- **INSERT**: authenticated users who are `owner` or `admin` of the org (checked via `profiles` table) into `orgs/{org_id}/logo/`; OR any authenticated user into `temp/{auth.uid()}/` (onboarding path)
- **UPDATE**: org owners/admins only for their org path
- **DELETE**: org owners/admins for their org path; any authenticated user for their own temp path

### Service role
- **ALL**: service_role has full access for admin operations.

## How to Test Upload

### Production
1. Sign in at https://saledock-cloud-pos.vercel.app
2. Go to **Settings → Shop Profile** (or `/settings`)
3. Under **Profile Picture**, click "Upload" and select a PNG/JPG/WebP under 2 MB
4. The image uploads immediately and the profile picture is updated
5. Under **Invoice & Receipt Branding**, click "Upload" for the shop logo
6. Click "Save settings" to persist the logo URL

### Onboarding
1. Sign up and reach the onboarding wizard
2. On **Owner Profile** step, click "Upload" under Profile picture
3. On **Branding** step, click "Upload" under Shop logo (temp path)
4. Complete onboarding — the profile picture and logo URLs are passed to `complete_self_signup`

## Privacy / GDPR Note

- **Profile pictures** are personal data (`profiles.profile_picture_url`). Users can upload, change, or remove their own picture at any time via Settings or by emailing `fardan.aatir@outlook.com` (Data Deletion Request).
- **Shop logos** are business data (`organizations.logo_url`). Org owners/admins can change or remove the logo. On org deletion, branding files should be cleaned up.
- Both buckets are **public-read**, meaning anyone with the URL can view the image. This is by design for invoice/receipt display and staff profile photos. If private uploads are needed later, a separate non-public bucket must be created.

## Code Reference

| File | Purpose |
|------|---------|
| `supabase/migrations/0024_storage_buckets.sql` | Bucket creation + storage RLS policies |
| `src/lib/storage/upload.ts` | `validateImageFile()`, `uploadImage()`, `removeImage()` |
| `src/components/shared/image-upload.tsx` | Reusable client component with preview, upload, remove |
| `src/app/onboarding/onboarding-wizard.tsx` | Onboarding ProfileStep and BrandingStep |
| `src/app/settings/settings-form.tsx` | Settings logo + profile picture upload |
| `src/app/settings/actions.ts` | `updateProfilePictureAction` server action |
