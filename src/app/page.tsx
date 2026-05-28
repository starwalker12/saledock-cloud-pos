import Link from "next/link";
import { env } from "@/lib/env";
import { getCurrentContext } from "@/lib/auth/session";
import { ThemeToggle } from "@/components/theme-toggle";
import { ScrollReveal } from "@/components/scroll-reveal";
import {
  ShoppingCart,
  PackageCheck,
  Wrench,
  ReceiptText,
  BadgeDollarSign,
  BarChart3,
  DatabaseBackup,
  Store,
  ShieldCheck,
  Shield,
  LockKeyhole,
  Users,
  Receipt,
  PackageSearch,
  CreditCard,
  ArrowRight,
  CheckCircle,
} from "lucide-react";

const features = [
  { icon: ShoppingCart, title: "Sales & POS", desc: "Fast checkout with barcode scanning, discounts, split payments, and instant receipt printing." },
  { icon: PackageCheck, title: "Inventory & FIFO", desc: "Multi-lot stock tracking with real cost valuation, low-stock alerts, and supplier management." },
  { icon: Wrench, title: "Repairs", desc: "Complete repair lifecycle: intake, diagnosis, parts tracking, status updates, and customer notifications." },
  { icon: ReceiptText, title: "Invoices & Returns", desc: "Professional A4 invoices, 80mm thermal receipts, credit notes, and seamless return-to-stock." },
  { icon: BadgeDollarSign, title: "Expenses", desc: "Track every expense by category and vendor with detailed reporting and daily closing summaries." },
  { icon: BarChart3, title: "Reports", desc: "Daily closing, sales analytics, customer ledgers, and exportable business performance reports." },
  { icon: DatabaseBackup, title: "Backup & Restore", desc: "Offline ZIP and online JSON backup import with integrity checks, field mapping, and dry-run validation." },
  { icon: Store, title: "Multi-shop onboarding", desc: "Self-service shop setup wizard with branded colors, social links, map location, and Google/Facebook login." },
  { icon: ShieldCheck, title: "Platform controls", desc: "Admin console for maintenance mode, sign-up toggles, audit logs, user management, and security settings." },
];

const securityItems = [
  { icon: Shield, title: "Tenant isolation", desc: "Each shop operates in a separate data partition with Row-Level Security. No shop can see another shop's data." },
  { icon: Users, title: "Role-based access", desc: "Owner, admin, staff — each role has granular permissions. Platform admins see only aggregate usage data." },
  { icon: DatabaseBackup, title: "Backup safety checks", desc: "Imported backups run integrity verification with field mapping, schema validation, and tamper detection before restoring." },
  { icon: LockKeyhole, title: "Defensive hardening", desc: "Input sanitization, LIKE-escaping, SQL injection prevention, safe redirect validation, and XSS protection applied across all user inputs." },
];

const trustItems = [
  { label: "Inventory", color: "bg-emerald-500" },
  { label: "Repairs", color: "bg-blue-500" },
  { label: "Invoices", color: "bg-violet-500" },
  { label: "Reports", color: "bg-amber-500" },
  { label: "Backups", color: "bg-cyan-500" },
];

const kpiData = [
  { label: "Today Sales", value: "Rs 47,280", change: "+12%", accent: "bg-blue-500" },
  { label: "Inventory Alerts", value: "3 items", change: "low stock", accent: "bg-amber-500" },
  { label: "Repairs Open", value: "5 jobs", change: "2 due today", accent: "bg-violet-500" },
  { label: "Due Payments", value: "Rs 18,500", change: "4 customers", accent: "bg-emerald-500" },
];

const dashboardRows = [
  { icon: Receipt, left: "Sale completed — Receipt #1042", right: "Rs 7,280", accent: "bg-blue-500" },
  { icon: PackageSearch, left: "Low stock alert — USB-C cable", right: "3 left", accent: "bg-amber-500" },
  { icon: Wrench, left: "Repair updated — Screen replacement", right: "Ready", accent: "bg-violet-500" },
  { icon: CreditCard, left: "Payment reminder — Sample customer due", right: "Rs 18,500", accent: "bg-emerald-500" },
];

const howItWorks = [
  { step: "1", title: "Create your account", desc: "Sign up with your email or Google/Facebook. Takes less than a minute." },
  { step: "2", title: "Set up your shop", desc: "Name your shop, pick your brand colors, add your location, and configure your currency." },
  { step: "3", title: "Start selling", desc: "Ring up sales, manage inventory, track repairs, and run reports. All from one dashboard." },
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
    <div className="flex min-h-screen flex-col bg-white dark:bg-[#070b16]">
      {/* ── STICKY NAV ── */}
      <nav className="sticky top-0 z-50 w-full border-b border-slate-200/60 bg-white/90 backdrop-blur-xl dark:border-slate-700/30 dark:bg-[#070b16]/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center shrink-0 group">
            <img
              src="/saledock-logo-full.png"
              alt="SaleDock Cloud POS"
              className="h-10 w-auto object-contain transition-transform duration-200 group-hover:scale-105"
            />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            {signedInUser ? (
              <Link
                href={signedInUser.needsOnboarding ? "/onboarding" : "/dashboard"}
                className="flex h-10 items-center gap-1.5 rounded-xl bg-blue-700 px-4 text-xs font-bold text-white shadow-lg shadow-blue-700/20 transition-all duration-200 hover:bg-blue-800 hover:shadow-xl hover:-translate-y-0.5 sm:text-sm"
              >
                {signedInUser.needsOnboarding ? "Continue setup" : "Dashboard"}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="flex h-10 items-center gap-1.5 rounded-xl bg-blue-700 px-4 text-xs font-bold text-white shadow-lg shadow-blue-700/20 transition-all duration-200 hover:bg-blue-800 hover:shadow-xl hover:-translate-y-0.5 sm:text-sm"
                >
                  Sign in
                </Link>
                <Link
                  href="/login?signup=1"
                  className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:-translate-y-0.5 sm:text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <ScrollReveal>
        <section className="relative flex flex-col items-center justify-center overflow-hidden px-4 pb-20 pt-16 text-center sm:pb-28 sm:pt-24">
          {/* Gradient background */}
          <div
            className="pointer-events-none absolute inset-0 animate-gradient-shift opacity-20 dark:opacity-15"
            style={{
              background: "linear-gradient(-45deg, #0b2f6f, #0d9488, #1e40af, #0d9488)",
              backgroundSize: "300% 300%",
            }}
          />
          {/* Radial vignette */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(13,148,136,0.08)_0%,transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(13,148,136,0.12)_0%,transparent_70%)]" />
          {/* Teal accent dot top-right */}
          <div className="pointer-events-none absolute -top-20 right-1/4 h-64 w-64 rounded-full bg-teal-500/5 blur-3xl dark:bg-teal-400/10" />

          <div className="relative">
            <ScrollReveal delay={100}>
              <div className="mx-auto mb-8 flex items-center justify-center">
                <img
                  src="/saledock-logo-full.png"
                  alt="SaleDock Cloud POS"
                  className="h-20 w-auto max-w-[260px] object-contain drop-shadow-sm sm:h-24 sm:max-w-[320px]"
                />
              </div>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <h1 className="mx-auto max-w-3xl text-4xl font-black leading-tight text-slate-950 sm:text-5xl md:text-6xl dark:text-white">
                SaleDock Cloud POS
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg dark:text-slate-400">
                A modern cloud POS platform for shops to manage sales, inventory, repairs,
                invoices, expenses, and reports — all from one place.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                {signedInUser ? (
                  <Link
                    href={signedInUser.needsOnboarding ? "/onboarding" : "/dashboard"}
                    className="group flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-blue-700 px-8 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition-all duration-200 hover:bg-blue-800 hover:shadow-xl hover:-translate-y-0.5 sm:w-auto"
                  >
                    {signedInUser.needsOnboarding ? "Continue setup" : "Go to dashboard"}
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login?signup=1"
                      className="group flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-blue-700 px-8 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition-all duration-200 hover:bg-blue-800 hover:shadow-xl hover:-translate-y-0.5 sm:w-auto"
                    >
                      Start free
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                    <Link
                      href="/login"
                      className="flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-8 text-sm font-bold text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:-translate-y-0.5 sm:w-auto dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Sign in
                    </Link>
                  </>
                )}
              </div>
            </ScrollReveal>

            {!env.isSupabaseConfigured && (
              <ScrollReveal delay={400}>
                <p className="mx-auto mt-6 max-w-lg rounded-lg bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  Supabase is not configured yet. Add credentials to <code className="text-xs">.env.local</code>.
                </p>
              </ScrollReveal>
            )}

            <ScrollReveal delay={400}>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
                {trustItems.map((item) => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur-sm dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300"
                  >
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${item.color}`} />
                    {item.label}
                  </span>
                ))}
              </div>
            </ScrollReveal>
          </div>
        </section>
      </ScrollReveal>

      {/* ── PRODUCT PREVIEW ── */}
      <ScrollReveal delay={100}>
        <section className="mx-auto w-full max-w-5xl px-4 pb-16 sm:pb-24">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/50 transition-all duration-300 hover:shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:shadow-none dark:hover:shadow-xl dark:hover:shadow-slate-900/50">
            {/* Browser chrome mock */}
            <div className="mb-4 flex items-center gap-1.5 border-b border-slate-100 pb-3 dark:border-slate-700">
              <span className="inline-block h-3 w-3 rounded-full bg-red-400" />
              <span className="inline-block h-3 w-3 rounded-full bg-amber-400" />
              <span className="inline-block h-3 w-3 rounded-full bg-emerald-400" />
              <span className="ml-2 truncate rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                saledock-cloud-pos.vercel.app/dashboard
              </span>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {kpiData.map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{kpi.label}</span>
                    <span className={`inline-block h-2 w-2 rounded-full ${kpi.accent} animate-pulse`} />
                  </div>
                  <p className="mt-2 text-lg font-black text-slate-950 dark:text-white">{kpi.value}</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.change}</p>
                </div>
              ))}
            </div>

            {/* Dashboard activity rows */}
            <div className="mt-4 space-y-1.5">
              {dashboardRows.map((row) => {
                const Icon = row.icon;
                return (
                  <div
                    key={row.left}
                    className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 transition-all duration-200 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
                  >
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${row.accent} text-white shadow-sm`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{row.left}</span>
                    <span className={`ml-auto text-sm font-bold ${row.accent.replace("bg-", "text-")}`}>{row.right}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* ── FEATURES ── */}
      <section className="relative border-t border-slate-200 bg-slate-50 px-4 py-16 sm:py-24 dark:border-slate-700 dark:bg-[#0b1220]">
        {/* Accent decoration */}
        <div className="pointer-events-none absolute left-0 top-0 h-px w-1/3 bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />

        <div className="mx-auto max-w-6xl">
          <ScrollReveal>
            <h2 className="text-center text-2xl font-black text-slate-950 sm:text-3xl dark:text-white">
              Everything your shop needs
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-base leading-relaxed text-slate-500 dark:text-slate-400">
              From ringing up sales to managing repairs and generating reports — SaleDock ships with a complete toolkit for modern retail.
            </p>
          </ScrollReveal>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <ScrollReveal key={f.title} delay={i * 80}>
                  <div className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/60 dark:border-slate-700 dark:bg-slate-900 dark:hover:shadow-slate-900/60">
                    {/* Hover accent bar */}
                    <div className="absolute inset-x-0 -top-px h-0.5 rounded-t-2xl bg-gradient-to-r from-blue-600 to-teal-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 text-white shadow-md transition-all duration-300 group-hover:shadow-lg group-hover:shadow-blue-600/25">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-5 text-base font-extrabold text-slate-950 dark:text-white">{f.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{f.desc}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SECURITY / TRUST ── */}
      <section className="relative border-t border-slate-200 bg-white px-4 py-16 sm:py-24 dark:border-slate-700 dark:bg-[#070b16]">
        <div className="pointer-events-none absolute right-0 top-0 h-px w-1/3 bg-gradient-to-l from-transparent via-teal-500/30 to-transparent" />

        <div className="mx-auto max-w-4xl">
          <ScrollReveal>
            <h2 className="text-center text-2xl font-black text-slate-950 sm:text-3xl dark:text-white">
              Built with security first
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-base leading-relaxed text-slate-500 dark:text-slate-400">
              Your data stays yours. SaleDock is designed with tenant isolation, role-based access, and defensive coding from day one.
            </p>
          </ScrollReveal>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {securityItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <ScrollReveal key={item.title} delay={i * 100}>
                  <div className="group relative rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:hover:shadow-slate-900/60">
                    <div className="absolute inset-x-0 -top-px h-0.5 rounded-t-2xl bg-gradient-to-r from-teal-500 to-emerald-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-500 text-white shadow-md transition-all duration-300 group-hover:shadow-lg group-hover:shadow-teal-600/25">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-5 text-base font-extrabold text-slate-950 dark:text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.desc}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="relative border-t border-slate-200 bg-slate-50 px-4 py-16 sm:py-24 dark:border-slate-700 dark:bg-[#0b1220]">
        <div className="pointer-events-none absolute left-1/3 right-1/3 top-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />

        <div className="mx-auto max-w-4xl">
          <ScrollReveal>
            <h2 className="text-center text-2xl font-black text-slate-950 sm:text-3xl dark:text-white">
              Get started in minutes
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-base leading-relaxed text-slate-500 dark:text-slate-400">
              No credit card required. No complicated setup. Just three simple steps.
            </p>
          </ScrollReveal>

          <div className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-3">
            {howItWorks.map((item, i) => (
              <ScrollReveal key={item.step} delay={i * 120}>
                <div className="group text-center">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-teal-500 text-xl font-black text-white shadow-lg transition-all duration-300 group-hover:shadow-xl group-hover:shadow-blue-600/25 group-hover:-translate-y-0.5">
                    {item.step}
                  </span>
                  <h3 className="mt-6 text-base font-extrabold text-slate-950 dark:text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <ScrollReveal delay={100}>
        <section className="relative border-t border-slate-200 bg-white px-4 py-16 text-center sm:py-24 dark:border-slate-700 dark:bg-[#070b16]">
          {/* Gradient glow */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(13,148,136,0.06)_0%,transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(13,148,136,0.08)_0%,transparent_70%)]" />

          <div className="relative mx-auto max-w-2xl">
            <ScrollReveal delay={150}>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-teal-500 text-white shadow-lg">
                <CheckCircle className="h-8 w-8" />
              </div>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <h2 className="text-2xl font-black text-slate-950 sm:text-3xl dark:text-white">
                Launch your shop on SaleDock Cloud POS
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-base leading-relaxed text-slate-500 dark:text-slate-400">
                Join shops that trust SaleDock for their daily operations. Free to start, no commitment.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              {signedInUser ? (
                <Link
                  href={signedInUser.needsOnboarding ? "/onboarding" : "/dashboard"}
                  className="group mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-8 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition-all duration-200 hover:bg-blue-800 hover:shadow-xl hover:-translate-y-0.5"
                >
                  {signedInUser.needsOnboarding ? "Continue setup" : "Go to dashboard"}
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              ) : (
                <Link
                  href="/login?signup=1"
                  className="group mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-8 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition-all duration-200 hover:bg-blue-800 hover:shadow-xl hover:-translate-y-0.5"
                >
                  Create your account
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              )}
            </ScrollReveal>
          </div>
        </section>
      </ScrollReveal>

      {/* ── FOOTER ── */}
      <footer className="border-t border-slate-200 bg-slate-50 px-4 py-12 dark:border-slate-700 dark:bg-[#0b1220]">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center">
            <img src="/saledock-logo-full.png" alt="SaleDock Cloud POS" className="h-7 w-auto object-contain" />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400 dark:text-slate-500">
            <Link href="/privacy" className="transition-colors duration-200 hover:text-blue-700 dark:hover:text-blue-400">Privacy Policy</Link>
            <Link href="/terms" className="transition-colors duration-200 hover:text-blue-700 dark:hover:text-blue-400">Terms of Service</Link>
            <Link href="/data-deletion" className="transition-colors duration-200 hover:text-blue-700 dark:hover:text-blue-400">Data Deletion</Link>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <a href="mailto:fardan.aatir@outlook.com" className="transition-colors duration-200 hover:text-blue-700 dark:hover:text-blue-400">fardan.aatir@outlook.com</a>
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            &copy; {new Date().getFullYear()} SaleDock Cloud POS
          </p>
        </div>
      </footer>
    </div>
  );
}
