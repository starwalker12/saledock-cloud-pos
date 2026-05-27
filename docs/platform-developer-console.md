# Platform Developer Console

SaleDock Cloud POS includes a **Platform Developer Console** — an admin-only dashboard for monitoring all tenants, managing platform-wide settings, and tracking system health.

## Access

- URL: `/platform`
- Only users listed in the `platform_admins` table (or the `PLATFORM_ADMIN_EMAILS` env var) can access.
- Non-admins are redirected to `/login?next=%2Fplatform`.

## Configuration

### Environment Variable

```
PLATFORM_ADMIN_EMAILS=admin@example.com,root@example.com
```

If the `platform_admins` table is empty, the system falls back to this env var to grant access.

### Database Setup

Migration `0020_platform_developer_console.sql` creates:

- `platform_admins` — user_id, email, role, is_active
- `platform_settings` — key, value, description

### Seed Defaults

Platform settings are initialized in the migration with these defaults:

| Key | Default | Description |
|---|---|---|
| `public_signup_enabled` | `true` | Allow new user registration |
| `maintenance_mode_enabled` | `false` | Put the platform in read-only mode |
| `backup_import_enabled` | `true` | Allow backup imports in tenant settings |
| `demo_data_enabled` | `true` | Allow demo data seeding |
| `factory_reset_enabled` | `true` | Allow factory reset of tenant data |

## Sidebar Visibility

The "Platform" link in the sidebar is only shown to platform admins (server-side check in `Sidebar` component).

## Security

- All platform data functions call `requirePlatformAdmin()` first, which redirects non-admins.
- Aggregate metrics only — no tenant secrets, auth tokens, or user passwords are exposed.
- `isPlatformAdmin()` is a lightweight boolean check for conditional UI rendering.
- Environment variable fallback ensures access even if the DB table hasn't been populated.
