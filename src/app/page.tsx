import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getCurrentContext } from "@/lib/auth/session";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { FaqSection } from "@/components/faq-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { ParallaxLayer } from "@/components/parallax-layer";
import { getServerDict } from "@/lib/i18n/server";
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
  Clock,
} from "lucide-react";

const features = [
  {
    icon: ShoppingCart, title: "Sales & POS",
    desc: "Fast checkout with barcode scanning, discounts, split payments, and instant receipt printing.",
    gradient: "linear-gradient(135deg,#1d4ed8,#0891b2)",
    glow: "rgba(29,78,216,0.18)",
    tags: ["Barcode scan", "Split payment", "Thermal receipt", "Discounts"],
  },
  {
    icon: PackageCheck, title: "Inventory & FIFO",
    desc: "Multi-lot stock tracking with real cost valuation, low-stock alerts, and supplier management.",
    gradient: "linear-gradient(135deg,#047857,#0d9488)",
    glow: "rgba(4,120,87,0.18)",
    tags: null,
  },
  {
    icon: Wrench, title: "Repairs",
    desc: "Complete repair lifecycle: intake, diagnosis, parts tracking, status updates, and customer notifications.",
    gradient: "linear-gradient(135deg,#6d28d9,#a21caf)",
    glow: "rgba(109,40,217,0.18)",
    tags: null,
  },
  {
    icon: ReceiptText, title: "Invoices & Returns",
    desc: "Professional A4 invoices, 80mm thermal receipts, credit notes, and seamless return-to-stock.",
    gradient: "linear-gradient(135deg,#0369a1,#0891b2)",
    glow: "rgba(3,105,161,0.18)",
    tags: null,
  },
  {
    icon: BadgeDollarSign, title: "Expenses",
    desc: "Track every expense by category and vendor with detailed reporting and daily closing summaries.",
    gradient: "linear-gradient(135deg,#b45309,#d97706)",
    glow: "rgba(180,83,9,0.18)",
    tags: null,
  },
  {
    icon: BarChart3, title: "Reports",
    desc: "Daily closing, sales analytics, customer ledgers, and exportable business performance reports.",
    gradient: "linear-gradient(135deg,#be123c,#e11d48)",
    glow: "rgba(190,18,60,0.18)",
    tags: null,
  },
  {
    icon: DatabaseBackup, title: "Backup & Restore",
    desc: "Offline ZIP and online JSON backup import with integrity checks, field mapping, and dry-run validation.",
    gradient: "linear-gradient(135deg,#334155,#475569)",
    glow: "rgba(51,65,85,0.18)",
    tags: null,
  },
  {
    icon: Store, title: "Multi-shop onboarding",
    desc: "Self-service shop setup wizard with branded colors, social links, map location, and Google/Facebook login.",
    gradient: "linear-gradient(135deg,#0f766e,#0d9488)",
    glow: "rgba(15,118,110,0.18)",
    tags: null,
  },
  {
    icon: ShieldCheck, title: "Platform controls",
    desc: "Admin console for maintenance mode, sign-up toggles, audit logs, user management, and security settings.",
    gradient: "linear-gradient(135deg,#c2410c,#ea580c)",
    glow: "rgba(194,65,12,0.18)",
    tags: null,
  },
];

const securityItems = [
  {
    icon: Shield, title: "Tenant isolation",
    desc: "Each shop operates in a separate data partition with Row-Level Security. No shop can see another shop's data.",
    gradient: "linear-gradient(135deg,#0f766e,#047857)",
  },
  {
    icon: Users, title: "Role-based access",
    desc: "Owner, admin, staff — each role has granular permissions. Platform admins see only aggregate usage data.",
    gradient: "linear-gradient(135deg,#1d4ed8,#0369a1)",
  },
  {
    icon: DatabaseBackup, title: "Backup safety checks",
    desc: "Imported backups run integrity verification with field mapping, schema validation, and tamper detection before restoring.",
    gradient: "linear-gradient(135deg,#6d28d9,#4c1d95)",
  },
  {
    icon: LockKeyhole, title: "Defensive hardening",
    desc: "Input sanitization, LIKE-escaping, SQL injection prevention, safe redirect validation, and XSS protection across all user inputs.",
    gradient: "linear-gradient(135deg,#92400e,#b45309)",
  },
];

const trustPills = [
  { label: "Inventory", color: "#10b981" },
  { label: "Repairs",   color: "#6d28d9" },
  { label: "Invoices",  color: "#0369a1" },
  { label: "Reports",   color: "#be123c" },
  { label: "Backups",   color: "#0d9488" },
];

const kpiData = [
  { label: "Today Sales",      value: "Rs 47,280", change: "+12%",        color: "#3b82f6" },
  { label: "Inventory Alerts", value: "3 items",   change: "low stock",   color: "#f59e0b" },
  { label: "Repairs Open",     value: "5 jobs",    change: "2 due today", color: "#8b5cf6" },
  { label: "Due Payments",     value: "Rs 18,500", change: "4 customers", color: "#10b981" },
];

const dashboardRows = [
  { icon: Receipt,       left: "Sale completed — Receipt #1042",        right: "Rs 7,280",  color: "#3b82f6", bg: "rgba(59,130,246,0.12)"  },
  { icon: PackageSearch, left: "Low stock alert — USB-C cable",          right: "3 left",    color: "#f59e0b", bg: "rgba(245,158,11,0.12)"  },
  { icon: Wrench,        left: "Repair — Screen replacement",            right: "Ready",     color: "#8b5cf6", bg: "rgba(139,92,246,0.12)"  },
  { icon: CreditCard,    left: "Payment reminder — Sample customer due", right: "Rs 18,500", color: "#10b981", bg: "rgba(16,185,129,0.12)"  },
];

const salesChartBars = [
  { day: "M", v: 52 }, { day: "T", v: 68 }, { day: "W", v: 60 },
  { day: "T", v: 82 }, { day: "F", v: 95 }, { day: "S", v: 75 },
  { day: "S", v: 41 },
];

const sidebarIcons = [ShoppingCart, PackageCheck, Wrench, BarChart3, Receipt];

const shopDaySteps = [
  { icon: Clock,        time: "Opening",    title: "Start the register", desc: "Cash count, opening summary, daily targets." },
  { icon: ShoppingCart, time: "Throughout", title: "Ring up sales",      desc: "Barcode scan, split payments, instant receipts." },
  { icon: Wrench,       time: "As needed",  title: "Handle repairs",     desc: "Check-in, update status, notify customers." },
  { icon: BarChart3,    time: "End of day", title: "Close & reconcile",  desc: "Daily closing report and cash reconciliation." },
  { icon: Receipt,      time: "Evening",    title: "Review analytics",   desc: "Sales trends, ledger, and tomorrow's prep." },
];

const howItWorks = [
  { step: "1", title: "Create your account", desc: "Sign up with email or Google/Facebook. Takes less than a minute." },
  { step: "2", title: "Set up your shop",    desc: "Name your shop, pick brand colors, add location, and configure currency." },
  { step: "3", title: "Start selling",       desc: "Ring up sales, manage inventory, track repairs, and run reports from one dashboard." },
];

// ── Dashboard inner component ─────────────────────────────────────────────────
type KPI = { label: string; value: string; change: string; color: string };
type Row = { icon: React.ComponentType<{ className?: string }>; left: string; right: string; color: string; bg: string };
type Bar = { day: string; v: number };

function DashboardPreview({
  kpi, rows, bars, icons, dark,
}: {
  kpi: KPI[]; rows: Row[]; bars: Bar[];
  icons: React.ComponentType<{ className?: string }>[];
  dark: boolean;
}) {
  const bg     = dark ? "linear-gradient(135deg,#060f20,#071525)" : "#ffffff";
  const card   = dark ? "rgba(255,255,255,0.04)" : "#f8fafc";
  const border = dark ? "rgba(255,255,255,0.07)" : "#e2e8f0";
  const text   = dark ? "#f1f5f9" : "#0f172a";
  const muted  = dark ? "#64748b" : "#64748b";
  const rowBg  = dark ? "rgba(255,255,255,0.03)" : "#f8fafc";
  const chrome = dark ? "rgba(255,255,255,0.04)" : "#f1f5f9";

  return (
    <div style={{ background: bg }}>
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 border-b px-4 py-2.5" style={{ background: chrome, borderColor: border }}>
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        <span
          className="ml-2 truncate rounded border px-2.5 py-0.5 text-[11px] font-medium"
          style={{ background: dark ? "rgba(255,255,255,0.05)" : "white", borderColor: border, color: muted }}
        >
          saledock-cloud-pos.vercel.app/dashboard
        </span>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div
          className="hidden border-r p-2 sm:flex sm:flex-col sm:gap-1"
          style={{ background: dark ? "rgba(255,255,255,0.02)" : "#f8fafc", borderColor: border }}
        >
          {icons.map((Icon, i) => (
            <span
              key={i}
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={
                i === 0
                  ? { background: "linear-gradient(135deg,#0b2f6f,#00b8b0)", color: "#fff" }
                  : { color: muted }
              }
            >
              <Icon className="h-4 w-4" />
            </span>
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 p-3.5">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {kpi.map((k) => (
              <div key={k.label} className="rounded-xl border p-3" style={{ background: card, borderColor: border }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold" style={{ color: muted }}>{k.label}</span>
                  <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: k.color }} />
                </div>
                <p className="mt-1.5 font-display text-sm font-bold" style={{ color: text }}>{k.value}</p>
                <p className="text-[10px] font-semibold" style={{ color: k.color }}>{k.change}</p>
              </div>
            ))}
          </div>

          {/* Activity + chart */}
          <div className="mt-2.5 grid grid-cols-1 gap-2.5 lg:grid-cols-[1fr_160px]">
            <div className="space-y-1.5">
              {rows.map((row) => {
                const Icon = row.icon;
                return (
                  <div
                    key={row.left}
                    className="flex items-center gap-2.5 rounded-lg border p-2.5"
                    style={{ background: rowBg, borderColor: border }}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: row.bg, color: row.color }}>
                      <Icon className="h-3 w-3" />
                    </span>
                    <span className="truncate text-[11px] font-semibold" style={{ color: text }}>{row.left}</span>
                    <span className="ml-auto shrink-0 text-[11px] font-bold" style={{ color: row.color }}>{row.right}</span>
                  </div>
                );
              })}
            </div>

            {/* Bar chart */}
            <div className="hidden rounded-xl border p-3 lg:block" style={{ background: card, borderColor: border }}>
              <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider" style={{ color: muted }}>Weekly sales</p>
              <div className="flex items-end gap-0.5" style={{ height: "52px" }}>
                {bars.map((bar, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-[44px] w-full items-end">
                      <div
                        className="w-full rounded-t-sm animate-bar-grow"
                        style={{
                          height: `${bar.v}%`,
                          background: i >= 3 && i <= 4 ? "linear-gradient(to top,#0b2f6f,#00b8b0)" : "rgba(11,47,111,0.25)",
                          animationDelay: `${i * 0.07}s`,
                        }}
                      />
                    </div>
                    <span className="text-[7px] font-medium" style={{ color: muted }}>{bar.day}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function HomePage() {
  const { dict } = await getServerDict();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const d = dict as any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  if (env.isSupabaseConfigured) {
    const { user, profile, organization } = await getCurrentContext();
    if (user) {
      const needsOnboarding =
        !profile?.organization_id || !profile?.onboarding_completed || !organization?.onboarding_completed;
      if (needsOnboarding) redirect("/onboarding");
      redirect("/dashboard");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#fff] dark:bg-[#050c1a]">

      {/* ── STICKY NAV ── */}
      <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-gradient-to-r from-[#0b2f6f] to-[#0d9488] shadow-lg shadow-blue-900/20 dark:border-white/[0.06] dark:bg-[#050c1a]/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="inline-flex items-center rounded-2xl bg-white/95 px-4 py-2 shadow-sm ring-1 ring-white/40 dark:bg-white/95">
            <Image src="/saledock-logo-full.png" alt="SaleDock Cloud POS" width={488} height={178}
              className="h-8 w-auto object-contain sm:h-9" priority />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <LanguageToggle />
            <>
              <Link href="/login"
                className="hidden h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-4 text-xs font-semibold text-white shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-white/20 hover:-translate-y-0.5 sm:flex sm:text-sm">
                {d.nav?.signIn || "Sign in"}
              </Link>
              <Link href="/login?signup=1"
                className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-[#fff] px-4 text-xs font-bold text-[#0b2f6f] shadow-lg shadow-black/10 transition-all duration-200 hover:bg-[#fff]/90 hover:-translate-y-0.5 sm:text-sm dark:bg-cyan-300 dark:text-[#020617] dark:hover:bg-cyan-200">
                {d.nav?.startFree || "Start free"}
              </Link>
            </>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════════════
          HERO — split layout, proper light/dark theming
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden">

        {/* Animated gradient shift — light mode only */}
        <ParallaxLayer
          aria-hidden
          speed={0.05}
          className="pointer-events-none absolute -inset-y-16 inset-x-0 dark:hidden"
        >
          <div
            className="absolute inset-0 animate-gradient-shift opacity-20"
            style={{
              background: "linear-gradient(-45deg,#0b2f6f,#0d9488,#1e40af,#0d9488)",
              backgroundSize: "300% 300%",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 65% 55% at 90% 25%,rgba(0,184,176,0.08) 0%,transparent 55%)," +
                "radial-gradient(ellipse 50% 55% at 5% 75%,rgba(11,47,111,0.05) 0%,transparent 55%)," +
                "linear-gradient(165deg,#f8fafc 0%,#ffffff 50%,#f0f9ff 100%)",
            }}
          />
        </ParallaxLayer>

        {/* Light mode: moving grid layer */}
        <ParallaxLayer aria-hidden speed={0.12} className="pointer-events-none absolute -inset-y-20 inset-x-0 opacity-[0.28] dark:hidden"
          style={{
            backgroundImage:
              "linear-gradient(#e2e8f0 1px,transparent 1px)," +
              "linear-gradient(to right,#e2e8f0 1px,transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Dark mode: deep navy + orbital rings + dot grid */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden dark:block"
          style={{ background: "linear-gradient(135deg,#020817 0%,#050c1a 55%,#061220 100%)" }}
        />
        <ParallaxLayer aria-hidden speed={0.08} className="pointer-events-none absolute -inset-y-24 inset-x-0 hidden overflow-hidden dark:block">
          {[380, 600, 840, 1080].map((size, i) => (
            <div key={size}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[35%] rounded-full animate-glow-pulse"
              style={{
                width: size, height: size,
                border: `1px solid rgba(0,184,176,${0.13 - i * 0.025})`,
                animationDelay: `${i * 1.1}s`,
                animationDuration: `${5 + i * 1.4}s`,
              }}
            />
          ))}
        </ParallaxLayer>
        <ParallaxLayer aria-hidden speed={0.04} className="pointer-events-none absolute -inset-y-16 inset-x-0 hidden dark:block"
          style={{ background: "radial-gradient(ellipse 55% 65% at 78% 50%,rgba(0,184,176,0.07) 0%,transparent 65%)" }}
        />
        <ParallaxLayer aria-hidden speed={0.11} className="pointer-events-none absolute -inset-y-20 inset-x-0 hidden dark:block"
          style={{
            backgroundImage: "radial-gradient(circle,rgba(148,163,184,0.1) 1px,transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Content */}
        <div className="relative mx-auto grid min-h-[90vh] max-w-7xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:py-0">

          {/* ── LEFT: text column ── */}
          <div className="flex flex-col items-start">

            {/* Logo mark in hero — transparent with glow/shimmer */}
            <div className="animate-fade-in-up relative mb-5 inline-flex items-center justify-center" style={{ animationDelay: "0.04s" }}>
              {/* Soft teal/navy glow behind logo */}
              <div aria-hidden className="absolute -inset-6 rounded-full bg-gradient-to-r from-teal-400/20 via-cyan-400/10 to-teal-400/20 blur-3xl dark:from-teal-400/25 dark:via-cyan-400/15 dark:to-teal-400/25" />
              <div aria-hidden className="absolute -inset-3 rounded-2xl bg-gradient-to-r from-[#0b2f6f]/10 via-teal-400/10 to-[#0b2f6f]/10 blur-xl dark:from-[#0b2f6f]/20 dark:via-teal-400/15 dark:to-[#0b2f6f]/20" />
              {/* Animated shimmer sweep */}
              <div aria-hidden className="pointer-events-none absolute inset-0 animate-logo-shimmer rounded-2xl bg-gradient-to-r from-transparent via-white/20 to-transparent dark:via-white/15" />
              {/* Logo image */}
              <Image src="/saledock-logo-full.png" alt="SaleDock Cloud POS" width={488} height={178}
                className="relative z-10 max-w-[280px] w-full h-auto object-contain drop-shadow-[0_0_20px_rgba(20,184,166,0.25)] sm:max-w-[380px] lg:max-w-[520px] xl:max-w-[580px] hero-logo-filter" priority />
            </div>

            {/* Badge */}
            <div className="animate-fade-in-up mb-5 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5"
              style={{
                animationDelay: "0.1s",
                borderColor: "rgba(0,184,176,0.35)",
                background: "rgba(0,184,176,0.07)",
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#00b8b0" }} />
              <span className="font-display text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#00b8b0" }}>
                {d.hero?.badge || "Cloud POS Platform"}
              </span>
            </div>

            {/* H1 */}
            <h1
              className="animate-fade-in-up font-display font-extrabold leading-[1.07] tracking-tight text-slate-950 dark:text-white"
              style={{ animationDelay: "0.16s", fontSize: "clamp(2.4rem,5vw,3.75rem)" }}
            >
              {d.hero?.title || "Run your shop smarter"}
            </h1>

            {/* Subtitle */}
            <p className="animate-fade-in-up mt-5 max-w-lg text-base leading-relaxed text-slate-600 dark:text-slate-400 sm:text-lg"
              style={{ animationDelay: "0.26s" }}>
              {d.hero?.subtitle || "A modern cloud POS platform for shops to manage sales, inventory, repairs, invoices, expenses, and reports — all from one place."}
            </p>

            {/* CTAs */}
            <div className="animate-fade-in-up mt-8 flex flex-wrap gap-3" style={{ animationDelay: "0.36s" }}>
              <Link href="/login?signup=1"
                className="group flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-[#0b2f6f] to-[#0891b2] px-7 text-sm font-bold text-white shadow-lg shadow-blue-900/25 transition-all duration-200 hover:opacity-90 hover:shadow-xl hover:-translate-y-0.5">
                {d.cta?.startFree || "Start free"}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link href="/login"
                className="flex h-12 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-[#fff] px-7 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10">
                {d.cta?.signIn || "Sign in"}
              </Link>
            </div>

            <p className="animate-fade-in-up mt-3 text-xs text-slate-400 dark:text-slate-500" style={{ animationDelay: "0.42s" }}>
              {d.hero?.noCredit || "No credit card required · Free to start"}
            </p>

            {!env.isSupabaseConfigured && (
              <p className="mt-5 max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                Supabase not configured — add credentials to <code className="text-xs">.env.local</code>.
              </p>
            )}

            {/* Trust pills */}
            <div className="animate-fade-in-up mt-8 flex flex-wrap gap-2" style={{ animationDelay: "0.48s" }}>
              {trustPills.map((pill) => (
                <span key={pill.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pill.color }} />
                  {pill.label}
                </span>
              ))}
            </div>
          </div>

          {/* ── RIGHT: 3-D dashboard (desktop) ── */}
          <div className="hidden lg:block">
            <div className="dashboard-3d overflow-hidden rounded-2xl border border-slate-200/80 shadow-[0_32px_80px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:shadow-[0_32px_80px_rgba(0,0,0,0.55),0_0_60px_rgba(0,184,176,0.06)]">
              <div className="dark:hidden">
                <DashboardPreview kpi={kpiData} rows={dashboardRows} bars={salesChartBars} icons={sidebarIcons} dark={false} />
              </div>
              <div className="hidden dark:block">
                <DashboardPreview kpi={kpiData} rows={dashboardRows} bars={salesChartBars} icons={sidebarIcons} dark={true} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard on mobile (below hero text, no tilt) */}
      <section className="block px-4 pb-12 lg:hidden">
        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/60 dark:border-white/[0.07] dark:shadow-black/50">
          <div className="dark:hidden"><DashboardPreview kpi={kpiData} rows={dashboardRows} bars={salesChartBars} icons={sidebarIcons} dark={false} /></div>
          <div className="hidden dark:block"><DashboardPreview kpi={kpiData} rows={dashboardRows} bars={salesChartBars} icons={sidebarIcons} dark={true} /></div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          FEATURES — bento grid (first wide, last full-width)
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="relative border-t border-slate-200/60 bg-slate-50 px-4 py-16 sm:py-24 dark:border-white/[0.05] dark:bg-[#070b16]">
        <ParallaxLayer aria-hidden speed={0.07} className="pointer-events-none absolute -inset-y-8 inset-x-0">
          <div className="absolute left-0 top-8 h-px w-1/3 bg-gradient-to-r from-transparent via-[#00b8b0]/30 to-transparent" />
        </ParallaxLayer>

        <div className="mx-auto max-w-6xl">
          <ScrollReveal>
            <div className="flex flex-col items-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-blue-50 px-3.5 py-1.5 dark:border-blue-800/30 dark:bg-blue-950/30">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-blue-700 dark:text-blue-400">Features</span>
              </div>
              <h2 className="font-display text-center text-2xl font-extrabold text-slate-950 sm:text-3xl dark:text-white">
                Everything your shop needs
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-center text-base leading-relaxed text-slate-500 dark:text-slate-400">
                From ringing up sales to managing repairs and generating reports — SaleDock ships with a complete toolkit for modern retail.
              </p>
            </div>
          </ScrollReveal>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => {
              const Icon = f.icon;
              const isWide = i === 0;
              const isFull = i === 8;
              return (
                <ScrollReveal key={f.title} delay={i * 65}
                  className={[isWide ? "lg:col-span-2" : "", isFull ? "sm:col-span-2 lg:col-span-3" : ""].join(" ")}>
                  <div className="group relative h-full cursor-default rounded-2xl border border-slate-200 bg-[#fff] shadow-sm transition-all duration-300 hover:-translate-y-1 dark:border-slate-700/50 dark:bg-slate-900">
                    {/* Glow */}
                    <div className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      style={{ boxShadow: `0 16px 48px ${f.glow}` }} />
                    {/* Top bar */}
                    <div className="absolute inset-x-0 -top-px h-[3px] rounded-t-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      style={{ background: f.gradient }} />

                    {isWide ? (
                      <div className="relative flex flex-col gap-5 p-7 sm:flex-row sm:items-start sm:gap-7">
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
                          style={{ background: f.gradient }}>
                          <Icon className="h-6 w-6" />
                        </span>
                        <div>
                          <h3 className="font-display text-lg font-extrabold text-slate-950 dark:text-white">{f.title}</h3>
                          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{f.desc}</p>
                          {f.tags && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {f.tags.map((tag) => (
                                <span key={tag}
                                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                  style={{ background: f.glow, color: "#1d4ed8" }}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : isFull ? (
                      <div className="relative flex flex-col gap-5 p-7 sm:flex-row sm:items-center sm:gap-7">
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
                          style={{ background: f.gradient }}>
                          <Icon className="h-6 w-6" />
                        </span>
                        <div>
                          <h3 className="font-display text-lg font-extrabold text-slate-950 dark:text-white">{f.title}</h3>
                          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{f.desc}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="relative p-6">
                        <span className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-md transition-shadow duration-300 group-hover:shadow-lg"
                          style={{ background: f.gradient }}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <h3 className="mt-5 font-display text-base font-bold text-slate-950 dark:text-white">{f.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{f.desc}</p>
                      </div>
                    )}
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECURITY
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="relative border-t border-slate-200/60 bg-[#fff] px-4 py-16 sm:py-24 dark:border-white/[0.05] dark:bg-[#050c1a]">
        <ParallaxLayer aria-hidden speed={0.06} className="pointer-events-none absolute -inset-y-8 inset-x-0">
          <div className="absolute right-0 top-8 h-px w-1/3 bg-gradient-to-l from-transparent via-[#00b8b0]/30 to-transparent" />
        </ParallaxLayer>

        <div className="mx-auto max-w-4xl">
          <ScrollReveal>
            <div className="flex flex-col items-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-200/80 bg-teal-50 px-3.5 py-1.5 dark:border-teal-800/30 dark:bg-teal-950/30">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-teal-700 dark:text-teal-400">Security</span>
              </div>
              <h2 className="font-display text-center text-2xl font-extrabold text-slate-950 sm:text-3xl dark:text-white">
                Built with security first
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-center text-base leading-relaxed text-slate-500 dark:text-slate-400">
                Your data stays yours. SaleDock is designed with tenant isolation, role-based access, and defensive coding from day one.
              </p>
            </div>
          </ScrollReveal>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {securityItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <ScrollReveal key={item.title} delay={i * 100}>
                  <div className="group relative cursor-default rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-slate-700/50 dark:bg-slate-900">
                    <div className="absolute inset-x-0 -top-px h-[3px] rounded-t-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      style={{ background: item.gradient }} />
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-md"
                      style={{ background: item.gradient }}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-5 font-display text-base font-bold text-slate-950 dark:text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.desc}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SHOP DAY WORKFLOW
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="relative border-t border-slate-200/60 bg-slate-50 px-4 py-16 sm:py-24 dark:border-white/[0.05] dark:bg-[#070b16]">
        <ParallaxLayer aria-hidden speed={0.08} className="pointer-events-none absolute -inset-y-8 inset-x-0">
          <div className="absolute left-1/4 right-1/4 top-8 h-px bg-gradient-to-r from-transparent via-[#00b8b0]/25 to-transparent" />
        </ParallaxLayer>

        <div className="mx-auto max-w-5xl">
          <ScrollReveal>
            <div className="flex flex-col items-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50 px-3.5 py-1.5 dark:border-cyan-800/30 dark:bg-cyan-950/30">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-cyan-700 dark:text-cyan-400">Daily workflow</span>
              </div>
              <h2 className="font-display text-center text-2xl font-extrabold text-slate-950 sm:text-3xl dark:text-white">
                Built for the full shop day
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-center text-base leading-relaxed text-slate-500 dark:text-slate-400">
                From opening the register to reviewing tonight&apos;s analytics — SaleDock covers every moment.
              </p>
            </div>
          </ScrollReveal>

          <div className="relative mt-14">
            <div aria-hidden className="pointer-events-none absolute left-[10%] right-[10%] top-[22px] hidden border-t-2 border-dashed border-slate-200 dark:border-slate-700 sm:block" />
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-5">
              {shopDaySteps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <ScrollReveal key={step.title} delay={i * 100}>
                    <div className="group flex flex-col items-center text-center">
                      <div className="mb-3 inline-flex items-center rounded-full border border-slate-200 bg-[#fff] px-2.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                        {step.time}
                      </div>
                      <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-md transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-blue-900/25"
                        style={{ background: "linear-gradient(135deg,#0b2f6f,#00b8b0)" }}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="mt-4 font-display text-sm font-bold text-slate-950 dark:text-white">{step.title}</h3>
                      <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{step.desc}</p>
                    </div>
                  </ScrollReveal>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          HOW IT WORKS
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="relative border-t border-slate-200/60 bg-[#fff] px-4 py-16 sm:py-24 dark:border-white/[0.05] dark:bg-[#050c1a]">
        <ParallaxLayer aria-hidden speed={0.07} className="pointer-events-none absolute -inset-y-8 inset-x-0">
          <div className="absolute left-1/3 right-1/3 top-8 h-px bg-gradient-to-r from-transparent via-violet-400/25 to-transparent" />
        </ParallaxLayer>

        <div className="mx-auto max-w-4xl">
          <ScrollReveal>
            <div className="flex flex-col items-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-200/80 bg-violet-50 px-3.5 py-1.5 dark:border-violet-800/30 dark:bg-violet-950/30">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-violet-700 dark:text-violet-400">Getting started</span>
              </div>
              <h2 className="font-display text-center text-2xl font-extrabold text-slate-950 sm:text-3xl dark:text-white">
                Get started in minutes
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-center text-base leading-relaxed text-slate-500 dark:text-slate-400">
                No credit card required. No complicated setup. Just three simple steps.
              </p>
            </div>
          </ScrollReveal>

          <div className="relative mt-12 grid grid-cols-1 gap-10 sm:grid-cols-3">
            <div aria-hidden className="pointer-events-none absolute left-[calc(100%/6)] right-[calc(100%/6)] top-7 hidden border-t-2 border-dashed border-slate-200 dark:border-slate-700 sm:block" />
            {howItWorks.map((item, i) => (
              <ScrollReveal key={item.step} delay={i * 120}>
                <div className="group text-center">
                  <span className="relative z-10 mx-auto flex h-14 w-14 items-center justify-center rounded-2xl font-display text-xl font-black text-white shadow-lg transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-xl group-hover:shadow-blue-900/25"
                    style={{ background: "linear-gradient(135deg,#0b2f6f,#0891b2)" }}>
                    {item.step}
                  </span>
                  <h3 className="mt-6 font-display text-base font-bold text-slate-950 dark:text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          FINAL CTA — always dark navy
      ═══════════════════════════════════════════════════════════════════════ */}
      <ScrollReveal delay={100}>
        <section className="relative overflow-hidden border-t border-slate-200/60 px-4 py-16 text-center sm:py-24 dark:border-white/[0.05]">
          <div aria-hidden className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(135deg,#020817 0%,#0a1e40 45%,#071e35 100%)" }}
          />
          <ParallaxLayer aria-hidden speed={0.09} className="pointer-events-none absolute -inset-y-16 inset-x-0 opacity-[0.055]"
            style={{
              backgroundImage: "radial-gradient(circle,#94a3b8 1px,transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          <ParallaxLayer aria-hidden speed={0.04} className="pointer-events-none absolute -inset-y-12 inset-x-0"
            style={{ background: "radial-gradient(ellipse 65% 55% at 50% 100%,rgba(0,184,176,0.14) 0%,transparent 65%)" }}
          />

          <div className="relative mx-auto max-w-2xl">
            <ScrollReveal delay={150}>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] text-[#00b8b0] shadow-lg backdrop-blur-sm">
                <CheckCircle className="h-8 w-8" />
              </div>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <h2 className="font-display text-2xl font-extrabold text-white sm:text-3xl">
                Launch your shop on SaleDock Cloud POS
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-base leading-relaxed text-slate-400">
                Join shops that trust SaleDock for their daily operations. Free to start, no commitment.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link href="/login?signup=1"
                  className="group inline-flex h-12 w-full max-w-xs cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0b2f6f] to-[#00b8b0] px-8 text-sm font-bold text-white shadow-lg transition-all duration-200 hover:opacity-90 hover:shadow-xl hover:-translate-y-0.5 sm:w-auto">
                  {d.cta?.createAccount || "Create your account"}
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
                <Link href="/login"
                  className="inline-flex h-12 w-full max-w-xs cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/[0.06] px-8 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:bg-white/15 hover:-translate-y-0.5 sm:w-auto">
                  {d.cta?.signIn || "Sign in"}
                </Link>
              </div>
              <p className="mt-4 text-xs text-slate-600">{d.cta?.noCredit || "No credit card required · Free to start"}</p>
            </ScrollReveal>
          </div>
        </section>
      </ScrollReveal>

      {/* ── FAQ ── */}
      <FaqSection />

      {/* ── FOOTER ── */}
      <footer className="border-t border-slate-200 bg-slate-50 px-4 py-12 dark:border-white/[0.05] dark:bg-[#070b16]">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center">
            <Image src="/saledock-logo-full.png" alt="SaleDock Cloud POS" width={488} height={178}
              className="h-7 w-auto object-contain dark:brightness-0 dark:invert" />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400 dark:text-slate-500">
            <Link href="/about"         className="transition-colors duration-200 hover:text-slate-700 dark:hover:text-slate-300">About Us</Link>
            <Link href="/contact"       className="transition-colors duration-200 hover:text-slate-700 dark:hover:text-slate-300">Contact Us</Link>
            <Link href="/privacy"       className="transition-colors duration-200 hover:text-slate-700 dark:hover:text-slate-300">Privacy Policy</Link>
            <Link href="/terms"         className="transition-colors duration-200 hover:text-slate-700 dark:hover:text-slate-300">Terms of Service</Link>
            <Link href="/data-deletion" className="transition-colors duration-200 hover:text-slate-700 dark:hover:text-slate-300">Data Deletion</Link>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <a href="mailto:fardan.aatir@outlook.com" className="transition-colors duration-200 hover:text-slate-700 dark:hover:text-slate-300">fardan.aatir@outlook.com</a>
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            &copy; {new Date().getFullYear()} SaleDock Cloud POS
          </p>
        </div>
      </footer>
    </div>
  );
}
