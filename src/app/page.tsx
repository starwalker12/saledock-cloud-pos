import Link from "next/link";
import { env } from "@/lib/env";
import { getCurrentContext } from "@/lib/auth/session";
import { ArrowRight, LayoutDashboard, LogIn } from "lucide-react";

export default async function HomePage() {
  let signedInUser: { name: string; needsOnboarding: boolean } | null = null;

  if (env.isSupabaseConfigured) {
    const { user, profile, organization } = await getCurrentContext();
    if (user) {
      const needsOnboarding = !profile?.organization_id || !profile?.onboarding_completed || !organization?.onboarding_completed;
      signedInUser = {
        name: profile?.full_name ?? user.email ?? "User",
        needsOnboarding,
      };
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-100 dark:bg-slate-900">
      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:py-24">
        <Link href={signedInUser ? (signedInUser.needsOnboarding ? "/onboarding" : "/dashboard") : "/"} className="inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/saledock-logo.svg"
            alt="SaleDock Cloud POS"
            className="mx-auto mb-8 h-16 w-auto max-w-[280px] object-contain"
          />
        </Link>
        <h1 className="max-w-2xl text-3xl font-black text-slate-950 sm:text-5xl dark:text-white">
          SaleDock Cloud POS
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg dark:text-slate-400">
          A cloud POS platform for shops to manage sales, inventory, repairs,
          invoices, expenses, and reports — all from one place.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          {signedInUser ? (
            <Link
              href={signedInUser.needsOnboarding ? "/onboarding" : "/dashboard"}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-8 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
            >
              <LayoutDashboard className="size-4" />
              {signedInUser.needsOnboarding ? "Continue setup" : "Go to dashboard"}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-8 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800"
              >
                <LogIn className="size-4" />
                Sign in
              </Link>
              <Link
                href="/login?signup=1"
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-8 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <ArrowRight className="size-4" />
                Create account
              </Link>
            </>
          )}
        </div>

        {!env.isSupabaseConfigured && (
          <p className="mt-6 rounded-lg bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            Supabase is not configured yet. Add credentials to <code>.env.local</code>.
          </p>
        )}
      </section>

      {/* Features */}
      <section className="border-t border-slate-200 bg-white px-4 py-16 dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3">
          {[
            { title: "Sales & POS", desc: "Fast checkout with barcode scanning, discounts, and multiple payment methods." },
            { title: "Inventory", desc: "Track stock levels, manage suppliers, and get low-stock alerts." },
            { title: "Repairs", desc: "Complete repair job management with status tracking and customer history." },
            { title: "Invoices & Returns", desc: "Professional invoices, credit notes, and seamless return processing." },
            { title: "Expenses", desc: "Track every expense category and vendor with detailed reporting." },
            { title: "Reports", desc: "Daily closing, sales analytics, and exportable business reports." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-600 dark:bg-slate-700/50">
              <h3 className="text-sm font-extrabold text-slate-950 dark:text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-4 py-6 dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto flex max-w-4xl items-center justify-center gap-4 text-xs text-slate-400 dark:text-slate-500">
          <span>&copy; {new Date().getFullYear()} SaleDock Cloud POS</span>
          <Link href="/privacy" className="hover:text-blue-700">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-blue-700">Terms of Service</Link>
        </div>
      </footer>
    </main>
  );
}
