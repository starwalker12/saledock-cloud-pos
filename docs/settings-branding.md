# Settings and shop branding

The Settings module lets owners and admins maintain the real shop profile used across the online POS.

## Editable fields

- Business profile: shop name, owner name, phone, WhatsApp support number, email, and address.
- Branch profile: branch name, branch phone, and branch address.
- Branding: logo path or URL, invoice footer, repair receipt terms, and default print format.
- Regional defaults: currency code, timezone, and default low-stock threshold.

## Where branding appears

- Invoice detail print header and footer.
- Repair receipt print header, footer, and intake terms.
- Reports print letterhead.
- Invoice and repair 80mm receipt layouts and WhatsApp share messages.
- App shell and dashboard continue to read organization and branch profile data.
- The topbar also includes a Light/Dark/System theme selector for operator comfort.

## Storage approach

No paid storage is enabled. The default logo remains `/gadget-zone-logo.png`. A text URL/path field is available now; actual upload/storage can be added later if needed.

Theme preferences are browser-side UI preferences handled by `next-themes`; they do not require database storage or paid services. Print layouts stay white/light regardless of the selected theme.

The module reuses existing tables:

- `organizations` for shop name, contact, currency, and timezone.
- `branches` for branch name, phone, and address.
- `app_settings` for branding-specific values and JSON settings.

No seed data is required.

## Permissions

Only `owner` and `admin` can save changes. Other roles can view the settings page in read-only mode.

## Deferred

- Logo upload/file storage.
- Direct ESC/POS printer integration.
- Return/refund receipt detail printing after a dedicated return detail page exists.
- Tax and discount policy automation.
