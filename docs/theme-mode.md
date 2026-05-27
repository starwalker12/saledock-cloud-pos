# Theme modes

SaleDock Cloud POS supports **Light**, **Dark**, and **System** modes from the topbar theme selector.

## Behavior

- **Light** keeps the original bright operational interface.
- **Dark** uses a deep slate background, readable white text, visible borders, and the SaleDock blue accent.
- **System** follows the device/browser preference through `next-themes`.

The theme toggle waits until the client is mounted before showing the final selected state. This avoids hydration mismatch while keeping the control compact in the topbar.

## Readability rules

- App shell, sidebar, topbar, mobile nav, search, cards, tables, filters, forms, alerts, tabs, and empty states use dark-safe colors.
- Inputs keep visible borders and readable placeholder text.
- Muted text remains readable against dark surfaces.
- Blue action buttons and links remain high contrast.

## Print safety

Print views remain light/white even when the app is in dark mode. The global print CSS hides the app shell and `.theme-toggle`, resets dark backgrounds and text, and preserves invoice, repair, return, and daily-closing A4/80mm receipt layouts.
