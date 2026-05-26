# Global Search / Command Search Specifications

This document outlines the architecture, indexing capabilities, authorization borders, and user interface mechanics of the **Global Search / Command Search** module in Gadget Zone Online POS.

---

## 1. Functional Specifications

The Global Search module serves as a command palette for rapid navigation and indexing across the entire POS shop system. It is designed to be:
*   **Organization-Scoped:** Results are strictly filtered by the authenticated user's `organization_id` using database-level constraints.
*   **Role-Aware:** Privileged search indexes (Staff profiles, system audit logs) are programmatically skipped for non-admin accounts.
*   **Highly Responsive:** Page routing is resolved instantaneously, and data indexing uses asynchronous debounced requests (200ms) with clean loader states.

---

## 2. Searchable Indexes & Permissions

The search aggregator queries the following tables in parallel, using proportional limits of **max 5 results per category** to maintain readability:

| Index | Searched Fields | Privilege Required | Group Label | Icon |
|---|---|---|---|---|
| **Pages / Actions** | Title, Href, Navigation routes | None | *Pages & Navigation* | Matches route icon |
| **Products & Services** | Item Name, SKU, Barcode | None | *Products & Services* | `Package` / `Sparkles` |
| **Customers** | Full Name, Phone Number, Email | None | *Customers Database* | `User` |
| **Sales Invoices** | Invoice Number | None | *Sales Invoices* | `FileText` |
| **Repairs** | Job Number, Device Type/Model, Name/Phone, IMEI | None | *Repairs Workflow* | `Wrench` |
| **Returns & Refunds** | Return Number, Linked Invoice | None | *Returns & Refunds* | `RotateCcw` |
| **Shop Expenses** | Category, Vendor, Notes, Method | None | *Shop Expenses* | `Receipt` |
| **Staff Users** | Full Name, Role | `canManageUsers` | *Staff Directory* | `UserCog` |
| **System Audit Logs** | Module, Action, Details | `canViewAuditLog` | *System Audit Logs* | `ScrollText` |

---

## 3. User Interface & Accessibility

### Command Palette Overlay
Clicking the search input in the Topbar (or using the keyboard shortcut) triggers a focus-locked command palette modal.
*   **Glassmorphism Backdrop:** Rendered with a high-fidelity translucent overlay (`bg-slate-900/50` + `backdrop-blur-xs`) centering the search panel.
*   **Desktop/Tablet View:** Panel is centered with a fixed height and footer listing guide shortcuts.
*   **Mobile Viewport:** Panel expands to a full-screen slide-over sheet optimized for touch targets.

### Keyboard Shortcuts
*   `⌘ + K` or `Ctrl + K` — Toggles the search overlay open and closed.
*   `ESC` — Closes the search panel.
*   `ArrowDown` / `ArrowUp` — Cycles the active selection highlight down and up the matching result list.
*   `Enter` — Selects the highlighted match, triggers path routing, and automatically closes the overlay.

---

## 4. Technical Constraints

### No Focus Stealing
To guarantee typing continuity, cursor focus is strictly locked inside the `<input>` element. Cycling through result selections with the arrow keys modifies the `highlightIndex` state programmatically (updating active background highlighting styles and scrolling matches into view), but **never** shifts active browser focus away from the keyboard input.

### Client-Side Debouncing
Server-side calls are throttled using a debouncing function of `200ms` wrapped inside React's `useEffect` hook. This prevents continuous keystrokes from flooding the serverless API routes while maintaining instant query responsiveness.
