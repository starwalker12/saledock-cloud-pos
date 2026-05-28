import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — SaleDock Cloud POS",
};

export default function PrivacyPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 dark:bg-slate-900">
      <article className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-10 dark:border-slate-700 dark:bg-slate-800">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/saledock-logo-full.png"
              alt="SaleDock Cloud POS"
              className="mx-auto mb-2 h-10 w-auto max-w-[180px] object-contain"
            />
          </Link>
        </div>

        <h1 className="mb-6 text-2xl font-black text-slate-950 sm:text-3xl dark:text-white">
          Privacy Policy
        </h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          Last updated: May 2026
        </p>

        <section className="space-y-5 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <p>
            SaleDock Cloud POS (&quot;SaleDock,&quot; &quot;we,&quot; &quot;us&quot;) provides a cloud-based point-of-sale platform
            for retail businesses. This Privacy Policy explains how we collect, use, and protect your
            information when you use our service. This is a GDPR-aligned policy and does not constitute
            legal advice.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">1. Data Controller and Contact</h2>
          <p>
            SaleDock Cloud POS is the data controller for the personal data collected through the platform.
          </p>
          <p className="font-semibold text-blue-700 dark:text-blue-400">
            fardan.aatir@outlook.com
          </p>
          <p className="mt-2">
            If you have a signed-in account, you can also submit privacy requests directly from{" "}
            <a href="/settings?tab=privacy" className="text-blue-700 underline dark:text-blue-400">Settings → Privacy Center</a>.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">2. Personal Data We Collect</h2>

          <h3 className="font-semibold text-slate-950 dark:text-white">Account Information</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Full name</li>
            <li>Email address</li>
            <li>Phone number (if provided)</li>
            <li>Profile picture URL (if provided via OAuth or upload)</li>
            <li>Login provider identifiers (email/password hash or OAuth provider ID)</li>
          </ul>

          <h3 className="font-semibold text-slate-950 dark:text-white">Shop Information</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Shop name, business subtitle, and description</li>
            <li>Shop address and phone number</li>
            <li>Shop logo and branding assets</li>
            <li>Social media links</li>
            <li>Location / Google Maps link</li>
          </ul>

          <h3 className="font-semibold text-slate-950 dark:text-white">Business Data</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Products and inventory (names, SKUs, barcodes, prices, stock levels)</li>
            <li>Customer information (names, phone numbers, emails, ledgers)</li>
            <li>Invoices, receipts, and transaction records</li>
            <li>Repair job records and status history</li>
            <li>Expense records</li>
            <li>Business reports and daily closing summaries</li>
            <li>Backup and import files</li>
          </ul>

          <h3 className="font-semibold text-slate-950 dark:text-white">OAuth Data</h3>
          <p>
            If you sign in via Google or Facebook (when enabled), we receive the email address, name,
            and profile picture associated with your OAuth provider. We do not receive your password
            or any other data from those accounts.
          </p>

          <h3 className="font-semibold text-slate-950 dark:text-white">Technical and Usage Data</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Audit and security logs (login attempts, access records, actions performed)</li>
            <li>Session data and IP addresses</li>
            <li>Technical usage data for platform operation and improvement</li>
          </ul>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">3. Purpose and Lawful Basis</h2>
          <p>We process your personal data for the following purposes and on the following lawful bases:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account creation and authentication</strong> — to create your account, authenticate your identity, and authorize access to your shop (performance of a contract).</li>
            <li><strong>Providing POS services</strong> — to enable sales, inventory, repairs, invoices, expenses, reports, backups, and all core platform features (performance of a contract).</li>
            <li><strong>Security and audit logs</strong> — to detect and prevent abuse, fraud, or unauthorized access (legitimate interest).</li>
            <li><strong>Customer support</strong> — to communicate with you about your account, invoices, or support requests (performance of a contract / legitimate interest).</li>
            <li><strong>Legal, tax, and accounting obligations</strong> — to comply with applicable legal requirements (legal obligation).</li>
            <li><strong>Optional OAuth sign-in</strong> — to allow sign-in via Google or Facebook when you choose to use those providers (consent).</li>
          </ul>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">4. Data Minimization</h2>
          <p>
            We collect only the personal data that is necessary for account creation, shop setup,
            security, and POS operations. We do not collect data beyond what is required for these
            purposes.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">5. Data Separation</h2>
          <p>
            Each organization or shop operates in an isolated data partition with row-level security.
            Your business data is accessible only to users within your organization and is never visible
            to users of other organizations. Platform administrators have access limited to aggregated,
            non-identifying usage data and the ability to suspend accounts — they do not access your
            business transactions or customer data.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">6. Data Sharing</h2>
          <p>
            We do not sell your personal data or business data to advertisers or third parties.
            We may share data only:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>With your explicit consent</li>
            <li>To comply with a legal obligation or court order</li>
            <li>To protect the rights, property, or safety of SaleDock, our users, or others</li>
            <li>With service providers who help us operate the platform (see section on processors below), under data processing agreements</li>
          </ul>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">7. Data Retention</h2>
          <p>
            We retain your personal data for as long as your account or shop is active. After a verified
            deletion request, eligible data will be deleted or anonymized within a reasonable period,
            unless retention is required by law, security, audit, fraud prevention, dispute resolution,
            tax, or accounting obligations. Some limited records may be retained for the duration
            required by applicable statutory periods.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">8. User Rights</h2>
          <p>
            Depending on your jurisdiction, including under the GDPR if applicable, you may have the
            following rights:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Access</strong> — request a copy of the personal data we hold about you</li>
            <li><strong>Rectification</strong> — request correction of inaccurate or incomplete data</li>
            <li><strong>Erasure</strong> — request deletion of your data (see <Link href="/data-deletion" className="text-blue-700 underline dark:text-blue-400">Data Deletion Instructions</Link>)</li>
            <li><strong>Restriction</strong> — request restriction of processing in certain circumstances</li>
            <li><strong>Portability</strong> — request your data in a machine-readable format</li>
            <li><strong>Objection</strong> — object to processing based on legitimate interest</li>
            <li><strong>Withdraw consent</strong> — withdraw consent where processing is based on consent (e.g., OAuth login)</li>
            <li><strong>Complaint</strong> — lodge a complaint with a supervisory authority where applicable</li>
          </ul>
          <p>
            To exercise these rights, contact us at the email below. We will respond within the
            timelines required by applicable law.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">9. Data Security</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your data,
            including:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Encryption in transit (TLS)</li>
            <li>Row-level security (RLS) in the database for tenant isolation</li>
            <li>Role-based access controls</li>
            <li>Audit logging of security-relevant actions</li>
            <li>Input sanitization and SQL injection hardening</li>
            <li>No service-role key exposure in client-side code</li>
          </ul>
          <p>
            However, no method of electronic storage or transmission is 100% secure, and we cannot
            guarantee absolute security.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">10. Processors and Vendors</h2>
          <p>
            We use the following service providers to operate the platform. Their processing of your
            data is governed by their applicable data processing terms:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Supabase Inc.</strong> — authentication, database, and storage services</li>
            <li><strong>Vercel Inc.</strong> — hosting and deployment infrastructure</li>
            <li><strong>Google LLC</strong> — optional OAuth login (where enabled by the user)</li>
            <li><strong>Meta Platforms, Inc.</strong> — optional OAuth login (where enabled by the user)</li>
          </ul>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">11. International Transfers</h2>
          <p>
            Your data may be processed outside the country where you are located, depending on
            infrastructure and vendor locations. Where the GDPR applies, we rely on appropriate
            safeguards for international transfers, including Standard Contractual Clauses where
            offered by our vendors, or other recognized transfer mechanisms under applicable law.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">12. Breach Response</h2>
          <p>
            Security incidents are assessed for risk to data subjects. Where the GDPR or other
            applicable law requires, the relevant supervisory authority and affected users will be
            notified according to applicable timelines.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">13. Special Category Data</h2>
          <p>
            SaleDock is not designed to collect or process special category data (health, biometric,
            genetic, political opinions, religious beliefs, trade union membership, sexual orientation,
            or similar sensitive data). Users should not enter such data into the platform.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">14. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify users of material
            changes via email or a platform notice. Continued use of SaleDock after changes takes
            effect constitutes acceptance of the updated policy.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">15. Contact</h2>
          <p>
            For privacy-related questions, requests, or concerns, contact:
          </p>
          <p className="font-semibold text-blue-700 dark:text-blue-400">
            fardan.aatir@outlook.com
          </p>

          {/* Footer links */}
          <div className="border-t border-slate-200 pt-5 text-center dark:border-slate-600">
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400 dark:text-slate-500">
              <Link href="/data-deletion" className="hover:text-blue-700 dark:hover:text-blue-400">Data Deletion</Link>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <Link href="/terms" className="hover:text-blue-700 dark:hover:text-blue-400">Terms of Service</Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
