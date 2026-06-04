import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getCurrentContext } from "@/lib/auth/session";
import { getServerDict } from "@/lib/i18n/server";
import { FaqSection } from "@/components/faq-section";
import { TopNav } from "@/components/home/top-nav";
import { HeroSection } from "@/components/home/hero-section";
import { FeaturesSection } from "@/components/home/features-section";
import { SecuritySection } from "@/components/home/security-section";
import { DayInLifeSection } from "@/components/home/day-in-life-section";
import { HowItWorksSection } from "@/components/home/how-it-works-section";
import { CtaSection } from "@/components/home/cta-section";
import { FooterSection } from "@/components/home/footer-section";
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
    <div className="flex min-h-screen flex-col bg-white dark:bg-[#050c1a]">
      <TopNav d={d} />
      <HeroSection
        d={d}
        trustPills={trustPills}
        kpiData={kpiData}
        dashboardRows={dashboardRows}
        salesChartBars={salesChartBars}
        sidebarIcons={sidebarIcons}
      />
      <FeaturesSection features={features} />
      <SecuritySection securityItems={securityItems} />
      <DayInLifeSection shopDaySteps={shopDaySteps} />
      <HowItWorksSection howItWorks={howItWorks} />
      <CtaSection d={d} />
      <FaqSection />
      <FooterSection />
    </div>
  );
}
