import Link from "next/link";
import type { Metadata } from "next";
import { PublicPageHeader } from "@/components/layout/public-page-header";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Terms of Service — SaleDock Cloud POS",
};

export default function TermsPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 dark:bg-slate-900">
      <article className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-[#fff] p-6 shadow-xl sm:p-10 dark:border-slate-700 dark:bg-slate-800">
        <PublicPageHeader />
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/">
            <Logo className="mx-auto mb-2 h-10 w-auto max-w-[180px]" />
          </Link>
        </div>

        <h1 className="mb-6 text-2xl font-black text-slate-950 sm:text-3xl dark:text-white">
          Terms of Service
        </h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          Last updated: May 2026
        </p>

        <section className="space-y-5 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <p>
            Welcome to SaleDock Cloud POS (&quot;SaleDock,&quot; &quot;we,&quot; &quot;us&quot;). By using our cloud-based
            point-of-sale platform, you agree to these Terms of Service. If you do not agree,
            do not use the service.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">1. Service Description</h2>
          <p>
            SaleDock is a software-as-a-service (SaaS) point-of-sale platform that allows retail
            businesses to manage sales, inventory, customers, repairs, expenses, and reports.
            The platform is accessed via a web browser and requires an internet connection.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">2. User Responsibilities</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>You are responsible for the accuracy and completeness of all business data you enter.</li>
            <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
            <li>You must not use SaleDock for any illegal purpose or in violation of applicable laws.</li>
            <li>You must not attempt to access another organization&apos;s data or compromise the platform.</li>
            <li>You are responsible for the business and customer data you enter into the platform.</li>
            <li>You must have lawful rights or permissions to enter customer, employee, supplier, and business records into SaleDock. You are responsible for ensuring that your use of the platform complies with applicable data protection laws regarding the personal data you process.</li>
          </ul>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">3. Backups and Data Loss</h2>
          <p>
            SaleDock provides backup export and import features for your convenience. However:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>You are solely responsible for maintaining your own backups of critical business data.</li>
            <li>We recommend regularly exporting your data as a safety measure.</li>
            <li>SaleDock is not liable for any data loss, corruption, or downtime.</li>
            <li>Importing data from external sources is your responsibility — verify the integrity of
                imported data before relying on it.</li>
          </ul>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">4. Account Suspension</h2>
          <p>
            We reserve the right to suspend or terminate access to the platform, without prior notice, if:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>You violate these Terms of Service</li>
            <li>Your use of the platform is abusive, fraudulent, or illegal</li>
            <li>You interfere with the operation of the platform or other users&apos; access</li>
            <li>Required by applicable law or regulation</li>
          </ul>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">5. Intellectual Property</h2>
          <p>
            The SaleDock name, logo, branding, and platform code are owned by SaleDock. You may not
            reproduce, modify, distribute, or create derivative works without explicit permission.
            Your business data remains your property.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">6. No Warranty</h2>
          <p>
            SaleDock is provided &quot;as is&quot; and &quot;as available&quot; without any warranty, express or implied.
            We do not guarantee that the service will be uninterrupted, error-free, secure, or
            free from vulnerabilities. You use the platform at your own risk.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">7. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, SaleDock and its operators shall not
            be liable for any indirect, incidental, special, consequential, or punitive damages,
            including but not limited to loss of profits, data, business, or goodwill, arising out
            of or related to your use of the platform, even if advised of the possibility of such
            damages. Our total liability for any claim shall not exceed the amount you have paid
            us in the 12 months preceding the claim.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">8. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of SaleDock after changes
            constitutes acceptance of the updated Terms. We will notify users of material changes
            via email or a platform notice.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">9. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of Pakistan.
            Any disputes shall be resolved in the courts of Karachi, Pakistan.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">10. Data Deletion and Privacy</h2>
          <p>
            To request deletion of your account and associated data, please see our
            <Link href="/data-deletion" className="text-blue-700 underline dark:text-blue-400"> Data Deletion Instructions</Link>.
            For information about how we collect, use, and protect your personal data, see our
            <Link href="/privacy" className="text-blue-700 underline dark:text-blue-400"> Privacy Policy</Link>.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">11. Contact</h2>
          <p>For questions about these Terms, contact:</p>
          <p className="font-semibold text-blue-700 dark:text-blue-400">
            fardan.aatir@outlook.com
          </p>

          {/* Footer links */}
          <div className="border-t border-slate-200 pt-5 text-center dark:border-slate-600">
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400 dark:text-slate-500">
              <Link href="/data-deletion" className="hover:text-blue-700 dark:hover:text-blue-400">Data Deletion</Link>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <Link href="/privacy" className="hover:text-blue-700 dark:hover:text-blue-400">Privacy Policy</Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
