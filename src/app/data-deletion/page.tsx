import Link from "next/link";
import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { PublicPageHeader } from "@/components/layout/public-page-header";

export const metadata: Metadata = {
  title: "Data Deletion Instructions | SaleDock Cloud POS",
  description: "How to request deletion of your SaleDock Cloud POS account and personal data.",
};

export default function DataDeletionPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 dark:bg-slate-900">
      <article className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-[#fff] p-6 shadow-xl sm:p-10 dark:border-slate-700 dark:bg-slate-800">
        <PublicPageHeader />
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/saledock-logo-full.png"
              alt="SaleDock Cloud POS"
              className="mx-auto mb-2 h-10 w-auto max-w-[180px] object-contain dark:brightness-0 dark:invert"
            />
          </Link>
        </div>

        <h1 className="mb-6 text-2xl font-black text-slate-950 sm:text-3xl dark:text-white">
          Data Deletion Instructions
        </h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          Last updated: May 2026
        </p>

        <section className="space-y-5 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <p>
            SaleDock Cloud POS lets shop owners manage sales, inventory, repairs, invoices, expenses,
            and reports. If you want your account and associated personal data deleted, you can request
            deletion by email.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">How to Request Deletion</h2>
          <p>
            Send an email to the address below with the subject line specified. Include the following
            details in your request:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Account email used to sign in</li>
            <li>Full name</li>
            <li>Shop name, if available</li>
            <li>Optional reason for deletion</li>
          </ul>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center dark:border-slate-600 dark:bg-slate-900">
            <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Email</p>
            <p className="text-sm font-bold text-blue-700 dark:text-blue-400">
              fardan.aatir@outlook.com
            </p>
          <div className="mt-4 mb-4 rounded-lg bg-blue-50 p-3 text-center dark:bg-blue-950/30">
            <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:bg-blue-800 dark:text-blue-200">New</span>
            <p className="mt-1 text-sm font-semibold text-blue-800 dark:text-blue-200">
              Signed-in users can submit privacy requests from{" "}
              <a href="/settings?tab=privacy" className="underline">Settings → Privacy Center</a>.
            </p>
          </div>

          <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Subject</p>
          <p className="text-sm font-bold text-slate-950 dark:text-white">
            SaleDock Data Deletion Request
          </p>

            <a
              href="mailto:fardan.aatir@outlook.com?subject=SaleDock%20Data%20Deletion%20Request"
              className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
            >
              <Mail className="h-4 w-4" />
              Send deletion request
            </a>
          </div>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">What Happens Next</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>We may verify account or shop ownership before processing deletion.</li>
            <li>After verification, eligible account, profile, and shop data will be deleted or anonymized.</li>
            <li>Some limited records may be retained where required for security, fraud prevention, audit logs, tax, accounting, dispute resolution, or legal obligations.</li>
            <li>Deletion requests are handled within a reasonable period. GDPR requests from eligible users are handled according to GDPR timelines.</li>
          </ul>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">Your Other Rights</h2>
          <p>
            You can also request access, correction, restriction, portability, or object to processing
            of your personal data by emailing the same address.
          </p>

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">Related Policies</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/privacy"
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Terms of Service
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}
