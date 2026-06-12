"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ShoppingCart, ReceiptText, Banknote } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-provider";

export function MobileTabBar() {
  const pathname = usePathname();
  const { dict } = useLanguage();
  const sidebarDict = dict.sidebar as Record<string, string> | undefined;

  const t = (key: string, fallback: string) => sidebarDict?.[key] || fallback;

  const tabs = [
    { href: "/dashboard", labelKey: "dashboard", fallback: "Dashboard", icon: LayoutDashboard },
    { href: "/pos", labelKey: "pos", fallback: "POS", icon: ShoppingCart },
    { href: "/invoices", labelKey: "invoices", fallback: "Invoices", icon: ReceiptText },
    { href: "/daily-closing", labelKey: "dailyClosing", fallback: "Cash Drawer", icon: Banknote },
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:hidden">
      <div className="flex h-16 items-center justify-around px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center flex-1 py-1 text-center transition cursor-pointer select-none ${
                active
                  ? "text-[#0b2f6f] dark:text-teal-400"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="size-5 shrink-0" />
              <span className="mt-1 text-[10px] font-bold truncate max-w-full">
                {t(tab.labelKey, tab.fallback)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
