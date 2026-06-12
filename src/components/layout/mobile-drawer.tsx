"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu, X, LayoutDashboard, ShoppingCart, Boxes, Users, ReceiptText,
  RotateCcw, Wrench, Wallet, Banknote, BarChart3,
  Truck, ScrollText, UserCog, Settings, MonitorCog, PackageCheck, ListChecks,
  UserCircle, Shield, ShieldCheck,
} from "lucide-react";
import type { ComponentType } from "react";
import { useDrawer } from "@/components/layout/drawer-context";
import { useLanguage } from "@/lib/i18n/language-provider";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  pos: ShoppingCart,
  products: Boxes,
  customers: Users,
  invoices: ReceiptText,
  returns: RotateCcw,
  repairs: Wrench,
  expenses: Wallet,
  dailyClosing: Banknote,
  reports: BarChart3,
  purchases: Truck,
  dues: ListChecks,
  replenishment: PackageCheck,
  auditLog: ScrollText,
  users: UserCog,
  settings: Settings,
  platform: MonitorCog,
};

const settingsSubItems = [
  { href: "/settings?tab=accounts", label: "Connected Accounts", icon: UserCircle },
  { href: "/settings?tab=privacy", label: "Privacy Center", icon: Shield },
  { href: "/settings?tab=security", label: "Security", icon: ShieldCheck },
];

export function MobileDrawer({ items }: { items: NavItem[] }) {
  const { open, openDrawer, closeDrawer } = useDrawer();
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);
  const { dict } = useLanguage();
  const sidebarDict = dict.sidebar as Record<string, string> | undefined;

  const t = (key: string, fallback: string) => sidebarDict?.[key] || fallback;

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, closeDrawer]);

  useEffect(() => {
    closeDrawer();
  }, [pathname, closeDrawer]);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/settings") return pathname === "/settings" || pathname.startsWith("/settings");
    if (href === "/pos") return pathname === "/pos" || pathname.startsWith("/pos/");
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <>
      {/* Hamburger button — rendered inside the topbar on mobile */}
      <button
        type="button"
        onClick={openDrawer}
        className="flex size-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
        aria-label="Open navigation menu"
      >
        <Menu className="size-5" />
      </button>

      {/* Drawer Overlay always rendered for transitions */}
      <div
        className={`fixed inset-0 z-50 lg:hidden transition-all duration-300 ease-in-out ${
          open ? "visible pointer-events-auto" : "invisible pointer-events-none"
        }`}
      >
        {/* Backdrop overlay */}
        <div
          className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
            open ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeDrawer}
          aria-hidden="true"
        />

        {/* Slide-out Panel */}
        <div
          ref={drawerRef}
          className={`absolute left-0 top-0 flex h-full w-[85vw] max-w-[360px] flex-col bg-white shadow-xl dark:bg-slate-950 transform transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          {/* Header */}
          <div className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
            <span className="text-lg font-black text-slate-950 dark:text-slate-50">Menu</span>
            <button
              type="button"
              onClick={closeDrawer}
              className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Close navigation menu"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3 overscroll-contain">
            {items.map((item) => {
              const Icon = iconMap[item.icon];
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeDrawer}
                  className={`flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-semibold transition cursor-pointer select-none ${
                    active
                      ? "bg-[#0b2f6f]/10 text-[#0b2f6f] ring-1 ring-[#0b2f6f]/10 dark:bg-teal-500/10 dark:text-teal-200 dark:ring-teal-400/10"
                      : "text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  }`}
                >
                  {Icon && <Icon className="size-5 shrink-0" />}
                  <span>{t(item.label, item.label)}</span>
                </Link>
              );
            })}
          </nav>

          {/* Theme Toggle section */}
          <div className="shrink-0 border-t border-slate-200 p-3 dark:border-slate-800">
            <p className="mb-2 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Theme
            </p>
            <div className="px-4 pb-1">
              <ThemeToggle showLabelOnMobile={true} />
            </div>
          </div>

          {/* Settings Section */}
          <div className="shrink-0 border-t border-slate-200 p-3 dark:border-slate-800 pb-[calc(12px+env(safe-area-inset-bottom))]">
            <p className="mb-1.5 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Settings
            </p>
            <div className="space-y-1">
              {settingsSubItems.map((s) => {
                const active = pathname.startsWith("/settings");
                return (
                  <Link
                    key={s.href}
                    href={s.href}
                    onClick={closeDrawer}
                    className={`flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition cursor-pointer select-none ${
                      active
                        ? "bg-[#0b2f6f]/10 text-[#0b2f6f] dark:bg-teal-500/10 dark:text-teal-200"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    }`}
                  >
                    <s.icon className="size-5 shrink-0" />
                    <span>{s.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
