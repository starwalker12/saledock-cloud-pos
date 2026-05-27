import Link from "next/link";
import { env } from "@/lib/env";
import { getCurrentContext } from "@/lib/auth/session";
import { ThemeToggle } from "@/components/theme-toggle";

const features = [
  { title: "Sales & POS", desc: "Fast checkout with barcode scanning, discounts, split payments, and instant receipt printing." },
  { title: "Inventory & FIFO", desc: "Multi-lot stock tracking with real cost valuation, low-stock alerts, and supplier management." },
  { title: "Repairs", desc: "Complete repair lifecycle: intake, diagnosis, parts tracking, status updates, and customer notifications." },
  { title: "Invoices & Returns", desc: "Professional A4 invoices, 80mm thermal receipts, credit notes, and seamless return-to-stock." },
  { title: "Expenses", desc: "Track every expense by category and vendor with detailed reporting and daily closing summaries." },
  { title: "Reports", desc: "Daily closing, sales analytics, customer ledgers, and exportable business performance reports." },
  { title: "Backup & Restore", desc: "Offline ZIP and online JSON backup import with integrity checks, field mapping, and dry-run validation." },
  { title: "Multi-shop onboarding", desc: "Self-service shop setup wizard with branded colors, social links, map location, and Google/Facebook login." },
  { title: "Platform controls", desc: "Admin console for maintenance mode, sign-up toggles, audit logs, user management, and security settings." },
];

const trustItems = [
  { label: "Inventory", color: "bg-emerald-500" },
  { label: "Repairs", color: "bg-blue-500" },
  { label: "Invoices", color: "bg-violet-500" },
  { label: "Reports", color: "bg-amber-500" },
  { label: "Backups", color: "bg-cyan-500" },
];

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
    <div className="flex min-h-screen flex-col">
      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 w-full border-b border-slate-200/60 bg-white/80 backdrop-blur-lg dark:border-slate-700/40 dark:bg-slate-950/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <img
              src="/saledock-logo-mark.svg"
              alt="SaleDock Cloud POS"
              className="h-8 w-8"
            />
            <span className="hidden text-sm font-bold uppercase tracking-wide text-blue-700 sm:inline dark:text-slate-100">
              SaleDock <span className="font-black">Cloud POS</span>
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            {signedInUser ? (
              <Link
                href={signedInUser.needsOnboarding ? "/onboarding" : "/dashboard"}
                className="flex h-10 items-center gap-1.5 rounded-xl bg-blue-700 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-blue-800 sm:text-sm"
              >
                {signedInUser.needsOnboarding ? "Continue setup" : "Dashboard"}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="flex h-10 items-center gap-1.5 rounded-xl bg-blue-700 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-blue-800 sm:text-sm"
                >
                  Sign in
                </Link>
                <Link
                  href="/login?signup=1"
                  className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:text-sm"
                >
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden px-4 py-20 text-center sm:py-28">
        <div className="pointer-events-none absolute inset-0 animate-gradient-shift opacity-15 dark:opacity-10"
          style={{
            background: "linear-gradient(-45deg, #0b2f6f, #00b8b0, #0b2f6f, #00b8b0)",
            backgroundSize: "200% 200%",
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(11,47,111,0.06)_0%,transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(0,184,176,0.08)_0%,transparent_70%)]" />

        <div className="relative animate-fade-in-up">
          <div className="mx-auto mb-8 flex items-center justify-center">
            <img
              src="/saledock-logo.svg"
              alt="SaleDock Cloud POS"
              className="h-14 w-auto max-w-[240px] object-contain sm:h-16 sm:max-w-[280px]"
            />
          </div>

          <h1 className="mx-auto max-w-3xl text-4xl font-black leading-tight text-slate-950 sm:text-5xl md:text-6xl dark:text-white">
            SaleDock Cloud POS
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg dark:text-slate-400">
            A modern cloud POS platform for shops to manage sales, inventory, repairs,
            invoices, expenses, and reports — all from one place.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {signedInUser ? (
              <Link
                href={signedInUser.needsOnboarding ? "/onboarding" : "/dashboard"}
                className="flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-blue-700 px-8 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 hover:shadow-xl sm:w-auto"
              >
                {signedInUser.needsOnboarding ? "Continue setup" : "Go to dashboard"}
              </Link>
            ) : (
              <>
                <Link
                  href="/login?signup=1"
                  className="flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-blue-700 px-8 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 hover:shadow-xl sm:w-auto"
                >
                  Start free
                </Link>
                <Link
                  href="/login"
                  className="flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-8 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>

          {!env.isSupabaseConfigured && (
            <p className="mx-auto mt-6 max-w-lg rounded-lg bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              Supabase is not configured yet. Add credentials to <code className="text-xs">.env.local</code>.
            </p>
          )}

          {/* Trust pills */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {trustItems.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${item.color}`} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRODUCT PREVIEW ── */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-16 sm:pb-24">
        <div className="animate-fade-in-up rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
          {/* Browser chrome mock */}
          <div className="mb-3 flex items-center gap-1.5 border-b border-slate-100 pb-3 dark:border-slate-700">
            <span className="inline-block h-3 w-3 rounded-full bg-red-400" />
            <span className="inline-block h-3 w-3 rounded-full bg-amber-400" />
            <span className="inline-block h-3 w-3 rounded-full bg-emerald-400" />
            <span className="ml-2 truncate rounded bg-slate-100 px-3 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              saledock-cloud-pos.vercel.app/dashboard
            </span>
          </div>

          {/* Mock KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Today Sales", value: "Rs 47,280", change: "+12%", accent: "bg-blue-500" },
              { label: "Inventory Alerts", value: "3 items", change: "low stock", accent: "bg-amber-500" },
              { label: "Repairs Open", value: "5 jobs", change: "2 due today", accent: "bg-violet-500" },
              { label: "Due Payments", value: "Rs 18,500", change: "4 customers", accent: "bg-emerald-500" },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{kpi.label}</span>
                  <span className={`inline-block h-2 w-2 rounded-full ${kpi.accent} animate-pulse`} />
                </div>
                <p className="mt-2 text-lg font-black text-slate-950 dark:text-white">{kpi.value}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.change}</p>
              </div>
            ))}
          </div>

          {/* Mock table row */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <div className="h-2 w-32 rounded-full bg-slate-200 dark:bg-slate-600 animate-shimmer" />
              <div className="h-2 w-20 rounded-full bg-slate-200 dark:bg-slate-600 animate-shimmer" style={{ animationDelay: "0.2s" }} />
              <div className="ml-auto h-2 w-16 rounded-full bg-slate-200 dark:bg-slate-600 animate-shimmer" style={{ animationDelay: "0.4s" }} />
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <div className="h-2 w-28 rounded-full bg-slate-200 dark:bg-slate-600 animate-shimmer" style={{ animationDelay: "0.3s" }} />
              <div className="h-2 w-24 rounded-full bg-slate-200 dark:bg-slate-600 animate-shimmer" style={{ animationDelay: "0.5s" }} />
              <div className="ml-auto h-2 w-14 rounded-full bg-slate-200 dark:bg-slate-600 animate-shimmer" style={{ animationDelay: "0.7s" }} />
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="border-t border-slate-200 bg-white px-4 py-16 sm:py-24 dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-black text-slate-950 sm:text-3xl dark:text-white">
            Everything your shop needs
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            From ringing up sales to managing repairs and generating reports — SaleDock ships with a complete toolkit for modern retail.
          </p>

          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-slate-100 bg-slate-50 p-5 transition hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-200/50 sm:p-6 dark:border-slate-700 dark:bg-slate-800 dark:hover:shadow-slate-900/50"
              >
                <h3 className="text-sm font-extrabold text-slate-950 dark:text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECURITY / TRUST ── */}
      <section className="border-t border-slate-200 bg-slate-50 px-4 py-16 sm:py-24 dark:border-slate-700 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-black text-slate-950 sm:text-3xl dark:text-white">
            Built with security first
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Your data stays yours. SaleDock is designed with tenant isolation, role-based access, and defensive coding from day one.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { title: "Tenant isolation", desc: "Each shop operates in a separate data partition with Row-Level Security. No shop can see another shop's data." },
              { title: "Role-based access", desc: "Owner, admin, staff — each role has granular permissions. Platform admins see only aggregate usage data." },
              { title: "Backup safety checks", desc: "Imported backups run integrity verification with field mapping, schema validation, and tamper detection before restoring." },
              { title: "Defensive hardening", desc: "Input sanitization, LIKE-escaping, SQL injection prevention, safe redirect validation, and XSS protection applied across all user inputs." },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h3 className="text-sm font-extrabold text-slate-950 dark:text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="border-t border-slate-200 bg-white px-4 py-16 sm:py-24 dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-black text-slate-950 sm:text-3xl dark:text-white">
            Get started in minutes
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            No credit card required. No complicated setup. Just three simple steps.
          </p>

          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {[
              { step: "1", title: "Create your account", desc: "Sign up with your email or Google/Facebook. Takes less than a minute." },
              { step: "2", title: "Set up your shop", desc: "Name your shop, pick your brand colors, add your location, and configure your currency." },
              { step: "3", title: "Start selling", desc: "Ring up sales, manage inventory, track repairs, and run reports. All from one dashboard." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-700 text-lg font-black text-white">
                  {item.step}
                </span>
                <h3 className="mt-5 text-sm font-extrabold text-slate-950 dark:text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="border-t border-slate-200 bg-slate-50 px-4 py-16 text-center sm:py-24 dark:border-slate-700 dark:bg-slate-950">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-black text-slate-950 sm:text-3xl dark:text-white">
            Launch your shop on SaleDock Cloud POS
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Join shops that trust SaleDock for their daily operations. Free to start, no commitment.
          </p>
          {signedInUser ? (
            <Link
              href={signedInUser.needsOnboarding ? "/onboarding" : "/dashboard"}
              className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-8 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 hover:shadow-xl"
            >
              {signedInUser.needsOnboarding ? "Continue setup" : "Go to dashboard"}
            </Link>
          ) : (
            <Link
              href="/login?signup=1"
              className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-8 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 hover:shadow-xl"
            >
              Create your account
            </Link>
          )}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-slate-200 bg-white px-4 py-10 dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <img src="/saledock-logo-mark.svg" alt="" className="h-7 w-7" />
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              SaleDock Cloud POS
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400 dark:text-slate-500">
            <Link href="/privacy" className="hover:text-blue-700 dark:hover:text-blue-400">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-blue-700 dark:hover:text-blue-400">Terms of Service</Link>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <a href="mailto:fardan.aatir@outlook.com" className="hover:text-blue-700 dark:hover:text-blue-400">fardan.aatir@outlook.com</a>
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            &copy; {new Date().getFullYear()} SaleDock Cloud POS
          </p>
        </div>
      </footer>
    </div>
  );
}
