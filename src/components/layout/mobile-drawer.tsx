"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Menu, X, LayoutDashboard, ShoppingCart, Boxes, Users, ReceiptText,
  RotateCcw, Wrench, Wallet, Banknote, BarChart3,
  Truck, ScrollText, UserCog, Settings, MonitorCog, PackageCheck, ListChecks,
  UserCircle, Shield, ShieldCheck, ArrowUp, ArrowDown, Check,
} from "lucide-react";
import type { ComponentType } from "react";
import { useDrawer } from "@/components/layout/drawer-context";
import { useLanguage } from "@/lib/i18n/language-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { saveSidebarPreferences } from "@/lib/use-ui-preferences";

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

type CustomSidebarPreferences = {
  mobileTabs?: string[];
  [key: string]: unknown;
};

export function MobileDrawer({ items, user }: { items: NavItem[]; user: UserInfo | null }) {
  const { open, openDrawer, closeDrawer } = useDrawer();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab");
  const drawerRef = useRef<HTMLDivElement>(null);
  const { dict } = useLanguage();
  const sidebarDict = dict.sidebar as Record<string, string> | undefined;

  const t = (key: string, fallback: string) => sidebarDict?.[key] || fallback;

  const [showCustomize, setShowCustomize] = useState(false);
  const [tempTabs, setTempTabs] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<CustomSidebarPreferences | null>(null);

  useEffect(() => {
    const loadPrefs = () => {
      if (typeof window === "undefined") return;
      const raw = localStorage.getItem("saledock-sidebar-preferences-v1");
      if (raw) {
        try {
          setPrefs(JSON.parse(raw));
        } catch {
          setPrefs({});
        }
      } else {
        setPrefs({});
      }
    };
    loadPrefs();
    window.addEventListener("storage", loadPrefs);
    window.addEventListener("saledock-sidebar-preferences-changed", loadPrefs);
    return () => {
      window.removeEventListener("storage", loadPrefs);
      window.removeEventListener("saledock-sidebar-preferences-changed", loadPrefs);
    };
  }, []);

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

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setShowCustomize(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

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
        className={`fixed inset-0 z-[110] h-dvh min-h-dvh lg:hidden transition-all duration-300 ease-in-out motion-reduce:transition-none ${
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
          className={`absolute inset-0 flex h-dvh min-h-dvh w-full flex-col bg-[#fff] shadow-xl md:inset-y-0 md:left-0 md:right-auto md:w-[85vw] md:max-w-[360px] dark:bg-slate-900 transform transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          {showCustomize ? (
            <div className="flex h-full w-full flex-col bg-[#fff] dark:bg-slate-900">
              {/* Header */}
              <div className="relative flex min-h-24 shrink-0 items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 pt-[env(safe-area-inset-top)] dark:border-slate-800 dark:bg-slate-950">
                <div className="min-w-0 flex-1 pr-10">
                  <p className="text-sm font-black text-slate-950 dark:text-slate-50 leading-tight">
                    Customize Bottom Tabs
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 uppercase tracking-wider">
                    Select 4 to 6 tabs & order them
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomize(false)}
                  className="absolute right-2 top-6 flex size-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
                  aria-label="Back to menu"
                >
                  <X className="size-6" />
                </button>
              </div>

              {/* Content */}
              <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-6">
                {/* Selection pool */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Available Pages
                    </span>
                    <span className={`text-xs font-bold ${tempTabs.length >= 4 && tempTabs.length <= 6 ? "text-slate-500" : "text-red-500"}`}>
                      {tempTabs.length} / 6 selected
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {items.filter(item => item.href !== "/settings" && item.href !== "/platform").map((item) => {
                      const Icon = iconMap[item.icon];
                      const isSelected = tempTabs.includes(item.href);
                      return (
                        <button
                          key={item.href}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              if (tempTabs.length > 4) {
                                setTempTabs(tempTabs.filter(x => x !== item.href));
                              }
                            } else {
                              if (tempTabs.length < 6) {
                                setTempTabs([...tempTabs, item.href]);
                              }
                            }
                          }}
                          disabled={(isSelected && tempTabs.length <= 4) || (!isSelected && tempTabs.length >= 6)}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-left transition select-none cursor-pointer ${
                            isSelected
                              ? "border-emerald-250 bg-emerald-50/30 text-emerald-800 dark:border-emerald-850 dark:bg-emerald-950/20 dark:text-emerald-300"
                              : "border-slate-200 bg-slate-50/50 text-slate-650 hover:bg-slate-50 dark:border-slate-800/80 dark:bg-slate-900/30 dark:text-slate-350 dark:hover:bg-slate-900/50 disabled:opacity-50"
                          }`}
                        >
                          <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                            isSelected
                              ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                              : "bg-slate-500/10 text-slate-500 dark:bg-slate-500/20 dark:text-slate-400"
                          }`}>
                            {Icon && <Icon className="size-4.5" />}
                          </span>
                          <span className="flex-1 text-sm font-bold truncate">
                            {t(item.label, item.label)}
                          </span>
                          {isSelected && (
                            <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-[#fff] dark:bg-emerald-600">
                              <Check className="size-3 stroke-[3]" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Ordering list */}
                {tempTabs.length > 0 && (
                  <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                      Tab Order (Left to Right)
                    </span>
                    <div className="space-y-2">
                      {tempTabs.map((href, index) => {
                        const matchedItem = items.find(x => x.href === href);
                        if (!matchedItem) return null;
                        const Icon = iconMap[matchedItem.icon];
                        return (
                          <div
                            key={href}
                            className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-[#fff] dark:border-slate-800 dark:bg-slate-900"
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                              {Icon && <Icon className="size-4.5" />}
                            </span>
                            <span className="flex-1 text-sm font-bold truncate">
                              {t(matchedItem.label, matchedItem.label)}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => {
                                  const next = [...tempTabs];
                                  const temp = next[index - 1];
                                  next[index - 1] = next[index];
                                  next[index] = temp;
                                  setTempTabs(next);
                                }}
                                className="flex size-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800 cursor-pointer"
                                title="Move up"
                              >
                                <ArrowUp className="size-4 text-slate-550" />
                              </button>
                              <button
                                type="button"
                                disabled={index === tempTabs.length - 1}
                                onClick={() => {
                                  const next = [...tempTabs];
                                  const temp = next[index + 1];
                                  next[index + 1] = next[index];
                                  next[index] = temp;
                                  setTempTabs(next);
                                }}
                                className="flex size-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800 cursor-pointer"
                                title="Move down"
                              >
                                <ArrowDown className="size-4 text-slate-550" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons footer */}
              <div className="border-t border-slate-200 p-4 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 flex flex-col gap-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTempTabs(["/dashboard", "/pos", "/invoices", "/daily-closing", "/products"]);
                    }}
                    className="flex-1 h-11 rounded-lg border border-slate-200 hover:bg-slate-100 font-bold text-slate-700 dark:border-slate-700 dark:text-slate-350 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="size-4" />
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextPrefs = {
                        ...prefs,
                        mobileTabs: tempTabs,
                        updatedAt: new Date().toISOString(),
                      };
                      localStorage.setItem("saledock-sidebar-preferences-v1", JSON.stringify(nextPrefs));
                      window.dispatchEvent(new Event("saledock-sidebar-preferences-changed"));
                      saveSidebarPreferences(nextPrefs);
                      setShowCustomize(false);
                    }}
                    className="flex-[2] h-11 rounded-lg bg-blue-700 text-[#fff] hover:bg-blue-800 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check className="size-4" />
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* User Header */}
              <div className="relative flex min-h-24 shrink-0 items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 pt-[env(safe-area-inset-top)] dark:border-slate-800 dark:bg-slate-950">
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
              <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-[calc(6rem+env(safe-area-inset-bottom))] overscroll-contain space-y-4">
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

                {/* Custom Tabs section */}
                <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                  <p className="mb-2 px-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    Navigation
                  </p>
                  <div className="px-4">
                    <button
                      type="button"
                      onClick={() => {
                        const currentTabs = prefs?.mobileTabs || ["/dashboard", "/pos", "/invoices", "/daily-closing", "/products"];
                        setTempTabs(currentTabs);
                        setShowCustomize(true);
                      }}
                      className="flex w-full min-h-[44px] items-center gap-3 rounded-xl border border-slate-200 bg-[#fff] dark:border-slate-800 dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer select-none"
                    >
                      <Settings className="size-4.5 text-slate-550" />
                      <span>Customize bottom tabs</span>
                    </button>
                  </div>
                </div>

                {/* Theme Toggle section */}
                <div className="border-t border-slate-200 pt-3 dark:border-slate-800 pb-6">
                  <p className="mb-2 px-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    Theme
                  </p>
                  <div className="px-4">
                    <ThemeToggle showLabelOnMobile={true} align="up" />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
