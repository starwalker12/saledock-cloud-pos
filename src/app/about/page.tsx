import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, MapPin, Info } from "lucide-react";
import { PublicPageHeader } from "@/components/layout/public-page-header";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "About Us — SaleDock Cloud POS",
  description: "Learn more about SaleDock Cloud POS, a reliable point-of-sale tool for retail and repair shops.",
};

export default function AboutPage() {
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

        <h1 className="mb-6 text-2xl font-black text-slate-950 sm:text-3xl dark:text-white flex items-center gap-2">
          <Info className="h-6 w-6 text-blue-700 dark:text-blue-400" />
          About SaleDock
        </h1>

        <section className="space-y-6 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <div className="space-y-4">
            <p>
              SaleDock is a modern, cloud-based point-of-sale (POS) web application designed specifically to meet the daily operational needs of retail and repair shops. Our platform streamlines core business workflows, allowing you to manage sales, checkout, inventory, invoices, repairs, customers, suppliers, expenses, and reporting from one intuitive dashboard.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
            <h2 className="text-base font-bold text-slate-950 dark:text-white mb-2">Our Mission</h2>
            <p>
              We believe that local businesses and repair shops deserve access to professional, reliable software without excessive cost or complexity. SaleDock is focused on providing a simple, affordable, and dependable tool that helps business owners track transactions, understand inventory lifecycles, and coordinate repairs without technical overhead.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-950 dark:text-white flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-700 dark:text-blue-400" />
              Our Location
            </h2>
            <p>
              SaleDock is proudly developed and operated in Lahore, Pakistan. Our primary location is at Beaconhouse National University, Lahore.
            </p>

            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mt-3">
              <iframe
                title="Beaconhouse National University Lahore Map"
                src="https://maps.google.com/maps?q=Beaconhouse%20National%20University%20Lahore&z=15&output=embed"
                width="100%"
                height="350"
                style={{ border: 0 }}
                allowFullScreen={false}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>

            <div className="mt-2 text-right">
              <a
                href="https://www.google.com/maps/search/?api=1&query=Beaconhouse+National+University+Lahore"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
              >
                Open in Google Maps
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          {/* Action button to contact */}
          <div className="pt-4 flex justify-center">
            <Link
              href="/contact"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              Get in Touch / Contact Us
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Footer links */}
          <div className="border-t border-slate-200 pt-5 text-center dark:border-slate-700">
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400 dark:text-slate-500">
              <Link href="/privacy" className="hover:text-blue-700 dark:hover:text-blue-400">Privacy Policy</Link>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <Link href="/terms" className="hover:text-blue-700 dark:hover:text-blue-400">Terms of Service</Link>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <Link href="/data-deletion" className="hover:text-blue-700 dark:hover:text-blue-400">Data Deletion</Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
