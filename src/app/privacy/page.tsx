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
              src="/saledock-logo.svg"
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
            information when you use our service.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">1. Information We Collect</h2>

          <h3 className="font-semibold text-slate-950 dark:text-white">Account Information</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Full name</li>
            <li>Email address</li>
            <li>Phone number</li>
            <li>Profile picture URL (if provided via OAuth or upload)</li>
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

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">2. How We Use Your Information</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To provide, maintain, and improve the SaleDock POS service</li>
            <li>To authenticate your identity and authorize access to your shop</li>
            <li>To generate receipts, invoices, reports, and business analytics</li>
            <li>To enable data backup and restore functionality</li>
            <li>To communicate with you about your account, invoices, or support requests</li>
            <li>To detect and prevent abuse, fraud, or unauthorized access</li>
          </ul>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">3. Data Separation</h2>
          <p>
            Each organization/shop operates in an isolated data partition. Your business data is
            accessible only to users within your organization and is never visible to users of other
            organizations. Platform administrators have access limited to aggregated, non-identifying
            usage data and the ability to suspend accounts — they do not access your business
            transactions or customer data.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">4. Data Sharing</h2>
          <p>
            We do not sell your personal data or business data to advertisers or third parties.
            We may share data only:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>With your explicit consent</li>
            <li>To comply with a legal obligation or court order</li>
            <li>To protect the rights, property, or safety of SaleDock, our users, or others</li>
            <li>With service providers who help us operate the platform (e.g., Supabase for database
                hosting, Vercel for application hosting), under data processing agreements</li>
          </ul>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">5. Data Retention</h2>
          <p>
            We retain your data for as long as your account is active. If you delete your account
            or request data deletion, we will remove your data within 30 days, subject to legal
            retention requirements.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">6. Data Security</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your data,
            including encryption in transit (TLS), row-level security in the database, and
            strict access controls. However, no method of electronic storage or transmission is
            100% secure, and we cannot guarantee absolute security.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">7. Your Rights</h2>
          <p>
            Depending on your jurisdiction, you may have the right to:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Access the personal data we hold about you</li>
            <li>Request correction or deletion of your data</li>
            <li>Object to or restrict processing of your data</li>
            <li>Request data portability</li>
            <li>Withdraw consent at any time</li>
          </ul>
          <p>
            To exercise these rights, contact us at the email below.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">8. Contact</h2>
          <p>
            For privacy-related questions or requests, contact:
          </p>
          <p className="font-semibold text-blue-700 dark:text-blue-400">
            fardan.aatir@outlook.com
          </p>
        </section>
      </article>
    </main>
  );
}
