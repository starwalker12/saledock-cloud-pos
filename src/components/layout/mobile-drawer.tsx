"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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

type UserInfo = {
  name: string;
  email: string;
  role: string | null;
  profilePictureUrl: string | null;
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

export function MobileDrawer({ items, user }: { items: NavItem[]; user: UserInfo | null }) {
  const { open, openDrawer, closeDrawer } = useDrawer();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab");
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

  const displayName = user?.name || user?.email || "User";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      {/* Hamburger button — rendered inside the topbar on mobile */}
      <button
        type="button"
        onClick={openDrawer}
        className="flex size-11 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
        aria-label="Open navigation menu"
      >
        <Menu className="size-6" />
      </button>

      {/* Drawer Overlay always rendered for transitions */}
      <div
        className={`fixed inset-0 z-50 lg:hidden transition-all duration-300 ease-in-out ${
          open ? "visible pointer-events-auto" : "invisible pointer-events-none"
        }`}
      >
        {/* Backdrop overlay */}
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
            open ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeDrawer}
          aria-hidden="true"
        />

        {/* Slide-out Panel */}
        <div
          ref={drawerRef}
          className={`absolute left-0 top-0 flex h-full w-[85vw] max-w-[360px] flex-col bg-[#fff] shadow-xl dark:bg-slate-900 transform transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          {/* User Header */}
          <div className="relative flex h-24 shrink-0 items-center gap-3 border-b border-slate-200 bg-slate-50/50 px-4 dark:border-slate-800 dark:bg-slate-950/20">
            <div className="flex items-center gap-3 pr-10 min-w-0">
              {user?.profilePictureUrl ? (
                <span className="size-11 shrink-0 overflow-hidden rounded-full border border-slate-200 dark:border-slate-700">
                  <span
                    className="block size-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${user.profilePictureUrl})` }}
                  />
                </span>
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-teal-500 text-sm font-bold text-white shadow-sm">
                  {initials}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-slate-950 dark:text-slate-50 leading-tight">
                  {displayName}
                </p>
                <p className="truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 uppercase tracking-wider">
                  {user?.role || "Store Associate"}
                </p>
              </div>
            </div>

            {/* Close button positioned at top right */}
            <button
              type="button"
              onClick={closeDrawer}
              className="absolute right-2 top-6 flex size-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Close navigation menu"
            >
              <X className="size-6" />
            </button>
          </div>

          {/* Scrollable navigation area */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3 overscroll-contain space-y-4">
            <nav className="space-y-1">
              {items.filter(item => item.href !== "/settings").map((item) => {
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
                        : "text-slate-600 hover:bg-blue-50/50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    }`}
                  >
                    {Icon && <Icon className="size-5 shrink-0" />}
                    <span>{t(item.label, item.label)}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Separator / Settings Header */}
            <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
              <p className="px-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Settings
              </p>
              <nav className="mt-2 space-y-1">
                {/* Main settings link */}
                {(() => {
                  const settingsItem = items.find(item => item.href === "/settings");
                  if (!settingsItem) return null;
                  const Icon = iconMap[settingsItem.icon];
                  const active = pathname === "/settings" && !currentTab;
                  return (
                    <Link
                      key={settingsItem.href}
                      href={settingsItem.href}
                      onClick={closeDrawer}
                      className={`flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-semibold transition cursor-pointer select-none ${
                        active
                          ? "bg-[#0b2f6f]/10 text-[#0b2f6f] ring-1 ring-[#0b2f6f]/10 dark:bg-teal-500/10 dark:text-teal-200 dark:ring-teal-400/10"
                          : "text-slate-600 hover:bg-blue-50/50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                      }`}
                    >
                      {Icon && <Icon className="size-5 shrink-0" />}
                      <span>{t(settingsItem.label, settingsItem.label)}</span>
                    </Link>
                  );
                })()}

                {/* Settings subitems */}
                {settingsSubItems.map((s) => {
                  const active = pathname === "/settings" && currentTab === s.href.split("=")[1];
                  return (
                    <Link
                      key={s.href}
                      href={s.href}
                      onClick={closeDrawer}
                      className={`flex min-h-[48px] items-center gap-3 rounded-xl pl-9 pr-4 py-3 text-sm font-semibold transition cursor-pointer select-none ${
                        active
                          ? "bg-[#0b2f6f]/5 text-[#0b2f6f] dark:bg-teal-500/5 dark:text-teal-200"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                      }`}
                    >
                      <s.icon className="size-4 shrink-0 text-slate-450" />
                      <span>{s.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Theme Toggle section */}
            <div className="border-t border-slate-200 pt-3 dark:border-slate-800 pb-6">
              <p className="mb-2 px-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Theme
              </p>
              <div className="px-4">
                <ThemeToggle showLabelOnMobile={true} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
