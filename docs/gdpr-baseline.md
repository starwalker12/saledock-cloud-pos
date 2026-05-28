# GDPR Baseline — SaleDock Cloud POS

> **Disclaimer:** This document describes the GDPR-aligned measures and processes implemented in SaleDock Cloud POS. It does not constitute legal advice. Consult a qualified data protection professional for compliance guidance.

## Lawful Bases

SaleDock relies on the following lawful bases under Article 6 of the GDPR:

| Processing Activity | Lawful Basis |
|---|---|
| Account creation, authentication, service delivery | Performance of a contract (Article 6(1)(b)) |
| Security, audit logs, fraud prevention | Legitimate interest (Article 6(1)(f)) |
| Compliance with tax, accounting, legal obligations | Legal obligation (Article 6(1)(c)) |
| Optional OAuth login (Google/Facebook) | Consent (Article 6(1)(a)) |
| Communication about account or support requests | Performance of a contract / legitimate interest |

## Data Processing Principles

1. **Lawfulness, fairness, transparency** — Privacy Policy and Data Deletion page explain collection and processing.
2. **Purpose limitation** — Data is collected only for providing POS services, security, and legal compliance.
3. **Data minimization** — Only data needed for account, shop setup, security, and POS operations is collected.
4. **Accuracy** — Users can update their account and shop data via settings.
5. **Storage limitation** — Data is retained while the account is active and deleted/anonymized after verified deletion requests, subject to legal retention requirements.
6. **Integrity and confidentiality** — Role-based access, tenant isolation (RLS), TLS, input sanitization, and no service-role key in client.

## User Rights Process

Users may exercise their rights by emailing:

| Right | Description |
|---|---|
| Access | Request a copy of personal data held |
| Rectification | Request correction of inaccurate data |
| Erasure (right to be forgotten) | Request deletion via data-deletion page |
| Restriction | Request restriction of processing |
| Portability | Request data in a machine-readable format |
| Objection | Object to processing based on legitimate interest |
| Withdraw consent | Withdraw consent for OAuth login (disconnect provider) |

**Process:**
1. User emails `fardan.aatir@outlook.com` with the request.
2. Identity/ownership is verified before processing.
3. Requests are handled within the GDPR-mandated one-month timeline.
4. If a request cannot be fulfilled (e.g., legal retention requirement), the user is informed in writing.

## Deletion Request Process

See `src/app/data-deletion/page.tsx` for the public-facing page.

Step-by-step:
1. User sends email with subject "SaleDock Data Deletion Request" including account email, full name, and optionally shop name.
2. Ownership of the account/shop is verified.
3. Eligible data (account profile, shop settings, business records) is deleted or anonymized.
4. Retained data is limited to what is legally required (audit logs, tax records, security events).
5. User is notified when deletion is complete.

## Retention Notes

| Data Type | Retention Period |
|---|---|
| Account / profile data | Deleted within reasonable period after verified request |
| Shop / business data | Deleted or anonymized after verified request |
| Audit logs | Retained for security and legal purposes per applicable law |
| Tax / accounting records | Retained per statutory requirements |
| Backup snapshots | Cycled according to rotation schedule; data in old backups may persist until rotation |

## Processors and Vendors

| Vendor | Service | Data Processing Terms |
|---|---|---|
| Supabase Inc. | Authentication, database, storage | Processing under Supabase DPA / applicable terms |
| Vercel Inc. | Hosting, deployment | Processing under Vercel DPA / applicable terms |
| Google LLC | Optional OAuth login (Google) | Processing under Google API Terms / applicable terms |
| Meta Platforms, Inc. | Optional OAuth login (Facebook) | Processing under Meta Platform Terms / applicable terms |

Processing by vendors is handled under their applicable data processing agreements. Specific SCC or DPA details are not documented here; refer to each vendor's published terms.

## International Transfers

Data may be processed outside the user's country depending on infrastructure and vendor locations. Where GDPR applies, transfers rely on appropriate safeguards such as Standard Contractual Clauses (SCCs) where offered by the vendor, or other transfer mechanisms recognized under applicable law.

## Breach Response

1. Security incidents are assessed for risk to data subjects.
2. Where GDPR Article 33/34 requires, the supervisory authority and affected users are notified within the applicable timelines.
3. A breach-response procedure is maintained but not publicly detailed for security reasons.

## Special Category Data

SaleDock is not designed to collect or process special category data (health, biometric, genetic, political opinions, religious beliefs, trade union membership, sexual orientation, or similar sensitive data). Users should not enter such data into the platform.

## Follow-ups for Future Implementation

- [ ] In-app privacy center allowing users to access, download, and manage their data
- [ ] Downloadable data export (JSON/CSV) for portability requests
- [ ] Admin deletion workflow for processing deletion requests from the dashboard
- [ ] Cookie consent banner if analytics or marketing cookies are added
- [ ] Processor / DPA register tracking all sub-processors
- [ ] Breach-response runbook documented for internal use
