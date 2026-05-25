# Repairs Workflow Module

This document outlines the business rules, security permissions, user interface flows, and printing setups for the Customer Repairs module in the Gadget Zone Online POS system.

---

## 1. Objectives & Business Rules

The Repairs module manages customer device repair jobs from initial intake to final delivery:
- **Intake**: Capture customer parameters (linked to registered profiles or entered manually), device parameters (type, model, serial/IMEI), accessories received, estimated cost, expected delivery, and initial private notes.
- **Advance Collections**: Advances paid (`advance_paid`) are recorded during intake. The remaining balance due is automatically computed server-side:
  `Balance Due = Final Cost (or Estimated Cost) - Advance Paid`
- **Job Number Sequences**: Job numbers are generated sequentially per organization as human-readable codes, e.g. `RJ-000001`, `RJ-000002`. This is implemented atomically server-side with concurrency retry handlers.
- **Workflow Status Transitions**:
  - `received` (Intake completed)
  - `waiting_for_parts` (Waiting for component deliveries)
  - `in_progress` (Repair in progress on technician bench)
  - `completed` (Repair completed, ready for delivery)
  - `delivered` (Device returned to customer, delivered timestamp logged, final cost locked)
  - `cancelled` (Job cancelled by customer or unfixable)

---

## 2. Security & Permissions

Strict role permissions are enforced across all server actions and API views:
- **Owner / Admin / Manager**: Full privileges (create, edit device parameters, adjust costs, record status changes, private technical notes, and delete/archive).
- **Technician**: Can create intake records, read job history, log diagnoses, update private notes, and change status states. They *cannot* edit core device specifications, estimates, or advances after creation.
- **Cashier**: Can create intake records (device intake) and read details. They *cannot* edit price estimates, technical private notes, or delete jobs.
- **Viewer**: Read-only access (no write operations).

---

## 3. Printable Repair Receipts (A4)

A dedicated native print layout is integrated directly on the repair detail page:
- **Trigger**: The **"Print Receipt"** button triggers the browser's native `window.print()` frame.
- **Layout Overrides**: Under `@media print`, all shell navigation menus, sidebars, interactive status dropdowns, update forms, and buttons are cleanly hidden.
- **Format**: Renders a clean, high-contrast, double-entry A4 receipt sheet complete with:
  - Organization branding and branch contact info.
  - Sequential Job No, dates, and intake operators.
  - Linked or manual customer coordinates.
  - Device parameters, serial numbers, accessories list, and fault logs.
  - Cost breakdowns (Estimates, Advances paid, and Balance due).
  - Built-in legal terms & conditions (labor warranty, data liability warnings, and signature lines).

---

## 4. Deferred / Upcoming Phases

For the initial MVP launch, the following items are documented as deferred:
1. **80mm Thermal Sticky Label**: Dedicated 80mm sticky sticker printing for attaching directly to physical customer devices on shelves.
2. **Automated WhatsApp Alerts**: A direct integration allowing operators to click "WhatsApp Update" and auto-populate a link (`wa.me`) with custom templates notifying customers when status is updated to `completed` (Ready for Delivery).
3. **Technician Assignment**: Detailed multi-technician queues and labor/commission tracking for specific repairs.
4. **Invoice Conversion**: Atomic conversion of completed repairs into sales invoices inside the POS checkout.
