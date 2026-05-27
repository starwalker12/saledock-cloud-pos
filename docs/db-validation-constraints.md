# DB Validation Constraints

## Migration 0022: `safe_db_validation_constraints`

### Goal
Add database-level CHECK constraints and indexes to enforce data quality at
the storage layer. All constraints are safe — existing production data was
audited and has zero violations.

### Audit Methodology

Before writing migration 0022, a script (`scripts/audit-constraints.ts`)
queried production via the Supabase REST API (service-role) to count invalid
values per column.

**Total rows checked:** All non-null, non-empty values across 14 column checks.

**Result:** 0 invalid rows across 11 applicable columns. 6 columns skipped
because they do not yet exist in production (migration 0019 column additions
did not reach the remote database — re-applied in 0022).

### Constraints Added

| Table | Constraint | Rule |
|---|---|---|
| `profiles` | `profiles_phone_check` | `^[0-9+]+$` |
| `profiles` | `profiles_avatar_url_check` | `^(https?://\|/)` |
| `organizations` | `organizations_slug_check` | `^[a-zA-Z0-9-]+$` |
| `organizations` | `organizations_email_check` | `^[^\s]+$` (no whitespace) |
| `organizations` | `organizations_phone_check` | `^[0-9+]+$` |
| `organizations` | `organizations_whatsapp_check` | `^[0-9+]+$` |
| `organizations` | `organizations_logo_url_check` | `^(https?://\|/)` |
| `organizations` | `organizations_primary_color_check` | `^#[0-9a-fA-F]{6}$` |
| `organizations` | `organizations_accent_color_check` | `^#[0-9a-fA-F]{6}$` |
| `organizations` | `organizations_default_theme_check` | `null` or `light\|dark\|system` (existing, re-created) |
| `branches` | `branches_phone_check` | `^[0-9+]+$` |

### Indexes Added/Re-created

| Table | Index | Condition |
|---|---|---|
| `profiles` | `idx_profiles_username_unique` | `lower(username)` WHERE non-empty |
| `profiles` | `idx_profiles_phone_unique` | `phone` WHERE non-empty |
| `organizations` | `idx_organizations_phone_unique` | `phone` WHERE non-empty |
| `organizations` | `idx_organizations_email_unique` | `lower(email)` WHERE non-empty |
| `organizations` | `idx_organizations_slug_unique` | `lower(slug)` WHERE non-null |

### Columns Re-created from Migration 0019

The following columns were added in migration 0019 but did not appear in
production schema. They are re-created idempotently in 0022:

- `profiles.username` (text)
- `profiles.profile_picture_url` (text)
- `organizations.google_maps_url` (text)
- `organizations.latitude` (numeric)
- `organizations.longitude` (numeric)
- `organizations.show_map` (boolean, default false)
- `organizations.social_links` (jsonb, default '[]')
- `organizations.profile_picture_url` (text)
- `branches.phone` (text)
- `branches.address` (text)
- `branches.google_maps_url` (text)
- `branches.latitude` (numeric)
- `branches.longitude` (numeric)

### Constraints NOT Added

| Column | Reason |
|---|---|
| `profiles.username` | Column was not in production — no data to validate |
| `profiles.profile_picture_url` | Same — column not in production |
| `organizations.google_maps_url` | Same — column not in production |
| `organizations.social_links` | Same — column not in production (will be validated at app layer) |
| `branches.google_maps_url` | Same — column not in production |
| Shop name uniqueness | Deliberately excluded — same shop names must be allowed |

### Cleanup Needed

No existing data cleanup was required. All 11 checked columns had zero
invalid rows.

### Application-Layer Validation

The app already validates these fields via `src/lib/security/sanitize.ts`:
- `normalizePhone()` — strips non-digit characters
- `validateImageUrl()` — validates image URL scheme
- `normalizeUsername()` — sanitizes to alphanumeric + `_.-`
- `validateSafeUrl()` — rejects non-http(s) schemes
- `validateGoogleMapsUrl()` — validates Maps URL format
- `normalizeSocialLink()` — per-platform URL/handle pattern validation
- `sanitizePlainText()` — strips control characters, truncates
