# Privacy Center — Data Request Workflow

## Overview

The Privacy Center provides an in-app interface for authenticated users to submit, view,
and manage privacy-related requests. It replaces the need to send manual emails for
signed-in users.

Location: `Settings → Privacy Center` (`/settings?tab=privacy`)
Public fallback: `/data-deletion` (for users who cannot sign in)
Contact email: fardan.aatir@outlook.com

---

## Database Schema

### Table: `privacy_requests`

| Column             | Type        | Notes                                       |
|--------------------|-------------|---------------------------------------------|
| `id`               | `uuid PK`   | `gen_random_uuid()`                         |
| `organization_id`  | `uuid FK`   | References `organizations(id)`, nullable, `on delete set null` |
| `requester_user_id`| `uuid FK`   | References `auth.users(id)`, `on delete cascade` |
| `requester_email`  | `text`      | Denormalized from profile at creation       |
| `requester_name`   | `text`      | Denormalized from profile at creation       |
| `request_type`     | `text`      | `access`, `export`, `correction`, `deletion`, `restriction`, `portability`, `objection` |
| `status`           | `text`      | `pending`, `in_review`, `completed`, `rejected`, `cancelled` |
| `details`          | `jsonb`     | Free-text description from requester        |
| `admin_notes`      | `text`      | Platform admin notes                        |
| `requested_at`     | `timestamptz`| Default `now()`                              |
| `processed_at`     | `timestamptz`| Set when admin processes request            |
| `processed_by`     | `uuid FK`   | References `auth.users(id)`, `on delete set null` |
| `created_at`       | `timestamptz`| Default `now()`                              |
| `updated_at`       | `timestamptz`| Auto-updated via trigger                    |

---

## RLS Policy Summary

| Policy | Effect |
|--------|--------|
| **Insert own** | Authenticated users can insert only where `requester_user_id = auth.uid()` |
| **Select own** | Authenticated users can select only their own requests |
| **Cancel own** | Authenticated users can update only their own `pending`/`in_review` requests to `cancelled` |
| **Platform admin select** | Active platform admins can select all requests |
| **Platform admin update** | Active platform admins can update any request |

---

## Request Lifecycle

```
[User submits] → pending → in_review → completed / rejected
                      ↘ cancelled (by user)
```

1. **Pending** — Awaiting platform admin review
2. **In Review** — Admin has acknowledged the request
3. **Completed** — Request fulfilled (e.g., data exported, deletion processed)
4. **Rejected** — Request denied with admin notes
5. **Cancelled** — Cancelled by the requester

---

## Export Scope

The personal data export (`GET /api/privacy/export`) includes:

- **User** — id, email, created_at, last_sign_in_at, confirmed_at, phone, identity providers (no tokens)
- **Profile** — full_name, email, phone, avatar_url, profile_picture_url, role, onboarding_completed
- **Organization** — name, slug, owner_name, address, phone, email, branding, currency, timezone
- **Branches** — name, address, phone, email, is_active
- **Settings** — App settings for the organization (excludes internal fields)
- **Privacy Requests** — request_type, status, details, requested_at, processed_at, admin_notes

### Intentionally excluded

- Password hashes
- Auth tokens, provider tokens, session data
- Service secrets (service_role key, environment variables)
- Internal RLS/security fields
- Business records (products, customers, invoices, repairs, expenses, etc.)
- Other users' personal data
- Full business database export

To export full business records, use the Backup & Restore tab (owner/admin only).

---

## Platform Admin Handling

In the Platform Console (`/platform`), a **Privacy Requests** overview section shows:

- Total request count
- Pending review count
- Deletion request count

Full management UI (filter, triage, mark as completed/rejected, add admin notes) is a future
enhancement. Currently, admins can manage requests directly from the Supabase Dashboard or
via the `privacy_requests` table.

---

## Manual Deletion Process

This release does **not** implement automatic deletion. When a deletion request is received:

1. Admin marks request as `in_review`
2. Admin verifies account/shop ownership
3. Admin performs manual deletion via Supabase Dashboard or script
4. Admin marks request as `completed` with notes

Future releases will implement a semi-automated deletion workflow.

---

## Testing Checklist

1. Logged-out user cannot access Privacy Center (redirects to login)
2. Signed-in user sees Privacy Center tab in Settings
3. User can create access/export/deletion/correction request
4. User sees only their own requests
5. User can cancel a pending/in-review request
6. User cannot cancel a completed/rejected request
7. User can download JSON export
8. Export contains no secrets, tokens, or passwords
9. Export does not include other tenants' data
10. Dark/light mode is readable
11. Public /data-deletion still works and links to Privacy Center
12. /privacy mentions in-app Privacy Center
13. No service role appears in client bundle
14. Rate limit: max 5 pending requests per user

---

## GDPR Notes

- Users can submit `access`, `export`, `correction`, `deletion`, `restriction`, `portability`,
  and `objection` requests
- Manual review ensures requests are legitimate before processing
- Deletion is not automatic — prevents accidental/abusive data loss
- Export covers personal data and shop summary (not full business database)
- Email fallback available for users who cannot sign in
- Response within applicable GDPR timelines (manual process)
