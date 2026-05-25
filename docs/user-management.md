# User management and staff invites

The User Management module lets owners and admins control staff access for the online POS.

## Who can manage users

Only `owner` and `admin` profiles can use `/users`.

Other roles are blocked from staff management:

- `manager`
- `cashier`
- `technician`

## Staff invites

Owners/admins can invite staff by email with:

- full name
- role
- branch assignment

The invite is sent through Supabase Auth Admin on the server using the service-role client. The service role is never exposed to browser code.

Public signup remains closed after first-owner onboarding. New staff should join through an invite.

## Roles

- `owner`: full business control, including user management.
- `admin`: operational admin, including user management.
- `manager`: catalog, POS, returns, expenses, daily closing, reports, and repairs workflows.
- `cashier`: POS and customer-facing workflows.
- `technician`: repair workflow updates.

## Safety guards

- Owners/admins can edit staff name, role, and branch.
- Users can be deactivated/reactivated.
- An owner cannot deactivate their own active owner account.
- The system prevents demoting or deactivating the last active owner/admin.

## Current limitations

- Dedicated invite status columns are not added yet. The UI derives pending/accepted status from Supabase Auth where available.
- Password reset and recovery-code flows are still future work.
- A granular permission editor is planned for a later milestone.
- Resending invites uses Supabase Auth's invite email behavior.

No seed data is required for this module.
