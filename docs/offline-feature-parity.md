# Offline Desktop Feature Parity Progress

This document tracks and audits the feature set parity between the legacy offline desktop application and the newly developed online web POS platform.

---

## Parity Feature Matrix

| Feature Module | Offline Desktop App State | Online Web POS App State | Parity Status | Details & Implementation |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication & Profile Setup** | Configured via SQLite local database. | Supabase Authentication & Multi-tenant Organizations. | **Fully Aligned** | Implemented multi-user invitation structures, role profiles, and onboarding setup flows. |
| **Catalog CRUD** | Local sqlite management of categories & products. | Products and categories CRUD with reactive caching. | **Fully Aligned** | Full reactive filters, pagination, and stock adjustment logs active. |
| **POS Checkout** | Standalone checkout panel. | Server-validated atomic transactional POS checks. | **Fully Aligned** | Standard payment modes, notes logging, and instant product stock updates. |
| **FIFO Stock Tracking** | Local stock lot tables. | Supabase FIFO stock lot tracking with remaining qty calculations. | **Fully Aligned** | Products map directly to lots, keeping pricing and counts mathematically aligned. |
| **Returns & Refunds** | Custom offline receipts. | Tracked return receipts with inventory restock policies. | **Fully Aligned** | Handles partial returns and refunds. |
| **Repairs Management** | Basic job lists. | Advanced status progression board with SMS receipts prep. | **Fully Aligned** | Stores payment methods, diagnosed problem descriptions, and tracking numbers. |
| **Daily Closings** | Standard closing file. | Day boundaries closing reconciliation forms. | **Fully Aligned** | Expected cash counters vs physical count checks, logging differences. |
| **Audit Logs UI** | Offline log lists. | Scoped actor logs UI with searchable actions and categories. | **Fully Aligned** | Zero secrets recorded. Active audit logs track seeder, checkout, and inventory adjustments. |
| **Global Quick Search** | Local indexing. | Permission-aware unified page & entity instant query panel. | **Fully Aligned** | Zero focus-steals, immediate updates, click-only navigation. |
| **Loss Prevention** | Warning flags. | Server-validated transactional purchase/sale cost checks. | **Fully Aligned** | Product save barriers, discount checks, owner loss-overrides, and logs. |
| **Demo Seeder** | Hardcoded scripts. | Owner/Admin seeder dashboard inside Settings tab. | **Fully Aligned** | Seeder with typing double-confirmations (`CREATE DEMO DATA`/`REMOVE DEMO DATA`). |
| **Database Backups** | ZIP with `.db` sqlite file. | ZIP backups with manifest, JSON exports, and portable CSV collections. | **Fully Aligned** | Restores online backup packages safely in the browser with deduplication keys. |
| **Branding & Header Cleanup** | Standard desktop logos. | Single professional corner logo with streamlined headings. | **Fully Aligned** | Removed repeated global branch eyebrows. |
| **Supabase Hardening** | Local credentials. | Strict search path alteration and authentication role restrictions. | **Fully Aligned** | Altered functions `set_updated_at` and contexts against path hijacking. |
