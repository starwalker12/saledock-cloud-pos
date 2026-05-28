# Image Uploads

## Allowed file types

- PNG (`.png`)
- JPG / JPEG (`.jpg`, `.jpeg`)
- WebP (`.webp`)

SVG and other formats are explicitly blocked.

## Maximum file size

5 MB per file.

## Storage buckets

| Bucket              | Purpose                             |
|---------------------|-------------------------------------|
| `profile-pictures`  | User profile pictures (avatars)     |
| `public-branding`   | Shop logo, invoice branding images  |

## Storage RLS expectations

Both buckets should have **public read** access so images render in the app. Uploads
are handled server-side via the Supabase client (service role key or user JWT with
bucket insert permissions).

Expected policies:

- `SELECT` — public (anyone can view)
- `INSERT` — authenticated users only (or service role)
- `DELETE` — authenticated users only (or service role)
- `UPDATE` — authenticated users only (or service role)

## Manually updating bucket limits in the Supabase Dashboard

If the migration (`0027_update_storage_upload_limits.sql`) does not apply (e.g. on
existing projects where the buckets were created outside the migration system):

1. Open the Supabase Dashboard → **Storage** → select the bucket.
2. Go to **Configuration** → **File size limit**.
3. Set to **5 MB** (5242880 bytes).
4. Repeat for each bucket (`profile-pictures`, `public-branding`).

Alternatively, run the SQL directly in the Supabase SQL Editor:

```sql
update storage.buckets
set file_size_limit = 5242880
where id in ('profile-pictures', 'public-branding')
  and file_size_limit < 5242880;
```
