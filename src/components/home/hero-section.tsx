import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { env } from "@/lib/env";
import { DashboardPreview } from "./dashboard-preview";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function HeroSection({
  d,
  trustPills,
  kpiData,
  dashboardRows,
  salesChartBars,
  sidebarIcons,
}: any) {
  return (
    <>
      <section className="relative overflow-hidden">
        {/* Animated gradient shift — light mode only */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-gradient-shift opacity-20 dark:hidden"
          style={{
            background: "linear-gradient(-45deg,#0b2f6f,#0d9488,#1e40af,#0d9488)",
            backgroundSize: "300% 300%",
          }}
        />

        {/* Light mode: gradient mesh + grid */}
        <div aria-hidden className="pointer-events-none absolute inset-0 dark:hidden"
          style={{
            background:
              "radial-gradient(ellipse 65% 55% at 90% 25%,rgba(0,184,176,0.08) 0%,transparent 55%)," +
              "radial-gradient(ellipse 50% 55% at 5% 75%,rgba(11,47,111,0.05) 0%,transparent 55%)," +
              "linear-gradient(165deg,#f8fafc 0%,#ffffff 50%,#f0f9ff 100%)",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.28] dark:hidden"
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
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden overflow-hidden dark:block">
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
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden dark:block"
          style={{ background: "radial-gradient(ellipse 55% 65% at 78% 50%,rgba(0,184,176,0.07) 0%,transparent 65%)" }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden dark:block"
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
                {d?.hero?.badge || "Cloud POS Platform"}
              </span>
            </div>

            {/* H1 */}
            <h1
              className="animate-fade-in-up font-display font-extrabold leading-[1.07] tracking-tight text-slate-950 dark:text-white"
              style={{ animationDelay: "0.16s", fontSize: "clamp(2.4rem,5vw,3.75rem)" }}
            >
              {d?.hero?.title || "Run your shop smarter"}
            </h1>

            {/* Subtitle */}
            <p className="animate-fade-in-up mt-5 max-w-lg text-base leading-relaxed text-slate-600 dark:text-slate-400 sm:text-lg"
              style={{ animationDelay: "0.26s" }}>
              {d?.hero?.subtitle || "A modern cloud POS platform for shops to manage sales, inventory, repairs, invoices, expenses, and reports — all from one place."}
            </p>

            {/* CTAs */}
            <div className="animate-fade-in-up mt-8 flex flex-wrap gap-3" style={{ animationDelay: "0.36s" }}>
              <Link href="/login?signup=1"
                className="group flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-[#0b2f6f] to-[#0891b2] px-7 text-sm font-bold text-white shadow-lg shadow-blue-900/25 transition-all duration-200 hover:opacity-90 hover:shadow-xl hover:-translate-y-0.5">
                {d?.cta?.startFree || "Start free"}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link href="/login"
                className="flex h-12 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-7 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10">
                {d?.cta?.signIn || "Sign in"}
              </Link>
            </div>

            <p className="animate-fade-in-up mt-3 text-xs text-slate-400 dark:text-slate-500" style={{ animationDelay: "0.42s" }}>
              {d?.hero?.noCredit || "No credit card required · Free to start"}
            </p>

            {!env.isSupabaseConfigured && (
              <p className="mt-5 max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                Supabase not configured — add credentials to <code className="text-xs">.env.local</code>.
              </p>
            )}

            {/* Trust pills */}
            <div className="animate-fade-in-up mt-8 flex flex-wrap gap-2" style={{ animationDelay: "0.48s" }}>
              {trustPills.map((pill: any) => (
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
    </>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
